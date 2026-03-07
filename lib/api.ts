// API client for the local book server

const API_BASE = 'http://localhost:3001';

export interface BookEntry {
  id: string;
  filename: string;
  originalName: string;
  title: string;
  author: string;
  coverFile: string | null;
  format: 'epub' | 'pdf';
  addedAt: string;
  fileSize: number;
}

export async function fetchBooks(): Promise<BookEntry[]> {
  const res = await fetch(`${API_BASE}/api/books`);
  if (!res.ok) throw new Error('Failed to fetch books');
  return res.json();
}

export async function uploadBook(file: File): Promise<BookEntry> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/books`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export async function deleteBook(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/books/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete book');
}

export function getBookUrl(filename: string): string {
  return `${API_BASE}/books/${filename}`;
}

export function getCoverUrl(coverFile: string): string {
  return `${API_BASE}/covers/${coverFile}`;
}
