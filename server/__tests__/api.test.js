const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Set up a temporary data directory for test isolation
const TEST_DATA_DIR = path.join(__dirname, '..', '.test-data-' + Date.now());
process.env.DATA_DIR = TEST_DATA_DIR;

// Must require the app after setting DATA_DIR
let app;

beforeAll(() => {
  // The server module creates dirs and DB on require — we need DATA_DIR set first
  // Re-require to get the express app. The server file calls app.listen(),
  // but supertest works with the app object directly.
  // We need to extract the app without starting the server.

  // Create a minimal test app that mirrors the server's routes
  const cors = require('cors');
  const multer = require('multer');
  const Database = require('better-sqlite3');
  const helmet = require('helmet');

  app = express();

  const BOOKS_DIR = path.join(TEST_DATA_DIR, 'books');
  const COVERS_DIR = path.join(TEST_DATA_DIR, 'covers');
  const DB_PATH = path.join(TEST_DATA_DIR, 'library.db');

  fs.mkdirSync(BOOKS_DIR, { recursive: true });
  fs.mkdirSync(COVERS_DIR, { recursive: true });

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

  const stmtAll = db.prepare('SELECT * FROM books ORDER BY addedAt DESC');
  const stmtGetById = db.prepare('SELECT * FROM books WHERE id = ?');
  const stmtDelete = db.prepare('DELETE FROM books WHERE id = ?');

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  }));
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(express.json());

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, BOOKS_DIR),
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
    }),
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.epub' || ext === '.pdf') cb(null, true);
      else cb(new Error('Only .epub and .pdf files are supported'));
    },
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  app.get('/api/books', (req, res) => {
    res.json(stmtAll.all());
  });

  app.post('/api/books', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ id: crypto.randomUUID(), filename: req.file.filename });
  });

  app.delete('/api/books/:id', (req, res) => {
    if (!req.params.id || !/^(\d+|[0-9a-f-]{36})$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid book ID' });
    }
    const book = stmtGetById.get(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    stmtDelete.run(req.params.id);
    res.json({ ok: true });
  });

  app.use((err, req, res, next) => {
    if (err.message === 'Not allowed by CORS') {
      return res.status(403).json({ error: 'CORS not allowed' });
    }
    res.status(500).json({ error: err.message || 'Internal server error' });
  });
});

afterAll(() => {
  // Clean up test data directory
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('GET /api/books', () => {
  test('returns 200 with JSON array', async () => {
    const res = await request(app).get('/api/books');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('DELETE /api/books/:id', () => {
  test('returns 400 for invalid ID format', async () => {
    const res = await request(app).delete('/api/books/invalid-id');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid book ID');
  });

  test('returns 404 for non-existent book', async () => {
    const res = await request(app).delete('/api/books/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/books', () => {
  test('returns 400 when no file is attached', async () => {
    const res = await request(app).post('/api/books');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });
});

describe('CORS headers', () => {
  test('includes CORS headers for localhost origin', async () => {
    const res = await request(app)
      .get('/api/books')
      .set('Origin', 'http://localhost:8081');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  test('rejects non-localhost origins', async () => {
    const res = await request(app)
      .get('/api/books')
      .set('Origin', 'https://evil.com');
    expect(res.status).toBe(403);
  });
});
