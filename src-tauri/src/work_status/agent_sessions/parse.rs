//! Claude Code's session list, reduced to what a room needs. The schema is promised to no one, so
//! every value comes from a closed list and anything else means unknown.

use std::path::PathBuf;

use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};

use super::name::SessionName;

const KINDS: [&str; 2] = ["interactive", "background"];
const STATUSES: [&str; 3] = ["busy", "waiting", "idle"];
const WAITS: [&str; 5] = [
    "permission prompt",
    "sandbox request",
    "input needed",
    "dialog open",
    "worker request",
];
const BACKGROUND_STATES: [&str; 5] = ["working", "blocked", "done", "failed", "stopped"];

/// What a session says of itself, as far as a room shows it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SessionState {
    WaitingApproval,
    WaitingAnswer,
    Working,
    Replied,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ListedSession {
    pub(crate) pid: u32,
    /// Milliseconds since the epoch: when the session began, at or after its process did.
    pub(crate) started_at_ms: i64,
    pub(crate) folder: PathBuf,
    pub(crate) state: SessionState,
    /// Absent when the person switched names off, or the entry has no usable one.
    pub(crate) name: Option<SessionName>,
}

/// One entry of the list. A field outside these makes the entry unknown. The ids are never read
/// into a value; the name is read only while the person leaves names on.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    pid: Option<u32>,
    cwd: Option<String>,
    #[serde(rename = "startedAt")]
    started_at: Option<i64>,
    kind: Option<String>,
    status: Option<String>,
    #[serde(rename = "waitingFor")]
    waiting_for: Option<String>,
    state: Option<String>,
    #[serde(default)]
    name: Option<serde_json::Value>,
    #[serde(rename = "sessionId", default)]
    _session_id: IgnoredAny,
    #[serde(rename = "id", default)]
    _id: IgnoredAny,
}

/// The entries that are wholly understood, with their names when `keep_names`; `None` when the
/// text is not a JSON list. O(entries).
pub(crate) fn parse_sessions(text: &str, keep_names: bool) -> Option<Vec<ListedSession>> {
    let entries: Vec<serde_json::Value> = serde_json::from_str(text).ok()?;
    Some(
        entries
            .into_iter()
            .filter_map(|entry| Entry::deserialize(entry).ok())
            .filter_map(|entry| listed(entry, keep_names))
            .collect(),
    )
}

fn listed(entry: Entry, keep_names: bool) -> Option<ListedSession> {
    if !KINDS.contains(&entry.kind.as_deref()?) {
        return None;
    }
    Some(ListedSession {
        pid: entry.pid?,
        started_at_ms: entry.started_at?,
        folder: PathBuf::from(entry.cwd?),
        state: session_state(
            entry.status.as_deref(),
            entry.waiting_for.as_deref(),
            entry.state.as_deref(),
        )?,
        name: match (keep_names, entry.name) {
            (true, Some(serde_json::Value::String(raw))) => SessionName::from_raw(&raw),
            _ => None,
        },
    })
}

/// The room state for one entry's own words; `None` when any of them is outside its list, or when
/// together they say nothing a room shows (a stopped session, a wait with no reason).
pub(crate) fn session_state(
    status: Option<&str>,
    waiting_for: Option<&str>,
    state: Option<&str>,
) -> Option<SessionState> {
    let known = |value: Option<&str>, list: &[&str]| value.is_none_or(|text| list.contains(&text));
    if !known(status, &STATUSES) || !known(waiting_for, &WAITS) || !known(state, &BACKGROUND_STATES)
    {
        return None;
    }
    match (status, waiting_for, state) {
        (Some("waiting"), Some("permission prompt" | "sandbox request"), _) => {
            Some(SessionState::WaitingApproval)
        }
        (Some("waiting"), Some(_), _) | (_, _, Some("blocked")) => {
            Some(SessionState::WaitingAnswer)
        }
        (Some("waiting"), None, _) => None,
        (_, _, Some("failed")) => Some(SessionState::Failed),
        (Some("busy"), _, _) | (_, _, Some("working")) => Some(SessionState::Working),
        (Some("idle"), _, _) | (_, _, Some("done")) => Some(SessionState::Replied),
        _ => None,
    }
}
