//! Creating, checking, setting aside, discarding and deleting a vault's index files. Every path
//! that finds the index missing, older, newer or damaged ends in the same first-open code.

use crate::segment::SEGMENTATION_VERSION;
use rusqlite::{Connection, ErrorCode, OpenFlags, OptionalExtension};
use std::fs::{self, File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub(crate) const SEARCH_FILE: &str = "search.sqlite";
pub(crate) const ROWS_FILE: &str = "rows.sqlite";
const LOCK_FILE: &str = "index.lock";
/// Written into every folder this crate creates. Deletion touches only folders that carry it and
/// hold nothing but the files below, so a mistaken index root never costs a person's own folder.
const MARKER_FILE: &str = "vault-index.marker";
const MARKER_TEXT: &str = "vault-index: rebuildable search index; safe to delete\n";
const DAMAGED_SUFFIX: &str = ".damaged";
const SQLITE_SIDE_SUFFIXES: [&str; 2] = ["-wal", "-shm"];
/// Files the operating system drops into any folder a person browses; they never block a delete
/// and are removed with the index.
const OS_LITTER: [&str; 3] = [".DS_Store", "Thumbs.db", "desktop.ini"];
/// Every name an index folder can hold.
const INDEX_FILE_NAMES: [&str; 10] = [
    SEARCH_FILE,
    "search.sqlite-wal",
    "search.sqlite-shm",
    "search.sqlite.damaged",
    ROWS_FILE,
    "rows.sqlite-wal",
    "rows.sqlite-shm",
    "rows.sqlite.damaged",
    LOCK_FILE,
    MARKER_FILE,
];
const SEARCH_SCHEMA: &str = include_str!("../sql/search.sql");
/// Table layout and segmentation together: either changing means a rebuild, never an `ALTER`.
const TABLES_VERSION: i32 = 1;
pub(crate) const SCHEMA_VERSION: i32 = TABLES_VERSION * 1000 + SEGMENTATION_VERSION as i32;

/// One SQLite file of a vault's index: its name, its tables, and the `user_version` that keeps
/// it. Every file goes through the same create, check, set-aside and discard code below.
pub(crate) struct Store {
    pub(crate) file: &'static str,
    pub(crate) schema: &'static str,
    pub(crate) version: i32,
}

pub(crate) const SEARCH: Store = Store {
    file: SEARCH_FILE,
    schema: SEARCH_SCHEMA,
    version: SCHEMA_VERSION,
};
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const WAL_SIZE_LIMIT_BYTES: i64 = 32 * 1024 * 1024;
const WRITER_CACHE_KIB: i64 = 16 * 1024;

pub(crate) const META_VAULT_PATH: &str = "vault_path";
pub(crate) const META_LAST_USED_MS: &str = "last_used_ms";
/// Present while a writer is between its first and last commit; found at open, the writer died.
pub(crate) const META_WRITING: &str = "writing";

/// What opening had to do before the index could be used.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Repair {
    pub created: bool,
    pub discarded_version: bool,
    pub set_aside_damaged: bool,
}

pub(crate) fn search_path(dir: &Path) -> PathBuf {
    dir.join(SEARCH_FILE)
}

fn store_path(dir: &Path, store: &Store) -> PathBuf {
    dir.join(store.file)
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

pub(crate) fn is_damage(error: &rusqlite::Error) -> bool {
    matches!(
        error.sqlite_error_code(),
        Some(ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase)
    )
}

/// Creates the vault's index folder, private to the user account, with its marker.
pub(crate) fn create_index_dir(dir: &Path) -> io::Result<()> {
    if let Some(parent) = dir.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::create_dir_all(dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700))?;
    }
    let marker = dir.join(MARKER_FILE);
    if !marker.is_file() {
        use std::io::Write;
        create_private_file(&marker)?.write_all(MARKER_TEXT.as_bytes())?;
    }
    Ok(())
}

