export type HighlightColor = 'yellow' | 'blue' | 'green' | 'pink';

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#FFEB3B',
  blue: '#90CAF9',
  green: '#A5D6A7',
  pink: '#F48FB1',
};

export type ThemeName = 'original' | 'quiet' | 'paper' | 'bold' | 'calm' | 'focus';

export interface ThemeConfig {
  label: string;
  bg: string;
  text: string;
  fontWeight?: string;
  fontFamily?: string;
}

export const themes: Record<ThemeName, ThemeConfig> = {
  original: { label: 'Original', bg: '#ffffff', text: '#000000' },
  quiet: { label: 'Quiet', bg: '#3e3e3e', text: '#d4d4d4' },
  paper: { label: 'Paper', bg: '#e8e4dc', text: '#4a4a4a' },
  bold: { label: 'Bold', bg: '#ffffff', text: '#000000', fontWeight: 'bold' },
  calm: { label: 'Calm', bg: '#f0e6c8', text: '#5a4e3a', fontFamily: 'Georgia, serif' },
  focus: { label: 'Focus', bg: '#faf5e4', text: '#3a3a2a', fontFamily: 'Georgia, serif' },
};

export interface ReaderHighlight {
  id: number;
  selectedText: string;
  note: string;
  color: HighlightColor;
  pageInfo: string;        // Display string like "3 / 12" for ePub or "Page 5" for PDF
  cfiRange?: string;       // ePub CFI for navigation
  page?: number;           // PDF page number
  createdAt: string;
}

export interface ReaderBookmark {
  id: number;
  page: number;
  label: string;
  cfi?: string;           // ePub CFI for navigation
}

export interface SelectionPopupState {
  x: number;
  y: number;
  selectedText: string;
  range?: Range | null;   // ePub only — the DOM Range for highlighting
}
