//! `vectors.sqlite`: search by meaning. Each file is split into passages (`passage`), each distinct passage
//! text gets one vector from a caller-supplied embedding function, and a search returns only passages their file still holds.
//! Vectors are addressed by the passage's SHA-256, so a rename sends nothing and a killed build resumes without
//! re-asking. Disk holds int8 vectors; a `Searcher` holds one sign bit per component in memory and rescores from int8.

mod nearest;
mod plan;
mod prepare;
mod quantize;
mod words;
mod writer;

pub use nearest::{Found, PassageHit, Searcher, MAX_HITS};
pub use plan::{plan, Plan, Remaining};
pub use prepare::{
    prepare, PrepareError, PrepareProgress, Prepared, MAX_BATCH_BYTES, MAX_BATCH_PASSAGES,
};
pub use quantize::Refusal;

use crate::lifecycle::{
    count_deletion, delete_vectors_locked, deletions, lock_writer, open_store_reader,
    open_store_writer, read_meta, retire_file, try_lock_writer, write_meta, Store, VECTORS_FILE,
};
use crate::passage::PASSAGE_VERSION;
use crate::stamps::now_ns;
use crate::{canonical_vault_root, index_dir, stamp_pass, unix_ms, Error, Result};
use rusqlite::Connection;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

const MAX_DIMENSIONS: usize = 8_192;
const MODEL_NAME_MAX_CHARS: usize = 200;

const VECTORS_TABLES_VERSION: i32 = 2;

pub(crate) const VECTORS: Store = Store {
    file: VECTORS_FILE,
    schema: include_str!("../sql/vectors.sql"),
    version: VECTORS_TABLES_VERSION,
    // A vector row is about 1.1 KB: 4 KiB pages hold three and waste a fifth of the file.
    page_bytes: Some(16 * 1024),
    reset_in_place: true,
};

const META_MODEL: &str = "model";
const META_DIMENSIONS: &str = "dimensions";
const META_PASSAGE_VERSION: &str = "passage_version";
/// Names this file's generation: a writer that finds another value finds a replaced store.
const META_STORE_ID: &str = "store_id";
/// Counts changes to which vectors a file holds (let go, held again, swept); a search reloads its
/// copy of the held ones when it moved.
const META_HELD_CHANGES: &str = "held_changes";
/// Set once the passage rule changed, until a plan of every listed file marks the vectors no
/// passage holds now.
const META_RULE_CHANGED: &str = "rule_changed";
/// Set by the first `prepare` that left nothing pending: from then on, a pass over changed files
/// is an update of a finished store rather than the rest of a first preparation.
const META_COMPLETED: &str = "completed";

/// The embedding model vectors come from. A store holds one model and dimension; preparing with
/// another discards it and starts a new file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Model {
    pub name: String,
    pub dimensions: usize,
}

impl Model {
    fn check(&self) -> Result<()> {
        let chars = self.name.chars().count();
        if chars == 0
            || chars > MODEL_NAME_MAX_CHARS
            || self.name.chars().any(char::is_control)
            || !(1..=MAX_DIMENSIONS).contains(&self.dimensions)
        {
            return Err(invalid_input("a model has a name and 1 to 8192 dimensions"));
        }
        Ok(())
    }

    /// 64-bit words holding one sign bit per dimension.
    fn words(&self) -> usize {
        self.dimensions.div_ceil(64)
    }
}

fn invalid_input(message: &str) -> Error {
    Error::Io(io::Error::new(io::ErrorKind::InvalidInput, message))
}

/// What a store's meta says about its model, or `None` for a file that names none.
fn stored_model(conn: &Connection) -> rusqlite::Result<Option<Model>> {
    let name = read_meta(conn, META_MODEL)?;
    let dimensions = read_meta(conn, META_DIMENSIONS)?.and_then(|value| value.parse().ok());
    Ok(name
        .zip(dimensions)
        .map(|(name, dimensions)| Model { name, dimensions }))
}

fn meta_number(conn: &Connection, key: &str) -> rusqlite::Result<u64> {
    Ok(read_meta(conn, key)?
        .and_then(|value| value.parse().ok())
        .unwrap_or(0))
}

/// Deletions of the whole index folder, of every folder, or of this store alone.
fn deletion_count(dir: &Path) -> i64 {
    deletions(dir) + deletions(&dir.join(VECTORS_FILE))
}

fn now_ms() -> i64 {
    i64::try_from(unix_ms(SystemTime::now())).unwrap_or(i64::MAX)
}

/// Unique per file made: the time, this process and a counter.
fn new_store_id() -> String {
    static MADE: AtomicU64 = AtomicU64::new(0);
    let made = MADE.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{made}", now_ns(), std::process::id())
}

fn count_held_changes(conn: &Connection, changed: u64) -> rusqlite::Result<()> {
    if changed == 0 {
        return Ok(());
    }
    let total = meta_number(conn, META_HELD_CHANGES)?.saturating_add(changed);
    write_meta(conn, META_HELD_CHANGES, &total.to_string())
}

