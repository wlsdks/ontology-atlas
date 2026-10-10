#[cfg(not(unix))]
use super::scope::resolve_write_target_inside;
#[cfg(unix)]
use super::scope::{canonical_root, normalize_relative_path, resolve_directory_target_inside};
#[cfg(unix)]
use crate::agent_setup;
use std::fs;
use std::path::Path;
#[cfg(any(not(unix), test))]
use std::time::UNIX_EPOCH;

/// Create-only: existing entries are preserved byte for byte.
#[tauri::command]
pub(crate) fn create_vault_text_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<bool, String> {
    create_vault_text_file_after_validation(root_path, relative_path, content, || {})
}

fn create_vault_text_file_after_validation(
    root_path: String,
    relative_path: String,
    content: String,
    after_validation: impl FnOnce(),
) -> Result<bool, String> {
    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let relative = normalize_relative_path(&relative_path)?;
        let parent_relative = relative.parent().unwrap_or_else(|| Path::new(""));
        resolve_directory_target_inside(&root_path, &parent_relative.to_string_lossy())?;
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
        agent_setup::create_entry_atomically(&parent, &file_name, &content, 0o666)
    }
    #[cfg(not(unix))]
    {
        let path = resolve_write_target_inside(&root_path, &relative_path)?;
        after_validation();
        create_text_exclusively(&path, &content)
    }
}

/// Unsupported hard-link publication fails closed.
#[cfg(any(not(unix), test))]
fn create_text_exclusively(path: &Path, content: &str) -> Result<bool, String> {
    create_text_exclusively_with(path, content, |from, to| fs::hard_link(from, to))
}

#[cfg(any(not(unix), test))]
fn create_text_exclusively_with(
    path: &Path,
    content: &str,
    publish: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> Result<bool, String> {
    use std::io::Write;
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let parent = path.parent().ok_or("file creation requires a parent")?;
    let nonce = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let mut created = None;
    for _ in 0..64 {
        let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let temporary = parent.join(format!(
            ".oatlas-create-{}-{nonce:x}-{sequence:x}.tmp",
            std::process::id()
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => {
                created = Some((temporary, file));
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    let (temporary, mut file) = created.ok_or("could not reserve a private creation temporary")?;
    let result = (|| -> std::io::Result<bool> {
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        match publish(&temporary, path) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
            Err(error) => Err(error),
        }
    })();
    fs::remove_file(&temporary).map_err(|error| error.to_string())?;
    result.map_err(|error| error.to_string())
}

#[cfg(test)]
mod create_only_tests {
    use super::{
        create_text_exclusively, create_text_exclusively_with,
        create_vault_text_file_after_validation,
    };
    use std::fs;
    use std::path::PathBuf;

    fn fixture() -> PathBuf {
        static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "oatlas-create-only-{}-{}-{sequence}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("vault/wiki/answers")).unwrap();
        root
    }

    #[test]
    fn creates_complete_content_and_preserves_existing_bytes_without_temporary_debris() {
        let base = fixture();
        let vault = base.join("vault");
        let target = vault.join("wiki/answers/answer.md");
        let create = |text: &str| {
            create_vault_text_file_after_validation(
                vault.to_string_lossy().into_owned(),
                "wiki/answers/answer.md".into(),
                text.into(),
                || {},
            )
        };
        assert!(create("first answer — complete").unwrap());
        assert!(!create("replacement must not land").unwrap());
        assert_eq!(
            fs::read_to_string(&target).unwrap(),
            "first answer — complete"
        );
        assert_eq!(fs::read_dir(target.parent().unwrap()).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn a_destination_created_after_validation_is_not_overwritten() {
        let base = fixture();
        let vault = base.join("vault");
        let target = vault.join("wiki/answers/answer.md");
        let created = create_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "wiki/answers/answer.md".into(),
            "late writer".into(),
            || fs::write(&target, "racing writer").unwrap(),
        )
        .unwrap();
        assert!(!created);
        assert_eq!(fs::read_to_string(&target).unwrap(), "racing writer");
        assert_eq!(fs::read_dir(target.parent().unwrap()).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn concurrent_creators_publish_exactly_one_complete_winner() {
        let base = fixture();
        let vault = base.join("vault");
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let threads: Vec<_> = ["answer A", "answer B"]
            .into_iter()
            .map(|text| {
                let root = vault.to_string_lossy().into_owned();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    create_vault_text_file_after_validation(
                        root,
                        "wiki/answers/answer.md".into(),
                        text.into(),
                        || {
                            barrier.wait();
                        },
                    )
                    .unwrap()
                })
            })
            .collect();
        let winners = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .filter(|created| *created)
            .count();
        assert_eq!(winners, 1);
        let text = fs::read_to_string(vault.join("wiki/answers/answer.md")).unwrap();
        assert!(text == "answer A" || text == "answer B");
        assert_eq!(fs::read_dir(vault.join("wiki/answers")).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_and_keeps_the_open_parent_after_a_directory_swap() {
        use std::os::unix::fs::symlink;
        let base = fixture();
        let vault = base.join("vault");
        let outside = base.join("outside");
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("answer.md"), "outside original").unwrap();
        symlink(outside.join("answer.md"), vault.join("linked.md")).unwrap();
        assert!(create_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "linked.md".into(),
            "must not land".into(),
            || {}
        )
        .is_err());
        assert!(create_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "../outside/answer.md".into(),
            "must not land".into(),
            || {}
        )
        .is_err());
        let parent = vault.join("wiki/answers");
        let parked = vault.join("wiki/parked");
        assert!(create_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "wiki/answers/answer.md".into(),
            "inside complete".into(),
            || {
                fs::rename(&parent, &parked).unwrap();
                symlink(&outside, &parent).unwrap();
            }
        )
        .unwrap());
        assert_eq!(
            fs::read_to_string(outside.join("answer.md")).unwrap(),
            "outside original"
        );
        assert_eq!(
            fs::read_to_string(parked.join("answer.md")).unwrap(),
            "inside complete"
        );
        assert_eq!(fs::read_dir(&parked).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn portable_publication_preserves_existing_file_and_fails_closed_without_hard_links() {
        let base = fixture();
        let parent = base.join("vault/wiki/answers");
        let target = parent.join("answer.md");
        assert!(create_text_exclusively(&target, "original").unwrap());
        assert!(!create_text_exclusively(&target, "replacement").unwrap());
        let missing = parent.join("unsupported.md");
        assert!(
            create_text_exclusively_with(&missing, "never published", |_, _| {
                Err(std::io::Error::new(
                    std::io::ErrorKind::Unsupported,
                    "exclusive publication unavailable",
                ))
            })
            .is_err()
        );
        assert!(!missing.exists());
        assert_eq!(fs::read_to_string(&target).unwrap(), "original");
        assert_eq!(fs::read_dir(parent).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }
}
