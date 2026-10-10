use super::scope::{
    canonical_root, normalize_relative_path, resolve_directory_target_inside, resolve_inside,
};
#[cfg(not(unix))]
use super::scope::{ensure_inside_canonical, resolve_write_target_inside};
#[cfg(unix)]
use crate::agent_setup;
use std::fs;
#[cfg(unix)]
use std::path::Path;
#[cfg(any(not(unix), test))]
use std::time::UNIX_EPOCH;

/// Temporary file, sync, then rename, so a crash leaves old or new content, never a
/// truncated file.
#[cfg(any(not(unix), test))]
pub(super) fn write_text_atomically(path: &std::path::Path, content: &str) -> Result<(), String> {
    use std::io::Write;

    static TEMP_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    let parent = path
        .parent()
        .ok_or_else(|| "atomic write target must have a parent directory".to_string())?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "atomic write target must include a file name".to_string())?
        .to_string_lossy();
    let nonce = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_nanos();
    let mut created = None;
    for _ in 0..64 {
        let sequence = TEMP_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".{file_name}.oatlas-tmp-{}-{nonce:x}-{sequence:x}",
            std::process::id()
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                created = Some((candidate, file));
                break;
            }
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(err.to_string()),
        }
    }
    let (temporary, mut file) = created.ok_or_else(|| {
        "could not create a private temporary file for the atomic write".to_string()
    })?;
    let result = (|| -> std::io::Result<()> {
        file.write_all(content.as_bytes())?;
        // Sync first, or power loss can leave the new name with cached content.
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)
    })();
    if result.is_err() {
        // Only the temporary file; the original was never touched.
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn write_vault_text_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    write_vault_text_file_after_validation(root_path, relative_path, content, || {})
}

fn write_vault_text_file_after_validation(
    root_path: String,
    relative_path: String,
    content: String,
    after_validation: impl FnOnce(),
) -> Result<(), String> {
    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let relative = normalize_relative_path(&relative_path)?;
        let parent_relative = relative.parent().unwrap_or_else(|| Path::new(""));
        let parent_relative = parent_relative.to_string_lossy();
        resolve_directory_target_inside(&root_path, &parent_relative)?;
        let target = root.join(&relative);
        match fs::symlink_metadata(&target) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("resolved path must stay inside the selected vault".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        let root_handle = agent_setup::open_absolute_directory_no_follow(&root)?;
        let (parent, file_name) = agent_setup::open_entry_parent(&root_handle, &relative_path)?;
        after_validation();
        agent_setup::write_entry_atomically(&parent, &file_name, &content, 0o666)
    }

    #[cfg(not(unix))]
    {
        let path = resolve_write_target_inside(&root_path, &relative_path)?;
        after_validation();
        write_text_atomically(&path, &content)
    }
}

#[tauri::command]
pub(crate) fn remove_vault_entry(
    root_path: String,
    relative_path: String,
    recursive: Option<bool>,
) -> Result<(), String> {
    if normalize_relative_path(&relative_path)?
        .as_os_str()
        .is_empty()
    {
        return Err("refusing to remove the selected vault root".into());
    }
    let path = resolve_inside(&root_path, &relative_path)?;
    let root = canonical_root(&root_path)?;
    let parent = path
        .parent()
        .ok_or_else(|| "remove target must have a parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent).map_err(|err| err.to_string())?;
    if !canonical_parent.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }

    let entry_metadata = fs::symlink_metadata(&path).map_err(|err| err.to_string())?;
    if entry_metadata.file_type().is_symlink() {
        let canonical_target = fs::canonicalize(&path).map_err(|err| err.to_string())?;
        if !canonical_target.starts_with(&root) {
            return Err("resolved path must stay inside the selected vault".into());
        }

        #[cfg(windows)]
        {
            if fs::metadata(&path).map_err(|err| err.to_string())?.is_dir() {
                return fs::remove_dir(path).map_err(|err| err.to_string());
            }
        }
        return fs::remove_file(path).map_err(|err| err.to_string());
    }

    let canonical_path = fs::canonicalize(&path).map_err(|err| err.to_string())?;
    if !canonical_path.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    let metadata = fs::metadata(&path).map_err(|err| err.to_string())?;
    if metadata.is_dir() {
        if recursive.unwrap_or(false) {
            fs::remove_dir_all(path).map_err(|err| err.to_string())
        } else {
            fs::remove_dir(path).map_err(|err| err.to_string())
        }
    } else {
        fs::remove_file(path).map_err(|err| err.to_string())
    }
}

#[tauri::command]
pub(crate) fn ensure_vault_directory(
    root_path: String,
    relative_path: String,
) -> Result<(), String> {
    ensure_vault_directory_after_validation(root_path, relative_path, || {})
}

