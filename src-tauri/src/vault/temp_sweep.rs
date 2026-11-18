//! An atomic write leaves its temporary file behind when the process ends between creating
//! it and renaming it: a crash, a forced quit, or the Windows updater's immediate exit.
//! Opening a vault removes those leftovers so they do not pile up.
//!
//! Only a whole name in a writer's exact shape is removed (`crate::temporary_names`), only in
//! folders the vault walk itself enters plus the root `.ontology-atlas` sidecar, and only
//! after an hour untouched, because the MCP server and the CLI may be mid-write.

use super::walk::{vault_walk_skips_directory, VAULT_CACHE_DIR_TAG, VAULT_WALK_MAX_DEPTH};
use crate::temporary_names::is_atlas_temporary;
use std::path::Path;
use std::time::{Duration, SystemTime};

pub(crate) const STALE_AFTER: Duration = Duration::from_secs(60 * 60);
const MAX_ENTRIES: usize = 50_000;
const SIDECAR_DIRECTORY: &str = ".ontology-atlas";

struct Sweep {
    now: SystemTime,
    stale_after: Duration,
    visited: usize,
    removed: usize,
}

impl Sweep {
    /// False once the entry budget is spent, so a huge folder cannot hold the sweep.
    fn visit(&mut self) -> bool {
        self.visited += 1;
        self.visited <= MAX_ENTRIES
    }

    fn is_stale(&self, modified: SystemTime) -> bool {
        self.now
            .duration_since(modified)
            .is_ok_and(|age| age >= self.stale_after)
    }
}

fn descends_into(name: &str, depth: usize) -> bool {
    depth < VAULT_WALK_MAX_DEPTH
        && ((depth == 0 && name == SIDECAR_DIRECTORY) || !vault_walk_skips_directory(name))
}

/// Removes stale Atlas temporaries under `root`; returns how many were removed.
pub(crate) fn sweep_stale_temporaries(
    root: &Path,
    now: SystemTime,
    stale_after: Duration,
) -> usize {
    let mut sweep = Sweep {
        now,
        stale_after,
        visited: 0,
        removed: 0,
    };
    #[cfg(unix)]
    {
        if let Ok(directory) = crate::agent_setup::open_absolute_directory_no_follow(root) {
            unix::sweep_open_directory(&directory, 0, &mut sweep);
        }
    }
    #[cfg(not(unix))]
    portable::sweep_directory(root, 0, &mut sweep);
    sweep.removed
}

/// Every step goes through the open directory: a folder swapped for a link after it was
/// listed fails `O_NOFOLLOW` instead of being entered.
#[cfg(unix)]
mod unix {
    use super::{descends_into, is_atlas_temporary, Sweep, VAULT_CACHE_DIR_TAG};
    use std::ffi::{CStr, CString};
    use std::fs;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::time::{Duration, UNIX_EPOCH};

