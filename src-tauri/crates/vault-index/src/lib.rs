//! A rebuildable full-text index of a vault's Markdown files, kept per vault in the OS cache
//! directory. The vault files are the only truth: the index holds only what can be recomputed from
//! them, every row carries the stamp of the file it came from, and deleting it changes no answer.
//! The crate never interprets frontmatter; the caller's folder walk lists the files, and the crate
//! itself admits only `.md` files under the root that are reached without a symlink or dot-name
//! (`confine`).

mod confine;
mod lifecycle;
mod location;
mod search;
mod segment;
mod stamps;

use lifecycle::{
    clear_meta, create_index_dir, is_damage, lock_writer, open_reader, open_writer,
    quick_check_passes, set_aside, write_meta, META_LAST_USED_MS, META_WRITING,
};
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use stamps::{is_racy, now_ns, sha256, Sha};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{sync_channel, Receiver};
use std::time::{Duration, Instant, SystemTime};

pub use lifecycle::Repair;
pub use location::{
    canonical_vault_root, index_dir, index_dir_override_honoured, indexes_root, vault_key,
    INDEX_DIR_OVERRIDE_ENV,
};
pub use search::{Found, Hit};
pub use stamps::Stamp;

#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    Sql(rusqlite::Error),
    /// `Progress::request_cancel` stopped the build; what was committed stays consistent.
    Cancelled,
}

impl Error {
    /// The file is damaged; `set_aside_damaged` and a new `sync` rebuild it.
    pub fn is_damage(&self) -> bool {
        matches!(self, Error::Sql(error) if is_damage(error))
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Io(error) => write!(f, "vault index: {error}"),
            Error::Sql(error) => write!(f, "vault index: {error}"),
            Error::Cancelled => f.write_str("vault index: build cancelled"),
        }
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(error: std::io::Error) -> Self {
        Error::Io(error)
    }
}

impl From<rusqlite::Error> for Error {
    fn from(error: rusqlite::Error) -> Self {
        Error::Sql(error)
    }
}

pub type Result<T> = std::result::Result<T, Error>;

/// Shared between a running `sync` and whoever reports on it.
#[derive(Debug, Default)]
pub struct Progress {
    indexed: AtomicU64,
    total: AtomicU64,
    building: AtomicBool,
    cancel: AtomicBool,
}

impl Progress {
    /// Files whose rows match the disk so far, including those that needed no work.
    pub fn indexed(&self) -> u64 {
        self.indexed.load(Ordering::Relaxed)
    }
    pub fn total(&self) -> u64 {
        self.total.load(Ordering::Relaxed)
    }
    pub fn is_building(&self) -> bool {
        self.building.load(Ordering::Relaxed)
    }
    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }
    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }
}

/// Runs the integrity check on every open, not only after an interrupted write.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Check {
    IfInterrupted,
    Always,
}

#[derive(Clone, Debug, Default)]
pub struct SyncReport {
    pub files: usize,
    pub unchanged: usize,
    pub indexed: usize,
    pub verified: usize,
    pub removed: usize,
    pub repair: Repair,
    pub stamp_pass: Duration,
    pub write: Duration,
}

/// Brings the vault's index in line with `files` (paths relative to `root`, `/`-separated, as the
/// caller's folder walk found them). Missing, older, newer or damaged index files are discarded and
/// rebuilt here; searches on other connections see each committed batch.
pub fn sync(
    root: &Path,
    files: &[String],
    progress: &Progress,
    check: Check,
) -> Result<SyncReport> {
    let root = &canonical_vault_root(root)?;
    let dir = index_dir(root)?;
    create_index_dir(&dir)?;
    let _lock = lock_writer(&dir)?;
    progress.cancel.store(false, Ordering::Relaxed);
    progress.building.store(true, Ordering::Relaxed);
    let outcome = match sync_locked(&dir, root, files, progress, check) {
        Err(error) if error.is_damage() => {
            set_aside(&dir)?;
            sync_locked(&dir, root, files, progress, check).map(|mut report| {
                report.repair.set_aside_damaged = true;
                report
            })
        }
        outcome => outcome,
    };
    progress.building.store(false, Ordering::Relaxed);
    outcome
}