fn ensure_vault_directory_after_validation(
    root_path: String,
    relative_path: String,
    after_validation: impl FnOnce(),
) -> Result<(), String> {
    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let relative = normalize_relative_path(&relative_path)?;
        resolve_directory_target_inside(&root_path, &relative_path)?;
        if relative.as_os_str().is_empty() {
            after_validation();
            return Ok(());
        }
        let directory_name = relative
            .file_name()
            .ok_or_else(|| "directory target must include a final name".to_string())?;
        let parent_path = relative.parent().unwrap_or_else(|| Path::new(""));
        let root_handle = agent_setup::open_absolute_directory_no_follow(&root)?;
        let parent =
            agent_setup::open_or_create_relative_directory(&root_handle, parent_path, 0o777)?;
        after_validation();
        let directory = agent_setup::open_or_create_relative_directory(
            &parent,
            Path::new(directory_name),
            0o777,
        )?;
        directory.sync_all().map_err(|error| error.to_string())?;
        parent.sync_all().map_err(|error| error.to_string())
    }

    #[cfg(not(unix))]
    {
        let path = resolve_directory_target_inside(&root_path, &relative_path)?;
        after_validation();
        fs::create_dir_all(&path).map_err(|err| err.to_string())?;
        ensure_inside_canonical(&root_path, &path)?;
        Ok(())
    }
}

