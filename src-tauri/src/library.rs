//! Raw sources are copied, measured and hashed, never parsed (`docs/DECISIONS.md`).
//! Discovery returns metadata for granted roots only, so no credential is scanned
//! (`.claude/rules/local-first.md`); mirrored in `source-discovery.ts`, or they drift.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use sha2::{Digest, Sha256};

use crate::{canonical_root, canonical_source_root, resolve_existing_inside};

fn vended_source_paths() -> &'static Mutex<HashSet<PathBuf>> {
    static VENDED: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    VENDED.get_or_init(|| Mutex::new(HashSet::new()))
}

fn remember_source_paths<I: IntoIterator<Item = PathBuf>>(paths: I) {
    let mut vended = vended_source_paths()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    for path in paths {
        if let Ok(canonical) = fs::canonicalize(&path) {
            vended.insert(canonical);
        }
    }
}

fn take_source_path(path: &Path) -> bool {
    let Ok(canonical) = fs::canonicalize(path) else {
        return false;
    };
    vended_source_paths()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .remove(&canonical)
}

/// Same value as TS `VAULT_SOURCES_DIR`.
const SOURCES_DIR: &str = "sources";

/// Must equal TS `DISCOVERY_DOCUMENT_EXTENSIONS`. An allow-list, because a
/// deny-list fails on the first unforeseen name; `md` is absent so vault Markdown
/// is never copied into two places.
const DISCOVERY_DOCUMENT_EXTENSIONS: &[&str] = &[
    "pdf", "docx", "doc", "xlsx", "xls", "csv", "pptx", "ppt", "txt", "rtf", "odt", "ods", "odp",
    "epub",
];

/// Must equal TS `DISCOVERY_PRUNE_DIR_NAMES`; dot directories are skipped separately.
const DISCOVERY_PRUNE_DIR_NAMES: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    "vendor",
    "Pods",
    "DerivedData",
    "__pycache__",
    "venv",
];

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
    DISCOVERY_DOCUMENT_EXTENSIONS.contains(&lower_extension(&lowered).as_str())
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
        hasher.update(&buffer[..read]);
        output.write_all(&buffer[..read])?;
        length += read as u64;
    }
    Ok((format!("{:x}", hasher.finalize()), length))
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
    remember_source_paths(picked.iter().cloned());
    Ok(picked
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect())
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
fn index_existing_sources(root: &Path) -> Result<Vec<(String, String)>, String> {
    let sources = root.join(SOURCES_DIR);
    if !sources.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let mut stack = vec![(sources, String::from(SOURCES_DIR))];
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
) -> Result<Vec<SourceImportResult>, String> {
    let root = canonical_root(&root_path)?;
    fs::create_dir_all(root.join(SOURCES_DIR)).map_err(|err| err.to_string())?;
    let mut existing = index_existing_sources(&root)?;
    let mut results = Vec::with_capacity(source_paths.len());

    for source_path in source_paths {
        let picked = PathBuf::from(&source_path);
        let picked_name = picked
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| source_path.clone());
        let failure = |reason: &str| SourceImportResult {
            picked_name: picked_name.clone(),
            status: "failed".into(),
            relative_path: None,
            sha256: None,
            size: None,
            reason: Some(reason.to_string()),
        };

        if !take_source_path(&picked) {
            results.push(failure("source-not-user-selected"));
            continue;
        }

        let Some(base_name) = safe_source_file_name(&picked_name) else {
            results.push(failure("unusable-file-name"));
            continue;
        };
        let (hash, length) = match hash_and_length(&picked) {
            Ok(measured) => measured,
            Err(err) => {
                results.push(failure(&err));
                continue;
            }
        };

        if let Some((_, relative)) = existing
            .iter()
            .find(|(existing_hash, _)| *existing_hash == hash)
        {
            results.push(SourceImportResult {
                picked_name,
                status: "duplicate".into(),
                relative_path: Some(relative.clone()),
                sha256: Some(hash),
                size: Some(length),
                reason: None,
            });
            continue;
        }

        let (stem, extension) = split_name(&base_name);
        let mut candidate = base_name.clone();
        let mut suffix = 2;
        while root.join(SOURCES_DIR).join(&candidate).exists() {
            candidate = format!("{stem} ({suffix}){extension}");
            suffix += 1;
            if suffix > 999 {
                break;
            }
        }
        let renamed = candidate != base_name;
        let relative = format!("{SOURCES_DIR}/{candidate}");
        let copied = fs::File::open(&picked)
            .map_err(|err| err.to_string())
            .and_then(|mut source| copy_source_into(&root_path, &relative, &mut source));
        let (hash, length) = match copied {
            Ok(written) => written,
            Err(err) => {
                results.push(failure(&err));
                continue;
            }
        };
        existing.push((hash.clone(), relative.clone()));
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
            if DISCOVERY_PRUNE_DIR_NAMES.contains(&name.as_str()) {
                continue;
            }
            walk_candidates(&entry.path(), root, &relative, depth + 1, report);
        } else if file_type.is_file() && discovery_accepts_file(&name) {
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
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
        walk_candidates(&canonical, root, "", 0, &mut report);
    }
    remember_source_paths(
        report
            .candidates
            .iter()
            .map(|candidate| PathBuf::from(&candidate.root_path).join(&candidate.relative_path)),
    );
    report
        .candidates
        .sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.name.cmp(&b.name)));
    Ok(report)
}

