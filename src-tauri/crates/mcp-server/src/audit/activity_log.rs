//! `.ontology-atlas/activity.jsonl`: the local audit log. One line per successful write, appended
//! after the write, and nothing is transmitted. The app reads it to show what an agent did.
//!
//! A line is `{"v":1,"at":ISO,"tool":…,"target":…,"summary":…,"agent":…,"why":…}`; a new field is
//! optional and keeps `v`. Past [`MAX_LINES`] the older half is dropped, which is simple and does
//! not depend on timestamps.

use answer_format::json::to_string;
use serde::Serialize;

use super::write_record::ActivityContent;
use super::AuditError;
use answer_format::iso_time::to_iso_string;
use confined_files::{SidecarError, VaultSidecar};

const ACTIVITY_FILE: &str = "activity.jsonl";
/// Rotation cap: past it, the first half is dropped.
pub const MAX_LINES: usize = 4000;
/// A log this large is not rotated in memory; it is left for a person to look at.
const ROTATION_MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Serialize)]
struct ActivityLine<'a> {
    v: u8,
    at: String,
    tool: &'a str,
    target: &'a str,
    summary: &'a str,
    agent: Option<&'a str>,
    why: Option<&'a str>,
}

/// The line for one write, as text.
fn line_for(
    tool: &str,
    content: &ActivityContent,
    agent: Option<&str>,
    now_ms: i64,
) -> Result<String, serde_json::Error> {
    to_string(&ActivityLine {
        v: 1,
        at: to_iso_string(now_ms),
        tool,
        target: &content.target,
        summary: &content.summary,
        agent: agent.filter(|name| !name.is_empty()),
        why: content.why.as_deref().filter(|why| !why.is_empty()),
    })
}

/// Appends the line for a write by `tool`, then drops the older half of a log that grew past
/// [`MAX_LINES`]. A rotation that finds the file changed under it is skipped: the next write tries
/// again, and no line another writer appended is lost.
pub fn append(
    sidecar: &VaultSidecar,
    tool: &str,
    content: &ActivityContent,
    agent: Option<&str>,
    now_ms: i64,
) -> Result<(), AuditError> {
    let line = line_for(tool, content, agent, now_ms)?;
    sidecar.append_line(ACTIVITY_FILE, &line)?;
    // A failed rotation never hides that the line was recorded.
    let _ = rotate_if_needed(sidecar);
    Ok(())
}

fn rotate_if_needed(sidecar: &VaultSidecar) -> Result<(), SidecarError> {
    if sidecar.count_lines(ACTIVITY_FILE)? <= MAX_LINES {
        return Ok(());
    }
    let Some(stored) = sidecar.read_text(ACTIVITY_FILE, ROTATION_MAX_BYTES)? else {
        return Ok(());
    };
    let lines: Vec<&str> = stored
        .text
        .split('\n')
        .filter(|line| !line.is_empty())
        .collect();
    let kept = lines.get(lines.len() / 2..).unwrap_or_default();
    sidecar.replace_text(
        ACTIVITY_FILE,
        &format!("{}\n", kept.join("\n")),
        Some(stored.revision),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn content() -> ActivityContent {
        ActivityContent {
            target: "elements/a".to_string(),
            summary: "add_concepts 1 rows written".to_string(),
            why: None,
            logged_as: None,
        }
    }

    #[test]
    fn a_line_has_the_fields_in_the_order_readers_know_and_no_name_is_invented() {
        assert_eq!(
            line_for("add_concepts", &content(), None, 1_790_000_000_000)
                .as_deref()
                .ok(),
            Some(
                r#"{"v":1,"at":"2026-09-21T14:13:20.000Z","tool":"add_concepts","target":"elements/a","summary":"add_concepts 1 rows written","agent":null,"why":null}"#
            )
        );
        let named = ActivityContent {
            why: Some("because".to_string()),
            logged_as: None,
            ..content()
        };
        let line =
            line_for("add_relations", &named, Some("Línea \"q\" \n \u{2028}"), 0).expect("writes");
        assert!(
            line.ends_with("\"agent\":\"Línea \\\"q\\\" \\n \u{2028}\",\"why\":\"because\"}"),
            "{line}"
        );
        assert!(!line.contains('\n'));
    }

    #[test]
    fn a_log_past_the_cap_drops_its_older_half_and_keeps_every_line_written_since() {
        let vault = tempfile::tempdir().expect("temp dir");
        let sidecar = VaultSidecar::new(vault.path().to_path_buf());
        for index in 0..=MAX_LINES {
            append(
                &sidecar,
                "patch_concept",
                &ActivityContent {
                    target: format!("t{index}"),
                    ..content()
                },
                None,
                1_790_000_000_000,
            )
            .expect("appends");
        }
        let text = std::fs::read_to_string(vault.path().join(".ontology-atlas/activity.jsonl"))
            .expect("log");
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), (MAX_LINES + 1).div_ceil(2));
        assert!(lines
            .first()
            .is_some_and(|line| line.contains("\"target\":\"t2000\"")));
        assert!(lines
            .last()
            .is_some_and(|line| line.contains(&format!("\"target\":\"t{MAX_LINES}\""))));
    }
}
