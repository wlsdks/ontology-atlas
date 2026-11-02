use super::{open_root, resolve_image, Phase, PlanningRoot};
use std::fs;
use std::os::unix::fs::{symlink, MetadataExt};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture {
    base: PathBuf,
    root: PathBuf,
    outside: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = PathBuf::from(if cfg!(target_os = "macos") {
            "/private/tmp"
        } else {
            "/tmp"
        })
        .join(format!(
            "atlas-planning-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let root = base.join("root");
        let outside = base.join("outside");
        fs::create_dir_all(root.join("specs")).unwrap();
        fs::create_dir_all(root.join("images")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(root.join("specs/plan.md"), b"SAFE PLAN").unwrap();
        fs::write(root.join("images/mock.png"), b"SAFE IMAGE").unwrap();
        fs::write(outside.join("plan.md"), b"OUTSIDE SENTINEL").unwrap();
        fs::write(outside.join("mock.png"), b"OUTSIDE SENTINEL").unwrap();
        Self {
            base,
            root,
            outside,
        }
    }
    fn granted(&self) -> PlanningRoot {
        let dir = open_root(&self.root).unwrap();
        PlanningRoot::new(self.root.clone(), dir).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

#[test]
fn reads_selected_markdown_and_parent_relative_image_inside_root() {
    let f = Fixture::new();
    let grant = f.granted();
    assert_eq!(
        grant
            .read_with_hook(Path::new("specs/plan.md"), |_| {})
            .unwrap(),
        b"SAFE PLAN"
    );
    let image = resolve_image(Path::new("specs/plan.md"), Path::new("../images/mock.png")).unwrap();
    assert_eq!(image, Path::new("images/mock.png"));
    assert_eq!(grant.read_with_hook(&image, |_| {}).unwrap(), b"SAFE IMAGE");
    assert!(resolve_image(
        Path::new("specs/plan.md"),
        Path::new("../../outside/mock.png")
    )
    .is_err());
    assert!(resolve_image(Path::new("specs/plan.md"), Path::new("/etc/passwd")).is_err());
    assert!(resolve_image(Path::new("specs/plan.md"), Path::new("other.md")).is_err());
    assert!(resolve_image(Path::new("specs/plan.png"), Path::new("mock.png")).is_err());
}

#[test]
fn refuses_parent_symlink_and_leaf_symlink_before_open() {
    let f = Fixture::new();
    let grant = f.granted();
    fs::rename(f.root.join("specs"), f.root.join("specs-old")).unwrap();
    symlink(&f.outside, f.root.join("specs")).unwrap();
    assert_eq!(
        fs::read(f.root.join("specs/plan.md")).unwrap(),
        b"OUTSIDE SENTINEL"
    );
    assert!(grant
        .read_with_hook(Path::new("specs/plan.md"), |_| {})
        .is_err());
    fs::rename(
        f.root.join("images/mock.png"),
        f.root.join("images/mock-old.png"),
    )
    .unwrap();
    symlink(f.outside.join("mock.png"), f.root.join("images/mock.png")).unwrap();
    assert_eq!(
        fs::read(f.root.join("images/mock.png")).unwrap(),
        b"OUTSIDE SENTINEL"
    );
    assert!(grant
        .read_with_hook(Path::new("images/mock.png"), |_| {})
        .is_err());
}

#[test]
fn refuses_parent_replacement_after_parent_open_and_leaf_after_file_open() {
    let f = Fixture::new();
    let grant = f.granted();
    assert!(grant
        .read_with_hook(Path::new("specs/plan.md"), |phase| {
            if phase == Phase::ParentOpened {
                fs::rename(f.root.join("specs"), f.root.join("specs-old")).unwrap();
                symlink(&f.outside, f.root.join("specs")).unwrap();
            }
        })
        .is_err());
    assert!(grant
        .read_with_hook(Path::new("images/mock.png"), |phase| {
            if phase == Phase::LeafOpened {
                fs::rename(
                    f.root.join("images/mock.png"),
                    f.root.join("images/mock-old.png"),
                )
                .unwrap();
                symlink(f.outside.join("mock.png"), f.root.join("images/mock.png")).unwrap();
            }
        })
        .is_err());
}

#[test]
fn refuses_replaced_root_before_and_during_read() {
    let f = Fixture::new();
    let grant = f.granted();
    assert!(grant
        .read_with_hook(Path::new("specs/plan.md"), |phase| {
            if phase == Phase::LeafOpened {
                fs::rename(&f.root, f.base.join("old-root")).unwrap();
                symlink(&f.outside, &f.root).unwrap();
            }
        })
        .is_err());
    assert!(grant
        .read_with_hook(Path::new("specs/plan.md"), |_| {})
        .is_err());
}

#[test]
fn refuses_known_hardlinks_and_disallowed_secret_names() {
    let f = Fixture::new();
    let grant = f.granted();
    fs::remove_file(f.root.join("specs/plan.md")).unwrap();
    fs::hard_link(f.outside.join("plan.md"), f.root.join("specs/plan.md")).unwrap();
    assert!(fs::metadata(f.root.join("specs/plan.md")).unwrap().nlink() > 1);
    assert!(grant
        .read_with_hook(Path::new("specs/plan.md"), |_| {})
        .is_err());
    fs::write(f.root.join("password.md"), b"SENTINEL").unwrap();
    assert!(grant
        .read_with_hook(Path::new("password.md"), |_| {})
        .is_err());
}

#[test]
fn refuses_untrusted_root_replaced_between_descriptor_and_grant() {
    let f = Fixture::new();
    let root = open_root(&f.root).unwrap();
    fs::rename(&f.root, f.base.join("old-root")).unwrap();
    fs::create_dir(&f.root).unwrap();
    assert!(PlanningRoot::new(f.root.clone(), root).is_err());
}

#[test]
fn refuses_excluded_selected_root_and_excluded_ancestor() {
    let f = Fixture::new();
    for relative in [".secrets", "node_modules/hidden"] {
        let path = f.base.join(relative);
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("plan.md"), b"DO NOT READ").unwrap();
        assert!(
            PlanningRoot::new(path.clone(), open_root(&path).unwrap()).is_err(),
            "{relative}"
        );
    }
}

#[cfg(target_os = "macos")]
#[test]
fn refuses_real_system_root_and_its_system_subdirectory_without_reading_contents() {
    for path in ["/System", "/System/Library"] {
        let path = Path::new(path);
        let opened = open_root(path).unwrap();
        assert!(
            PlanningRoot::new(path.to_owned(), opened).is_err(),
            "{path:?}"
        );
    }
}

#[cfg(target_os = "macos")]
#[test]
fn project_and_volume_paths_are_not_mistaken_for_system_descendants() {
    use super::excluded_system_path;
    let home = std::fs::canonicalize(std::env::var_os("HOME").unwrap()).unwrap();
    for path in [
        home.join("project/docs"),
        PathBuf::from("/Users/another/project"),
        PathBuf::from("/Volumes/Fixture/project"),
        PathBuf::from("/private/tmp/project"),
    ] {
        assert!(!excluded_system_path(&path), "{path:?}");
        assert!(crate::vault_root_rejection(&path).is_none(), "{path:?}");
    }
    for path in [
        home.join("Library/Application Support"),
        PathBuf::from("/System/Library"),
        PathBuf::from("/usr/lib"),
    ] {
        assert!(excluded_system_path(&path), "{path:?}");
    }
    for path in ["/", "/Users", "/Volumes", "/private"] {
        assert!(
            crate::vault_root_rejection(Path::new(path)).is_some(),
            "{path}"
        );
    }
}
