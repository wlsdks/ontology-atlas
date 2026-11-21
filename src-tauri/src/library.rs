//! Raw sources are copied, measured and hashed, never parsed (`docs/DECISIONS.md`).
//! Discovery returns metadata for granted roots only, so no credential is scanned
//! (`.claude/rules/local-first.md`); mirrored in `source-discovery.ts`, or they drift.

use std::collections::HashMap;
use std::fs;
use std::io::{Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use crate::lower_hex::lower_hex;
use sha2::{Digest, Sha256};

use crate::{canonical_root, canonical_source_root, resolve_existing_inside};

pub(crate) mod dropped;

/// A path Rust handed to the page, and where its copy lands under `sources/`: the
/// `/`-joined path below the root Rust offered it from, never a value the page sent.
#[derive(Clone, Debug)]
pub(crate) struct SourceOffer {
    pub(crate) canonical: PathBuf,
    pub(crate) relative: String,
    identity: FileIdentity,
}

/// The file an offer named. The copy reopens the path, so anything swapped in after the offer
/// (a link to a key, a FIFO, another file) is told apart by this. Windows compares only the
/// length, since std exposes no stable file index there; a reparse point is refused instead.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FileIdentity {
    device: u64,
    inode: u64,
    length: u64,
}

impl FileIdentity {
    fn of(metadata: &fs::Metadata) -> Self {
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            Self {
                device: metadata.dev(),
                inode: metadata.ino(),
                length: metadata.len(),
            }
        }
        #[cfg(not(unix))]
        {
            Self {
                device: 0,
                inode: 0,
                length: metadata.len(),
            }
        }
    }
}

impl SourceOffer {
    /// Records what is at `canonical` now, without following a link there; only a regular file
    /// can be offered.
    pub(crate) fn of_file(canonical: PathBuf, relative: String) -> Option<Self> {
        let metadata = fs::symlink_metadata(&canonical).ok()?;
        metadata.is_file().then(|| Self {
            identity: FileIdentity::of(&metadata),
            canonical,
            relative,
        })
    }
}

/// Reopens an offered file without following a link and without waiting on a FIFO, then
/// requires the very file the offer recorded.
#[cfg(unix)]
fn open_offered(offer: &SourceOffer) -> Result<fs::File, &'static str> {
    use std::os::unix::fs::OpenOptionsExt;
    let file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(&offer.canonical)
        .map_err(open_failure)?;
    let metadata = file.metadata().map_err(|_| "source-unreadable")?;
    if !metadata.is_file() || FileIdentity::of(&metadata) != offer.identity {
        return Err("source-changed-since-offered");
    }
    Ok(file)
}

#[cfg(windows)]
fn open_offered(offer: &SourceOffer) -> Result<fs::File, &'static str> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    let file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(&offer.canonical)
        .map_err(open_failure)?;
    let metadata = file.metadata().map_err(|_| "source-unreadable")?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || !metadata.is_file()
        || FileIdentity::of(&metadata) != offer.identity
    {
        return Err("source-changed-since-offered");
    }
    Ok(file)
}

fn open_failure(error: std::io::Error) -> &'static str {
    #[cfg(unix)]
    if error.raw_os_error() == Some(libc::ELOOP) {
        // `O_NOFOLLOW` met a link swapped in after the offer.
        return "source-changed-since-offered";
    }
    match error.kind() {
        std::io::ErrorKind::NotFound => "source-missing",
        _ => "source-unreadable",
    }
}

fn vended_source_paths() -> &'static Mutex<HashMap<String, SourceOffer>> {
    static VENDED: OnceLock<Mutex<HashMap<String, SourceOffer>>> = OnceLock::new();
    VENDED.get_or_init(|| Mutex::new(HashMap::new()))
}

/// A picked file lands flat, under its own name.
fn remember_source_path(vended: String, canonical: PathBuf) {
    let relative = canonical
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    if let Some(offer) = SourceOffer::of_file(canonical, relative) {
        remember_source_offer(vended, offer);
    }
}

pub(crate) fn remember_source_offer(vended: String, offer: SourceOffer) {
    vended_source_paths()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .insert(vended, offer);
}

pub(crate) fn forget_source_offers(vended: &[String]) {
    let mut offers = vended_source_paths()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    for key in vended {
        offers.remove(key);
    }
}

fn take_source_path(vended: &str) -> Option<SourceOffer> {
    vended_source_paths()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .remove(vended)
}

/// Same value as TS `VAULT_SOURCES_DIR`.
const SOURCES_DIR: &str = "sources";
/// Same value as TS `PLANNING_HOME_FOLDER`.
const PLANNING_DIR: &str = "planning";

/// The only folders an import may land in. The page names one; it never sends a path,
/// and any other value fails argument parsing before the command runs.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportDestination {
    #[default]
    Sources,
    Planning,
}

