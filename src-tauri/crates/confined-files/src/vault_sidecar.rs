//! The files the server keeps beside a vault's Markdown, in `.ontology-atlas/`: opened, appended to,
//! read and replaced without leaving that folder or following a link out of it.
//!
//! The folder must be a real folder (not a link or junction) whose real parent is the real vault.
//! Each file is opened by [`crate::plain_file`], which never follows a link and judges the handle it
//! opened. The folder is checked again after every open: a swap of the folder for a link between the
//! check and the open is noticed, though the file may already have been touched. Closing that gap
//! needs `openat` on an open folder, which is not done here.
//!
//! # What an append promises
//!
//! An append is one `write` on a handle opened for appending, and no lock is taken.
//!
//! - POSIX (macOS, Linux): with `O_APPEND`, "the file offset shall be set to the end of the file prior
//!   to each write and no intervening file modification operation shall occur between changing the
//!   file offset and the write operation" (`write()`, POSIX.1-2017). It does not promise that the
//!   bytes of a long write stay together if the write is cut short (a full disk, a signal), and it does
//!   not hold on network file systems: NFS clients emulate append, so two machines can overwrite
//!   each other.
//! - Windows: a handle with `FILE_APPEND_DATA` and without `FILE_WRITE_DATA` writes at the end of
//!   the file; the access-rights documentation says so "for local files" (Microsoft, "File Access
//!   Rights Constants"). A network drive (SMB) is not promised.
//!
//! So lines from several local writers arrive whole and in some order. A writer killed mid-write can
//! leave a last line with no newline; the next append ends it first, so that line is never glued to
//! a new one and lost. Locks are not used: a Windows byte-range lock is mandatory, so it would make
//! the app's own read of a log fail while an append is in flight, and the JavaScript server, which
//! shares these files for as long as both exist, takes none.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use thiserror::Error;

use crate::modified_time::ModifiedTime;
use crate::plain_file::{self, FileFacts};
use crate::real_paths::real_path;
use crate::temporary_name::next_atomic_temporary_name;

const SIDECAR_FOLDER: &str = ".ontology-atlas";
/// How often an open that raced a delete or a create is tried again before the error is returned.
const OPEN_ATTEMPTS: usize = 3;

/// Why a sidecar path was refused before anything was changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum Unsafe {
    #[error("a sidecar file name must be one name directly below .ontology-atlas")]
    NotOneName,
    #[error("the vault folder cannot be resolved safely")]
    VaultUnresolvable,
    #[error("the .ontology-atlas folder must be a real folder, not a link or junction")]
    FolderIsLink,
    #[error("the .ontology-atlas folder cannot be resolved safely")]
    FolderUnresolvable,
    #[error("the .ontology-atlas folder resolves outside the vault")]
    FolderOutsideVault,
    #[error("a sidecar entry must be a regular file with one name, not a link")]
    EntryNotPlainFile,
    #[error("a sidecar file changed identity while it was opened")]
    EntryChangedWhileOpened,
}

#[derive(Debug, Error)]
pub enum SidecarError {
    #[error(transparent)]
    Unsafe(#[from] Unsafe),
    #[error("the sidecar file {0} changed during the operation; read it again and retry")]
    Changed(String),
    #[error("the sidecar file {0} is larger than the {1} bytes it may be read at")]
    TooLarge(String, u64),
    #[error(transparent)]
    Io(#[from] io::Error),
}

/// What a file looked like when it was read, so a replace can tell that someone wrote in between.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Revision(FileFacts);

impl Revision {
    /// The modification time of this version, as Node reports `mtimeMs`.
    pub fn modified_time(self) -> ModifiedTime {
        ModifiedTime::from_nanoseconds(self.0.modified_ns)
    }
}

/// The text of a file and the revision it was read at.
#[derive(Debug)]
pub struct Stored {
    pub text: String,
    pub revision: Revision,
}

/// At most the last bytes of a file, from a whole line on.
#[derive(Debug)]
pub struct StoredTail {
    pub text: String,
    pub revision: Revision,
}

/// The sidecar folder of one vault, or one folder directly below it.
#[derive(Debug, Clone)]
pub struct VaultSidecar {
    vault: PathBuf,
    below: Option<&'static str>,
}

/// The names in the folder, one at a time, so a folder of a hundred thousand files is never held.
/// A name that is not valid text is skipped: no file the server writes has one.
pub struct FileNames(Option<std::fs::ReadDir>);

impl Iterator for FileNames {
    type Item = io::Result<String>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            match self.0.as_mut()?.next()? {
                Err(error) => return Some(Err(error)),
                Ok(entry) => {
                    if let Ok(name) = entry.file_name().into_string() {
                        return Some(Ok(name));
                    }
                }
            }
        }
    }
}

