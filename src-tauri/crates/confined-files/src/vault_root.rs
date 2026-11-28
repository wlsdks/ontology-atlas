//! The vault folder, and the only way to name a file in it. A [`ConfinedPath`] can be built only
//! here, from a slug that passed every rule, so a function that takes one needs no check of its
//! own.

use std::io::{self, Read};
use std::path::{Path, PathBuf};

use icu_normalizer::ComposingNormalizerBorrowed;

use crate::confined_root::{ensure_vault_root, resolve_path, VaultRootError};
use crate::markdown_walk::list_markdown_files;
use crate::plain_file;
use crate::real_paths::{is_within, real_path, segments_below};
use crate::slug_rules::{
    device_name_reason, unwritable_slug_reason, UnwritableReason, VAULT_SOURCES_DIR,
};
use crate::stable_read::{FileSnapshot, FileStamp, StableReadError};

/// The most bytes of a top-level declarative file that is read: a few hundred lines of patterns.
pub const TOP_FILE_MAX_BYTES: u64 = 64 * 1024;

/// Why a slug cannot name a file. The server writes the sentence an agent reads; the text here
/// says what happened, with the slug and the reason as values.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SlugError {
    #[error("slug must be a non-empty string")]
    Empty,
    #[error("slug must not contain a null byte")]
    NullByte,
    #[error("slug points outside the vault root: \"{slug}\"")]
    OutsideRoot { slug: String },
    /// The slug names a file under `sources/`; `raw_source` is the slug of that raw file (see
    /// [`crate::raw_source_file_for_slug`] for the file to read instead).
    #[error("slug \"{raw_source}\" names a raw source, not a node")]
    RawSource { raw_source: String },
    #[error("slug resolves outside the vault root through a symlink: \"{slug}\"")]
    OutsideRootThroughLink { slug: String },
    /// A write tool never names this file (an invisible character, a hidden segment, an
    /// instruction file, the README, a short Windows name).
    #[error("slug \"{slug}\" cannot be written: {reason}")]
    Unwritable {
        slug: String,
        reason: UnwritableReason,
    },
    /// The slug is fine as typed, but a link makes it name a file a write tool never names.
    #[error("slug \"{slug}\" resolves through a link to \"{resolved}\": {reason}")]
    UnwritableThroughLink {
        slug: String,
        resolved: String,
        reason: UnwritableReason,
    },
}

/// A path inside a vault, reached by a slug that is not a raw source and whose real path (every
/// link resolved, or the nearest existing folder's for a file not yet created) stays inside the
/// vault; or a file the vault walk listed, which is a regular file that no link was followed to.
/// It does not prove the slug is one a write tool may name: that is [`WritablePath`]. Only a
/// [`VaultRoot`] builds one.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ConfinedPath {
    path: PathBuf,
}

impl ConfinedPath {
    pub(crate) fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn as_path(&self) -> &Path {
        &self.path
    }

    /// For a message that names the file.
    pub fn display(&self) -> std::path::Display<'_> {
        self.path.display()
    }

    /// The file's text, as Node's `readFileSync(path, 'utf8')` decodes it: invalid bytes become
    /// U+FFFD and a byte-order mark stays.
    pub fn read_text(&self) -> io::Result<String> {
        let bytes = std::fs::read(&self.path)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }

    pub fn read_bytes(&self) -> io::Result<Vec<u8>> {
        std::fs::read(&self.path)
    }

    /// The file as one snapshot: its bytes and the stamp of the version they belong to, read
    /// without blocking. `None` when nothing is there or what is there is not a regular file (a
    /// pipe, a folder). An error is the operating system's refusal, or a file that would not hold
    /// still (see [`crate::stable_read`]).
    pub fn read_snapshot(&self) -> Result<Option<FileSnapshot>, StableReadError> {
        crate::stable_read::read_stable(&self.path, &|_| {})
    }

    /// [`ConfinedPath::read_snapshot`], calling `after_read` with the attempt between the read and
    /// the second look at the file; a test parks a racing edit there.
    #[cfg(feature = "test-hooks")]
    pub fn read_snapshot_pausing(
        &self,
        after_read: &dyn Fn(usize),
    ) -> Result<Option<FileSnapshot>, StableReadError> {
        crate::stable_read::read_stable(&self.path, after_read)
    }

    /// The stamp of the file now, from one look at the name; `None` when nothing regular is there.
    pub fn stamp(&self) -> Result<Option<FileStamp>, StableReadError> {
        crate::stable_read::stamp_of(&self.path)
    }

    /// The stamp of each file now, in the order given, as [`ConfinedPath::stamp`] says it for one.
    /// Files listed together in one folder are asked about together, which costs a fraction of one
    /// look per file.
    pub fn stamps(files: &[ConfinedPath]) -> Vec<Result<Option<FileStamp>, StableReadError>> {
        let paths: Vec<&Path> = files.iter().map(ConfinedPath::as_path).collect();
        crate::stable_read::stamps_of(&paths)
    }

    /// Whether anything is there, through links, as Node's `existsSync` says.
    pub fn exists(&self) -> bool {
        self.path.exists()
    }

    /// The modification time, or `None` when the file is absent or keeps none.
    pub fn modified_time(&self) -> Option<crate::modified_time::ModifiedTime> {
        std::fs::metadata(&self.path)
            .ok()
            .and_then(|metadata| crate::modified_time::ModifiedTime::of(&metadata))
    }
}

