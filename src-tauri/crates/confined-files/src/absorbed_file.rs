//! The one file `absorb_document` rewrites: named by an absolute or relative path a person or agent
//! typed, usually outside the vault (a repository's `AGENTS.md`), so it cannot be a vault slug.
//!
//! What stands in for the vault's confinement is a list of refusals made once, here, before the
//! tool sees a byte: the name must be a plain Markdown file's (never hidden, never a credential, never
//! a Windows device), the real path (every link resolved) is what is judged and what is rewritten,
//! and the text must be UTF-8 and within [`ABSORBED_FILE_MAX_BYTES`], so a rewrite never changes bytes
//! it did not read. Whether the real path lies inside the repository is a fact the tool reports and
//! gates on; it is not a refusal here.

use std::io;
use std::path::{Path, PathBuf};

use crate::confined_root::resolve_path;
use crate::modified_time::ModifiedTime;
use crate::os_error::IoFailure;
use crate::plain_parts::is_not_a_file_name;
use crate::private_names::{is_credential_name, is_hidden_name};
use crate::real_paths::{is_within_folding_case, real_path};
use crate::vault_root::{ConfinedPath, WritablePath};

/// The most bytes of a document `absorb_document` reads: far above any rules file, far below memory.
pub const ABSORBED_FILE_MAX_BYTES: u64 = 16 * 1024 * 1024;

/// The suffix of the copy kept beside the source before it is rewritten.
pub const ABSORB_BACKUP_SUFFIX: &str = ".pre-absorb.bak";

/// Why a path is not a file to absorb.
#[derive(Debug, thiserror::Error)]
pub enum AbsorbedFileRefusal {
    /// Nothing regular is there (a missing path, a folder), reached through links.
    #[error("file not found: {}", .0.display())]
    NotFound(PathBuf),
    #[error("{name} is not a Markdown file: absorb_document reads `.md` files only")]
    NotMarkdown { name: String },
    #[error("{name} is a hidden file or has the name of a credential, so it is never read")]
    PrivateName { name: String },
    #[error("{name} is a Windows device or stream name, not a file name")]
    DeviceName { name: String },
    #[error("{} is {bytes} bytes; absorb_document reads at most {max} bytes", .path.display())]
    TooLarge { path: PathBuf, bytes: u64, max: u64 },
    #[error("{} is not UTF-8 text, so rewriting it would change bytes that were not read", .0.display())]
    NotText(PathBuf),
    #[error(transparent)]
    Io(#[from] IoFailure),
}

/// A document opened for absorption: its real path, its text and the time it had.
#[derive(Debug, Clone)]
pub struct AbsorbedFile {
    real: PathBuf,
    outside_repository: bool,
    text: String,
    modified: Option<ModifiedTime>,
}

fn final_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn refuse_name(name: &str) -> Result<(), AbsorbedFileRefusal> {
    let owned = || name.to_string();
    if is_not_a_file_name(name) {
        return Err(AbsorbedFileRefusal::DeviceName { name: owned() });
    }
    if is_hidden_name(name) || is_credential_name(name) {
        return Err(AbsorbedFileRefusal::PrivateName { name: owned() });
    }
    if !name.to_ascii_lowercase().ends_with(".md") {
        return Err(AbsorbedFileRefusal::NotMarkdown { name: owned() });
    }
    Ok(())
}

impl AbsorbedFile {
    /// Opens `requested` (resolved against the working folder like any relative path) for
    /// absorption. `repository` is the folder whose inside needs no extra consent.
    pub fn open(requested: &str, repository: &Path) -> Result<Self, AbsorbedFileRefusal> {
        let base = std::env::current_dir()
            .map_err(|source| IoFailure::new("cwd", PathBuf::from("."), source))?;
        let resolved = resolve_path(&base, Path::new(requested));
        let is_file = std::fs::metadata(&resolved).is_ok_and(|metadata| metadata.is_file());
        if !is_file {
            return Err(AbsorbedFileRefusal::NotFound(resolved));
        }
        // The name typed and the name it resolves to: a harmless link to `.env` is still `.env`.
        refuse_name(&final_name(&resolved))?;
        let real = real_path(&resolved).map_err(|source| IoFailure::new("realpath", &resolved, source))?;
        refuse_name(&final_name(&real))?;
        let repository_real = real_path(repository)
            .map_err(|source| IoFailure::new("realpath", repository, source))?;
        let outside_repository = !is_within_folding_case(&repository_real, &real);
        let (text, modified) = read_text(&real)?;
        Ok(Self {
            real,
            outside_repository,
            text,
            modified,
        })
    }

