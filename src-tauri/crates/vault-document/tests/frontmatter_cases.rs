//! The frontmatter cases the TypeScript contract test runs through the app's reader, the MCP
//! package's and the scripts' (`tests/contract/vault-format/parse-frontmatter.contract.test.ts`),
//! run here through this crate's reader. The cases are one file, `tests/fixtures/frontmatter-cases.json`,
//! so a fourth reader cannot agree with a copy that drifted.

#![allow(
    clippy::disallowed_methods,
    reason = "the test reads the shared fixture, which is a file of the repository and not a vault"
)]

use std::path::Path;

use serde_json::{json, Value};
use vault_document::Document;

fn cases() -> Vec<Value> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../tests/fixtures/frontmatter-cases.json");
    let text = std::fs::read_to_string(&path).expect("the shared fixture is in the repository");
    let cases: Vec<Value> = serde_json::from_str(&text).expect("the fixture is a list of cases");
    assert!(
        cases.len() > 40,
        "the fixture has its cases: {}",
        cases.len()
    );
    cases
}

/// What the TypeScript reader returns for a text: the keys, the body, and the faults only when
/// there are some.
fn read(input: &str) -> Value {
    let document = Document::from_text(input);
    let mut answer = json!({
        "frontmatter": document.frontmatter(),
        "body": document.body(),
    });
    if let (false, Some(members)) = (document.diagnostics().is_empty(), answer.as_object_mut()) {
        members.insert("diagnostics".to_string(), json!(document.diagnostics()));
    }
    answer
}

/// JavaScript has one number type: `10` and `10.0` are the same value there, so both sides are
/// compared as the floating-point number they are.
fn as_javascript_would(value: &Value) -> Value {
    match value {
        Value::Number(number) => json!(number.as_f64()),
        Value::Array(items) => Value::Array(items.iter().map(as_javascript_would).collect()),
        Value::Object(members) => Value::Object(
            members
                .iter()
                .map(|(key, member)| (key.clone(), as_javascript_would(member)))
                .collect(),
        ),
        other => other.clone(),
    }
}

#[test]
fn every_shared_case_reads_as_the_other_readers_read_it() {
    let mut failures = Vec::new();
    for case in cases() {
        let name = case["name"].as_str().expect("a case has a name");
        let input = case["input"].as_str().expect("a case has an input");
        let got = read(input);
        if as_javascript_would(&got) != as_javascript_would(&case["expected"]) {
            failures.push(format!(
                "{name}\n  expected {}\n  got      {got}",
                case["expected"]
            ));
        }
    }
    assert!(
        failures.is_empty(),
        "{} case(s) differ:\n{}",
        failures.len(),
        failures.join("\n")
    );
}
