//! An atomic write leaves a temporary file behind when the process ends between creating it
//! and renaming it: a crash, a forced quit, or the Windows updater's immediate exit. They are
//! dotfiles or carry an Atlas suffix, so no screen shows them; opening the vault removes the
//! old ones so they do not pile up.
//!
//! The MCP server and the CLI use the same `.oatlas-tmp-` suffix and can be writing while the
//! app opens a vault, so only files untouched for an hour are removed.

use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};

pub(crate) const STALE_AFTER: Duration = Duration::from_secs(60 * 60);
const MAX_ENTRIES: usize = 50_000;
const MAX_DEPTH: usize = 32;
const SKIPPED_DIRECTORIES: &[&str] = &[".git", "node_modules"];

fn is_atlas_temporary(name: &str) -> bool {
    name.contains(".oatlas-tmp-") || (name.starts_with(".oatlas-create-") && name.ends_with(".tmp"))
}

/// Removes Atlas temporaries older than `stale_after`; returns how many were removed.
/// Symbolic links are neither followed nor removed.
pub(crate) fn sweep_stale_temporaries(
    root: &Path,
    now: SystemTime,
    stale_after: Duration,
) -> usize {
    let mut removed = 0;
    let mut visited = 0;
    let mut pending = vec![(root.to_path_buf(), 0usize)];
    while let Some((directory, depth)) = pending.pop() {
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            visited += 1;
            if visited > MAX_ENTRIES {
                return removed;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if file_type.is_dir() {
                if depth < MAX_DEPTH && !SKIPPED_DIRECTORIES.contains(&name.as_ref()) {
                    pending.push((entry.path(), depth + 1));
                }
                continue;
            }
            if !file_type.is_file() || !is_atlas_temporary(&name) {
                continue;
            }
            let stale = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|modified| now.duration_since(modified).ok())
                .is_some_and(|age| age >= stale_after);
            if stale && fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::{is_atlas_temporary, sweep_stale_temporaries, STALE_AFTER};
    use std::fs;
    use std::time::{Duration, SystemTime};

    #[test]
    fn recognises_every_writer_s_temporary_and_nothing_else() {
        for name in [
            ".note.md.oatlas-tmp-41-18f-0",
            "note.md.oatlas-tmp-912",
            ".oatlas-create-41-18f-0.tmp",
        ] {
            assert!(is_atlas_temporary(name), "{name}");
        }
        for name in [
            "note.md",
            ".oatlas-create-notes.md",
            "oatlas-tmp.md",
            ".DS_Store",
        ] {
            assert!(!is_atlas_temporary(name), "{name}");
        }
    }

    #[test]
    fn removes_old_temporaries_everywhere_but_keeps_recent_ones_and_real_files() {
        let root = std::env::temp_dir().join(format!(
            "oatlas-sweep-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join(".ontology-atlas")).unwrap();
        fs::create_dir_all(root.join("docs/deep")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        let stale = [
            ".ontology-atlas/.library-collections.json.oatlas-tmp-1-a-0",
            "docs/deep/note.md.oatlas-tmp-7",
            "docs/.oatlas-create-1-a-0.tmp",
        ];
        for path in stale {
            fs::write(root.join(path), "partial").unwrap();
        }
        fs::write(root.join("docs/note.md"), "kept").unwrap();
        fs::write(root.join(".git/x.oatlas-tmp-1"), "not ours to judge").unwrap();

        let later = SystemTime::now() + STALE_AFTER + Duration::from_secs(1);
        assert_eq!(
            sweep_stale_temporaries(&root, SystemTime::now(), STALE_AFTER),
            0,
            "a temporary another writer may still rename was removed"
        );
        assert_eq!(sweep_stale_temporaries(&root, later, STALE_AFTER), 3);
        for path in stale {
            assert!(!root.join(path).exists(), "{path}");
        }
        assert!(root.join("docs/note.md").exists());
        assert!(root.join(".git/x.oatlas-tmp-1").exists());
        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn never_follows_or_removes_a_link() {
        use std::os::unix::fs::symlink;
        let base = std::env::temp_dir().join(format!("oatlas-sweep-link-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("vault")).unwrap();
        fs::create_dir_all(base.join("outside")).unwrap();
        fs::write(base.join("outside/a.md.oatlas-tmp-1"), "outside").unwrap();
        symlink(base.join("outside"), base.join("vault/linked")).unwrap();
        symlink(
            base.join("outside/a.md.oatlas-tmp-1"),
            base.join("vault/b.md.oatlas-tmp-1"),
        )
        .unwrap();
        let later = SystemTime::now() + STALE_AFTER + Duration::from_secs(1);
        assert_eq!(
            sweep_stale_temporaries(&base.join("vault"), later, STALE_AFTER),
            0
        );
        assert!(base.join("outside/a.md.oatlas-tmp-1").exists());
        assert!(base.join("vault/b.md.oatlas-tmp-1").exists());
        fs::remove_dir_all(base).ok();
    }
}