fn named_by_key(dir: &Path) -> bool {
    dir.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name.len() == crate::location::VAULT_KEY_HEX_CHARS
                && name
                    .bytes()
                    .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        })
        && fs::symlink_metadata(dir).is_ok_and(|meta| meta.is_dir())
}

/// A folder this crate made and may delete: a real directory named by a vault key, carrying the
/// marker, and holding only index file names and OS litter.
pub(crate) fn is_index_folder(dir: &Path) -> bool {
    if !named_by_key(dir) {
        return false;
    }
    if !fs::symlink_metadata(dir.join(MARKER_FILE)).is_ok_and(|meta| meta.is_file()) {
        return false;
    }
    fs::read_dir(dir).is_ok_and(|entries| {
        entries.flatten().all(|entry| {
            entry.file_type().is_ok_and(|kind| kind.is_file())
                && entry.file_name().to_str().is_some_and(|name| {
                    INDEX_FILE_NAMES.contains(&name) || OS_LITTER.contains(&name)
                })
        })
    })
}

/// A folder this crate made (key name and marker) that holds index data, whether or not it may
/// be deleted: what answers searches or reopens, for sizes and for saying when a delete left one
/// in place.
pub(crate) fn holds_index(dir: &Path) -> bool {
    named_by_key(dir)
        && fs::symlink_metadata(dir.join(MARKER_FILE)).is_ok_and(|meta| meta.is_file())
        && (search_path(dir).is_file() || dir.join(ROWS_FILE).is_file())
}

/// Every folder under `root` for which `holds_index` is true.
pub(crate) fn key_folders(root: &Path) -> Vec<PathBuf> {
    fs::read_dir(root)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| holds_index(path))
                .collect()
        })
        .unwrap_or_default()
}

/// The index folders directly under `root`; anything else there is left alone.
pub(crate) fn index_folders(root: &Path) -> Vec<PathBuf> {
    fs::read_dir(root)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| is_index_folder(path))
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn create_private_file(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}

/// Held for every write, so one build runs at a time across processes. Released on drop.
pub(crate) struct WriterLock {
    _file: File,
}

/// A delete removes the lock file while holding the lock; a writer that was waiting then holds a
/// lock on a file no longer at that name, so it locks again on the file that is.
const LOCK_ATTEMPTS: usize = 8;

/// Waits for the lock. `NotFound` means the folder was deleted meanwhile; the caller recreates it.
pub(crate) fn lock_writer(dir: &Path) -> io::Result<WriterLock> {
    let path = dir.join(LOCK_FILE);
    for _ in 0..LOCK_ATTEMPTS {
        let file = create_private_file(&path)?;
        file.lock()?;
        if names_locked_file(&file, &path) {
            return Ok(WriterLock { _file: file });
        }
    }
    Err(io::Error::other("vault index lock file kept changing"))
}

/// The lock if no one holds it now; `None` while a build or delete runs, or before the first build
/// has made the lock file, which this never creates.
pub(crate) fn try_lock_writer(dir: &Path) -> io::Result<Option<WriterLock>> {
    let path = dir.join(LOCK_FILE);
    let file = match OpenOptions::new().read(true).write(true).open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    match file.try_lock() {
        Ok(()) if names_locked_file(&file, &path) => Ok(Some(WriterLock { _file: file })),
        Ok(()) | Err(fs::TryLockError::WouldBlock) => Ok(None),
        Err(fs::TryLockError::Error(error)) => Err(error),
    }
}

#[cfg(unix)]
fn names_locked_file(file: &File, path: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (file.metadata(), fs::metadata(path)) {
        (Ok(locked), Ok(named)) => locked.dev() == named.dev() && locked.ino() == named.ino(),
        _ => false,
    }
}

#[cfg(windows)]
fn names_locked_file(file: &File, path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    match (file.metadata(), fs::metadata(path)) {
        (Ok(locked), Ok(named)) => locked.creation_time() == named.creation_time(),
        _ => false,
    }
}