    fn list(directory: &fs::File) -> Option<Vec<CString>> {
        struct Stream(*mut libc::DIR);
        impl Drop for Stream {
            fn drop(&mut self) {
                unsafe { libc::closedir(self.0) };
            }
        }
        let fd = unsafe { libc::dup(directory.as_raw_fd()) };
        if fd < 0 {
            return None;
        }
        let raw = unsafe { libc::fdopendir(fd) };
        if raw.is_null() {
            unsafe { libc::close(fd) };
            return None;
        }
        let stream = Stream(raw);
        let mut names = Vec::new();
        loop {
            let entry = unsafe { libc::readdir(stream.0) };
            if entry.is_null() {
                return Some(names);
            }
            let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) };
            if !matches!(name.to_bytes(), b"." | b"..") {
                names.push(name.to_owned());
            }
        }
    }

    pub(super) fn sweep_open_directory(directory: &fs::File, depth: usize, sweep: &mut Sweep) {
        let Some(names) = list(directory) else {
            return;
        };
        if names
            .iter()
            .any(|name| name.to_bytes() == VAULT_CACHE_DIR_TAG.as_bytes())
        {
            return;
        }
        for name in names {
            if !sweep.visit() {
                return;
            }
            let mut status: libc::stat = unsafe { std::mem::zeroed() };
            let stated = unsafe {
                libc::fstatat(
                    directory.as_raw_fd(),
                    name.as_ptr(),
                    &mut status,
                    libc::AT_SYMLINK_NOFOLLOW,
                )
            };
            if stated != 0 {
                continue;
            }
            let kind = status.st_mode & libc::S_IFMT;
            let text = name.to_string_lossy();
            if kind == libc::S_IFDIR {
                if !descends_into(&text, depth) {
                    continue;
                }
                let fd = unsafe {
                    libc::openat(
                        directory.as_raw_fd(),
                        name.as_ptr(),
                        libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
                    )
                };
                if fd >= 0 {
                    let child = unsafe { fs::File::from_raw_fd(fd) };
                    sweep_open_directory(&child, depth + 1, sweep);
                }
            } else if kind == libc::S_IFREG && is_atlas_temporary(&text) {
                let Ok(seconds) = u64::try_from(status.st_mtime) else {
                    continue;
                };
                if sweep.is_stale(UNIX_EPOCH + Duration::from_secs(seconds))
                    && unsafe { libc::unlinkat(directory.as_raw_fd(), name.as_ptr(), 0) } == 0
                {
                    sweep.removed += 1;
                }
            }
        }
    }
}

/// `DirEntry::file_type` does not follow links or junctions, so a linked folder is never
/// entered from its listing.
#[cfg(not(unix))]
mod portable {
    use super::{descends_into, is_atlas_temporary, Sweep, VAULT_CACHE_DIR_TAG};
    use std::fs;
    use std::path::Path;