/// A file name that is one plain name, so it cannot step out of the folder.
fn one_name(filename: &str) -> Result<&str, Unsafe> {
    let mut parts = Path::new(filename).components();
    match (parts.next(), parts.next()) {
        (Some(std::path::Component::Normal(name)), None) if name == filename => Ok(filename),
        _ => Err(Unsafe::NotOneName),
    }
}

/// Maps the refusal of an open (a link met by `O_NOFOLLOW`) to the reason it is safe to say.
fn open_error(error: io::Error) -> SidecarError {
    if plain_file::is_link_refusal(&error) {
        Unsafe::EntryNotPlainFile.into()
    } else {
        error.into()
    }
}

/// The facts of an opened file, refused unless it is plain.
fn plain_facts(file: &File) -> Result<FileFacts, SidecarError> {
    let facts = plain_file::facts_of(file)?;
    if facts.plain {
        Ok(facts)
    } else {
        Err(Unsafe::EntryNotPlainFile.into())
    }
}

impl VaultSidecar {
    pub fn new(vault: PathBuf) -> Self {
        Self { vault, below: None }
    }

    /// The folder `name` directly below `.ontology-atlas`, held to the same rules as the folder
    /// above it: a real folder, not a link or junction, whose real parent is the real folder above.
    pub fn below(&self, name: &'static str) -> Self {
        Self {
            vault: self.vault.clone(),
            below: Some(name),
        }
    }

