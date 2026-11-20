-- vectors.sqlite: search by meaning, for one embedding model and dimension (meta 'model' and
-- 'dimensions', with 'store_id' naming this file's generation); another model or dimension
-- retires the file (removed, or reset in place where another handle keeps it), and a file naming
-- no model holds nothing. Opened only by the app. A different PRAGMA user_version retires the
-- file; it is never altered.
-- It holds no passage text, but vectors can reveal parts of the text they came from.

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

-- One row per listed file whose passages are known, with the stamp of the version they came from
-- (the columns the search index's stamp pass reads). over_cap counts passages beyond the 500 a
-- file contributes; they are not prepared.
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  mtime_ns INTEGER NOT NULL,
  size INTEGER NOT NULL,
  ctime_ns INTEGER NOT NULL,
  read_at_ns INTEGER NOT NULL,
  sha256 BLOB NOT NULL,
  over_cap INTEGER NOT NULL
);

-- The SHA-256 of each NFC passage a file holds now, and its length in characters. A passage is
-- prepared when a vector with its hash exists; a rename or a move only rewrites these rows.
CREATE TABLE passages (
  file_id INTEGER NOT NULL,
  sha256 BLOB NOT NULL,
  chars INTEGER NOT NULL,
  PRIMARY KEY (file_id, sha256)
) WITHOUT ROWID;

CREATE INDEX passages_by_sha ON passages(sha256);

-- Content-addressed: one vector per distinct passage text, L2-normalised, as int8 times scale.
-- Ids are never reused, so a search's in-memory copy never pairs an old id with a new vector.
-- unheld_since_ms is set while no listed file holds the passage; it is swept a grace period later.
CREATE TABLE vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sha256 BLOB NOT NULL UNIQUE,
  scale REAL NOT NULL,
  int8 BLOB NOT NULL,
  unheld_since_ms INTEGER
);

CREATE INDEX vectors_unheld ON vectors(unheld_since_ms) WHERE unheld_since_ms IS NOT NULL;

-- The sign of every component of vectors(id), packed in little-endian 64-bit words: the copy a
-- search holds in memory. Kept apart so loading it reads an eighth of the vectors' bytes.
CREATE TABLE signs (
  id INTEGER PRIMARY KEY,
  bits BLOB NOT NULL
);
