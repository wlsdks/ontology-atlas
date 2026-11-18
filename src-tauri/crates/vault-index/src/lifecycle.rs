//! Creating, checking, setting aside, discarding and deleting a vault's index files. Every path
//! that finds the index missing, older, newer or damaged ends in the same first-open code.

use crate::segment::SEGMENTATION_VERSION;
use rusqlite::{Connection, ErrorCode, OpenFlags, OptionalExtension};
use std::fs::{self, File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub(crate) const SEARCH_FILE: &str = "search.sqlite";
const LOCK_FILE: &str = "index.lock";
/// Written into every folder this crate creates. Deletion touches only folders that carry it and
/// hold nothing but the files below, so a mistaken index root never costs a person's own folder.
const MARKER_FILE: &str = "vault-index.marker";
const MARKER_TEXT: &str = "vault-index: rebuildable search index; safe to delete\n";
const DAMAGED_SUFFIX: &str = ".damaged";
const SQLITE_SIDE_SUFFIXES: [&str; 2] = ["-wal", "-shm"];
/// Every name an index folder can hold.
const INDEX_FILE_NAMES: [&str; 6] = [
    SEARCH_FILE,
    "search.sqlite-wal",
    "search.sqlite-shm",
    "search.sqlite.damaged",
    LOCK_FILE,
    MARKER_FILE,
];
const SEARCH_SCHEMA: &str = include_str!("../sql/search.sql");
/// Table layout and segmentation together: either changing means a rebuild, never an `ALTER`.
const TABLES_VERSION: i32 = 1;
pub(crate) const SCHEMA_VERSION: i32 = TABLES_VERSION * 1000 + SEGMENTATION_VERSION as i32;
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

/// A folder this crate made and may delete: a real directory named by a vault key, carrying the
/// marker, and holding only index file names.
pub(crate) fn is_index_folder(dir: &Path) -> bool {
    let named_by_key = dir
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name.len() == crate::location::VAULT_KEY_HEX_CHARS
                && name
                    .bytes()
                    .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        });
    if !named_by_key || !fs::symlink_metadata(dir).is_ok_and(|meta| meta.is_dir()) {
        return false;
    }
    if !fs::symlink_metadata(dir.join(MARKER_FILE)).is_ok_and(|meta| meta.is_file()) {
        return false;
    }
    fs::read_dir(dir).is_ok_and(|entries| {
        entries.flatten().all(|entry| {
            entry.file_type().is_ok_and(|kind| kind.is_file())
                && entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| INDEX_FILE_NAMES.contains(&name))
        })
    })
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

fn create_private_file(path: &Path) -> io::Result<File> {
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

pub(crate) fn lock_writer(dir: &Path) -> io::Result<WriterLock> {
    let file = create_private_file(&dir.join(LOCK_FILE))?;
    file.lock()?;
    Ok(WriterLock { _file: file })
}

fn configure(conn: &Connection) -> rusqlite::Result<()> {
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

fn open_flags() -> OpenFlags {
    OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX
}

/// A reader for another thread or process. `None` while no index exists, so a search never
/// creates one.
pub(crate) fn open_reader(dir: &Path) -> rusqlite::Result<Option<Connection>> {
    let path = search_path(dir);
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
    Ok((version == SCHEMA_VERSION).then_some(conn))
}

/// Opens the writer, creating, discarding or setting aside the file as needed. The caller holds
/// the writer lock, so no other writer can be between commits.
pub(crate) fn open_writer(dir: &Path, vault_path: &str) -> rusqlite::Result<(Connection, Repair)> {
    let mut repair = Repair::default();
    if fs::metadata(search_path(dir)).is_ok_and(|meta| meta.len() == 0) {
        set_aside(dir).map_err(io_failure)?;
        repair.set_aside_damaged = true;
    }
    match open_existing(dir) {
        Ok(Existing::Usable(conn)) => return Ok((conn, repair)),
        Ok(Existing::Missing) => {}
        Ok(Existing::OtherVersion) => {
            discard(dir).map_err(io_failure)?;
            repair.discarded_version = true;
        }
        Ok(Existing::Damaged) => {
            set_aside(dir).map_err(io_failure)?;
            repair.set_aside_damaged = true;
        }
        Err(error) if is_damage(&error) => {
            set_aside(dir).map_err(io_failure)?;
            repair.set_aside_damaged = true;
        }
        Err(error) => return Err(error),
    }
    let conn = create(dir, vault_path)?;
    repair.created = true;
    Ok((conn, repair))
}

enum Existing {
    Usable(Connection),
    Missing,
    OtherVersion,
    Damaged,
}

fn open_existing(dir: &Path) -> rusqlite::Result<Existing> {
    let path = search_path(dir);
    if !path.exists() {
        return Ok(Existing::Missing);
    }
    let conn = Connection::open_with_flags(&path, open_flags())?;
    match conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))? {
        0 => return Ok(Existing::Missing),
        SCHEMA_VERSION => {}
        _ => return Ok(Existing::OtherVersion),
    }
    configure(&conn)?;
    let interrupted = read_meta(&conn, META_WRITING)?.is_some();
    if interrupted && !quick_check_passes(&conn)? {
        return Ok(Existing::Damaged);
    }
    Ok(Existing::Usable(conn))
}