    /// One folder, checked: a real folder whose real parent is `parent`. `None` when it does not
    /// exist and `create` is false.
    fn checked_child(
        parent: &Path,
        name: &str,
        create: bool,
    ) -> Result<Option<PathBuf>, SidecarError> {
        let folder = parent.join(name);
        match folder.symlink_metadata() {
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                if !create {
                    return Ok(None);
                }
                create_private_folder(&folder)?;
            }
            Err(error) => return Err(error.into()),
        }
        match folder.symlink_metadata() {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            _ => return Err(Unsafe::FolderIsLink.into()),
        }
        let real = real_path(&folder).map_err(|_| Unsafe::FolderUnresolvable)?;
        if real.parent() != Some(parent) {
            return Err(Unsafe::FolderOutsideVault.into());
        }
        Ok(Some(folder))
    }

    /// The folder files are kept in, checked at every level from the vault down. `None` when it
    /// does not exist and `create` is false.
    fn folder(&self, create: bool) -> Result<Option<PathBuf>, SidecarError> {
        let root = real_path(&self.vault).map_err(|_| Unsafe::VaultUnresolvable)?;
        let Some(sidecar) = Self::checked_child(&root, SIDECAR_FOLDER, create)? else {
            return Ok(None);
        };
        let Some(name) = self.below else {
            return Ok(Some(sidecar));
        };
        let real_sidecar = real_path(&sidecar).map_err(|_| Unsafe::FolderUnresolvable)?;
        Self::checked_child(&real_sidecar, name, create)
    }

    /// The folder is still the folder after a file was opened in it.
    fn still_inside(&self) -> Result<(), SidecarError> {
        match self.folder(false)? {
            Some(_) => Ok(()),
            None => Err(Unsafe::EntryChangedWhileOpened.into()),
        }
    }

    /// The file opened for reading and its facts, `None` when there is no file.
    fn open_for_reading(&self, filename: &str) -> Result<Option<(File, FileFacts)>, SidecarError> {
        let filename = one_name(filename)?;
        let Some(folder) = self.folder(false)? else {
            return Ok(None);
        };
        let file = match plain_file::open_read(&folder.join(filename)) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(open_error(error)),
        };
        let facts = plain_facts(&file)?;
        self.still_inside()?;
        Ok(Some((file, facts)))
    }

    /// The names of the entries of the folder, files or not; none when the folder does not exist.
    pub fn file_names(&self) -> Result<FileNames, SidecarError> {
        let Some(folder) = self.folder(false)? else {
            return Ok(FileNames(None));
        };
        let names = std::fs::read_dir(folder)?;
        self.still_inside()?;
        Ok(FileNames(Some(names)))
    }

    /// The file's text, or `None` when there is no file; a file over `max_bytes` is not read.
    pub fn read_text(
        &self,
        filename: &str,
        max_bytes: u64,
    ) -> Result<Option<Stored>, SidecarError> {
        let Some((mut file, before)) = self.open_for_reading(filename)? else {
            return Ok(None);
        };
        if before.size > max_bytes {
            return Err(SidecarError::TooLarge(filename.to_string(), max_bytes));
        }
        // One byte past the limit: a file that grew after its size was read is refused, not held.
        let mut bytes = Vec::new();
        (&mut file).take(max_bytes + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > max_bytes {
            return Err(SidecarError::TooLarge(filename.to_string(), max_bytes));
        }
        let after = plain_facts(&file)?;
        if before != after {
            return Err(SidecarError::Changed(filename.to_string()));
        }
        Ok(Some(Stored {
            text: String::from_utf8_lossy(&bytes).into_owned(),
            revision: Revision(after),
        }))
    }

    /// At most the last `max_bytes` of the file, starting at a whole line, whatever its size.
    pub fn read_tail(
        &self,
        filename: &str,
        max_bytes: u64,
    ) -> Result<Option<StoredTail>, SidecarError> {
        let Some((mut file, before)) = self.open_for_reading(filename)? else {
            return Ok(None);
        };
        let start = before.size.saturating_sub(max_bytes);
        file.seek(SeekFrom::Start(start))?;
        let mut bytes = Vec::new();
        (&mut file)
            .take(before.size - start)
            .read_to_end(&mut bytes)?;
        let after = plain_facts(&file)?;
        if before != after {
            return Err(SidecarError::Changed(filename.to_string()));
        }
        let mut text = String::from_utf8_lossy(&bytes).into_owned();
        if start > 0 {
            text = match text.find('\n') {
                Some(line_start) => text.split_off(line_start + 1),
                None => String::new(),
            };
        }
        Ok(Some(StoredTail {
            text,
            revision: Revision(after),
        }))
    }

    /// How many non-empty lines the file holds, counted without holding it in memory.
    pub fn count_lines(&self, filename: &str) -> Result<usize, SidecarError> {
        let Some((mut file, _)) = self.open_for_reading(filename)? else {
            return Ok(0);
        };
        let mut buffer = vec![0_u8; 64 * 1024];
        let (mut lines, mut line_has_text) = (0_usize, false);
        loop {
            let read = file.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            for byte in buffer.iter().take(read) {
                if *byte == b'\n' {
                    lines += usize::from(line_has_text);
                    line_has_text = false;
                } else {
                    line_has_text = true;
                }
            }
        }
        Ok(lines + usize::from(line_has_text))
    }

    /// Adds `line` and a newline at the end of the file, creating the folder and the file. A last
    /// line another writer left without its newline is ended first.
    pub fn append_line(&self, filename: &str, line: &str) -> Result<(), SidecarError> {
        let filename = one_name(filename)?;
        let folder = self.folder(true)?.ok_or(Unsafe::EntryChangedWhileOpened)?;
        let path = folder.join(filename);
        let mut attempt = 0;
        let mut file = loop {
            attempt += 1;
            // An existing file first; a name that is absent is created, never followed.
            let opened = match plain_file::open_append(&path) {
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    plain_file::create_append(&path)
                }
                other => other,
            };
            match opened {
                Ok(file) => break file,
                // Created by another writer, or deleted, between the two opens.
                Err(error)
                    if attempt < OPEN_ATTEMPTS
                        && matches!(
                            error.kind(),
                            io::ErrorKind::NotFound | io::ErrorKind::AlreadyExists
                        ) => {}
                Err(error) => return Err(open_error(error)),
            }
        };
        let facts = plain_facts(&file)?;
        self.still_inside()?;
        let mut bytes = Vec::with_capacity(line.len() + 2);
        if facts.size > 0 && !last_byte_is_newline(&mut file, facts.size)? {
            bytes.push(b'\n');
        }
        bytes.extend_from_slice(line.as_bytes());
        if !line.ends_with('\n') {
            bytes.push(b'\n');
        }
        file.write_all(&bytes)?;
        Ok(())
    }

    /// Replaces the file with `text`: a new file beside it, flushed, then renamed over it and the
    /// folder flushed. It is refused if the file is not at `expected` (what an earlier read
    /// returned; the file as it is now when `None`) when the rename is about to happen, so a line
    /// another writer appended since is never discarded.
    pub fn replace_text(
        &self,
        filename: &str,
        text: &str,
        expected: Option<Revision>,
    ) -> Result<(), SidecarError> {
        let filename = one_name(filename)?;
        let folder = self.folder(true)?.ok_or(Unsafe::EntryChangedWhileOpened)?;
        let path = folder.join(filename);
        let initial = current_revision(&path)?;
        let required = expected.or(initial);
        if expected.is_some() && expected != initial {
            return Err(SidecarError::Changed(filename.to_string()));
        }
        let temporary = folder.join(next_atomic_temporary_name(filename));
        let mut file = plain_file::create_new(&temporary)?;
        let written = (|| -> Result<(), SidecarError> {
            plain_facts(&file)?;
            if let Ok(existing) = std::fs::metadata(&path) {
                // The replacement keeps the file's permission bits: a log the person made group
                // readable stays so.
                file.set_permissions(existing.permissions())?;
            }
            file.write_all(text.as_bytes())?;
            file.sync_all()?;
            if required != current_revision(&path)? {
                return Err(SidecarError::Changed(filename.to_string()));
            }
            self.still_inside()?;
            std::fs::rename(&temporary, &path)?;
            Ok(())
        })();
        drop(file);
        if written.is_err() {
            let _ = std::fs::remove_file(&temporary);
        } else {
            flush_folder(&folder);
        }
        written
    }
}

