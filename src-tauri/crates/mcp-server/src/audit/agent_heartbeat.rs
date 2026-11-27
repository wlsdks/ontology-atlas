//! What the app tells the server about the agent it started: `.ontology-atlas/agent-activity.json`.
//! The app replaces it at every tool call; the server only reads it, and never invents a name.

use answer_format::whitespace::trim;
use serde_json::Value;

use super::record_shapes::is_id;
use answer_format::iso_time::parse_iso;
use confined_files::VaultSidecar;

const HEARTBEAT_FILE: &str = "agent-activity.json";
/// A heartbeat is a few hundred bytes; a larger file is not the app's and is not read.
const HEARTBEAT_MAX_BYTES: u64 = 1024 * 1024;
/// A press id in the heartbeat holds at most this long past now, whatever its `until` says; the
/// app writes 15 minutes.
const PRESS_MAX_AHEAD_MS: i64 = 15 * 60_000;

fn read(sidecar: &VaultSidecar) -> Option<Value> {
    let stored = sidecar
        .read_text(HEARTBEAT_FILE, HEARTBEAT_MAX_BYTES)
        .ok()??;
    serde_json::from_str(&stored.text).ok()
}

/// The agent name for one audit line: the heartbeat's (a person registered it) before the client's
/// own name from `initialize` (a default), and no name at all when neither exists.
pub fn agent_name(sidecar: &VaultSidecar, client_name: &str) -> Option<String> {
    let heartbeat = read(sidecar)
        .and_then(|heartbeat| {
            heartbeat
                .get("agent")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .map(|agent| trim(&agent).to_string())
        .filter(|agent| !agent.is_empty());
    heartbeat.or_else(|| {
        let client = trim(client_name);
        (!client.is_empty()).then(|| client.to_string())
    })
}

/// Which map analysis the request running now belongs to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PressRead {
    /// No press: the request is a session's own.
    Outside,
    /// The app is running a press with this id.
    Press(String),
    /// The file could not be read or parsed twice running. The app replaces it at every tool call,
    /// so a failed read says nothing about the press.
    Unknown,
}

/// The press id the heartbeat names for the request running now: id-shaped, with an `until` in the
/// future and at most 15 minutes ahead.
pub fn press(sidecar: &VaultSidecar, now_ms: i64) -> PressRead {
    for _attempt in 0..2 {
        let stored = match sidecar.read_text(HEARTBEAT_FILE, HEARTBEAT_MAX_BYTES) {
            Ok(Some(stored)) => stored,
            Ok(None) => return PressRead::Outside,
            Err(_) => continue,
        };
        let Ok(heartbeat) = serde_json::from_str::<Value>(&stored.text) else {
            continue;
        };
        return press_of(&heartbeat, now_ms).map_or(PressRead::Outside, PressRead::Press);
    }
    PressRead::Unknown
}

fn press_of(heartbeat: &Value, now_ms: i64) -> Option<String> {
    let press = heartbeat.get("mapAnalysis")?;
    let id = press.get("id")?.as_str().filter(|id| is_id(id))?;
    let until = parse_iso(press.get("until")?.as_str()?)?;
    (until > now_ms && until <= now_ms + PRESS_MAX_AHEAD_MS).then(|| id.to_string())
}
