use super::PickerBinding;
use std::os::unix::fs::symlink;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture {
    base: PathBuf,
    first: PathBuf,
    second: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = PathBuf::from("/private/tmp").join(format!(
            "atlas-planning-picker-binding-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let first = base.join("first");
        let second = base.join("second");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        Self {
            base,
            first,
            second,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}
#[test]
fn accepted_selection_keeps_opened_identity_and_legitimate_tmp_alias() {
    let f = Fixture::new();
    let alias = PathBuf::from(
        f.first
            .to_string_lossy()
            .replacen("/private/tmp/", "/tmp/", 1),
    );
    let mut binding = PickerBinding::default();
    binding.observe(Some(&alias)).unwrap();
    assert!(binding.validate(&alias));
    let (canonical, fd) = binding.finish(true, Some(&alias)).unwrap().unwrap();
    assert_eq!(canonical, f.first);
    assert!(fd.metadata().unwrap().is_dir());
}
#[test]
fn cancel_ignores_retained_url_and_missing_event_is_rejected() {
    let f = Fixture::new();
    let mut binding = PickerBinding::default();
    assert!(!binding.validate(&f.first));
    assert!(binding.finish(true, Some(&f.first)).is_err());
    binding.observe(Some(&f.first)).unwrap();
    assert!(binding.validate(&f.first));
    assert!(binding.finish(false, Some(&f.first)).unwrap().is_none());
    assert!(binding.finish(true, Some(&f.first)).is_err());
}
#[test]
fn switching_selection_retires_old_descriptor_and_validates_only_final_choice() {
    let f = Fixture::new();
    let mut binding = PickerBinding::default();
    binding.observe(Some(&f.first)).unwrap();
    assert!(binding.validate(&f.first));
    binding.observe(Some(&f.second)).unwrap();
    assert!(!binding.validate(&f.first));
    assert!(binding.validate(&f.second));
    assert!(binding.finish(true, Some(&f.second)).is_ok());
}
#[test]
fn replacement_after_event_or_after_validation_is_rejected() {
    let f = Fixture::new();
    let mut binding = PickerBinding::default();
    binding.observe(Some(&f.first)).unwrap();
    fs::rename(&f.first, f.base.join("old")).unwrap();
    symlink(&f.second, &f.first).unwrap();
    assert!(!binding.validate(&f.first));
    assert!(binding.finish(true, Some(&f.first)).is_err());
    fs::remove_file(&f.first).unwrap();
    fs::rename(f.base.join("old"), &f.first).unwrap();
    binding.observe(Some(&f.first)).unwrap();
    assert!(binding.validate(&f.first));
    fs::rename(&f.first, f.base.join("old")).unwrap();
    symlink(&f.second, &f.first).unwrap();
    assert!(binding.finish(true, Some(&f.first)).is_err());
}

#[test]
fn repeated_event_for_same_path_cannot_replace_a_previously_opened_identity() {
    let f = Fixture::new();
    let mut binding = PickerBinding::default();
    binding.observe(Some(&f.first)).unwrap();
    fs::rename(&f.first, f.base.join("old")).unwrap();
    symlink(&f.second, &f.first).unwrap();
    assert!(binding.observe(Some(&f.first)).is_err());
    assert!(binding.observe(Some(&f.first)).is_err());
    assert!(!binding.validate(&f.first));
    assert!(binding.finish(true, Some(&f.first)).is_err());
}

#[test]
fn picker_rejects_excluded_root_and_ancestor() {
    let f = Fixture::new();
    for name in [".secrets", "node_modules/hidden"] {
        let path = f.base.join(name);
        fs::create_dir_all(&path).unwrap();
        let mut binding = PickerBinding::default();
        assert!(binding.observe(Some(&path)).is_err());
        assert!(binding.finish(true, Some(&path)).is_err());
    }
}
