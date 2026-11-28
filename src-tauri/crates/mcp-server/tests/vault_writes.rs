//! The vault writers seen from outside: a server process, a vault of three small files, and the
//! bytes and answers a write leaves. The oracle comparison against the script server is the
//! differential corpus; these tests hold what no corpus case can state without the other server.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests start the program and plant and read the files a write leaves"
)]

mod support;

use std::time::Duration;

use serde_json::Value;
use support::{call, request, Live, INITIALIZED};

const WAIT: Duration = Duration::from_secs(10);

const NOTES: &str = "---\r\n# kept as written\r\nuid: 11111111-1111-4111-8111-111111111111\r\nslug: notes\r\nkind: document\r\ntitle:   'Notes'\r\nrelates: [other]\r\n---\r\n\r\nBody of the notes.\r\n";
const OTHER: &str = "---\nuid: 22222222-2222-4222-8222-222222222222\nslug: other\nkind: document\ntitle: Other\nrelates: [notes]\n---\n\nLinks to [[notes]].\n";

struct Vault {
    live: Live,
    folder: tempfile::TempDir,
    next_id: u32,
}

impl Vault {
    fn start() -> Self {
        let folder = tempfile::tempdir().expect("vault");
        std::fs::write(folder.path().join("notes.md"), NOTES).expect("plant");
        std::fs::write(folder.path().join("other.md"), OTHER).expect("plant");
        let path = folder.path().to_string_lossy().into_owned();
        let mut live = Live::start(&[("OATLAS_VAULT", path.as_str())]);
        live.send(&request(
            1,
            "initialize",
            r#"{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"writes-test","version":"1"}}"#,
        ));
        live.send(INITIALIZED);
        live.next_line(WAIT).expect("initialize is answered");
        Self {
            live,
            folder,
            next_id: 2,
        }
    }

    /// The structured answer of one tool call.
    fn call(&mut self, tool: &str, arguments: &str) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.live.send(&call(id, tool, arguments));
        let line = self.live.next_line(WAIT).expect("an answer");
        let answer: Value = serde_json::from_str(&line).expect("json");
        answer
            .pointer("/result/structuredContent")
            .cloned()
            .expect("a structured answer")
    }

    fn plant(&self, relative: &str, text: &str) {
        let path = self.folder.path().join(relative);
        std::fs::create_dir_all(path.parent().expect("a folder")).expect("folder");
        std::fs::write(path, text).expect("plant");
    }

    fn file(&self, relative: &str) -> Option<String> {
        std::fs::read_to_string(self.folder.path().join(relative)).ok()
    }
}

#[test]
fn a_patch_changes_the_lines_it_names_and_keeps_every_other_byte() {
    let mut vault = Vault::start();
    let answer = vault.call(
        "patch_concept",
        r#"{"slug":"notes","frontmatter":{"description":"What these notes hold."}}"#,
    );
    assert_eq!(answer["ok"], true);
    let expected = NOTES.replace(
        "relates: [other]\r\n",
        "relates: [other]\r\ndescription: What these notes hold.\r\n",
    );
    assert_eq!(vault.file("notes.md").as_deref(), Some(expected.as_str()));
}

