use super::*;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);

struct Repository(PathBuf);

impl Repository {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "atlas-base-line-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&root).unwrap();
        let repository = Self(root);
        repository.git(&["init", "-q", "-b", "main"]);
        repository.git(&["config", "user.name", "fixture"]);
        repository.git(&["config", "user.email", "fixture@example.invalid"]);
        repository.git(&["config", "commit.gpgsign", "false"]);
        repository.commit("base");
        repository
    }
    fn git(&self, args: &[&str]) -> Option<String> {
        let out = Command::new("git")
            .args(args)
            .current_dir(&self.0)
            .output()
            .unwrap();
        out.status
            .success()
            .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
    }
    fn commit(&self, subject: &str) -> String {
        self.git(&["commit", "--allow-empty", "-qm", subject])
            .unwrap();
        self.git(&["rev-parse", "HEAD"]).unwrap()
    }
    fn publish(&self, branch: &str) {
        let head = self.git(&["rev-parse", branch]).unwrap();
        self.git(&[
            "update-ref",
            &format!("refs/remotes/origin/{branch}"),
            &head,
        ])
        .unwrap();
    }
    fn line(&self) -> Option<(String, String)> {
        let root: &Path = &self.0;
        let read = |args: &[&str]| {
            let out = Command::new("git")
                .args(args)
                .current_dir(root)
                .output()
                .ok()?;
            out.status
                .success()
                .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
        };
        merged_line(&read).map(|line| (line.branch, line.reference))
    }
}

impl Drop for Repository {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn line(branch: &str, reference: &str) -> Option<(String, String)> {
    Some((branch.to_string(), reference.to_string()))
}

#[test]
fn a_feature_branch_reads_the_integration_branch_it_came_from() {
    let repository = Repository::new();
    repository
        .git(&["switch", "-q", "-c", "feat/on-main"])
        .unwrap();
    repository.commit("feature");
    assert_eq!(repository.line(), line("main", "refs/heads/main"));
}

#[test]
fn a_repository_that_merges_into_develop_reads_develop() {
    let repository = Repository::new();
    repository.publish("main");
    repository
        .git(&[
            "symbolic-ref",
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/main",
        ])
        .unwrap();
    repository.git(&["switch", "-q", "-c", "develop"]).unwrap();
    repository.commit("merged into develop");
    repository.publish("develop");
    assert_eq!(
        repository.line(),
        line("develop", "refs/remotes/origin/develop")
    );

    repository
        .git(&["switch", "-q", "-c", "feature/x"])
        .unwrap();
    repository.commit("feature");
    assert_eq!(
        repository.line(),
        line("develop", "refs/remotes/origin/develop")
    );

    repository.git(&["switch", "-q", "main"]).unwrap();
    assert_eq!(repository.line(), line("main", "refs/remotes/origin/main"));
}

#[test]
fn the_remote_wins_unless_the_local_branch_is_strictly_ahead() {
    let repository = Repository::new();
    repository.publish("main");
    repository.git(&["switch", "-q", "-c", "work"]).unwrap();

    repository.git(&["switch", "-q", "main"]).unwrap();
    repository.commit("unpushed merge");
    repository.git(&["switch", "-q", "work"]).unwrap();
    assert_eq!(repository.line(), line("main", "refs/heads/main"));

    let local = repository.git(&["rev-parse", "main"]).unwrap();
    repository
        .git(&["switch", "-q", "--detach", "main~1"])
        .unwrap();
    repository.commit("merged on the remote");
    repository.publish_detached();
    repository.git(&["switch", "-q", "work"]).unwrap();
    assert_eq!(repository.git(&["rev-parse", "main"]).unwrap(), local);
    assert_eq!(repository.line(), line("main", "refs/remotes/origin/main"));
}

#[test]
fn a_repository_without_an_integration_branch_has_no_line() {
    let repository = Repository::new();
    repository.git(&["branch", "-m", "work"]).unwrap();
    assert_eq!(repository.line(), None);
}

impl Repository {
    fn publish_detached(&self) {
        let head = self.git(&["rev-parse", "HEAD"]).unwrap();
        self.git(&["update-ref", "refs/remotes/origin/main", &head])
            .unwrap();
    }
}