#[tauri::command]
pub(crate) fn vault_path_exists(
    root_path: String,
    relative_path: String,
    kind: String,
) -> Result<bool, String> {
    let path = resolve_inside(&root_path, &relative_path)?;
    let root = canonical_root(&root_path)?;
    let path = match fs::canonicalize(&path) {
        Ok(path) => path,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(err) => return Err(err.to_string()),
    };
    if !path.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(err) => return Err(err.to_string()),
    };
    Ok(match kind.as_str() {
        "file" => metadata.is_file(),
        "directory" => metadata.is_dir(),
        _ => false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remove_vault_entry_rejects_root_removal() {
        let error = remove_vault_entry("/tmp/vault".into(), "".into(), Some(true)).unwrap_err();
        assert_eq!(error, "refusing to remove the selected vault root");
    }

    #[test]
    fn remove_vault_entry_removes_files_and_directories() {
        let root = std::env::temp_dir().join(format!(
            "ontology-atlas-remove-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("docs/nested")).unwrap();
        fs::write(root.join("note.md"), "hello").unwrap();
        fs::write(root.join("docs/nested/file.md"), "nested").unwrap();

        remove_vault_entry(root.to_string_lossy().to_string(), "note.md".into(), None).unwrap();
        assert!(!root.join("note.md").exists());

        let non_recursive_error = remove_vault_entry(
            root.to_string_lossy().to_string(),
            "docs".into(),
            Some(false),
        )
        .unwrap_err();
        assert!(!non_recursive_error.is_empty());
        assert!(root.join("docs").exists());

        remove_vault_entry(
            root.to_string_lossy().to_string(),
            "docs".into(),
            Some(true),
        )
        .unwrap();
        assert!(!root.join("docs").exists());

        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn remove_vault_entry_unlinks_an_internal_symlink_without_deleting_its_target() {
        use std::os::unix::fs::symlink;

        let nonce = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ontology-atlas-remove-link-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        let target = root.join("real.md");
        let alias = root.join("alias.md");
        fs::write(&target, "keep me").unwrap();
        symlink(&target, &alias).unwrap();

        remove_vault_entry(
            root.to_string_lossy().to_string(),
            "alias.md".into(),
            Some(false),
        )
        .unwrap();

        assert!(!alias.exists(), "the link entry remains");
        assert_eq!(fs::read_to_string(&target).unwrap(), "keep me");
        fs::remove_dir_all(root).ok();
    }
}

#[cfg(test)]
mod atomic_write_tests {
    use super::{
        ensure_vault_directory_after_validation, write_text_atomically,
        write_vault_text_file_after_validation,
    };

    #[cfg(unix)]
    #[test]
    fn vault_write_is_not_redirected_when_parent_is_replaced_after_validation() {
        use std::os::unix::fs::symlink;

        let base = std::env::temp_dir().join(format!(
            "oatlas-vault-parent-race-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let vault = base.join("vault");
        let sidecar = vault.join(".ontology-atlas");
        let original_sidecar = vault.join(".ontology-atlas-original");
        let outside = base.join("outside");
        std::fs::create_dir_all(&sidecar).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(sidecar.join("project-sources.json"), "inside-old").unwrap();
        std::fs::write(outside.join("project-sources.json"), "outside").unwrap();

        let result = write_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            ".ontology-atlas/project-sources.json".into(),
            "inside-new".into(),
            || {
                std::fs::rename(&sidecar, &original_sidecar).unwrap();
                symlink(&outside, &sidecar).unwrap();
            },
        );

        assert!(
            result.is_ok(),
            "a write under the stable original parent must succeed: {result:?}"
        );
        assert_eq!(
            std::fs::read_to_string(outside.join("project-sources.json")).unwrap(),
            "outside",
            "followed a parent symlink created after validation and wrote outside the vault"
        );
        assert_eq!(
            std::fs::read_to_string(original_sidecar.join("project-sources.json")).unwrap(),
            "inside-new"
        );
        std::fs::remove_dir_all(&base).ok();
    }

    #[cfg(unix)]
    #[test]
    fn vault_mkdir_has_no_outside_effect_when_parent_is_replaced_after_validation() {
        use std::os::unix::fs::symlink;

        let base = std::env::temp_dir().join(format!(
            "oatlas-vault-mkdir-race-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let vault = base.join("vault");
        let sidecar = vault.join(".ontology-atlas");
        let original_sidecar = vault.join(".ontology-atlas-original");
        let outside = base.join("outside");
        std::fs::create_dir_all(&sidecar).unwrap();
        std::fs::create_dir_all(&outside).unwrap();

        let result = ensure_vault_directory_after_validation(
            vault.to_string_lossy().into_owned(),
            ".ontology-atlas/new-dir".into(),
            || {
                std::fs::rename(&sidecar, &original_sidecar).unwrap();
                symlink(&outside, &sidecar).unwrap();
            },
        );

        assert!(
            result.is_ok(),
            "mkdir under the stable original parent must succeed: {result:?}"
        );
        assert!(
            !outside.join("new-dir").exists(),
            "followed a parent symlink created after validation and created a directory outside the vault"
        );
        assert!(original_sidecar.join("new-dir").is_dir());
        std::fs::remove_dir_all(&base).ok();
    }

    #[cfg(unix)]
    #[test]
    fn vault_write_replaces_a_hardlink_without_modifying_its_other_path() {
        use std::os::unix::fs::MetadataExt;

        let base = std::env::temp_dir().join(format!(
            "oatlas-vault-hardlink-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let vault = base.join("vault");
        let outside = base.join("outside.md");
        let target = vault.join("note.md");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(&outside, "outside").unwrap();
        std::fs::hard_link(&outside, &target).unwrap();

        write_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "note.md".into(),
            "inside-new".into(),
            || {},
        )
        .unwrap();

        assert_eq!(std::fs::read_to_string(&outside).unwrap(), "outside");
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "inside-new");
        assert_ne!(
            std::fs::metadata(&outside).unwrap().ino(),
            std::fs::metadata(&target).unwrap().ino(),
            "the vault entry kept its link to the outside inode"
        );
        std::fs::remove_dir_all(&base).ok();
    }

    /// Checks the write went through a temporary file, since results alone cannot tell
    /// the implementations apart.
    #[test]
    fn replaces_through_a_temporary_file_and_leaves_none_behind() {
        let dir = std::env::temp_dir().join(format!("oatlas-atomic-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("note.md");
        std::fs::write(&target, "old").unwrap();

        write_text_atomically(&target, "new").unwrap();

        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new");
        // A leftover temporary file breaks the next write.
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.contains("oatlas-tmp"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "temporary files remain: {leftovers:?}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_failed_write_leaves_the_original_untouched() {
        let dir = std::env::temp_dir().join(format!("oatlas-atomic-fail-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // A directory target makes rename fail.
        let target = dir.join("as-dir");
        std::fs::create_dir_all(&target).unwrap();

        let result = write_text_atomically(&target, "new");

        assert!(result.is_err(), "overwrote a directory with a file");
        assert!(target.is_dir(), "the target became a file");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_preexisting_temporary_symlink_cannot_redirect_an_atomic_write() {
        use std::os::unix::fs::symlink;

        let dir = std::env::temp_dir().join(format!(
            "oatlas-atomic-link-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("note.md");
        let sentinel = dir.join("outside-sentinel.txt");
        let predictable_temporary = target.with_extension(format!(
            "{}.oatlas-tmp-{}",
            target.extension().and_then(|e| e.to_str()).unwrap_or(""),
            std::process::id()
        ));
        std::fs::write(&target, "old").unwrap();
        std::fs::write(&sentinel, "outside").unwrap();
        symlink(&sentinel, &predictable_temporary).unwrap();

        write_text_atomically(&target, "new").unwrap();

        assert_eq!(std::fs::read_to_string(&sentinel).unwrap(), "outside");
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new");
        assert_ne!(std::fs::canonicalize(&target).unwrap(), sentinel);
        std::fs::remove_dir_all(&dir).ok();
    }
}