#[cfg(not(any(unix, windows)))]
fn names_locked_file(_file: &File, path: &Path) -> bool {
    path.is_file()
}

pub(crate) fn configure(conn: &Connection) -> rusqlite::Result<()> {
    conn.busy_timeout(BUSY_TIMEOUT)?;
    let mode: String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
    if !mode.eq_ignore_ascii_case("wal") {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
            Some(format!(
                "the cache folder cannot hold a WAL index (journal mode {mode})"
            )),
        ));
    }
    conn.execute_batch(&format!(
        "PRAGMA synchronous=NORMAL; PRAGMA journal_size_limit={WAL_SIZE_LIMIT_BYTES}; PRAGMA cache_size=-{WRITER_CACHE_KIB};"
    ))
}

pub(crate) fn open_flags() -> OpenFlags {
    OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX
}

/// A reader for another thread or process. `None` while no index exists, so a search never
/// creates one.
pub(crate) fn open_reader(dir: &Path) -> rusqlite::Result<Option<Connection>> {
    open_store_reader(dir, &SEARCH)
}

/// `None` while the file is missing, empty or of another version; reading never creates it.
pub(crate) fn open_store_reader(dir: &Path, store: &Store) -> rusqlite::Result<Option<Connection>> {
    let path = store_path(dir, store);
    if fs::metadata(&path)
        .map(|meta| meta.len() == 0)
        .unwrap_or(true)
    {
        return Ok(None);
    }
    let conn = Connection::open_with_flags(&path, open_flags())?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.execute_batch("PRAGMA query_only=1;")?;
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    Ok((version == store.version).then_some(conn))
}

/// Opens the writer, creating, discarding or setting aside the file as needed. The caller holds
/// the writer lock, so no other writer can be between commits.
pub(crate) fn open_writer(dir: &Path, vault_path: &str) -> rusqlite::Result<(Connection, Repair)> {
    open_store_writer(dir, &SEARCH, vault_path)
}

/// `open_writer` for any of the index's files.
pub(crate) fn open_store_writer(
    dir: &Path,
    store: &Store,
    vault_path: &str,
) -> rusqlite::Result<(Connection, Repair)> {
    let mut repair = Repair::default();
    if fs::metadata(store_path(dir, store)).is_ok_and(|meta| meta.len() == 0) {
        set_aside_file(dir, store.file).map_err(io_failure)?;
        repair.set_aside_damaged = true;
    }
    match open_existing(dir, store) {
        Ok(Existing::Usable(conn)) => return Ok((conn, repair)),
        Ok(Existing::Missing) => {}
        Ok(Existing::OtherVersion) => {
            discard_file(dir, store.file).map_err(io_failure)?;
            repair.discarded_version = true;
        }
        Ok(Existing::Damaged) => {
            set_aside_file(dir, store.file).map_err(io_failure)?;
            repair.set_aside_damaged = true;
        }
        Err(error) if is_damage(&error) => {
            set_aside_file(dir, store.file).map_err(io_failure)?;
            repair.set_aside_damaged = true;
        }
        Err(error) => return Err(error),
    }
    let conn = create(dir, store, vault_path)?;
    repair.created = true;
    Ok((conn, repair))
}

enum Existing {
    Usable(Connection),
    Missing,
    OtherVersion,
    Damaged,
}

fn open_existing(dir: &Path, store: &Store) -> rusqlite::Result<Existing> {
    let path = store_path(dir, store);
    if !path.exists() {
        return Ok(Existing::Missing);
    }
    let conn = Connection::open_with_flags(&path, open_flags())?;
    match conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))? {
        0 => return Ok(Existing::Missing),
        version if version == store.version => {}
        _ => return Ok(Existing::OtherVersion),
    }
    configure(&conn)?;
    let interrupted = read_meta(&conn, META_WRITING)?.is_some();
    if interrupted && !quick_check_passes(&conn)? {
        return Ok(Existing::Damaged);
    }
    Ok(Existing::Usable(conn))
}

