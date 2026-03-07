const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Directories
const BOOKS_DIR = path.join(__dirname, 'books');
const COVERS_DIR = path.join(__dirname, 'covers');
const DB_FILE = path.join(__dirname, 'library.json');

// Ensure directories exist
fs.mkdirSync(BOOKS_DIR, { recursive: true });
fs.mkdirSync(COVERS_DIR, { recursive: true });

// Initialize library DB
function loadLibrary() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveLibrary(books) {
  fs.writeFileSync(DB_FILE, JSON.stringify(books, null, 2));
}

// Middleware
app.use(cors());
app.use(express.json());
app.use('/books', express.static(BOOKS_DIR));
app.use('/covers', express.static(COVERS_DIR));

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
    if (ext === '.epub') {
      cb(null, true);
    } else {
      cb(new Error('Only .epub files are supported'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// --- Routes ---

// List all books
app.get('/api/books', (req, res) => {
  const books = loadLibrary();
  res.json(books);
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

    // Extract metadata and cover from the ePub
    const metadata = await extractEpubMetadata(bookPath, bookFilename);

    const book = {
      id: Date.now().toString(),
      filename: bookFilename,
      originalName,
      title: metadata.title || originalName.replace(/\.epub$/i, ''),
      author: metadata.author || 'Unknown',
      coverFile: metadata.coverFile || null,
      addedAt: new Date().toISOString(),
      fileSize: req.file.size,
    };

    const library = loadLibrary();
    library.push(book);
    saveLibrary(library);

    res.json(book);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Delete a book
app.delete('/api/books/:id', (req, res) => {
  const library = loadLibrary();
  const book = library.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  // Delete files
  const bookPath = path.join(BOOKS_DIR, book.filename);
  if (fs.existsSync(bookPath)) fs.unlinkSync(bookPath);
  if (book.coverFile) {
    const coverPath = path.join(COVERS_DIR, book.coverFile);
    if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
  }

  const updated = library.filter((b) => b.id !== req.params.id);
  saveLibrary(updated);
  res.json({ ok: true });
});

// --- ePub metadata extraction ---

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
      }
    }

    if (opfContent) {
      // Extract title
      const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
      if (titleMatch) result.title = titleMatch[1].trim();

      // Extract author
      const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
      if (authorMatch) result.author = authorMatch[1].trim();

      // Find cover image
      // Method 1: meta name="cover" content="cover-image-id"
      const coverMetaMatch = opfContent.match(/<meta\s+name="cover"\s+content="([^"]+)"/i)
        || opfContent.match(/<meta\s+content="([^"]+)"\s+name="cover"/i);

      let coverHref = '';
      if (coverMetaMatch) {
        const coverId = coverMetaMatch[1];
        const itemRegex = new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]+)"`, 'i');
        const itemMatch = opfContent.match(itemRegex);
        if (itemMatch) coverHref = itemMatch[1];
      }

      // Method 2: item with properties="cover-image"
      if (!coverHref) {
        const coverPropMatch = opfContent.match(/<item[^>]*properties="cover-image"[^>]*href="([^"]+)"/i);
        if (coverPropMatch) coverHref = coverPropMatch[1];
      }

      // Method 3: item with id containing "cover" and image media type
      if (!coverHref) {
        const coverIdMatch = opfContent.match(/<item[^>]*id="[^"]*cover[^"]*"[^>]*href="([^"]+)"[^>]*media-type="image\/[^"]+"/i);
        if (coverIdMatch) coverHref = coverIdMatch[1];
      }

      if (coverHref) {
        // Resolve path relative to OPF directory
        const coverEntryPath = opfDir ? `${opfDir}/${coverHref}` : coverHref;
        const coverEntry = entries.find(e =>
          e.entryName === coverEntryPath || e.entryName === coverHref
        );

        if (coverEntry) {
          const ext = path.extname(coverHref).toLowerCase() || '.jpg';
          const coverFilename = `${bookFilename}${ext}`;
          const coverPath = path.join(COVERS_DIR, coverFilename);
          fs.writeFileSync(coverPath, coverEntry.getData());
          result.coverFile = coverFilename;
        }
      }
    }
  } catch (err) {
    console.warn('Metadata extraction warning:', err.message);
  }

  return result;
}

app.listen(PORT, () => {
  console.log(`Book Reader server running at http://localhost:${PORT}`);
  console.log(`Books stored in: ${BOOKS_DIR}`);
});