impl ImportDestination {
    fn folder(self) -> &'static str {
        match self {
            Self::Sources => SOURCES_DIR,
            Self::Planning => PLANNING_DIR,
        }
    }
}

/// Must equal TS `DISCOVERY_DOCUMENT_EXTENSIONS`. An allow-list, because a
/// deny-list fails on the first unforeseen name; `log` is absent because logs are output.
const DISCOVERY_DOCUMENT_EXTENSIONS: &[&str] = &[
    "pdf", "docx", "doc", "xlsx", "xls", "csv", "tsv", "pptx", "ppt", "txt", "rtf", "odt", "ods",
    "odp", "epub", "md", "markdown", "html", "htm",
];

/// Must equal TS `DISCOVERY_MARKDOWN_EXTENSIONS`. Markdown is offered only from the open
/// folder, and the page drops any file the vault index knows as a node (`kind:`).
const DISCOVERY_MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown"];

/// Must equal TS `DISCOVERY_GUIDE_STEMS`: a repository's guides for people and agents,
/// refused as Markdown, alone or before a further `.` (`README.ko.md`).
const DISCOVERY_GUIDE_STEMS: &[&str] = &[
    "readme",
    "agents",
    "claude",
    "gemini",
    "contributing",
    "code_of_conduct",
    "security",
];

/// Must equal TS `DISCOVERY_VAULT_OWNED_DIRS`: what Atlas itself keeps in the open folder.
const DISCOVERY_VAULT_OWNED_DIRS: &[&str] = &["sources", "wiki"];

/// Must equal TS `DISCOVERY_PRUNE_DIR_NAMES`, compared lowercased; dot directories are
/// skipped separately. Generated, published and test-data folders hold files no one wrote
/// as a document.
const DISCOVERY_PRUNE_DIR_NAMES: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    "vendor",
    "pods",
    "deriveddata",
    "__pycache__",
    "venv",
    "public",
    "static",
    "output",
    "outputs",
    "generated",
    "gen",
    "tmp",
    "temp",
    "cache",
    "logs",
    "third_party",
    "third-party",
    "licenses",
    "licences",
    "fixtures",
    "__fixtures__",
    "testdata",
    "test-results",
    "playwright-report",
];

/// Must equal TS `DISCOVERY_PRUNE_DIR_PATHS`; matched as whole trailing segments.
const DISCOVERY_PRUNE_DIR_PATHS: &[&str] = &["src/test/resources", "tests/data"];

/// Must equal TS `DISCOVERY_NOTICE_STEMS`: legal and project notices in any format.
const DISCOVERY_NOTICE_STEMS: &[&str] = &[
    "license",
    "licence",
    "copying",
    "notice",
    "third-party",
    "thirdparty",
    "third_party",
    "authors",
    "contributors",
    "changelog",
    "patents",
];

/// Must equal TS `DISCOVERY_NOTICE_SUFFIXES`: a bundled library's licence, `x-1.0.LICENSE.txt`.
/// A hyphen is absent so `driver-license.pdf` stays a document.
const DISCOVERY_NOTICE_SUFFIXES: &[&str] = &[".license", "_license", ".licence", "_licence"];

/// Must equal TS `DISCOVERY_BUILD_FILE_NAMES`; `requirements-*.txt` is matched by prefix.
const DISCOVERY_BUILD_FILE_NAMES: &[&str] = &["cmakelists.txt", "requirements.txt", "robots.txt"];
const REQUIREMENTS_VARIANT_PREFIX: &str = "requirements-";

/// Must equal TS `DISCOVERY_MIN_FILE_BYTES`; smaller files are empty or placeholders.
const DISCOVERY_MIN_FILE_BYTES: u64 = 64;

/// Must equal TS `DISCOVERY_DENIED_NAME_FRAGMENTS`; catches secrets the extension
/// allow-list cannot, such as `credentials.csv`.
const DISCOVERY_DENIED_NAME_FRAGMENTS: &[&str] = &[
    "credential",
    "secret",
    "password",
    "passwd",
    "token",
    "apikey",
    "api-key",
    "api_key",
    "id_rsa",
    "id_ed25519",
    "id_dsa",
    "id_ecdsa",
    ".env",
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".keystore",
    ".jks",
    ".htpasswd",
];

const DISCOVERY_MAX_DEPTH: usize = 8;
const DISCOVERY_MAX_CANDIDATES: usize = 500;

fn lower_extension(name: &str) -> String {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => ext.to_ascii_lowercase(),
        _ => String::new(),
    }
}