fn sync_locked(
    dir: &Path,
    root: &Path,
    files: &[String],
    progress: &Progress,
    check: Check,
) -> Result<SyncReport> {
    let vault_path = root.to_string_lossy();
    let (mut conn, mut repair) = open_writer(dir, &vault_path)?;
    if check == Check::Always && !repair.created && !quick_check_passes(&conn)? {
        drop(conn);
        set_aside(dir)?;
        let (reopened, _) = open_writer(dir, &vault_path)?;
        conn = reopened;
        repair.set_aside_damaged = true;
        repair.created = true;
    }
    write_meta(
        &conn,
        META_LAST_USED_MS,
        &unix_ms(SystemTime::now()).to_string(),
    )?;

    let started = Instant::now();
    let plan = stamp_pass(&conn, root, files)?;
    let stamp_pass_time = started.elapsed();
    let mut report = SyncReport {
        files: plan.listed,
        unchanged: plan.unchanged,
        removed: plan.removed.len(),
        repair,
        stamp_pass: stamp_pass_time,
        ..SyncReport::default()
    };
    progress.total.store(plan.listed as u64, Ordering::Relaxed);
    progress
        .indexed
        .store(plan.unchanged as u64, Ordering::Relaxed);
    if plan.work.is_empty() && plan.removed.is_empty() {
        return Ok(report);
    }

    let written = Instant::now();
    write_meta(&conn, META_WRITING, &std::process::id().to_string())?;
    remove_rows(&mut conn, &plan.removed)?;
    let counts = index_work(&mut conn, root, &plan.work, progress);
    let stopped = match counts {
        Ok(counts) => {
            report.indexed = counts.indexed;
            report.verified = counts.verified;
            report.removed += counts.removed;
            None
        }
        Err(Error::Cancelled) => Some(Error::Cancelled),
        Err(error) => return Err(error),
    };
    let settle = stopped.is_none() && report.indexed >= SETTLE_AFTER_FILES;
    if settle {
        settle_merges(&conn)?;
    }
    clear_meta(&conn, META_WRITING)?;
    if settle {
        // The merges leave the WAL near its checkpoint size; emptying it now keeps the next
        // one-file commit from paying for that checkpoint.
        conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))?;
    }
    report.write = written.elapsed();
    match stopped {
        Some(error) => Err(error),
        None => Ok(report),
    }
}

/// A large build leaves FTS5 merge work pending, which the next small writes would each pay for
/// (one edited file took up to 175 ms after a 10,000-file build). Finishing it here keeps a
/// one-file update to a few milliseconds.
const SETTLE_AFTER_FILES: usize = 1000;
const MERGE_PAGES_PER_STEP: i64 = 500;

fn settle_merges(conn: &Connection) -> rusqlite::Result<()> {
    loop {
        let before = conn.total_changes();
        conn.execute(
            "INSERT INTO terms(terms, rank) VALUES ('merge', ?1)",
            [MERGE_PAGES_PER_STEP],
        )?;
        if conn.total_changes() - before < 2 {
            return Ok(());
        }
    }
}

fn unix_ms(time: SystemTime) -> u128 {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .map(|after| after.as_millis())
        .unwrap_or(0)
}

struct Row {
    id: i64,
    stamp: Stamp,
    read_at_ns: i64,
    sha: Vec<u8>,
}

/// One file the stamp pass could not trust.
struct Work<'a> {
    path: &'a str,
    row_id: Option<i64>,
    /// Same stamp, but modified too close to the row's read: compared by hash before re-indexing.
    racy_sha: Option<Vec<u8>>,
}

struct Plan<'a> {
    listed: usize,
    unchanged: usize,
    work: Vec<Work<'a>>,
    removed: Vec<i64>,
}

