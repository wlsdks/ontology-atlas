#[cfg(unix)]
use super::scope::canonical_root;
#[cfg(not(unix))]
use super::scope::{ensure_inside_canonical, resolve_inside, resolve_write_target_inside};
#[cfg(not(unix))]
use super::write::write_text_atomically;
#[cfg(unix)]
use crate::agent_setup;
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
#[cfg(not(unix))]
use std::{fs, io::Read};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LibraryCollectionsWriteResult {
    written: bool,
    current_content: Option<String>,
}

#[cfg(not(unix))]
fn read_library_collections_file(path: &Path) -> Result<Option<String>, String> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let mut text = String::new();
    file.take(1024 * 1024 + 1)
        .read_to_string(&mut text)
        .map_err(|error| error.to_string())?;
    if text.len() > 1024 * 1024 {
        return Err("collection preferences exceed the 1 MiB limit".into());
    }
    Ok(Some(text))
}

#[tauri::command(async)]
pub(crate) fn read_library_collections(root_path: String) -> Result<Option<String>, String> {
    const DIRECTORY: &str = ".ontology-atlas";
    const FILE_NAME: &str = "library-collections.json";
    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let root_handle = agent_setup::open_absolute_directory_no_follow(&root)?;
        let Some(parent) =
            agent_setup::open_relative_directory(&root_handle, Path::new(DIRECTORY))?
        else {
            return Ok(None);
        };
        let file_name = std::ffi::CString::new(FILE_NAME).map_err(|error| error.to_string())?;
        return agent_setup::read_entry_text(&parent, &file_name);
    }
    #[cfg(not(unix))]
    {
        // A read must not create the sidecar folder via the write-target resolver.
        let path = resolve_inside(&root_path, &format!("{DIRECTORY}/{FILE_NAME}"))?;
        if !path.exists() {
            return Ok(None);
        }
        let path = ensure_inside_canonical(&root_path, &path)?;
        read_library_collections_file(&path)
    }
}

/// Serialized only within this process; external editors do not share the lock, so a
/// conflict returns the current bytes and callers re-read.
#[tauri::command]
pub(crate) fn write_library_collections(
    root_path: String,
    expected_content: Option<String>,
    content: String,
) -> Result<LibraryCollectionsWriteResult, String> {
    static WRITE_LOCK: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();
    let _guard = WRITE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "library collection write lock is unavailable".to_string())?;
    const RELATIVE_PATH: &str = ".ontology-atlas/library-collections.json";
    if content.len() > 1024 * 1024 {
        return Err("library collection preferences exceed the 1 MiB limit".into());
    }

    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let root_handle = agent_setup::open_absolute_directory_no_follow(&root)?;
        let (parent, file_name) = agent_setup::open_entry_parent(&root_handle, RELATIVE_PATH)?;
        let current = agent_setup::read_entry_text(&parent, &file_name)?;
        if current != expected_content {
            return Ok(LibraryCollectionsWriteResult {
                written: false,
                current_content: current,
            });
        }
        agent_setup::write_entry_atomically(&parent, &file_name, &content, 0o600)?;
        return Ok(LibraryCollectionsWriteResult {
            written: true,
            current_content: Some(content),
        });
    }

    #[cfg(not(unix))]
    {
        let sidecar = resolve_write_target_inside(&root_path, ".ontology-atlas")?;
        fs::create_dir_all(&sidecar).map_err(|error| error.to_string())?;
        ensure_inside_canonical(&root_path, &sidecar)?;
        let path = resolve_write_target_inside(&root_path, RELATIVE_PATH)?;
        let current = read_library_collections_file(&path)?;
        if current != expected_content {
            return Ok(LibraryCollectionsWriteResult {
                written: false,
                current_content: current,
            });
        }
        write_text_atomically(&path, &content)?;
        Ok(LibraryCollectionsWriteResult {
            written: true,
            current_content: Some(content),
        })
    }
}

#[cfg(test)]
mod library_collections_write_tests {
    use super::{read_library_collections, write_library_collections};

    fn vault(label: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ontology-atlas-library-collections-{label}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    /// A vault without saved constellations is empty, not an error.
    #[test]
    fn read_answers_absent_for_a_vault_that_never_saved_collections() {
        let root = vault("absent");
        let root_path = root.to_string_lossy().to_string();
        assert_eq!(read_library_collections(root_path.clone()).unwrap(), None);
        assert!(
            !root.join(".ontology-atlas").exists(),
            "reading must not create the sidecar folder"
        );
        std::fs::create_dir(root.join(".ontology-atlas")).unwrap();
        std::fs::write(root.join(".ontology-atlas/activity.jsonl"), "{}\n").unwrap();
        assert_eq!(read_library_collections(root_path).unwrap(), None);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn compare_before_save_preserves_newer_content() {
        let root = vault("conflict");
        let root_path = root.to_string_lossy().to_string();
        let first = write_library_collections(root_path.clone(), None, "first\n".into()).unwrap();
        assert!(first.written);
        let conflict = write_library_collections(root_path, None, "stale\n".into()).unwrap();
        assert!(!conflict.written);
        assert_eq!(conflict.current_content.as_deref(), Some("first\n"));
        assert_eq!(
            std::fs::read_to_string(root.join(".ontology-atlas/library-collections.json")).unwrap(),
            "first\n"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn read_rejects_a_nonregular_target_without_waiting_for_a_writer() {
        use std::os::unix::ffi::OsStrExt;

        let root = vault("fifo");
        let sidecar = root.join(".ontology-atlas");
        std::fs::create_dir(&sidecar).unwrap();
        let path = sidecar.join("library-collections.json");
        let name = std::ffi::CString::new(path.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        let error = read_library_collections(root.to_string_lossy().to_string()).unwrap_err();
        assert!(error.contains("not a regular file"), "{error}");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn read_and_write_reject_content_beyond_the_preferences_budget() {
        let root = vault("oversize");
        let sidecar = root.join(".ontology-atlas");
        std::fs::create_dir(&sidecar).unwrap();
        std::fs::write(
            sidecar.join("library-collections.json"),
            vec![b'x'; 1024 * 1024 + 1],
        )
        .unwrap();
        let root_path = root.to_string_lossy().to_string();
        assert!(read_library_collections(root_path.clone())
            .unwrap_err()
            .contains("1 MiB"));
        let write_error =
            match write_library_collections(root_path, None, "x".repeat(1024 * 1024 + 1)) {
                Err(error) => error,
                Ok(_) => panic!("oversized collection preferences were accepted"),
            };
        assert!(write_error.contains("1 MiB"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
