//! Raw sources are copied, measured and hashed, never parsed (`docs/DECISIONS.md`).
//! Discovery returns metadata for granted roots only, so no credential is scanned
//! (`.claude/rules/local-first.md`); mirrored in `source-discovery.ts`, or they drift.

use std::collections::HashMap;
use std::fs;
use std::io::{Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::lower_hex::lower_hex;
use sha2::{Digest, Sha256};

use crate::{canonical_root, canonical_source_root, resolve_existing_inside};

fn vended_source_paths() -> &'static Mutex<HashMap<String, PathBuf>> {
    static VENDED: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();
    VENDED.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember_source_path(vended: String, canonical: PathBuf) {
    vended_source_paths()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .insert(vended, canonical);
}

fn take_source_path(vended: &str) -> Option<PathBuf> {
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
/// deny-list fails on the first unforeseen name; `md` is absent so vault Markdown
/// is never copied into two places.
const DISCOVERY_DOCUMENT_EXTENSIONS: &[&str] = &[
    "pdf", "docx", "doc", "xlsx", "xls", "csv", "pptx", "ppt", "txt", "rtf", "odt", "ods", "odp",
    "epub",
];

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

/// A free function so this test and the TS mirror test measure the same rule.
pub(crate) fn discovery_accepts_file(name: &str) -> bool {
    if name.starts_with('.') {
        return false;
    }
    let lowered = name.to_ascii_lowercase();
    if DISCOVERY_DENIED_NAME_FRAGMENTS
        .iter()
        .any(|fragment| lowered.contains(fragment))
    {
        return false;
    }
    let extension = lower_extension(&lowered);
    if !DISCOVERY_DOCUMENT_EXTENSIONS.contains(&extension.as_str()) {
        return false;
    }
    let stem = lowered
        .strip_suffix(extension.as_str())
        .and_then(|rest| rest.strip_suffix('.'))
        .unwrap_or(&lowered);
    !names_a_notice(stem) && !names_a_build_file(&lowered) && !looks_like_a_hash(stem)
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

#[derive(serde::Serialize)]
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

#[cfg(unix)]
fn copy_source_into(
    root_path: &str,
    relative_path: &str,
    source: &mut impl std::io::Read,
) -> Result<(String, u64), String> {
    let root = canonical_root(root_path)?;
    let root_handle = crate::agent_setup::open_absolute_directory_no_follow(&root)?;
    let (parent, file_name) = crate::agent_setup::open_entry_parent(&root_handle, relative_path)?;
    crate::agent_setup::write_entry_atomically_with(&parent, &file_name, 0o666, |file| {
        copy_hashing(source, file)
    })
}

/// Windows lacks `openat`/`O_NOFOLLOW`, so `resolve_write_target_inside` checks the
/// path instead, the same rule `write_vault_text_file` uses, or bytes could escape.
#[cfg(not(unix))]
fn copy_source_into(
    root_path: &str,
    relative_path: &str,
    source: &mut impl std::io::Read,
) -> Result<(String, u64), String> {
    let target = crate::resolve_write_target_inside(root_path, relative_path)?;
    let mut file = fs::File::create(&target).map_err(|err| err.to_string())?;
    copy_hashing(source, &mut file).map_err(|err| err.to_string())
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
    let destination = destination.unwrap_or_default();
    let folder = destination.folder();
    let mut resolved: HashMap<String, PathBuf> = HashMap::new();
    if destination == ImportDestination::Planning {
        // Every offer is spent before any refusal, so a refused pick never stays importable.
        for source_path in &source_paths {
            if !resolved.contains_key(source_path) {
                if let Some(canonical) = take_source_path(source_path) {
                    resolved.insert(source_path.clone(), canonical);
                }
            }
        }
    }
    let root = canonical_root(&root_path)?;
    let target = root.join(folder);
    if destination == ImportDestination::Planning {
        refuse_linked_folder(&target)?;
    }
    fs::create_dir_all(&target).map_err(|err| err.to_string())?;
    let mut existing = index_existing_files(&root, folder)?;
    let mut taken = folded_names(destination, &target);
    let mut results = Vec::with_capacity(source_paths.len());
    let mut landed: HashMap<PathBuf, String> = HashMap::new();

    for source_path in source_paths {
        let canonical = match resolved.get(&source_path) {
            Some(canonical) => Some(canonical.clone()),
            None => match take_source_path(&source_path) {
                Some(canonical) => {
                    resolved.insert(source_path.clone(), canonical.clone());
                    Some(canonical)
                }
                None => None,
            },
        };
        let Some(canonical) = canonical else {
            let picked_name = Path::new(&source_path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| source_path.clone());
            results.push(import_failure(&picked_name, "source-not-offered"));
            continue;
        };

        let picked_name = canonical
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| source_path.clone());
        let failure = |reason: &str| import_failure(&picked_name, reason);

        if let Some(relative) = landed.get(&canonical) {
            results.push(import_duplicate(picked_name, relative.clone(), None, None));
            continue;
        }

        let Some(base_name) = safe_source_file_name(&picked_name) else {
            results.push(failure("unusable-file-name"));
            continue;
        };
        if destination == ImportDestination::Planning && !planning_lists_name(&base_name) {
            results.push(failure("unsupported-type"));
            continue;
        }

        let mut source = match fs::File::open(&canonical) {
            Ok(source) => source,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                results.push(failure("source-missing"));
                continue;
            }
            Err(err) => {
                results.push(failure(&err.to_string()));
                continue;
            }
        };
        let (hash, length) = match copy_hashing(&mut source, &mut std::io::sink()) {
            Ok(measured) => measured,
            Err(err) => {
                results.push(failure(&err.to_string()));
                continue;
            }
        };

        if let Some((_, relative)) = existing
            .iter()
            .find(|(existing_hash, _)| *existing_hash == hash)
        {
            results.push(import_duplicate(
                picked_name,
                relative.clone(),
                Some(hash),
                Some(length),
            ));
            continue;
        }

        let (stem, extension) = split_name(&base_name);
        let mut candidate = base_name.clone();
        let mut suffix = 2;
        while name_taken(&target, taken.as_ref(), &candidate) {
            candidate = format!("{stem} ({suffix}){extension}");
            suffix += 1;
            if suffix > 999 {
                break;
            }
        }
        if name_taken(&target, taken.as_ref(), &candidate) {
            results.push(failure("file-name-conflict-limit"));
            continue;
        }
        let renamed = candidate != base_name;
        let relative = format!("{folder}/{candidate}");
        let copied = source
            .seek(SeekFrom::Start(0))
            .map_err(|err| err.to_string())
            .and_then(|_| copy_source_into(&root_path, &relative, &mut source));
        let (hash, length) = match copied {
            Ok(written) => written,
            Err(err) => {
                results.push(failure(&err));
                continue;
            }
        };
        existing.push((hash.clone(), relative.clone()));
        if let Some(taken) = taken.as_mut() {
            taken.insert(candidate.to_lowercase());
        }
        landed.insert(canonical, relative.clone());
        results.push(SourceImportResult {
            picked_name,
            status: if renamed { "renamed" } else { "added" }.into(),
            relative_path: Some(relative),
            sha256: Some(hash),
            size: Some(length),
            reason: None,
        });
    }

    Ok(results)
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
    target.join(candidate).exists()
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
        } else if file_type.is_file() && discovery_accepts_file(&name) {
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
            remember_source_path(
                format!("{}/{}", candidate.root_path, candidate.relative_path),
                canonical.join(&candidate.relative_path),
            );
        }
    }
    report
        .candidates
        .sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.name.cmp(&b.name)));
    Ok(report)
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

    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .status()
            .map_err(|err| err.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open exited with status {status}"))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        crate::app_shell::reveal_in_file_manager(&path)
    }
}

#[cfg(test)]
mod tests;