/// A [`ConfinedPath`] a write tool may create, change or delete: its slug, as typed and where it
/// resolves, is not one [`unwritable_slug_reason`] names. Only [`VaultRoot::write_path`] and
/// [`VaultRoot::writable`] build one.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct WritablePath {
    path: ConfinedPath,
}

impl WritablePath {
    /// For the one writer whose file is not a vault slug (`absorbed_file.rs`), which has made its
    /// own checks.
    pub(crate) fn from_confined(path: ConfinedPath) -> Self {
        Self { path }
    }

    pub fn as_confined(&self) -> &ConfinedPath {
        &self.path
    }

    pub fn as_path(&self) -> &Path {
        self.path.as_path()
    }
}

/// The vault folder every file operation of the server is confined to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultRoot {
    root: PathBuf,
}

impl VaultRoot {
    /// Requires an existing directory, reached through a link if it is one.
    pub fn open(path: &Path) -> Result<Self, VaultRootError> {
        ensure_vault_root(path)?;
        let base =
            std::env::current_dir().map_err(|_| VaultRootError::NotFound(path.to_path_buf()))?;
        Ok(Self {
            root: resolve_path(&base, path),
        })
    }

    pub fn path(&self) -> &Path {
        &self.root
    }

    /// The text of a declarative file that lives at the top of the vault, such as
    /// `.ontology-atlasignore`: `None` when there is no such file. `name` is one file name; a name
    /// with a separator or a `..` is refused, so no call can reach outside the vault through it.
    ///
    /// The file is opened without following a link and without waiting for a writer, and must be a
    /// plain file of at most [`TOP_FILE_MAX_BYTES`]: a stranger's vault may plant a link to a file
    /// elsewhere, or a pipe nobody writes to, at the name. Those are refused, not skipped, so the
    /// person is told why the file is not read.
    pub fn read_top_file(&self, name: &str) -> io::Result<Option<String>> {
        let is_one_name =
            !name.is_empty() && name != ".." && name != "." && !name.contains(['/', '\\', '\0']);
        if !is_one_name {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "a top-level file is named by one file name",
            ));
        }
        let refused = |reason: &str| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{name} is {reason}, so it is not read"),
            )
        };
        let mut file = match plain_file::open_read(&self.root.join(name)) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) if plain_file::is_link_refusal(&error) => {
                return Err(refused("a link"));
            }
            Err(error) => return Err(error),
        };
        let facts = plain_file::facts_of(&file)?;
        if !facts.plain {
            return Err(refused(
                "not a plain file (a link, a pipe, a folder or a file with another name)",
            ));
        }
        if facts.size > TOP_FILE_MAX_BYTES {
            return Err(refused(&format!("over {TOP_FILE_MAX_BYTES} bytes")));
        }
        let mut bytes = Vec::new();
        file.by_ref()
            .take(TOP_FILE_MAX_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > TOP_FILE_MAX_BYTES {
            return Err(refused(&format!("over {TOP_FILE_MAX_BYTES} bytes")));
        }
        String::from_utf8(bytes)
            .map(Some)
            .map_err(|_| refused("not UTF-8 text"))
    }

    /// Every Markdown file of the vault, in UTF-16 order (see [`list_markdown_files`]).
    pub fn markdown_files(&self) -> Vec<ConfinedPath> {
        list_markdown_files(&self.root)
    }

    /// Every Markdown file under `sources/`, which the vault never reads as a node.
    pub fn raw_source_markdown_files(&self) -> Vec<ConfinedPath> {
        crate::markdown_walk::list_raw_source_markdown(&self.root)
    }

    /// Every file under `sources/` as `sources/<path>`, for a check that asks whether a cited raw
    /// source is there. Nothing is opened.
    pub fn raw_source_paths(&self) -> Vec<String> {
        crate::markdown_walk::list_raw_source_paths(&self.root)
    }

    /// The slug of a file below the vault: its path with `/` separators and no `.md`, in NFC.
    /// macOS often lists Korean names as NFD while frontmatter is typed as NFC, and the byte
    /// mismatch would drop those nodes' relations. Only the identifier is normalised; the disk
    /// path stays as it is. `None` for a path outside the vault.
    pub fn slug_of(&self, file: &ConfinedPath) -> Option<String> {
        let parts = segments_below(&self.root, file.as_path())?;
        Some(
            ComposingNormalizerBorrowed::new_nfc()
                .normalize(&segments_to_slug(&parts))
                .into_owned(),
        )
    }

    /// The file a slug names, for reading. A slug from an agent or a prompt injection
    /// (`../../etc/passwd`) must not name a file outside the vault, so every way out is refused:
    /// the `..` and absolute spellings, a null byte, a link that leaves the vault (also for a file
    /// that does not exist yet, through its nearest existing folder), and the raw-source folder.
    pub fn read_path(&self, slug: &str) -> Result<ConfinedPath, SlugError> {
        if slug.is_empty() {
            return Err(SlugError::Empty);
        }
        if slug.contains('\0') {
            return Err(SlugError::NullByte);
        }
        let candidate = resolve_path(&self.root, Path::new(&format!("{slug}.md")));
        if !is_within(&self.root, &candidate) {
            return Err(SlugError::OutsideRoot {
                slug: slug.to_string(),
            });
        }
        if let Some(raw_source) = self.raw_source_slug_for(&candidate) {
            return Err(SlugError::RawSource { raw_source });
        }
        assert_real_path_inside(&candidate, &self.root, slug)?;
        Ok(ConfinedPath::new(candidate))
    }

    /// [`Self::read_path`] for a file a write tool will create, change or delete: it also refuses
    /// what `unwritable_slug_reason` names, as typed or where the slug resolves through a link.
    /// A Windows device name is refused only while no file is there, so a file that already has
    /// one can still be edited, renamed and deleted.
    pub fn write_path(&self, slug: &str) -> Result<WritablePath, SlugError> {
        if let Some(reason) = unwritable_slug_reason(slug) {
            return Err(SlugError::Unwritable {
                slug: slug.to_string(),
                reason,
            });
        }
        let confined = self.read_path(slug)?;
        // The write replaces a link at the name and never follows it, so what a new file is
        // called is the typed slug, whatever a dangling link there pointed at.
        if std::fs::metadata(confined.as_path()).is_err() {
            if let Some(reason) = device_name_reason(slug) {
                return Err(SlugError::Unwritable {
                    slug: slug.to_string(),
                    reason,
                });
            }
        }
        self.refuse_unwritable_through_links(slug, confined.as_path())?;
        Ok(WritablePath { path: confined })
    }

    /// A file already found in the vault (listed by [`Self::markdown_files`]) as one a write tool
    /// may change, by the same rules as [`Self::write_path`] applied to its own slug.
    pub fn writable(&self, file: &ConfinedPath) -> Result<WritablePath, SlugError> {
        let slug = self.slug_of(file).ok_or_else(|| SlugError::OutsideRoot {
            slug: file.display().to_string(),
        })?;
        if let Some(reason) = unwritable_slug_reason(&slug) {
            return Err(SlugError::Unwritable { slug, reason });
        }
        self.refuse_unwritable_through_links(&slug, file.as_path())?;
        Ok(WritablePath { path: file.clone() })
    }

    fn refuse_unwritable_through_links(&self, slug: &str, file: &Path) -> Result<(), SlugError> {
        let Some(real) = self.real_segments_below_root(file) else {
            return Ok(());
        };
        let resolved = segments_to_slug(&real);
        if resolved == slug {
            return Ok(());
        }
        match unwritable_slug_reason(&resolved) {
            Some(reason) => Err(SlugError::UnwritableThroughLink {
                slug: slug.to_string(),
                resolved,
                reason,
            }),
            None => Ok(()),
        }
    }

    /// The raw-source slug a slug names, spelled as typed or reached through a case-folding disk
    /// or a link, or `None`. A malformed slug is `None`.
    pub fn raw_source_slug_at(&self, slug: &str) -> Option<String> {
        if slug.is_empty() || slug.contains('\0') {
            return None;
        }
        self.raw_source_slug_for(&resolve_path(&self.root, Path::new(&format!("{slug}.md"))))
    }

    fn raw_source_slug_for(&self, candidate: &Path) -> Option<String> {
        if let Some(spelled) = segments_below(&self.root, candidate) {
            if names_raw_source(&spelled) {
                return Some(segments_to_slug(&spelled));
            }
        }
        // A case-folding disk opens `Sources/` as `sources/`, and a link can alias it.
        self.real_segments_below_root(candidate)
            .filter(|real| names_raw_source(real))
            .map(|real| segments_to_slug(&real))
    }

    /// The parts of `candidate` below the real vault folder with every link resolved; a part that
    /// does not exist yet is kept as spelled. `None` when the vault cannot be resolved or the
    /// path leaves it.
    fn real_segments_below_root(&self, candidate: &Path) -> Option<Vec<String>> {
        let real_root = real_path(&self.root).ok()?;
        let mut missing: Vec<std::ffi::OsString> = Vec::new();
        let mut probe = candidate.to_path_buf();
        loop {
            match real_path(&probe) {
                Ok(mut real) => {
                    real.extend(missing.iter().rev());
                    return segments_below(&real_root, &real);
                }
                Err(_) => {
                    let name = probe.file_name()?.to_os_string();
                    missing.push(name);
                    probe = probe.parent()?.to_path_buf();
                }
            }
        }
    }

    /// The disk's spelling of an existing slug, or `None`. A case-folding disk opens a wrong-case
    /// slug as the file, while backlink matching is case-sensitive, so a rename would redirect
    /// no backlink and still report success.
    pub fn canonical_disk_slug(&self, slug: &str) -> Option<String> {
        if slug.is_empty() {
            return None;
        }
        let contained = self.read_path(slug).ok()?;
        let exists_as_given = contained.exists();
        let parts: Vec<&str> = slug.split('/').collect();
        let last = parts.len() - 1;
        let mut folder = self.root.clone();
        let mut canonical: Vec<String> = Vec::with_capacity(parts.len());
        for (index, part) in parts.iter().enumerate() {
            let want = if index == last {
                format!("{part}.md")
            } else {
                (*part).to_string()
            };
            let Ok(listing) = std::fs::read_dir(&folder) else {
                return exists_as_given.then(|| slug.to_string());
            };
            let names: Vec<String> = listing
                .filter_map(Result::ok)
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect();
            let hit = if names.contains(&want) {
                want
            } else {
                let lowered = want.to_lowercase();
                let mut matches = names
                    .into_iter()
                    .filter(|name| name.to_lowercase() == lowered);
                match (matches.next(), matches.next()) {
                    (Some(only), None) => only,
                    _ => return exists_as_given.then(|| slug.to_string()),
                }
            };
            canonical.push(if index == last {
                without_extension(&hit).to_string()
            } else {
                hit.clone()
            });
            folder = folder.join(&hit);
        }
        Some(canonical.join("/"))
    }

    /// Whether a `.md` exists for the slug, so a typo or an invented slug is not appended to a
    /// frontmatter array as a dangling reference. A malformed slug is `false`, not an error.
    pub fn slug_exists(&self, slug: &str) -> bool {
        self.read_path(slug).is_ok_and(|path| path.exists())
    }
}

