//! `git_status` and `git_history` against throwaway repositories, driven over standard input and
//! output. The JavaScript server's answers for the shared fixtures are compared by the
//! differential harness (family `git`); these cover what that corpus has no repository for.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::indexing_slicing,
    reason = "these tests start git and the program, plant the files a repository holds, and read answers by key"
)]

mod support;

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;
use support::{call, run_to_end, Program};

struct Scene {
    root: tempfile::TempDir,
}

impl Scene {
    fn new() -> Self {
        let root = tempfile::tempdir().expect("temp dir");
        let scene = Self { root };
        scene.git(&["init", "-q", "-b", "main"]);
        scene
    }

    fn path(&self) -> PathBuf {
        real_path(self.root.path())
    }

    fn write(&self, name: &str, text: &str) {
        let file = self.path().join(name);
        std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
        std::fs::write(file, text).expect("write");
    }

    fn git(&self, args: &[&str]) -> String {
        git_in(&self.path(), args)
    }

    fn commit_all(&self, message: &str) {
        self.git(&["add", "-A"]);
        self.git(&["commit", "-q", "-m", message]);
    }

    fn ask(&self, vault: &str, tool: &str, arguments: &str) -> Value {
        ask(
            &[("OATLAS_VAULT", &self.path().join(vault).to_string_lossy())],
            tool,
            arguments,
        )
    }
}

