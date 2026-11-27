//! No generated slug or scan root escapes. The vault under test holds the traps a hostile
//! slug can use: a folder link out, a file link out, a dangling link out, a link loop, a link back
//! to the raw-source folder, and an `outside` folder beside it whose contents must never change.

#![cfg_attr(windows, allow(dead_code, unused_imports))]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use confined_files::{write_atomically, AtomicWrite, ScanRoots, VaultRoot, VAULT_SOURCES_DIR};
use proptest::prelude::*;

struct Fixture {
    _directory: tempfile::TempDir,
    root: VaultRoot,
    real_root: PathBuf,
    outside: PathBuf,
    outside_before: BTreeMap<String, String>,
}

fn contents_of(folder: &Path) -> BTreeMap<String, String> {
    let mut found = BTreeMap::new();
    for entry in walk(folder) {
        let text = fs::read_to_string(&entry).unwrap_or_default();
        found.insert(entry.display().to_string(), text);
    }
    found
}

fn walk(folder: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut stack = vec![folder.to_path_buf()];
    while let Some(next) = stack.pop() {
        let Ok(listing) = fs::read_dir(&next) else {
            continue;
        };
        for entry in listing.filter_map(Result::ok) {
            let path = entry.path();
            let kind = entry.file_type().expect("type");
            if kind.is_dir() {
                stack.push(path);
            } else {
                files.push(path);
            }
        }
    }
    files.sort();
    files
}

#[cfg(unix)]
fn fixture() -> &'static Fixture {
    use std::os::unix::fs::symlink;
    static FIXTURE: OnceLock<Fixture> = OnceLock::new();
    FIXTURE.get_or_init(|| {
        let directory = tempfile::tempdir().expect("temp dir");
        let base = dunce::canonicalize(directory.path()).expect("real");
        let vault = base.join("vault");
        let outside = base.join("outside");
        fs::create_dir_all(vault.join("sources")).expect("sources");
        fs::create_dir_all(vault.join("domains")).expect("domains");
        fs::create_dir_all(&outside).expect("outside");
        fs::write(outside.join("secret.md"), "outside secret").expect("secret");
        fs::write(vault.join("sources/page.md"), "raw").expect("page");
        fs::write(vault.join("domains/auth.md"), "node").expect("auth");
        symlink(&outside, vault.join("linked")).expect("folder link");
        symlink(outside.join("secret.md"), vault.join("linked-file.md")).expect("file link");
        symlink(outside.join("never-created.md"), vault.join("dangling.md")).expect("dangling");
        symlink(vault.join("loop"), vault.join("loop")).expect("loop");
        symlink(vault.join("sources"), vault.join("alias")).expect("alias");
        symlink("../outside", vault.join("domains/up")).expect("relative link out");
        let root = VaultRoot::open(&vault).expect("vault");
        Fixture {
            _directory: directory,
            root,
            real_root: vault,
            outside_before: contents_of(&outside),
            outside,
        }
    })
}

fn piece() -> impl Strategy<Value = &'static str> {
    prop::sample::select(vec![
        "..",
        ".",
        "a",
        "domains",
        "auth",
        "linked",
        "linked-file",
        "dangling",
        "loop",
        "alias",
        "up",
        "sources",
        "SOURCES",
        "Sources",
        "\u{17f}ources",
        "x",
        "~1",
        "PROGRA~1",
        ".hidden",
        ".git",
        "AGENTS",
        "claude",
        "README",
        "\0",
        "\u{202e}",
        "\u{200b}",
        "C:",
        "D:notes",
        "\\\\?\\C:",
        "\\\\server\\share",
        "\\",
        "..\\..",
        "%2e%2e",
        "\u{d55c}\u{ae00}",
        "\u{1112}\u{1161}\u{11ab}",
        "\n",
        "\t",
        " ",
        "outside",
        "secret",
    ])
}

fn separator() -> impl Strategy<Value = &'static str> {
    prop::sample::select(vec!["/", "/", "/", "", "//", "\\", "/./"])
}

