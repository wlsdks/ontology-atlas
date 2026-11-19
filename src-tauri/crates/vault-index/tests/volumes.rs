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

/// A disk image formatted as `format`, attached without Finder at `mount`, or a scratch folder.
struct Image {
    base: PathBuf,
    mount: PathBuf,
}

impl Image {
    fn attach(name: &str, format: &str, mount: Option<PathBuf>) -> Image {
        let base =
            std::env::temp_dir().join(format!("vault-index-image-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        let disk = base.join("disk.dmg");
        let mount = mount.unwrap_or_else(|| base.join("mount"));
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

/// Opens with rows and writes back what it read; returns the paths answered from rows.
fn open_and_keep(root: &Path, files: &[String]) -> Vec<String> {
    let (found, _) = rows::lookup(root, NS, files).unwrap();
    let mut from_rows = Vec::new();
    let mut misses = Vec::new();
    for (path, found) in files.iter().zip(found) {
        match found {
            Found::Hit(_) => from_rows.push(path.clone()),
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

fn index(vault: &TempVault, files: &[String]) {
    sync(
        &vault.root,
        files,
        &Progress::default(),
        Check::IfInterrupted,
    )
    .unwrap();
}

/// Writes `target`, dates it a minute back, indexes it, then rewrites it to the same size and puts
/// the modified time back. Returns whether the stamp moved.
fn rewrite_behind_the_stamp(vault: &TempVault, files: &[String], target: &str) -> bool {
    let path = vault.root.join(target);
    let dated = SystemTime::now() - Duration::from_secs(60);
    std::fs::write(&path, "samesize alphaword").unwrap();
    set_modified(&path, dated);
    index(vault, files);
    assert_eq!(found(&vault.root, "alphaword"), [target]);
    let before = Stamp::of_regular_file(&path).unwrap();
    std::fs::write(&path, "samesize gammaword").unwrap();
    set_modified(&path, dated);
    Stamp::of_regular_file(&path).unwrap() != before
}

/// `unvouched`: the listed files no row may answer for, `target` among them or not.
fn check_vault(vault: &TempVault, files: &[String], target: &str, unvouched: &[String]) {
    let dated = SystemTime::now() - Duration::from_secs(120);
    for path in files {
        set_modified(&vault.root.join(path), dated);
    }

    assert!(open_and_keep(&vault.root, files).is_empty());
    let served = open_and_keep(&vault.root, files);
    assert_eq!(
        served.len(),
        files.len() - unvouched.len(),
        "rows are kept for every other file"
    );
    for path in &served {
        assert!(
            !unvouched.iter().any(|other| other == path),
            "served from a row: {path}"
        );
    }
    let moved = rewrite_behind_the_stamp(vault, files, target);
    if unvouched.iter().any(|path| path == target) {
        assert!(!moved, "the rewrite left the whole stamp as it was");
    } else {
        assert!(moved, "the change time moved");
    }

    assert!(
        found(&vault.root, "alphaword").is_empty(),
        "a search never shows the words the file no longer holds"
    );
    index(vault, files);
    assert_eq!(found(&vault.root, "gammaword"), [target]);
    assert!(found(&vault.root, "alphaword").is_empty());
}

#[test]
fn a_vault_on_fat_or_exfat_never_answers_from_a_stamp() {
    for (name, format) in [("exfat", "ExFAT"), ("fat32", "MS-DOS FAT32")] {
        let image = Image::attach(name, format, None);
        let vault = TempVault::at(image.mount.join("vault"));
        let files = write_corpus(&vault.root, 200, 11);
        check_vault(&vault, &files, "wiki/page-0.md", &files);
    }
    // The same steps on the test folder's own volume (APFS), where rows are kept: what the
    // images refuse is the volume, not the steps.
    let vault = TempVault::new("volume-control");
    let files = write_corpus(&vault.root, 200, 11);
    check_vault(&vault, &files, "wiki/page-0.md", &[]);
}

#[test]
fn an_exfat_volume_mounted_inside_a_vault_is_never_answered_from_a_stamp() {
    let vault = TempVault::new("volume-nested");
    let mut files = write_corpus(&vault.root, 200, 11);
    // Dropped before the vault, so the vault's folder is removed after the volume is detached.
    let _image = Image::attach("inside-vault", "ExFAT", Some(vault.root.join("usb")));
    let usb: Vec<String> = write_corpus(&vault.root.join("usb"), 20, 3)
        .into_iter()
        .map(|path| format!("usb/{path}"))
        .collect();
    files.extend(usb.iter().cloned());
    check_vault(&vault, &files, "usb/wiki/page-0.md", &usb);
}