fn names_a_notice(stem: &str) -> bool {
    DISCOVERY_NOTICE_STEMS.iter().any(|notice| {
        stem.strip_prefix(notice)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with(['-', '_', '.']))
    }) || DISCOVERY_NOTICE_SUFFIXES
        .iter()
        .any(|suffix| stem.ends_with(suffix))
}

fn names_a_build_file(lowered: &str) -> bool {
    DISCOVERY_BUILD_FILE_NAMES.contains(&lowered)
        || (lowered.starts_with(REQUIREMENTS_VARIANT_PREFIX) && lowered.ends_with(".txt"))
}

/// A digits-only stem shorter than 32 is a date or scanner counter, so it stays a document.
fn looks_like_a_hash(stem: &str) -> bool {
    let is_hex = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_hexdigit());
    if is_hex(stem) {
        let has_letter = stem.bytes().any(|b| matches!(b, b'a'..=b'f'));
        return (stem.len() >= 16 && has_letter) || matches!(stem.len(), 32 | 40 | 64);
    }
    let groups: Vec<&str> = stem.split('-').collect();
    groups.len() == 5
        && groups
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(group, len)| group.len() == len && is_hex(group))
}

/// Why a walk passes a file over, in the words the skipped line uses; mirrors TS
/// `DiscoverySkipReason`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SkipReason {
    SecretName,
    Licence,
    NotDocument,
}

fn file_stem<'a>(lowered: &'a str, extension: &str) -> &'a str {
    lowered
        .strip_suffix(extension)
        .and_then(|rest| rest.strip_suffix('.'))
        .unwrap_or(lowered)
}

/// The name rules every folder walk applies; repository guides are discovery's alone.
pub(crate) fn discovery_skip_reason(name: &str) -> Option<SkipReason> {
    let lowered = name.to_ascii_lowercase();
    if DISCOVERY_DENIED_NAME_FRAGMENTS
        .iter()
        .any(|fragment| lowered.contains(fragment))
    {
        return Some(SkipReason::SecretName);
    }
    let extension = lower_extension(&lowered);
    let stem = file_stem(&lowered, &extension);
    if names_a_notice(stem) {
        return Some(SkipReason::Licence);
    }
    if !DISCOVERY_DOCUMENT_EXTENSIONS.contains(&extension.as_str())
        || names_a_build_file(&lowered)
        || looks_like_a_hash(stem)
    {
        return Some(SkipReason::NotDocument);
    }
    None
}

pub(crate) fn is_markdown_name(name: &str) -> bool {
    DISCOVERY_MARKDOWN_EXTENSIONS.contains(&lower_extension(&name.to_ascii_lowercase()).as_str())
}

fn names_a_repository_guide(lowered: &str) -> bool {
    let extension = lower_extension(lowered);
    if !DISCOVERY_MARKDOWN_EXTENSIONS.contains(&extension.as_str()) {
        return false;
    }
    let stem = file_stem(lowered, &extension);
    DISCOVERY_GUIDE_STEMS.iter().any(|guide| {
        stem.strip_prefix(guide)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('.'))
    })
}

/// A free function so this test and the TS mirror test measure the same rule.
pub(crate) fn discovery_accepts_file(name: &str) -> bool {
    if name.starts_with('.') {
        return false;
    }
    discovery_skip_reason(name).is_none() && !names_a_repository_guide(&name.to_ascii_lowercase())
}

/// Takes the path relative to the walked root, with either separator, so Windows matches too.
pub(crate) fn discovery_accepts_directory(relative: &str) -> bool {
    let normalized = relative.replace('\\', "/").to_ascii_lowercase();
    let normalized = normalized.trim_end_matches('/');
    let name = normalized.rsplit('/').next().unwrap_or(normalized);
    if name.starts_with('.') || DISCOVERY_PRUNE_DIR_NAMES.contains(&name) {
        return false;
    }
    !DISCOVERY_PRUNE_DIR_PATHS.iter().any(|path| {
        normalized
            .strip_suffix(path)
            .is_some_and(|before| before.is_empty() || before.ends_with('/'))
    })
}

/// 64 KiB chunks keep a 200 MB scan out of resident memory.
fn copy_hashing(
    input: &mut impl std::io::Read,
    output: &mut impl std::io::Write,
) -> std::io::Result<(String, u64)> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut length = 0_u64;
    loop {
        let read = match input.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => read,
            Err(err) if err.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(err) => return Err(err),
        };
        let chunk = buffer.get(..read).ok_or_else(|| {
            std::io::Error::other("a read returned more bytes than the buffer holds")
        })?;
        hasher.update(chunk);
        output.write_all(chunk)?;
        length += read as u64;
    }
    Ok((lower_hex(&hasher.finalize()), length))
}

fn hash_and_length(path: &Path) -> Result<(String, u64), String> {
    let mut file = fs::File::open(path).map_err(|err| err.to_string())?;
    copy_hashing(&mut file, &mut std::io::sink()).map_err(|err| err.to_string())
}

