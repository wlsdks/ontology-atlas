//! The vault folder, and the only way to name a file in it. A [`ConfinedPath`] can be built only
//! here, from a slug that passed every rule, so a function that takes one needs no check of its
//! own.

use std::io;
use std::path::{Path, PathBuf};

use icu_normalizer::ComposingNormalizerBorrowed;

use crate::confined_root::{ensure_vault_root, resolve_path, VaultRootError};
use crate::markdown_walk::list_markdown_files;
use crate::real_paths::{is_within, link_target, real_path, segments_below};
use crate::slug_rules::{raw_source_slug_issue, unwritable_slug_issue, VAULT_SOURCES_DIR};

/// A link followed more often than this while looking for the end of a missing path is a loop.
const MAX_LINK_HOPS: usize = 40;

/// Why a slug cannot name a file. The text is what the server prints, word for word.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SlugError {
    Empty,
    NullByte,
    OutsideRoot {
        slug: String,
    },
    /// The slug names a file under `sources/`; the sentence names the raw file to read instead.
    RawSource(String),
    OutsideRootThroughLink {
        slug: String,
    },
    /// A write tool never names this file (an invisible character, a hidden segment, an
    /// instruction file, the README, a short Windows name).
    Unwritable(String),
    /// The slug is fine as typed, but a link makes it name a file a write tool never names.
    UnwritableThroughLink {
        slug: String,
        resolved: String,
        issue: String,
    },
}

impl std::fmt::Display for SlugError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => formatter.write_str("slug must be a non-empty string"),
            Self::NullByte => formatter.write_str("slug must not contain a null byte"),
            Self::OutsideRoot { slug } => {
                write!(formatter, "slug points outside the vault root: \"{slug}\"")
            }
            Self::RawSource(message) | Self::Unwritable(message) => formatter.write_str(message),
            Self::OutsideRootThroughLink { slug } => write!(
                formatter,
                "slug resolves outside the vault root through a symlink: \"{slug}\""
            ),
            Self::UnwritableThroughLink {
                slug,
                resolved,
                issue,
            } => write!(
                formatter,
                "slug \"{slug}\" resolves through a link to \"{resolved}\". {issue}"
            ),
        }
    }
}

impl std::error::Error for SlugError {}

/// A path inside a vault that passed the slug rules and the link check. Only a [`VaultRoot`]
/// builds one.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ConfinedPath {
    path: PathBuf,
}

impl ConfinedPath {
    fn new(path: PathBuf) -> Self {
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
/// resolves, is not one `unwritable_slug_issue` names. Only [`VaultRoot::write_path`] and
/// [`VaultRoot::writable`] build one.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct WritablePath {
    path: ConfinedPath,
}

impl WritablePath {
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
        let base = std::env::current_dir().unwrap_or_default();
        Ok(Self {
            root: resolve_path(&base, path),
        })
    }

    pub fn path(&self) -> &Path {
        &self.root
    }

    /// Every Markdown file of the vault, in UTF-16 order (see [`list_markdown_files`]).
    pub fn markdown_files(&self) -> Vec<ConfinedPath> {
        list_markdown_files(&self.root)
            .into_iter()
            .map(ConfinedPath::new)
            .collect()
    }

    /// The slug of a file below the vault: its path with `/` separators and no `.md`, in NFC.
    /// macOS often lists Korean names as NFD while frontmatter is typed as NFC, and the byte
    /// mismatch would drop those nodes' relations. Only the identifier is normalised; the disk
    /// path stays as it is. `None` for a path outside the vault.
    pub fn slug_of(&self, file: &ConfinedPath) -> Option<String> {
        let parts = segments_below(&self.root, file.as_path())?;
        let joined = parts.join("/");
        let without_extension = joined.strip_suffix(".md").unwrap_or(&joined);
        Some(
            ComposingNormalizerBorrowed::new_nfc()
                .normalize(without_extension)
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
            return Err(SlugError::RawSource(
                raw_source_slug_issue(&raw_source).unwrap_or(raw_source),
            ));
        }
        assert_real_path_inside(&candidate, &self.root, slug)?;
        Ok(ConfinedPath::new(candidate))
    }

    /// [`Self::read_path`] for a file a write tool will create, change or delete: it also refuses
    /// what `unwritable_slug_issue` names, as typed or where the slug resolves through a link.
    pub fn write_path(&self, slug: &str) -> Result<WritablePath, SlugError> {
        if let Some(issue) = unwritable_slug_issue(slug) {
            return Err(SlugError::Unwritable(issue));
        }
        let confined = self.read_path(slug)?;
        self.refuse_unwritable_through_links(slug, confined.as_path())?;
        Ok(WritablePath { path: confined })
    }