/// The server starts in the repository that holds this crate, and the vault is a temporary folder
/// outside any repository: that repository is not the vault's code, so a write neither surveys it
/// nor reads its `HEAD`, and the line it adds to the vault records none of its facts.
#[test]
fn a_write_in_a_vault_outside_any_repository_records_nothing_of_the_one_the_server_started_in() {
    let mut vault = Vault::start();
    let connection = vault.call("connection_info", "{}");
    assert_eq!(
        connection["repoResolution"], "git.rev-parse",
        "the server is started inside a repository: {connection}"
    );
    let answer = vault.call("patch_concept", r#"{"slug":"notes","body":"Changed."}"#);
    assert_eq!(answer["ok"], true);
    let record = vault
        .file(".ontology-atlas/map-analysis.jsonl")
        .expect("the write's line");
    let line: Value = serde_json::from_str(record.lines().last().expect("a line")).expect("json");
    for key in ["sourceCommit", "sourceDirty", "abilities", "areas"] {
        assert_eq!(line[key], Value::Null, "{key}: {line}");
    }
}

#[test]
fn a_dangling_reference_on_a_written_node_is_one_findings_line_the_call_that_resolves_it() {
    let mut vault = Vault::start();
    let answer = vault.call(
        "add_concepts",
        r#"{"concepts":[{"slug":"domains/ghost","kind":"domain","title":"Ghost","capabilities":["capabilities/missing"]}]}"#,
    );
    let findings = answer["findings"].as_array().expect("findings");
    let about_it: Vec<&str> = findings
        .iter()
        .filter_map(Value::as_str)
        .filter(|line| line.contains("capabilities/missing"))
        .collect();
    assert_eq!(about_it.len(), 1, "{about_it:?}");
    assert!(about_it[0].contains(" Next: add_concepts("), "{}", about_it[0]);
}

#[test]
fn a_rename_moves_the_file_and_every_reference_to_it_and_answers_with_the_keys_that_moved() {
    let mut vault = Vault::start();
    let answer = vault.call(
        "rename_concept",
        r#"{"oldSlug":"notes","newSlug":"minutes","confirm":true}"#,
    );
    assert_eq!(answer["ok"], true);
    assert_eq!(
        answer["backlinkUpdates"],
        serde_json::json!({
            "updates": [{ "slug": "other", "keys": ["relates"], "bodyChanged": true }],
            "totalUpdated": 1
        })
    );
    assert_eq!(vault.file("notes.md"), None);
    let moved = vault.file("minutes.md").expect("the new file");
    assert!(moved.contains("slug: minutes\r\n"), "{moved}");
    let other = vault.file("other.md").expect("the referrer");
    assert!(other.contains("relates: [minutes]\n"), "{other}");
    assert!(other.contains("[[minutes]]"), "{other}");
}

/// A file already named like a Windows device is a file to look after, not one to refuse: a rename
/// reaches it as a referrer, and it can be renamed and deleted. Only a new file takes the name
/// `nul` or `aux` from nobody.
#[test]
fn a_file_that_already_has_a_device_name_is_still_a_referrer_and_can_be_renamed_and_deleted() {
    let mut vault = Vault::start();
    let referrer = |slug: &str| format!("---\nuid: 33333333-3333-4333-8333-33333333333{}\nslug: {slug}\nkind: document\ntitle: T\nrelates: [notes]\n---\n\nBody.\n", slug.len());
    vault.plant("aux.md", &referrer("aux"));
    vault.plant("con.md", &referrer("con"));
    let renamed = vault.call(
        "rename_concept",
        r#"{"oldSlug":"notes","newSlug":"minutes","confirm":true}"#,
    );
    assert_eq!(renamed["ok"], true);
    let updated: Vec<&str> = renamed["backlinkUpdates"]["updates"]
        .as_array()
        .expect("updates")
        .iter()
        .filter_map(|update| update["slug"].as_str())
        .collect();
    assert!(updated.contains(&"aux"), "{renamed}");
    assert!(vault.file("aux.md").is_some_and(|text| text.contains("relates: [minutes]")));
    assert_eq!(vault.call("rename_concept", r#"{"oldSlug":"aux","newSlug":"port","confirm":true}"#)["ok"], true);
    assert!(vault.file("port.md").is_some() && vault.file("aux.md").is_none());
    assert_eq!(vault.call("delete_concept", r#"{"slug":"con","confirm":true,"force":true}"#)["ok"], true);
    assert!(vault.file("con.md").is_none());
}

/// An activity line says which node changed, so a node has one spelling in it: the slug the typed
/// name means. What was typed is in the call, which the agent has.
#[test]
fn an_activity_line_names_the_slug_a_loose_name_means_for_every_writer() {
    let mut vault = Vault::start();
    vault.plant(
        "third.md",
        "---\nuid: 44444444-4444-4444-8444-444444444444\nslug: third\nkind: document\ntitle: Third\n---\n\nT.\n",
    );
    let calls = [
        ("add_relation", r#"{"from":"Other","to":"THIRD","type":"relates"}"#),
        (
            "remove_relation",
            r#"{"from":"Other","to":"Notes","type":"relates","replaceWith":{"to":"Third","type":"relates"},"confirm":true}"#,
        ),
        ("rename_concept", r#"{"oldSlug":"Third","newSlug":"fourth","confirm":true}"#),
        (
            "rename_concept",
            r#"{"oldSlug":"Notes","newKind":"domain","newSlug":"domains/notes","confirm":true}"#,
        ),
    ];
    for (tool, arguments) in calls {
        let answer = vault.call(tool, arguments);
        assert_eq!(answer["ok"], true, "{tool}: {answer}");
    }
    let log = vault.file(".ontology-atlas/activity.jsonl").expect("the activity log");
    let lines: Vec<(String, String)> = log
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).expect("a whole line"))
        .map(|line| {
            (
                line["target"].as_str().unwrap_or_default().to_string(),
                line["summary"].as_str().unwrap_or_default().to_string(),
            )
        })
        .collect();
    let expected = [
        ("other", "other --relates--> third"),
        ("other", "replace other --relates--> notes with --relates--> third"),
        ("fourth", "rename third \u{2192} fourth"),
        ("domains/notes", "reclassify notes \u{2192} domain"),
    ];
    assert_eq!(
        lines,
        expected.map(|(target, summary)| (target.to_string(), summary.to_string())),
        "{log}"
    );
}

#[test]
fn a_batch_that_names_one_node_twice_in_different_spellings_is_refused_as_a_repeat() {
    let mut vault = Vault::start();
    let id = vault.next_id;
    vault.next_id += 1;
    vault.live.send(&call(
        id,
        "patch_concept",
        r#"{"patches":[{"slug":"notes","body":"\nFirst.\n"},{"slug":"Notes","body":"\nSecond.\n"}]}"#,
    ));
    let line = vault.live.next_line(WAIT).expect("an answer");
    let answer: Value = serde_json::from_str(&line).expect("json");
    let text = answer["result"]["content"][0]["text"].as_str().expect("text");
    assert!(
        text.contains("patches[1].slug repeats \"notes\": send one patch per node."),
        "{text}"
    );
    assert_eq!(vault.file("notes.md").as_deref(), Some(NOTES), "nothing was written");
}

/// A node kept private on disk (`chmod 600`) is still private after a rename moves it.
#[cfg(unix)]
#[test]
fn a_renamed_private_file_is_as_private_as_it_was() {
    use std::os::unix::fs::PermissionsExt;
    let mut vault = Vault::start();
    let path = vault.folder.path().join("notes.md");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).expect("chmod");
    let answer = vault.call(
        "rename_concept",
        r#"{"oldSlug":"notes","newSlug":"minutes","confirm":true}"#,
    );
    assert_eq!(answer["ok"], true);
    let moved = std::fs::metadata(vault.folder.path().join("minutes.md")).expect("the new file");
    assert_eq!(moved.permissions().mode() & 0o777, 0o600);
}

#[test]
fn a_stale_expected_mtime_refuses_the_write_and_says_how_to_recover() {
    let mut vault = Vault::start();
    let answer = vault.call(
        "patch_concept",
        r#"{"slug":"notes","body":"new","expected_mtime":5}"#,
    );
    assert_eq!(answer["errorCode"], "vault_conflict");
    assert!(answer["error"]
        .as_str()
        .is_some_and(|text| text.ends_with("Re-read the doc with get_concepts to get the current expected_mtime, then retry the write.")));
    assert_eq!(vault.file("notes.md").as_deref(), Some(NOTES));
}

#[test]
fn a_delete_is_refused_while_a_reference_could_mean_the_node() {
    let mut vault = Vault::start();
    let node = |kind: &str, uid: &str, slug: &str| {
        format!("---\nuid: {uid}\nslug: {slug}\nkind: {kind}\ntitle: X\ndomain: domains/d\n---\n\nx\n")
    };
    vault.plant(
        "capabilities/x.md",
        &node("capability", "33333333-3333-4333-8333-333333333333", "capabilities/x"),
    );
    vault.plant(
        "elements/x.md",
        &node("element", "44444444-4444-4444-8444-444444444444", "elements/x"),
    );
    vault.plant(
        "other.md",
        "---\nuid: 55555555-5555-4555-8555-555555555555\nslug: other\nkind: document\ntitle: Other\nrelates: [x]\n---\n\nx\n",
    );
    let answer = vault.call("delete_concept", r#"{"slug":"capabilities/x","confirm":true}"#);
    assert_eq!(answer["ok"], false);
    assert!(answer["error"]
        .as_str()
        .is_some_and(|text| text.starts_with("Refusing to delete: 1 backlinks point here: other")));
    assert!(vault.file("capabilities/x.md").is_some());
}

/// Microsoft's naming rules make a backslash a path separator on Windows, so a slug that holds one
/// names a folder, which a slug may not (a slug is written with `/`).
#[cfg(windows)]
#[test]
fn a_slug_with_a_backslash_is_refused_on_windows() {
    let mut vault = Vault::start();
    let answer = vault.call(
        "add_concepts",
        r#"{"concepts":[{"slug":"a\\b","kind":"document","title":"A"}]}"#,
    );
    assert_eq!(answer.pointer("/concepts/0/ok"), Some(&Value::Bool(false)));
    assert_eq!(vault.file("a\\b.md"), None);
}