/// The real path as the server prints it. On Windows `canonicalize` returns a verbatim `\\?\`
/// path (std::fs::canonicalize documentation), and the server prints it without the prefix.
fn real_path(path: &Path) -> PathBuf {
    let real = path.canonicalize().expect("real path");
    PathBuf::from(real.to_string_lossy().trim_start_matches(r"\\?\"))
}

const NULL_DEVICE: &str = if cfg!(windows) { "NUL" } else { "/dev/null" };

fn git_in(folder: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args([
            "-c",
            "user.name=test",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "commit.gpgsign=false",
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

/// The `structuredContent` of the one answer to `tool`.
fn ask(environment: &[(&str, &str)], tool: &str, arguments: &str) -> Value {
    let run = run_to_end(
        Program::Rust,
        environment,
        call(1, tool, arguments).as_bytes(),
    );
    let answer: Value = serde_json::from_str(run.lines.first().expect("an answer")).expect("json");
    answer["result"]["structuredContent"].clone()
}

fn paths(value: &Value) -> Vec<&str> {
    value
        .as_array()
        .expect("a list")
        .iter()
        .map(|row| row["path"].as_str().or(row.as_str()).expect("a path"))
        .collect()
}

#[test]
fn a_vault_in_a_folder_of_a_repository_is_read_apart_from_the_changes_around_it() {
    let scene = Scene::new();
    scene.write("docs/ontology/kept.md", "kept\n");
    scene.write("src/app.ts", "const a = 1;\n");
    scene.write("elsewhere.md", "elsewhere\n");
    scene.commit_all("seed");
    scene.write("docs/ontology/kept.md", "changed\n");
    scene.write("docs/ontology/new note.md", "new\n");
    scene.write("src/app.ts", "const a = 2;\n");
    scene.git(&["add", "src/app.ts"]);
    scene.write("elsewhere.md", "changed\n");

    let status = scene.ask("docs/ontology", "git_status", "{}");
    assert_eq!(status["vaultPathspec"], "docs/ontology");
    assert_eq!(status["repoRoot"], scene.path().to_string_lossy().as_ref());
    assert_eq!(
        paths(&status["files"]),
        ["docs/ontology/kept.md", "docs/ontology/new note.md"]
    );
    assert_eq!(status["files"][1]["status"], "untracked");
    assert_eq!(
        status["counts"],
        serde_json::json!({"total": 2, "staged": 0, "unstaged": 2, "untracked": 1,
                           "outsideVault": 2, "stagedOutsideVault": 1})
    );
    assert_eq!(paths(&status["stagedOutsideVault"]), ["src/app.ts"]);
    assert_eq!(status["risk"]["level"], "medium");
    assert_eq!(status["branch"], "main");
    assert_eq!(status["head"], scene.git(&["rev-parse", "HEAD"]).as_str());

    let history = scene.ask("docs/ontology", "git_history", "{}");
    assert_eq!(
        history["count"], 1,
        "only commits that touched the vault are listed"
    );
    assert_eq!(history["commits"][0]["subject"], "seed");
}

#[test]
fn a_merge_in_progress_and_a_detached_head_both_block_a_snapshot() {
    let scene = Scene::new();
    scene.write("notes/a.md", "base\n");
    scene.commit_all("base");
    scene.git(&["checkout", "-q", "-b", "side"]);
    scene.write("notes/a.md", "side\n");
    scene.commit_all("side");
    scene.git(&["checkout", "-q", "main"]);
    scene.write("notes/a.md", "main\n");
    scene.commit_all("main");
    let merge = Command::new("git")
        .args(["merge", "side"])
        .current_dir(scene.path())
        .env("GIT_CONFIG_GLOBAL", NULL_DEVICE)
        .output()
        .expect("git runs");
    assert!(!merge.status.success(), "the merge must conflict");

    let status = scene.ask("notes", "git_status", "{}");
    assert_eq!(status["operationInProgress"], "merge");
    assert_eq!(status["risk"]["level"], "high");
    assert_eq!(status["files"][0]["index"], "U");

    scene.git(&["merge", "--abort"]);
    scene.git(&["checkout", "-q", "--detach", "HEAD"]);
    let detached = scene.ask("notes", "git_status", "{}");
    assert_eq!(detached["detachedHead"], true);
    assert_eq!(detached["branch"], Value::Null);
    assert_eq!(detached["risk"]["level"], "high");
}

#[test]
fn history_says_when_it_was_cut_short_and_a_repository_without_commits_has_none() {
    let scene = Scene::new();
    scene.write("notes/a.md", "0\n");
    let unborn = scene.ask("notes", "git_history", "{}");
    assert_eq!(unborn["head"], Value::Null);
    assert_eq!(unborn["branch"], "main");
    assert_eq!(unborn["commits"], serde_json::json!([]));
    assert_eq!(unborn["historyComplete"], true);

    for number in 1..=3 {
        scene.write("notes/a.md", &format!("{number}\n"));
        scene.commit_all(&format!("commit {number}"));
    }
    let cut = scene.ask("notes", "git_history", "{\"limit\":2}");
    assert_eq!(cut["count"], 2);
    assert_eq!(cut["hasMore"], true);
    assert_eq!(cut["historyComplete"], false);
    assert_eq!(cut["commits"][0]["subject"], "commit 3");

    let clone = tempfile::tempdir().expect("temp dir");
    let source = if cfg!(windows) {
        format!(
            "file:///{}",
            scene.path().to_string_lossy().replace('\\', "/")
        )
    } else {
        format!("file://{}", scene.path().display())
    };
    let target = clone.path().join("shallow");
    git_in(
        clone.path(),
        &[
            "clone",
            "-q",
            "--depth=1",
            &source,
            &target.to_string_lossy(),
        ],
    );
    let shallow = ask(
        &[("OATLAS_VAULT", &target.join("notes").to_string_lossy())],
        "git_history",
        "{}",
    );
    assert_eq!(shallow["shallow"], true);
    assert_eq!(shallow["hasMore"], false);
    assert_eq!(
        shallow["historyComplete"], false,
        "a shallow clone's short list must not read as the whole history"
    );
}

#[test]
fn a_vault_outside_the_repository_and_a_machine_without_git_are_told_apart() {
    let scene = Scene::new();
    scene.write("notes/a.md", "a\n");
    scene.commit_all("seed");
    let other = tempfile::tempdir().expect("temp dir");
    std::fs::create_dir_all(other.path().join("vault")).expect("vault");
    let outside = ask(
        &[
            (
                "OATLAS_VAULT",
                &other.path().join("vault").to_string_lossy(),
            ),
            ("OATLAS_REPO_ROOT", &scene.path().to_string_lossy()),
        ],
        "git_status",
        "{}",
    );
    assert_eq!(outside["ok"], false);
    assert_eq!(outside["reason"], "vault-outside-repository");

    let no_git = ask(
        &[
            (
                "OATLAS_VAULT",
                &scene.path().join("notes").to_string_lossy(),
            ),
            ("OATLAS_REPO_ROOT", &scene.path().to_string_lossy()),
            (
                "PATH",
                &scene.path().join("no-such-folder").to_string_lossy(),
            ),
        ],
        "git_history",
        "{}",
    );
    assert_eq!(no_git["ok"], false);
    assert_eq!(
        no_git["reason"], "git-not-available",
        "an agent is not told to run git init on a machine that has no git"
    );
}