fn slug() -> impl Strategy<Value = String> {
    (
        prop::bool::weighted(0.15),
        prop::collection::vec((piece(), separator()), 1..7),
    )
        .prop_map(|(absolute, parts)| {
            let mut text = String::new();
            if absolute {
                text.push('/');
            }
            for (part, join) in parts {
                text.push_str(part);
                text.push_str(join);
            }
            text
        })
}

/// The nearest existing ancestor's real path, with the missing tail put back: where a write
/// would land.
fn where_it_lands(path: &Path) -> PathBuf {
    let mut missing: Vec<std::ffi::OsString> = Vec::new();
    let mut probe = path.to_path_buf();
    loop {
        if let Ok(mut real) = dunce::canonicalize(&probe) {
            real.extend(missing.iter().rev());
            return real;
        }
        match (probe.file_name().map(ToOwned::to_owned), probe.parent()) {
            (Some(name), Some(parent)) => {
                missing.push(name);
                probe = parent.to_path_buf();
            }
            _ => return path.to_path_buf(),
        }
    }
}

#[cfg(unix)]
proptest! {
    #![proptest_config(ProptestConfig {
        cases: 3000,
        failure_persistence: None,
        ..ProptestConfig::default()
    })]

    /// A slug that is accepted names a path whose real location is inside the vault, whichever
    /// way it was spelled; everything else is refused.
    #[test]
    fn an_accepted_read_slug_never_lands_outside_the_vault(slug in slug()) {
        let fixture = fixture();
        if let Ok(path) = fixture.root.read_path(&slug) {
            prop_assert!(path.as_path().starts_with(fixture.root.path()), "{}", path.display());
            let landed = where_it_lands(path.as_path());
            prop_assert!(landed.starts_with(&fixture.real_root), "{slug:?} lands at {}", landed.display());
            prop_assert!(!landed.starts_with(&fixture.outside));
            // The raw-source folder is never a node, however it is reached.
            let real_sources = fixture.real_root.join(VAULT_SOURCES_DIR);
            let below_sources = landed.strip_prefix(&real_sources).is_ok_and(|rest| rest.components().count() > 0);
            prop_assert!(!below_sources, "{slug:?} reached sources/ at {}", landed.display());
        }
    }

    /// A write through an accepted slug creates or replaces one file inside the vault and
    /// changes nothing outside it.
    #[test]
    fn a_write_through_any_accepted_slug_touches_nothing_outside_the_vault(slug in slug()) {
        let fixture = fixture();
        if let Ok(path) = fixture.root.write_path(&slug) {
            let landed = where_it_lands(path.as_path());
            prop_assert!(landed.starts_with(&fixture.real_root), "{slug:?} lands at {}", landed.display());
            // The folder may not exist: the write then fails, which is also safe.
            let _ = write_atomically(&path, "planted", &AtomicWrite::default());
        }
        prop_assert_eq!(&contents_of(&fixture.outside), &fixture.outside_before);
    }

    /// A scan root is allowed only inside the vault or its repository (here the same folder).
    #[test]
    fn an_allowed_scan_root_is_inside_the_vault_as_a_real_path(slug in slug()) {
        let fixture = fixture();
        let roots = ScanRoots::new(fixture.real_root.clone(), fixture.real_root.clone());
        let target = fixture.real_root.join(&slug);
        if let Ok(allowed) = roots.allow(&target, "rootPath") {
            let real = dunce::canonicalize(allowed.as_path()).unwrap_or_else(|_| allowed.as_path().to_path_buf());
            prop_assert!(real.starts_with(&fixture.real_root), "{slug:?} allowed at {}", real.display());
        }
        // The same words as an absolute target: only a path inside can be allowed.
        if let Ok(allowed) = roots.allow(Path::new(&slug), "rootPath") {
            prop_assert!(allowed.as_path().starts_with(&fixture.real_root));
        }
    }

    /// Folding is lexical and total: the result is absolute, has no `..` or `.` part, and no
    /// climbing from an absolute path leaves its root.
    #[test]
    fn resolving_a_path_folds_every_dot_and_never_climbs_above_the_root(slug in slug()) {
        let base = Path::new("/vault");
        let resolved = confined_files::resolve_path(base, Path::new(&slug));
        prop_assert!(resolved.is_absolute());
        prop_assert!(resolved.components().all(|part| !matches!(part, std::path::Component::ParentDir | std::path::Component::CurDir)));
        prop_assert_eq!(&confined_files::resolve_path(base, &resolved), &resolved);
    }
}

