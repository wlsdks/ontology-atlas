//! The check that a run still holds what it was answered from. Each piece of evidence, each
//! observation and the profile carry a SHA-256 the app wrote when it saved the run; a record edited
//! by hand, or cut and glued back, no longer matches. A digest is an identity of bytes, never a
//! measure of how right an answer is.
//!
//! The digest of a value is the SHA-256 of its JSON with every object's keys in the order of the
//! `'en'` collation (then a script's whole-number-first order, which the writer's objects take
//! when it adds the sorted keys), written as `JSON.stringify` writes it. It has to be the writer's
//! bytes exactly, so this is the one place that writes JSON by hand.

use sha2::{Digest, Sha256};

use super::analysis_record::AnalysisRecord;
use super::field_checks::field;
use super::record_value::RecordValue;

fn hex_digest(bytes: &[u8]) -> String {
    let mut text = String::with_capacity(7 + 64);
    text.push_str("sha256:");
    for byte in Sha256::digest(bytes) {
        text.push_str(&format!("{byte:02x}"));
    }
    text
}

/// The digest of the raw text, as a profile snapshot is stamped.
pub fn text_digest(text: &str) -> String {
    hex_digest(text.as_bytes())
}

fn write_canonical(value: &RecordValue, out: &mut String) {
    match value {
        RecordValue::List(items) => {
            out.push('[');
            for (place, item) in items.iter().enumerate() {
                if place > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        RecordValue::Object(entries) => {
            let mut sorted: Vec<(&String, &RecordValue)> = entries.iter().collect();
            sorted.sort_by(|left, right| answer_format::collation::compare_text(left.0, right.0));
            out.push('{');
            for (place, (key, item)) in
                answer_format::key_order::in_object_order(sorted.into_iter())
                    .into_iter()
                    .enumerate()
            {
                if place > 0 {
                    out.push(',');
                }
                out.push_str(&answer_format::json::quote(key));
                out.push(':');
                write_canonical(item, out);
            }
            out.push('}');
        }
        scalar => {
            out.push_str(&answer_format::json::to_string(scalar).unwrap_or_default());
        }
    }
}

/// The digest of a JSON value.
pub fn value_digest(value: &RecordValue) -> String {
    let mut text = String::new();
    write_canonical(value, &mut text);
    text_digest(&text)
}

/// The two-field object a piece of evidence is stamped from: its frontmatter and its body.
fn evidence_content(frontmatter: &RecordValue, body: &RecordValue) -> RecordValue {
    let mut entries = indexmap::IndexMap::new();
    entries.insert("frontmatter".to_string(), frontmatter.clone());
    entries.insert("body".to_string(), body.clone());
    RecordValue::Object(entries)
}

fn text_at<'a>(value: &'a RecordValue, key: &str) -> &'a str {
    value
        .get(key)
        .and_then(RecordValue::as_text)
        .unwrap_or_default()
}

/// What no longer matches in a run, one reason each; none for a review or an intact run.
pub fn evidence_problems(record: &AnalysisRecord) -> Vec<String> {
    let mut problems: Vec<String> = Vec::new();
    let documents = record
        .at("basis")
        .get("documents")
        .and_then(RecordValue::as_list)
        .unwrap_or_default();
    let basis_digest = |slug: &str| {
        documents
            .iter()
            .find(|document| text_at(document, "slug") == slug)
            .map(|document| text_at(document, "digest"))
    };
    if let RecordValue::Object(snapshot) = record.at("profileSnapshot") {
        let markdown = field(snapshot, "markdown").as_text().unwrap_or_default();
        if text_digest(markdown) != field(snapshot, "digest").as_text().unwrap_or_default() {
            problems.push("profile_snapshot_digest_mismatch".to_string());
        }
    }
    let evidence = record.at("evidence").as_list().unwrap_or_default();
    for node in evidence {
        let slug = text_at(node, "slug");
        let content = evidence_content(
            node.get("frontmatter").unwrap_or(&RecordValue::Null),
            node.get("body").unwrap_or(&RecordValue::Null),
        );
        let stamped = text_at(node, "digest");
        if value_digest(&content) != stamped {
            problems.push(format!("evidence_digest_mismatch:{slug}"));
        }
        if basis_digest(slug) != Some(stamped) {
            problems.push(format!("evidence_basis_mismatch:{slug}"));
        }
    }
    let grounded = record
        .at("qualification")
        .get("status")
        .and_then(RecordValue::as_text)
        == Some("grounded");
    if grounded && documents.len() != evidence.len() {
        problems.push("evidence_basis_incomplete".to_string());
    }
    let reads = record.at("toolReads").as_list().unwrap_or_default();
    for observation in record.at("observations").as_list().unwrap_or_default() {
        let call = text_at(observation, "toolCallId");
        let result = observation.get("result").unwrap_or(&RecordValue::Null);
        if value_digest(result) != text_at(observation, "digest") {
            problems.push(format!("observation_digest_mismatch:{call}"));
        }
        let read_completed = reads.iter().any(|read| {
            text_at(read, "id") == call
                && text_at(read, "name") == text_at(observation, "name")
                && text_at(read, "status") == "completed"
        });
        if !read_completed {
            problems.push(format!("observation_read_missing:{call}"));
        }
    }
    problems
}
