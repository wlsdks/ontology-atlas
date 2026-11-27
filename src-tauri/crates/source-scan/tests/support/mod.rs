//! A throwaway repository for the tests that need real history.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests start git and plant the files a repository holds"
)]
#![allow(dead_code, reason = "each test file uses part of this module")]

use std::path::{Path, PathBuf};
use std::process::Command;

pub const NULL_DEVICE: &str = if cfg!(windows) { "NUL" } else { "/dev/null" };

/// A folder removed when it goes out of scope.
pub struct Scratch {
    root: PathBuf,
}

impl Scratch {
    pub fn new(label: &str) -> Self {
        let root = std::env::temp_dir().join(format!("source-scan-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("a scratch folder");
        Self { root }
    }

    pub fn path(&self) -> &Path {
        &self.root
    }

    /// A repository on branch `main` with a committer, in a folder under the scratch folder.
    pub fn repository(&self, name: &str) -> PathBuf {
        let folder = self.root.join(name);
        std::fs::create_dir_all(&folder).expect("a repository folder");
        git(&folder, &["init", "-q", "-b", "main"]);
        folder
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

pub fn git(folder: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args([
            "-c",
            "user.name=test",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.autocrlf=false",
        ])
        .args(args)
        .current_dir(folder)
        .env("GIT_CONFIG_GLOBAL", NULL_DEVICE)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

pub fn write(folder: &Path, name: &str, text: &str) {
    let file = folder.join(name);
    std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
    std::fs::write(file, text).expect("write");
}

pub fn commit_all(folder: &Path, message: &str) -> String {
    git(folder, &["add", "-A"]);
    git(folder, &["commit", "-q", "-m", message]);
    git(folder, &["rev-parse", "HEAD"])
}
