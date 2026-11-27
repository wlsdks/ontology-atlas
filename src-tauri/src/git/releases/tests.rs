use super::*;
use crate::git::briefing::measure_span;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);
const START: i64 = 1_767_225_600;

struct Fixture {
    root: PathBuf,
    source: PathBuf,
    clock: std::cell::Cell<i64>,
}
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "atlas-releases-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let source = root.join("source");
        fs::create_dir_all(&source).unwrap();
        git(&source, &["init", "-q", "-b", "main"]);
        git(&source, &["config", "user.name", "fixture"]);
        git(
            &source,
            &["config", "user.email", "fixture@example.invalid"],
        );
        git(&source, &["config", "commit.gpgsign", "false"]);
        git(&source, &["config", "tag.gpgsign", "false"]);
        let f = Self {
            root: fs::canonicalize(&root).unwrap(),
            source: fs::canonicalize(&source).unwrap(),
            clock: std::cell::Cell::new(START),
        };
        crate::vault::grants::grant_source_root(&f.source);
        f
    }
    fn commit(&self, subject: &str) -> String {
        let epoch = self.clock.get() + 60;
        self.clock.set(epoch);
        let date = format!("{epoch} +0000");
        let file = self.source.join("work.txt");
        fs::write(&file, subject).unwrap();
        git(&self.source, &["add", "."]);
        let out = Command::new("git")
            .args(["commit", "-qm", subject])
            .env("GIT_AUTHOR_DATE", &date)
            .env("GIT_COMMITTER_DATE", &date)
            .current_dir(&self.source)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        git(&self.source, &["rev-parse", "HEAD"])
    }
    fn tag(&self, name: &str, commit: &str) {
        git(
            &self.source,
            &["update-ref", &format!("refs/tags/{name}"), commit],
        );
    }
    fn annotated(&self, name: &str, commit: &str) {
        git(&self.source, &["tag", "-a", "-m", "release", name, commit]);
    }
    fn resolve(&self) -> Result<Identity, String> {
        picked_identity(self.source.to_str().unwrap())
    }
    fn list(&self) -> ReleaseList {
        list_releases(|| self.resolve())
    }
    fn walk_all(&self, list: &ReleaseList, tip: &str) -> (Vec<WalkMark>, usize) {
        let mut skip = 0;
        let mut marks = Vec::new();
        loop {
            let step = walk(|| self.resolve(), &list.snapshot, tip, skip);
            assert_eq!(step.status, "measured");
            skip += step.kinds.len();
            marks.extend(step.marks);
            if step.ended {
                return (marks, skip);
            }
        }
    }
    fn first_parent_count(&self, base: Option<&str>, tip: &str) -> usize {
        let range = base.map_or(tip.to_string(), |base| format!("{base}..{tip}"));
        git(
            &self.source,
            &["rev-list", "--count", "--first-parent", &range],
        )
        .parse()
        .unwrap()
    }
    fn refs_and_status(&self) -> (String, String) {
        (
            git(&self.source, &["for-each-ref"]),
            git(&self.source, &["status", "--porcelain", "--ignored"]),
        )
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
fn git(root: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().into()
}
fn tag_of<'a>(list: &'a ReleaseList, name: &str) -> &'a TaggedCommit {
    list.tags
        .iter()
        .find(|tag| tag.names.iter().any(|known| known == name))
        .unwrap_or_else(|| panic!("{name} not listed"))
}

