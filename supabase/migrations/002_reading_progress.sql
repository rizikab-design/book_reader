-- Reading progress table for syncing across devices
-- NOTE: RLS is disabled for now (single-user, anon key). Enable RLS before production use.

create table if not exists reading_progress (
  user_id uuid not null default '00000000-0000-0000-0000-000000000000',
  book_id text not null,
  progress float not null default 0,
  cfi text,
  page int,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index if not exists idx_reading_progress_book on reading_progress (book_id);