pub(crate) fn hash_path(path: &Path) -> Result<String, String> {
    hash_and_length(path).map(|(hash, _)| hash)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFileHash {
    pub relative_path: String,
    /// `None` when unreadable, so an unreadable source never reads as compiled.
    pub sha256: Option<String>,
}

/// Hashed natively so a scan never crosses IPC; the screen asks only for cited sources.
#[tauri::command(async)]
pub fn hash_vault_files(
    root_path: String,
    relative_paths: Vec<String>,
) -> Result<Vec<VaultFileHash>, String> {
    let mut out = Vec::with_capacity(relative_paths.len());
    for relative_path in relative_paths {
        let sha256 = resolve_existing_inside(&root_path, &relative_path)
            .and_then(|path| hash_path(&path))
            .ok();
        out.push(VaultFileHash {
            relative_path,
            sha256,
        });
    }
    Ok(out)
}

/// Not `async`: `NSOpenPanel` must run on the macOS main thread.
#[tauri::command]
pub fn pick_source_files(dialog_title: Option<String>) -> Result<Vec<String>, String> {
    let title = dialog_title.as_deref().unwrap_or("Add documents");
    let Some(picked) = rfd::FileDialog::new().set_title(title).pick_files() else {
        return Ok(Vec::new());
    };
    let vended: Vec<String> = picked
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    for (path, vended) in picked.iter().zip(vended.iter()) {
        if let Ok(canonical) = fs::canonicalize(path) {
            remember_source_path(vended.clone(), canonical);
        }
    }
    Ok(vended)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceImportResult {
    pub picked_name: String,
    /// `added` · `duplicate` · `renamed` · `failed`.
    pub status: String,
    /// For `duplicate`, the file that already held these bytes.
    pub relative_path: Option<String>,
    pub sha256: Option<String>,
    pub size: Option<u64>,
    pub reason: Option<String>,
}

fn safe_source_file_name(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return None;
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return None;
    }
    // A leading dot would hide the imported file from the vault walk.
    Some(trimmed.trim_start_matches('.').to_string()).filter(|value| !value.is_empty())
}

fn split_name(name: &str) -> (String, String) {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
        _ => (name.to_string(), String::new()),
    }
}

/// Indexed by content hash so the same bytes under another name are recognised.
fn index_existing_files(root: &Path, folder: &str) -> Result<Vec<(String, String)>, String> {
    let destination = root.join(folder);
    if !destination.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let mut stack = vec![(destination, String::from(folder))];
    while let Some((dir, prefix)) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let relative = format!("{prefix}/{name}");
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                stack.push((entry.path(), relative));
            } else if file_type.is_file() {
                if let Ok(hash) = hash_path(&entry.path()) {
                    out.push((hash, relative));
                }
            }
        }
    }
    Ok(out)
}

/// Writes the copy under the first of `names` still free in `folder_relative`, never replacing
/// a file: `(sha256, length, name used)`, or `None` when every name was taken.
#[cfg(unix)]
fn copy_source_into(
    root_path: &str,
    folder_relative: &str,
    names: impl Iterator<Item = String>,
    source: &mut impl std::io::Read,
) -> Result<Option<(String, u64, String)>, String> {
    let root = canonical_root(root_path)?;
    let root_handle = crate::agent_setup::open_absolute_directory_no_follow(&root)?;
    let (parent, _) =
        crate::agent_setup::open_entry_parent(&root_handle, &format!("{folder_relative}/name"))
            .map_err(|_| "import-destination-not-a-folder".to_string())?;
    let names = names.filter_map(|name| std::ffi::CString::new(name).ok());
    let published =
        crate::agent_setup::create_first_free_entry_with(&parent, names, 0o666, |file| {
            copy_hashing(source, file)
        })
        .map_err(|_| "import-destination-unwritable".to_string())?;
    Ok(published.map(|((hash, length), name)| (hash, length, name.to_string_lossy().into_owned())))
}

/// Windows lacks `openat`/`O_NOFOLLOW`, so `resolve_write_target_inside` checks the
/// path instead, the same rule `write_vault_text_file` uses, or bytes could escape.
/// `create_new` never replaces; a copy that fails removes only the file it created.
#[cfg(not(unix))]
fn copy_source_into(
    root_path: &str,
    folder_relative: &str,
    names: impl Iterator<Item = String>,
    source: &mut impl std::io::Read,
) -> Result<Option<(String, u64, String)>, String> {
    for name in names {
        let target =
            crate::resolve_write_target_inside(root_path, &format!("{folder_relative}/{name}"))?;
        let mut file = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(file) => file,
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("import-destination-unwritable".into()),
        };
        return match copy_hashing(source, &mut file) {
            Ok((hash, length)) => Ok(Some((hash, length, name))),
            Err(_) => {
                drop(file);
                let _ = fs::remove_file(&target);
                Err("import-destination-unwritable".into())
            }
        };
    }
    Ok(None)
}

