#![cfg(unix)]

use crate::library::dropped;
use crate::library::fixture_folder::{
    fixture_with_vault, import_offered, plant_file, take_drop_turn,
};
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(unix)]
fn files_under(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(directory) = stack.pop() {
        for entry in fs::read_dir(&directory).into_iter().flatten().flatten() {
            let path = entry.path();
            if entry.file_type().unwrap().is_dir() {
                stack.push(path);
            } else {
                found.push(path);
            }
        }
    }
    found
}

/// A `git pull` may turn an offered file into a link to a key between the offer and the copy.
#[cfg(unix)]
#[test]
fn an_offered_file_swapped_for_a_link_to_a_secret_copies_nothing() {
    let _turn = take_drop_turn();
    let (fixture, vault) = fixture_with_vault("swap-link");
    let secret = fixture.join("home/.ssh/id_ed25519");
    plant_file(&secret, 400);
    let dropped = fixture.join("docs");
    let spec = dropped.join("spec.pdf");
    plant_file(&spec, 400);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    assert_eq!(offer.files.len(), 1);

    fs::remove_file(&spec).unwrap();
    std::os::unix::fs::symlink(&secret, &spec).unwrap();
    let results = import_offered(&vault, vec![offer.files[0].path.clone()]);
    assert_eq!(
        results[0].reason.as_deref(),
        Some("source-changed-since-offered")
    );
    let secret_bytes = fs::read(&secret).unwrap();
    for landed in files_under(&PathBuf::from(&vault)) {
        assert_ne!(fs::read(&landed).unwrap(), secret_bytes, "{landed:?}");
    }
    fs::remove_dir_all(fixture).unwrap();
}

/// A parent folder swapped for a link reaches another file, whose identity differs.
#[cfg(unix)]
#[test]
fn an_offered_files_folder_swapped_for_a_link_copies_nothing() {
    let _turn = take_drop_turn();
    let (fixture, vault) = fixture_with_vault("swap-parent");
    let planted = fixture.join("home/.ssh/spec.pdf");
    plant_file(&planted, 400);
    let dropped = fixture.join("docs");
    plant_file(&dropped.join("inner/spec.pdf"), 400);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    assert_eq!(offer.files.len(), 1);

    fs::remove_dir_all(dropped.join("inner")).unwrap();
    std::os::unix::fs::symlink(planted.parent().unwrap(), dropped.join("inner")).unwrap();
    let results = import_offered(&vault, vec![offer.files[0].path.clone()]);
    assert_eq!(
        results[0].reason.as_deref(),
        Some("source-changed-since-offered")
    );
    assert!(files_under(&PathBuf::from(&vault)).is_empty());
    fs::remove_dir_all(fixture).unwrap();
}

#[cfg(unix)]
fn make_fifo(path: &Path) {
    use std::os::unix::ffi::OsStrExt;
    let name = std::ffi::CString::new(path.as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
}

/// Opening a FIFO for reading waits for a writer forever; neither a drop nor a copy may.
#[cfg(unix)]
#[test]
fn a_fifo_is_never_offered_and_one_swapped_in_never_hangs_the_copy() {
    let _turn = take_drop_turn();
    let (fixture, vault) = fixture_with_vault("fifo");
    let pipe = fixture.join("pipe.pdf");
    make_fifo(&pipe);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&pipe));
    assert!(offer.files.is_empty());
    assert_eq!(offer.skipped_counts.not_document, 1);

    let spec = fixture.join("spec.pdf");
    plant_file(&spec, 400);
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&spec));
    fs::remove_file(&spec).unwrap();
    make_fifo(&spec);
    let results = import_offered(&vault, vec![offer.files[0].path.clone()]);
    assert_eq!(
        results[0].reason.as_deref(),
        Some("source-changed-since-offered")
    );
    fs::remove_dir_all(fixture).unwrap();
}
