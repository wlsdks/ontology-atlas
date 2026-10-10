use crate::vault_grants;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub(crate) fn normalize_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    let mut out = PathBuf::new();
    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::Prefix(_) | Component::RootDir | Component::ParentDir => {
                return Err("relative path must stay inside the selected vault".into());
            }
        }
    }
    Ok(out)
}

pub(super) fn resolve_inside(root_path: &str, relative_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path);
    let relative = normalize_relative_path(relative_path)?;
    Ok(root.join(relative))
}

pub(crate) fn canonical_root(root_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root_path).map_err(|err| err.to_string())?;
    let metadata = fs::metadata(&root).map_err(|err| err.to_string())?;
    if !metadata.is_dir() {
        return Err("vault root must be a directory".into());
    }
    // The renderer chooses this argument; with an XSS it would choose the home
    // directory. Only a root the user actually granted (picker, app container,
    // restored prior choice) may be operated on.
    if !vault_grants::is_vault_granted(&root) {
        return Err("vault-root-not-granted".into());
    }
    Ok(root)
}

/// Like `canonical_root`, but also admits the repository a granted vault lives in, for
/// project-source inspection and document discovery.
pub(crate) fn canonical_source_root(root_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root_path).map_err(|err| err.to_string())?;
    let metadata = fs::metadata(&root).map_err(|err| err.to_string())?;
    if !metadata.is_dir() {
        return Err("vault root must be a directory".into());
    }
    if !vault_grants::is_source_granted(&root) {
        return Err("source-root-not-granted".into());
    }
    Ok(root)
}

/// Blocks only named positions: filesystem root, the home directory itself, `/Users`,
/// OS and app directories, and bundles. The vault root becomes the agent's working
/// folder, so session checks reuse this one gate; size heuristics are omitted.
fn is_bundle_directory(root: &Path) -> bool {
    const BUNDLE_EXTENSIONS: &[&str] = &[
        "app",
        "bundle",
        "framework",
        "kext",
        "plugin",
        "prefpane",
        "qlgenerator",
        "saver",
        "wdgt",
        "xpc",
        "appex",
        "component",
        "mdimporter",
    ];
    root.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .is_some_and(|e| BUNDLE_EXTENSIONS.contains(&e.as_str()))
}

pub(crate) fn vault_root_rejection(root: &Path) -> Option<&'static str> {
    // No parent means a filesystem root; callers canonicalize so a symlink cannot route around it.
    if root.parent().is_none() {
        return Some("filesystem-root");
    }

    // A macOS `.app` is a directory; `open` on it launches the program, and its inside
    // is never a documents or agent working folder.
    if is_bundle_directory(root) {
        return Some("bundle-directory");
    }

    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .and_then(|p| fs::canonicalize(p).ok());
    if home.as_deref() == Some(root) {
        return Some("home-directory");
    }

    #[cfg(target_os = "macos")]
    const SYSTEM_DIRS: &[&str] = &[
        "/Applications",
        "/System",
        "/Library",
        "/Users",
        "/Volumes",
        "/private",
        "/usr",
        "/bin",
        "/sbin",
        "/opt",
    ];
    #[cfg(target_os = "linux")]
    const SYSTEM_DIRS: &[&str] = &[
        "/home", "/usr", "/bin", "/sbin", "/etc", "/var", "/opt", "/boot", "/proc", "/sys", "/dev",
    ];
    #[cfg(windows)]
    const SYSTEM_DIRS: &[&str] = &[
        "C:\\Windows",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\Users",
        "C:\\ProgramData",
    ];
    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    const SYSTEM_DIRS: &[&str] = &[];

    for dir in SYSTEM_DIRS {
        // Only that exact directory; places inside it can be valid.
        if root == Path::new(dir) {
            return Some("system-directory");
        }
    }

    None
}

