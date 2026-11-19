//! Sending planned passages to the embedding function and storing what comes back, one batch at
//! a time.

use super::plan::{delete_unheld, read_passages, Plan};
use super::quantize::{check_vectors, Quantized, Refusal};
use super::{deletion_count, stored_model};
use crate::lifecycle::{
    clear_meta, configure, lock_writer, open_flags, write_meta, META_WRITING, VECTORS_FILE,
};
use crate::stamps::Sha;
use crate::Error;
use rusqlite::{params, Connection, Transaction};
use std::collections::VecDeque;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

/// The embedding client's limits for one request.
pub const MAX_BATCH_PASSAGES: usize = 32;
pub const MAX_BATCH_BYTES: usize = 64 * 1024;

/// Shared between a running `prepare` and whoever reports on it.
#[derive(Debug, Default)]
pub struct PrepareProgress {
    files_done: AtomicU64,
    files_total: AtomicU64,
    passages_done: AtomicU64,
    passages_total: AtomicU64,
    reading: Mutex<String>,
    stop: AtomicBool,
}

impl PrepareProgress {
    /// Plan files whose every passage this run sent is stored.
    pub fn files_done(&self) -> u64 {
        self.files_done.load(Ordering::Relaxed)
    }
    pub fn files_total(&self) -> u64 {
        self.files_total.load(Ordering::Relaxed)
    }
    /// Passages sent and stored by this run.
    pub fn passages_done(&self) -> u64 {
        self.passages_done.load(Ordering::Relaxed)
    }
    pub fn passages_total(&self) -> u64 {
        self.passages_total.load(Ordering::Relaxed)
    }
    /// The file being read now, relative to the vault root.
    pub fn reading(&self) -> String {
        self.reading
            .lock()
            .map(|path| path.clone())
            .unwrap_or_default()
    }
    /// Stops `prepare` before its next batch is sent; every batch already sent is stored.
    pub fn request_stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
    fn stopped(&self) -> bool {
        self.stop.load(Ordering::Relaxed)
    }
    fn set_reading(&self, path: &str) {
        if let Ok(mut reading) = self.reading.lock() {
            reading.clear();
            reading.push_str(path);
        }
    }
}

#[derive(Debug)]
pub enum PrepareError<E> {
    /// The store failed; `Error::is_damage` says whether a new `plan` rebuilds it.
    Index(Error),
    /// The embedding function failed; nothing from that batch was stored.
    Embed(E),
    Refused(Refusal),
    /// `PrepareProgress::request_stop`; every batch already sent is stored.
    Stopped,
    /// The store was deleted, switched off or replaced by another model's while preparing; nothing
    /// more was written.
    Deleted,
}

impl<E> From<Error> for PrepareError<E> {
    fn from(error: Error) -> Self {
        PrepareError::Index(error)
    }
}

impl<E> From<rusqlite::Error> for PrepareError<E> {
    fn from(error: rusqlite::Error) -> Self {
        PrepareError::Index(Error::Sql(error))
    }
}

impl<E: std::fmt::Display> std::fmt::Display for PrepareError<E> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PrepareError::Index(error) => error.fmt(f),
            PrepareError::Embed(error) => write!(f, "search by meaning: {error}"),
            PrepareError::Refused(refusal) => write!(f, "search by meaning refused {refusal}"),
            PrepareError::Stopped => f.write_str("search by meaning: stopped"),
            PrepareError::Deleted => f.write_str("search by meaning: deleted while preparing"),
        }
    }
}

impl<E: std::fmt::Debug + std::fmt::Display> std::error::Error for PrepareError<E> {}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Prepared {
    pub files: u64,
    pub passages: u64,
    /// Planned passages their file no longer held when read; the next `plan` sees the change.
    pub changed: u64,
}

type Outcome<T, E> = std::result::Result<T, PrepareError<E>>;

/// Folders a `prepare` in this process is running for: one build per folder.
static PREPARING: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

struct PreparingGuard(PathBuf);

impl PreparingGuard {
    fn take(dir: &Path) -> crate::Result<PreparingGuard> {
        let mut running = PREPARING
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if running.iter().any(|folder| folder == dir) {
            return Err(Error::Io(io::Error::new(
                io::ErrorKind::ResourceBusy,
                "search by meaning is already being prepared for this folder",
            )));
        }
        running.push(dir.to_path_buf());
        Ok(PreparingGuard(dir.to_path_buf()))
    }
}

