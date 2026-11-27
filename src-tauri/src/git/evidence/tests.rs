use super::*;

fn repo_path(path: &str) -> WantedPath {
    WantedPath {
        key: path.to_string(),
        resolved: RepoPath::new(path).unwrap(),
        dating: Dating::NewestCommit,
    }
}

#[test]
fn the_walk_names_the_newest_commit_beside_its_time() {
    let scratch = crate::git::test_support::Scratch::new("evidence-newest-commit");
    scratch.commit("pay.md", "first");
    let first = scratch.git(&["rev-parse", "HEAD"]);
    scratch.commit("other.md", "unrelated");
    let wanted = [repo_path("pay.md")];
    let last = last_changes(&scratch.work, &wanted).unwrap();
    let newest = last[0].as_ref().expect("pay.md is dated");
    assert_eq!(newest.commit.as_str(), first);
    assert!(!newest.committed_at.is_empty());
}

#[test]
fn a_path_written_as_pathspec_magic_hides_no_other_path() {
    // An exclude pattern drops the other path from the walk; malformed magic makes
    // Git refuse the whole walk. Read as names, neither touches the other date.
    for (index, planted) in [":!src", ":@x"].into_iter().enumerate() {
        let scratch = crate::git::test_support::Scratch::new(&format!("evidence-literal-{index}"));
        std::fs::create_dir_all(scratch.work.join("src")).unwrap();
        scratch.commit("src/pay.ts", "pay");
        let wanted = [repo_path("src/pay.ts"), repo_path(planted)];
        let last = last_changes(&scratch.work, &wanted).unwrap();
        assert!(
            last[0].is_some(),
            "{planted}: src/pay.ts keeps its change date"
        );
    }
}

/// One case of `tests/fixtures/document-dating-cases.json` replayed into a fresh repository:
/// the repository, and the commit hash of each step label.
pub(super) struct DatingCase {
    pub(super) name: String,
    pub(super) root: std::path::PathBuf,
    pub(super) labels: std::collections::HashMap<String, String>,
    pub(super) document: String,
    pub(super) code: String,
    pub(super) document_label: String,
    pub(super) code_label: String,
}

impl Drop for DatingCase {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn case_git(root: &std::path::Path, minute: usize, args: &[&str]) -> String {
    let at = format!("2026-01-01T00:{minute:02}:00Z");
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(root)
        .env("GIT_AUTHOR_DATE", &at)
        .env("GIT_COMMITTER_DATE", &at)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

pub(super) fn dating_cases(tag: &str) -> Vec<DatingCase> {
    let table: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/document-dating-cases.json"
    ))
    .unwrap();
    let document = table["document"].as_str().unwrap().to_string();
    let code = table["code"].as_str().unwrap().to_string();
    let mut out = Vec::new();
    for (index, case) in table["cases"].as_array().unwrap().iter().enumerate() {
        let root =
            std::env::temp_dir().join(format!("atlas-dating-{tag}-{index}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let root = std::fs::canonicalize(root).unwrap();
        for setting in [
            ["init", "-q", "-b", "main"].as_slice(),
            &["config", "user.email", "test@example.invalid"],
            &["config", "user.name", "atlas test"],
            &["config", "commit.gpgsign", "false"],
            &["config", "core.autocrlf", "false"],
        ] {
            case_git(&root, 0, setting);
        }
        let mut labels = std::collections::HashMap::new();
        for (minute, step) in case["steps"].as_array().unwrap().iter().enumerate() {
            let minute = minute + 1;
            let label = |key: &str| labels.get(step[key].as_str().unwrap()).cloned().unwrap();
            if let Some(name) = step["commit"].as_str() {
                for (path, text) in step["files"].as_object().unwrap() {
                    let file = root.join(path);
                    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
                    std::fs::write(file, text.as_str().unwrap()).unwrap();
                    case_git(&root, minute, &["add", "--", path]);
                }
                case_git(&root, minute, &["commit", "-qm", name]);
                labels.insert(
                    name.to_string(),
                    case_git(&root, minute, &["rev-parse", "HEAD"]),
                );
            } else if step.get("revert").is_some() {
                let hash = label("revert");
                case_git(&root, minute, &["revert", "--no-edit", &hash]);
            } else if let Some(path) = step["restore"].as_str() {
                let hash = label("from");
                case_git(&root, minute, &["checkout", &hash, "--", path]);
                case_git(&root, minute, &["commit", "-qm", "restore"]);
            } else if step.get("reset").is_some() {
                let hash = label("reset");
                case_git(&root, minute, &["reset", "-q", "--hard", &hash]);
            } else if step.get("cherryPick").is_some() {
                let hash = label("cherryPick");
                case_git(&root, minute, &["cherry-pick", &hash]);
            }
            if let Some(name) = step["as"].as_str() {
                labels.insert(
                    name.to_string(),
                    case_git(&root, minute, &["rev-parse", "HEAD"]),
                );
            }
        }
        out.push(DatingCase {
            name: case["name"].as_str().unwrap().to_string(),
            root,
            labels,
            document: document.clone(),
            code: code.clone(),
            document_label: case["dates"]["document"].as_str().unwrap().to_string(),
            code_label: case["dates"]["code"].as_str().unwrap().to_string(),
        });
    }
    out
}

#[test]
fn the_desktop_walk_dates_documents_by_their_bytes_as_the_shared_cases_say() {
    for case in dating_cases("walk") {
        let wanted = [
            WantedPath {
                key: case.document.clone(),
                resolved: RepoPath::new(&case.document).unwrap(),
                dating: Dating::FirstCommitWithPresentBytes,
            },
            repo_path(&case.code),
        ];
        let last = last_changes(&case.root, &wanted).unwrap();
        let hash = |index: usize| {
            last[index]
                .as_ref()
                .map(|commit| commit.commit.as_str().to_string())
        };
        assert_eq!(
            hash(0),
            case.labels.get(&case.document_label).cloned(),
            "{}: document",
            case.name
        );
        assert_eq!(
            hash(1),
            case.labels.get(&case.code_label).cloned(),
            "{}: code",
            case.name
        );
    }
}
