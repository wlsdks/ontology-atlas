//! Bringing the store's passage lists in line with the disk, and listing what is left to embed.

use super::prepare::{PrepareProgress, PreparingGuard};
use super::writer::{StoreWriter, WriteError};
use super::{
    count_held_changes, deletion_count, now_ms, open_model_writer, set_aside_if_damaged, Model,
    META_RULE_CHANGED, VECTORS,
};
use crate::lifecycle::{
    clear_meta, delete_locked, holds_index, is_index_folder, open_store_reader, read_meta,
    retire_file, write_meta, WriterLock, META_LAST_USED_MS,
};
use crate::passage::{self, Passage};
use crate::stamps::{now_ns, sha256, Sha, Volume};
use crate::{
    canonical_vault_root, confine, index_dir, lock_index_dir, read_hashing, stamp_pass,
    worker_count, Error, Result, Stamp, Work, TEXT_CAP_BYTES,
};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Files read and then written per transaction.
const REFRESH_BATCH_FILES: usize = 256;
/// Removed files forgotten, or vectors marked after a rule change, per transaction.
pub(super) const FORGET_BATCH_FILES: usize = 1_024;
/// A vector no listed file holds is kept this long, so a branch switch and back sends nothing.
pub(super) const UNHELD_GRACE: Duration = Duration::from_secs(7 * 24 * 60 * 60);
/// Vectors past their grace period deleted per transaction.
const SWEEP_BATCH: i64 = 4_096;

/// Passages still to prepare.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Remaining {
    pub files: u64,
    /// Distinct passages, each sent once however many files hold it.
    pub passages: u64,
    pub chars: u64,
}

/// What `prepare` will send: taken by `plan`, used once.
#[derive(Debug)]
pub struct Plan {
    pub(super) root: PathBuf,
    pub(super) writer: StoreWriter,
    /// Files holding a passage still to prepare: `wiki/` first, then by path.
    pub(super) files: Vec<String>,
    pub(super) pending: HashSet<Sha>,
    pub(super) remaining: Remaining,
}

impl Plan {
    pub fn remaining(&self) -> Remaining {
        self.remaining
    }

    /// In the order `prepare` reads them.
    pub fn files(&self) -> &[String] {
        &self.files
    }
}

struct Pending {
    files: Vec<String>,
    passages: HashSet<Sha>,
    remaining: Remaining,
}

/// Brings the store's passage lists in line with `files` (relative, `/`-separated, the caller's
/// folder walk) and says what is left to prepare. Only changed, new and removed files are read:
/// O(n) stats plus O(changed text). An empty listing removes nothing.
///
/// Creates the store for `model`, replacing one of another model or dimension; a damaged file is
/// set aside and rebuilt by the next plan. The writer lock is taken to open the store and for each
/// write, never while files are stat'ed or read. `progress.request_stop()` ends it with
/// `Error::Cancelled`, and a Delete with `Error::Deleted`.
pub fn plan(
    root: &Path,
    model: &Model,
    files: &[String],
    progress: &PrepareProgress,
) -> Result<Plan> {
    model.check()?;
    let root = canonical_vault_root(root)?;
    let dir = index_dir(&root)?;
    let _one_run = PreparingGuard::take(&dir)?;
    if progress.stopped() {
        return Err(Error::Cancelled);
    }
    let waited_for = deletion_count(&dir);
    #[cfg(feature = "test-hooks")]
    crate::pause::reached(crate::pause::Point::BeforePlanLock, &dir);
    let opened = open_store(&dir, &root, model, waited_for);
    if let Err(error) = &opened {
        set_aside_if_damaged(&dir, error, true);
    }
    let writer = opened?;
    let planned = plan_files(&writer, &root, files, progress);
    if let Err(error) = &planned {
        set_aside_if_damaged(&dir, error, true);
    }
    let pending = planned?;
    Ok(Plan {
        root,
        writer,
        files: pending.files,
        pending: pending.passages,
        remaining: pending.remaining,
    })
}