/// The writer for `model` and the store's id, creating, replacing or repairing the file as
/// needed; a file of another model is retired (`retire_file`). The caller holds the writer lock.
fn open_model_writer(dir: &Path, vault_path: &str, model: &Model) -> Result<(Connection, String)> {
    let (mut conn, _) = open_store_writer(dir, &VECTORS, vault_path)?;
    if stored_model(&conn)?.is_some_and(|stored| &stored != model) {
        drop(conn);
        retire_file(dir, &VECTORS, false)?;
        conn = open_store_writer(dir, &VECTORS, vault_path)?.0;
    }
    if stored_model(&conn)?.is_none() {
        // New, or emptied in place by a Delete that could not remove it.
        let tx = conn.transaction()?;
        tx.execute_batch(
            "DELETE FROM passages; DELETE FROM files; DELETE FROM signs; DELETE FROM vectors;",
        )?;
        write_meta(&tx, META_MODEL, &model.name)?;
        write_meta(&tx, META_DIMENSIONS, &model.dimensions.to_string())?;
        write_meta(&tx, META_PASSAGE_VERSION, &PASSAGE_VERSION.to_string())?;
        write_meta(&tx, META_STORE_ID, &new_store_id())?;
        tx.commit()?;
    }
    if meta_number(&conn, META_PASSAGE_VERSION)? != u64::from(PASSAGE_VERSION) {
        forget_every_file(&mut conn)?;
    }
    let store_id = read_meta(&conn, META_STORE_ID)?.unwrap_or_default();
    Ok((conn, store_id))
}

