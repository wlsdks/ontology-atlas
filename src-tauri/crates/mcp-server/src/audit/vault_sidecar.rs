//! The files the server keeps beside a vault's Markdown, in `.ontology-atlas/`: opened, appended to,
//! read and replaced without ever leaving that folder or following a link out of it.
//!
//! A vault comes from Git or a sync client, so `.ontology-atlas` or a file in it may be a link a
//! stranger committed (`activity.jsonl -> ~/.ssh/authorized_keys`). Every operation therefore
//! checks that the folder is a real folder of the real vault, that the file is a regular file,
//! and that the file it opened is the file it checked.
//!
//! An append is one `write` on a handle opened for appending, the one call the platforms promise to
//! place at the end of the file whoever else appends: `O_APPEND` on macOS and Linux, and on Windows
//! `FILE_APPEND_DATA` without `FILE_WRITE_DATA`, which Rust's `OpenOptions::append` asks for
//! (Microsoft, "File Security and Access Rights": with only `FILE_APPEND_DATA`, writes go to the end
//! of the file). No lock is taken: a Windows byte-range lock is mandatory, so it would make the
//! app's own read of the log fail while an append is in flight, and the JavaScript server, which
//! shares these files for as long as both exist, takes none.

use std::fs::{File, Metadata, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use thiserror::Error;

const SIDECAR_FOLDER: &str = ".ontology-atlas";
/// How often an open that raced a delete or a create is tried again before the error is returned.
const OPEN_ATTEMPTS: usize = 3;

#[derive(Debug, Error)]
pub enum SidecarError {
    #[error("{0}")]
    Unsafe(&'static str),
    #[error("the sidecar file {0} changed during the operation; read it again and retry")]
    Changed(String),
    #[error("the sidecar file {0} is larger than the {1} bytes it may be read at")]
    TooLarge(String, u64),
    #[error(transparent)]
    Io(#[from] io::Error),
}

/// What a file looked like when it was read, so a replace can tell that someone wrote in between.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Revision {
    size: u64,
    modified_ns: i128,
    /// Unix change time; the creation time on Windows, which keeps no other.
    changed_ns: i128,
    /// Device and inode: the file, not its name. Windows offers neither on stable Rust.
    identity: (u64, u64),
}

#[cfg(unix)]
fn revision_of(metadata: &Metadata) -> Revision {
    use std::os::unix::fs::MetadataExt;
    Revision {
        size: metadata.size(),
        modified_ns: i128::from(metadata.mtime()) * 1_000_000_000
            + i128::from(metadata.mtime_nsec()),
        changed_ns: i128::from(metadata.ctime()) * 1_000_000_000
            + i128::from(metadata.ctime_nsec()),
        identity: (metadata.dev(), metadata.ino()),
    }
}

#[cfg(windows)]
fn revision_of(metadata: &Metadata) -> Revision {
    use std::os::windows::fs::MetadataExt;
    Revision {
        size: metadata.file_size(),
        modified_ns: i128::from(metadata.last_write_time()) * 100,
        changed_ns: i128::from(metadata.creation_time()) * 100,
        identity: (0, 0),
    }
}

#[cfg(unix)]
fn has_other_names(metadata: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    metadata.nlink() != 1
}

/// Windows exposes the link count only on nightly Rust; a hard link there needs the vault's own
/// owner to have made it.
#[cfg(windows)]
fn has_other_names(_: &Metadata) -> bool {
    false
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
    pub truncated: bool,
    pub ends_with_newline: bool,
}

/// The sidecar folder of one vault.
#[derive(Debug, Clone)]
pub struct VaultSidecar {
    vault: PathBuf,
}

/// A file name that is one plain name, so it cannot step out of the folder.
fn one_name(filename: &str) -> Result<&str, SidecarError> {
    let mut parts = Path::new(filename).components();
    match (parts.next(), parts.next()) {
        (Some(std::path::Component::Normal(name)), None) if name == filename => Ok(filename),
        _ => Err(SidecarError::Unsafe(
            "a sidecar file name must be one name directly below .ontology-atlas",
        )),
    }
}

fn is_real_directory(metadata: &Metadata) -> bool {
    metadata.is_dir() && !metadata.file_type().is_symlink()
}

impl VaultSidecar {
    pub fn new(vault: PathBuf) -> Self {
        Self { vault }
    }

    /// The folder, checked: a real folder (not a link or junction) whose real parent is the real
    /// vault. `None` when it does not exist and `create` is false.
    fn folder(&self, create: bool) -> Result<Option<PathBuf>, SidecarError> {
        let root = std::fs::canonicalize(&self.vault)
            .map_err(|_| SidecarError::Unsafe("the vault folder cannot be resolved safely"))?;
        let folder = root.join(SIDECAR_FOLDER);
        match std::fs::symlink_metadata(&folder) {
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                if !create {
                    return Ok(None);
                }
                create_private_folder(&folder)?;
            }
            Err(error) => return Err(error.into()),
        }
        match std::fs::symlink_metadata(&folder) {
            Ok(metadata) if is_real_directory(&metadata) => {}
            _ => {
                return Err(SidecarError::Unsafe(
                    "the .ontology-atlas folder must be a real folder, not a link or junction",
                ))
            }
        }
        let real = std::fs::canonicalize(&folder).map_err(|_| {
            SidecarError::Unsafe("the .ontology-atlas folder cannot be resolved safely")
        })?;
        if real.parent() != Some(root.as_path()) {
            return Err(SidecarError::Unsafe(
                "the .ontology-atlas folder resolves outside the vault",
            ));
        }
        Ok(Some(folder))
    }

    /// The file's own metadata, or `None` when it is absent; a link, a non-file or a file with
    /// another name is refused.
    fn regular_file(path: &Path) -> Result<Option<Metadata>, SidecarError> {
        match std::fs::symlink_metadata(path) {
            Ok(metadata) if metadata.is_file() && !has_other_names(&metadata) => Ok(Some(metadata)),
            Ok(_) => Err(SidecarError::Unsafe(
                "a sidecar entry must be a regular file with one name, not a link",
            )),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    /// The opened handle is the file that was checked, and the folder is still the folder.
    fn confirm_opened(
        &self,
        file: &File,
        checked: Option<&Metadata>,
    ) -> Result<Metadata, SidecarError> {
        let opened = file.metadata()?;
        if !opened.is_file() || opened.file_type().is_symlink() || has_other_names(&opened) {
            return Err(SidecarError::Unsafe(
                "a sidecar file changed identity while it was opened",
            ));
        }
        if let Some(checked) = checked {
            if revision_of(checked).identity != revision_of(&opened).identity {
                return Err(SidecarError::Unsafe(
                    "a sidecar file changed identity while it was opened",
                ));
            }
        }
        self.folder(false)?;
        Ok(opened)
    }

    /// The file's text, or `None` when there is no file; a file over `max_bytes` is not read.
    pub fn read_text(
        &self,
        filename: &str,
        max_bytes: u64,
    ) -> Result<Option<Stored>, SidecarError> {
        let filename = one_name(filename)?;
        let Some(folder) = self.folder(false)? else {
            return Ok(None);
        };
        let path = folder.join(filename);
        let Some(before) = Self::regular_file(&path)? else {
            return Ok(None);
        };
        if before.len() > max_bytes {
            return Err(SidecarError::TooLarge(filename.to_string(), max_bytes));
        }
        let mut file = open_for_reading(&path)?;
        self.confirm_opened(&file, Some(&before))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        let after = file.metadata()?;
        if revision_of(&before) != revision_of(&after) {
            return Err(SidecarError::Changed(filename.to_string()));
        }
        Ok(Some(Stored {
            text: String::from_utf8_lossy(&bytes).into_owned(),
            revision: revision_of(&after),
        }))
    }

    /// At most the last `max_bytes` of the file, starting at a whole line, whatever its size.
    pub fn read_tail(
        &self,
        filename: &str,
        max_bytes: u64,
    ) -> Result<Option<StoredTail>, SidecarError> {
        let filename = one_name(filename)?;
        let Some(folder) = self.folder(false)? else {
            return Ok(None);
        };
        let path = folder.join(filename);
        let Some(before) = Self::regular_file(&path)? else {
            return Ok(None);
        };
        let mut file = open_for_reading(&path)?;
        let opened = self.confirm_opened(&file, Some(&before))?;
        let start = opened.len().saturating_sub(max_bytes);
        file.seek(SeekFrom::Start(start))?;
        let mut bytes = Vec::new();
        (&mut file)
            .take(opened.len() - start)
            .read_to_end(&mut bytes)?;
        let after = file.metadata()?;
        if revision_of(&before) != revision_of(&after) {
            return Err(SidecarError::Changed(filename.to_string()));
        }
        let ends_with_newline = bytes.last().is_none_or(|byte| *byte == b'\n');
        let mut text = String::from_utf8_lossy(&bytes).into_owned();
        if start > 0 {
            text = match text.find('\n') {
                Some(line_start) => text.split_off(line_start + 1),
                None => String::new(),
            };
        }
        Ok(Some(StoredTail {
            text,
            revision: revision_of(&after),
            truncated: start > 0,
            ends_with_newline,
        }))
    }

    /// How many non-empty lines the file holds, counted without holding it in memory.
    pub fn count_lines(&self, filename: &str) -> Result<usize, SidecarError> {
        let filename = one_name(filename)?;
        let Some(folder) = self.folder(false)? else {
            return Ok(0);
        };
        let path = folder.join(filename);
        let Some(before) = Self::regular_file(&path)? else {
            return Ok(0);
        };
        let mut file = open_for_reading(&path)?;
        self.confirm_opened(&file, Some(&before))?;
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
    /// line another writer left without its newline (a process killed mid-write) is ended first, so
    /// this line is never glued to it and lost.
    pub fn append_line(&self, filename: &str, line: &str) -> Result<(), SidecarError> {
        let filename = one_name(filename)?;
        let folder = self.folder(true)?.ok_or(SidecarError::Unsafe(
            "the .ontology-atlas folder is missing",
        ))?;
        let path = folder.join(filename);
        let mut attempt = 0;
        loop {
            attempt += 1;
            let before = Self::regular_file(&path)?;
            let opened = match &before {
                Some(_) => open_for_appending(&path),
                None => create_for_appending(&path),
            };
            let mut file = match opened {
                Ok(file) => file,
                // Deleted, or created by another writer, between the check and the open.
                Err(error)
                    if attempt < OPEN_ATTEMPTS
                        && matches!(
                            error.kind(),
                            io::ErrorKind::NotFound | io::ErrorKind::AlreadyExists
                        ) =>
                {
                    continue
                }
                Err(error) => return Err(error.into()),
            };
            let opened = self.confirm_opened(&file, before.as_ref())?;
            let mut bytes = Vec::with_capacity(line.len() + 2);
            if opened.len() > 0 && !last_byte_is_newline(&mut file, opened.len())? {
                bytes.push(b'\n');
            }
            bytes.extend_from_slice(line.as_bytes());
            if !line.ends_with('\n') {
                bytes.push(b'\n');
            }
            file.write_all(&bytes)?;
            return Ok(());
        }
    }

    /// Replaces the file with `text`: a new file beside it, flushed, then renamed over it. It is
    /// refused if the file is not at `expected` (what an earlier read returned; the file as it is now
    /// when `None`) when the rename is about to happen, so a line another writer appended since is
    /// never discarded.
    pub fn replace_text(
        &self,
        filename: &str,
        text: &str,
        expected: Option<Revision>,
    ) -> Result<(), SidecarError> {
        let filename = one_name(filename)?;
        let folder = self.folder(true)?.ok_or(SidecarError::Unsafe(
            "the .ontology-atlas folder is missing",
        ))?;
        let path = folder.join(filename);
        let initial = Self::regular_file(&path)?;
        let required = expected.or_else(|| initial.as_ref().map(revision_of));
        if expected.is_some() && expected != initial.as_ref().map(revision_of) {
            return Err(SidecarError::Changed(filename.to_string()));
        }
        let temporary = folder.join(temporary_name(filename));
        let mut file = create_private_file(&temporary)?;
        let written = (|| -> Result<(), SidecarError> {
            self.confirm_opened(&file, None)?;
            if let Some(initial) = &initial {
                copy_mode(initial, &file)?;
            }
            file.write_all(text.as_bytes())?;
            file.sync_all()?;
            let now = Self::regular_file(&path)?.map(|metadata| revision_of(&metadata));
            if required != now {
                return Err(SidecarError::Changed(filename.to_string()));
            }
            self.folder(false)?;
            std::fs::rename(&temporary, &path)?;
            Ok(())
        })();
        if written.is_err() {
            drop(file);
            let _ = std::fs::remove_file(&temporary);
        }
        written
    }
}

/// The app's name for a file being written, `.<name>.oatlas-tmp-<pid>-<hex>-<hex>`, so the sweep
/// that clears debris after a crash recognises it.
fn temporary_name(filename: &str) -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    format!(
        ".{filename}.oatlas-tmp-{}-{nonce:x}-{:x}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

#[cfg(unix)]
fn create_private_folder(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    match std::fs::DirBuilder::new().mode(0o700).create(path) {
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        other => other,
    }
}

#[cfg(windows)]
fn create_private_folder(path: &Path) -> io::Result<()> {
    match std::fs::create_dir(path) {
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        other => other,
    }
}

/// Owner-only on a Unix file system; Windows files take the folder's access list.
fn private_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}

fn create_private_file(path: &Path) -> io::Result<File> {
    private_options().write(true).create_new(true).open(path)
}

/// `FILE_FLAG_OPEN_REPARSE_POINT`: open a link itself, not what it points to, so a link is seen as
/// one by the checks after the open.
#[cfg(windows)]
const OPEN_REPARSE_POINT: u32 = 0x0020_0000;

fn open_for_reading(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(OPEN_REPARSE_POINT);
    }
    options.open(path)
}

fn open_for_appending(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true).append(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(OPEN_REPARSE_POINT);
    }
    options.open(path)
}

/// `create_new` is `O_CREAT | O_EXCL`, which never follows a link that was planted at the name.
fn create_for_appending(path: &Path) -> io::Result<File> {
    private_options()
        .read(true)
        .append(true)
        .create_new(true)
        .open(path)
}

fn last_byte_is_newline(file: &mut File, length: u64) -> io::Result<bool> {
    file.seek(SeekFrom::Start(length - 1))?;
    let mut last = [0_u8; 1];
    file.read_exact(&mut last)?;
    Ok(last == *b"\n")
}

/// A replaced file keeps the permission bits of the one it replaces.
#[cfg(unix)]
fn copy_mode(original: &Metadata, file: &File) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    file.set_permissions(std::fs::Permissions::from_mode(
        original.permissions().mode() & 0o777,
    ))
}

#[cfg(windows)]
fn copy_mode(_: &Metadata, _: &File) -> io::Result<()> {
    Ok(())
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
        std::fs::read_to_string(vault.path().join(".ontology-atlas").join(name)).expect("file")
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
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 8 * 60);
        for line in lines {
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
            vault.path().join(".ontology-atlas/log.jsonl"),
            "first\ntorn",
        )
        .expect("a torn last line");
        sidecar.append_line("log.jsonl", "second").expect("appends");
        assert_eq!(file_text(&vault, "log.jsonl"), "first\ntorn\nsecond\n");
    }

    #[test]
    fn a_line_ends_in_a_newline_alone_on_every_platform() {
        let vault = vault();
        sidecar(&vault)
            .append_line("log.jsonl", "{\"a\":1}")
            .expect("appends");
        assert_eq!(
            std::fs::read(vault.path().join(".ontology-atlas/log.jsonl")).expect("bytes"),
            b"{\"a\":1}\n"
        );
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
        let leftovers: Vec<_> = std::fs::read_dir(vault.path().join(".ontology-atlas"))
            .expect("folder")
            .filter_map(Result::ok)
            .collect();
        assert_eq!(leftovers.len(), 1, "no temporary file stays behind");
    }

    #[test]
    fn the_tail_starts_at_a_whole_line_and_says_when_it_cut() {
        let vault = vault();
        let sidecar = sidecar(&vault);
        for line in ["aaaa", "bbbb", "cccc"] {
            sidecar.append_line("log.jsonl", line).expect("appends");
        }
        let tail = sidecar
            .read_tail("log.jsonl", 8)
            .expect("reads")
            .expect("a file");
        assert_eq!((tail.text.as_str(), tail.truncated), ("cccc\n", true));
        let whole = sidecar
            .read_tail("log.jsonl", 1000)
            .expect("reads")
            .expect("a file");
        assert_eq!(
            (whole.text.as_str(), whole.truncated),
            ("aaaa\nbbbb\ncccc\n", false)
        );
        assert!(whole.ends_with_newline);
        assert_eq!(sidecar.count_lines("log.jsonl").expect("counts"), 3);
    }

    #[test]
    fn a_name_that_is_not_one_plain_name_is_refused() {
        let vault = vault();
        let sidecar = sidecar(&vault);
        for name in ["", ".", "..", "a/b", "../x", "/etc/passwd"] {
            assert!(
                matches!(sidecar.append_line(name, "x"), Err(SidecarError::Unsafe(_))),
                "{name:?}"
            );
        }
        #[cfg(windows)]
        for name in ["a\\b", "C:x", "..\\x"] {
            assert!(
                matches!(sidecar.append_line(name, "x"), Err(SidecarError::Unsafe(_))),
                "{name:?}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_link_where_the_folder_or_a_file_belongs_is_refused_and_nothing_outside_is_written() {
        use std::os::unix::fs::symlink;
        let outside = tempfile::tempdir().expect("temp dir");
        let secret = outside.path().join("authorized_keys");
        std::fs::write(&secret, "keep\n").expect("secret");

        let linked_file = vault();
        std::fs::create_dir(linked_file.path().join(".ontology-atlas")).expect("folder");
        symlink(
            &secret,
            linked_file.path().join(".ontology-atlas/activity.jsonl"),
        )
        .expect("link");
        assert!(matches!(
            sidecar(&linked_file).append_line("activity.jsonl", "evil"),
            Err(SidecarError::Unsafe(_))
        ));

        let linked_folder = vault();
        symlink(outside.path(), linked_folder.path().join(".ontology-atlas")).expect("link");
        assert!(matches!(
            sidecar(&linked_folder).append_line("activity.jsonl", "evil"),
            Err(SidecarError::Unsafe(_))
        ));
        assert!(matches!(
            sidecar(&linked_folder).read_text("authorized_keys", 1 << 20),
            Err(SidecarError::Unsafe(_))
        ));

        let dangling = vault();
        std::fs::create_dir(dangling.path().join(".ontology-atlas")).expect("folder");
        symlink(
            outside.path().join("created-by-the-link"),
            dangling.path().join(".ontology-atlas/activity.jsonl"),
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
    fn a_file_with_a_second_name_is_refused_and_a_new_file_is_private() {
        use std::os::unix::fs::PermissionsExt;
        let vault = vault();
        let sidecar = sidecar(&vault);
        sidecar.append_line("log.jsonl", "one").expect("appends");
        let folder = vault.path().join(".ontology-atlas");
        let mode = |path: &Path| {
            std::fs::metadata(path)
                .expect("metadata")
                .permissions()
                .mode()
                & 0o777
        };
        assert_eq!(mode(&folder), 0o700);
        assert_eq!(mode(&folder.join("log.jsonl")), 0o600);
        std::fs::hard_link(folder.join("log.jsonl"), vault.path().join("alias.md")).expect("link");
        assert!(matches!(
            sidecar.append_line("log.jsonl", "two"),
            Err(SidecarError::Unsafe(_))
        ));
    }

    /// Windows hands an unprivileged user a junction but not a symbolic link
    /// (`mklink /J`, Microsoft "Hard Links and Junctions"), and Rust's `FileType::is_symlink` is true
    /// for a junction because it tests the reparse tag's name-surrogate bit, so the folder check
    /// that refuses a link refuses a junction too.
    #[cfg(windows)]
    #[test]
    fn a_junction_in_place_of_the_folder_is_refused() {
        let outside = tempfile::tempdir().expect("temp dir");
        let vault = vault();
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(vault.path().join(".ontology-atlas"))
            .arg(outside.path())
            .status()
            .expect("cmd runs");
        assert!(status.success());
        assert!(matches!(
            sidecar(&vault).append_line("activity.jsonl", "evil"),
            Err(SidecarError::Unsafe(_))
        ));
        assert!(!outside.path().join("activity.jsonl").exists());
    }
}
