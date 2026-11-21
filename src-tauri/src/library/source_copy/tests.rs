use super::*;
use crate::library::file_hashing::hash_path;
#[cfg(unix)]
use crate::library::fixture_folder::fixture_with_vault;
use crate::library::import_destination::SOURCES_DIR;
use std::fs;

// Asserts what this build compiled: either writer must land bytes inside the
// sources folder and nowhere else.
#[test]
fn the_platform_writer_lands_inside_sources_and_nowhere_else() {
    let root = std::env::temp_dir().join(format!("atlas-lib-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join(SOURCES_DIR)).unwrap();
    let root_path = fs::canonicalize(&root)
        .unwrap()
        .to_string_lossy()
        .to_string();

    let (hash, length, name) = copy_source_into(
        &root_path,
        "sources",
        std::iter::once("plan.pdf".to_string()),
        &mut &b"%PDF-1.7\n"[..],
    )
    .unwrap()
    .unwrap();
    assert_eq!(name, "plan.pdf");
    assert_eq!(
        fs::read(root.join("sources/plan.pdf")).unwrap(),
        b"%PDF-1.7\n".to_vec()
    );
    assert_eq!(length, 9);
    assert_eq!(hash, hash_path(&root.join("sources/plan.pdf")).unwrap());

    assert!(copy_source_into(
        &root_path,
        "..",
        std::iter::once("escaped.pdf".to_string()),
        &mut &b"x"[..]
    )
    .is_err());

    let _ = fs::remove_dir_all(&root);
}

/// Publishing links under a free name; a name taken after the check is passed over, never replaced.
#[cfg(unix)]
#[test]
fn publishing_passes_over_a_name_taken_since_the_check_and_a_failed_fill_leaves_it_alone() {
    use std::io::Write;
    let (fixture, _vault) = fixture_with_vault("no-replace");
    let folder = fixture.join("folder");
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("a.md"), b"kept").unwrap();
    let parent = fs::File::open(&folder).unwrap();
    let names = ["a.md", "a (2).md"].map(|name| std::ffi::CString::new(name).unwrap());

    let published =
        crate::agent_setup::create_first_free_entry_with(&parent, names.clone(), 0o666, |file| {
            file.write_all(b"new")
        })
        .unwrap();
    assert_eq!(published.unwrap().1.to_str().unwrap(), "a (2).md");
    assert_eq!(fs::read(folder.join("a.md")).unwrap(), b"kept");

    let refused = crate::agent_setup::create_first_free_entry_with(&parent, names, 0o666, |_| {
        Err::<(), _>(std::io::Error::other("disk full"))
    });
    assert!(refused.is_err());
    assert_eq!(fs::read(folder.join("a.md")).unwrap(), b"kept");
    let mut left: Vec<String> = fs::read_dir(&folder)
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    left.sort();
    assert_eq!(left, vec!["a (2).md", "a.md"]);
    fs::remove_dir_all(fixture).unwrap();
}