#[test]
fn lists_one_release_per_tagged_commit_and_walk_positions_count_like_rev_list() {
    let f = Fixture::new();
    let root = f.commit("feat: first");
    f.tag("v1.0.0", &root);
    f.commit("fix: one");
    let beta = f.commit("feat(map): two");
    f.annotated("v1.1.0-beta.1", &beta);
    f.commit("Merge #12: fix(map): three");
    let final_release = f.commit("chore: four");
    f.annotated("v1.1.0", &final_release);
    f.tag("latest", &final_release);
    let web = f.commit("feat(web): five");
    f.tag("web@1.0.0", &web);
    let api = f.commit("untyped six");
    f.tag("api@2.0.0", &api);
    let line_tip = f.commit("docs: seven");
    git(&f.source, &["checkout", "-q", "-b", "side", &root]);
    let side = f.commit("fix: off the branch");
    f.annotated("v0.9.0-hotfix", &side);
    git(&f.source, &["checkout", "-q", "main"]);

    let list = f.list();
    assert_eq!(list.status, "measured");
    assert_eq!(list.head, line_tip);
    assert_eq!(list.tags.len(), 6);
    assert_eq!(tag_of(&list, "latest").names, ["latest", "v1.1.0"]);
    assert_eq!(tag_of(&list, "v1.1.0").commit, final_release);
    let commit_epoch = git(&f.source, &["log", "-1", "--format=%ct", &beta]);
    assert_eq!(
        tag_of(&list, "v1.1.0-beta.1").committed_at.to_string(),
        commit_epoch
    );

    let (marks, walked) = f.walk_all(&list, &list.head);
    assert_eq!(walked, f.first_parent_count(None, &line_tip));
    let position = |commit: &str| {
        marks
            .iter()
            .find(|m| m.commit == commit)
            .map(|m| m.position)
    };
    assert_eq!(
        position(&side),
        None,
        "a tag off the branch is not on the walk"
    );
    let ordered = [&api, &web, &final_release, &beta, &root];
    for pair in ordered.windows(2) {
        let (Some(newer), Some(older)) = (position(pair[0]), position(pair[1])) else {
            panic!("tagged commit missing from the walk");
        };
        assert_eq!(older - newer, f.first_parent_count(Some(pair[1]), pair[0]));
        let span = measure_span(
            || f.resolve(),
            &list.snapshot,
            Some(pair[1]),
            pair[0],
            || {},
        );
        assert_eq!(span.status, "measured");
        assert_eq!(span.commits.len(), older - newer);
    }
    let first = measure_span(|| f.resolve(), &list.snapshot, None, &root, || {});
    assert_eq!(first.commits.len(), 1);
    assert!(first.base.is_none());
    let unreleased = measure_span(|| f.resolve(), &list.snapshot, Some(&api), &line_tip, || {});
    assert_eq!(
        unreleased.commits.len(),
        f.first_parent_count(Some(&api), &line_tip)
    );

    let (side_marks, side_walked) = f.walk_all(&list, &side);
    assert_eq!(side_walked, 2);
    assert_eq!(
        side_marks.iter().map(|m| m.position).collect::<Vec<_>>(),
        [0, 1]
    );
}

#[test]
fn walk_reports_each_commit_type_as_typed() {
    let f = Fixture::new();
    let root = f.commit("feat: first");
    f.tag("v1.0.0", &root);
    f.commit("Merge #4 #5: fix(map)!: second");
    f.commit("no type here");
    let list = f.list();
    let step = walk(|| f.resolve(), &list.snapshot, &list.head, 0);
    let named: Vec<Option<&str>> = step
        .kinds
        .iter()
        .map(|k| usize::try_from(*k).ok().map(|at| step.types[at].as_str()))
        .collect();
    assert_eq!(named, [None, Some("fix"), Some("feat")]);
    assert!(step.ended);
    assert_eq!(
        step.marks,
        [WalkMark {
            position: 2,
            commit: root
        }]
    );
}

#[test]
fn reads_commit_types_the_way_the_digest_does() {
    let cases = [
        ("feat: add", Some("feat")),
        ("fix(map): keep", Some("fix")),
        ("refactor!: drop", Some("refactor")),
        ("Merge #3963: docs(specs): record", Some("docs")),
        ("merge #1 #2: chore: tidy", Some("chore")),
        (
            "Merge pull request #9 from someone/branch\n\nfeat(ui): body line",
            Some("feat"),
        ),
        (
            "Merge pull request #9 from someone/branch\n\nplain body",
            None,
        ),
        ("fix(a(b)): nested", None),
        ("Update readme", None),
        (": empty", None),
        ("기능: 한글", Some("기능")),
    ];
    for (message, expected) in cases {
        assert_eq!(commit_type(message), expected, "{message}");
    }
}

