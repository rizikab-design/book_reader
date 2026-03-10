const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const helmet = require('helmet');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;
if (PORT < 1 || PORT > 65535) {
  console.error('Invalid PORT value');
  process.exit(1);
}

// Directories — use DATA_DIR env (set by Electron for packaged app) or __dirname
const DATA_ROOT = process.env.DATA_DIR || __dirname;
const BOOKS_DIR = path.join(DATA_ROOT, 'books');
const COVERS_DIR = path.join(DATA_ROOT, 'covers');
const DB_PATH = path.join(DATA_ROOT, 'library.db');

// Ensure directories exist
fs.mkdirSync(BOOKS_DIR, { recursive: true });
fs.mkdirSync(COVERS_DIR, { recursive: true });

// --- SQLite database ---
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    originalName TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'Unknown',
    coverFile TEXT,
    format TEXT NOT NULL DEFAULT 'epub',
    addedAt TEXT NOT NULL,
    fileSize INTEGER NOT NULL DEFAULT 0
  )
`);

// Migrate existing library.json if present and DB is empty
const JSON_DB_FILE = path.join(DATA_ROOT, 'library.json');
if (fs.existsSync(JSON_DB_FILE) && db.prepare('SELECT COUNT(*) AS cnt FROM books').get().cnt === 0) {
  try {
    const legacy = JSON.parse(fs.readFileSync(JSON_DB_FILE, 'utf-8'));
    const insert = db.prepare(
      'INSERT OR IGNORE INTO books (id, filename, originalName, title, author, coverFile, format, addedAt, fileSize) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const migrate = db.transaction((books) => {
      for (const b of books) {
        insert.run(b.id, b.filename, b.originalName, b.title, b.author || 'Unknown', b.coverFile || null, b.format || 'epub', b.addedAt || new Date().toISOString(), b.fileSize || 0);
      }
    });
    migrate(legacy);
    console.log(`Migrated ${legacy.length} books from library.json to SQLite`);
  } catch (e) {
    console.warn('Failed to migrate library.json:', e.message);
  }
}

// Database helpers
const stmtAll = db.prepare('SELECT * FROM books ORDER BY addedAt DESC');
const stmtGetById = db.prepare('SELECT * FROM books WHERE id = ?');
const stmtInsert = db.prepare(
  'INSERT INTO books (id, filename, originalName, title, author, coverFile, format, addedAt, fileSize) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const stmtDelete = db.prepare('DELETE FROM books WHERE id = ?');

// Middleware — restrict CORS to localhost origins
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server) or localhost
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json());
app.use('/books', express.static(BOOKS_DIR, { dotfiles: 'deny' }));
app.use('/covers', express.static(COVERS_DIR, { dotfiles: 'deny' }));

// File upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BOOKS_DIR),
  filename: (req, file, cb) => {
    // Sanitize filename
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${crypto.randomUUID()}-${safe}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.epub' || ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only .epub and .pdf files are supported'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// --- Routes ---

// List all books
app.get('/api/books', (req, res) => {
  res.json(stmtAll.all());
});

// Upload a book
app.post('/api/books', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const bookPath = req.file.path;
    const bookFilename = req.file.filename;
    const originalName = req.file.originalname;

    const ext = path.extname(originalName).toLowerCase();
    const format = ext === '.pdf' ? 'pdf' : 'epub';

    // Extract metadata and cover
    let metadata;
    try {
      metadata = format === 'pdf'
        ? await extractPdfMetadata(bookPath, bookFilename)
        : await extractEpubMetadata(bookPath, bookFilename);
    } catch (err) {
      // Metadata extraction failed — clean up orphaned file
      try { fs.unlinkSync(bookPath); } catch (e) { console.warn('Failed to clean up orphaned book file:', e); }
      return res.status(500).json({ error: 'Failed to process book file' });
    }

    const book = {
      id: crypto.randomUUID(),
      filename: bookFilename,
      originalName,
      title: metadata.title || originalName.replace(/\.(epub|pdf)$/i, ''),
      author: metadata.author || 'Unknown',
      coverFile: metadata.coverFile || null,
      format,
      addedAt: new Date().toISOString(),
      fileSize: req.file.size,
    };

    stmtInsert.run(book.id, book.filename, book.originalName, book.title, book.author, book.coverFile, book.format, book.addedAt, book.fileSize);

    res.json(book);
  } catch (err) {
    console.error('Upload error:', err);
    // Clean up uploaded file on failure
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { console.warn('Failed to clean up temp upload file:', e); }
    }
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Delete a book
app.delete('/api/books/:id', (req, res) => {
  if (!req.params.id || !/^(\d+|[0-9a-f-]{36})$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid book ID' });
  }

  try {
    const book = stmtGetById.get(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    // Validate book file path stays within BOOKS_DIR
    const bookPath = path.resolve(BOOKS_DIR, book.filename);
    if (!bookPath.startsWith(BOOKS_DIR + path.sep)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Delete book file
    try { if (fs.existsSync(bookPath)) fs.unlinkSync(bookPath); } catch (e) {
      console.warn('Failed to delete book file:', e.message);
    }

    // Validate and delete cover file
    if (book.coverFile) {
      const coverPath = path.resolve(COVERS_DIR, book.coverFile);
      if (coverPath.startsWith(COVERS_DIR + path.sep)) {
        try { if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath); } catch (e) {
          console.warn('Failed to delete cover file:', e.message);
        }
      }
    }

    stmtDelete.run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

// --- ePub metadata extraction (improved XML parsing) ---

function getTagContent(xml, tagName) {
  // Handles namespaced tags like dc:title and self-closing tags
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function getAttributeValue(tag, attrName) {
  const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const match = tag.match(regex);
  return match ? match[1] : '';
}

function findAllTags(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*(?:/>|>[^<]*</${tagName}>)`, 'gi');
  return xml.match(regex) || [];
}

