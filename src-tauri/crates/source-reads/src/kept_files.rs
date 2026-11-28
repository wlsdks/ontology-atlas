//! The text of repository files and what the line scanners found in them (Ruby and C#, which the
//! survey has no syntax tree for), kept between calls of one server process by the file's stamp (device, inode, size, modification and change times), as
//! the script server keeps its declaration index by size and time. A call asks one `stat` per file
//! it needs; only a file whose stamp moved is read and scanned again.
//!
//! A file written within [`RACY_WINDOW_NANOSECONDS`] of being read is not kept: a second write in
//! the clock's grain would change no stamp. Texts are held within [`TEXT_CHARACTERS`] and the
//! least recently used leaves first. No lock is held while a file is read or scanned.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use confined_files::{DiskSource, FileStamp, SourceFiles, SourceRoot};

use crate::file_outline::{outline_file, OutlineDeclaration};
use crate::opened_file::MAX_FILE_BYTES;

/// Whole file texts kept, in characters; past it the least recently used are read again.
const TEXT_CHARACTERS: usize = 4 * 1024 * 1024;
/// Files whose declarations are kept; past it the oldest entry is dropped.
const SCANNED_FILES: usize = 20_000;
/// A file this recently written when read is not trusted yet.
const RACY_WINDOW_NANOSECONDS: i128 = 2_000_000_000;

struct KeptText {
    stamp: FileStamp,
    text: Arc<str>,
    last_used: u64,
}

struct KeptDeclarations {
    stamp: FileStamp,
    declarations: Arc<Vec<OutlineDeclaration>>,
    last_used: u64,
}

#[derive(Default)]
struct Kept {
    scanned: HashMap<PathBuf, KeptDeclarations>,
    texts: HashMap<PathBuf, KeptText>,
    characters: usize,
    clock: u64,
}

static KEPT: LazyLock<Mutex<Kept>> = LazyLock::new(|| Mutex::new(Kept::default()));

fn now_nanoseconds() -> i128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| i128::try_from(elapsed.as_nanos()).unwrap_or(0))
}

fn locked() -> std::sync::MutexGuard<'static, Kept> {
    KEPT.lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// The text of the product file at `path` (`/`-separated, below `root`): empty when it is
/// missing, unreadable or past the size a read opens.
pub fn kept_text(root: &SourceRoot, path: &str) -> Arc<str> {
    let parts: Vec<&str> = path.split('/').collect();
    let absolute = parts
        .iter()
        .fold(root.as_path().to_path_buf(), |joined, part| {
            joined.join(part)
        });
    let Some(stamp) = root.repository_file_stamp(&parts) else {
        forget(&absolute);
        return Arc::from("");
    };
    {
        let mut kept = locked();
        kept.clock += 1;
        let clock = kept.clock;
        if let Some(held) = kept.texts.get_mut(&absolute) {
            if held.stamp == stamp {
                held.last_used = clock;
                return held.text.clone();
            }
        }
    }
    let text: Arc<str> = DiskSource::new(root, MAX_FILE_BYTES as usize)
        .read_text(&absolute)
        .map_or_else(|_| Arc::from(""), |text| Arc::from(&*text));
    if !stamp.is_recent(now_nanoseconds(), RACY_WINDOW_NANOSECONDS) {
        keep(absolute, stamp, text.clone());
    }
    text
}

fn forget(absolute: &PathBuf) {
    let mut kept = locked();
    if let Some(dropped) = kept.texts.remove(absolute) {
        kept.characters = kept.characters.saturating_sub(dropped.text.chars().count());
    }
}

fn keep(absolute: PathBuf, stamp: FileStamp, text: Arc<str>) {
    let mut kept = locked();
    kept.clock += 1;
    let last_used = kept.clock;
    kept.characters += text.chars().count();
    if let Some(replaced) = kept.texts.insert(
        absolute,
        KeptText {
            stamp,
            text,
            last_used,
        },
    ) {
        kept.characters = kept
            .characters
            .saturating_sub(replaced.text.chars().count());
    }
    while kept.characters > TEXT_CHARACTERS {
        let Some(oldest) = kept
            .texts
            .iter()
            .min_by_key(|(_, held)| held.last_used)
            .map(|(path, _)| path.clone())
        else {
            break;
        };
        if let Some(dropped) = kept.texts.remove(&oldest) {
            kept.characters = kept.characters.saturating_sub(dropped.text.chars().count());
        }
    }
}