/// After the passage rule changed, every file's passages are read again: file rows go
/// `plan::FORGET_BATCH_FILES` per transaction, and no vector is rewritten. The plan that has read
/// every listed file again marks the vectors no passage holds (`plan`, `META_RULE_CHANGED`).
fn forget_every_file(conn: &mut Connection) -> rusqlite::Result<()> {
    loop {
        let tx = conn.transaction()?;
        let ids: Vec<i64> = tx
            .prepare_cached("SELECT id FROM files LIMIT ?1")?
            .query_map([plan::FORGET_BATCH_FILES as i64], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        for id in &ids {
            tx.prepare_cached("DELETE FROM passages WHERE file_id = ?1")?
                .execute([id])?;
            tx.prepare_cached("DELETE FROM files WHERE id = ?1")?
                .execute([id])?;
        }
        let done = ids.len() < plan::FORGET_BATCH_FILES;
        if done {
            write_meta(&tx, META_PASSAGE_VERSION, &PASSAGE_VERSION.to_string())?;
            write_meta(&tx, META_RULE_CHANGED, "1")?;
        }
        tx.commit()?;
        if done {
            return Ok(());
        }
    }
}

/// Sets a damaged `vectors.sqlite` aside (`retire_file`), so every searcher and build lets it go
/// and the next `plan` rebuilds it; does nothing for any other error. A search does not wait for
/// the writer lock (`wait_for_lock` false): while a build holds it, the next `plan` sets it aside.
fn set_aside_if_damaged(dir: &Path, error: &Error, wait_for_lock: bool) {
    if !error.is_damage() {
        return;
    }
    let lock = if wait_for_lock {
        lock_writer(dir).ok()
    } else {
        try_lock_writer(dir).ok().flatten()
    };
    if let Some(_lock) = lock {
        let _ = retire_file(dir, &VECTORS, true);
    }
}

/// A read connection to the store for `model`, with the canonical root and the index folder.
fn reader(root: &Path, model: &Model) -> Result<Option<(PathBuf, PathBuf, Connection)>> {
    model.check()?;
    let root = canonical_vault_root(root)?;
    let dir = index_dir(&root)?;
    let Some(conn) = open_store_reader(&dir, &VECTORS)? else {
        return Ok(None);
    };
    if stored_model(&conn)?.as_ref() != Some(model) {
        return Ok(None);
    }
    Ok(Some((root, dir, conn)))
}

/// The model the vault's store holds, or `None` while there is none; never creates one. The app
/// asks it before a quiet update, so a folder nobody set up never gets a store.
pub fn store_model(root: &Path) -> Result<Option<Model>> {
    let root = canonical_vault_root(root)?;
    let dir = index_dir(&root)?;
    let Some(conn) = open_store_reader(&dir, &VECTORS)? else {
        return Ok(None);
    };
    Ok(stored_model(&conn)?)
}

/// Whether a `prepare` ever finished this store for `model`; `false` while no store for it exists.
/// The store's own fact, so it goes with the store and survives a restart.
pub fn completed(root: &Path, model: &Model) -> Result<bool> {
    let Some((_, _, conn)) = reader(root, model)? else {
        return Ok(false);
    };
    Ok(read_meta(&conn, META_COMPLETED)?.is_some())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PassageText {
    /// 1-based, inclusive, in the file as written.
    pub line_start: u32,
    pub line_end: u32,
    pub heading: Option<String>,
    pub text: String,
}

/// The passages `prepare` embeds for a file holding `raw`, and how many more it holds past the
/// per-file cap. O(n) in the text's length.
pub fn passages_of(raw: &str) -> (Vec<PassageText>, usize) {
    let (passages, over) = crate::passage::split(raw);
    let texts = passages
        .into_iter()
        .map(|passage| PassageText {
            line_start: passage.line_start,
            line_end: passage.line_end,
            heading: passage.heading,
            text: passage.text,
        })
        .collect();
    (texts, over)
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Status {
    pub files: u64,
    /// Files with every passage stored and none beyond the per-file cap.
    pub files_ready: u64,
    /// Files with more passages than the cap; the rest of each is not prepared.
    pub files_capped: u64,
    /// Distinct passages the files hold, within the cap.
    pub passages: u64,
    pub passages_stored: u64,
    /// Passages beyond the per-file cap, which are never prepared.
    pub passages_not_prepared: u64,
    pub bytes: u64,
}

/// `None` while no store for `model` exists; never creates one. One pass over the passages, each
/// looked up among the vectors: O(p · log n).
pub fn status(root: &Path, model: &Model) -> Result<Option<Status>> {
    let Some((root, _, conn)) = reader(root, model)? else {
        return Ok(None);
    };
    let counts = |sql: &str| -> Result<[u64; 3]> {
        Ok(conn.query_row(sql, [], |row| {
            let count = |index| -> rusqlite::Result<u64> {
                let value: Option<i64> = row.get(index)?;
                Ok(value
                    .and_then(|value| u64::try_from(value).ok())
                    .unwrap_or(0))
            };
            Ok([count(0)?, count(1)?, count(2)?])
        })?)
    };
    let [files, files_capped, passages_not_prepared] =
        counts("SELECT count(*), sum(over_cap > 0), sum(over_cap) FROM files")?;
    let [passages, ..] = counts("SELECT count(DISTINCT sha256), 0, 0 FROM passages")?;
    let [missing, files_missing, _] = counts(
        "SELECT count(DISTINCT p.sha256), count(DISTINCT CASE WHEN f.over_cap = 0 THEN f.id END), 0
           FROM passages AS p JOIN files AS f ON f.id = p.file_id
          WHERE NOT EXISTS (SELECT 1 FROM vectors AS v WHERE v.sha256 = p.sha256)",
    )?;
    Ok(Some(Status {
        files,
        files_ready: files.saturating_sub(files_capped + files_missing),
        files_capped,
        passages,
        passages_stored: passages.saturating_sub(missing),
        passages_not_prepared,
        bytes: vectors_bytes(&root)?,
    }))
}

/// Listed files whose passages changed since the store read them, plus files it holds that are no
/// longer listed: what a `plan` would read again. `None` while no store for `model` exists. O(n)
/// stats; on a volume whose stamps are not trusted, a file with an unchanged stamp is not counted.
pub fn changed_files(root: &Path, model: &Model, files: &[String]) -> Result<Option<usize>> {
    let Some((root, _, conn)) = reader(root, model)? else {
        return Ok(None);
    };
    if files.is_empty() {
        // An empty listing deletes nothing (`plan`), so nothing would be read again.
        return Ok(Some(0));
    }
    let plan = stamp_pass(&conn, &root, files)?;
    Ok(Some(
        plan.work
            .iter()
            .filter(|work| work.racy_sha.is_none())
            .count()
            + plan.removed.len(),
    ))
}

fn dir_for(root: &Path) -> Result<PathBuf> {
    Ok(index_dir(
        &canonical_vault_root(root).unwrap_or_else(|_| root.to_path_buf()),
    )?)
}

/// Bytes on disk for search by meaning: `vectors.sqlite`, its WAL files and any damaged copy set
/// aside; 0 once none is there. Settings shows it on its own row; `stored_bytes` counts it with the
/// rest of the index.
pub fn vectors_bytes(root: &Path) -> Result<u64> {
    let dir = dir_for(root)?;
    Ok(["", "-wal", "-shm", ".damaged"]
        .iter()
        .filter_map(|suffix| std::fs::metadata(dir.join(format!("{VECTORS_FILE}{suffix}"))).ok())
        .map(|meta| meta.len())
        .sum())
}

/// Deletes the vault's `vectors.sqlite` alone, under the writer lock (`retire_file`), with any
/// damaged copy. On every platform, after it `status` is `None`, an open `Searcher` finds nothing,
/// says so and lets its copy go, and a running `prepare` ends with `Deleted`. `vectors_bytes` is
/// 0 where the file could be removed, and an empty file's few pages where another handle kept it
/// (Windows). `crate::delete` removes the whole index together.
pub fn delete_vectors(root: &Path) -> Result<()> {
    let dir = dir_for(root)?;
    count_deletion(Some(&dir.join(VECTORS_FILE)));
    if !dir.exists() {
        return Ok(());
    }
    match lock_writer(&dir) {
        Ok(lock) => Ok(delete_vectors_locked(&dir, lock)?),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}