#[test]
fn tag_names_never_reach_git_and_reads_change_nothing() {
    let f = Fixture::new();
    let root = f.commit("feat: first");
    let second = f.commit("fix: second");
    f.tag("--output=x", &root);
    f.tag("-h", &second);
    let refs = f.source.join(".git/refs/tags");
    fs::write(refs.join("bad\nname"), format!("{second}\n")).unwrap();
    let mut packed = fs::read(f.source.join(".git/packed-refs")).unwrap_or_default();
    packed.extend_from_slice(format!("{second} refs/tags/{}\n", "v".repeat(800)).as_bytes());
    packed.extend_from_slice(format!("{root} refs/tags/caf").as_bytes());
    packed.extend_from_slice(&[0xff, 0xfe]);
    packed.extend_from_slice(b"\n");
    fs::write(f.source.join(".git/packed-refs"), packed).unwrap();
    let before = f.refs_and_status();

    let list = f.list();
    let names: Vec<&str> = list
        .tags
        .iter()
        .flat_map(|t| t.names.iter().map(String::as_str))
        .collect();
    assert!(names.contains(&"--output=x"));
    assert!(names.contains(&"-h"));
    assert!(names.iter().all(|name| name.chars().count() <= 256));
    assert!(names.iter().all(|name| !name.chars().any(char::is_control)));
    assert!(names.iter().any(|name| name.starts_with("vvv")));
    assert_eq!(list.unreadable_names, 1);
    assert!(list.partial_reasons.contains(&"names".to_string()));

    let (_, walked) = f.walk_all(&list, &list.head);
    assert_eq!(walked, 2);
    let span = measure_span(|| f.resolve(), &list.snapshot, Some(&root), &second, || {});
    assert_eq!(span.status, "measured");
    let unissued = "0".repeat(40);
    let refused = measure_span(
        || f.resolve(),
        &list.snapshot,
        Some(&unissued),
        &second,
        || {},
    );
    assert_eq!(refused.status, "unreadable");
    let refused = measure_span(|| f.resolve(), &list.snapshot, None, &unissued, || {});
    assert_eq!(refused.status, "unreadable");
    let not_a_hash = measure_span(|| f.resolve(), &list.snapshot, None, "--output=x", || {});
    assert_eq!(not_a_hash.status, "unreadable");
    assert_eq!(
        walk(|| f.resolve(), &list.snapshot, "-h", 0).status,
        "unreadable"
    );
    assert_eq!(walk(|| f.resolve(), "unknown", &second, 0).status, "stale");

    assert!(!f.source.join("x").exists());
    assert_eq!(f.refs_and_status(), before);
}

#[test]
fn a_moved_tag_makes_the_next_span_stale() {
    let f = Fixture::new();
    let root = f.commit("feat: first");
    let second = f.commit("fix: second");
    f.tag("v1.0.0", &root);
    f.tag("v1.1.0", &second);
    let list = f.list();
    let span = measure_span(
        || f.resolve(),
        &list.snapshot,
        Some(&root),
        &second,
        || f.tag("v1.0.1", &second),
    );
    assert_eq!(span.status, "stale");
    let after = measure_span(|| f.resolve(), &list.snapshot, Some(&root), &second, || {});
    assert_eq!(after.status, "stale");
    let fresh = f.list();
    assert_ne!(fresh.snapshot, list.snapshot);
    let span = measure_span(|| f.resolve(), &fresh.snapshot, Some(&root), &second, || {});
    assert_eq!(span.status, "measured");
}

#[test]
fn a_repository_without_tags_lists_none_and_a_shallow_copy_says_so() {
    let f = Fixture::new();
    f.commit("feat: first");
    f.commit("fix: second");
    let list = f.list();
    assert_eq!(list.status, "measured");
    assert!(list.tags.is_empty());
    fs::write(
        f.source.join(".git/shallow"),
        format!("{}\n", git(&f.source, &["rev-parse", "HEAD~1"])),
    )
    .unwrap();
    let shallow = f.list();
    assert_eq!(shallow.partial_reasons, ["shallow"]);
}
