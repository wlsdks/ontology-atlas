//! `vectors.sqlite`: search by meaning. Each Markdown file is split into passages (`passage`),
//! each distinct passage text gets one vector from a caller-supplied embedding function, and a
//! search ranks passages by a query vector and returns only those their file still holds.
//!
//! Vectors are content-addressed by the passage's SHA-256, so a rename or a move sends nothing and
//! a stopped or killed build resumes without asking for a stored passage again. Disk holds int8
//! vectors; a `Searcher` holds one sign bit per component in memory for the first pass and
//! rescores its short list from the int8 rows. The crate never learns where vectors come from.

mod nearest;
mod plan;
mod prepare;
mod quantize;

pub use nearest::{Found, PassageHit, Searcher};
pub use plan::{plan, Plan, Remaining};
pub use prepare::{
    prepare, PrepareError, PrepareProgress, Prepared, MAX_BATCH_BYTES, MAX_BATCH_PASSAGES,
};
pub use quantize::Refusal;

use crate::lifecycle::{
    count_deletion, delete_vectors_locked, deletions, discard_file, lock_writer, open_store_reader,
    open_store_writer, read_meta, write_meta, Store, VECTORS_FILE,
};
use crate::passage::PASSAGE_VERSION;
use crate::{canonical_vault_root, index_dir, stamp_pass, Error, Result};
use rusqlite::Connection;
use std::io;
use std::path::{Path, PathBuf};

const MAX_DIMENSIONS: usize = 8_192;
const MODEL_NAME_MAX_CHARS: usize = 200;

const VECTORS_TABLES_VERSION: i32 = 1;

pub(crate) const VECTORS: Store = Store {
    file: VECTORS_FILE,
    schema: include_str!("../sql/vectors.sql"),
    version: VECTORS_TABLES_VERSION,
};

const META_MODEL: &str = "model";
const META_DIMENSIONS: &str = "dimensions";
const META_PASSAGE_VERSION: &str = "passage_version";
/// Vectors deleted since the file was made; a search reloads its copy once many are gone.
const META_DELETED_VECTORS: &str = "deleted_vectors";

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

/// The writer for `model`, creating, replacing or repairing the file as needed. The caller holds
/// the writer lock.
fn open_model_writer(dir: &Path, vault_path: &str, model: &Model) -> Result<Connection> {
    let (mut conn, repair) = open_store_writer(dir, &VECTORS, vault_path)?;
    if !repair.created && stored_model(&conn)?.as_ref() != Some(model) {
        drop(conn);
        discard_file(dir, VECTORS_FILE)?;
        conn = open_store_writer(dir, &VECTORS, vault_path)?.0;
    }
    if stored_model(&conn)?.is_none() {
        let tx = conn.transaction()?;
        write_meta(&tx, META_MODEL, &model.name)?;
        write_meta(&tx, META_DIMENSIONS, &model.dimensions.to_string())?;
        write_meta(&tx, META_PASSAGE_VERSION, &PASSAGE_VERSION.to_string())?;
        tx.commit()?;
    }
    if meta_number(&conn, META_PASSAGE_VERSION)? != u64::from(PASSAGE_VERSION) {
        // Passage lists are read again under the new rule; vectors of unchanged text stay.
        let tx = conn.transaction()?;
        tx.execute_batch("DELETE FROM passages; DELETE FROM files;")?;
        write_meta(&tx, META_PASSAGE_VERSION, &PASSAGE_VERSION.to_string())?;
        tx.commit()?;
    }
    Ok(conn)
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

/// What the store holds for one vault and model.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Status {
    /// Files whose passages the store knows.
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
    /// `vectors.sqlite` and its WAL files.
    pub bytes: u64,
}

/// `None` while no store for `model` exists; never creates one. O(p · log n) for p passages.
pub fn status(root: &Path, model: &Model) -> Result<Option<Status>> {
    let Some((root, _, conn)) = reader(root, model)? else {
        return Ok(None);
    };
    let count = |sql: &str| -> Result<u64> {
        let value: Option<i64> = conn.query_row(sql, [], |row| row.get(0))?;
        Ok(value
            .and_then(|value| u64::try_from(value).ok())
            .unwrap_or(0))
    };
    Ok(Some(Status {
        files: count("SELECT count(*) FROM files")?,
        files_ready: count(
            "SELECT count(*) FROM files AS f WHERE f.over_cap = 0 AND NOT EXISTS (
               SELECT 1 FROM passages AS p WHERE p.file_id = f.id
                  AND NOT EXISTS (SELECT 1 FROM vectors AS v WHERE v.sha256 = p.sha256))",
        )?,
        files_capped: count("SELECT count(*) FROM files WHERE over_cap > 0")?,
        passages: count("SELECT count(DISTINCT sha256) FROM passages")?,
        passages_stored: count(
            "SELECT count(*) FROM vectors AS v
              WHERE EXISTS (SELECT 1 FROM passages AS p WHERE p.sha256 = v.sha256)",
        )?,
        passages_not_prepared: count("SELECT sum(over_cap) FROM files")?,
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

/// `vectors.sqlite` and its WAL files, in bytes; 0 when the vault has none. Settings shows it on
/// its own row; `stored_bytes` counts it with the rest of the index.
pub fn vectors_bytes(root: &Path) -> Result<u64> {
    let dir = dir_for(root)?;
    Ok(["", "-wal", "-shm"]
        .iter()
        .filter_map(|suffix| std::fs::metadata(dir.join(format!("{VECTORS_FILE}{suffix}"))).ok())
        .map(|meta| meta.len())
        .sum())
}

/// Deletes the vault's `vectors.sqlite` alone, under the writer lock; a `prepare` running for it
/// stops before its next write, and an open `Searcher` answers an error. The search index and
/// rows stay; `crate::delete` removes everything together.
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
