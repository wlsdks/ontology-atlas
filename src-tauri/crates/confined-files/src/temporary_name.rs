//! The name a file has while it is being written. It is the app's atomic-write shape,
//! `.<name>.oatlas-tmp-<pid>-<hex>-<hex>`, so the vault-open sweep that clears debris after a
//! crash recognises it, and a Markdown walk never lists it (it starts with a dot).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const TEMPORARY_MARKER: &str = ".oatlas-tmp-";

/// The longest name one folder entry may have on the file systems a vault lives on (ext4, APFS,
/// NTFS count 255 bytes or units); a longer name fails with `ENAMETOOLONG`.
const LONGEST_FILE_NAME_BYTES: usize = 255;

pub(crate) fn atomic_temporary_name(
    file_name: &str,
    process: u32,
    nonce: u128,
    sequence: u64,
) -> String {
    format!(".{file_name}{TEMPORARY_MARKER}{process}-{nonce:x}-{sequence:x}")
}

/// A fresh name for a file called `file_name`: this process, the clock, a counter. Two writers in
/// one process or two processes never pick one, and `create_new` refuses the rare tie. The
/// shape adds up to 60 bytes to the file's name, where the JavaScript writers add 20, so a name
/// that would pass 255 bytes keeps only as much of the file's name as fits; the sweep needs a
/// non-empty target and nothing else of it.
pub(crate) fn next_atomic_temporary_name(file_name: &str) -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    let process = std::process::id();
    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let whole = atomic_temporary_name(file_name, process, nonce, sequence);
    if whole.len() <= LONGEST_FILE_NAME_BYTES {
        return whole;
    }
    let overhead = whole.len() - file_name.len();
    let room = LONGEST_FILE_NAME_BYTES.saturating_sub(overhead).max(1);
    let kept: String = file_name
        .chars()
        .scan(0_usize, |used, letter| {
            *used += letter.len_utf8();
            (*used <= room).then_some(letter)
        })
        .collect();
    atomic_temporary_name(&kept, process, nonce, sequence)
}

/// The app's own recogniser, compiled into this crate's tests as a copy of the file, so a change
/// to the shapes the sweep accepts fails here instead of leaving debris.
#[cfg(test)]
#[allow(dead_code, reason = "the app uses what this crate's tests do not")]
#[path = "../../../src/vault/temporary_files/names.rs"]
mod app_names;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sweep_recognises_every_name_this_crate_picks() {
        for file_name in ["note.md", "\u{d55c}\u{ae00}.md", ".mcp.json", "a b.md"] {
            let name = next_atomic_temporary_name(file_name);
            assert!(app_names::is_atlas_temporary(&name), "{name}");
            assert!(name.starts_with('.'), "{name}");
        }
        assert!(app_names::is_atlas_temporary(&atomic_temporary_name(
            "x.md",
            u32::MAX,
            u128::MAX,
            u64::MAX
        )));
    }

    #[test]
    fn the_shape_is_the_apps_to_the_character() {
        for (file_name, process, nonce, sequence) in
            [("note.md", 41_u32, 0x18f_u128, 0_u64), ("a.md", 7, 1, 2)]
        {
            assert_eq!(
                atomic_temporary_name(file_name, process, nonce, sequence),
                app_names::atomic_temporary_name(file_name, process, nonce, sequence)
            );
        }
    }

    #[test]
    fn a_long_file_name_still_gets_a_name_the_disk_accepts_and_the_sweep_recognises() {
        for file_name in ["a".repeat(250), "\u{d55c}".repeat(80), "b".repeat(255)] {
            let name = next_atomic_temporary_name(&file_name);
            assert!(name.len() <= LONGEST_FILE_NAME_BYTES, "{}", name.len());
            assert!(app_names::is_atlas_temporary(&name), "{name}");
        }
        let short = next_atomic_temporary_name("note.md");
        assert!(short.starts_with(".note.md.oatlas-tmp-"), "{short}");
    }

    #[test]
    fn two_names_in_a_row_differ() {
        assert_ne!(
            next_atomic_temporary_name("a.md"),
            next_atomic_temporary_name("a.md")
        );
    }
}
