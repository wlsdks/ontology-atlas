//! Nearest passages to a query vector, each checked against its file as it is now.

use super::plan::read_passages;
use super::quantize::check_vector;
use super::words::Words;
use super::{
    deletion_count, dir_for, invalid_input, meta_number, reader, set_aside_if_damaged,
    stored_model, Model, META_HELD_CHANGES, META_STORE_ID,
};
use crate::lifecycle::{read_meta, VECTORS_FILE};
use crate::passage::Passage;
use crate::stamps::Sha;
use crate::Result;
use rusqlite::{Connection, OptionalExtension};
use std::collections::{BinaryHeap, HashMap};
use std::path::{Path, PathBuf};

/// The first pass keeps this many candidates (or sixteen per hit asked for) for int8 rescoring.
const RESCORE_CANDIDATES: usize = 256;
/// Hits one search returns at most, which bounds its candidate heap.
pub const MAX_HITS: usize = 64;

/// One passage a search found, still held by its file.
#[derive(Clone, Debug, PartialEq)]
pub struct PassageHit {
    /// Relative to the vault root, `/`-separated, as the folder walk listed it.
    pub path: String,
    /// 1-based, inclusive, in the file as it is now.
    pub line_start: u32,
    pub line_end: u32,
    pub heading: Option<String>,
    /// Cosine similarity estimated from the int8 vector; higher is nearer.
    pub score: f32,
    pub sha256: [u8; 32],
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Found {
    pub hits: Vec<PassageHit>,
    /// Near passages dropped because their file no longer holds them; a `plan` is due.
    pub stale: usize,
    /// The store was deleted, emptied, set aside or replaced since the searcher opened: it found
    /// nothing and let its copy go. Open a new one.
    pub deleted: bool,
}

/// A read connection plus the sign bits of every vector a file holds, in memory, d / 8 + 8 bytes
/// each, returned to the system when it is dropped. A search sees what a running `prepare`
/// stored; vectors in their grace period cost disk only.
pub struct Searcher {
    /// In memory once the store went, so no handle keeps its file.
    conn: Connection,
    released: bool,
    root: PathBuf,
    dir: PathBuf,
    model: Model,
    /// The generation of the file it opened, and that file's identity on disk.
    store_id: Option<String>,
    file: Option<FileIdentity>,
    /// Row ids, as stored.
    ids: Words,
    /// `model.words()` words per vector, in `ids` order.
    bits: Words,
    loaded_through: i64,
    held_changes_at_load: u64,
    deletions: i64,
}

impl Searcher {
    /// `None` while no store for `model` exists; never creates one. Loads every vector's sign
    /// bits: O(n · d / 64). A damaged file is set aside so the next `plan` rebuilds it.
    pub fn open(root: &Path, model: &Model) -> Result<Option<Searcher>> {
        // Read before the file is opened, so a Delete in between is seen at the first search.
        let deletions = deletion_count(&dir_for(root)?);
        let opened = reader(root, model).and_then(|found| {
            found
                .map(|(root, dir, conn)| Searcher::load(conn, root, dir, model, deletions))
                .transpose()
        });
        if let Err(error) = &opened {
            set_aside_if_damaged(&dir_for(root)?, error, false);
        }
        opened
    }

    fn load(
        conn: Connection,
        root: PathBuf,
        dir: PathBuf,
        model: &Model,
        deletions: i64,
    ) -> Result<Searcher> {
        let mut searcher = Searcher {
            released: false,
            store_id: read_meta(&conn, META_STORE_ID)?,
            file: FileIdentity::of(&dir.join(VECTORS_FILE)),
            conn,
            deletions,
            root,
            dir,
            model: model.clone(),
            ids: Words::with_capacity(0)?,
            bits: Words::with_capacity(0)?,
            loaded_through: 0,
            held_changes_at_load: 0,
        };
        searcher.reload()?;
        Ok(searcher)
    }

    /// Whether the store it opened went: a Delete here, another file at its path, or the same
    /// file reset in place or given another generation. A file it cannot read counts as gone.
    fn store_gone(&self) -> bool {
        if self.released
            || deletion_count(&self.dir) != self.deletions
            || FileIdentity::of(&self.dir.join(VECTORS_FILE)) != self.file
        {
            return true;
        }
        let same = read_meta(&self.conn, META_STORE_ID).is_ok_and(|id| id == self.store_id)
            && stored_model(&self.conn).is_ok_and(|model| model.as_ref() == Some(&self.model));
        !same
    }

