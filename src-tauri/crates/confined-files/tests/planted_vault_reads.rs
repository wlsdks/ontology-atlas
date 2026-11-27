//! Planted hostile vaults, mirroring `tests/contract/security/vault-integrity-guards.contract.test.ts`
//! and the slug cases of the document suites: a linked slug, a link target that must not be
//! touched, links the walk must not list, and the order and spelling a slug is listed in.

#![cfg(unix)]

use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};

use confined_files::{write_atomically, AtomicWrite, SlugError, VaultRoot, VAULT_SOURCES_DIR};

struct Planted {
    _directory: tempfile::TempDir,
    base: PathBuf,
    root: VaultRoot,
}

fn planted() -> Planted {
    let directory = tempfile::tempdir().expect("temp dir");
    let base = dunce::canonicalize(directory.path()).expect("real");
    let vault = base.join("vault");
    fs::create_dir_all(&vault).expect("vault");
    Planted {
        root: VaultRoot::open(&vault).expect("vault"),
        base,
        _directory: directory,
    }
}

fn slugs(root: &VaultRoot) -> Vec<String> {
    root.markdown_files()
        .iter()
        .filter_map(|file| root.slug_of(file))
        .collect()
}

#[test]
fn a_linked_slug_is_refused_and_a_normal_one_resolves() {
    let planted = planted();
    let outside = planted.base.join("outside.md");
    fs::write(&outside, "---\nkind: domain\n---\nsecret").expect("outside");
    symlink(&outside, planted.root.path().join("linked.md")).expect("link");
    fs::write(
        planted.root.path().join("normal.md"),
        "---\nkind: domain\n---\n",
    )
    .expect("normal");
    let refused = planted.root.read_path("linked").expect_err("a link out");
    assert!(
        matches!(refused, SlugError::OutsideRootThroughLink { .. }),
        "{refused}"
    );
    assert_eq!(
        planted.root.read_path("normal").expect("normal").as_path(),
        planted.root.path().join("normal.md")
    );
}

#[test]
fn a_write_never_touches_a_link_target() {
    let planted = planted();
    let outside = planted.base.join("outside.md");
    fs::write(&outside, "untouched").expect("outside");
    symlink(&outside, planted.root.path().join("linked.md")).expect("link");
    assert!(planted.root.write_path("linked").is_err());
    // Even a path that skipped the slug rules (the atomic write renames over the name, never
    // writes through it) leaves the target as it was.
    let confined = planted.root.read_path("domains/new").expect("new file");
    fs::create_dir_all(planted.root.path().join("domains")).expect("domains");
    let writable = planted.root.writable(&confined).expect("writable");
    write_atomically(&writable, "x", &AtomicWrite::default()).expect("write");
    assert_eq!(fs::read_to_string(&outside).expect("outside"), "untouched");
}

#[test]
fn the_walk_lists_real_files_only_and_skips_links_dot_names_and_build_folders() {
    let planted = planted();
    let vault = planted.root.path().to_path_buf();
    let outside = planted.base.join("outside");
    fs::create_dir_all(&outside).expect("outside");
    fs::write(outside.join("leak.md"), "x").expect("leak");
    for folder in [
        "domains",
        "node_modules/pkg",
        ".git",
        ".hidden",
        "build",
        "dist",
        "out",
        ".next",
        ".serena",
        VAULT_SOURCES_DIR,
        "docs/sources",
    ] {
        fs::create_dir_all(vault.join(folder)).expect("folder");
        fs::write(vault.join(folder).join("n.md"), "x").expect("file");
    }
    fs::write(vault.join("domains/real.md"), "x").expect("real");
    fs::write(vault.join(".dotfile.md"), "x").expect("dot");
    fs::write(vault.join("domains/readme.txt"), "x").expect("txt");
    fs::create_dir_all(vault.join("domains/folder.md")).expect("a folder named like a file");
    symlink(outside.join("leak.md"), vault.join("domains/link.md")).expect("file link");
    symlink(&outside, vault.join("linked-folder")).expect("folder link");
    assert_eq!(
        slugs(&planted.root),
        ["docs/sources/n", "domains/n", "domains/real"],
        "`sources/` is skipped only at the vault's root"
    );
}

#[test]
fn the_order_is_by_utf16_code_unit_of_the_whole_path_not_part_by_part() {
    let planted = planted();
    let vault = planted.root.path();
    fs::create_dir_all(vault.join("a")).expect("a");
    for name in [
        "a/b.md",
        "a b.md",
        "a-b.md",
        "a.md",
        "\u{ff5e}.md",
        "\u{1f600}.md",
        "Z.md",
        "y.md",
    ] {
        fs::write(vault.join(name), "x").expect("file");
    }
    let listed = slugs(&planted.root);
    // `a-b` (0x2D) < `a.md` (0x2E) < `a/b` (0x2F), and a space (0x20) sorts before all of them; an
    // astral character sorts among the surrogates, before U+FF5E.
    assert_eq!(
        listed,
        ["Z", "a b", "a-b", "a", "a/b", "y", "\u{1f600}", "\u{ff5e}"]
    );
}

#[test]
fn a_slug_made_from_an_nfd_file_name_is_nfc_and_the_disk_path_stays_as_it_is() {
    let planted = planted();
    let decomposed = "\u{1112}\u{1161}\u{11ab}\u{1100}\u{1173}\u{11af}";
    fs::write(planted.root.path().join(format!("{decomposed}.md")), "x").expect("file");
    let files = planted.root.markdown_files();
    assert_eq!(files.len(), 1);
    assert_eq!(
        planted.root.slug_of(&files[0]).as_deref(),
        Some("\u{d55c}\u{ae00}")
    );
    assert!(files[0].as_path().to_string_lossy().contains(decomposed));
}

#[test]
fn a_dotfile_and_a_link_inside_the_vault_that_stays_inside_are_still_not_confined_by_name_alone() {
    let planted = planted();
    fs::create_dir_all(planted.root.path().join("real")).expect("real");
    fs::write(planted.root.path().join("real/a.md"), "x").expect("a");
    symlink(
        planted.root.path().join("real"),
        planted.root.path().join("shortcut"),
    )
    .expect("link");
    // A link that stays inside the vault is allowed to be read through; it only fails when it
    // leaves, or lands on a name a write tool never names.
    assert!(planted.root.read_path("shortcut/a").is_ok());
    assert!(planted.root.write_path("shortcut/a").is_ok());
    assert_eq!(slugs(&planted.root), ["real/a"]);
}

#[test]
fn a_missing_or_file_vault_root_is_refused_in_the_servers_words() {
    let planted = planted();
    let missing = planted.base.join("nowhere");
    assert_eq!(
        VaultRoot::open(&missing).expect_err("missing").to_string(),
        format!("Vault root not found: {}", missing.display())
    );
    let file = planted.base.join("a-file");
    fs::write(&file, "x").expect("file");
    assert_eq!(
        VaultRoot::open(&file).expect_err("file").to_string(),
        format!("Vault root is not a directory: {}", file.display())
    );
    // A link to a folder is followed, as a person who linked their vault folder expects.
    let linked = planted.base.join("linked-vault");
    symlink(planted.root.path(), &linked).expect("link");
    assert!(VaultRoot::open(Path::new(&linked)).is_ok());
}