    /// A file already found in the vault (listed by [`Self::markdown_files`]) as one a write tool
    /// may change, by the same rules as [`Self::write_path`] applied to its own slug.
    pub fn writable(&self, file: &ConfinedPath) -> Result<WritablePath, SlugError> {
        let slug = self.slug_of(file).ok_or_else(|| SlugError::OutsideRoot {
            slug: file.display().to_string(),
        })?;
        if let Some(issue) = unwritable_slug_issue(&slug) {
            return Err(SlugError::Unwritable(issue));
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
        match unwritable_slug_issue(&resolved) {
            Some(issue) => Err(SlugError::UnwritableThroughLink {
                slug: slug.to_string(),
                resolved,
                issue,
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
                hit.strip_suffix(".md").unwrap_or(&hit).to_string()
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
    joined.strip_suffix(".md").unwrap_or(&joined).to_string()
}

/// The real path must stay inside the vault. A file that does not exist yet answers through its
/// nearest existing folder, as creating a file inside a linked folder is the same escape. A
/// missing path that is itself a link (dangling) is followed to where it points, so a write
/// cannot create the file the link names outside the vault.
fn assert_real_path_inside(candidate: &Path, root: &Path, slug: &str) -> Result<(), SlugError> {
    let Ok(real_root) = real_path(root) else {
        // If the root itself cannot be resolved, the lexical check is all there is.
        return Ok(());
    };
    let escape = || SlugError::OutsideRootThroughLink {
        slug: slug.to_string(),
    };
    let mut probe = candidate.to_path_buf();
    let mut hops = 0;
    loop {
        match real_path(&probe) {
            Ok(real) => {
                return if is_within(&real_root, &real) {
                    Ok(())
                } else {
                    Err(escape())
                };
            }
            Err(_) => {
                if let Some(target) = link_target(&probe) {
                    hops += 1;
                    if hops > MAX_LINK_HOPS {
                        return Err(escape());
                    }
                    probe = target;
                    continue;
                }
                match probe.parent() {
                    Some(parent) if parent != probe => probe = parent.to_path_buf(),
                    _ => return Ok(()),
                }
            }
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

    fn message(result: Result<impl std::fmt::Debug, SlugError>) -> String {
        result.expect_err("refused").to_string()
    }

    #[test]
    fn a_plain_slug_names_a_file_under_the_vault() {
        let (_directory, root) = vault();
        let path = root.read_path("domains/auth").expect("allowed");
        assert_eq!(path.as_path(), root.path().join("domains/auth.md"));
        assert!(root.read_path("\u{d55c}\u{ae00}/\u{d3ec}").is_ok());
    }

    #[test]
    fn the_refusals_read_as_the_javascript_server_prints_them() {
        let (_directory, root) = vault();
        assert_eq!(
            message(root.read_path("")),
            "slug must be a non-empty string"
        );
        assert_eq!(
            message(root.read_path("a\0b")),
            "slug must not contain a null byte"
        );
        assert_eq!(
            message(root.read_path("../../etc/passwd")),
            "slug points outside the vault root: \"../../etc/passwd\""
        );
        assert_eq!(
            message(root.read_path("/etc/passwd")),
            "slug points outside the vault root: \"/etc/passwd\""
        );
        assert_eq!(
            message(root.read_path("sources/a")),
            raw_source_slug_issue("sources/a").expect("issue")
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
        let existing = message(root.read_path("linked/secret"));
        let created = message(root.read_path("linked/new-file"));
        std::fs::remove_dir_all(&outside).expect("cleanup");
        assert_eq!(
            existing,
            "slug resolves outside the vault root through a symlink: \"linked/secret\""
        );
        assert_eq!(
            created,
            "slug resolves outside the vault root through a symlink: \"linked/new-file\""
        );
    }

    #[test]
    fn a_dangling_link_pointing_out_cannot_be_written_through() {
        let (directory, root) = vault();
        let outside_target = directory
            .path()
            .parent()
            .expect("parent")
            .join("planted-target-that-does-not-exist.md");
        symlink(&outside_target, root.path().join("dangling.md")).expect("link");
        assert_eq!(
            message(root.write_path("dangling")),
            "slug resolves outside the vault root through a symlink: \"dangling\""
        );
        assert!(!outside_target.exists());
        // A dangling link that points inside the vault is a path a write may create.
        symlink(root.path().join("inside.md"), root.path().join("alias.md")).expect("link");
        assert!(root.write_path("alias").is_ok());
    }

    #[test]
    fn a_link_that_makes_a_node_look_like_a_raw_source_is_refused() {
        let (_directory, root) = vault();
        std::fs::create_dir_all(root.path().join("sources")).expect("sources");
        std::fs::write(root.path().join("sources/page.md"), "x").expect("page");
        symlink(root.path().join("sources"), root.path().join("alias")).expect("link");
        assert_eq!(
            message(root.read_path("alias/page")),
            raw_source_slug_issue("sources/page").expect("issue")
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
        let text = message(root.write_path("notes"));
        assert!(
            text.starts_with("slug \"notes\" resolves through a link to \"AGENTS\". slug \"AGENTS\" names AGENTS.md"),
            "{text}"
        );
        assert!(root.read_path("notes").is_ok());
    }

    #[test]
    fn a_write_path_refuses_what_a_write_tool_never_names() {
        let (_directory, root) = vault();
        assert!(message(root.write_path(".claude/rules")).contains("path segment \".claude\""));
        assert!(message(root.write_path("README")).contains("vault README"));
        assert!(root.write_path("capabilities/read").is_ok());
        assert!(root.read_path(".claude/rules").is_ok());
    }

    #[test]
    fn a_slug_is_listed_back_in_nfc_whatever_the_disk_spelled() {
        let (_directory, root) = vault();
        // "한" typed as the three jamo U+1112 U+1161 U+11AB, as a Mac lists it.
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
