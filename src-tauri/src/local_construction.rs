use serde::Serialize;
use std::path::{Path, PathBuf};

const FILE_BYTES: u64 = 256 * 1024;
const RANGE_BYTES: usize = 8 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SourceFile {
    pub path: String,
    pub bytes: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SourcePreview {
    pub source_path: String,
    pub destination_path: String,
    pub fingerprint: String,
    pub files: Vec<SourceFile>,
    pub limited: bool,
    pub excluded: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SourceRange {
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub text: String,
    pub full_file_sha256: String,
    pub bytes: usize,
    pub next_line: Option<usize>,
    pub total_lines: usize,
    pub file_complete: bool,
}
fn eligible(path: &Path) -> bool {
    crate::gray_area_scope::safe_source_path(path)
        && (matches!(
            path.extension().and_then(|x| x.to_str()),
            Some("ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "mts" | "cts" | "py" | "rs" | "go")
        ) || matches!(
            path.file_name().and_then(|x| x.to_str()),
            Some("package.json" | "tsconfig.json" | "Cargo.toml" | "go.mod" | "README.md")
        ))
}
pub(crate) fn preview(root: &Path, destination: &Path) -> Result<SourcePreview, String> {
    let observed = crate::gray_area_scope::observe_construction_source(root, destination)?;
    let mut excluded = observed.excluded;
    let mut files = Vec::new();
    for entry in observed.entries {
        if entry.kind == "directory" {
            continue;
        }
        if entry.kind == "file" && entry.size <= FILE_BYTES && eligible(Path::new(&entry.path)) {
            files.push(SourceFile {
                path: entry.path,
                bytes: entry.size,
            });
        } else {
            excluded.push(entry.path);
        }
    }
    excluded.sort();
    excluded.dedup();
    Ok(SourcePreview {
        source_path: root.to_string_lossy().into_owned(),
        destination_path: destination.to_string_lossy().into_owned(),
        fingerprint: observed.fingerprint,
        files,
        limited: observed.limited,
        excluded,
    })
}
fn read_snapshot(root: &Path, relative: &Path) -> Result<String, String> {
    #[cfg(unix)]
    {
        use std::io::Read;
        use std::os::unix::fs::MetadataExt;
        use std::os::unix::io::{AsRawFd, FromRawFd};
        let handle = crate::agent_setup::open_absolute_directory_no_follow(root)?;
        let parent = crate::agent_setup::open_relative_directory(
            &handle,
            relative.parent().unwrap_or(Path::new("")),
        )?
        .ok_or("construction_source_unreadable")?;
        let name = std::ffi::CString::new(
            relative
                .file_name()
                .ok_or("unsafe_path")?
                .as_encoded_bytes(),
        )
        .map_err(|_| "unsafe_path")?;
        let fd = unsafe {
            libc::openat(
                parent.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC,
            )
        };
        if fd < 0 {
            return Err("construction_source_changed".into());
        }
        let mut file = unsafe { std::fs::File::from_raw_fd(fd) };
        let before = file
            .metadata()
            .map_err(|_| "construction_source_unreadable")?;
        if !before.is_file() || before.len() > FILE_BYTES {
            return Err("construction_source_unsupported".into());
        }
        let mut bytes = Vec::new();
        (&mut file)
            .take(FILE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "construction_source_unreadable")?;
        let after = file
            .metadata()
            .map_err(|_| "construction_source_unreadable")?;
        let identity = |m: &std::fs::Metadata| {
            (
                m.dev(),
                m.ino(),
                m.len(),
                m.mtime(),
                m.mtime_nsec(),
                m.ctime(),
                m.ctime_nsec(),
            )
        };
        if bytes.len() > FILE_BYTES as usize || identity(&before) != identity(&after) {
            return Err("construction_source_changed".into());
        }
        String::from_utf8(bytes).map_err(|_| "construction_source_unsupported".into())
    }
    #[cfg(not(unix))]
    {
        let _ = (root, relative);
        Err("unsupported_platform".into())
    }
}
pub(crate) fn read_range(
    root: &Path,
    destination: &Path,
    fingerprint: &str,
    path: &str,
    start_line: usize,
) -> Result<SourceRange, String> {
    if start_line == 0 {
        return Err("construction_range_invalid".into());
    }
    let before = preview(root, destination)?;
    if before.fingerprint != fingerprint {
        return Err("construction_source_changed".into());
    }
    if !before.files.iter().any(|file| file.path == path) {
        return Err("construction_source_not_listed".into());
    }
    let text = read_snapshot(root, Path::new(path))?;
    if text.len() > FILE_BYTES as usize || text.contains('\0') {
        return Err("construction_source_unsupported".into());
    }
    let lines: Vec<_> = text.split_inclusive('\n').collect();
    if start_line > lines.len() {
        return Err("construction_range_invalid".into());
    }
    let mut captured = String::new();
    let mut end_line = start_line - 1;
    for (index, line) in lines.iter().enumerate().skip(start_line - 1) {
        if captured.len() + line.len() > RANGE_BYTES {
            break;
        }
        captured.push_str(line);
        end_line = index + 1;
    }
    if captured.is_empty() {
        return Err("construction_line_too_large".into());
    }
    if preview(root, destination)?.fingerprint != fingerprint {
        return Err("construction_source_changed".into());
    }
    Ok(SourceRange {
        path: path.into(),
        start_line,
        end_line,
        bytes: captured.len(),
        text: captured,
        full_file_sha256: crate::gray_area_scope::digest(text.as_bytes()),
        next_line: (end_line < lines.len()).then_some(end_line + 1),
        total_lines: lines.len(),
        file_complete: start_line == 1 && end_line == lines.len(),
    })
}
fn roots(source_path: &str, destination_path: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = crate::canonical_source_root(source_path)?;
    if !crate::vault_grants::is_selected_source(&root) {
        return Err("construction_source_selection_required".into());
    }
    Ok((root, crate::canonical_root(destination_path)?))
}
#[tauri::command(async)]
pub(crate) fn preview_local_construction_source(
    source_path: String,
    destination_path: String,
) -> Result<SourcePreview, String> {
    let (root, destination) = roots(&source_path, &destination_path)?;
    preview(&root, &destination)
}
#[tauri::command(async)]
pub(crate) fn read_local_construction_source(
    source_path: String,
    destination_path: String,
    fingerprint: String,
    path: String,
    start_line: usize,
) -> Result<SourceRange, String> {
    let (root, destination) = roots(&source_path, &destination_path)?;
    read_range(&root, &destination, &fingerprint, &path, start_line)
}
#[cfg(test)]
mod tests {
    use super::*;
    static FOLDER_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    fn folder() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "atlas-code-source-{}-{}-{}",
            std::process::id(),
            FOLDER_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::canonicalize(root).unwrap()
    }
    #[test]
    fn a_vault_grant_does_not_replace_an_exact_source_picker_selection() {
        let root = folder();
        let source = root.join("code");
        let vault = root.join("vault");
        std::fs::create_dir(&source).unwrap();
        std::fs::create_dir(&vault).unwrap();
        let _scope = crate::vault_grants::EnforcedScope::granting(std::slice::from_ref(&root));
        assert!(roots(&source.to_string_lossy(), &vault.to_string_lossy()).is_err());
        crate::vault_grants::grant_source_root(&source);
        assert!(roots(&source.to_string_lossy(), &vault.to_string_lossy()).is_ok());
        assert!(roots(&root.to_string_lossy(), &vault.to_string_lossy()).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_listed_range_keeps_unicode_bytes_and_exact_snapshot_hash() {
        let root = folder();
        let vault = root.join("vault");
        std::fs::create_dir(&vault).unwrap();
        let text = "export const label = '한글';\nexport const value = 2;\n";
        std::fs::write(root.join("input.ts"), text).unwrap();
        std::fs::write(vault.join("private.ts"), "NEVER_READ").unwrap();
        let prepared = preview(&root, &vault).unwrap();
        assert_eq!(prepared.files.len(), 1);
        let range = read_range(&root, &vault, &prepared.fingerprint, "input.ts", 1).unwrap();
        assert_eq!(range.text, text);
        assert_eq!(range.bytes, text.len());
        assert_eq!(
            range.full_file_sha256,
            crate::gray_area_scope::digest(text.as_bytes())
        );
        assert!(read_range(&root, &vault, &prepared.fingerprint, "vault/private.ts", 1).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn source_changes_paths_and_unlisted_files_are_refused() {
        let root = folder();
        let vault = root.join("vault");
        std::fs::create_dir(&vault).unwrap();
        std::fs::write(root.join("input.ts"), "old").unwrap();
        let prepared = preview(&root, &vault).unwrap();
        assert!(read_range(&root, &vault, &prepared.fingerprint, "../outside.ts", 1).is_err());
        assert!(read_range(&root, &vault, &prepared.fingerprint, "missing.ts", 1).is_err());
        std::fs::write(root.join("input.ts"), "new").unwrap();
        assert!(read_range(&root, &vault, &prepared.fingerprint, "input.ts", 1).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn same_length_readme_edits_invalidate_the_preview() {
        let root = folder();
        let vault = root.join("vault");
        std::fs::create_dir(&vault).unwrap();
        std::fs::write(root.join("README.md"), "old").unwrap();
        let before = preview(&root, &vault).unwrap();
        std::fs::write(root.join("README.md"), "new").unwrap();
        assert_ne!(
            preview(&root, &vault).unwrap().fingerprint,
            before.fingerprint
        );
        assert!(read_range(&root, &vault, &before.fingerprint, "README.md", 1).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn excluded_entries_share_the_inventory_budget() {
        let root = folder();
        let vault = root.join("vault");
        std::fs::create_dir(&vault).unwrap();
        for index in 0..600 {
            std::fs::write(root.join(format!(".hidden-{index}")), "private").unwrap();
        }
        std::fs::write(root.join("control.ts"), "control").unwrap();
        let observed = preview(&root, &vault).unwrap();
        assert!(observed.limited);
        assert!(observed.files.len() + observed.excluded.len() <= 500);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn a_range_stops_at_a_real_line_boundary_without_cutting_utf8() {
        let root = folder();
        let vault = root.join("vault");
        std::fs::create_dir(&vault).unwrap();
        let text = "const label = '한글';\n".repeat(1000);
        std::fs::write(root.join("input.ts"), text).unwrap();
        let prepared = preview(&root, &vault).unwrap();
        let first = read_range(&root, &vault, &prepared.fingerprint, "input.ts", 1).unwrap();
        assert!(first.bytes <= RANGE_BYTES);
        assert!(first.next_line.is_some());
        assert!(first.text.ends_with('\n'));
        let next = read_range(
            &root,
            &vault,
            &prepared.fingerprint,
            "input.ts",
            first.next_line.unwrap(),
        )
        .unwrap();
        assert_eq!(next.start_line, first.end_line + 1);
        assert!(!next.file_complete);
        assert_eq!(next.total_lines, 1000);
        std::fs::remove_dir_all(root).unwrap();
    }
}
