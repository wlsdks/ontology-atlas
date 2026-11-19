//! A vault on a FAT or exFAT volume, mounted from a disk image: there a same-size rewrite whose
//! modified time was put back leaves the whole stamp unchanged, so neither stored rows nor the
//! search index may answer from the stamp.
#![cfg(target_os = "macos")]
#![allow(clippy::unwrap_used, clippy::indexing_slicing, clippy::panic)]

mod common;

use common::{write_corpus, TempVault};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};
use vault_index::rows::{self, Found, NewRow};
use vault_index::{sync, Check, Progress, Searcher, Stamp};

const NS: &str = "test-entry/1";

/// A disk image formatted as `format`, attached without Finder at a scratch mount point.
struct Image {
    base: PathBuf,
    mount: PathBuf,
}

impl Image {
    fn attach(name: &str, format: &str) -> Image {
        let base =
            std::env::temp_dir().join(format!("vault-index-volume-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        let disk = base.join("disk.dmg");
        let mount = base.join("mount");
        let created = Command::new("hdiutil")
            .args(["create", "-quiet", "-size", "64m", "-fs", format])
            .args(["-volname", "VAULTTEST", "-o"])
            .arg(&disk)
            .status()
            .unwrap();
        assert!(created.success(), "hdiutil create -fs {format}");
        let attached = Command::new("hdiutil")
            .args([
                "attach",
                "-quiet",
                "-nobrowse",
                "-noautoopen",
                "-mountpoint",
            ])
            .arg(&mount)
            .arg(&disk)
            .status()
            .unwrap();
        assert!(attached.success(), "hdiutil attach {format}");
        Image { base, mount }
    }
}

impl Drop for Image {
    fn drop(&mut self) {
        let _ = Command::new("hdiutil")
            .args(["detach", "-quiet", "-force"])
            .arg(&self.mount)
            .status();
        let _ = std::fs::remove_dir_all(&self.base);
    }
}

fn set_modified(path: &Path, time: SystemTime) {
    std::fs::File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_modified(time)
        .unwrap();
}

/// Opens with rows and writes back what it read; returns how many values came from rows.
fn open_and_keep(root: &Path, files: &[String]) -> usize {
    let (found, _) = rows::lookup(root, NS, files).unwrap();
    let mut from_rows = 0;
    let mut misses = Vec::new();
    for (path, found) in files.iter().zip(found) {
        match found {
            Found::Hit(_) => from_rows += 1,
            Found::Miss(token) => {
                let metadata = std::fs::metadata(root.join(path)).unwrap();
                let modified = metadata.modified().unwrap();
                let since = modified.duration_since(SystemTime::UNIX_EPOCH).unwrap();
                misses.push(NewRow {
                    path: path.clone(),
                    token,
                    last_modified_ms: i64::try_from(since.as_millis()).unwrap(),
                    value: format!("{{\"bytes\":{}}}", metadata.len()),
                });
            }
        }
    }
    rows::put(root, NS, &misses, Some(files)).unwrap();
    from_rows
}

fn found(root: &Path, word: &str) -> Vec<String> {
    let searcher = Searcher::open(root).unwrap().unwrap();
    let found = searcher.search(word, 10).unwrap();
    found.hits.into_iter().map(|hit| hit.path).collect()
}

/// Writes a page, dates it a minute back, indexes it, then rewrites it to the same size and puts
/// the modified time back. Returns whether the stamp moved.
fn rewrite_behind_the_stamp(vault: &TempVault, files: &[String]) -> bool {
    let target = vault.root.join("wiki/page-0.md");
    let dated = SystemTime::now() - Duration::from_secs(60);
    std::fs::write(&target, "samesize alphaword").unwrap();
    set_modified(&target, dated);
    sync(
        &vault.root,
        files,
        &Progress::default(),
        Check::IfInterrupted,
    )
    .unwrap();
    assert_eq!(found(&vault.root, "alphaword"), ["wiki/page-0.md"]);
    let before = Stamp::of_regular_file(&target).unwrap();
    std::fs::write(&target, "samesize gammaword").unwrap();
    set_modified(&target, dated);
    Stamp::of_regular_file(&target).unwrap() != before
}

fn check_vault(vault: &TempVault, trusted: bool) {
    let files = write_corpus(&vault.root, 200, 11);
    let dated = SystemTime::now() - Duration::from_secs(120);
    for path in &files {
        set_modified(&vault.root.join(path), dated);
    }

    assert_eq!(open_and_keep(&vault.root, &files), 0);
    let reopened = open_and_keep(&vault.root, &files);
    let moved = rewrite_behind_the_stamp(vault, &files);
    if trusted {
        assert_eq!(
            reopened,
            files.len(),
            "rows are kept where stamps are trusted"
        );
        assert!(moved, "the change time moved");
    } else {
        assert_eq!(reopened, 0, "no value is ever answered from a row");
        assert!(!moved, "the rewrite left the whole stamp as it was");
    }

    assert!(
        found(&vault.root, "alphaword").is_empty(),
        "a search never shows the words the file no longer holds"
    );
    sync(
        &vault.root,
        &files,
        &Progress::default(),
        Check::IfInterrupted,
    )
    .unwrap();
    assert_eq!(found(&vault.root, "gammaword"), ["wiki/page-0.md"]);
    assert!(found(&vault.root, "alphaword").is_empty());
}

#[test]
fn a_vault_on_fat_or_exfat_never_answers_from_a_stamp() {
    for (name, format) in [("exfat", "ExFAT"), ("fat32", "MS-DOS FAT32")] {
        let image = Image::attach(name, format);
        let vault = TempVault::at(image.mount.join("vault"));
        check_vault(&vault, false);
    }
    // The same steps on the test folder's own volume (APFS), where rows are kept: what the
    // images refuse is the volume, not the steps.
    let vault = TempVault::new("volume-control");
    check_vault(&vault, true);
}
