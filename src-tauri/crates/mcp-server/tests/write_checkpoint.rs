//! The gate every write passes (read-only mode, the person's consent, the reservation rule) and the
//! audit lines a finished write leaves, seen from outside: a server process, a vault in a temporary
//! folder, and a client that answers or does not answer the server's question.
//!
//! `__test_write` is the test build's one write tool. It writes `<slug>.md` through the same
//! permit a real tool receives, so what these tests show holds for every write tool.

mod support;

use std::time::Duration;

use serde_json::Value;
use support::{call, ping, request, Live, INITIALIZED};

const WAIT: Duration = Duration::from_secs(10);
const SILENCE: Duration = Duration::from_millis(400);

struct Client {
    live: Live,
    vault: tempfile::TempDir,
}

fn initialize(capabilities: &str) -> String {
    request(
        1,
        "initialize",
        &format!("{{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{capabilities},\"clientInfo\":{{\"name\":\"checkpoint-test\",\"version\":\"1\"}}}}"),
    )
}

impl Client {
    /// A server over an empty vault, initialized with `capabilities`.
    fn start(variables: &[(&str, &str)], capabilities: &str) -> Self {
        let vault = tempfile::tempdir().expect("vault");
        Self::start_in(vault, variables, capabilities)
    }

    fn start_in(vault: tempfile::TempDir, variables: &[(&str, &str)], capabilities: &str) -> Self {
        let path = vault.path().to_string_lossy().into_owned();
        let mut environment = vec![("OATLAS_VAULT", path.as_str())];
        environment.extend_from_slice(variables);
        let mut live = Live::start(&environment);
        live.send(&initialize(capabilities));
        live.send(INITIALIZED);
        live.next_line(WAIT).expect("initialize is answered");
        Self { live, vault }
    }

    fn with_consent(capabilities: &str) -> Self {
        Self::start(&[("OATLAS_WRITE_CONSENT", "1")], capabilities)
    }

    fn write(&mut self, id: u32, arguments: &str) {
        self.live.send(&call(id, "__test_write", arguments));
    }

    fn next(&mut self) -> Value {
        let line = self.live.next_line(WAIT).expect("a line from the server");
        serde_json::from_str(&line).expect("json")
    }

    fn silent(&mut self) -> bool {
        self.live.next_line(SILENCE).is_none()
    }

    /// Answers the open question with `result`.
    fn answer(&mut self, id: i64, result: &str) {
        self.live.send(&format!(
            "{{\"jsonrpc\":\"2.0\",\"id\":{id},\"result\":{result}}}\n"
        ));
    }

    fn file(&self, relative: &str) -> Option<String> {
        std::fs::read_to_string(self.vault.path().join(relative)).ok()
    }
}

/// The text of a tool answer.
fn text_of(answer: &Value) -> String {
    let text = answer
        .pointer("/result/content/0/text")
        .and_then(Value::as_str)
        .unwrap_or_default();
    text.strip_prefix("Error: ").unwrap_or(text).to_string()
}

fn failed(answer: &Value) -> bool {
    answer.pointer("/result/isError") == Some(&Value::Bool(true))
}

fn lines_of(client: &Client, relative: &str) -> Vec<Value> {
    client
        .file(relative)
        .unwrap_or_default()
        .lines()
        .map(|line| serde_json::from_str(line).expect("a whole line"))
        .collect()
}