/// How one import reports and stops. Each call owns its flag, so a page's Stop reaches
/// only the copy it started; the flag is read between files, so a file is never cut.
#[derive(Default)]
pub(crate) struct ImportControl<'a> {
    pub(crate) stop: Option<&'a AtomicBool>,
    pub(crate) progress: Option<&'a dyn Fn(usize, usize)>,
}

/// Never overwrites and refuses a second copy of the same bytes. Nothing is written
/// beside the copy, since a sidecar index would be a second canonical store
/// (`.claude/rules/forbidden.md`).
#[tauri::command(async)]
pub fn import_source_files(
    root_path: String,
    source_paths: Vec<String>,
    destination: Option<ImportDestination>,
) -> Result<Vec<SourceImportResult>, String> {
    import_sources(
        &root_path,
        source_paths,
        destination.unwrap_or_default(),
        &ImportControl::default(),
    )
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceImportProgress {
    pub done: usize,
    pub total: usize,
}

/// A 2,000-file copy sends about this many updates a second, not one per file.
const PROGRESS_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);

fn running_imports() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// One copy into a folder at a time: two copies would race for the same free names.
struct ImportingFolder(PathBuf);

impl ImportingFolder {
    /// The lock is released before a claim is built, since a refused claim's drop takes it again.
    fn claim(root: PathBuf) -> Option<Self> {
        let claimed = importing_folders()
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .insert(root.clone());
        claimed.then(|| Self(root))
    }
}

impl Drop for ImportingFolder {
    fn drop(&mut self) {
        importing_folders()
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .remove(&self.0);
    }
}

fn importing_folders() -> &'static Mutex<std::collections::HashSet<PathBuf>> {
    static IMPORTING: OnceLock<Mutex<std::collections::HashSet<PathBuf>>> = OnceLock::new();
    IMPORTING.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

/// Copies offered paths into `sources/`, each under the folders Rust recorded when it
/// offered the path, and streams how many are done. Off the main thread, so input stays live.
#[tauri::command(async)]
pub fn import_offered_sources(
    root_path: String,
    source_paths: Vec<String>,
    import_id: String,
    progress: tauri::ipc::Channel<SourceImportProgress>,
) -> Result<Vec<SourceImportResult>, String> {
    let Some(_folder) = ImportingFolder::claim(canonical_root(&root_path)?) else {
        return Err("import-already-running".into());
    };
    let stop = Arc::new(AtomicBool::new(false));
    running_imports()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .insert(import_id.clone(), stop.clone());
    let last_sent = std::cell::Cell::new(None::<std::time::Instant>);
    let report = |done: usize, total: usize| {
        let now = std::time::Instant::now();
        let recent = last_sent
            .get()
            .is_some_and(|at| now.duration_since(at) < PROGRESS_INTERVAL);
        if done < total && recent {
            return;
        }
        last_sent.set(Some(now));
        let _ = progress.send(SourceImportProgress { done, total });
    };
    let outcome = import_sources(
        &root_path,
        source_paths,
        ImportDestination::Sources,
        &ImportControl {
            stop: Some(&stop),
            progress: Some(&report),
        },
    );
    running_imports()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .remove(&import_id);
    outcome
}

/// Stops the named import after the file it is copying; what landed stays.
#[tauri::command]
pub fn stop_source_import(import_id: String) -> bool {
    let running = running_imports()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    match running.get(&import_id) {
        Some(stop) => {
            stop.store(true, Ordering::Relaxed);
            true
        }
        None => false,
    }
}

pub(crate) fn import_sources(
    root_path: &str,
    source_paths: Vec<String>,
    destination: ImportDestination,
    control: &ImportControl,
) -> Result<Vec<SourceImportResult>, String> {
    let folder = destination.folder();
    // Every offer is spent before any refusal, so a refused pick never stays importable.
    let mut resolved: HashMap<String, SourceOffer> = HashMap::new();
    for source_path in &source_paths {
        if !resolved.contains_key(source_path) {
            if let Some(offer) = take_source_path(source_path) {
                resolved.insert(source_path.clone(), offer);
            }
        }
    }
    let root = canonical_root(root_path)?;
    let target = root.join(folder);
    refuse_linked_folder(&target)?;
    fs::create_dir_all(&target).map_err(|err| err.to_string())?;
    let mut run = ImportRun {
        root_path,
        folder,
        destination,
        existing: index_existing_files(&root, folder)?,
        taken: folded_names(destination, &target),
        target,
        landed: HashMap::new(),
        folder_names: HashMap::new(),
    };
    let total = source_paths.len();
    let mut results = Vec::with_capacity(total);
    for (index, source_path) in source_paths.iter().enumerate() {
        if control
            .stop
            .is_some_and(|stop| stop.load(Ordering::Relaxed))
        {
            break;
        }
        results.push(run.copy_one(source_path, resolved.get(source_path)));
        if let Some(progress) = control.progress {
            progress(index + 1, total);
        }
    }
    Ok(results)
}

