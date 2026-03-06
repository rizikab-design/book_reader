export interface Book {
  id: string;
  title: string;
  author: string | null;
  format: 'pdf' | 'epub';
  storage_path: string;
  cover_url: string | null;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  total_chapters: number | null;
  created_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  chapter_index: number;
  title: string | null;
  text_content: string;
  status: 'pending' | 'ready' | 'error';
  created_at: string;
}

export interface Note {
  id: string;
  book_id: string;
  chapter_index: number;
  selected_text: string;
  note_text: string;
  start_offset: number;
  end_offset: number;
  color: 'yellow' | 'blue' | 'green' | 'pink';
  created_at: string;
}

export interface UserProgress {
  book_id: string;
  chapter_index: number;
  position_ms: number;
  updated_at: string;
}

export interface WordTiming {
  word: string;
  start_ms: number;
  end_ms: number;
}
