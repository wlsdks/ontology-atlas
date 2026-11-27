//! What a vault's kinds, identities and review marks are: the mechanical shape of a node. The meaning
//! of each kind is in `docs/ONTOLOGY-ATLAS-SPEC.md`; this file holds what a validator can check.

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use sha2::{Digest, Sha256};

use crate::frontmatter::{Frontmatter, Value};

/// The kinds a node may carry, and the one the vault's own README carries. Anything else is
/// reported as unrecognised.
pub const KNOWN_KINDS: [&str; 6] = [
    "project",
    "domain",
    "capability",
    "element",
    "document",
    "vault-readme",
];

/// The folder a kind lives in; `project` and `document` live at the root, as does any kind a vault
/// invents.
pub fn folder_for_kind(kind: &str) -> &'static str {
    match kind {
        "domain" => "domains/",
        "capability" => "capabilities/",
        "element" => "elements/",
        _ => "",
    }
}

/// Fields a kind should carry so the tree can place it: advisory, never an error.
fn expected_fields(kind: &str) -> &'static [&'static str] {
    match kind {
        "capability" | "element" => &["domain"],
        _ => &[],
    }
}

/// The expected fields of `kind` that `frontmatter` lacks or leaves blank.
pub fn missing_expected_fields(kind: &str, frontmatter: &Frontmatter) -> Vec<&'static str> {
    expected_fields(kind)
        .iter()
        .copied()
        .filter(|key| match frontmatter.get(key) {
            None => true,
            Some(Value::Text(text)) => trim(text).is_empty(),
            Some(_) => false,
        })
        .collect()
}

const UID_ISSUE: &str = "`uid:` must be a lowercase UUIDv4 generated once for this node (example: 01890f3e-7b5d-4c0a-8f14-123456789abc). It is immutable and must not be derived from slug, title, or path.";

/// Whether `uid` is a lowercase UUIDv4: `xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx`.
pub fn is_node_uid(uid: &str) -> bool {
    let groups: Vec<&str> = uid.split('-').collect();
    let [first, second, third, fourth, fifth] = groups.as_slice() else {
        return false;
    };
    let lower_hex = |text: &str, length: usize| {
        text.len() == length
            && text
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    };
    lower_hex(first, 8)
        && lower_hex(second, 4)
        && third.starts_with('4')
        && lower_hex(third, 4)
        && fourth.starts_with(['8', '9', 'a', 'b'])
        && lower_hex(fourth, 4)
        && lower_hex(fifth, 12)
}

/// What is wrong with a `uid:` value, or `None` when it is a lowercase UUIDv4.
pub fn node_uid_issue(uid: Option<&Value>) -> Option<&'static str> {
    match uid {
        Some(Value::Text(text)) if is_node_uid(text) => None,
        _ => Some(UID_ISSUE),
    }
}

/// What `merged_uids:` holds, judged against the surviving `uid:`.
#[derive(Debug, PartialEq, Eq)]
pub enum MergedUids {
    /// Absent, or an ascending, duplicate-free set of other identities.
    Canonical,
    /// Every entry is valid but the set is not ascending and duplicate-free.
    NotCanonical,
    Invalid(&'static str),
}

pub fn inspect_merged_uids(uid: &str, merged: Option<&Value>) -> MergedUids {
    let Some(merged) = merged else {
        return MergedUids::Canonical;
    };
    let Some(items) = merged.as_list() else {
        return MergedUids::Invalid("`merged_uids:` must be an array of lowercase UUIDv4 values.");
    };
    for item in items {
        if !is_node_uid(item) {
            return MergedUids::Invalid("`merged_uids:` may contain only lowercase UUIDv4 values.");
        }
        if item == uid {
            return MergedUids::Invalid(
                "`merged_uids:` must not repeat the surviving node's `uid:`.",
            );
        }
    }
    let mut canonical: Vec<&String> = items.iter().collect();
    canonical.sort_by(|left, right| compare_text(left, right));
    canonical.dedup();
    let same = canonical.len() == items.len()
        && canonical
            .iter()
            .zip(items)
            .all(|(left, right)| *left == right);
    if same {
        MergedUids::Canonical
    } else {
        MergedUids::NotCanonical
    }
}

pub const REVIEW_STATE_KEY: &str = "review_state";
pub const REVIEW_NOTE_KEY: &str = "review_note";
pub const REVIEWED_BY_KEY: &str = "reviewed_by";
pub const REVIEWED_AT_KEY: &str = "reviewed_at";
const REVIEWED_DIGEST_KEY: &str = "reviewed_digest";
const EVIDENCE_CHECKED_KEY: &str = "evidence_checked";
const REVIEW_KEYS: [&str; 5] = [
    REVIEW_STATE_KEY,
    REVIEW_NOTE_KEY,
    REVIEWED_BY_KEY,
    REVIEWED_AT_KEY,
    REVIEWED_DIGEST_KEY,
];

/// A person reserved this node and only a person clears it.
pub const REVIEW_STATE_HUMAN_DECIDES: &str = "human_decides";
const REVIEW_STATE_CONFIRMED: &str = "confirmed";

/// Whether an approval still describes the node.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum Currentness {
    #[serde(rename = "not-confirmed")]
    NotConfirmed,
    /// Confirmed, but the file never carried a binding to what was confirmed.
    #[serde(rename = "unknown")]
    Unknown,
    #[serde(rename = "current")]
    Current,
    #[serde(rename = "changed-since-review")]
    ChangedSinceReview,
}

