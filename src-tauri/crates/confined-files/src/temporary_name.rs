//! The name a file has while it is being written. It is the app's atomic-write shape,
//! `.<name>.oatlas-tmp-<pid>-<hex>-<hex>`, so the vault-open sweep that clears debris after a
//! crash recognises it, and a Markdown walk never lists it (it starts with a dot).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const TEMPORARY_MARKER: &str = ".oatlas-tmp-";

pub(crate) fn atomic_temporary_name(
    file_name: &str,
    process: u32,
    nonce: u128,
    sequence: u64,
) -> String {
    format!(".{file_name}{TEMPORARY_MARKER}{process}-{nonce:x}-{sequence:x}")
}

/// A fresh name for a file called `file_name`: this process, the clock, a counter. Two writers in
/// one process or two processes never pick one, and `create_new` refuses the rare tie.
pub(crate) fn next_atomic_temporary_name(file_name: &str) -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    atomic_temporary_name(
        file_name,
        std::process::id(),
        nonce,
        SEQUENCE.fetch_add(1, Ordering::Relaxed),
    )
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
    fn two_names_in_a_row_differ() {
        assert_ne!(
            next_atomic_temporary_name("a.md"),
            next_atomic_temporary_name("a.md")
        );
    }
}
