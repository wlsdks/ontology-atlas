//! The map analysis record as its readers take it: which lines are believed, what an analysis is
//! made of the lines that survive, and the fold that keeps each session's last line. The app reads
//! the same file with the same rules, so a line is believed only in the shape [`parse_line`]
//! requires.

use answer_format::iso_time::parse_iso;
use answer_format::whitespace::trim;
use indexmap::IndexMap;
use serde_json::Value;

use super::record_shapes::{is_commit, is_id};
use super::write_record::{AbilityShare, AreaShare, ShareCounts};

/// A fold keeps this many sessions, newest last: about 0.8 MB at 400 bytes a line, inside both
/// readers' bound.
const SESSIONS_KEPT: usize = 2000;
/// The earliest time a line may carry; Atlas wrote none before it (2020-01-01).
const EARLIEST_LINE_MS: i64 = 1_577_836_800_000;
/// How far past the reader's clock a line may be dated, for clocks that disagree a little.
const FUTURE_SKEW_MS: i64 = 24 * 60 * 60_000;
/// The largest count or number a line may hold; past it a line is not believed.
pub(super) const COUNT_MAX: u64 = 1_000_000_000;
/// A fold carries at most this many lines it cannot parse, the newest, so junk never pushes
/// sessions out.
const BROKEN_LINES_KEPT: usize = 200;

fn count_of(value: Option<&Value>) -> Option<u64> {
    let number = value?.as_f64()?;
    #[allow(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "a whole number between 0 and a billion, checked first"
    )]
    (number.fract() == 0.0 && (0.0..=COUNT_MAX as f64).contains(&number)).then_some(number as u64)
}

fn time_of(value: Option<&Value>, now_ms: i64) -> Option<i64> {
    let ms = parse_iso(value?.as_str()?)?;
    (EARLIEST_LINE_MS..=now_ms + FUTURE_SKEW_MS)
        .contains(&ms)
        .then_some(ms)
}

/// A pair of counts where the part never exceeds the total.
fn pair_of(value: Option<&Value>, total_key: &str, part_key: &str) -> Option<(u64, u64)> {
    let object = value?.as_object()?;
    let total = count_of(object.get(total_key))?;
    let part = count_of(object.get(part_key))?;
    (part <= total).then_some((total, part))
}

/// One line as every reader takes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ReadLine {
    pub(super) analysis: String,
    pub(super) session: String,
    pub(super) number: u64,
    pub(super) at_ms: i64,
    pub(super) counts: ShareCounts,
}

/// One line as both readers take it, or `None` when it is not a version 1 line: an id, a session, a
/// number from 1 to [`COUNT_MAX`] and a time between 2020 and a day past `now_ms` are required;
/// every other field falls back to nothing.
pub(super) fn parse_line(text: &str, now_ms: i64) -> Option<ReadLine> {
    let raw: Value = serde_json::from_str(text).ok()?;
    let object = raw.as_object()?;
    if object.get("v")?.as_f64() != Some(1.0) {
        return None;
    }
    let analysis = object.get("analysis")?.as_str().filter(|id| is_id(id))?;
    let session = object.get("session")?.as_str().filter(|id| is_id(id))?;
    let number = count_of(object.get("number")).filter(|number| *number >= 1)?;
    let at_ms = time_of(object.get("at"), now_ms)?;
    Some(ReadLine {
        analysis: analysis.to_string(),
        session: session.to_string(),
        number,
        at_ms,
        counts: ShareCounts {
            source_commit: object
                .get("sourceCommit")
                .and_then(Value::as_str)
                .filter(|commit| is_commit(commit))
                .map(str::to_lowercase),
            source_dirty: object.get("sourceDirty").and_then(Value::as_bool),
            abilities: pair_of(object.get("abilities"), "total", "offMap")
                .map(|(total, off_map)| AbilityShare { total, off_map }),
            areas: pair_of(object.get("areas"), "total", "notMapped")
                .map(|(total, not_mapped)| AreaShare { total, not_mapped }),
        },
    })
}

/// An analysis as the record's lines read: the last line of each session within it, the latest of
/// those giving its counts, and a number counted on from the first line's.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ReadAnalysis {
    pub(super) id: String,
    pub(super) number: u64,
    pub(super) counts: ShareCounts,
}

/// The analyses `text` holds, in the order their first line appears.
pub(super) fn read_analyses(text: &str, now_ms: i64) -> Vec<ReadAnalysis> {
    let mut by_analysis: IndexMap<String, IndexMap<String, ReadLine>> = IndexMap::new();
    let mut first_number: Option<u64> = None;
    for raw in text.split('\n') {
        if trim(raw).is_empty() {
            continue;
        }
        let Some(line) = parse_line(raw, now_ms) else {
            continue;
        };
        first_number.get_or_insert(line.number);
        by_analysis
            .entry(line.analysis.clone())
            .or_default()
            .insert(line.session.clone(), line);
    }
    let first_number = first_number.unwrap_or(0);
    by_analysis
        .into_iter()
        .zip(0_u64..)
        .filter_map(|((id, sessions), index)| {
            // The latest line wins; of two at one time, the one that came later in the file.
            let latest = sessions.into_values().reduce(|last, line| {
                if line.at_ms >= last.at_ms {
                    line
                } else {
                    last
                }
            })?;
            Some(ReadAnalysis {
                id,
                number: first_number + index,
                counts: latest.counts,
            })
        })
        .collect()
}