/// Opens (or makes) the store under the writer lock and releases it before any file is read.
fn open_store(dir: &Path, root: &Path, model: &Model, waited_for: i64) -> Result<StoreWriter> {
    let vault_path = root.to_string_lossy().into_owned();
    let lock = lock_index_dir(dir)?;
    if deletion_count(dir) != waited_for {
        // A Delete ran while this waited for the lock: it stays done.
        leave_no_empty_folder(dir, lock);
        return Err(Error::Deleted);
    }
    let (conn, store_id) = match open_model_writer(dir, &vault_path, model) {
        Err(error) if error.is_damage() => {
            retire_file(dir, &VECTORS, true)?;
            open_model_writer(dir, &vault_path, model)?
        }
        opened => opened?,
    };
    write_meta(&conn, META_LAST_USED_MS, &now_ms().to_string())?;
    drop(conn);
    let writer = StoreWriter {
        dir: dir.to_path_buf(),
        model: model.clone(),
        store_id,
        deletions: deletion_count(dir),
    };
    drop(lock);
    Ok(writer)
}

/// The stamp pass on a read connection, then the reads and writes it calls for, the vectors past
/// their grace period, and what is left to prepare.
fn plan_files(
    writer: &StoreWriter,
    root: &Path,
    files: &[String],
    progress: &PrepareProgress,
) -> Result<Pending> {
    if !files.is_empty() {
        let stamped = {
            let Some(conn) = open_store_reader(&writer.dir, &VECTORS)? else {
                return Err(Error::Deleted);
            };
            let stamped = stamp_pass(&conn, root, files)?;
            Stamped {
                work: stamped.work,
                removed: stamped.removed,
            }
        };
        refresh(writer, root, stamped, progress)?;
        mark_after_rule_change(writer)?;
    }
    sweep_expired(writer, now_ms())?;
    pending(&writer.dir)
}

/// The stamp pass's result.
struct Stamped<'a> {
    work: Vec<Work<'a>>,
    removed: Vec<i64>,
}