/// The revision of the file at `path`, `None` when there is none.
fn current_revision(path: &Path) -> Result<Option<Revision>, SidecarError> {
    match plain_file::open_read(path) {
        Ok(file) => Ok(Some(Revision(plain_facts(&file)?))),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(open_error(error)),
    }
}

#[cfg(unix)]
fn create_private_folder(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    match std::fs::DirBuilder::new().mode(0o700).create(path) {
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        other => other,
    }
}

/// A Windows folder takes the access list of the folder above it.
#[cfg(windows)]
fn create_private_folder(path: &Path) -> io::Result<()> {
    match std::fs::create_dir(path) {
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        other => other,
    }
}

/// After the rename, so the new name survives a power loss. Best effort: it cannot undo the rename,
/// and Windows has no call to flush a folder.
fn flush_folder(folder: &Path) {
    #[cfg(unix)]
    if let Ok(handle) = File::open(folder) {
        let _ = handle.sync_all();
    }
    #[cfg(windows)]
    let _ = folder;
}

fn last_byte_is_newline(file: &mut File, length: u64) -> io::Result<bool> {
    file.seek(SeekFrom::Start(length - 1))?;
    let mut last = [0_u8; 1];
    file.read_exact(&mut last)?;
    Ok(last == *b"\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> tempfile::TempDir {
        tempfile::tempdir().expect("temp dir")
    }

    fn sidecar(vault: &tempfile::TempDir) -> VaultSidecar {
        VaultSidecar::new(vault.path().to_path_buf())
    }

    fn file_text(vault: &tempfile::TempDir, name: &str) -> String {
        std::fs::read_to_string(vault.path().join(SIDECAR_FOLDER).join(name)).expect("file")
    }

    fn unsafe_reason(result: Result<(), SidecarError>) -> Option<Unsafe> {
        match result {
            Err(SidecarError::Unsafe(reason)) => Some(reason),
            _ => None,
        }
    }

    #[test]
    fn lines_appended_by_many_writers_at_once_arrive_whole_and_in_full() {
        let vault = vault();
        let writers: Vec<_> = (0..8)
            .map(|writer| {
                let sidecar = sidecar(&vault);
                std::thread::spawn(move || {
                    for index in 0..60 {
                        // Long enough that a write split in two would show.
                        let line = format!(
                            "{{\"writer\":{writer},\"index\":{index},\"pad\":\"{}\"}}",
                            "x".repeat(3000)
                        );
                        sidecar.append_line("log.jsonl", &line).expect("appends");
                    }
                })
            })
            .collect();
        for writer in writers {
            writer.join().expect("joined");
        }
        let text = file_text(&vault, "log.jsonl");
        assert_eq!(text.lines().count(), 8 * 60);
        for line in text.lines() {
            let parsed: serde_json::Value = serde_json::from_str(line).expect("a whole line");
            assert_eq!(parsed["pad"].as_str().map(str::len), Some(3000));
        }
    }

    #[test]
    fn a_line_left_without_its_newline_is_ended_so_the_next_line_is_not_lost() {
        let vault = vault();
        let sidecar = sidecar(&vault);
        sidecar.append_line("log.jsonl", "first").expect("appends");
        std::fs::write(
            vault.path().join(SIDECAR_FOLDER).join("log.jsonl"),
            "first\ntorn",
        )
        .expect("a torn last line");
        sidecar.append_line("log.jsonl", "second").expect("appends");
        assert_eq!(file_text(&vault, "log.jsonl"), "first\ntorn\nsecond\n");
    }

    #[test]
    fn a_replace_that_finds_the_file_changed_since_it_was_read_writes_nothing() {
        let vault = vault();
        let sidecar = sidecar(&vault);
        sidecar.append_line("log.jsonl", "one").expect("appends");
        let read = sidecar
            .read_text("log.jsonl", 1 << 20)
            .expect("reads")
            .expect("a file");
        sidecar.append_line("log.jsonl", "two").expect("appends");
        let refused = sidecar.replace_text("log.jsonl", "folded\n", Some(read.revision));
        assert!(
            matches!(refused, Err(SidecarError::Changed(_))),
            "{refused:?}"
        );
        assert_eq!(file_text(&vault, "log.jsonl"), "one\ntwo\n");
        let read = sidecar
            .read_text("log.jsonl", 1 << 20)
            .expect("reads")
            .expect("a file");
        sidecar
            .replace_text("log.jsonl", "folded\n", Some(read.revision))
            .expect("replaces");
        assert_eq!(file_text(&vault, "log.jsonl"), "folded\n");
        let entries = std::fs::read_dir(vault.path().join(SIDECAR_FOLDER))
            .expect("folder")
            .count();
        assert_eq!(entries, 1, "no temporary file stays behind");
    }

    #[test]
    fn the_tail_starts_at_a_whole_line_and_lines_are_counted() {
        let vault = vault();
        let sidecar = sidecar(&vault);
        for line in ["aaaa", "bbbb", "cccc"] {
            sidecar.append_line("log.jsonl", line).expect("appends");
        }
        let tail = sidecar
            .read_tail("log.jsonl", 8)
            .expect("reads")
            .expect("a file");
        assert_eq!(tail.text, "cccc\n");
        let whole = sidecar
            .read_tail("log.jsonl", 1000)
            .expect("reads")
            .expect("a file");
        assert_eq!(whole.text, "aaaa\nbbbb\ncccc\n");
        assert_eq!(sidecar.count_lines("log.jsonl").expect("counts"), 3);
        let too_large = sidecar.read_text("log.jsonl", 4);
        assert!(matches!(too_large, Err(SidecarError::TooLarge(..))));
    }

    #[test]
    fn a_name_that_is_not_one_plain_name_is_refused() {
        let vault = vault();
        let sidecar = sidecar(&vault);
        for name in ["", ".", "..", "a/b", "../x", "/etc/passwd"] {
            assert_eq!(
                unsafe_reason(sidecar.append_line(name, "x")),
                Some(Unsafe::NotOneName),
                "{name:?}"
            );
        }
        #[cfg(windows)]
        for name in ["a\\b", "C:x", "..\\x"] {
            assert_eq!(
                unsafe_reason(sidecar.append_line(name, "x")),
                Some(Unsafe::NotOneName),
                "{name:?}"
            );
        }
    }

    /// A second name for a sidecar file is how a stranger points the app at a file elsewhere:
    /// `std::fs::hard_link` makes one on every platform, and the link count is read from the
    /// open handle (`st_nlink`; `nNumberOfLinks` on Windows).
    #[test]
    fn a_file_with_a_second_name_is_refused() {
        let vault = vault();
        let sidecar = sidecar(&vault);
        sidecar.append_line("log.jsonl", "one").expect("appends");
        let folder = vault.path().join(SIDECAR_FOLDER);
        std::fs::hard_link(folder.join("log.jsonl"), vault.path().join("alias.md")).expect("link");
        assert_eq!(
            unsafe_reason(sidecar.append_line("log.jsonl", "two")),
            Some(Unsafe::EntryNotPlainFile)
        );
        assert!(matches!(
            sidecar.read_text("log.jsonl", 1 << 20),
            Err(SidecarError::Unsafe(Unsafe::EntryNotPlainFile))
        ));
        assert_eq!(file_text(&vault, "log.jsonl"), "one\n");
    }

    #[cfg(unix)]
    #[test]
    fn a_link_where_the_folder_or_a_file_belongs_is_refused_and_nothing_outside_is_written() {
        use std::os::unix::fs::symlink;
        let outside = tempfile::tempdir().expect("temp dir");
        let secret = outside.path().join("authorized_keys");
        std::fs::write(&secret, "keep\n").expect("secret");

        let linked_file = vault();
        std::fs::create_dir(linked_file.path().join(SIDECAR_FOLDER)).expect("folder");
        symlink(
            &secret,
            linked_file
                .path()
                .join(SIDECAR_FOLDER)
                .join("activity.jsonl"),
        )
        .expect("link");
        assert_eq!(
            unsafe_reason(sidecar(&linked_file).append_line("activity.jsonl", "evil")),
            Some(Unsafe::EntryNotPlainFile)
        );

        let linked_folder = vault();
        symlink(outside.path(), linked_folder.path().join(SIDECAR_FOLDER)).expect("link");
        assert_eq!(
            unsafe_reason(sidecar(&linked_folder).append_line("activity.jsonl", "evil")),
            Some(Unsafe::FolderIsLink)
        );
        assert!(matches!(
            sidecar(&linked_folder).read_text("authorized_keys", 1 << 20),
            Err(SidecarError::Unsafe(Unsafe::FolderIsLink))
        ));

        let dangling = vault();
        std::fs::create_dir(dangling.path().join(SIDECAR_FOLDER)).expect("folder");
        symlink(
            outside.path().join("created-by-the-link"),
            dangling.path().join(SIDECAR_FOLDER).join("activity.jsonl"),
        )
        .expect("link");
        assert!(sidecar(&dangling)
            .append_line("activity.jsonl", "evil")
            .is_err());

        assert_eq!(std::fs::read_to_string(&secret).expect("secret"), "keep\n");
        assert!(!outside.path().join("created-by-the-link").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_replaced_file_keeps_the_permission_bits_it_had() {
        use std::os::unix::fs::PermissionsExt;
        let vault = vault();
        let sidecar = sidecar(&vault);
        sidecar.append_line("log.jsonl", "one").expect("appends");
        let file = vault.path().join(SIDECAR_FOLDER).join("log.jsonl");
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).expect("chmod");
        sidecar
            .replace_text("log.jsonl", "two\n", None)
            .expect("replaces");
        let mode = std::fs::metadata(&file).expect("metadata").permissions().mode() & 0o777;
        assert_eq!(mode, 0o644);
    }

    #[cfg(unix)]
    #[test]
    fn a_new_folder_and_file_are_private_to_the_owner() {
        use std::os::unix::fs::PermissionsExt;
        let vault = vault();
        sidecar(&vault)
            .append_line("log.jsonl", "one")
            .expect("appends");
        let folder = vault.path().join(SIDECAR_FOLDER);
        let mode = |path: &Path| {
            std::fs::metadata(path)
                .expect("metadata")
                .permissions()
                .mode()
                & 0o777
        };
        assert_eq!(mode(&folder), 0o700);
        assert_eq!(mode(&folder.join("log.jsonl")), 0o600);
    }

    /// Windows hands an unprivileged user a junction but not a symbolic link (`mklink /J`,
    /// Microsoft "Hard Links and Junctions"). Rust's `FileType::is_symlink` is true for a junction
    /// because it tests the reparse tag's name-surrogate bit, and the folder's real parent must
    /// still be the vault, so a junction in place of the folder is refused.
    #[cfg(windows)]
    #[test]
    fn a_junction_in_place_of_the_folder_is_refused() {
        let outside = tempfile::tempdir().expect("temp dir");
        let vault = vault();
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(vault.path().join(SIDECAR_FOLDER))
            .arg(outside.path())
            .status()
            .expect("cmd runs");
        assert!(status.success());
        assert!(unsafe_reason(sidecar(&vault).append_line("activity.jsonl", "evil")).is_some());
        assert!(!outside.path().join("activity.jsonl").exists());
    }
    #[test]
    fn a_folder_below_the_sidecar_lists_its_names_and_reads_its_files_where_none_means_none() {
        let vault = vault();
        let analyses = sidecar(&vault).below("analyses");
        assert_eq!(analyses.file_names().expect("lists").count(), 0);
        assert!(analyses.read_text("a.md", 100).expect("reads").is_none());
        let folder = vault.path().join(SIDECAR_FOLDER).join("analyses");
        std::fs::create_dir_all(&folder).expect("folder");
        std::fs::write(folder.join("a.md"), "text").expect("file");
        std::fs::write(folder.join("b.md"), "more").expect("file");
        let mut names: Vec<String> = analyses
            .file_names()
            .expect("lists")
            .collect::<Result<_, _>>()
            .expect("names");
        names.sort();
        assert_eq!(names, ["a.md", "b.md"]);
        let read = analyses
            .read_text("a.md", 100)
            .expect("reads")
            .expect("a file");
        assert_eq!(read.text, "text");
        assert!(
            sidecar(&vault)
                .read_text("a.md", 100)
                .expect("reads")
                .is_none(),
            "the folder above does not hold the file"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_link_in_place_of_a_folder_below_the_sidecar_is_refused() {
        use std::os::unix::fs::symlink;
        let outside = tempfile::tempdir().expect("temp dir");
        std::fs::write(outside.path().join("a.md"), "secret").expect("file");
        let vault = vault();
        std::fs::create_dir(vault.path().join(SIDECAR_FOLDER)).expect("folder");
        symlink(
            outside.path(),
            vault.path().join(SIDECAR_FOLDER).join("analyses"),
        )
        .expect("link");
        let analyses = sidecar(&vault).below("analyses");
        assert!(matches!(
            analyses.file_names(),
            Err(SidecarError::Unsafe(Unsafe::FolderIsLink))
        ));
        assert!(matches!(
            analyses.read_text("a.md", 100),
            Err(SidecarError::Unsafe(Unsafe::FolderIsLink))
        ));
    }
}
