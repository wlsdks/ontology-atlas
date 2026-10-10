use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// The bare repository stands in for `origin` locally; nothing touches the network.
pub(super) struct Scratch {
    dir: PathBuf,
    pub(super) work: PathBuf,
    origin: PathBuf,
}

impl Scratch {
    pub(super) fn new(name: &str) -> Self {
        let dir = std::env::temp_dir()
            .join(format!("atlas-remote-state-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let work = dir.join("work");
        let origin = dir.join("origin.git");
        fs::create_dir_all(&work).unwrap();
        let scratch = Scratch { dir, work, origin };
        scratch.git(&["init", "-q", "-b", "main"]);
        scratch.git(&["config", "user.email", "test@example.invalid"]);
        scratch.git(&["config", "user.name", "atlas test"]);
        scratch.git(&["config", "commit.gpgsign", "false"]);
        scratch.git(&["config", "core.autocrlf", "false"]);
        scratch.commit("one.md", "one");
        let out = Command::new("git")
            .args(["init", "-q", "--bare"])
            .arg(&scratch.origin)
            .output()
            .unwrap();
        assert!(out.status.success(), "git init --bare");
        scratch
    }

    pub(super) fn git(&self, args: &[&str]) -> String {
        let out = Command::new("git")
            .args(args)
            .current_dir(&self.work)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    pub(super) fn commit(&self, file: &str, body: &str) {
        fs::write(self.work.join(file), body).unwrap();
        self.git(&["add", file]);
        self.git(&["commit", "-qm", body]);
    }

    pub(super) fn add_origin(&self) {
        let origin = self.origin.to_string_lossy().into_owned();
        self.git(&["remote", "add", "origin", &origin]);
    }

    pub(super) fn origin_main(&self) -> Option<String> {
        let out = Command::new("git")
            .args(["rev-parse", "--verify", "-q", "refs/heads/main"])
            .current_dir(&self.origin)
            .output()
            .unwrap();
        out.status
            .success()
            .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
    }

    pub(super) fn vault(&self) -> String {
        self.work.to_string_lossy().into_owned()
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}