#[test]
fn read_only_mode_refuses_a_write_before_its_arguments_are_read_and_before_anything_is_asked() {
    let mut client = Client::start(
        &[("OATLAS_READ_ONLY", "1"), ("OATLAS_WRITE_CONSENT", "1")],
        r#"{"elicitation":{}}"#,
    );
    client.write(2, r#"{"slug":"a","not_an_argument":true}"#);
    let answer = client.next();
    assert!(failed(&answer));
    assert_eq!(
        text_of(&answer),
        "Tool \"__test_write\" is unavailable: server is in read-only mode (OATLAS_READ_ONLY). Only read tools are exposed."
    );
    assert!(client.silent(), "no question was put to the person");
    assert_eq!(client.file("a.md"), None);
    assert_eq!(client.file(".ontology-atlas/activity.jsonl"), None);
}

#[test]
fn a_write_waits_for_a_yes_and_nothing_else_is_a_yes() {
    let no_ways: [(&str, &str); 5] = [
        ("decline", r#"{"action":"decline"}"#),
        ("cancel", r#"{"action":"cancel"}"#),
        (
            "accept but the person unticked confirm",
            r#"{"action":"accept","content":{"confirm":false}}"#,
        ),
        (
            "an action the protocol does not have",
            r#"{"action":"allow"}"#,
        ),
        ("an answer with no action", r#"{}"#),
    ];
    for (what, result) in no_ways {
        let mut client = Client::with_consent(r#"{"elicitation":{}}"#);
        client.write(2, r#"{"slug":"a","text":"x"}"#);
        let question = client.next();
        assert_eq!(question["method"], "elicitation/create", "{what}");
        assert_eq!(question["id"], 0);
        assert_eq!(question["params"]["mode"], "form");
        assert_eq!(
            question["params"]["message"],
            "Write one test file. Apply this change to the vault?"
        );
        assert_eq!(
            question["params"]["_meta"]["codex_approval_kind"],
            "mcp_tool_call"
        );
        assert_eq!(
            client.file("a.md"),
            None,
            "{what}: nothing is written while the question is open"
        );
        client.answer(0, result);
        let answer = client.next();
        assert!(failed(&answer), "{what}");
        assert!(
            text_of(&answer).contains("No change was made"),
            "{what}: {}",
            text_of(&answer)
        );
        assert_eq!(client.file("a.md"), None, "{what}");
        assert_eq!(
            client.file(".ontology-atlas/activity.jsonl"),
            None,
            "{what}"
        );
    }

    let mut client = Client::with_consent(r#"{"elicitation":{}}"#);
    client.write(2, r#"{"slug":"a","text":"yes"}"#);
    client.next();
    client.answer(0, r#"{"action":"accept"}"#);
    let answer = client.next();
    assert!(!failed(&answer), "{}", text_of(&answer));
    assert_eq!(client.file("a.md").as_deref(), Some("yes"));
}

#[test]
fn a_client_that_cannot_be_asked_or_answers_the_question_with_an_error_writes_nothing() {
    let mut client = Client::with_consent("{}");
    client.write(2, r#"{"slug":"a"}"#);
    let answer = client.next();
    assert!(failed(&answer));
    assert!(text_of(&answer).starts_with("This vault requires a human decision before any write"));
    assert!(
        client.silent(),
        "a client that did not offer questions is sent none"
    );

    let mut client = Client::with_consent(r#"{"elicitation":{}}"#);
    client.write(2, r#"{"slug":"a"}"#);
    client.next();
    client.live.send(
        "{\"jsonrpc\":\"2.0\",\"id\":0,\"error\":{\"code\":-32601,\"message\":\"Method not found\"}}\n",
    );
    let answer = client.next();
    assert_eq!(
        text_of(&answer),
        "Asking for permission failed (Method not found). No change was made."
    );
    assert_eq!(client.file("a.md"), None);
}

#[test]
fn a_dry_run_asks_nothing_and_leaves_no_audit_line() {
    let mut client = Client::with_consent(r#"{"elicitation":{}}"#);
    client.write(2, r#"{"slug":"a","dryRun":true}"#);
    let answer = client.next();
    assert!(!failed(&answer), "{}", text_of(&answer));
    assert_eq!(
        answer["id"], 2,
        "the first line is the answer, not a question"
    );
    assert_eq!(client.file("a.md"), None);
    assert_eq!(client.file(".ontology-atlas/activity.jsonl"), None);
    assert_eq!(client.file(".ontology-atlas/map-analysis.jsonl"), None);
}

#[test]
fn a_question_does_not_hold_up_other_requests_and_a_cancelled_call_withdraws_it() {
    let mut client = Client::with_consent(r#"{"elicitation":{}}"#);
    client.write(2, r#"{"slug":"a"}"#);
    assert_eq!(client.next()["method"], "elicitation/create");
    client.live.send(&ping(3));
    let pong = client.next();
    assert_eq!(
        pong["id"], 3,
        "a read is answered while the person is deciding"
    );
    client.live.send(
        "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":2}}\n",
    );
    let withdrawn = client.next();
    assert_eq!(withdrawn["method"], "notifications/cancelled");
    assert_eq!(withdrawn["params"]["requestId"], 0);
    assert!(client.silent(), "a cancelled call is never answered");
    assert_eq!(client.file("a.md"), None);
    // A yes that arrives after the withdrawal changes nothing.
    client.answer(0, r#"{"action":"accept"}"#);
    assert!(client.silent());
    assert_eq!(client.file("a.md"), None);
}

#[test]
fn standard_input_closing_while_a_question_is_open_ends_the_server_and_writes_nothing() {
    let mut client = Client::with_consent(r#"{"elicitation":{}}"#);
    client.write(2, r#"{"slug":"a"}"#);
    assert_eq!(client.next()["method"], "elicitation/create");
    let vault = client.vault.path().to_path_buf();
    let started = std::time::Instant::now();
    assert_eq!(client.live.finish(), Some(0));
    assert!(started.elapsed() < WAIT, "the wait ended with the session");
    assert!(!vault.join("a.md").exists());
}

#[test]
fn a_file_reserved_for_a_person_is_not_rewritten_and_leaves_no_audit_line() {
    let vault = tempfile::tempdir().expect("vault");
    std::fs::write(
        vault.path().join("a.md"),
        "---\nreview_state: human_decides\n---\nBody\n",
    )
    .expect("a reserved file");
    let mut client = Client::start_in(vault, &[], "{}");
    client.write(2, r#"{"slug":"a","text":"replaced"}"#);
    let answer = client.next();
    assert!(failed(&answer));
    assert!(text_of(&answer).starts_with("Refused: a carries review_state: human_decides"));
    assert!(client
        .file("a.md")
        .is_some_and(|text| text.contains("Body")));
    assert_eq!(client.file(".ontology-atlas/activity.jsonl"), None);
}

#[test]
fn a_finished_write_adds_one_line_to_each_audit_file_with_the_clients_name() {
    let mut client = Client::start(&[], "{}");
    client.write(2, r#"{"slug":"a","text":"x","why":"to see it"}"#);
    assert!(!failed(&client.next()));
    client.write(3, r#"{"slug":"b","text":"y"}"#);
    assert!(!failed(&client.next()));

    let activity = lines_of(&client, ".ontology-atlas/activity.jsonl");
    assert_eq!(activity.len(), 2);
    assert_eq!(activity[0]["v"], 1);
    assert_eq!(activity[0]["tool"], "__test_write");
    assert_eq!(activity[0]["target"], "a");
    assert_eq!(activity[0]["why"], "to see it");
    assert_eq!(activity[0]["agent"], "checkpoint-test");
    assert_eq!(activity[1]["why"], Value::Null);
    let stamp = activity[0]["at"].as_str().unwrap_or_default();
    assert!(
        stamp.len() == 24 && stamp.ends_with('Z') && stamp.as_bytes()[10] == b'T',
        "{stamp}"
    );

    // One agent session writing twice is one analysis, and its line says both concepts were added.
    let analysis = lines_of(&client, ".ontology-atlas/map-analysis.jsonl");
    let last = analysis.last().expect("a map analysis line");
    assert_eq!(last["v"], 1);
    assert_eq!(last["number"], 1);
    assert_eq!(last["origin"], "session");
    assert_eq!(last["concepts"]["added"], 2);
    assert_eq!(last["agent"], "checkpoint-test");
    let raw =
        std::fs::read(client.vault.path().join(".ontology-atlas/activity.jsonl")).expect("log");
    assert!(
        !raw.contains(&b'\r'),
        "a line ends in a line feed alone on every platform"
    );
}

#[test]
fn an_audit_file_that_cannot_be_written_never_changes_the_answer_of_a_write_that_happened() {
    let vault = tempfile::tempdir().expect("vault");
    // A file where the folder belongs: no audit line can be added.
    std::fs::write(vault.path().join(".ontology-atlas"), "not a folder").expect("blocker");
    let mut client = Client::start_in(vault, &[], "{}");
    client.write(2, r#"{"slug":"a","text":"x"}"#);
    let answer = client.next();
    assert!(!failed(&answer), "{}", text_of(&answer));
    assert_eq!(client.file("a.md").as_deref(), Some("x"));
    assert!(client.vault.path().join(".ontology-atlas").is_file());
}

/// Windows file names and paths: a vault in a folder with a space and a non-ASCII letter, which the
/// system's ANSI code page cannot spell, is reached through the wide-character file functions
/// Rust uses (Microsoft, "Naming Files, Paths, and Namespaces"), and the audit files hold line feeds
/// alone (Rust's `write_all` does no newline translation, unlike the C runtime's text mode).
#[cfg(windows)]
#[test]
fn a_vault_path_with_a_space_and_a_non_ascii_letter_is_written_and_audited() {
    let parent = tempfile::tempdir().expect("parent");
    let vault_path = parent.path().join("Vault Ünï 한");
    std::fs::create_dir(&vault_path).expect("vault folder");
    let vault = tempfile::TempDir::new_in(&vault_path).expect("inner");
    let mut client = Client::start_in(vault, &[], "{}");
    client.write(2, r#"{"slug":"a","text":"x"}"#);
    assert!(!failed(&client.next()));
    assert_eq!(lines_of(&client, ".ontology-atlas/activity.jsonl").len(), 1);
    let raw =
        std::fs::read(client.vault.path().join(".ontology-atlas/activity.jsonl")).expect("log");
    assert!(!raw.contains(&b'\r'));
}