/// The binding of an approval to the meaning it approved: 32 hex characters of a SHA-256 over every
/// key that carries meaning (not the review marks, a display name or a canvas position) and the
/// body. Computed over `JSON.stringify` of the pairs so a digest written by either server matches.
fn review_digest(frontmatter: &Frontmatter, body: &str) -> String {
    let ignored_prefixes = ["display", "canvasPosition"];
    let mut meaning: Vec<(&str, &Value)> = frontmatter
        .iter()
        .filter(|(key, _)| {
            let key = key.as_str();
            !REVIEW_KEYS.contains(&key)
                && key != EVIDENCE_CHECKED_KEY
                && !ignored_prefixes.iter().any(|prefix| {
                    key == *prefix
                        || key
                            .strip_prefix(prefix)
                            .is_some_and(|rest| rest.starts_with('_'))
                })
        })
        .map(|(key, value)| (key.as_str(), value))
        .collect();
    meaning.sort_by(|(left, _), (right, _)| compare_text(left, right));
    let payload = answer_format::json::to_string(&(meaning, trim(body))).unwrap_or_default();
    let digest = Sha256::digest(payload.as_bytes());
    let mut hex = String::with_capacity(64);
    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }
    hex.truncate(32);
    hex
}

pub fn review_currentness(frontmatter: &Frontmatter, body: &str) -> Currentness {
    if frontmatter.text(REVIEW_STATE_KEY) != Some(REVIEW_STATE_CONFIRMED) {
        return Currentness::NotConfirmed;
    }
    let recorded = frontmatter.text(REVIEWED_DIGEST_KEY).filter(|text| {
        text.len() == 32
            && text
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    });
    match recorded {
        None => Currentness::Unknown,
        Some(recorded) if recorded == review_digest(frontmatter, body) => Currentness::Current,
        Some(_) => Currentness::ChangedSinceReview,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_uid_is_a_lowercase_uuid_version_4() {
        assert!(is_node_uid("01890f3e-7b5d-4c0a-8f14-123456789abc"));
        assert!(!is_node_uid("01890F3E-7b5d-4c0a-8f14-123456789abc"));
        assert!(!is_node_uid("01890f3e-7b5d-1c0a-8f14-123456789abc"));
        assert!(!is_node_uid("01890f3e-7b5d-4c0a-cf14-123456789abc"));
        assert!(!is_node_uid("01890f3e7b5d4c0a8f14123456789abc"));
    }

    #[test]
    fn merged_identities_must_be_other_nodes_and_ascending() {
        let uid = "01890f3e-7b5d-4c0a-8f14-123456789abc";
        let list =
            |items: &[&str]| Value::List(items.iter().map(|item| (*item).to_string()).collect());
        let low = "00000000-0000-4000-8000-000000000001";
        let high = "ffffffff-0000-4000-8000-000000000002";
        assert_eq!(inspect_merged_uids(uid, None), MergedUids::Canonical);
        assert_eq!(
            inspect_merged_uids(uid, Some(&list(&[low, high]))),
            MergedUids::Canonical
        );
        assert_eq!(
            inspect_merged_uids(uid, Some(&list(&[high, low]))),
            MergedUids::NotCanonical
        );
        assert_eq!(
            inspect_merged_uids(uid, Some(&list(&[low, low]))),
            MergedUids::NotCanonical
        );
        assert!(matches!(
            inspect_merged_uids(uid, Some(&list(&[uid]))),
            MergedUids::Invalid(_)
        ));
        assert!(matches!(
            inspect_merged_uids(uid, Some(&Value::Text("x".into()))),
            MergedUids::Invalid(_)
        ));
    }
}
