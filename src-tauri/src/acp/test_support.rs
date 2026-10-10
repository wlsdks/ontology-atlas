use std::collections::HashSet;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use super::registry::{registry_agent, RegistryLaunch};

pub(super) fn npx_package(runtime_id: &str) -> &'static str {
    match &registry_agent(runtime_id)
        .unwrap_or_else(|| panic!("missing registry agent: {runtime_id}"))
        .launch
    {
        RegistryLaunch::Npx { package, .. } => package,
        _ => panic!("runtime is not backed by npx: {runtime_id}"),
    }
}

pub(super) type ProbeClosures<'a> = (
    Box<dyn Fn(&Path) -> bool + 'a>,
    Box<dyn Fn(&Path) -> Vec<String> + 'a>,
    Box<dyn Fn(&Path) -> Option<String> + 'a>,
);

pub(super) fn probe_with<'a>(
    files: &'a HashSet<PathBuf>,
    dirs: &'a std::collections::HashMap<PathBuf, Vec<String>>,
) -> ProbeClosures<'a> {
    (
        Box::new(move |p: &Path| files.contains(p)),
        Box::new(move |p: &Path| dirs.get(p).cloned().unwrap_or_default()),
        Box::new(move |_: &Path| None),
    )
}

pub(super) fn empty_dirs() -> std::collections::HashMap<PathBuf, Vec<String>> {
    std::collections::HashMap::new()
}

pub(super) fn test_bin_dir() -> PathBuf {
    PathBuf::from("/atlas-test-bin")
}

pub(super) fn test_bin(name: &str) -> PathBuf {
    test_bin_dir().join(name)
}

pub(super) fn test_path_env() -> OsString {
    std::env::join_paths([test_bin_dir()]).unwrap()
}

pub(super) fn scratch(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "atlas-acp-npx-{tag}-{}-{}",
        std::process::id(),
        ACP_SESSION_TEST_NONCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

pub(super) static ACP_SESSION_TEST_NONCE: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);