struct ImportRun<'a> {
    root_path: &'a str,
    folder: &'static str,
    destination: ImportDestination,
    target: PathBuf,
    /// `(sha256, relative path)` of every file already under the folder, hashed once per import.
    existing: Vec<(String, String)>,
    taken: Option<std::collections::HashSet<String>>,
    landed: HashMap<PathBuf, String>,
    folder_names: HashMap<PathBuf, HashMap<String, String>>,
}

impl ImportRun<'_> {
    fn copy_one(&mut self, source_path: &str, offer: Option<&SourceOffer>) -> SourceImportResult {
        let Some(offer) = offer else {
            let picked_name = Path::new(source_path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| source_path.to_string());
            return import_failure(&picked_name, "source-not-offered");
        };
        let canonical = &offer.canonical;
        let picked_name = canonical
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| source_path.to_string());
        let failure = |reason: &str| import_failure(&picked_name, reason);

        if let Some(relative) = self.landed.get(canonical) {
            return import_duplicate(picked_name.clone(), relative.clone(), None, None);
        }

        let placed = match self.destination {
            ImportDestination::Planning => {
                safe_source_file_name(&picked_name).map(|name| (Vec::new(), name))
            }
            ImportDestination::Sources => split_destination(&offer.relative),
        };
        let Some((folders, base_name)) = placed else {
            return failure("unusable-file-name");
        };
        if self.destination == ImportDestination::Planning && !planning_lists_name(&base_name) {
            return failure("unsupported-type");
        }

        let mut source = match open_offered(offer) {
            Ok(source) => source,
            Err(reason) => return failure(reason),
        };
        let (hash, length) = match copy_hashing(&mut source, &mut std::io::sink()) {
            Ok(measured) => measured,
            Err(_) => return failure("source-unreadable"),
        };
        if let Some((_, relative)) = self
            .existing
            .iter()
            .find(|(existing_hash, _)| *existing_hash == hash)
        {
            return import_duplicate(picked_name, relative.clone(), Some(hash), Some(length));
        }

        let (directory, folders) = match self.prepare_destination_folders(&folders) {
            Ok(prepared) => prepared,
            Err(reason) => return failure(&reason),
        };
        let (stem, extension) = split_name(&base_name);
        let mut candidate = base_name.clone();
        let mut suffix = 2;
        while name_taken(&directory, self.taken.as_ref(), &candidate) {
            candidate = format!("{stem} ({suffix}){extension}");
            suffix += 1;
            if suffix > 999 {
                break;
            }
        }
        if name_taken(&directory, self.taken.as_ref(), &candidate) {
            return failure("file-name-conflict-limit");
        }
        let folder_relative = std::iter::once(self.folder)
            .chain(folders.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join("/");
        // The check above can lose a race; publishing never replaces, so a name taken since
        // passes to the next number.
        let taken = self.taken.as_ref();
        let names = std::iter::once(candidate)
            .chain((suffix..=999).map(|n| format!("{stem} ({n}){extension}")))
            .filter(|name| !taken.is_some_and(|names| names.contains(&name.to_lowercase())));
        let copied = source
            .seek(SeekFrom::Start(0))
            .map_err(|_| "source-unreadable".to_string())
            .and_then(|_| copy_source_into(self.root_path, &folder_relative, names, &mut source));
        let (hash, length, candidate) = match copied {
            Ok(Some(written)) => written,
            Ok(None) => return failure("file-name-conflict-limit"),
            Err(err) => return failure(&err),
        };
        let renamed = candidate != base_name;
        let relative = format!("{folder_relative}/{candidate}");
        self.existing.push((hash.clone(), relative.clone()));
        if let Some(taken) = self.taken.as_mut() {
            taken.insert(candidate.to_lowercase());
        }
        self.landed.insert(canonical.clone(), relative.clone());
        SourceImportResult {
            picked_name,
            status: if renamed { "renamed" } else { "added" }.into(),
            relative_path: Some(relative),
            sha256: Some(hash),
            size: Some(length),
            reason: None,
        }
    }
}

