-- Book Reader Database Schema
-- Run this in your Supabase SQL editor to create the tables

-- Books table: one row per uploaded book
create table books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  format text not null check (format in ('pdf', 'epub')),
  storage_path text not null,
  cover_url text,
  status text default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'error')),
  total_chapters int,
  created_at timestamptz default now()
);

-- Chapters table: one row per chapter per book
create table chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books on delete cascade not null,
  chapter_index int not null,
  title text,
  text_content text not null,
  status text default 'pending' check (status in ('pending', 'ready', 'error')),
  created_at timestamptz default now()
);

-- Notes table: highlights and notes made while reading
create table notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books on delete cascade not null,
  chapter_index int not null,
  selected_text text not null,
  note_text text default '',
  start_offset int not null,
  end_offset int not null,
  color text default 'yellow' check (color in ('yellow', 'blue', 'green', 'pink')),
  created_at timestamptz default now()
);

-- User progress: remembers where you left off in each book
create table user_progress (
  book_id uuid references books on delete cascade not null,
  chapter_index int not null default 0,
  position_ms int not null default 0,
  updated_at timestamptz default now(),
  primary key (book_id)
);

-- Index for fast chapter lookups by book
create index idx_chapters_book_id on chapters (book_id, chapter_index);

-- Index for fast note lookups by book
create index idx_notes_book_id on notes (book_id, chapter_index);
