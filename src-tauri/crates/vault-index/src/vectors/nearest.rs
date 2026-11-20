//! Nearest passages to a query vector, each checked against its file as it is now.

use super::plan::read_passages;
use super::quantize::check_vector;
use super::words::Words;
use super::{deletion_count, invalid_input, meta_number, reader, Model, META_DELETED_VECTORS};
use crate::passage::Passage;
use crate::stamps::Sha;
use crate::{Error, Result};
use rusqlite::{Connection, OptionalExtension};
use std::collections::{BinaryHeap, HashMap};
use std::io;
use std::path::{Path, PathBuf};

/// The first pass keeps this many candidates (or sixteen per hit asked for) for int8 rescoring.
const RESCORE_CANDIDATES: usize = 256;
/// A search's copy is reloaded once this share of its vectors was deleted (1 / n).
const RELOAD_AFTER_DELETED_SHARE: usize = 8;

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
}

/// A read connection plus the sign bits of every stored vector in memory, d / 8 + 8 bytes each,
/// returned to the system when it is dropped. A search sees what a running `prepare` stored.
pub struct Searcher {
    conn: Connection,
    root: PathBuf,
    dir: PathBuf,
    model: Model,
    /// Row ids, as stored.
    ids: Words,
    /// `model.words()` words per vector, in `ids` order.
    bits: Words,
    loaded_through: i64,
    deleted_at_load: u64,
    deletions: i64,
}

impl Searcher {
    /// `None` while no store for `model` exists; never creates one. Loads every vector's sign
    /// bits: O(n · d / 64).
    pub fn open(root: &Path, model: &Model) -> Result<Option<Searcher>> {
        let Some((root, dir, conn)) = reader(root, model)? else {
            return Ok(None);
        };
        let mut searcher = Searcher {
            conn,
            deletions: deletion_count(&dir),
            root,
            dir,
            model: model.clone(),
            ids: Words::with_capacity(0)?,
            bits: Words::with_capacity(0)?,
            loaded_through: 0,
            deleted_at_load: 0,
        };
        searcher.reload()?;
        Ok(Some(searcher))
    }

    /// Vectors held in memory.
    pub fn vectors(&self) -> usize {
        self.ids.len()
    }

    fn reload(&mut self) -> Result<()> {
        self.deleted_at_load = meta_number(&self.conn, META_DELETED_VECTORS)?;
        let count: i64 = self
            .conn
            .query_row("SELECT count(*) FROM signs", [], |row| row.get(0))?;
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
        let mut statement = self
            .conn
            .prepare_cached("SELECT id, bits FROM signs WHERE id > ?1 ORDER BY id")?;
        let mut rows = statement.query([self.loaded_through])?;
        while let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            let bytes = row.get_ref(1)?.as_bytes().map_err(rusqlite::Error::from)?;
            self.loaded_through = id;
            if bytes.len() != words * 8 {
                continue;
            }
            self.ids.push(id as u64)?;
            for word in bytes.chunks_exact(8).map(word_of) {
                self.bits.push(word)?;
            }
        }
        Ok(())
    }

    /// Picks up vectors stored since the last search; reloads once many were deleted.
    fn catch_up(&mut self) -> Result<()> {
        let deleted = meta_number(&self.conn, META_DELETED_VECTORS)?;
        let gone =
            usize::try_from(deleted.saturating_sub(self.deleted_at_load)).unwrap_or(usize::MAX);
        if gone > 0 && gone >= self.ids.len() / RELOAD_AFTER_DELETED_SHARE {
            return self.reload();
        }
        self.load_new()
    }

    /// The `limit` passages nearest `query`, best first, each checked against its file as it is
    /// now. Hamming distance over sign bits picks c candidates in O(n · d / 64 + n · log c); their
    /// int8 vectors are rescored in O(c · d); files are read only for the best of those.
    pub fn nearest(&mut self, query: &[f32], limit: usize) -> Result<Found> {
        if deletion_count(&self.dir) != self.deletions {
            return Err(Error::Io(io::Error::new(
                io::ErrorKind::NotFound,
                "search by meaning was deleted",
            )));
        }
        let quantized = check_vector(0, query, self.model.dimensions)
            .map_err(|refusal| invalid_input(&format!("query refused: {refusal}")))?;
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
        let query_bits: Vec<u64> = quantized.bits.chunks_exact(8).map(word_of).collect();
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

fn word_of(bytes: &[u8]) -> u64 {
    u64::from_le_bytes(bytes.try_into().unwrap_or([0; 8]))
}
