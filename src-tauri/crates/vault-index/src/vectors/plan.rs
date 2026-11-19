//! Bringing the store's passage lists in line with the disk, and listing what is left to embed.

use super::{deletion_count, meta_number, open_model_writer, Model, META_DELETED_VECTORS};
use crate::lifecycle::{is_damage, set_aside_file, write_meta, META_LAST_USED_MS, VECTORS_FILE};
use crate::passage::{self, Passage};
use crate::stamps::{now_ns, sha256, Sha, Volume};
use crate::{
    canonical_vault_root, confine, index_dir, lock_index_dir, read_hashing, stamp_pass, unix_ms,
    worker_count, Error, Result, Stamp, Work, TEXT_CAP_BYTES,
};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Files read and written per refresh transaction.
const REFRESH_BATCH_FILES: usize = 256;

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
    pub(super) dir: PathBuf,
    pub(super) model: Model,
    /// Files holding a passage still to prepare: `wiki/` first, then by path.
    pub(super) files: Vec<String>,
    pub(super) pending: HashSet<Sha>,
    pub(super) remaining: Remaining,
    /// Deletions seen when the plan was taken; a later one stops `prepare`.
    pub(super) deletions: i64,
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
/// O(n) stats plus O(changed text). Creates the store for `model`, replacing one of another model
/// or dimension; a damaged file is set aside and rebuilt. Holds the writer lock throughout.
pub fn plan(root: &Path, model: &Model, files: &[String]) -> Result<Plan> {
    model.check()?;
    let root = canonical_vault_root(root)?;
    let dir = index_dir(&root)?;
    let deletions = deletion_count(&dir);
    let _lock = lock_index_dir(&dir)?;
    let vault_path = root.to_string_lossy();
    let pending = match plan_locked(&dir, &vault_path, &root, model, files) {
        Err(Error::Sql(error)) if is_damage(&error) => {
            set_aside_file(&dir, VECTORS_FILE)?;
            plan_locked(&dir, &vault_path, &root, model, files)?
        }
        planned => planned?,
    };
    Ok(Plan {
        root,
        dir,
        model: model.clone(),
        files: pending.files,
        pending: pending.passages,
        remaining: pending.remaining,
        deletions,
    })
}

fn plan_locked(
    dir: &Path,
    vault_path: &str,
    root: &Path,
    model: &Model,
    files: &[String],
) -> Result<Pending> {
    let mut conn = open_model_writer(dir, vault_path, model)?;
    write_meta(
        &conn,
        META_LAST_USED_MS,
        &unix_ms(SystemTime::now()).to_string(),
    )?;
    refresh(&mut conn, root, files)?;
    pending(&conn)
}

/// The distinct passages without a vector, and the files that hold them in reading order: wiki
/// pages first, so search improves within minutes. O(p · log n).
fn pending(conn: &Connection) -> Result<Pending> {
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

/// The stamp pass, then the passage lists of every changed, new and removed file, committed per
/// `REFRESH_BATCH_FILES`. Vectors no file holds any more are deleted at the end, so a rename that
/// removes one path and adds another keeps them.
fn refresh(conn: &mut Connection, root: &Path, files: &[String]) -> Result<()> {
    let plan = stamp_pass(conn, root, files)?;
    let volume = Volume::of(root);
    let mut dropped: HashSet<Sha> = HashSet::new();
    {
        let tx = conn.transaction()?;
        for id in &plan.removed {
            forget_file(&tx, *id, &mut dropped)?;
        }
        tx.commit()?;
    }
    for work in plan.work.chunks(REFRESH_BATCH_FILES) {
        let reads = read_all(root, &volume, work);
        let tx = conn.transaction()?;
        for (item, read) in work.iter().zip(reads) {
            write_read(&tx, item, read, &mut dropped)?;
        }
        tx.commit()?;
    }
    if !dropped.is_empty() {
        let tx = conn.transaction()?;
        delete_unheld(&tx, Some(&dropped))?;
        tx.commit()?;
    }
    Ok(())
}

/// Deletes one file's rows, remembering its passages for the vector sweep.
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

fn write_read(
    tx: &Connection,
    item: &Work,
    read: FileRead,
    dropped: &mut HashSet<Sha>,
) -> rusqlite::Result<()> {
    let (stamp, sha, read_at_ns, passages, over_cap) = match read {
        FileRead::Gone => {
            if let Some(id) = item.row_id {
                forget_file(tx, id, dropped)?;
            }
            return Ok(());
        }
        FileRead::Unchanged { read_at_ns } => {
            if let Some(id) = item.row_id {
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
    let id = match item.row_id {
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
    for (sha, chars) in passages {
        insert.execute(params![
            id,
            sha.as_slice(),
            i64::try_from(chars).unwrap_or(i64::MAX)
        ])?;
    }
    Ok(())
}

/// Deletes vectors no file holds: those among `candidates`, O(c · log n), or every one when
/// `None`, O(n · log n). Returns how many went.
pub(super) fn delete_unheld(
    tx: &Connection,
    candidates: Option<&HashSet<Sha>>,
) -> rusqlite::Result<u64> {
    let unheld: Vec<i64> = match candidates {
        Some(candidates) => {
            let mut held = tx.prepare_cached("SELECT 1 FROM passages WHERE sha256 = ?1 LIMIT 1")?;
            let mut find = tx.prepare_cached("SELECT id FROM vectors WHERE sha256 = ?1")?;
            let mut unheld = Vec::new();
            for sha in candidates {
                if held.exists([sha.as_slice()])? {
                    continue;
                }
                if let Some(id) = find
                    .query_row([sha.as_slice()], |row| row.get(0))
                    .optional()?
                {
                    unheld.push(id);
                }
            }
            unheld
        }
        None => {
            let mut statement = tx.prepare(
                "SELECT v.id FROM vectors AS v
                  WHERE NOT EXISTS (SELECT 1 FROM passages AS p WHERE p.sha256 = v.sha256)",
            )?;
            let ids = statement
                .query_map([], |row| row.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            ids
        }
    };
    {
        let mut signs = tx.prepare_cached("DELETE FROM signs WHERE id = ?1")?;
        let mut vectors = tx.prepare_cached("DELETE FROM vectors WHERE id = ?1")?;
        for id in &unheld {
            signs.execute([id])?;
            vectors.execute([id])?;
        }
    }
    let deleted = unheld.len() as u64;
    if deleted > 0 {
        let total = meta_number(tx, META_DELETED_VECTORS)? + deleted;
        write_meta(tx, META_DELETED_VECTORS, &total.to_string())?;
    }
    Ok(deleted)
}