/// Stats every listed file in parallel and compares it with its row. O(n) stats and lookups.
fn stamp_pass<'a>(conn: &Connection, root: &Path, files: &'a [String]) -> Result<Plan<'a>> {
    let mut rows = load_rows(conn)?;
    let stamps = stat_all(root, files);
    let mut plan = Plan {
        listed: 0,
        unchanged: 0,
        work: Vec::new(),
        removed: Vec::new(),
    };
    let mut seen = HashSet::with_capacity(files.len());
    for (path, stamp) in files.iter().zip(stamps) {
        if !confine::admits_name(path) || !seen.insert(path.as_str()) {
            continue;
        }
        let row = rows.remove(path.as_str());
        let Some(stamp) = stamp else {
            plan.removed.extend(row.map(|row| row.id));
            continue;
        };
        plan.listed += 1;
        match row {
            Some(row) if row.stamp == stamp && !is_racy(stamp.mtime_ns, row.read_at_ns) => {
                plan.unchanged += 1
            }
            Some(row) if row.stamp == stamp => plan.work.push(Work {
                path,
                row_id: Some(row.id),
                racy_sha: Some(row.sha),
            }),
            Some(row) => plan.work.push(Work {
                path,
                row_id: Some(row.id),
                racy_sha: None,
            }),
            None => plan.work.push(Work {
                path,
                row_id: None,
                racy_sha: None,
            }),
        }
    }
    plan.removed.extend(rows.into_values().map(|row| row.id));
    Ok(plan)
}

fn load_rows(conn: &Connection) -> Result<HashMap<String, Row>> {
    let mut statement =
        conn.prepare("SELECT path, id, mtime_ns, size, ctime_ns, read_at_ns, sha256 FROM files")?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                Row {
                    id: row.get(1)?,
                    stamp: Stamp {
                        mtime_ns: row.get(2)?,
                        size: row.get(3)?,
                        ctime_ns: row.get(4)?,
                    },
                    read_at_ns: row.get(5)?,
                    sha: row.get(6)?,
                },
            ))
        })?
        .collect::<rusqlite::Result<HashMap<_, _>>>()?;
    Ok(rows)
}

/// Background work leaves at least two cores to the interface.
fn worker_count() -> usize {
    std::thread::available_parallelism()
        .map(|cores| cores.get().saturating_sub(2))
        .unwrap_or(1)
        .clamp(1, 6)
}