/// Reveal, not open: the app never launches a program on the person's behalf.
#[tauri::command]
pub fn reveal_vault_file(root_path: String, relative_path: String) -> Result<(), String> {
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
        // A code, not a sentence, so the translation stays on the screen; nothing is
        // launched on Windows or Linux.
        let _ = path;
        Err(REVEAL_UNSUPPORTED.into())
    }
}

/// Scoped to the arm that returns it, or it is dead code on macOS.
#[cfg(not(target_os = "macos"))]
pub(crate) const REVEAL_UNSUPPORTED: &str = "reveal-unsupported-on-this-platform";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_refuses_the_files_local_first_forbids_reading() {
        for name in [
            ".env",
            ".env.local",
            "id_rsa",
            "credentials.json",
            "credentials.csv",
            "server.pem",
            "api_key.txt",
            "secrets.xlsx",
            ".hidden.pdf",
        ] {
            assert!(
                !discovery_accepts_file(name),
                "{name} must never be proposed as a candidate"
            );
        }
    }

    #[test]
    fn discovery_accepts_ordinary_project_documents() {
        for name in [
            "Requirements.pdf",
            "quarter plan.docx",
            "numbers.xlsx",
            "notes.txt",
            "deck.pptx",
        ] {
            assert!(discovery_accepts_file(name), "{name} should be a candidate");
        }
    }

    #[test]
    fn discovery_refuses_code_and_markdown() {
        for name in ["index.ts", "README.md", "Cargo.toml", "data.json"] {
            assert!(!discovery_accepts_file(name), "{name} is not a document");
        }
    }

    // Asserts what this build compiled: either writer must land bytes inside the
    // sources folder and nowhere else.
    #[test]
    fn the_platform_writer_lands_inside_sources_and_nowhere_else() {
        let root = std::env::temp_dir().join(format!("atlas-lib-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(SOURCES_DIR)).unwrap();
        let root_path = fs::canonicalize(&root)
            .unwrap()
            .to_string_lossy()
            .to_string();

        let (hash, length) =
            copy_source_into(&root_path, "sources/plan.pdf", &mut &b"%PDF-1.7\n"[..]).unwrap();
        assert_eq!(
            fs::read(root.join("sources/plan.pdf")).unwrap(),
            b"%PDF-1.7\n".to_vec()
        );
        assert_eq!(length, 9);
        assert_eq!(hash, hash_path(&root.join("sources/plan.pdf")).unwrap());

        assert!(copy_source_into(&root_path, "../escaped.pdf", &mut &b"x"[..]).is_err());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn an_import_streams_the_copy_and_refuses_the_same_bytes_twice() {
        let root = std::env::temp_dir().join(format!("atlas-import-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let root_path = fs::canonicalize(&root)
            .unwrap()
            .to_string_lossy()
            .to_string();
        let picked = root.join("scan.pdf");
        let body: Vec<u8> = (0..300_000_u32).map(|i| (i % 251) as u8).collect();
        fs::write(&picked, &body).unwrap();
        let picked_path = picked.clone();
        let picked = picked.to_string_lossy().to_string();

        remember_source_paths([picked_path.clone()]);
        let first = import_source_files(root_path.clone(), vec![picked.clone()]).unwrap();
        assert_eq!(first[0].status, "added");
        assert_eq!(first[0].size, Some(body.len() as u64));
        assert_eq!(fs::read(root.join("sources/scan.pdf")).unwrap(), body);
        assert_eq!(
            first[0].sha256,
            hash_path(&root.join("sources/scan.pdf")).ok()
        );

        remember_source_paths([picked_path]);
        let second = import_source_files(root_path, vec![picked]).unwrap();
        assert_eq!(second[0].status, "duplicate");
        assert_eq!(second[0].relative_path.as_deref(), Some("sources/scan.pdf"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn import_refuses_a_source_the_user_never_selected() {
        let root = std::env::temp_dir().join(format!("atlas-vended-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let root_path = fs::canonicalize(&root)
            .unwrap()
            .to_string_lossy()
            .to_string();

        let chosen = root.join("chosen.pdf");
        fs::write(&chosen, b"%PDF-1.7 chosen\n").unwrap();
        let secret = root.join("stolen.pdf");
        fs::write(&secret, b"%PDF-1.7 secret\n").unwrap();

        remember_source_paths([chosen.clone()]);
        let results = import_source_files(
            root_path.clone(),
            vec![
                chosen.to_string_lossy().to_string(),
                secret.to_string_lossy().to_string(),
            ],
        )
        .unwrap();
        let outcome = |name: &str| {
            results
                .iter()
                .find(|result| result.picked_name == name)
                .unwrap()
        };
        assert_eq!(outcome("chosen.pdf").status, "added");
        assert_eq!(outcome("stolen.pdf").status, "failed");
        assert_eq!(
            outcome("stolen.pdf").reason.as_deref(),
            Some("source-not-user-selected")
        );
        assert!(!root.join("sources/stolen.pdf").exists());

        let replay =
            import_source_files(root_path, vec![chosen.to_string_lossy().to_string()]).unwrap();
        assert_eq!(replay[0].status, "failed");
        assert_eq!(
            replay[0].reason.as_deref(),
            Some("source-not-user-selected")
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn source_names_cannot_escape_the_sources_folder() {
        assert_eq!(safe_source_file_name("a.pdf").as_deref(), Some("a.pdf"));
        assert_eq!(safe_source_file_name("../a.pdf"), None);
        assert_eq!(safe_source_file_name("dir/a.pdf"), None);
        assert_eq!(safe_source_file_name("..").as_deref(), None);
        assert_eq!(
            safe_source_file_name(".hidden.pdf").as_deref(),
            Some("hidden.pdf")
        );
    }
}
