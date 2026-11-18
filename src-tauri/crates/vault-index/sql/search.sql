-- search.sqlite: what the crate computed from each Markdown file, and nothing else.
-- Opened only by the app. A different PRAGMA user_version discards the file; it is never altered.

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

-- One row per indexed file, with the stamp of the version its tokens came from.
-- read_at_ns is when that version was read; a file modified within two seconds of it is
-- compared by sha256 before its row is trusted.
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  mtime_ns INTEGER NOT NULL,
  size INTEGER NOT NULL,
  ctime_ns INTEGER NOT NULL,
  read_at_ns INTEGER NOT NULL,
  sha256 BLOB NOT NULL
);

-- Contentless: FTS5 stores no column text, but it keeps every token with its position, so a
-- document's words can be read back in order (fts5vocab). Treat this file as holding the text.
-- body holds the whole file text, name the words of its path; ranked 1 : 4.
CREATE VIRTUAL TABLE terms USING fts5(
  body,
  name,
  content = '',
  contentless_delete = 1
);

INSERT INTO terms(terms, rank) VALUES ('rank', 'bm25(1.0, 4.0)');