fn names_raw_source(segments: &[String]) -> bool {
    segments.len() > 1 && segments.first().map(String::as_str) == Some(VAULT_SOURCES_DIR)
}

fn segments_to_slug(segments: &[String]) -> String {
    let joined = segments.join("/");
    without_extension(&joined).to_string()
}

/// `name` without its `.md`, any letter case: a case-insensitive disk lists `Page.MD` for a slug
/// typed `Page`, and JavaScript drops the last three characters of it as it does of `Page.md`.
fn without_extension(name: &str) -> &str {
    let tail = name.len().saturating_sub(3);
    match name.get(tail..) {
        Some(suffix) if suffix.eq_ignore_ascii_case(".md") => name.get(..tail).unwrap_or(name),
        _ => name,
    }
}

/// The real path must stay inside the vault. A file that does not exist yet answers through its
/// nearest existing folder, as creating a file inside a linked folder is the same escape. A
/// dangling link is not followed: the nearest existing folder decides, as it does in the
/// JavaScript server.
fn assert_real_path_inside(candidate: &Path, root: &Path, slug: &str) -> Result<(), SlugError> {
    let Ok(real_root) = real_path(root) else {
        // If the root itself cannot be resolved, the lexical check is all there is.
        return Ok(());
    };
    let mut probe = candidate;
    loop {
        match real_path(probe) {
            Ok(real) => {
                return if is_within(&real_root, &real) {
                    Ok(())
                } else {
                    Err(SlugError::OutsideRootThroughLink {
                        slug: slug.to_string(),
                    })
                };
            }
            Err(_) => match probe.parent() {
                Some(parent) if parent != probe => probe = parent,
                _ => return Ok(()),
            },
        }
    }
}