    /// Lets the store go: its copy and its connection, so no handle keeps the file.
    fn release(&mut self) -> Result<()> {
        self.ids = Words::with_capacity(0)?;
        self.bits = Words::with_capacity(0)?;
        self.conn = Connection::open_in_memory()?;
        self.released = true;
        Ok(())
    }

    /// Vectors held in memory.
    pub fn vectors(&self) -> usize {
        self.ids.len()
    }

    fn reload(&mut self) -> Result<()> {
        self.held_changes_at_load = meta_number(&self.conn, META_HELD_CHANGES)?;
        let count: i64 = self.conn.query_row(
            "SELECT count(*) FROM vectors WHERE unheld_since_ms IS NULL",
            [],
            |row| row.get(0),
        )?;
        let count = usize::try_from(count).unwrap_or(0);
        // The old copy goes first, so a reload never holds two.
        self.ids = Words::with_capacity(0)?;
        self.bits = Words::with_capacity(0)?;
        self.ids = Words::with_capacity(count)?;
        self.bits = Words::with_capacity(count.saturating_mul(self.model.words()))?;
        self.loaded_through = 0;
        self.load_new()
    }

    fn load_new(&mut self) -> Result<()> {
        let words = self.model.words();
        let mut statement = self.conn.prepare_cached(
            "SELECT s.id, s.bits, v.unheld_since_ms IS NULL FROM signs AS s
               JOIN vectors AS v ON v.id = s.id WHERE s.id > ?1 ORDER BY s.id",
        )?;
        let mut rows = statement.query([self.loaded_through])?;
        while let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            let bytes = row.get_ref(1)?.as_bytes().map_err(rusqlite::Error::from)?;
            let held: bool = row.get(2)?;
            self.loaded_through = id;
            if !held || bytes.len() != words * 8 {
                continue;
            }
            self.ids.push(id as u64)?;
            for word in bytes.as_chunks::<8>().0 {
                self.bits.push(u64::from_le_bytes(*word))?;
            }
        }
        Ok(())
    }

    /// Picks up vectors stored since the last search; reloads, O(n · d / 64), once which vectors
    /// files hold changed (a plan let some go, held some again or swept them).
    fn catch_up(&mut self) -> Result<()> {
        if meta_number(&self.conn, META_HELD_CHANGES)? != self.held_changes_at_load {
            return self.reload();
        }
        self.load_new()
    }

    /// The `limit` (at most `MAX_HITS`) passages nearest `query`, best first, each checked against
    /// its file as it is now. Hamming distance over sign bits picks c candidates in
    /// O(n · d / 64 + n · log c); their int8 vectors are rescored in O(c · d).
    /// A damaged file is let go and set aside unless a build holds the writer lock, which a search
    /// never waits for; the next `plan` sets it aside then.
    pub fn nearest(&mut self, query: &[f32], limit: usize) -> Result<Found> {
        let found = self.search(query, limit.min(MAX_HITS));
        if let Err(error) = &found {
            if error.is_damage() {
                self.release()?;
                set_aside_if_damaged(&self.dir, error, false);
            }
        }
        found
    }

    fn search(&mut self, query: &[f32], limit: usize) -> Result<Found> {
        let quantized = check_vector(0, query, self.model.dimensions)
            .map_err(|refusal| invalid_input(&format!("query refused: {refusal}")))?;
        if self.store_gone() {
            self.release()?;
            return Ok(Found {
                deleted: true,
                ..Found::default()
            });
        }
        self.catch_up()?;
        let norm = query
            .iter()
            .map(|&x| f64::from(x) * f64::from(x))
            .sum::<f64>()
            .sqrt();
        let unit: Vec<f32> = query
            .iter()
            .map(|&x| (f64::from(x) / norm) as f32)
            .collect();
        let query_bits: Vec<u64> = quantized
            .bits
            .as_chunks::<8>()
            .0
            .iter()
            .map(|word| u64::from_le_bytes(*word))
            .collect();
        let candidates = self.nearest_by_signs(
            &query_bits,
            RESCORE_CANDIDATES.max(limit.saturating_mul(16)),
        );
        let ranked = self.rescore(&unit, &candidates)?;
        self.verify(ranked, limit)
    }