    /// The path with every link resolved: the file that is read and rewritten.
    pub fn path(&self) -> &Path {
        &self.real
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn modified_time(&self) -> Option<ModifiedTime> {
        self.modified
    }

    pub fn is_outside_repository(&self) -> bool {
        self.outside_repository
    }

    /// How a node's `source:` names this file from the vault: the path below the vault's real
    /// folder, `../` parts included, written with `/` on every system. A file on another Windows
    /// drive is named by its whole path, as no relative path reaches it.
    pub fn reference_from(&self, vault: &Path) -> String {
        let vault_real = real_path(vault).unwrap_or_else(|_| vault.to_path_buf());
        let from: Vec<_> = vault_real.components().collect();
        let to: Vec<_> = self.real.components().collect();
        let shared = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
        if shared == 0 {
            return self.real.to_string_lossy().replace('\\', "/");
        }
        let mut parts: Vec<String> = Vec::new();
        parts.extend(from.iter().skip(shared).map(|_| "..".to_string()));
        parts.extend(to.iter().skip(shared).map(|part| part.as_os_str().to_string_lossy().into_owned()));
        parts.join("/")
    }

    /// Where the copy of the original is kept.
    pub fn backup_path(&self) -> PathBuf {
        let mut name = self.real.clone().into_os_string();
        name.push(ABSORB_BACKUP_SUFFIX);
        PathBuf::from(name)
    }

    pub fn backup_exists(&self) -> bool {
        std::fs::symlink_metadata(self.backup_path()).is_ok()
    }

    /// The source as a path a plan may rewrite.
    pub fn writable_source(&self) -> WritablePath {
        WritablePath::from_confined(ConfinedPath::new(self.real.clone()))
    }

    /// The backup as a path a plan may create.
    pub fn writable_backup(&self) -> WritablePath {
        WritablePath::from_confined(ConfinedPath::new(self.backup_path()))
    }
}

fn read_text(path: &Path) -> Result<(String, Option<ModifiedTime>), AbsorbedFileRefusal> {
    let io = |source: io::Error| AbsorbedFileRefusal::from(IoFailure::new("read", path, source));
    let metadata = std::fs::metadata(path).map_err(io)?;
    if metadata.len() > ABSORBED_FILE_MAX_BYTES {
        return Err(AbsorbedFileRefusal::TooLarge {
            path: path.to_path_buf(),
            bytes: metadata.len(),
            max: ABSORBED_FILE_MAX_BYTES,
        });
    }
    let bytes = std::fs::read(path).map_err(io)?;
    let text = String::from_utf8(bytes).map_err(|_| AbsorbedFileRefusal::NotText(path.to_path_buf()))?;
    Ok((text, ModifiedTime::of(&metadata)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> tempfile::TempDir {
        tempfile::tempdir().expect("temporary folder")
    }

    fn written(dir: &Path, name: &str, text: &str) -> String {
        let path = dir.join(name);
        std::fs::write(&path, text).expect("fixture file");
        path.display().to_string()
    }

    #[test]
    fn a_plain_markdown_file_opens_and_says_whether_it_is_outside_the_repository() {
        let repository = folder();
        let elsewhere = folder();
        let inside = written(repository.path(), "AGENTS.md", "# A\n");
        let outside = written(elsewhere.path(), "notes.md", "# N\n");
        let opened = AbsorbedFile::open(&inside, repository.path()).expect("inside opens");
        assert!(!opened.is_outside_repository());
        assert_eq!(opened.text(), "# A\n");
        let opened = AbsorbedFile::open(&outside, repository.path()).expect("outside opens");
        assert!(opened.is_outside_repository());
        assert!(opened.backup_path().to_string_lossy().ends_with("notes.md.pre-absorb.bak"));
    }

    #[test]
    fn a_hidden_credential_device_or_non_markdown_name_is_refused_before_any_byte_is_read() {
        let repository = folder();
        for (name, refused) in [
            (".env", "hidden"),
            ("credentials.md", "hidden"),
            ("secret.md", "hidden"),
            ("data.csv", "Markdown"),
        ] {
            let file = written(repository.path(), name, "x");
            let refusal = AbsorbedFile::open(&file, repository.path()).expect_err(name);
            assert!(refusal.to_string().contains(refused), "{name}: {refusal}");
        }
        assert!(matches!(
            AbsorbedFile::open(&repository.path().join("missing.md").display().to_string(), repository.path()),
            Err(AbsorbedFileRefusal::NotFound(_))
        ));
    }

    #[test]
    fn text_that_is_not_utf8_is_refused_so_a_rewrite_never_changes_unread_bytes() {
        let repository = folder();
        let path = repository.path().join("latin.md");
        std::fs::write(&path, [0x23, 0x20, 0xe9]).expect("fixture file");
        assert!(matches!(
            AbsorbedFile::open(&path.display().to_string(), repository.path()),
            Err(AbsorbedFileRefusal::NotText(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn a_link_is_followed_and_the_real_name_is_judged_too() {
        let repository = folder();
        let target = written(repository.path(), ".env", "KEY=1");
        let link = repository.path().join("harmless.md");
        std::os::unix::fs::symlink(&target, &link).expect("link");
        let refusal = AbsorbedFile::open(&link.display().to_string(), repository.path())
            .expect_err("a link to .env");
        assert!(matches!(refusal, AbsorbedFileRefusal::PrivateName { .. }), "{refusal}");
    }
}
