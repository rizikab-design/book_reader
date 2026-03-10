const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Set up a temporary data directory for test isolation
const TEST_DATA_DIR = path.join(__dirname, '..', '.test-data-' + Date.now());
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.PORT = '0'; // Let OS pick a port

// Must require the app after setting DATA_DIR
const app = require('../index');

afterAll(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('Books API', () => {
  test('GET /api/books returns 200 with array', async () => {
    const res = await request(app).get('/api/books');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/books with no file returns 400', async () => {
    const res = await request(app).post('/api/books');
    expect(res.status).toBe(400);
  });

  test('DELETE /api/books with invalid ID format returns 400', async () => {
    const res = await request(app).delete('/api/books/not-a-valid-id!@#');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid book ID');
  });

  test('DELETE /api/books with valid UUID format but nonexistent returns 404', async () => {
    const res = await request(app).delete('/api/books/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('Security', () => {
  test('Security headers are present', async () => {
    const res = await request(app).get('/api/books');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('CORS rejects non-localhost origin', async () => {
    const res = await request(app)
      .get('/api/books')
      .set('Origin', 'https://evil.com');
    expect(res.status).toBe(403);
  });

  test('CORS allows localhost origin', async () => {
    const res = await request(app)
      .get('/api/books')
      .set('Origin', 'http://localhost:8081');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });
});

describe('TTS API', () => {
  test('POST /api/tts/speak with no text returns 400', async () => {
    const res = await request(app)
      .post('/api/tts/speak')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Text is required');
  });

  test('POST /api/tts/speak with too-long text returns 400', async () => {
    const res = await request(app)
      .post('/api/tts/speak')
      .send({ text: 'a'.repeat(60000) });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('too long');
  });
});
