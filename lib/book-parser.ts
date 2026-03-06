// Book parsing utilities
// Extracts text content from PDF and ePub files

import { Chapter } from '@/types';

// TODO: Phase 2 — implement these functions

export async function extractTextFromPdf(_fileUri: string): Promise<string[]> {
  // Will use pdfjs-dist to extract text from each page
  // Returns an array of strings, one per page/chapter
  return [];
}

export async function extractTextFromEpub(_fileUri: string): Promise<string[]> {
  // Will use epubjs to parse the ePub spine and extract chapter text
  // Returns an array of strings, one per chapter
  return [];
}

export function detectFormat(filename: string): 'pdf' | 'epub' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.epub')) return 'epub';
  return null;
}