#[derive(PartialEq, Eq, Hash)]
enum Kept {
    Session(String, String),
    Broken(usize),
}

/// Every session's last line, sessions in the order they first appear, the newest
/// [`BROKEN_LINES_KEPT`] lines that do not parse kept where they stood, and at most
/// [`SESSIONS_KEPT`] entries in all, the newest.
pub(super) fn fold_lines(text: &str, now_ms: i64) -> Vec<String> {
    let mut kept: IndexMap<Kept, String> = IndexMap::new();
    for (index, raw) in text.split('\n').enumerate() {
        let line = trim(raw);
        if line.is_empty() {
            continue;
        }
        let key = match parse_line(line, now_ms) {
            Some(read) => Kept::Session(read.analysis, read.session),
            None => Kept::Broken(index),
        };
        // An existing key keeps its first place, so analyses keep their order.
        kept.insert(key, line.to_string());
    }
    let mut broken_left = kept
        .keys()
        .filter(|key| matches!(key, Kept::Broken(_)))
        .count();
    let mut lines = Vec::with_capacity(kept.len());
    for (key, line) in kept {
        if matches!(key, Kept::Broken(_)) {
            let drop_it = broken_left > BROKEN_LINES_KEPT;
            broken_left -= 1;
            if drop_it {
                continue;
            }
        }
        lines.push(line);
    }
    if lines.len() > SESSIONS_KEPT {
        lines.drain(..lines.len() - SESSIONS_KEPT);
    }
    lines
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    const NOW_MS: i64 = 1_790_000_000_000;

    /// The analysis ids of a record mapped to their numbers.
    fn numbers(text: &str, now_ms: i64) -> HashMap<String, u64> {
        read_analyses(text, now_ms)
            .into_iter()
            .map(|analysis| (analysis.id, analysis.number))
            .collect()
    }

    fn line(fields: &str) -> String {
        let base = r#""v":1,"analysis":"a1","number":1,"session":"s1","origin":"session","startedAt":"2026-09-21T13:00:00.000Z","at":"2026-09-21T14:00:00.000Z","agent":"claude-code","sourceCommit":"abc1234def5678abc1234def5678abc1234def56","sourceDirty":false,"abilities":{"total":40,"offMap":15},"areas":{"total":6,"notMapped":2},"concepts":{"added":3,"changed":1,"removed":0}"#;
        let mut object: serde_json::Map<String, Value> =
            serde_json::from_str(&format!("{{{base}}}")).expect("base");
        let overrides: serde_json::Map<String, Value> =
            serde_json::from_str(&format!("{{{fields}}}")).expect("fields");
        object.extend(overrides);
        serde_json::to_string(&object).expect("line")
    }

    #[test]
    fn lines_are_believed_only_in_the_shape_both_readers_require() {
        let read = |fields: &str| parse_line(&line(fields), NOW_MS);
        assert!(read("").is_some());
        for refused in [
            r#""v":2"#,
            r#""analysis":"../../etc/passwd""#,
            r#""at":"yesterday""#,
            r#""number":0"#,
            r#""number":9007199254740991"#,
            r#""at":"2019-12-31T23:59:59.000Z""#,
            r#""at":"2026-09-22T14:13:21.000Z""#,
        ] {
            assert!(read(refused).is_none(), "{refused}");
        }
        let impossible = read(r#""abilities":{"total":4,"offMap":9},"areas":{"total":-1,"notMapped":0},"sourceCommit":"main""#)
            .expect("still a line");
        assert_eq!(
            (
                impossible.counts.abilities,
                impossible.counts.areas,
                impossible.counts.source_commit
            ),
            (None, None, None)
        );
        assert_eq!(
            read(r#""abilities":{"total":1e300,"offMap":2}"#)
                .expect("a line")
                .counts
                .abilities,
            None
        );
    }

    #[test]
    fn two_sessions_that_minted_one_number_are_listed_in_file_order_and_renumbered() {
        let text = format!(
            "{}\n{}\n",
            line(r#""analysis":"a1","number":3,"session":"s1""#),
            line(r#""analysis":"a2","number":3,"session":"s2","at":"2026-09-21T14:01:00.000Z""#)
        );
        let analyses = numbers(&text, NOW_MS);
        assert_eq!(
            (analyses.get("a1"), analyses.get("a2")),
            (Some(&3), Some(&4))
        );
    }

    #[test]
    fn a_fold_keeps_each_sessions_last_line_in_place_and_the_newest_broken_lines() {
        let mut text = String::new();
        for index in 0..260 {
            text.push_str(&format!("{{\"junk\":{index}\n"));
        }
        text.push_str(&format!(
            "{}\n",
            line(r#""session":"s1","at":"2026-09-21T14:00:00.000Z""#)
        ));
        text.push_str(&format!(
            "{}\n",
            line(r#""analysis":"a2","session":"s2","at":"2026-09-21T14:02:00.000Z""#)
        ));
        text.push_str(&format!(
            "{}\n",
            line(r#""session":"s1","at":"2026-09-21T14:05:00.000Z""#)
        ));
        let folded = fold_lines(&text, NOW_MS);
        assert_eq!(folded.len(), 200 + 2);
        assert!(folded
            .first()
            .is_some_and(|first| first.contains("\"junk\":60")));
        let position = |needle: &str| folded.iter().position(|line| line.contains(needle));
        assert!(position("14:05:00")
            .zip(position("\"a2\""))
            .is_some_and(|(s1, a2)| s1 < a2));
        assert!(position("14:00:00").is_none());
    }
}