/// An offer's recorded path, split into folders and a file name that each pass the
/// single-name rule, so no segment can be `..`, absolute, or carry a separator.
fn split_destination(relative: &str) -> Option<(Vec<String>, String)> {
    let mut segments = Vec::new();
    for segment in relative.split('/') {
        if cfg!(windows) && segment.contains(':') {
            return None;
        }
        segments.push(safe_source_file_name(segment)?);
    }
    let name = segments.pop()?;
    Some((segments, name))
}

impl ImportRun<'_> {
    /// Creates each folder below the destination, refusing a link or a file in the way, as
    /// the planning path does for its one folder; the platform writer then re-checks. A folder
    /// named like an existing one in another letter case is that folder (`Meetings` joins
    /// `meetings`), so a case-sensitive disk never grows a second one beside it.
    fn prepare_destination_folders(
        &mut self,
        folders: &[String],
    ) -> Result<(PathBuf, Vec<String>), String> {
        let mut directory = self.target.clone();
        let mut placed = Vec::with_capacity(folders.len());
        for asked in folders {
            let name = self
                .folder_names_in(&directory)
                .get(&asked.to_lowercase())
                .cloned()
                .unwrap_or_else(|| asked.clone());
            let parent = directory.clone();
            directory.push(&name);
            match fs::symlink_metadata(&directory) {
                Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                    return Err("import-destination-not-a-folder".into());
                }
                Ok(_) => {}
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                    fs::create_dir(&directory)
                        .map_err(|_| "import-destination-unwritable".to_string())?;
                }
                Err(_) => return Err("import-destination-unwritable".into()),
            }
            self.folder_names_in(&parent)
                .insert(name.to_lowercase(), name.clone());
            placed.push(name);
        }
        Ok((directory, placed))
    }

    /// Folder names under `directory`, keyed by their lower case; listed once per import.
    fn folder_names_in(&mut self, directory: &Path) -> &mut HashMap<String, String> {
        self.folder_names
            .entry(directory.to_path_buf())
            .or_insert_with(|| {
                fs::read_dir(directory)
                    .map(|entries| {
                        entries
                            .flatten()
                            .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
                            .map(|entry| {
                                let name = entry.file_name().to_string_lossy().into_owned();
                                (name.to_lowercase(), name)
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            })
    }
}

/// The home scan's rule: its file types, and secret-looking words refused for images only.
fn planning_lists_name(name: &str) -> bool {
    let name_os = std::ffi::OsStr::new(name);
    crate::planning::supported_file(name_os)
        && (lower_extension(name) == "md" || crate::planning::allowed_component(name_os))
}

/// The planning folder is read and indexed by path, so a link there would lead both outside.
fn refuse_linked_folder(target: &Path) -> Result<(), String> {
    match fs::symlink_metadata(target) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            Err("import-destination-not-a-folder".into())
        }
        Err(err) if err.kind() != std::io::ErrorKind::NotFound => Err(err.to_string()),
        _ => Ok(()),
    }
}

/// Planning names compare ignoring letter case, as new documents do; `sources` keeps
/// asking the file system alone. Every entry counts, so a dangling link's name stays taken.
fn folded_names(
    destination: ImportDestination,
    target: &Path,
) -> Option<std::collections::HashSet<String>> {
    if destination != ImportDestination::Planning {
        return None;
    }
    let entries = fs::read_dir(target).ok()?;
    Some(
        entries
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().to_lowercase())
            .collect(),
    )
}

fn name_taken(
    target: &Path,
    folded: Option<&std::collections::HashSet<String>>,
    candidate: &str,
) -> bool {
    // A dangling link still holds its name.
    fs::symlink_metadata(target.join(candidate)).is_ok()
        || folded.is_some_and(|names| names.contains(&candidate.to_lowercase()))
}

fn import_failure(picked_name: &str, reason: &str) -> SourceImportResult {
    SourceImportResult {
        picked_name: picked_name.to_string(),
        status: "failed".into(),
        relative_path: None,
        sha256: None,
        size: None,
        reason: Some(reason.to_string()),
    }
}

