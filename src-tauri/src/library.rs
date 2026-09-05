//! The library half of a vault — raw sources under `sources/`, and the documents a
//! person may choose to bring in.
//!
//! `docs/DECISIONS.md`, 2026-09-05: *a vault holds three kinds of file and only one is
//! the graph.* A raw source lives verbatim under `sources/` in whatever format it
//! arrived in; a wiki page is Markdown with no `kind:`; an ontology node is Markdown
//! with `kind:` and is the only graph truth. Nothing in this module parses, converts or
//! interprets a source. It copies bytes, measures them, and hashes them.
//!
//! Three boundaries this module is responsible for, and the reason each exists:
//!
//! 1. **Discovery proposes; it never copies.** `discover_source_candidates` returns
//!    metadata only — name, extension, size, mtime — for a bounded set of roots the
//!    person already granted (the open folder, and project roots they bound
//!    themselves). No file is opened. A candidate list is a proposal a person approves,
//!    which is the shape decision 2026-08-21 (92) requires of every change proposal.
//! 2. **The walk never leaves the granted roots**, and inside them it refuses
//!    dotfiles, dependency and build directories, and anything whose name reads as a
//!    credential. `.claude/rules/local-first.md` forbids scanning password, credential
//!    or key files; an allow-list of document extensions is the primary lock and the
//!    name deny-list is the second. Mirrored in
//!    `src/entities/docs-vault/lib/source-discovery.ts` and held there by
//!    `tests/contract/source-discovery-rules.contract.test.ts`.
//! 3. **Hashing happens here, not in the WebView.** `read_vault_binary_file` returns a
//!    JSON array of bytes; hashing a 20 MB PDF that way would move 20 million numbers
//!    across IPC to produce 64 characters. Same reasoning as `vault_fingerprint`.

use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::{canonical_root, resolve_existing_inside};

/// Same value as TS `VAULT_SOURCES_DIR` and the `VAULT_SOURCES_DIR` constant the vault
/// walk uses.
const SOURCES_DIR: &str = "sources";

/// Document formats a person is offered when Atlas proposes candidates.
///
/// **Must equal** TS `DISCOVERY_DOCUMENT_EXTENSIONS`. Deliberately an allow-list: a
/// deny-list decides what to hide and is wrong the first time it meets a name nobody
/// thought of, while an allow-list decides what to show and is merely incomplete. `md`
/// is absent on purpose — Markdown is already a vault file kind, and copying a project's
/// Markdown into `sources/` would put the same text in two places with no way to say
/// which one is the source.
const DISCOVERY_DOCUMENT_EXTENSIONS: &[&str] = &[
    "pdf", "docx", "doc", "xlsx", "xls", "csv", "pptx", "ppt", "txt", "rtf", "odt", "ods", "odp",
    "epub",
];

/// Directory names the discovery walk never descends into.
///
/// **Must equal** TS `DISCOVERY_PRUNE_DIR_NAMES`. Dot-prefixed directories are skipped
/// by a separate rule, so `.git` and `.next` need no entry here.
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

/// Lowercased fragments that disqualify a file name whatever its extension.
///
/// **Must equal** TS `DISCOVERY_DENIED_NAME_FRAGMENTS`. The extension allow-list already
/// refuses `.env`, `id_rsa` and `.pem`, so this list exists for the case the allow-list
/// cannot see: `credentials.csv` is a spreadsheet by extension and a secret by content.
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

/// How deep the discovery walk descends inside one granted root.
const DISCOVERY_MAX_DEPTH: usize = 8;
/// How many candidates one call returns before it stops and says so.
const DISCOVERY_MAX_CANDIDATES: usize = 500;

fn lower_extension(name: &str) -> String {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => ext.to_ascii_lowercase(),
        _ => String::new(),
    }
}

/// The one judgement both surfaces make about a file name. Kept as a free function so
/// the Rust unit test below and the TS mirror test measure the same rule.
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