fn create(dir: &Path, vault_path: &str) -> rusqlite::Result<Connection> {
    let path = search_path(dir);
    discard(dir).map_err(io_failure)?;
    create_private_file(&path).map_err(io_failure)?;
    let mut conn = Connection::open_with_flags(&path, open_flags())?;
    configure(&conn)?;
    let tx = conn.transaction()?;
    tx.execute_batch(SEARCH_SCHEMA)?;
    tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
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
    let path = search_path(dir);
    let damaged = with_suffix(&path, DAMAGED_SUFFIX);
    remove_if_present(&damaged)?;
    if path.exists() {
        fs::rename(&path, &damaged)?;
    }
    remove_side_files(&path)
}

/// Removes the index file and its WAL files; the next open starts from nothing.
pub(crate) fn discard(dir: &Path) -> io::Result<()> {
    let path = search_path(dir);
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

/// Deletes a vault's index folder file by file, and only if it is one (`is_index_folder`); returns
/// whether it did. Where another process still holds the index open (Windows refuses to delete
/// it), the tables are emptied in place instead.
pub(crate) fn delete_folder(dir: &Path) -> io::Result<bool> {
    if !is_index_folder(dir) {
        return Ok(false);
    }
    let search = search_path(dir);
    if let Err(error) = remove_if_present(&search) {
        empty_in_place(dir).map_err(|_| error)?;
        return Ok(true);
    }
    for name in INDEX_FILE_NAMES {
        remove_if_present(&dir.join(name))?;
    }
    match fs::remove_dir(dir) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(true),
    }
}

fn empty_in_place(dir: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open_with_flags(search_path(dir), open_flags())?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.execute_batch(
        "BEGIN IMMEDIATE; DELETE FROM files; INSERT INTO terms(terms) VALUES ('delete-all'); COMMIT; VACUUM;",
    )
}

/// The index holds each document's words, so it should not outlive its use: a folder opened at
/// least every two weeks keeps its index, and one left longer pays one rebuild (seconds, even at
/// 50,000 files) when it is opened again.
pub(crate) const UNUSED_AFTER: Duration = Duration::from_secs(14 * 24 * 60 * 60);

/// Deletes the index of every vault whose folder no longer exists or that was not opened for
/// `UNUSED_AFTER`.
pub(crate) fn sweep_orphans(root: &Path, now: SystemTime) -> usize {
    index_folders(root)
        .iter()
        .filter(|dir| is_orphan(dir, now))
        .filter(|dir| delete_folder(dir).unwrap_or(false))
        .count()
}

fn is_orphan(dir: &Path, now: SystemTime) -> bool {
    let recorded = Connection::open_with_flags(
        search_path(dir),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .and_then(|conn| {
        Ok((
            read_meta(&conn, META_VAULT_PATH)?,
            read_meta(&conn, META_LAST_USED_MS)?,
        ))
    });
    let folder_age = || {
        fs::metadata(dir)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
    };
    let (vault_exists, unused_for) = match recorded {
        Ok((Some(vault), last_used)) => {
            let unused = last_used
                .and_then(|ms| ms.parse::<u64>().ok())
                .map(|ms| SystemTime::UNIX_EPOCH + Duration::from_millis(ms))
                .and_then(|used| now.duration_since(used).ok());
            (Path::new(&vault).exists(), unused.or_else(folder_age))
        }
        _ => (false, folder_age()),
    };
    !vault_exists || unused_for.is_some_and(|age| age > UNUSED_AFTER)
}