fn import_duplicate(
    picked_name: String,
    relative: String,
    sha256: Option<String>,
    size: Option<u64>,
) -> SourceImportResult {
    SourceImportResult {
        picked_name,
        status: "duplicate".into(),
        relative_path: Some(relative),
        sha256,
        size,
        reason: None,
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiscoveryRoot {
    pub root_path: String,
    pub label: String,
    /// The open folder passes `sources` so imported files are not proposed again.
    #[serde(default)]
    pub skip_relative: Vec<String>,
    /// The open folder, the only root whose Markdown is offered; a bound code root's
    /// Markdown is developer documentation.
    #[serde(default)]
    pub open_folder: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCandidate {
    pub root_path: String,
    pub root_label: String,
    pub relative_path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub mtime: u128,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiscoveryReport {
    pub candidates: Vec<SourceCandidate>,
    /// Silent truncation would read as the complete list.
    pub truncated: bool,
    pub unreadable_roots: Vec<String>,
}

fn walk_candidates(
    dir: &Path,
    root: &SourceDiscoveryRoot,
    prefix: &str,
    depth: usize,
    report: &mut SourceDiscoveryReport,
) {
    if depth > DISCOVERY_MAX_DEPTH || report.truncated {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if report.candidates.len() >= DISCOVERY_MAX_CANDIDATES {
            report.truncated = true;
            return;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if root
            .skip_relative
            .iter()
            .any(|skip| relative == *skip || relative.starts_with(&format!("{skip}/")))
            || (root.open_folder
                && depth == 0
                && DISCOVERY_VAULT_OWNED_DIRS.contains(&name.to_ascii_lowercase().as_str()))
        {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        // Symlinks are not followed, or a link could lead the walk outside granted roots.
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if !discovery_accepts_directory(&relative) {
                continue;
            }
            walk_candidates(&entry.path(), root, &relative, depth + 1, report);
        } else if file_type.is_file()
            && discovery_accepts_file(&name)
            && (root.open_folder || !is_markdown_name(&name))
        {
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.len() < DISCOVERY_MIN_FILE_BYTES {
                continue;
            }
            let mtime = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|since| since.as_millis())
                .unwrap_or(0);
            report.candidates.push(SourceCandidate {
                root_path: root.root_path.clone(),
                root_label: root.label.clone(),
                relative_path: relative,
                name: name.clone(),
                extension: lower_extension(&name),
                size: metadata.len(),
                mtime,
            });
        }
    }
}

/// Metadata only: no file is opened and nothing is copied until the person chooses.
#[tauri::command(async)]
pub fn discover_source_candidates(
    roots: Vec<SourceDiscoveryRoot>,
) -> Result<SourceDiscoveryReport, String> {
    let mut report = SourceDiscoveryReport {
        candidates: Vec::new(),
        truncated: false,
        unreadable_roots: Vec::new(),
    };
    for root in &roots {
        // Only a granted vault or the repo a granted vault lives in; the renderer
        // supplies these from the vault root and its project-source bindings, so a
        // forged root cannot enumerate names/sizes/mtimes under an arbitrary directory.
        let Ok(canonical) = canonical_source_root(&root.root_path) else {
            report.unreadable_roots.push(root.label.clone());
            continue;
        };
        if crate::vault_root_rejection(&canonical).is_some() {
            report.unreadable_roots.push(root.label.clone());
            continue;
        }
        let start = report.candidates.len();
        walk_candidates(&canonical, root, "", 0, &mut report);
        for candidate in report.candidates.iter().skip(start) {
            if let Some(offer) = SourceOffer::of_file(
                canonical.join(&candidate.relative_path),
                candidate.relative_path.clone(),
            ) {
                remember_source_offer(
                    format!("{}/{}", candidate.root_path, candidate.relative_path),
                    offer,
                );
            }
        }
    }
    report
        .candidates
        .sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.name.cmp(&b.name)));
    Ok(report)
}

/// Creates `sources/` when missing and selects it in the file manager; a linked
/// `sources/` is refused, as an import into it would be.
#[tauri::command]
pub async fn reveal_sources_folder(root_path: String) -> Result<(), String> {
    crate::blocking::run_blocking(move || reveal_sources_folder_blocking(&root_path)).await
}

pub(crate) fn reveal_sources_folder_blocking(root_path: &str) -> Result<(), String> {
    let target = canonical_root(root_path)?.join(SOURCES_DIR);
    refuse_linked_folder(&target)?;
    fs::create_dir_all(&target).map_err(|err| err.to_string())?;
    reveal_path(&target)
}

#[cfg(target_os = "macos")]
fn reveal_path(path: &Path) -> Result<(), String> {
    let status = std::process::Command::new("open")
        .arg("-R")
        .arg(path)
        .status()
        .map_err(|err| err.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("open exited with status {status}"))
    }
}

#[cfg(not(target_os = "macos"))]
fn reveal_path(path: &Path) -> Result<(), String> {
    crate::app_shell::reveal_in_file_manager(path)
}

/// Reveal, not open: the app never launches a program on the person's behalf.
#[tauri::command]
pub async fn reveal_vault_file(root_path: String, relative_path: String) -> Result<(), String> {
    crate::blocking::run_blocking(move || reveal_vault_file_blocking(root_path, relative_path))
        .await
}

pub(crate) fn reveal_vault_file_blocking(
    root_path: String,
    relative_path: String,
) -> Result<(), String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    if !path.is_file() {
        return Err("reveal target must be a file".into());
    }
    reveal_path(&path)
}

#[cfg(test)]
mod tests;