fn create(dir: &Path, store: &Store, vault_path: &str) -> rusqlite::Result<Connection> {
    let path = store_path(dir, store);
    discard_file(dir, store.file).map_err(io_failure)?;
    create_private_file(&path).map_err(io_failure)?;
    let mut conn = Connection::open_with_flags(&path, open_flags())?;
    configure(&conn)?;
    let tx = conn.transaction()?;
    tx.execute_batch(store.schema)?;
    tx.pragma_update(None, "user_version", store.version)?;
    write_meta(&tx, META_VAULT_PATH, vault_path)?;
    tx.commit()?;
    Ok(conn)
}

pub(crate) fn quick_check_passes(conn: &Connection) -> rusqlite::Result<bool> {
    match conn.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0)) {
        Ok(verdict) => Ok(verdict == "ok"),
        Err(error) if is_damage(&error) => Ok(false),
        Err(error) => Err(error),
    }
}

pub(crate) fn read_meta(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .optional()
}

pub(crate) fn write_meta(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO meta(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub(crate) fn clear_meta(conn: &Connection, key: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM meta WHERE key = ?1", [key])?;
    Ok(())
}

fn io_failure(error: io::Error) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
        Some(error.to_string()),
    )
}

/// Keeps one damaged copy beside the index for a person to inspect, never more.
pub(crate) fn set_aside(dir: &Path) -> io::Result<()> {
    set_aside_file(dir, SEARCH_FILE)
}

pub(crate) fn set_aside_file(dir: &Path, file: &str) -> io::Result<()> {
    let path = dir.join(file);
    let damaged = with_suffix(&path, DAMAGED_SUFFIX);
    remove_if_present(&damaged)?;
    if path.exists() {
        fs::rename(&path, &damaged)?;
    }
    remove_side_files(&path)
}

/// Removes one index file and its WAL files; the next open starts from nothing.
pub(crate) fn discard_file(dir: &Path, file: &str) -> io::Result<()> {
    let path = dir.join(file);
    remove_if_present(&path)?;
    remove_side_files(&path)
}

fn remove_side_files(path: &Path) -> io::Result<()> {
    for suffix in SQLITE_SIDE_SUFFIXES {
        remove_if_present(&with_suffix(path, suffix))?;
    }
    Ok(())
}

fn remove_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

