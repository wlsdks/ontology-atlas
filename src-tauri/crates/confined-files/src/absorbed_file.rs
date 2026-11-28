//! The one file `absorb_document` rewrites: named by an absolute or relative path a person or agent
//! typed, usually outside the vault (a repository's `AGENTS.md`), so it cannot be a vault slug.
//!
//! What stands in for the vault's confinement is a list of refusals made once, here, before the
//! tool sees a byte: the name must be a plain Markdown file's (never hidden, never a Windows
//! device), the real path (every link resolved) is what is judged and what is rewritten, no folder
//! of it may be named like a credential, and the text must be UTF-8 and within
//! [`ABSORBED_FILE_MAX_BYTES`], so a rewrite never changes bytes it did not read. Whether the real
//! path lies inside the repository is a fact the tool reports and gates on; it is not a refusal
//! here, but it decides which hidden folders are refused: an instruction file lives in `.github/` or
//! `.cursor/` of a repository, and nowhere hidden outside one. A folder the server only guessed
//! (the one it was started in, perhaps a home folder) is not a repository for that purpose.

use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};

use crate::confined_root::resolve_path;
use crate::modified_time::ModifiedTime;
use crate::os_error::IoFailure;
use crate::plain_file::{self, FileIdentity};
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
    #[error("{name} is hidden or has the name of a credential, so it is never read")]
    PrivateName { name: String },
    #[error("{name} is a Windows device or stream name, not a file name")]
    DeviceName { name: String },
    #[error("{} is {bytes} bytes; absorb_document reads at most {max} bytes", .path.display())]
    TooLarge { path: PathBuf, bytes: u64, max: u64 },
    #[error("{} is not where it was when it was checked: a folder above it now leads elsewhere, so it is not read", .0.display())]
    Moved(PathBuf),
    #[error("{} is a link, has more than one name or is not a regular file, so it is not rewritten", .0.display())]
    NotPlainFile(PathBuf),
    #[error("{} is not UTF-8 text, so rewriting it would change bytes that were not read", .0.display())]
    NotText(PathBuf),
    #[error(transparent)]
    Io(#[from] IoFailure),
}

/// The folder whose inside needs no extra consent, and whether the program was ever pointed at it.
#[derive(Debug, Clone, Copy)]
pub enum AbsorbRepository<'a> {
    /// The launcher named it, or the vault is inside it: a hidden folder in it, `.github/` or
    /// `.cursor/`, holds instruction files.
    Grounded(&'a Path),
    /// Only the folder the server was started in. A file below it is "inside" for the consent
    /// gate, but nothing hidden is: it may be the home folder, whose `.claude/` and `.ssh/` hold
    /// what no repository does.
    Guessed(&'a Path),
}

impl AbsorbRepository<'_> {
    fn path(&self) -> &Path {
        match self {
            Self::Grounded(path) | Self::Guessed(path) => path,
        }
    }

    fn allows_hidden_folders(&self) -> bool {
        matches!(self, Self::Grounded(_))
    }
}

/// Where a document to absorb really is, once its name and every folder above it have been
/// judged. Nothing of it has been read: this is what the consent card shows a person, and what a
/// dry run stops at.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AbsorbedPlace {
    real: PathBuf,
    outside_repository: bool,
}

/// A document opened for absorption: its real path, its text and the time it had.
#[derive(Debug, Clone)]
pub struct AbsorbedFile {
    place: AbsorbedPlace,
    text: String,
    modified: Option<ModifiedTime>,
    identity: FileIdentity,
}