pub(crate) fn ensure_inside_canonical(root_path: &str, path: &Path) -> Result<PathBuf, String> {
    let root = canonical_root(root_path)?;
    let canonical_path = fs::canonicalize(path).map_err(|err| err.to_string())?;
    if !canonical_path.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    Ok(canonical_path)
}

pub(crate) fn resolve_existing_inside(
    root_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    ensure_inside_canonical(root_path, &path)
}

#[cfg(not(unix))]
pub(crate) fn resolve_write_target_inside(
    root_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    if path.exists() {
        return ensure_inside_canonical(root_path, &path);
    }
    let parent = path
        .parent()
        .ok_or_else(|| "write target must have a parent directory".to_string())?;
    let root = canonical_root(root_path)?;
    let mut ancestor = parent;
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "write target must stay inside the selected vault".to_string())?;
    }
    let canonical_ancestor = fs::canonicalize(ancestor).map_err(|err| err.to_string())?;
    if !canonical_ancestor.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    let canonical_parent = ensure_inside_canonical(root_path, parent)?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "write target must include a file name".to_string())?;
    Ok(canonical_parent.join(file_name))
}

pub(crate) fn resolve_directory_target_inside(
    root_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    if path.exists() {
        return ensure_inside_canonical(root_path, &path);
    }
    let root = canonical_root(root_path)?;
    let mut ancestor = path
        .parent()
        .ok_or_else(|| "directory target must have a parent directory".to_string())?;
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "directory target must stay inside the selected vault".to_string())?;
    }
    let canonical_ancestor = fs::canonicalize(ancestor).map_err(|err| err.to_string())?;
    if !canonical_ancestor.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use crate::vault::read::read_vault_text_file;
    #[cfg(unix)]
    use crate::vault::write::{
        ensure_vault_directory, remove_vault_entry, vault_path_exists, write_vault_text_file,
    };
    #[cfg(unix)]
    use std::time::UNIX_EPOCH;

    #[test]
    fn normalize_relative_path_accepts_nested_vault_paths() {
        assert_eq!(
            normalize_relative_path("docs/ontology/project.md").unwrap(),
            PathBuf::from("docs/ontology/project.md")
        );
        assert_eq!(
            normalize_relative_path("./docs//ontology").unwrap(),
            PathBuf::from("docs/ontology")
        );
    }

    #[test]
    fn normalize_relative_path_rejects_escape_paths() {
        for path in [
            "../outside.md",
            "docs/../../outside.md",
            "/tmp/outside.md",
            "docs/../outside.md",
        ] {
            let error = normalize_relative_path(path).unwrap_err();
            assert_eq!(error, "relative path must stay inside the selected vault");
        }
    }

    #[test]
    fn resolve_inside_keeps_paths_under_the_selected_root() {
        assert_eq!(
            resolve_inside("/Users/me/vault", "docs/project.md").unwrap(),
            PathBuf::from("/Users/me/vault/docs/project.md")
        );
    }

    /// `/` and app bundles must never become a vault root, which is the agent's working
    /// folder; `open` on a `.app` launches it.
    #[test]
    fn vault_root_rejection_blocks_macos_bundles() {
        for path in [
            "/Applications/Calculator.app",
            "/Users/someone/Downloads/Thing.app",
            "/tmp/Some.bundle",
            "/tmp/Some.framework",
        ] {
            assert_eq!(
                vault_root_rejection(Path::new(path)),
                Some("bundle-directory"),
                "{path} passing would run a program instead of opening a folder"
            );
        }
    }

    #[test]
    fn vault_root_rejection_allows_ordinary_folders_with_dots() {
        // A validator that always rejects is no validator.
        for path in ["/tmp/my.notes", "/tmp/v1.2.3", "/tmp/plain"] {
            assert_eq!(vault_root_rejection(Path::new(path)), None, "{path}");
        }
    }

    #[test]
    fn vault_root_rejection_blocks_the_filesystem_root() {
        assert_eq!(
            vault_root_rejection(Path::new("/")),
            Some("filesystem-root")
        );
    }

    #[test]
    fn vault_root_rejection_blocks_named_system_directories() {
        // An empty list would make the gate pass idle.
        let blocked: Vec<&str> = if cfg!(target_os = "macos") {
            vec!["/Applications", "/System", "/Library", "/Users", "/Volumes"]
        } else if cfg!(target_os = "linux") {
            vec!["/home", "/usr", "/etc", "/var"]
        } else if cfg!(windows) {
            vec!["C:\\Windows", "C:\\Program Files", "C:\\Users"]
        } else {
            vec![]
        };
        assert!(
            !blocked.is_empty(),
            "no blocked roots are registered for this platform"
        );
        for dir in blocked {
            assert_eq!(
                vault_root_rejection(Path::new(dir)),
                Some("system-directory"),
                "{dir} must not be accepted as a vault root"
            );
        }
    }

    #[test]
    fn vault_root_rejection_blocks_the_home_directory_itself() {
        let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
        let Some(home) = std::env::var_os(key).map(PathBuf::from) else {
            return; // no home directory in some CI
        };
        let Ok(home) = fs::canonicalize(home) else {
            return;
        };
        assert_eq!(
            vault_root_rejection(&home),
            Some("home-directory"),
            "the home directory itself is not a vault"
        );
    }

    #[test]
    fn vault_root_rejection_allows_ordinary_folders_inside_home() {
        // The inside of home must pass.
        let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
        let Some(home) = std::env::var_os(key).map(PathBuf::from) else {
            return;
        };
        assert_eq!(vault_root_rejection(&home.join("notes")), None);
        assert_eq!(vault_root_rejection(&home.join("code/atlas/docs")), None);
        if cfg!(target_os = "macos") {
            assert_eq!(vault_root_rejection(Path::new("/Volumes/Work/vault")), None);
        }
    }

    #[cfg(unix)]
    #[test]
    fn vault_commands_reject_symlink_escapes() {
        use std::os::unix::fs::symlink;

        let nonce = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ontology-atlas-vault-root-{nonce}"));
        let outside = std::env::temp_dir().join(format!("ontology-atlas-vault-outside-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("outside.md"), "outside").unwrap();
        symlink(outside.join("outside.md"), root.join("linked.md")).unwrap();
        symlink(&outside, root.join("linked-dir")).unwrap();

        let root_path = root.to_string_lossy().to_string();
        let read_error = read_vault_text_file(root_path.clone(), "linked.md".into()).unwrap_err();
        assert_eq!(
            read_error,
            "resolved path must stay inside the selected vault"
        );

        let write_error =
            write_vault_text_file(root_path.clone(), "linked.md".into(), "changed".into())
                .unwrap_err();
        assert_eq!(
            write_error,
            "resolved path must stay inside the selected vault"
        );
        assert_eq!(
            fs::read_to_string(outside.join("outside.md")).unwrap(),
            "outside"
        );

        let exists_error =
            vault_path_exists(root_path.clone(), "linked.md".into(), "file".into()).unwrap_err();
        assert_eq!(
            exists_error,
            "resolved path must stay inside the selected vault"
        );

        let mkdir_error =
            ensure_vault_directory(root_path.clone(), "linked-dir/new".into()).unwrap_err();
        assert_eq!(
            mkdir_error,
            "resolved path must stay inside the selected vault"
        );
        assert!(!outside.join("new").exists());

        let nested_write_error = write_vault_text_file(
            root_path.clone(),
            "linked-dir/new/created-outside.md".into(),
            "outside".into(),
        )
        .unwrap_err();
        assert_eq!(
            nested_write_error,
            "resolved path must stay inside the selected vault"
        );
        assert!(!outside.join("new").exists());

        let remove_error =
            remove_vault_entry(root_path, "linked.md".into(), Some(false)).unwrap_err();
        assert_eq!(
            remove_error,
            "resolved path must stay inside the selected vault"
        );

        fs::remove_dir_all(root).ok();
        fs::remove_dir_all(outside).ok();
    }
}