/// Bytes of every file under `dir`: the index, its WAL files and any damaged copy.
pub(crate) fn folder_bytes(dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| match entry.file_type() {
            Ok(kind) if kind.is_dir() => folder_bytes(&entry.path()),
            Ok(_) => entry.metadata().map(|meta| meta.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

/// How often this process deleted each index folder, and every folder at once (the empty path).
/// A row batch carries the count its lookup saw and writes nothing once it moved, so a Delete or
/// switch-off is not undone by a batch in flight, even one for a vault that had no index yet.
static DELETIONS: std::sync::Mutex<Vec<(PathBuf, i64)>> = std::sync::Mutex::new(Vec::new());

pub(crate) fn deletions(dir: &Path) -> i64 {
    let deleted = DELETIONS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    deleted
        .iter()
        .filter(|(folder, _)| folder == dir || folder.as_os_str().is_empty())
        .map(|(_, count)| *count)
        .sum()
}

/// Counts a deletion of `dir`, or of every folder when `None`.
pub(crate) fn count_deletion(dir: Option<&Path>) {
    let dir = dir.unwrap_or(Path::new(""));
    let mut deleted = DELETIONS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    match deleted.iter_mut().find(|(folder, _)| folder == dir) {
        Some((_, count)) => *count += 1,
        None => deleted.push((dir.to_path_buf(), 1)),
    }
}

/// Deletes an index folder (`is_index_folder`) file by file while holding its writer lock, so no
/// build is between commits. Where another process still holds the index open (Windows refuses to
/// delete it), the tables are emptied in place and the folder stays. The lock file goes while the
/// lock is held, so a writer waiting on it locks afresh (`lock_writer`).
pub(crate) fn delete_locked(dir: &Path, lock: WriterLock) -> io::Result<()> {
    count_deletion(Some(dir));
    let search = search_path(dir);
    let rows = dir.join(ROWS_FILE);
    let search_removed = remove_if_present(&search);
    let rows_removed = remove_if_present(&rows);
    if search_removed.is_err() || rows_removed.is_err() {
        if let Err(error) = search_removed {
            empty_in_place(dir).map_err(|_| error)?;
        }
        if let Err(error) = rows_removed {
            empty_rows_in_place(&rows).map_err(|_| error)?;
        }
        return Ok(());
    }
    for name in INDEX_FILE_NAMES.iter().chain(OS_LITTER.iter()) {
        if *name != LOCK_FILE {
            remove_if_present(&dir.join(name))?;
        }
    }
    // Unix unlinks a locked file, so the name goes first and a waiter sees it changed. Windows
    // refuses to delete a file it has open, so the name goes once the lock is released.
    #[cfg(unix)]
    let _ = remove_if_present(&dir.join(LOCK_FILE));
    drop(lock);
    #[cfg(not(unix))]
    let _ = remove_if_present(&dir.join(LOCK_FILE));
    let _ = fs::remove_dir(dir);
    Ok(())
}

fn empty_in_place(dir: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open_with_flags(search_path(dir), open_flags())?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.execute_batch(
        "BEGIN IMMEDIATE; DELETE FROM files; INSERT INTO terms(terms) VALUES ('delete-all'); COMMIT; VACUUM;",
    )
}

fn empty_rows_in_place(path: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open_with_flags(path, open_flags())?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.execute_batch("BEGIN IMMEDIATE; DELETE FROM rows; COMMIT; VACUUM;")
}

/// The index holds each document's words, so it should not outlive its use: a folder opened at
/// least every two weeks keeps its index, and one left longer pays one rebuild (seconds, even at
/// 50,000 files) when it is opened again.
pub(crate) const UNUSED_AFTER: Duration = Duration::from_secs(14 * 24 * 60 * 60);

/// Deletes the index of every vault whose folder is confirmed gone or that was not opened for
/// `UNUSED_AFTER`. A folder whose lock is held (a build or delete is running) is skipped, and an
/// index that cannot be read is kept: neither is evidence that it is unused.
pub(crate) fn sweep_orphans(root: &Path, now: SystemTime) -> usize {
    let mut removed = 0;
    for dir in index_folders(root) {
        let Ok(Some(lock)) = try_lock_writer(&dir) else {
            continue;
        };
        if is_stale(&dir, now) && delete_locked(&dir, lock).is_ok() && !dir.exists() {
            removed += 1;
        }
    }
    removed
}

/// Stale when the vault folder is gone or every index file says it was last used more than
/// `UNUSED_AFTER` ago; a folder holding only `rows.sqlite` is judged by that file.
fn is_stale(dir: &Path, now: SystemTime) -> bool {
    let recorded: Vec<(String, Option<String>)> = [search_path(dir), dir.join(ROWS_FILE)]
        .iter()
        .filter_map(|path| {
            let conn = Connection::open_with_flags(
                path,
                OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )
            .ok()?;
            let vault = read_meta(&conn, META_VAULT_PATH).ok()??;
            Some((vault, read_meta(&conn, META_LAST_USED_MS).ok()?))
        })
        .collect();
    let Some((vault, _)) = recorded.first() else {
        return false;
    };
    let vault_gone =
        fs::symlink_metadata(vault).is_err_and(|error| error.kind() == io::ErrorKind::NotFound);
    let last_used = recorded
        .iter()
        .filter_map(|(_, used)| used.as_deref()?.parse::<u64>().ok())
        .max();
    let unused_for = last_used
        .map(|ms| SystemTime::UNIX_EPOCH + Duration::from_millis(ms))
        .and_then(|used| now.duration_since(used).ok());
    vault_gone || unused_for.is_some_and(|age| age > UNUSED_AFTER)
}