impl Drop for PreparingGuard {
    fn drop(&mut self) {
        PREPARING
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .retain(|folder| folder != &self.0);
    }
}

/// One batch on its way to the embedding function.
#[derive(Default)]
struct Batch {
    passages: Vec<(Sha, String)>,
    bytes: usize,
}

impl Batch {
    fn has_room_for(&self, text: &str) -> bool {
        self.passages.len() < MAX_BATCH_PASSAGES && self.bytes + text.len() <= MAX_BATCH_BYTES
    }
}

/// Embeds every passage in `plan` that its file still holds, in batches of at most
/// `MAX_BATCH_PASSAGES` and `MAX_BATCH_BYTES`, one at a time, committing each before the next is
/// sent. A stop or a kill loses at most the batch in flight; nothing stored is asked for again.
/// Wiki pages go first. Searches read beside it; the writer lock is held only while a batch is
/// written, so the search index's own build and a Delete never wait for the embedding function.
pub fn prepare<E>(
    mut plan: Plan,
    progress: &PrepareProgress,
    mut embed: impl FnMut(&[&str]) -> std::result::Result<Vec<Vec<f32>>, E>,
) -> Outcome<Prepared, E> {
    let _one_build = PreparingGuard::take(&plan.dir)?;
    progress.stop.store(false, Ordering::Relaxed);
    progress.files_done.store(0, Ordering::Relaxed);
    progress.passages_done.store(0, Ordering::Relaxed);
    progress
        .files_total
        .store(plan.remaining.files, Ordering::Relaxed);
    progress
        .passages_total
        .store(plan.remaining.passages, Ordering::Relaxed);
    if plan.pending.is_empty() {
        return Ok(Prepared::default());
    }
    let mut writer = Writer::open(&plan)?;
    writer.locked(&plan, |tx| {
        write_meta(tx, META_WRITING, &std::process::id().to_string())
    })?;
    let outcome = prepare_files(&mut plan, &mut writer, progress, &mut embed);
    let finished = match outcome {
        Ok(_) => writer.locked(&plan, |tx| {
            delete_unheld(tx, None)?;
            clear_meta(tx, META_WRITING)
        }),
        Err(PrepareError::Deleted) => Ok(()),
        Err(_) => writer.locked(&plan, |tx| clear_meta(tx, META_WRITING)),
    };
    match (outcome, finished) {
        (Ok(prepared), Ok(())) => Ok(prepared),
        (Ok(_), Err(error)) | (Err(error), _) => Err(error),
    }
}

fn prepare_files<E>(
    plan: &mut Plan,
    writer: &mut Writer,
    progress: &PrepareProgress,
    embed: &mut impl FnMut(&[&str]) -> std::result::Result<Vec<Vec<f32>>, E>,
) -> Outcome<Prepared, E> {
    let mut report = Prepared::default();
    let mut batch = Batch::default();
    // The queue position each read file's last passage reached; done once that many are stored.
    let mut file_ends: VecDeque<u64> = VecDeque::new();
    let (mut queued, mut stored) = (0u64, 0u64);
    let files = std::mem::take(&mut plan.files);
    for path in &files {
        if progress.stopped() {
            return Err(PrepareError::Stopped);
        }
        progress.set_reading(path);
        for passage in read_passages(&plan.root, path).unwrap_or_default() {
            if !plan.pending.remove(&passage.sha) {
                continue;
            }
            if !batch.has_room_for(&passage.text) {
                stored += send(&mut batch, writer, plan, progress, embed)?;
                count_done_files(&mut file_ends, stored, progress, &mut report);
            }
            batch.bytes += passage.text.len();
            batch.passages.push((passage.sha, passage.text));
            queued += 1;
        }
        file_ends.push_back(queued);
        count_done_files(&mut file_ends, stored, progress, &mut report);
    }
    if !batch.passages.is_empty() {
        stored += send(&mut batch, writer, plan, progress, embed)?;
        count_done_files(&mut file_ends, stored, progress, &mut report);
    }
    report.passages = stored;
    report.changed = plan.pending.len() as u64;
    Ok(report)
}

