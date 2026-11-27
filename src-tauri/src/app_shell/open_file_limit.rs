/// macOS's `OPEN_MAX`. The kernel accepts a higher soft limit, but `setrlimit(2)` asks for
/// `min(OPEN_MAX, rlim_max)` open files.
const OPEN_MAX: libc::rlim_t = 10_240;

/// An app started from the Dock gets a soft limit of 256 open files. notify's FSEvents stream holds
/// one per folder on each watched root's path and crashes the app when it runs out, so the soft
/// limit rises to the hard one, at most `OPEN_MAX`; a refusal leaves it as it was.
pub(crate) fn raise_open_file_limit() {
    let mut limit = libc::rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    // SAFETY: `limit` is a valid `rlimit` for `getrlimit` to fill.
    if unsafe { libc::getrlimit(libc::RLIMIT_NOFILE, &mut limit) } != 0 {
        return;
    }
    let wanted = limit.rlim_max.min(OPEN_MAX);
    if wanted <= limit.rlim_cur {
        return;
    }
    let raised = libc::rlimit {
        rlim_cur: wanted,
        rlim_max: limit.rlim_max,
    };
    // SAFETY: `raised` is a valid `rlimit`; a refused call changes nothing.
    unsafe { libc::setrlimit(libc::RLIMIT_NOFILE, &raised) };
}

#[cfg(test)]
mod tests {
    use super::raise_open_file_limit;
    use notify_debouncer_full::notify::{recommended_watcher, Event, RecursiveMode, Watcher};
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    /// The folder for the deep roots, set in the copy of this test that starts with the Dock's limit.
    const BASE: &str = "ATLAS_OPEN_FILE_LIMIT_BASE";
    const ROOTS: usize = 22;
    /// 22 roots this deep need about 4,000 descriptors: more than the 2,560 a Dock launch has once
    /// its first stream starts, as about 250 roots of an ordinary depth would.
    const DEPTH: usize = 170;

    #[test]
    fn started_from_the_dock_the_app_watches_twenty_two_deep_roots_and_hears_the_last() {
        if let Some(base) = std::env::var_os(BASE) {
            watch_deep_roots_after_the_raise(Path::new(&base));
            return;
        }
        let (_, module) = module_path!().split_once("::").unwrap();
        let name = format!(
            "{module}::started_from_the_dock_the_app_watches_twenty_two_deep_roots_and_hears_the_last"
        );
        let base =
            std::env::temp_dir().join(format!("atlas-open-file-limit-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let status = Command::new("/bin/sh")
            .args([
                "-c",
                "ulimit -S -n 256 && exec \"$0\" --exact \"$1\" --test-threads=1",
            ])
            .arg(std::env::current_exe().unwrap())
            .arg(name)
            .env(BASE, &base)
            .status();
        let _ = std::fs::remove_dir_all(&base);
        let status = status.unwrap();
        assert!(status.success(), "the watching copy ended with {status}");
    }

    fn watch_deep_roots_after_the_raise(base: &Path) {
        raise_open_file_limit();
        let roots: Vec<PathBuf> = (0..ROOTS)
            .map(|index| {
                let mut root = base.join(format!("r{index}"));
                root.extend(std::iter::repeat_n("x", DEPTH));
                std::fs::create_dir_all(&root).unwrap();
                root.canonicalize().unwrap()
            })
            .collect();
        let (notices, received) = mpsc::channel();
        let mut watcher =
            recommended_watcher(move |event: notify_debouncer_full::notify::Result<Event>| {
                if let Ok(event) = event {
                    for path in event.paths {
                        let _ = notices.send(path);
                    }
                }
            })
            .unwrap();
        // One root at a time, as Work status adds them.
        let refused: Vec<String> = roots
            .iter()
            .enumerate()
            .filter_map(|(index, root)| {
                let refusal = watcher.watch(root, RecursiveMode::Recursive).err()?;
                Some(format!("root {}: {:?}", index + 1, refusal.kind))
            })
            .collect();
        assert!(refused.is_empty(), "every root is watched: {refused:?}");
        let last = roots.last().unwrap();
        // macOS delivers late while the whole Rust suite runs beside this copy.
        let deadline = Instant::now() + Duration::from_secs(60);
        let mut heard = false;
        let mut write = 0;
        while !heard && Instant::now() < deadline {
            std::fs::write(last.join(format!("note-{write}.md")), "x").unwrap();
            write += 1;
            heard = received
                .recv_timeout(Duration::from_millis(500))
                .is_ok_and(|path| path.starts_with(last));
        }
        drop(watcher);
        assert!(heard, "a save in the last of {ROOTS} roots arrives");
    }
}