async function extractEpubMetadata(bookPath, bookFilename) {
  const result = { title: '', author: '', coverFile: null };

  try {
    const zip = new AdmZip(bookPath);
    const entries = zip.getEntries();

    // Find and parse the OPF file (contains metadata)
    let opfContent = '';
    let opfDir = '';

    // First find container.xml to locate the OPF
    const containerEntry = entries.find(e => e.entryName === 'META-INF/container.xml');
    if (containerEntry) {
      const containerXml = containerEntry.getData().toString('utf-8');
      const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
      if (rootfileMatch) {
        const opfPath = rootfileMatch[1];
        opfDir = path.dirname(opfPath);
        if (opfDir === '.') opfDir = '';
        const opfEntry = entries.find(e => e.entryName === opfPath);
        if (opfEntry) {
          opfContent = opfEntry.getData().toString('utf-8');
        }
      }
    }

    if (!opfContent) {
      // Fallback: find any .opf file
      const opfEntry = entries.find(e => e.entryName.endsWith('.opf'));
      if (opfEntry) {
        opfContent = opfEntry.getData().toString('utf-8');
        opfDir = path.dirname(opfEntry.entryName);
        if (opfDir === '.') opfDir = '';
      }
    }

    if (opfContent) {
      // Extract title and author
      result.title = getTagContent(opfContent, 'dc:title');
      result.author = getTagContent(opfContent, 'dc:creator');

      // Find cover image — parse all <item> tags into a lookup
      const itemTags = findAllTags(opfContent, 'item');
      const items = itemTags.map(tag => ({
        id: getAttributeValue(tag, 'id'),
        href: getAttributeValue(tag, 'href'),
        mediaType: getAttributeValue(tag, 'media-type'),
        properties: getAttributeValue(tag, 'properties'),
      }));

      let coverHref = '';

      // Method 1: meta name="cover" content="cover-image-id"
      const metaTags = findAllTags(opfContent, 'meta');
      for (const meta of metaTags) {
        if (getAttributeValue(meta, 'name') === 'cover') {
          const coverId = getAttributeValue(meta, 'content');
          const item = items.find(i => i.id === coverId);
          if (item) coverHref = item.href;
          break;
        }
      }

      // Method 2: item with properties="cover-image"
      if (!coverHref) {
        const coverItem = items.find(i => i.properties === 'cover-image');
        if (coverItem) coverHref = coverItem.href;
      }

      // Method 3: item with id containing "cover" and image media type
      if (!coverHref) {
        const coverItem = items.find(i =>
          i.id.toLowerCase().includes('cover') && i.mediaType.startsWith('image/')
        );
        if (coverItem) coverHref = coverItem.href;
      }

      if (coverHref) {
        // Resolve path relative to OPF directory, normalizing double slashes
        const coverEntryPath = opfDir ? path.posix.join(opfDir, coverHref) : coverHref;
        const coverEntry = entries.find(e =>
          e.entryName === coverEntryPath || e.entryName === coverHref
        );

        if (coverEntry) {
          const ext = path.extname(coverHref).toLowerCase() || '.jpg';
          const coverFilename = `${bookFilename}${ext}`;
          const coverPath = path.join(COVERS_DIR, coverFilename);
          const coverData = coverEntry.getData();
          if (coverData.length > 5 * 1024 * 1024) {
            // Skip oversized cover
          } else {
            fs.writeFileSync(coverPath, coverData);
            result.coverFile = coverFilename;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Metadata extraction warning:', err.message);
  }

  return result;
}

// --- PDF metadata extraction ---

async function extractPdfMetadata(bookPath, bookFilename) {
  const result = { title: '', author: '', coverFile: null };

  try {
    const dataBuffer = fs.readFileSync(bookPath);
    const data = await pdfParse(dataBuffer, { max: 1 }); // only parse first page for speed

    if (data.info) {
      result.title = data.info.Title || '';
      result.author = data.info.Author || '';
    }
  } catch (err) {
    console.warn('PDF metadata extraction warning:', err.message);
  }

  return result;
}

// --- Neural TTS via Microsoft Edge (free, high quality) ---

// Cache a TTS instance per voice to avoid re-handshaking
const ttsInstances = new Map(); // voice → { instance, lastUsed }
const TTS_INSTANCE_LIMIT = 5;
const TTS_STALE_MS = 30 * 60 * 1000; // 30 minutes

async function getTtsInstance(voice) {
  const cached = ttsInstances.get(voice);
  if (cached) {
    if (Date.now() - cached.lastUsed > TTS_STALE_MS) {
      ttsInstances.delete(voice);
    } else {
      cached.lastUsed = Date.now();
      return cached.instance;
    }
  }
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  if (ttsInstances.size >= TTS_INSTANCE_LIMIT) {
    const oldest = ttsInstances.keys().next().value;
    ttsInstances.delete(oldest);
  }
  ttsInstances.set(voice, { instance: tts, lastUsed: Date.now() });
  return tts;
}

// List available neural voices
app.get('/api/tts/voices', async (req, res) => {
  try {
    const tts = new MsEdgeTTS();
    const voices = await tts.getVoices();
    const english = voices
      .filter(v => v.Locale.startsWith('en'))
      .map(v => ({ id: v.ShortName, name: v.FriendlyName, locale: v.Locale, gender: v.Gender }));
    res.json(english);
  } catch (err) {
    console.error('TTS voices error:', err.message);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

// Generate speech audio — streams MP3 back to client
const MAX_TTS_LENGTH = 50000;
const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many TTS requests. Please wait a minute before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.post('/api/tts/speak', ttsLimiter, async (req, res) => {
  try {
    const { text, voice, rate, pitch, volume } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }
    if (text.length > MAX_TTS_LENGTH) {
      return res.status(400).json({ error: 'Text too long' });
    }

    const voiceId = voice || 'en-US-AriaNeural';
    const tts = await getTtsInstance(voiceId);

    // Convert rate multiplier (1 = normal, 1.5 = 50% faster) to percentage string
    const ratePercent = rate ? `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%` : '+0%';
    // Pitch: integer offset in Hz (e.g., 10 → "+10Hz", -5 → "-5Hz")
    const pitchValue = pitch ? `${pitch >= 0 ? '+' : ''}${Math.round(pitch)}Hz` : '+0Hz';
    // Volume: 0-100 (default 100)
    const volumeValue = typeof volume === 'number' ? Math.max(0, Math.min(100, volume)) : 100;

    const result = tts.toStream(text, { rate: ratePercent, pitch: pitchValue, volume: volumeValue });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    result.audioStream.pipe(res);
    result.audioStream.on('error', (err) => {
      console.error('TTS stream error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'TTS generation failed' });
    });
  } catch (err) {
    console.error('TTS speak error:', err.message);
    // Re-create instance on failure (connection may be stale)
    if (req.body?.voice) ttsInstances.delete(req.body.voice);
    if (!res.headersSent) res.status(500).json({ error: 'TTS generation failed' });
  }
});

// Serve the built Expo web app (for Electron / production)
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { dotfiles: 'deny' }));
  // SPA fallback for client-side routing
  app.get('*', (req, res) => {
    const filePath = path.resolve(distPath, req.path.replace(/^\//, ''));
    if (!filePath.startsWith(distPath)) {
      return res.status(400).send('Invalid path');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.sendFile(filePath);
    } else {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Global error handler
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS not allowed' });
  }
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Book Reader server running at http://localhost:${PORT}`);
  console.log(`Books stored in: ${BOOKS_DIR}`);
});