/// Once every listed file was read again under a new passage rule, the vectors no passage holds
/// start their grace period: a pass in id order, `FORGET_BATCH_FILES` marked per transaction,
/// which rewrites no other row.
fn mark_after_rule_change(writer: &StoreWriter) -> Result<()> {
    let now = now_ms();
    let mut after = 0i64;
    loop {
        let last = writer.locked(|tx| {
            if read_meta(tx, META_RULE_CHANGED)?.is_none() {
                return Ok(None);
            }
            let ids: Vec<i64> = tx
                .prepare_cached(
                    "SELECT v.id FROM vectors AS v
                      WHERE v.id > ?1 AND v.unheld_since_ms IS NULL
                        AND NOT EXISTS (SELECT 1 FROM passages AS p WHERE p.sha256 = v.sha256)
                      ORDER BY v.id LIMIT ?2",
                )?
                .query_map(params![after, FORGET_BATCH_FILES as i64], |row| row.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            let mut mark =
                tx.prepare_cached("UPDATE vectors SET unheld_since_ms = ?2 WHERE id = ?1")?;
            for id in &ids {
                mark.execute(params![id, now])?;
            }
            count_held_changes(tx, ids.len() as u64)?;
            if ids.len() < FORGET_BATCH_FILES {
                clear_meta(tx, META_RULE_CHANGED)?;
                return Ok(None);
            }
            Ok(ids.last().copied())
        })?;
        match last {
            Some(id) => after = id,
            None => return Ok(()),
        }
    }
}

/// A folder this plan made while it waited, holding no store, goes again.
fn leave_no_empty_folder(dir: &Path, lock: WriterLock) {
    if !holds_index(dir) && is_index_folder(dir) {
        let _ = delete_locked(dir, lock);
    }
}

/// The distinct passages without a vector, and the files that hold them in reading order: wiki
/// pages first, so search improves within minutes. O(p · log n).
fn pending(dir: &Path) -> Result<Pending> {
    let Some(conn) = open_store_reader(dir, &VECTORS)? else {
        return Err(Error::Deleted);
    };
    let mut statement = conn.prepare(
        "SELECT f.path, p.sha256, p.chars FROM passages AS p JOIN files AS f ON f.id = p.file_id
          WHERE NOT EXISTS (SELECT 1 FROM vectors AS v WHERE v.sha256 = p.sha256)",
    )?;
    let mut rows = statement.query([])?;
    let mut files = BTreeSet::new();
    let mut passages = HashSet::new();
    let mut chars = 0u64;
    while let Some(row) = rows.next()? {
        let path: String = row.get(0)?;
        let Ok(sha) = Sha::try_from(row.get_ref(1)?.as_bytes().map_err(rusqlite::Error::from)?)
        else {
            continue;
        };
        if passages.insert(sha) {
            chars = chars.saturating_add(u64::try_from(row.get::<_, i64>(2)?).unwrap_or(0));
        }
        files.insert((!path.starts_with("wiki/"), path));
    }
    let files: Vec<String> = files.into_iter().map(|(_, path)| path).collect();
    Ok(Pending {
        remaining: Remaining {
            files: files.len() as u64,
            passages: passages.len() as u64,
            chars,
        },
        files,
        passages,
    })
}

/// One file as a refresh read it.
enum FileRead {
    Passages {
        stamp: Stamp,
        sha: Sha,
        read_at_ns: i64,
        passages: Vec<(Sha, usize)>,
        over_cap: usize,
    },
    Unchanged {
        read_at_ns: i64,
    },
    Gone,
}

/// The first `TEXT_CAP_BYTES` of an open file and the hash of all of it.
fn read_capped(file: &mut std::fs::File, metadata: &std::fs::Metadata) -> Option<(Vec<u8>, Sha)> {
    let mut text = Vec::with_capacity(
        usize::try_from(metadata.len())
            .unwrap_or(0)
            .min(TEXT_CAP_BYTES),
    );
    let mut hasher = Sha256::new();
    read_hashing(file, &mut text, &mut hasher).ok()?;
    Some((text, sha256(hasher)))
}

/// The passages an admitted file holds now, or `None` once it is gone or not admitted.
pub(super) fn read_passages(root: &Path, relative: &str) -> Option<Vec<Passage>> {
    let (mut file, metadata) = confine::open(root, relative)?;
    let (text, _) = read_capped(&mut file, &metadata)?;
    Some(passage::split(&String::from_utf8_lossy(&text)).0)
}

/// Stamped before reading, so a write during the read leaves a stamp the next pass sees moved.
fn read_file(root: &Path, volume: &Volume, work: &Work) -> FileRead {
    let read_at_ns = now_ns();
    let Some((mut file, metadata)) = confine::open(root, work.path) else {
        return FileRead::Gone;
    };
    let stamp = volume.stamp_open(&file, &metadata);
    let Some((text, sha)) = read_capped(&mut file, &metadata) else {
        return FileRead::Gone;
    };
    if work.racy_sha.as_deref() == Some(sha.as_slice()) {
        return FileRead::Unchanged { read_at_ns };
    }
    let (passages, over_cap) = passage::split(&String::from_utf8_lossy(&text));
    FileRead::Passages {
        stamp,
        sha,
        read_at_ns,
        passages: passages
            .iter()
            .map(|passage| (passage.sha, passage.chars()))
            .collect(),
        over_cap,
    }
}

/// Reads `work` on the background workers, in order.
fn read_all(root: &Path, volume: &Volume, work: &[Work]) -> Vec<FileRead> {
    let chunk = work.len().div_ceil(worker_count()).max(1);
    std::thread::scope(|scope| {
        let handles: Vec<_> = work
            .chunks(chunk)
            .map(|items| {
                let handle = scope.spawn(move || {
                    items
                        .iter()
                        .map(|item| read_file(root, volume, item))
                        .collect::<Vec<_>>()
                });
                (items.len(), handle)
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|(count, handle)| {
                handle
                    .join()
                    .unwrap_or_else(|_| (0..count).map(|_| FileRead::Gone).collect())
            })
            .collect()
    })
}

/// Forgets removed files, then reads changed and new ones `REFRESH_BATCH_FILES` at a time and
/// writes each batch in one transaction. A vector its last file let go starts its grace period
/// in that transaction; one a file holds again leaves it.
fn refresh(
    writer: &StoreWriter,
    root: &Path,
    stamped: Stamped,
    progress: &PrepareProgress,
) -> Result<()> {
    let now = now_ms();
    for ids in stamped.removed.chunks(FORGET_BATCH_FILES) {
        if progress.stopped() {
            return Err(Error::Cancelled);
        }
        writer.locked(|tx| {
            let mut dropped = HashSet::new();
            for id in ids {
                forget_file(tx, *id, &mut dropped)?;
            }
            let marked = mark_unheld(tx, &dropped, now)?;
            count_held_changes(tx, marked)
        })?;
        #[cfg(feature = "test-hooks")]
        crate::pause::reached(crate::pause::Point::AfterPlanBatch, &writer.dir);
    }
    let volume = Volume::of(root);
    for work in stamped.work.chunks(REFRESH_BATCH_FILES) {
        if progress.stopped() {
            return Err(Error::Cancelled);
        }
        let reads = read_all(root, &volume, work);
        writer.locked(|tx| {
            let mut dropped = HashSet::new();
            let mut held_again = 0u64;
            for (item, read) in work.iter().zip(reads) {
                held_again = held_again.saturating_add(write_read(tx, item, read, &mut dropped)?);
            }
            let marked = mark_unheld(tx, &dropped, now)?;
            count_held_changes(tx, marked.saturating_add(held_again))
        })?;
        #[cfg(feature = "test-hooks")]
        crate::pause::reached(crate::pause::Point::AfterPlanBatch, &writer.dir);
    }
    Ok(())
}

/// Deletes one file's rows, remembering its passages for `mark_unheld`.
fn forget_file(tx: &Connection, id: i64, dropped: &mut HashSet<Sha>) -> rusqlite::Result<()> {
    remember_passages(tx, id, dropped)?;
    tx.prepare_cached("DELETE FROM passages WHERE file_id = ?1")?
        .execute([id])?;
    tx.prepare_cached("DELETE FROM files WHERE id = ?1")?
        .execute([id])?;
    Ok(())
}

fn remember_passages(tx: &Connection, id: i64, dropped: &mut HashSet<Sha>) -> rusqlite::Result<()> {
    let mut statement = tx.prepare_cached("SELECT sha256 FROM passages WHERE file_id = ?1")?;
    let mut rows = statement.query([id])?;
    while let Some(row) = rows.next()? {
        if let Ok(sha) = Sha::try_from(row.get_ref(0)?.as_bytes()?) {
            dropped.insert(sha);
        }
    }
    Ok(())
}

/// Starts the grace period of each dropped passage's vector that no file holds now, and says how
/// many. O(d · log n).
fn mark_unheld(tx: &Connection, dropped: &HashSet<Sha>, now: i64) -> rusqlite::Result<u64> {
    let mut held = tx.prepare_cached("SELECT 1 FROM passages WHERE sha256 = ?1 LIMIT 1")?;
    let mut mark = tx.prepare_cached(
        "UPDATE vectors SET unheld_since_ms = ?2 WHERE sha256 = ?1 AND unheld_since_ms IS NULL",
    )?;
    let mut marked = 0u64;
    for sha in dropped {
        if !held.exists([sha.as_slice()])? {
            marked = marked.saturating_add(mark.execute(params![sha.as_slice(), now])? as u64);
        }
    }
    Ok(marked)
}

/// Writes one file's read and says how many vectors its passages hold again.
fn write_read(
    tx: &Connection,
    item: &Work,
    read: FileRead,
    dropped: &mut HashSet<Sha>,
) -> rusqlite::Result<u64> {
    // Looked up now, not taken from the stamp pass: another writer may have run since.
    let row_id: Option<i64> = tx
        .prepare_cached("SELECT id FROM files WHERE path = ?1")?
        .query_row([item.path], |row| row.get(0))
        .optional()?;
    let (stamp, sha, read_at_ns, passages, over_cap) = match read {
        FileRead::Gone => {
            if let Some(id) = row_id {
                forget_file(tx, id, dropped)?;
            }
            return Ok(0);
        }
        FileRead::Unchanged { read_at_ns } => {
            if let Some(id) = row_id {
                tx.prepare_cached("UPDATE files SET read_at_ns = ?2 WHERE id = ?1")?
                    .execute(params![id, read_at_ns])?;
            }
            return Ok(0);
        }
        FileRead::Passages {
            stamp,
            sha,
            read_at_ns,
            passages,
            over_cap,
        } => (stamp, sha, read_at_ns, passages, over_cap),
    };
    let over_cap = i64::try_from(over_cap).unwrap_or(i64::MAX);
    let id = match row_id {
        Some(id) => {
            remember_passages(tx, id, dropped)?;
            tx.prepare_cached("DELETE FROM passages WHERE file_id = ?1")?
                .execute([id])?;
            tx.prepare_cached(
                "UPDATE files SET mtime_ns = ?2, size = ?3, ctime_ns = ?4, read_at_ns = ?5,
                        sha256 = ?6, over_cap = ?7 WHERE id = ?1",
            )?
            .execute(params![
                id,
                stamp.mtime_ns,
                stamp.size,
                stamp.ctime_ns,
                read_at_ns,
                sha.as_slice(),
                over_cap
            ])?;
            id
        }
        None => {
            tx.prepare_cached(
                "INSERT INTO files(path, mtime_ns, size, ctime_ns, read_at_ns, sha256, over_cap)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )?
            .execute(params![
                item.path,
                stamp.mtime_ns,
                stamp.size,
                stamp.ctime_ns,
                read_at_ns,
                sha.as_slice(),
                over_cap
            ])?;
            tx.last_insert_rowid()
        }
    };
    let mut insert = tx.prepare_cached(
        "INSERT OR IGNORE INTO passages(file_id, sha256, chars) VALUES (?1, ?2, ?3)",
    )?;
    let mut held_again = tx.prepare_cached(
        "UPDATE vectors SET unheld_since_ms = NULL WHERE sha256 = ?1 AND unheld_since_ms IS NOT NULL",
    )?;
    let mut again = 0u64;
    for (sha, chars) in passages {
        insert.execute(params![
            id,
            sha.as_slice(),
            i64::try_from(chars).unwrap_or(i64::MAX)
        ])?;
        again = again.saturating_add(held_again.execute([sha.as_slice()])? as u64);
    }
    Ok(again)
}

/// Deletes vectors no file has held for `UNHELD_GRACE`, one transaction per `SWEEP_BATCH`,
/// through the index on `unheld_since_ms`: O(e · log n) for e expired, even when nothing is
/// pending.
fn sweep_expired(writer: &StoreWriter, now: i64) -> std::result::Result<(), WriteError> {
    while writer.locked(|tx| sweep_batch(tx, now))? == SWEEP_BATCH {}
    Ok(())
}

/// One batch of `sweep_expired`; returns how many went.
fn sweep_batch(tx: &Connection, now: i64) -> rusqlite::Result<i64> {
    let grace = i64::try_from(UNHELD_GRACE.as_millis()).unwrap_or(i64::MAX);
    let ids: Vec<i64> = tx
        .prepare_cached(
            "SELECT id FROM vectors WHERE unheld_since_ms IS NOT NULL AND unheld_since_ms <= ?1
              LIMIT ?2",
        )?
        .query_map(params![now.saturating_sub(grace), SWEEP_BATCH], |row| {
            row.get(0)
        })?
        .collect::<rusqlite::Result<_>>()?;
    let mut signs = tx.prepare_cached("DELETE FROM signs WHERE id = ?1")?;
    let mut vectors = tx.prepare_cached("DELETE FROM vectors WHERE id = ?1")?;
    for id in &ids {
        signs.execute([id])?;
        vectors.execute([id])?;
    }
    let deleted = ids.len() as u64;
    count_held_changes(tx, deleted)?;
    Ok(ids.len() as i64)
}