fn final_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// The refusals of one name, and of a file's final name in particular.
fn refuse_final_name(name: &str) -> Result<(), AbsorbedFileRefusal> {
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

/// The folders of `real` that are judged: below the repository's folder when the file is inside
/// it, so the place a person keeps the repository is theirs to name; every folder when it is not.
fn judged_folders(real: &Path, repository_real: &Path, outside_repository: bool) -> Vec<String> {
    let names = real.components().filter_map(|part| match part {
        Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
        _ => None,
    });
    let skipped = if outside_repository {
        0
    } else {
        repository_real
            .components()
            .filter(|part| matches!(part, Component::Normal(_)))
            .count()
    };
    let mut folders: Vec<String> = names.skip(skipped).collect();
    folders.pop();
    folders
}

fn refuse_folders(
    real: &Path,
    repository_real: &Path,
    outside_repository: bool,
    hidden_is_refused: bool,
) -> Result<(), AbsorbedFileRefusal> {
    for folder in judged_folders(real, repository_real, outside_repository) {
        let hidden = hidden_is_refused && is_hidden_name(&folder);
        if hidden || is_credential_name(&folder) {
            return Err(AbsorbedFileRefusal::PrivateName { name: folder });
        }
    }
    Ok(())
}

impl AbsorbedPlace {
    /// Finds `requested` (resolved against the working folder like any relative path) and judges
    /// its names without opening it. `repository` is the folder whose inside needs no extra consent.
    pub fn locate(
        requested: &str,
        repository: AbsorbRepository<'_>,
    ) -> Result<Self, AbsorbedFileRefusal> {
        let base = std::env::current_dir()
            .map_err(|source| IoFailure::new("cwd", PathBuf::from("."), source))?;
        let resolved = resolve_path(&base, Path::new(requested));
        let is_file = std::fs::metadata(&resolved).is_ok_and(|metadata| metadata.is_file());
        if !is_file {
            return Err(AbsorbedFileRefusal::NotFound(resolved));
        }
        // The name typed and the name it resolves to: a harmless link to `.env` is still `.env`.
        refuse_final_name(&final_name(&resolved))?;
        let real = real_path(&resolved).map_err(|source| IoFailure::new("realpath", &resolved, source))?;
        refuse_final_name(&final_name(&real))?;
        let repository_real = real_path(repository.path())
            .map_err(|source| IoFailure::new("realpath", repository.path(), source))?;
        let outside_repository = !is_within_folding_case(&repository_real, &real);
        let hidden_is_refused = outside_repository || !repository.allows_hidden_folders();
        refuse_folders(&real, &repository_real, outside_repository, hidden_is_refused)?;
        Ok(Self {
            real,
            outside_repository,
        })
    }

    /// The path with every link resolved: the file that is read and rewritten.
    pub fn path(&self) -> &Path {
        &self.real
    }

    pub fn is_outside_repository(&self) -> bool {
        self.outside_repository
    }
}

impl AbsorbedPlace {
    /// Opens the file once, without following a link, and reads it from that handle. What was
    /// judged by name is judged again by what the handle is: a link or a hard link swapped in since
    /// [`Self::locate`] is refused, not read.
    pub fn read(self) -> Result<AbsorbedFile, AbsorbedFileRefusal> {
        let path = self.real.clone();
        let io = |source: io::Error| AbsorbedFileRefusal::from(IoFailure::new("read", &path, source));
        let mut file = plain_file::open_read(&path).map_err(|source| {
            if plain_file::is_link_refusal(&source) {
                AbsorbedFileRefusal::NotPlainFile(path.clone())
            } else {
                io(source)
            }
        })?;
        let facts = plain_file::facts_of(&file).map_err(io)?;
        if !facts.plain {
            return Err(AbsorbedFileRefusal::NotPlainFile(path));
        }
        // `O_NOFOLLOW` judged the last name only: a folder above it swapped for a link since
        // `locate` would lead the open somewhere else, so the handle says where it really is.
        if plain_file::path_of(&file).map_err(io)? != path {
            return Err(AbsorbedFileRefusal::Moved(path));
        }
        if facts.size > ABSORBED_FILE_MAX_BYTES {
            return Err(AbsorbedFileRefusal::TooLarge {
                path,
                bytes: facts.size,
                max: ABSORBED_FILE_MAX_BYTES,
            });
        }
        let modified = file.metadata().map_err(io).map(|metadata| ModifiedTime::of(&metadata))?;
        let mut bytes = Vec::new();
        (&mut file)
            .take(ABSORBED_FILE_MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(io)?;
        if bytes.len() as u64 > ABSORBED_FILE_MAX_BYTES {
            return Err(AbsorbedFileRefusal::TooLarge {
                path,
                bytes: bytes.len() as u64,
                max: ABSORBED_FILE_MAX_BYTES,
            });
        }
        let text = String::from_utf8(bytes).map_err(|_| AbsorbedFileRefusal::NotText(path))?;
        Ok(AbsorbedFile {
            identity: FileIdentity::of(&facts),
            place: self,
            text,
            modified,
        })
    }
}

impl AbsorbedFile {
    /// Locates and reads `requested` for absorption.
    pub fn open(
        requested: &str,
        repository: AbsorbRepository<'_>,
    ) -> Result<Self, AbsorbedFileRefusal> {
        AbsorbedPlace::locate(requested, repository)?.read()
    }

    /// The identity of the file that was read: a plan that rewrites it states this, so a file
    /// swapped in after the read is a conflict.
    pub fn identity(&self) -> FileIdentity {
        self.identity
    }

    /// The path with every link resolved: the file that is read and rewritten.
    pub fn path(&self) -> &Path {
        &self.place.real
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn modified_time(&self) -> Option<ModifiedTime> {
        self.modified
    }

    pub fn is_outside_repository(&self) -> bool {
        self.place.outside_repository
    }

    /// How a node's `source:` names this file from the vault: the path below the vault's real
    /// folder, `../` parts included, written with `/` on every system. A file on another Windows
    /// drive is named by its whole path, as no relative path reaches it.
    pub fn reference_from(&self, vault: &Path) -> String {
        let vault_real = real_path(vault).unwrap_or_else(|_| vault.to_path_buf());
        let from: Vec<_> = vault_real.components().collect();
        let to: Vec<_> = self.place.real.components().collect();
        let shared = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
        if shared == 0 {
            return self.place.real.to_string_lossy().replace('\\', "/");
        }
        let mut parts: Vec<String> = Vec::new();
        parts.extend(from.iter().skip(shared).map(|_| "..".to_string()));
        parts.extend(to.iter().skip(shared).map(|part| part.as_os_str().to_string_lossy().into_owned()));
        parts.join("/")
    }

    /// Where the copy of the original is kept.
    pub fn backup_path(&self) -> PathBuf {
        let mut name = self.place.real.clone().into_os_string();
        name.push(ABSORB_BACKUP_SUFFIX);
        PathBuf::from(name)
    }

    pub fn backup_exists(&self) -> bool {
        std::fs::symlink_metadata(self.backup_path()).is_ok()
    }

    /// The source as a path a plan may rewrite.
    pub fn writable_source(&self) -> WritablePath {
        WritablePath::from_confined(ConfinedPath::new(self.place.real.clone()))
    }

    /// The backup as a path a plan may create.
    pub fn writable_backup(&self) -> WritablePath {
        WritablePath::from_confined(ConfinedPath::new(self.backup_path()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Not `tempfile::tempdir()`, whose folders start with a dot: outside the repository a hidden
    /// folder is refused.
    fn folder() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("absorb-")
            .tempdir()
            .expect("temporary folder")
    }

    fn grounded(path: &Path) -> AbsorbRepository<'_> {
        AbsorbRepository::Grounded(path)
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
        let opened = AbsorbedFile::open(&inside, grounded(repository.path())).expect("inside opens");
        assert!(!opened.is_outside_repository());
        assert_eq!(opened.text(), "# A\n");
        let opened = AbsorbedFile::open(&outside, grounded(repository.path())).expect("outside opens");
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
            let refusal = AbsorbedFile::open(&file, grounded(repository.path())).expect_err(name);
            assert!(refusal.to_string().contains(refused), "{name}: {refusal}");
        }
        assert!(matches!(
            AbsorbedFile::open(&repository.path().join("missing.md").display().to_string(), grounded(repository.path())),
            Err(AbsorbedFileRefusal::NotFound(_))
        ));
    }

    fn nested(root: &Path, folders: &[&str], name: &str, text: &str) -> String {
        let mut path = root.to_path_buf();
        path.extend(folders);
        std::fs::create_dir_all(&path).expect("folders");
        written(&path, name, text)
    }

    #[test]
    fn a_credential_folder_anywhere_above_a_file_refuses_it_and_a_hidden_one_only_outside_the_repository() {
        let repository = folder();
        let elsewhere = folder();
        for (root, folders, outside) in [
            (elsewhere.path(), vec!["secrets"], true),
            (elsewhere.path(), vec!["keys.pem"], true),
            (elsewhere.path(), vec![".config"], true),
            (elsewhere.path(), vec!["ok", ".ssh", "deep"], true),
            (repository.path(), vec!["docs", "credentials"], false),
        ] {
            let file = nested(root, &folders, "AGENTS.md", "# A\n");
            let refusal = AbsorbedFile::open(&file, grounded(repository.path())).expect_err(&file);
            assert!(matches!(refusal, AbsorbedFileRefusal::PrivateName { .. }), "{file}: {refusal}");
            assert_eq!(outside, !file.starts_with(&repository.path().display().to_string()));
        }
        for dot_folder in [".github", ".cursor", ".claude/rules"] {
            let parts: Vec<&str> = dot_folder.split('/').collect();
            let file = nested(repository.path(), &parts, "AGENTS.md", "# A\n");
            let opened = AbsorbedFile::open(&file, grounded(repository.path())).expect(dot_folder);
            assert!(!opened.is_outside_repository(), "{dot_folder}");
        }
    }

    /// A folder the server only started in can be a home folder: its `.claude/` is no repository's
    /// instruction folder, so a hidden folder below it is refused unless the program was pointed
    /// at the repository.
    #[test]
    fn a_hidden_folder_below_a_guessed_repository_is_refused_and_below_a_grounded_one_is_not() {
        let home = folder();
        let file = nested(home.path(), &[".claude"], "CLAUDE.md", "# C\n");
        let guessed = AbsorbedFile::open(&file, AbsorbRepository::Guessed(home.path()));
        assert!(matches!(guessed, Err(AbsorbedFileRefusal::PrivateName { .. })), "{guessed:?}");
        let grounded = AbsorbedFile::open(&file, AbsorbRepository::Grounded(home.path())).expect("grounded");
        assert!(!grounded.is_outside_repository());
        let plain = nested(home.path(), &["docs"], "AGENTS.md", "# A\n");
        assert!(AbsorbedFile::open(&plain, AbsorbRepository::Guessed(home.path())).is_ok());
    }

    #[test]
    fn the_folder_that_holds_the_repository_is_not_judged() {
        let above = folder();
        let repository = above.path().join("secrets").join(".work").join("project");
        let file = nested(&repository, &[".github"], "AGENTS.md", "# A\n");
        let opened = AbsorbedFile::open(&file, grounded(&repository)).expect("the repository's own place is theirs");
        assert!(!opened.is_outside_repository());
    }

    #[test]
    fn a_refused_folder_is_refused_before_the_file_is_opened() {
        let repository = folder();
        let elsewhere = folder();
        let file = nested(elsewhere.path(), &[".ssh"], "notes.md", "# N\n");
        let place = AbsorbedPlace::locate(&file, grounded(repository.path()));
        assert!(matches!(place, Err(AbsorbedFileRefusal::PrivateName { .. })), "{place:?}");
    }

    #[test]
    fn text_that_is_not_utf8_is_refused_so_a_rewrite_never_changes_unread_bytes() {
        let repository = folder();
        let path = repository.path().join("latin.md");
        std::fs::write(&path, [0x23, 0x20, 0xe9]).expect("fixture file");
        assert!(matches!(
            AbsorbedFile::open(&path.display().to_string(), grounded(repository.path())),
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
        let refusal = AbsorbedFile::open(&link.display().to_string(), grounded(repository.path()))
            .expect_err("a link to .env");
        assert!(matches!(refusal, AbsorbedFileRefusal::PrivateName { .. }), "{refusal}");
    }

    /// The name check passed, then the file was replaced under the same name. The check is not
    /// the read: what is read is what the open handle is.
    ///
    /// A hard link is refused on Windows too: `GetFileInformationByHandle` reports the number of
    /// links of the opened file (Microsoft, "BY_HANDLE_FILE_INFORMATION", `nNumberOfLinks`).
    #[test]
    fn a_link_or_a_hard_link_swapped_in_after_the_name_check_is_refused_not_read() {
        let repository = folder();
        let elsewhere = folder();
        let secret = written(elsewhere.path(), "other.md", "SECRET");
        let swaps: &[bool] = if cfg!(unix) { &[false, true] } else { &[true] };
        for &hard in swaps {
            let name = if hard { "hard.md" } else { "soft.md" };
            let file = written(repository.path(), name, "# A\n");
            let place = AbsorbedPlace::locate(&file, grounded(repository.path())).expect("passes the name check");
            std::fs::remove_file(&file).expect("swap out");
            if hard {
                std::fs::hard_link(&secret, &file).expect("hard link");
            } else {
                #[cfg(unix)]
                std::os::unix::fs::symlink(&secret, &file).expect("link");
            }
            let refusal = place.read().expect_err(name);
            assert!(matches!(refusal, AbsorbedFileRefusal::NotPlainFile(_)), "{name}: {refusal}");
        }
    }

    /// `O_NOFOLLOW` judges the last name only. A folder above the file swapped for a link after
    /// the check opens another file whose last name is plain; the handle's own path shows it.
    #[cfg(unix)]
    #[test]
    fn a_folder_swapped_for_a_link_after_the_name_check_is_refused_not_read() {
        let repository = folder();
        let elsewhere = folder();
        let file = nested(repository.path(), &["docs"], "AGENTS.md", "# A\n");
        written(elsewhere.path(), "AGENTS.md", "SECRET");
        let place = AbsorbedPlace::locate(&file, grounded(repository.path())).expect("passes the name check");
        std::fs::rename(repository.path().join("docs"), repository.path().join("docs.moved")).expect("move");
        std::os::unix::fs::symlink(elsewhere.path(), repository.path().join("docs")).expect("link");
        let refusal = place.read().expect_err("the handle is another file's");
        assert!(matches!(refusal, AbsorbedFileRefusal::Moved(_)), "{refusal}");
    }

    /// The handle's path is what Windows says it is: `GetFinalPathNameByHandleW` returns the
    /// normalized, long-name path whatever letter case or short name opened it (Microsoft,
    /// "GetFinalPathNameByHandleW", `FILE_NAME_NORMALIZED`), which is what `real_path` returns.
    #[cfg(windows)]
    #[test]
    fn a_file_opened_by_a_path_in_other_letter_case_is_the_file_that_was_checked() {
        let repository = folder();
        let file = written(repository.path(), "AGENTS.md", "# A\n");
        let place = AbsorbedPlace::locate(&file, grounded(repository.path())).expect("located");
        let shouted = place.path().to_string_lossy().to_uppercase();
        let handle = plain_file::open_read(Path::new(&shouted)).expect("opens by any case");
        assert_eq!(plain_file::path_of(&handle).expect("final path"), place.path());
        assert!(place.read().is_ok());
    }

    /// A copy with the same text and time has another identity, which is all a swap changes.
    #[cfg(unix)]
    #[test]
    fn a_file_swapped_for_a_copy_after_the_read_is_not_rewritten() {
        use crate::write_plan::{apply_all_or_nothing, ApplyOptions, PlanEntry, Reservations};
        let repository = folder();
        let file = written(repository.path(), "AGENTS.md", "# A\n");
        let opened = AbsorbedFile::open(&file, grounded(repository.path())).expect("opens");
        let entry = || {
            PlanEntry::write(opened.writable_source(), "pointer\n".to_string())
                .expecting_text(opened.text().to_string())
                .expecting_identity(opened.identity())
        };
        let options = ApplyOptions::new(Reservations::AllowReserved);
        std::fs::copy(&file, repository.path().join("copy.md")).expect("copy");
        std::fs::rename(repository.path().join("copy.md"), &file).expect("swap in the copy");
        let refused = apply_all_or_nothing(vec![entry()], &options);
        assert!(matches!(refused, Err(crate::atomic_write::WriteError::ChangedOnDisk(_))), "{refused:?}");
        let again = AbsorbedFile::open(&file, grounded(repository.path())).expect("opens again");
        let entry = PlanEntry::write(again.writable_source(), "pointer\n".to_string())
            .expecting_text(again.text().to_string())
            .expecting_identity(again.identity());
        apply_all_or_nothing(vec![entry], &options).expect("the file that was read is rewritten");
        assert_eq!(std::fs::read_to_string(&file).expect("read"), "pointer\n");
    }
}
