-- rows.sqlite: per file and per producer, what a program computed from one Markdown file.
-- Plain tables only, in SQL that SQLite 3.31 and later understand, so a program using the
-- operating system's SQLite can open it. A different PRAGMA user_version discards the file; it is
-- never altered.

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

-- namespace is the producer and its version ('app-entry/3+2.3.0'); a producer reads only its own
-- namespace, so another program's or another version's rows are never mixed in.
-- The stamp is the file version the value was computed from; read_at_ns is when that version was
-- first seen, before it was read. A row is used only while the file's stamp equals it and the file
-- was modified more than two seconds before read_at_ns.
-- value is the producer's JSON as raw DEFLATE (RFC 1951; zlib's inflateRaw reads it): parsed
-- frontmatter, diagnostics and the fields its screens show, never the document body.
CREATE TABLE rows (
  namespace TEXT NOT NULL,
  path TEXT NOT NULL,
  mtime_ns INTEGER NOT NULL,
  size INTEGER NOT NULL,
  ctime_ns INTEGER NOT NULL,
  read_at_ns INTEGER NOT NULL,
  value BLOB NOT NULL,
  PRIMARY KEY (namespace, path)
);