/// `None` for a file that is gone or that `confine` does not admit.
fn stat_all(root: &Path, files: &[String]) -> Vec<Option<Stamp>> {
    let chunk = files.len().div_ceil(worker_count()).max(1);
    std::thread::scope(|scope| {
        let handles: Vec<_> = files
            .chunks(chunk)
            .map(|paths| {
                let handle = scope.spawn(move || {
                    let mut folders = confine::Folders::new(root);
                    paths
                        .iter()
                        .map(|path| folders.stamp(path))
                        .collect::<Vec<_>>()
                });
                (paths.len(), handle)
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|(count, handle)| handle.join().unwrap_or_else(|_| vec![None; count]))
            .collect()
    })
}

fn remove_rows(conn: &mut Connection, ids: &[i64]) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let tx = conn.transaction()?;
    {
        let mut terms = tx.prepare_cached("DELETE FROM terms WHERE rowid = ?1")?;
        let mut files = tx.prepare_cached("DELETE FROM files WHERE id = ?1")?;
        for id in ids {
            terms.execute([id])?;
            files.execute([id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Only the first part of a pathological file is searchable; its hash still covers all of it.
const TEXT_CAP_BYTES: usize = 8 * 1024 * 1024;
/// Prepared files waiting for the writer; bounds memory to a few dozen documents.
const PIPELINE_DEPTH: usize = 64;
const BATCH_FILES: usize = 1000;
/// An edit or two is read on the calling thread; starting workers would cost more than the work.
const INLINE_WORK_FILES: usize = 16;
/// Each commit makes progress visible to searches and to the status line.
const BATCH_TIME: Duration = Duration::from_millis(250);

enum Prepared {
    Text {
        slot: usize,
        stamp: Stamp,
        sha: Sha,
        read_at_ns: i64,
        body: String,
        name: String,
    },
    Unchanged {
        slot: usize,
        read_at_ns: i64,
    },
    Gone {
        slot: usize,
    },
}

#[derive(Default)]
struct Counts {
    indexed: usize,
    verified: usize,
    removed: usize,
}

/// Workers read, hash and segment files while this thread writes them in batches, so memory holds
/// at most `PIPELINE_DEPTH` documents however large the vault.
fn index_work(
    conn: &mut Connection,
    root: &Path,
    work: &[Work],
    progress: &Progress,
) -> Result<Counts> {
    if work.len() <= INLINE_WORK_FILES {
        let (sender, receiver) = sync_channel::<Prepared>(work.len());
        for (slot, item) in work.iter().enumerate() {
            sender
                .send(prepare(root, item, slot))
                .map_err(|_| Error::Cancelled)?;
        }
        drop(sender);
        return write_prepared(conn, receiver, work, progress);
    }
    let next = AtomicUsize::new(0);
    std::thread::scope(|scope| {
        let (sender, receiver) = sync_channel::<Prepared>(PIPELINE_DEPTH);
        for _ in 0..worker_count() {
            let sender = sender.clone();
            let next = &next;
            scope.spawn(move || loop {
                let slot = next.fetch_add(1, Ordering::Relaxed);
                if slot >= work.len() || progress.cancelled() {
                    break;
                }
                if sender.send(prepare(root, &work[slot], slot)).is_err() {
                    break;
                }
            });
        }
        drop(sender);
        let written = write_prepared(conn, receiver, work, progress);
        if written.is_err() {
            next.store(work.len(), Ordering::Relaxed);
        }
        written
    })
}

fn prepare(root: &Path, work: &Work, slot: usize) -> Prepared {
    let read_at_ns = now_ns();
    let Some((mut file, metadata)) = confine::open(root, work.path) else {
        return Prepared::Gone { slot };
    };
    let stamp = Stamp::of(&metadata);
    let mut text = Vec::with_capacity(
        usize::try_from(metadata.len())
            .unwrap_or(0)
            .min(TEXT_CAP_BYTES),
    );
    let mut hasher = Sha256::new();
    if read_hashing(&mut file, &mut text, &mut hasher).is_err() {
        return Prepared::Gone { slot };
    }
    let sha = sha256(hasher);
    if work.racy_sha.as_deref() == Some(sha.as_slice()) {
        return Prepared::Unchanged { slot, read_at_ns };
    }
    let mut body = String::new();
    segment::segment_into(&String::from_utf8_lossy(&text), &mut body);
    let mut name = String::new();
    segment::segment_into(
        work.path.strip_suffix(".md").unwrap_or(work.path),
        &mut name,
    );
    Prepared::Text {
        slot,
        stamp,
        sha,
        read_at_ns,
        body,
        name,
    }
}

/// Keeps the first `TEXT_CAP_BYTES` and hashes everything.
fn read_hashing(
    file: &mut std::fs::File,
    text: &mut Vec<u8>,
    hasher: &mut Sha256,
) -> std::io::Result<()> {
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = match file.read(&mut buffer) {
            Ok(0) => return Ok(()),
            Ok(read) => read,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        };
        hasher.update(&buffer[..read]);
        let room = TEXT_CAP_BYTES.saturating_sub(text.len()).min(read);
        text.extend_from_slice(&buffer[..room]);
    }
}

fn write_prepared(
    conn: &mut Connection,
    receiver: Receiver<Prepared>,
    work: &[Work],
    progress: &Progress,
) -> Result<Counts> {
    let mut counts = Counts::default();
    let mut incoming = receiver.into_iter().peekable();
    while incoming.peek().is_some() {
        let tx = conn.transaction()?;
        let batch_started = Instant::now();
        let mut in_batch = 0u64;
        {
            let mut delete_terms = tx.prepare_cached("DELETE FROM terms WHERE rowid = ?1")?;
            let mut delete_file = tx.prepare_cached("DELETE FROM files WHERE id = ?1")?;
            let mut update_file = tx.prepare_cached(
                "UPDATE files SET mtime_ns = ?2, size = ?3, ctime_ns = ?4, read_at_ns = ?5, sha256 = ?6 WHERE id = ?1",
            )?;
            let mut insert_file = tx.prepare_cached(
                "INSERT INTO files(path, mtime_ns, size, ctime_ns, read_at_ns, sha256) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )?;
            let mut insert_terms =
                tx.prepare_cached("INSERT INTO terms(rowid, body, name) VALUES (?1, ?2, ?3)")?;
            let mut touch_file =
                tx.prepare_cached("UPDATE files SET read_at_ns = ?2 WHERE id = ?1")?;
            for prepared in incoming.by_ref() {
                match prepared {
                    Prepared::Text {
                        slot,
                        stamp,
                        sha,
                        read_at_ns,
                        body,
                        name,
                    } => {
                        let id = match work[slot].row_id {
                            Some(id) => {
                                delete_terms.execute([id])?;
                                update_file.execute(params![
                                    id,
                                    stamp.mtime_ns,
                                    stamp.size,
                                    stamp.ctime_ns,
                                    read_at_ns,
                                    sha.as_slice()
                                ])?;
                                id
                            }
                            None => {
                                insert_file.execute(params![
                                    work[slot].path,
                                    stamp.mtime_ns,
                                    stamp.size,
                                    stamp.ctime_ns,
                                    read_at_ns,
                                    sha.as_slice()
                                ])?;
                                tx.last_insert_rowid()
                            }
                        };
                        insert_terms.execute(params![id, body, name])?;
                        counts.indexed += 1;
                    }
                    Prepared::Unchanged { slot, read_at_ns } => {
                        if let Some(id) = work[slot].row_id {
                            touch_file.execute(params![id, read_at_ns])?;
                        }
                        counts.verified += 1;
                    }
                    Prepared::Gone { slot } => {
                        if let Some(id) = work[slot].row_id {
                            delete_terms.execute([id])?;
                            delete_file.execute([id])?;
                            counts.removed += 1;
                        }
                    }
                }
                in_batch += 1;
                if in_batch as usize >= BATCH_FILES || batch_started.elapsed() >= BATCH_TIME {
                    break;
                }
            }
        }
        tx.commit()?;
        progress.indexed.fetch_add(in_batch, Ordering::Relaxed);
    }
    if progress.cancelled() {
        return Err(Error::Cancelled);
    }
    Ok(counts)
}

/// A read connection for searches. `None` while the vault has no usable index; never creates one.
pub struct Searcher {
    conn: Connection,
    root: PathBuf,
}

impl Searcher {
    pub fn open(root: &Path) -> Result<Option<Searcher>> {
        let root = canonical_vault_root(root)?;
        let dir = index_dir(&root)?;
        Ok(open_reader(&dir)?.map(|conn| Searcher { conn, root }))
    }

    /// Best `limit` files for `query`, each verified against the disk before it is returned.
    pub fn search(&self, query: &str, limit: usize) -> Result<Found> {
        Ok(search::search(&self.conn, &self.root, query, limit)?)
    }

    pub fn indexed_files(&self) -> Result<u64> {
        let count: i64 = self
            .conn
            .query_row("SELECT count(*) FROM files", [], |row| row.get(0))?;
        Ok(u64::try_from(count).unwrap_or(0))
    }
}

/// The key folder for `root`, spelled as `sync` spells it while the folder exists.
fn dir_for(root: &Path) -> Result<PathBuf> {
    Ok(index_dir(
        &canonical_vault_root(root).unwrap_or_else(|_| root.to_path_buf()),
    )?)
}

/// Moves a damaged index aside so the next `sync` rebuilds it.
pub fn set_aside_damaged(root: &Path) -> Result<()> {
    let dir = dir_for(root)?;
    let _lock = lock_writer(&dir)?;
    Ok(set_aside(&dir)?)
}

/// Deletes one vault's index, or every vault's when `root` is `None`; a vault folder that no
/// longer exists is found by the path it had. Only folders this crate made are touched
/// (`lifecycle::is_index_folder`). The caller stops its own builds first; waiting for the writer
/// lock covers another process's.
pub fn delete(root: Option<&Path>) -> Result<()> {
    let folders = match root {
        Some(root) => vec![dir_for(root)?],
        None => lifecycle::index_folders(&indexes_root()?),
    };
    for folder in &folders {
        if !lifecycle::is_index_folder(folder) {
            continue;
        }
        drop(lock_writer(folder)?);
        lifecycle::delete_folder(folder)?;
    }
    if root.is_none() {
        // Removed only when nothing else was left in it.
        let _ = std::fs::remove_dir(indexes_root()?);
    }
    Ok(())
}

/// Bytes on disk for one vault's index, or for every vault's when `root` is `None`.
pub fn stored_bytes(root: Option<&Path>) -> Result<u64> {
    Ok(match root {
        Some(root) => {
            let dir = dir_for(root)?;
            if lifecycle::is_index_folder(&dir) {
                lifecycle::folder_bytes(&dir)
            } else {
                0
            }
        }
        None => lifecycle::index_folders(&indexes_root()?)
            .iter()
            .map(|dir| lifecycle::folder_bytes(dir))
            .sum(),
    })
}

/// Vault folders with an index on this computer.
pub fn stored_vaults() -> Result<usize> {
    Ok(lifecycle::index_folders(&indexes_root()?)
        .iter()
        .filter(|dir| dir.join(lifecycle::SEARCH_FILE).is_file())
        .count())
}

/// Deletes the index of every vault whose folder is gone or that was not opened for fourteen days.
pub fn sweep_orphans() -> Result<usize> {
    Ok(lifecycle::sweep_orphans(
        &indexes_root()?,
        SystemTime::now(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn insert_row(conn: &Connection, path: &str, stamp: Stamp, read_at_ns: i64) {
        conn.execute(
            "INSERT INTO files(path, mtime_ns, size, ctime_ns, read_at_ns, sha256) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![path, stamp.mtime_ns, stamp.size, stamp.ctime_ns, read_at_ns, vec![0u8; 32]],
        )
        .unwrap();
    }

    /// The row's stamp equals the file's here, so only the read time decides; on macOS and Linux a
    /// rewrite also moves the change time, which would hide a missing window check.
    #[test]
    fn a_row_read_within_two_seconds_of_its_edit_is_checked_by_hash() {
        let vault = std::env::temp_dir().join(format!("vault-index-racy-{}", std::process::id()));
        std::fs::create_dir_all(&vault).unwrap();
        let vault = std::fs::canonicalize(&vault).unwrap();
        std::fs::write(vault.join("a.md"), "지도").unwrap();
        std::fs::write(vault.join("b.md"), "map").unwrap();
        let stamp_of = |name: &str| Stamp::of(&std::fs::metadata(vault.join(name)).unwrap());
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../sql/search.sql"))
            .unwrap();
        let (a, b) = (stamp_of("a.md"), stamp_of("b.md"));
        insert_row(&conn, "a.md", a, a.mtime_ns);
        insert_row(&conn, "b.md", b, b.mtime_ns + stamps::RACY_WINDOW_NS);
        let files = vec!["a.md".to_string(), "b.md".to_string()];
        let plan = stamp_pass(&conn, &vault, &files).unwrap();
        let racy: Vec<_> = plan
            .work
            .iter()
            .map(|work| (work.path, work.racy_sha.is_some()))
            .collect();
        assert_eq!(
            racy,
            vec![("a.md", true)],
            "only the row read inside the window is re-checked"
        );
        assert_eq!(plan.unchanged, 1);
        std::fs::remove_dir_all(&vault).unwrap();
    }

    #[test]
    fn a_duplicate_listing_is_indexed_once() {
        let vault = std::env::temp_dir().join(format!("vault-index-dup-{}", std::process::id()));
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(vault.join("a.md"), "지도").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../sql/search.sql"))
            .unwrap();
        let files = vec!["a.md".to_string(), "a.md".to_string()];
        let plan = stamp_pass(&conn, &vault, &files).unwrap();
        assert_eq!((plan.listed, plan.work.len()), (1, 1));
        std::fs::remove_dir_all(&vault).unwrap();
    }
}