    /// Indexes into `ids` of the `count` vectors with the fewest differing sign bits, kept in a
    /// bounded max-heap.
    fn nearest_by_signs(&self, query: &[u64], count: usize) -> Vec<usize> {
        let mut heap: BinaryHeap<(u32, usize)> = BinaryHeap::with_capacity(count + 1);
        for (index, vector) in self
            .bits
            .as_slice()
            .chunks_exact(self.model.words())
            .enumerate()
        {
            let distance: u32 = vector
                .iter()
                .zip(query)
                .map(|(a, b)| (a ^ b).count_ones())
                .sum();
            if heap.len() < count {
                heap.push((distance, index));
            } else if heap.peek().is_some_and(|&(worst, _)| distance < worst) {
                heap.pop();
                heap.push((distance, index));
            }
        }
        heap.into_iter().map(|(_, index)| index).collect()
    }

    /// Candidates scored by their int8 vectors, best first. A vector deleted since it was loaded
    /// is skipped.
    fn rescore(&self, unit: &[f32], candidates: &[usize]) -> Result<Vec<(f32, Sha)>> {
        let mut statement = self
            .conn
            .prepare_cached("SELECT sha256, scale, int8 FROM vectors WHERE id = ?1")?;
        let mut ranked = Vec::with_capacity(candidates.len());
        for &index in candidates {
            let Some(&id) = self.ids.as_slice().get(index) else {
                continue;
            };
            let scored = statement
                .query_row([id as i64], |row| {
                    let sha = Sha::try_from(row.get_ref(0)?.as_bytes()?).ok();
                    let scale: f64 = row.get(1)?;
                    let int8 = row.get_ref(2)?.as_bytes()?;
                    let dot: f32 = int8
                        .iter()
                        .zip(unit)
                        .map(|(&q, &u)| f32::from(q as i8) * u)
                        .sum();
                    Ok(sha
                        .filter(|_| int8.len() == unit.len())
                        .map(|sha| (dot * scale as f32, sha)))
                })
                .optional()?
                .flatten();
            ranked.extend(scored);
        }
        ranked.sort_by(|a, b| b.0.total_cmp(&a.0));
        Ok(ranked)
    }

    /// The best `limit` of `ranked` whose file still holds them; each file is read once.
    fn verify(&self, ranked: Vec<(f32, Sha)>, limit: usize) -> Result<Found> {
        let mut found = Found::default();
        let mut files: HashMap<String, Option<Vec<Passage>>> = HashMap::new();
        let mut holders = self.conn.prepare_cached(
            "SELECT f.path FROM passages AS p JOIN files AS f ON f.id = p.file_id
              WHERE p.sha256 = ?1 ORDER BY f.path",
        )?;
        for (score, sha) in ranked {
            let paths = holders
                .query_map([sha.as_slice()], |row| row.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            for path in paths {
                if found.hits.len() >= limit {
                    return Ok(found);
                }
                let passages = files
                    .entry(path.clone())
                    .or_insert_with(|| read_passages(&self.root, &path));
                let held = passages
                    .as_deref()
                    .and_then(|passages| passages.iter().find(|passage| passage.sha == sha));
                match held {
                    Some(passage) => found.hits.push(PassageHit {
                        path,
                        line_start: passage.line_start,
                        line_end: passage.line_end,
                        heading: passage.heading.clone(),
                        score,
                        sha256: sha,
                    }),
                    None => found.stale += 1,
                }
            }
        }
        Ok(found)
    }
}

/// The file a path names now: device and inode on Unix. Windows refuses to delete or replace a
/// file a searcher holds open, so there a Delete empties it in place and `store_id` tells.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FileIdentity {
    device: u64,
    inode: u64,
}

impl FileIdentity {
    #[cfg(unix)]
    fn of(path: &Path) -> Option<FileIdentity> {
        use std::os::unix::fs::MetadataExt;
        std::fs::metadata(path).ok().map(|meta| FileIdentity {
            device: meta.dev(),
            inode: meta.ino(),
        })
    }

    #[cfg(not(unix))]
    fn of(path: &Path) -> Option<FileIdentity> {
        path.is_file().then_some(FileIdentity {
            device: 0,
            inode: 0,
        })
    }
}
