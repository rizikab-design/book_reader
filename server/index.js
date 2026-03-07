const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { readFile, writeFile } = require('fs').promises;

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
const DB_FILE = path.join(DATA_ROOT, 'library.json');

// Ensure directories exist
fs.mkdirSync(BOOKS_DIR, { recursive: true });
fs.mkdirSync(COVERS_DIR, { recursive: true });

// --- Simple file lock to prevent race conditions on library.json ---
let libraryLock = Promise.resolve();

function withLibraryLock(fn) {
  const next = libraryLock.then(fn, fn);
  libraryLock = next.catch(() => {}); // prevent unhandled rejection
  return next;
}

// Initialize library DB
async function loadLibrary() {
  try {
    const data = await readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveLibrary(books) {
  await writeFile(DB_FILE, JSON.stringify(books, null, 2));
}

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
app.use(express.json());
app.use('/books', express.static(BOOKS_DIR, { dotfiles: 'deny' }));
app.use('/covers', express.static(COVERS_DIR, { dotfiles: 'deny' }));

// File upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BOOKS_DIR),
  filename: (req, file, cb) => {
    // Sanitize filename
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${Date.now()}-${safe}`;
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
app.get('/api/books', async (req, res) => {
  const books = await loadLibrary();
  res.json(books);
});

// Upload a book (locked to prevent concurrent writes)
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
      try { fs.unlinkSync(bookPath); } catch {}
      return res.status(500).json({ error: 'Failed to process book file' });
    }

    const book = {
      id: Date.now().toString(),
      filename: bookFilename,
      originalName,
      title: metadata.title || originalName.replace(/\.(epub|pdf)$/i, ''),
      author: metadata.author || 'Unknown',
      coverFile: metadata.coverFile || null,
      format,
      addedAt: new Date().toISOString(),
      fileSize: req.file.size,
    };

    await withLibraryLock(async () => {
      const library = await loadLibrary();
      library.push(book);
      await saveLibrary(library);
    });

    res.json(book);
  } catch (err) {
    console.error('Upload error:', err);
    // Clean up uploaded file on failure
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Delete a book (locked to prevent concurrent writes)
app.delete('/api/books/:id', async (req, res) => {
  try {
    const result = await withLibraryLock(async () => {
      const library = await loadLibrary();
      const book = library.find((b) => b.id === req.params.id);
      if (!book) return null;

      // Validate filename doesn't traverse directories
      if (book.filename.includes('/') || book.filename.includes('\\') || book.filename.includes('..')) {
        return { error: 'Invalid filename' };
      }

      // Delete files
      const bookPath = path.join(BOOKS_DIR, book.filename);
      try { if (fs.existsSync(bookPath)) fs.unlinkSync(bookPath); } catch (e) {
        console.warn('Failed to delete book file:', e.message);
      }
      if (book.coverFile) {
        const coverPath = path.join(COVERS_DIR, book.coverFile);
        try { if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath); } catch (e) {
          console.warn('Failed to delete cover file:', e.message);
        }
      }

      const updated = library.filter((b) => b.id !== req.params.id);
      await saveLibrary(updated);
      return { ok: true };
    });

    if (!result) return res.status(404).json({ error: 'Book not found' });
    res.json(result);
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
    const AdmZip = require('adm-zip');
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
    const pdfParse = require('pdf-parse');
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