fn count_done_files(
    file_ends: &mut VecDeque<u64>,
    stored: u64,
    progress: &PrepareProgress,
    report: &mut Prepared,
) {
    while file_ends.front().is_some_and(|&end| end <= stored) {
        file_ends.pop_front();
        report.files += 1;
        progress.files_done.fetch_add(1, Ordering::Relaxed);
    }
}

/// Sends one batch and stores its vectors; returns how many were stored.
fn send<E>(
    batch: &mut Batch,
    writer: &mut Writer,
    plan: &Plan,
    progress: &PrepareProgress,
    embed: &mut impl FnMut(&[&str]) -> std::result::Result<Vec<Vec<f32>>, E>,
) -> Outcome<u64, E> {
    if progress.stopped() {
        return Err(PrepareError::Stopped);
    }
    let passages = std::mem::take(&mut batch.passages);
    batch.bytes = 0;
    let texts: Vec<&str> = passages.iter().map(|(_, text)| text.as_str()).collect();
    let vectors = embed(&texts).map_err(PrepareError::Embed)?;
    let quantized = check_vectors(&vectors, passages.len(), plan.model.dimensions)
        .map_err(PrepareError::Refused)?;
    writer.store(plan, passages.iter().map(|(sha, _)| sha).zip(&quantized))?;
    let count = passages.len() as u64;
    progress.passages_done.fetch_add(count, Ordering::Relaxed);
    Ok(count)
}

/// `prepare`'s connection. It stays open between batches, but every write happens under the
/// folder's writer lock and only while no Delete has run since the plan was taken.
struct Writer {
    conn: Connection,
    dir: PathBuf,
}

impl Writer {
    fn open<E>(plan: &Plan) -> Outcome<Writer, E> {
        let path = plan.dir.join(VECTORS_FILE);
        if deletion_count(&plan.dir) != plan.deletions || !path.is_file() {
            return Err(PrepareError::Deleted);
        }
        let conn = Connection::open_with_flags(&path, open_flags())?;
        configure(&conn)?;
        Ok(Writer {
            conn,
            dir: plan.dir.clone(),
        })
    }

    /// Runs `write` in one transaction under the writer lock, or answers `Deleted`.
    fn locked<E, T>(
        &mut self,
        plan: &Plan,
        write: impl FnOnce(&Transaction) -> rusqlite::Result<T>,
    ) -> Outcome<T, E> {
        let _lock = match lock_writer(&self.dir) {
            Ok(lock) => lock,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Err(PrepareError::Deleted)
            }
            Err(error) => return Err(Error::Io(error).into()),
        };
        if deletion_count(&self.dir) != plan.deletions {
            return Err(PrepareError::Deleted);
        }
        let tx = self.conn.transaction()?;
        if stored_model(&tx)?.as_ref() != Some(&plan.model) {
            return Err(PrepareError::Deleted);
        }
        let written = write(&tx)?;
        tx.commit()?;
        Ok(written)
    }

    fn store<'q, E>(
        &mut self,
        plan: &Plan,
        vectors: impl Iterator<Item = (&'q Sha, &'q Quantized)>,
    ) -> Outcome<(), E> {
        self.locked(plan, |tx| {
            let mut insert = tx.prepare_cached(
                "INSERT OR IGNORE INTO vectors(sha256, scale, int8) VALUES (?1, ?2, ?3)",
            )?;
            let mut signs = tx.prepare_cached("INSERT INTO signs(id, bits) VALUES (?1, ?2)")?;
            for (sha, vector) in vectors {
                if insert.execute(params![sha.as_slice(), vector.scale, vector.int8])? == 1 {
                    signs.execute(params![tx.last_insert_rowid(), vector.bits])?;
                }
            }
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_batch_closes_at_thirty_two_passages_or_sixty_four_kib() {
        let mut batch = Batch::default();
        for _ in 0..MAX_BATCH_PASSAGES {
            assert!(batch.has_room_for("a"));
            batch.passages.push(([0; 32], "a".into()));
        }
        assert!(!batch.has_room_for("a"));
        let wide = Batch {
            passages: vec![([0; 32], String::new())],
            bytes: MAX_BATCH_BYTES - 3,
        };
        assert!(wide.has_room_for("abc"));
        assert!(!wide.has_room_for("abcd"));
    }
}