#[cfg(test)]
#[cfg(unix)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn vault() -> (tempfile::TempDir, VaultRoot) {
        let directory = tempfile::tempdir().expect("temp dir");
        let canonical = real_path(directory.path()).expect("real");
        let root = VaultRoot::open(&canonical).expect("vault");
        (directory, root)
    }

    fn refusal(result: Result<impl std::fmt::Debug, SlugError>) -> SlugError {
        result.expect_err("refused")
    }

    #[test]
    fn a_plain_slug_names_a_file_under_the_vault() {
        let (_directory, root) = vault();
        let path = root.read_path("domains/auth").expect("allowed");
        assert_eq!(path.as_path(), root.path().join("domains/auth.md"));
        assert!(root.read_path("\u{d55c}\u{ae00}/\u{d3ec}").is_ok());
    }

    #[test]
    fn every_refusal_is_a_typed_reason_with_a_plain_sentence() {
        let (_directory, root) = vault();
        assert_eq!(refusal(root.read_path("")), SlugError::Empty);
        assert_eq!(refusal(root.read_path("a\0b")), SlugError::NullByte);
        for slug in ["../../etc/passwd", "/etc/passwd"] {
            assert_eq!(
                refusal(root.read_path(slug)),
                SlugError::OutsideRoot {
                    slug: slug.to_string()
                }
            );
        }
        assert_eq!(
            refusal(root.read_path("sources/a")).to_string(),
            "slug \"sources/a\" names a raw source, not a node"
        );
        assert_eq!(
            refusal(root.read_path("../../etc/passwd")).to_string(),
            "slug points outside the vault root: \"../../etc/passwd\""
        );
    }

    #[test]
    fn a_folder_link_out_of_the_vault_is_refused_for_an_existing_and_a_new_file() {
        let (directory, root) = vault();
        let outside = directory.path().parent().expect("parent").join(format!(
            "outside-{}",
            directory
                .path()
                .file_name()
                .expect("name")
                .to_string_lossy()
        ));
        std::fs::create_dir_all(&outside).expect("outside");
        std::fs::write(outside.join("secret.md"), "x").expect("secret");
        symlink(&outside, root.path().join("linked")).expect("link");
        let existing = refusal(root.read_path("linked/secret"));
        let created = refusal(root.read_path("linked/new-file"));
        std::fs::remove_dir_all(&outside).expect("cleanup");
        for (found, slug) in [(existing, "linked/secret"), (created, "linked/new-file")] {
            assert_eq!(
                found,
                SlugError::OutsideRootThroughLink {
                    slug: slug.to_string()
                }
            );
        }
    }

    #[test]
    fn a_dangling_link_is_judged_by_its_nearest_existing_folder() {
        let (directory, root) = vault();
        let outside_target = directory
            .path()
            .parent()
            .expect("parent")
            .join("planted-target-that-does-not-exist.md");
        symlink(&outside_target, root.path().join("dangling.md")).expect("link");
        // The slug itself names a path inside the vault; what a write does with a link at that
        // path is the atomic write's rename, which replaces the link and never follows it.
        let path = root.write_path("dangling").expect("judged by its folder");
        crate::atomic_write::write_atomically(&path, "written", &crate::atomic_write::AtomicWrite::default())
            .expect("the write goes through");
        assert!(!outside_target.exists(), "the link was not followed to a file outside the vault");
        let written = std::fs::symlink_metadata(root.path().join("dangling.md")).expect("the file");
        assert!(written.is_file() && !written.file_type().is_symlink(), "the link was replaced");
        assert_eq!(std::fs::read_to_string(root.path().join("dangling.md")).expect("read"), "written");
    }

    #[test]
    fn a_link_that_makes_a_node_look_like_a_raw_source_is_refused() {
        let (_directory, root) = vault();
        std::fs::create_dir_all(root.path().join("sources")).expect("sources");
        std::fs::write(root.path().join("sources/page.md"), "x").expect("page");
        symlink(root.path().join("sources"), root.path().join("alias")).expect("link");
        assert_eq!(
            refusal(root.read_path("alias/page")),
            SlugError::RawSource {
                raw_source: "sources/page".to_string()
            }
        );
        assert_eq!(
            root.raw_source_slug_at("alias/page").as_deref(),
            Some("sources/page")
        );
        assert_eq!(root.raw_source_slug_at("domains/page"), None);
    }

    #[test]
    fn a_link_to_a_name_a_write_never_names_is_refused_with_both_slugs() {
        let (_directory, root) = vault();
        std::fs::write(root.path().join("AGENTS.md"), "x").expect("agents");
        symlink(root.path().join("AGENTS.md"), root.path().join("notes.md")).expect("link");
        assert_eq!(
            refusal(root.write_path("notes")),
            SlugError::UnwritableThroughLink {
                slug: "notes".to_string(),
                resolved: "AGENTS".to_string(),
                reason: UnwritableReason::AgentInstructionFile {
                    file_name: "AGENTS".to_string()
                },
            }
        );
        assert!(root.read_path("notes").is_ok());
    }

    #[test]
    fn a_write_path_refuses_what_a_write_tool_never_names() {
        let (_directory, root) = vault();
        assert!(matches!(
            refusal(root.write_path(".claude/rules")),
            SlugError::Unwritable {
                reason: UnwritableReason::HiddenSegment { .. },
                ..
            }
        ));
        assert!(matches!(
            refusal(root.write_path("README")),
            SlugError::Unwritable {
                reason: UnwritableReason::VaultReadme,
                ..
            }
        ));
        assert!(root.write_path("capabilities/read").is_ok());
        assert!(root.read_path(".claude/rules").is_ok());
    }

    #[test]
    fn a_device_name_bars_a_new_file_but_not_one_that_is_already_there() {
        let (_directory, root) = vault();
        assert!(matches!(
            refusal(root.write_path("elements/aux")),
            SlugError::Unwritable {
                reason: UnwritableReason::DeviceName { .. },
                ..
            }
        ));
        std::fs::create_dir_all(root.path().join("elements")).expect("folder");
        std::fs::write(root.path().join("elements/aux.md"), "x").expect("a file that was there first");
        assert!(root.write_path("elements/aux").is_ok());
        let file = root.markdown_files().into_iter().next().expect("listed");
        assert!(root.writable(&file).is_ok());
    }

    #[test]
    fn an_upper_case_extension_is_dropped_from_a_slug() {
        let (_directory, root) = vault();
        std::fs::write(root.path().join("Page.MD"), "x").expect("file");
        assert_eq!(root.canonical_disk_slug("page").as_deref(), Some("Page"));
    }

    #[test]
    fn a_slug_is_listed_back_in_nfc_whatever_the_disk_spelled() {
        let (_directory, root) = vault();
        // a Hangul syllable typed as the three jamo U+1112 U+1161 U+11AB, as a Mac lists it.
        let decomposed = "\u{1112}\u{1161}\u{11ab}";
        std::fs::write(root.path().join(format!("{decomposed}.md")), "x").expect("file");
        let listed = root.markdown_files();
        assert_eq!(listed.len(), 1);
        assert_eq!(root.slug_of(&listed[0]).as_deref(), Some("\u{d55c}"));
    }

    #[test]
    fn the_disk_spelling_of_a_slug_is_found_only_when_it_is_unambiguous() {
        let (_directory, root) = vault();
        std::fs::create_dir_all(root.path().join("Domains")).expect("dir");
        std::fs::write(root.path().join("Domains/Auth.md"), "x").expect("file");
        assert_eq!(
            root.canonical_disk_slug("Domains/Auth").as_deref(),
            Some("Domains/Auth")
        );
        // One file matches the other spelling without regard to case, on any disk.
        assert_eq!(
            root.canonical_disk_slug("domains/auth").as_deref(),
            Some("Domains/Auth")
        );
        assert_eq!(root.canonical_disk_slug("Domains/Missing"), None);
        assert_eq!(root.canonical_disk_slug("../x"), None);
        assert!(root.slug_exists("Domains/Auth"));
        assert!(!root.slug_exists("Domains/Missing"));
        assert!(!root.slug_exists("../x"));
    }
}