    pub(super) fn sweep_directory(directory: &Path, depth: usize, sweep: &mut Sweep) {
        let Ok(entries) = fs::read_dir(directory) else {
            return;
        };
        let entries: Vec<fs::DirEntry> = entries.flatten().collect();
        if entries
            .iter()
            .any(|entry| entry.file_name() == VAULT_CACHE_DIR_TAG)
        {
            return;
        }
        for entry in entries {
            if !sweep.visit() {
                return;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if file_type.is_dir() {
                if descends_into(&name, depth) {
                    sweep_directory(&entry.path(), depth + 1, sweep);
                }
            } else if file_type.is_file() && is_atlas_temporary(&name) {
                let stale = entry
                    .metadata()
                    .and_then(|metadata| metadata.modified())
                    .is_ok_and(|modified| sweep.is_stale(modified));
                if stale && fs::remove_file(entry.path()).is_ok() {
                    sweep.removed += 1;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{sweep_stale_temporaries, STALE_AFTER};
    use crate::temporary_names::{atomic_temporary_name, create_temporary_name};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime};

    fn vault(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "oatlas-sweep-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        // The app hands over a canonical root; `/var` on macOS is itself a link.
        fs::canonicalize(root).unwrap()
    }

    fn an_hour_later() -> SystemTime {
        SystemTime::now() + STALE_AFTER + Duration::from_secs(1)
    }

    fn plant(root: &std::path::Path, relative: &str) {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "content").unwrap();
    }

    #[test]
    fn removes_old_writer_temporaries_and_keeps_recent_ones() {
        let root = vault("writers");
        let leftovers = [
            format!(
                ".ontology-atlas/{}",
                atomic_temporary_name("library-collections.json", 41, 0x18f, 0)
            ),
            format!(
                "docs/deep/{}",
                atomic_temporary_name("note.md", 41, 0x18f, 1)
            ),
            format!("docs/{}", create_temporary_name(41, 0x18f, 2)),
            "docs/note.md.oatlas-tmp-912".to_string(),
            ".ontology-atlas/.sources.json.oatlas-tmp-912-3b241101-e2bb-4255-8caf-4136c566a962"
                .to_string(),
        ];
        for path in &leftovers {
            plant(&root, path);
        }
        plant(&root, "docs/note.md");

        assert_eq!(
            sweep_stale_temporaries(&root, SystemTime::now(), STALE_AFTER),
            0,
            "a temporary another writer may still rename was removed"
        );
        assert_eq!(
            sweep_stale_temporaries(&root, an_hour_later(), STALE_AFTER),
            leftovers.len()
        );
        for path in &leftovers {
            assert!(!root.join(path).exists(), "{path}");
        }
        assert!(root.join("docs/note.md").exists());
        fs::remove_dir_all(root).ok();
    }

    /// Each of these was deleted by the first version, which matched a substring.
    #[test]
    fn a_person_s_files_that_mention_the_marker_survive() {
        let root = vault("people");
        let kept = [
            ".oatlas-tmp-notes.md",
            "docs/why.oatlas-tmp-files-appear.md",
            "docs/.oatlas-create-plan.tmp",
            ".venv/lib/pkg.oatlas-tmp-fixture",
        ];
        for path in kept {
            plant(&root, path);
        }
        let real = format!("docs/{}", atomic_temporary_name("note.md", 41, 0x18f, 0));
        plant(&root, &real);
        assert_eq!(
            sweep_stale_temporaries(&root, an_hour_later(), STALE_AFTER),
            1
        );
        assert!(!root.join(real).exists());
        for path in kept {
            assert!(root.join(path).exists(), "{path}");
        }
        fs::remove_dir_all(root).ok();
    }

    /// The same folders the vault walk skips, so build output cannot spend the entry budget.
    #[test]
    fn skips_the_folders_the_vault_walk_skips() {
        let root = vault("skipped");
        let name = atomic_temporary_name("note.md", 41, 0x18f, 0);
        let skipped = [
            format!(".git/{name}"),
            format!(".venv/{name}"),
            format!("node_modules/pkg/{name}"),
            format!("target/debug/{name}"),
            format!("docs/.ontology-atlas/{name}"),
        ];
        for path in &skipped {
            plant(&root, path);
        }
        plant(&root, "target/CACHEDIR.TAG");
        plant(&root, &format!("docs/{name}"));
        assert_eq!(
            sweep_stale_temporaries(&root, an_hour_later(), STALE_AFTER),
            1
        );
        for path in &skipped {
            assert!(root.join(path).exists(), "{path}");
        }
        fs::remove_dir_all(root).ok();
    }

    /// A junction is how a Windows folder points elsewhere without admin rights.
    #[cfg(windows)]
    #[test]
    fn never_enters_a_windows_junction() {
        let base = vault("junction");
        let name = atomic_temporary_name("note.md", 41, 0x18f, 0);
        fs::create_dir_all(base.join("vault")).unwrap();
        plant(&base, &format!("outside/{name}"));
        let made = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(base.join("vault").join("docs"))
            .arg(base.join("outside"))
            .status()
            .unwrap();
        assert!(made.success());
        plant(&base, &format!("vault/real/{name}"));
        assert_eq!(
            sweep_stale_temporaries(&base.join("vault"), an_hour_later(), STALE_AFTER),
            1
        );
        assert!(base.join(format!("outside/{name}")).exists());
        fs::remove_dir(base.join("vault").join("docs")).ok();
        fs::remove_dir_all(base).ok();
    }

    #[cfg(unix)]
    #[test]
    fn never_follows_or_removes_a_link() {
        use std::os::unix::fs::symlink;
        let base = vault("links");
        let name = atomic_temporary_name("note.md", 41, 0x18f, 0);
        fs::create_dir_all(base.join("vault")).unwrap();
        plant(&base, &format!("outside/{name}"));
        symlink(base.join("outside"), base.join("vault/docs")).unwrap();
        symlink(
            base.join(format!("outside/{name}")),
            base.join(format!("vault/{name}")),
        )
        .unwrap();
        plant(&base, &format!("vault/real/{name}"));
        assert_eq!(
            sweep_stale_temporaries(&base.join("vault"), an_hour_later(), STALE_AFTER),
            1
        );
        assert!(base.join(format!("outside/{name}")).exists());
        assert!(fs::symlink_metadata(base.join(format!("vault/{name}"))).is_ok());
        fs::remove_dir_all(base).ok();
    }
}