/// The code declarations of the Ruby or C# file at `path`, read by their line scanner; scanned
/// again only when the file's stamp moved.
pub fn kept_line_scanned_declarations(
    root: &SourceRoot,
    path: &str,
) -> Arc<Vec<OutlineDeclaration>> {
    let parts: Vec<&str> = path.split('/').collect();
    let absolute = parts
        .iter()
        .fold(root.as_path().to_path_buf(), |joined, part| {
            joined.join(part)
        });
    let stamp = root.repository_file_stamp(&parts);
    {
        let mut kept = locked();
        kept.clock += 1;
        let clock = kept.clock;
        match (kept.scanned.get_mut(&absolute), stamp) {
            (Some(held), Some(now)) if held.stamp == now => {
                held.last_used = clock;
                return held.declarations.clone();
            }
            (Some(_), _) => {
                kept.scanned.remove(&absolute);
            }
            _ => {}
        }
    }
    let declarations = Arc::new(
        outline_file(&kept_text(root, path), path)
            .declarations
            .into_iter()
            .filter(|declaration| declaration.kind.is_code())
            .collect::<Vec<_>>(),
    );
    if let Some(stamp) =
        stamp.filter(|stamp| !stamp.is_recent(now_nanoseconds(), RACY_WINDOW_NANOSECONDS))
    {
        let mut kept = locked();
        kept.clock += 1;
        let last_used = kept.clock;
        kept.scanned.insert(
            absolute,
            KeptDeclarations {
                stamp,
                declarations: declarations.clone(),
                last_used,
            },
        );
        if kept.scanned.len() > SCANNED_FILES {
            if let Some(oldest) = kept
                .scanned
                .iter()
                .min_by_key(|(_, held)| held.last_used)
                .map(|(path, _)| path.clone())
            {
                kept.scanned.remove(&oldest);
            }
        }
    }
    declarations
}

#[cfg(test)]
#[allow(
    clippy::disallowed_methods,
    reason = "the test plants a file and resolves its folder, which the crate otherwise never does"
)]
mod tests {
    use std::time::Duration;

    use confined_files::ScanRoots;

    use super::*;

    fn root_of(folder: &std::path::Path) -> SourceRoot {
        ScanRoots::new(folder.to_path_buf(), folder.to_path_buf())
            .expect("roots")
            .allow(folder, "rootPath")
            .expect("allowed")
    }

    #[test]
    fn a_file_is_kept_once_it_is_older_than_the_racy_window_and_read_again_when_its_stamp_moves() {
        let base = tempfile::tempdir().expect("temp dir");
        let folder = base.path().canonicalize().expect("real");
        let root = root_of(&folder);
        let path = folder.join("a.rb");
        std::fs::write(&path, "def one\nend\n").expect("file");
        let fresh = kept_text(&root, "a.rb");
        assert!(
            !Arc::ptr_eq(&fresh, &kept_text(&root, "a.rb")),
            "a second write in the clock's grain would change no stamp, so a file written this \
             second is read every time"
        );
        std::thread::sleep(Duration::from_millis(2_200));
        let settled = kept_text(&root, "a.rb");
        assert!(Arc::ptr_eq(&settled, &kept_text(&root, "a.rb")), "kept");
        assert_eq!(kept_line_scanned_declarations(&root, "a.rb").len(), 1);
        std::fs::write(&path, "def one\nend\ndef two\nend\n").expect("file");
        assert_eq!(&*kept_text(&root, "a.rb"), "def one\nend\ndef two\nend\n");
        assert_eq!(kept_line_scanned_declarations(&root, "a.rb").len(), 2);
    }
}