/// On a case-folding disk (the macOS and Windows default) `SOURCES/page` opens the raw source
/// folder, and so does a letter that folds to `s`; a case-sensitive disk has no such folder.
#[cfg(unix)]
#[test]
fn a_case_folded_spelling_of_the_raw_source_folder_is_refused_where_the_disk_folds_it() {
    let fixture = fixture();
    let folds = fixture.real_root.join("SOURCES").exists();
    for spelling in ["SOURCES/page", "Sources/page", "sources/page", "alias/page"] {
        let reachable = fixture.real_root.join(format!("{spelling}.md")).exists();
        let refused = fixture.root.read_path(spelling).is_err();
        if spelling == "sources/page" || spelling == "alias/page" || folds {
            assert!(
                refused,
                "{spelling} reaches the raw source folder and must be refused"
            );
        } else {
            assert!(!reachable, "{spelling}");
        }
    }
}

#[cfg(unix)]
#[test]
fn a_link_loop_is_refused_not_followed_forever() {
    let fixture = fixture();
    assert!(
        fixture.root.read_path("loop/x").is_err() || !fixture.real_root.join("loop/x.md").exists()
    );
    // Writing through the loop never creates anything.
    if let Ok(path) = fixture.root.write_path("loop/x") {
        assert!(write_atomically(&path, "x", &AtomicWrite::default()).is_err());
    }
    assert_eq!(contents_of(&fixture.outside), fixture.outside_before);
}

/// UNC, verbatim and drive-relative spellings exist only on Windows, so these run on the Windows
/// jobs: each must come out as a path outside the vault, so it is refused.
#[cfg(windows)]
mod windows_spellings {
    use super::*;

    fn vault() -> (tempfile::TempDir, VaultRoot) {
        let directory = tempfile::tempdir().expect("temp dir");
        let root =
            VaultRoot::open(&dunce::canonicalize(directory.path()).expect("real")).expect("vault");
        (directory, root)
    }

    #[test]
    fn drive_unc_verbatim_and_drive_relative_slugs_are_outside_the_vault() {
        let (_directory, root) = vault();
        for slug in [
            "C:\\Windows\\win",
            "C:/Windows/win",
            "\\\\server\\share\\x",
            "//server/share/x",
            "\\\\?\\C:\\Windows\\win",
            "\\\\?\\UNC\\server\\share\\x",
            "\\\\.\\C:\\x",
            "D:notes",
            "d:..\\..\\x",
            "..\\..\\x",
            "..\\outside\\x",
            "\\x",
        ] {
            let refused = root.read_path(slug).expect_err(slug);
            assert!(
                refused
                    .to_string()
                    .starts_with("slug points outside the vault root:"),
                "{slug}: {refused}"
            );
        }
    }

    #[test]
    fn a_backslash_and_a_forward_slash_climb_alike_and_a_case_variant_of_the_root_is_the_root() {
        let (_directory, root) = vault();
        assert!(root.read_path("a\\..\\..\\x").is_err());
        assert!(root.read_path("a/../../x").is_err());
        assert!(root.read_path("domains\\auth").is_ok());
        let upper = root.path().to_string_lossy().to_uppercase();
        let shouted = VaultRoot::open(Path::new(&upper)).expect("same folder");
        assert!(shouted.read_path("domains/auth").is_ok());
    }

    #[test]
    fn a_short_name_is_never_named_by_a_write() {
        let (_directory, root) = vault();
        assert!(root.write_path("docs/PROGRA~1").is_err());
    }
}
