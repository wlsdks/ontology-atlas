//! Throwaway repositories for the hostile-repository tests.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};

pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new(label: &str) -> Self {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let unique = format!(
            "hardened-git-{label}-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let path = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&path).expect("create temp dir");
        Self(std::fs::canonicalize(&path).expect("canonicalize temp dir"))
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    pub fn join(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// The null device, for settings that must name no file.
pub fn null_device() -> &'static str {
    if cfg!(windows) {
        "NUL"
    } else {
        "/dev/null"
    }
}

/// This process's environment with the person's own `git` config left out, so a test depends on
/// nothing the machine configured.
pub fn isolated_environment() -> Vec<(OsString, OsString)> {
    let mut env: Vec<(OsString, OsString)> = std::env::vars_os()
        .filter(|(name, _)| {
            let name = name.to_string_lossy();
            name != "GIT_CONFIG_GLOBAL" && name != "GIT_CONFIG_NOSYSTEM"
        })
        .collect();
    env.push(("GIT_CONFIG_GLOBAL".into(), null_device().into()));
    env.push(("GIT_CONFIG_NOSYSTEM".into(), "1".into()));
    env
}

/// An unhardened `git`, the weapon half of each test: it proves the fixture is live.
pub fn plain_git(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env_clear()
        .envs(isolated_environment())
        .stdin(Stdio::null())
        .output()
        .expect("spawn git");
    assert!(
        output.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).into_owned()
}

/// An unhardened `git` whose failure is not an error (a weapon fired, or refused).
pub fn plain_git_lenient(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env_clear()
        .envs(isolated_environment())
        .stdin(Stdio::null())
        .output()
        .expect("spawn git");
    String::from_utf8_lossy(&output.stdout).into_owned()
}

pub fn seed_identity(cwd: &Path) {
    plain_git(cwd, &["config", "user.email", "test@example.invalid"]);
    plain_git(cwd, &["config", "user.name", "atlas test"]);
    plain_git(cwd, &["config", "commit.gpgsign", "false"]);
    plain_git(cwd, &["config", "core.autocrlf", "false"]);
}

pub fn new_repository(base: &TempDir, name: &str) -> PathBuf {
    let repo = base.join(name);
    std::fs::create_dir_all(&repo).expect("create repo dir");
    plain_git(&repo, &["init", "-q"]);
    seed_identity(&repo);
    repo
}

pub fn commit_note(repo: &Path) {
    std::fs::write(repo.join("note.md"), "# one\n").expect("write note");
    plain_git(repo, &["add", "-A"]);
    plain_git(repo, &["commit", "-qm", "one"]);
}