fn hash_path(path: &Path) -> Result<String, String> {
    use std::io::Read;

    let mut file = fs::File::open(path).map_err(|err| err.to_string())?;
    let mut hasher = Sha256::new();
    // 64 KiB at a time: a source may be a 200 MB scan, and reading it whole to hash it
    // would trade the IPC cost this command removes for a resident-memory one.
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|err| err.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFileHash {
    pub relative_path: String,
    /// `None` when the file could not be read. A missing hash is reported as missing;
    /// an unreadable source must not be allowed to read as "compiled".
    pub sha256: Option<String>,
}

/// sha256 of vault files, computed on the native side.
///
/// The screen calls this only for sources a wiki page already cites: a file nobody has
/// compiled needs no hash to be known as not compiled, and hashing every source on every
/// load would spend a person's disk on a question nobody asked.
#[tauri::command]
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

/// Deliberately **not** `async`, for the same reason as `pick_vault_directory`:
/// `rfd::FileDialog` opens an `NSOpenPanel`, which macOS requires on the main thread and
/// which runs its own modal event loop.
#[tauri::command]
pub fn pick_source_files(dialog_title: Option<String>) -> Result<Vec<String>, String> {
    let title = dialog_title.as_deref().unwrap_or("Add documents");
    let Some(picked) = rfd::FileDialog::new().set_title(title).pick_files() else {
        return Ok(Vec::new());
    };
    Ok(picked
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceImportResult {
    /// The name the person chose, as it appeared on their disk.
    pub picked_name: String,
    /// `added` · `duplicate` · `renamed` · `failed`.
    pub status: String,
    /// Vault-relative path of the file that now holds these bytes. For `duplicate` this
    /// is the file that already held them, which is what makes the refusal explainable.
    pub relative_path: Option<String>,
    pub sha256: Option<String>,
    pub size: Option<u64>,
    pub reason: Option<String>,
}

/// A file name that cannot escape `sources/` or collide with a shell.
fn safe_source_file_name(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return None;
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return None;
    }
    // A leading dot would make the imported file invisible to the vault walk, so the
    // person would see the import succeed and the row never appear.
    Some(trimmed.trim_start_matches('.').to_string()).filter(|value| !value.is_empty())
}

fn split_name(name: &str) -> (String, String) {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
        _ => (name.to_string(), String::new()),
    }
}

/// Existing `sources/` files indexed by content hash, so a second copy of the same bytes
/// under another name is still recognised as the same document.
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
fn write_source_bytes(root_path: &str, relative_path: &str, bytes: &[u8]) -> Result<(), String> {
    let root = canonical_root(root_path)?;
    let root_handle = crate::agent_setup::open_absolute_directory_no_follow(&root)?;
    let (parent, file_name) = crate::agent_setup::open_entry_parent(&root_handle, relative_path)?;
    crate::agent_setup::write_entry_bytes_atomically(&parent, &file_name, bytes, 0o666)
}

#[cfg(not(unix))]
fn write_source_bytes(root_path: &str, relative_path: &str, bytes: &[u8]) -> Result<(), String> {
    let root = canonical_root(root_path)?;
    let relative = crate::normalize_relative_path(relative_path)?;
    let target = root.join(&relative);
    let parent = target
        .parent()
        .ok_or_else(|| "import target must have a parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    fs::write(&target, bytes).map_err(|err| err.to_string())
}

/// Copy chosen files into `<vault>/sources/`, refusing a second copy of bytes already
/// there and never overwriting a file that exists under the same name.
///
/// The copy **is** the artifact. Nothing is written beside it — no sidecar index, no
/// `sources.jsonl` — because a second store of what the folder already says is a second
/// canonical store, which `.claude/rules/forbidden.md` refuses. Where a source came from
/// is recorded later, in the wiki page's frontmatter, where Git can show it.
#[tauri::command]
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

        let Some(base_name) = safe_source_file_name(&picked_name) else {
            results.push(failure("unusable-file-name"));
            continue;
        };
        let bytes = match fs::read(&picked) {
            Ok(bytes) => bytes,
            Err(err) => {
                results.push(failure(&err.to_string()));
                continue;
            }
        };
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let hash = format!("{:x}", hasher.finalize());

        if let Some((_, relative)) = existing.iter().find(|(existing_hash, _)| *existing_hash == hash)
        {
            results.push(SourceImportResult {
                picked_name,
                status: "duplicate".into(),
                relative_path: Some(relative.clone()),
                sha256: Some(hash),
                size: Some(bytes.len() as u64),
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
        if let Err(err) = write_source_bytes(&root_path, &relative, &bytes) {
            results.push(failure(&err));
            continue;
        }
        existing.push((hash.clone(), relative.clone()));
        results.push(SourceImportResult {
            picked_name,
            status: if renamed { "renamed" } else { "added" }.into(),
            relative_path: Some(relative),
            sha256: Some(hash),
            size: Some(bytes.len() as u64),
            reason: None,
        });
    }

    Ok(results)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiscoveryRoot {
    pub root_path: String,
    /// How the screen names this root to the person. Carried through untouched so the
    /// candidate list can say which folder proposed a file.
    pub label: String,
    /// Vault-relative prefixes the walk skips. The open folder passes `sources` so files
    /// already imported are not proposed a second time.
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
    /// Whether the walk stopped at `DISCOVERY_MAX_CANDIDATES`. Silent truncation reads
    /// as "this is everything", so the screen is told.
    pub truncated: bool,
    /// Roots that could not be read at all, by label. A root that vanished is a fact the
    /// person needs, not an empty list.
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
        // Symlinks are not followed: a link inside a granted root can point anywhere on
        // the disk, and "we only walk what you granted" has to survive one.
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

/// Propose documents from the roots a person already granted. **Metadata only** — no
/// file is opened, and nothing is copied until they say which ones.
#[tauri::command]
pub fn discover_source_candidates(
    roots: Vec<SourceDiscoveryRoot>,
) -> Result<SourceDiscoveryReport, String> {
    let mut report = SourceDiscoveryReport {
        candidates: Vec::new(),
        truncated: false,
        unreadable_roots: Vec::new(),
    };
    for root in &roots {
        let Ok(canonical) = fs::canonicalize(&root.root_path) else {
            report.unreadable_roots.push(root.label.clone());
            continue;
        };
        if !canonical.is_dir() {
            report.unreadable_roots.push(root.label.clone());
            continue;
        }
        walk_candidates(&canonical, root, "", 0, &mut report);
    }
    report
        .candidates
        .sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.name.cmp(&b.name)));
    Ok(report)
}

/// Show one vault file in Finder. Reveal, not open: the app never launches a program on
/// a person's behalf, and `-R` selects the file in its folder instead.
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
        let _ = path;
        Err("Finder reveal is only available on macOS".into())
    }
}

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

    #[test]
    fn source_names_cannot_escape_the_sources_folder() {
        assert_eq!(safe_source_file_name("a.pdf").as_deref(), Some("a.pdf"));
        assert_eq!(safe_source_file_name("../a.pdf"), None);
        assert_eq!(safe_source_file_name("dir/a.pdf"), None);
        assert_eq!(safe_source_file_name("..").as_deref(), None);
        assert_eq!(safe_source_file_name(".hidden.pdf").as_deref(), Some("hidden.pdf"));
    }
}
