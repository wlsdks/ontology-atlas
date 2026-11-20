//! Bringing the store's passage lists in line with the disk, and listing what is left to embed.

use super::prepare::{PrepareProgress, PreparingGuard};
use super::writer::{deleted, StoreWriter, WriteError};
use super::{
    deletion_count, meta_number, now_ms, open_model_writer, set_aside_if_damaged, Model,
    META_DELETED_VECTORS, VECTORS,
};
use crate::lifecycle::{
    count_deletion, delete_locked, holds_index, is_damage, is_index_folder, open_store_reader,
    set_aside_file, write_meta, WriterLock, META_LAST_USED_MS, VECTORS_FILE,
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
/// Removed files forgotten per transaction.
const FORGET_BATCH_FILES: usize = 1_024;
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
/// set aside and rebuilt. Files are read without the writer lock, which is taken for each write.
/// `progress.request_stop()` ends it with `Error::Cancelled`; a Delete with a `NotFound` error.
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
    crate::pause::reached_plan_lock(&dir);
    let vault_path = root.to_string_lossy().into_owned();
    let (writer, stamped) = {
        let lock = lock_index_dir(&dir)?;
        if deletion_count(&dir) != waited_for {
            // A Delete ran while this waited for the lock: it stays done.
            leave_no_empty_folder(&dir, lock);
            return Err(deleted());
        }
        let opened = match open_locked(&dir, &vault_path, &root, model, files) {
            Err(Error::Sql(error)) if is_damage(&error) => {
                count_deletion(Some(&dir.join(VECTORS_FILE)));
                set_aside_file(&dir, VECTORS_FILE)?;
                open_locked(&dir, &vault_path, &root, model, files)?
            }
            opened => opened?,
        };
        let (store_id, stamped) = opened;
        let writer = StoreWriter {
            dir: dir.clone(),
            model: model.clone(),
            store_id,
            deletions: deletion_count(&dir),
        };
        (writer, stamped)
    };
    let refreshed = refresh(&writer, &root, stamped, progress)
        .and_then(|()| Ok(sweep_expired(&writer, now_ms())?));
    if let Err(error) = &refreshed {
        set_aside_if_damaged(&dir, error);
    }
    refreshed?;
    let pending = pending(&dir)?;
    Ok(Plan {
        root,
        writer,
        files: pending.files,
        pending: pending.passages,
        remaining: pending.remaining,
    })
}

/// The stamp pass's result, kept after the lock is released.
struct Stamped<'a> {
    work: Vec<Work<'a>>,
    removed: Vec<i64>,
}

/// Opens (or makes) the store under the writer lock and compares every listed file's stamp.
fn open_locked<'a>(
    dir: &Path,
    vault_path: &str,
    root: &Path,
    model: &Model,
    files: &'a [String],
) -> Result<(String, Stamped<'a>)> {
    let (conn, store_id) = open_model_writer(dir, vault_path, model)?;
    write_meta(&conn, META_LAST_USED_MS, &now_ms().to_string())?;
    if files.is_empty() {
        let none = Stamped {
            work: Vec::new(),
            removed: Vec::new(),
        };
        return Ok((store_id, none));
    }
    let plan = stamp_pass(&conn, root, files)?;
    Ok((
        store_id,
        Stamped {
            work: plan.work,
            removed: plan.removed,
        },
    ))
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
        return Err(deleted());
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
            chars += u64::try_from(row.get::<_, i64>(2)?).unwrap_or(0);
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
            mark_unheld(tx, &dropped, now)
        })?;
    }
    let volume = Volume::of(root);
    for work in stamped.work.chunks(REFRESH_BATCH_FILES) {
        if progress.stopped() {
            return Err(Error::Cancelled);
        }
        let reads = read_all(root, &volume, work);
        writer.locked(|tx| {
            let mut dropped = HashSet::new();
            for (item, read) in work.iter().zip(reads) {
                write_read(tx, item, read, &mut dropped)?;
            }
            mark_unheld(tx, &dropped, now)
        })?;
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

/// Starts the grace period of each dropped passage's vector that no file holds now. O(d · log n).
fn mark_unheld(tx: &Connection, dropped: &HashSet<Sha>, now: i64) -> rusqlite::Result<()> {
    let mut held = tx.prepare_cached("SELECT 1 FROM passages WHERE sha256 = ?1 LIMIT 1")?;
    let mut mark = tx.prepare_cached(
        "UPDATE vectors SET unheld_since_ms = ?2 WHERE sha256 = ?1 AND unheld_since_ms IS NULL",
    )?;
    for sha in dropped {
        if !held.exists([sha.as_slice()])? {
            mark.execute(params![sha.as_slice(), now])?;
        }
    }
    Ok(())
}

fn write_read(
    tx: &Connection,
    item: &Work,
    read: FileRead,
    dropped: &mut HashSet<Sha>,
) -> rusqlite::Result<()> {
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
            return Ok(());
        }
        FileRead::Unchanged { read_at_ns } => {
            if let Some(id) = row_id {
                tx.prepare_cached("UPDATE files SET read_at_ns = ?2 WHERE id = ?1")?
                    .execute(params![id, read_at_ns])?;
            }
            return Ok(());
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
    for (sha, chars) in passages {
        insert.execute(params![
            id,
            sha.as_slice(),
            i64::try_from(chars).unwrap_or(i64::MAX)
        ])?;
        held_again.execute([sha.as_slice()])?;
    }
    Ok(())
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
    if deleted > 0 {
        let total = meta_number(tx, META_DELETED_VECTORS)? + deleted;
        write_meta(tx, META_DELETED_VECTORS, &total.to_string())?;
    }
    Ok(ids.len() as i64)
}
