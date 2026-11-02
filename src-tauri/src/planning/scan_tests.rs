use super::super::confined::{open_root, PlanningRoot};
use super::{scan_with_hook, ScanPhase};
use std::os::unix::fs::symlink;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
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
            "atlas-planning-scan-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let root = base.join("root");
        let outside = base.join("outside");
        fs::create_dir_all(root.join("specs")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(root.join("specs/plan.md"), b"plan").unwrap();
        fs::write(root.join("specs/mock.png"), b"image").unwrap();
        fs::write(root.join("specs/password.md"), b"SECRET").unwrap();
        fs::write(outside.join("outside.md"), b"OUTSIDE").unwrap();
        fs::hard_link(outside.join("outside.md"), root.join("specs/linked.md")).unwrap();
        symlink(&outside, root.join("jump")).unwrap();
        Self {
            base,
            root,
            outside,
        }
    }
    fn grant(&self) -> PlanningRoot {
        PlanningRoot::new(self.root.clone(), open_root(&self.root).unwrap()).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

#[test]
fn lists_regular_supported_files_and_counts_exclusions_without_names() {
    let f = Fixture::new();
    let report = scan_with_hook(&f.grant(), 100, |_| {}).unwrap();
    let paths: Vec<_> = report
        .files
        .iter()
        .map(|x| x.path.to_string_lossy().to_string())
        .collect();
    assert_eq!(paths, vec!["specs/mock.png", "specs/plan.md"]);
    assert!(report.skipped >= 3);
    assert!(!report.partial);
    let printed = format!("{report:?}");
    assert!(!printed.contains("password"));
    assert!(!printed.contains("linked.md"));
    assert!(!printed.contains("outside.md"));
}

#[test]
fn app_bundles_are_not_traversed_or_directly_read() {
    use std::path::Path;
    let f = Fixture::new();
    let bundle = f.root.join("Example.app");
    fs::create_dir_all(&bundle).unwrap();
    fs::write(bundle.join("internal.md"), b"OUTSIDE THE DOCUMENT SCOPE").unwrap();
    let grant = f.grant();
    let report = scan_with_hook(&grant, 100, |_| {}).unwrap();
    assert!(report.omitted.excluded > 0);
    assert!(!format!("{report:?}").contains("Example.app"));
    assert!(grant
        .read_with_hook(Path::new("Example.app/internal.md"), |_| {})
        .is_err());
}

#[test]
fn budget_is_explicitly_partial() {
    let f = Fixture::new();
    let report = scan_with_hook(&f.grant(), 1, |_| {}).unwrap();
    assert!(report.partial);
}

#[test]
fn recursive_budget_cannot_be_exceeded_by_buffered_parent_entries() {
    let f = Fixture::new();
    fs::remove_file(f.root.join("jump")).unwrap();
    fs::write(f.root.join("z.md"), b"last").unwrap();
    let report = scan_with_hook(&f.grant(), 2, |_| {}).unwrap();
    assert!(report.partial);
    assert!(report.files.len() + report.skipped <= 1);
}

#[test]
fn replacing_opened_directory_with_outside_symlink_discards_inventory() {
    let f = Fixture::new();
    let grant = f.grant();
    assert!(!scan_with_hook(&grant, 100, |_| {})
        .unwrap()
        .files
        .is_empty());
    assert!(scan_with_hook(&grant, 100, |phase| match phase {
        ScanPhase::DirectoryOpened(path) if path == PathBuf::from("specs") => {
            fs::rename(f.root.join("specs"), f.root.join("specs-old")).unwrap();
            symlink(&f.outside, f.root.join("specs")).unwrap();
        }
        _ => (),
    })
    .is_err());
}

#[test]
fn enumerates_the_measured_833_document_scale_without_silent_500_limit() {
    let f = Fixture::new();
    for index in 0..833 {
        fs::write(f.root.join(format!("doc-{index:04}.md")), b"doc").unwrap();
    }
    let report = scan_with_hook(&f.grant(), 10_000, |_| {}).unwrap();
    assert_eq!(report.files.len(), 835);
    assert!(!report.partial);
    let json = serde_json::to_value(&report).unwrap();
    assert_eq!(json["visited"], 839);
    assert_eq!(json["limit_reached"], false);
    assert_eq!(json["depth_limited"], false);
}

#[test]
fn reports_budget_and_depth_as_unknown_remainder() {
    let f = Fixture::new();
    for index in 0..10_001 {
        fs::write(f.root.join(format!("doc-{index:05}.md")), b"x").unwrap();
    }
    let report = serde_json::to_value(scan_with_hook(&f.grant(), 10_000, |_| {}).unwrap()).unwrap();
    assert_eq!(report["visited"], 10_000);
    assert_eq!(report["limit_reached"], true);
    assert_eq!(report["unknown_remainder"], true);
}

#[test]
fn reports_depth_as_unknown_remainder() {
    let deep = Fixture::new();
    let mut path = deep.root.clone();
    for _ in 0..14 {
        path.push("nested");
        fs::create_dir(&path).unwrap();
    }
    fs::write(path.join("deep.md"), b"x").unwrap();
    let report =
        serde_json::to_value(scan_with_hook(&deep.grant(), 10_000, |_| {}).unwrap()).unwrap();
    assert_eq!(report["depth_limited"], true);
    assert_eq!(report["unknown_remainder"], true);
}
