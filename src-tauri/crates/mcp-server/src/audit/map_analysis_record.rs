//! `.ontology-atlas/map-analysis.jsonl`: one line per agent session's write, counts only
//! (`docs/specs/2026-11-24-map-analysis-record.md`). Only this server writes it; the app reads it.
//!
//! The file is read only when an analysis begins: the session's first write, its first after
//! [`ANALYSIS_GAP_MS`], or the first whose press id differs from the last. That read folds earlier
//! sessions to their last line in one atomic replace; every other write is one appended line, and a
//! fold that finds the file changed since it was read appends instead, so concurrent sessions lose
//! no line. A line is believed only when it has the shape [`parse_line`] requires.

use std::collections::HashSet;

use answer_format::json::to_string;
use answer_format::whitespace::trim;
use indexmap::IndexMap;
use serde::Serialize;
use serde_json::Value;

use super::agent_heartbeat::{self, PressRead};
use super::record_shapes::{is_commit, is_id, runtime_agent};
use super::unique_id::new_uuid;
use super::utc_time::{iso_8601, parse_iso_8601};
use super::vault_sidecar::{Revision, SidecarError, VaultSidecar};
use super::write_record::{AbilityShare, AreaShare, ConceptEffect, ShareCounts, ShareMeasure};

const RECORD_FILE: &str = "map-analysis.jsonl";
/// A session whose next write comes later than this after its last begins a new analysis.
const ANALYSIS_GAP_MS: i64 = 60 * 60_000;
/// A fold keeps this many sessions, newest last: about 0.8 MB at 400 bytes a line, inside both
/// readers' bound.
const SESSIONS_KEPT: usize = 2000;
/// The most of the file one read takes, from its end; the app's tail read is bounded the same way.
const READ_MAX_BYTES: u64 = 1024 * 1024;
/// The earliest time a line may carry; Atlas wrote none before it (2020-01-01).
const EARLIEST_LINE_MS: i64 = 1_577_836_800_000;
/// How far past the reader's clock a line may be dated, for clocks that disagree a little.
const FUTURE_SKEW_MS: i64 = 24 * 60 * 60_000;
/// The largest count or number a line may hold; past it a line is not believed.
const COUNT_MAX: u64 = 1_000_000_000;
/// A fold carries at most this many lines it cannot parse, the newest, so junk never pushes
/// sessions out.
const BROKEN_LINES_KEPT: usize = 200;
/// The presses one process can return to and go on counting, the most recent kept.
const PRESSES_REMEMBERED: usize = 16;

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
    let ms = parse_iso_8601(value?.as_str()?)?;
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
struct ReadLine {
    analysis: String,
    session: String,
    number: u64,
    at_ms: i64,
    counts: ShareCounts,
}

/// One line as both readers take it, or `None` when it is not a version 1 line: an id, a session, a
/// number from 1 to [`COUNT_MAX`] and a time between 2020 and a day past `now_ms` are required;
/// every other field falls back to nothing.
fn parse_line(text: &str, now_ms: i64) -> Option<ReadLine> {
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
struct ReadAnalysis {
    id: String,
    number: u64,
    counts: ShareCounts,
}

/// The analyses `text` holds, in the order their first line appears.
fn read_analyses(text: &str, now_ms: i64) -> Vec<ReadAnalysis> {
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
fn fold_lines(text: &str, now_ms: i64) -> Vec<String> {
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

/// The analysis a process is counting into.
struct Analysis {
    id: String,
    press: Option<String>,
    number: u64,
    started_at_ms: i64,
    last_at_ms: i64,
    added: HashSet<String>,
    changed: HashSet<String>,
    removed: HashSet<String>,
    counts: ShareCounts,
}

impl Analysis {
    /// What one write did, as slugs; a concept added and then removed in one analysis counts in
    /// neither.
    fn apply(&mut self, effect: &ConceptEffect) {
        for slug in &effect.added {
            self.removed.remove(slug);
            self.added.insert(slug.clone());
        }
        for slug in &effect.changed {
            if !self.added.contains(slug) {
                self.changed.insert(slug.clone());
            }
        }
        for slug in &effect.removed {
            self.changed.remove(slug);
            if !self.added.remove(slug) {
                self.removed.insert(slug.clone());
            }
        }
    }
}

#[derive(Serialize)]
struct ConceptCounts {
    added: usize,
    changed: usize,
    removed: usize,
}

/// The line, in the order the readers' fixtures write it.
#[derive(Serialize)]
struct RecordLine<'a> {
    v: u8,
    analysis: &'a str,
    number: u64,
    session: &'a str,
    origin: &'static str,
    #[serde(rename = "startedAt")]
    started_at: String,
    at: String,
    agent: Option<String>,
    #[serde(rename = "sourceCommit")]
    source_commit: Option<&'a str>,
    #[serde(rename = "sourceDirty")]
    source_dirty: Option<bool>,
    abilities: Option<&'a AbilityShare>,
    areas: Option<&'a AreaShare>,
    concepts: ConceptCounts,
}

/// The lines an analysis's start read from the file, to replace it with in one step.
struct Fold {
    lines: Vec<String>,
    revision: Revision,
}

/// What a call of [`MapAnalysisRecorder::record`] did.
#[derive(Debug, PartialEq, Eq)]
pub enum Recorded {
    Line,
    /// The write changed no concept (a relation that existed, a refused batch), so there is no line.
    NothingChanged,
}

/// How the press the app is running is read, given the vault's sidecar and the time.
pub type PressReader = Box<dyn Fn(&VaultSidecar, i64) -> PressRead + Send>;

/// The inputs a recorder takes from outside, so a test sets the time and the ids.
pub struct RecorderInputs {
    pub now_ms: Box<dyn Fn() -> i64 + Send>,
    pub new_id: Box<dyn FnMut() -> String + Send>,
    pub read_press: PressReader,
}

impl RecorderInputs {
    /// The system clock, random ids and the app's heartbeat.
    pub fn live(now_ms: impl Fn() -> i64 + Send + 'static) -> Self {
        Self {
            now_ms: Box::new(now_ms),
            new_id: Box::new(new_uuid),
            read_press: Box::new(agent_heartbeat::press),
        }
    }
}

/// One server process's writer of the record.
pub struct MapAnalysisRecorder {
    sidecar: VaultSidecar,
    session_id: String,
    inputs: RecorderInputs,
    current: Option<Analysis>,
    /// Analyses of earlier presses this process can go on counting, oldest first.
    presses: Vec<Analysis>,
}

impl MapAnalysisRecorder {
    pub fn new(sidecar: VaultSidecar, mut inputs: RecorderInputs) -> Self {
        let session_id = (inputs.new_id)();
        Self {
            sidecar,
            session_id,
            inputs,
            current: None,
            presses: Vec::new(),
        }
    }

    /// Starts a new analysis, or goes back to a press this process counted into before, and
    /// returns what the file held to fold.
    fn begin(&mut self, at_ms: i64, press: Option<&str>) -> Option<Fold> {
        let stored = self
            .sidecar
            .read_tail(RECORD_FILE, READ_MAX_BYTES)
            .ok()
            .flatten();
        let analyses = read_analyses(stored.as_ref().map_or("", |tail| tail.text.as_str()), at_ms);
        let pressed = press.and_then(|id| analyses.iter().find(|analysis| analysis.id == id));
        let counts = match &self.current {
            Some(current) => current.counts.clone(),
            None => pressed
                .or(analyses.last())
                .map(|analysis| analysis.counts.clone())
                .unwrap_or_default(),
        };
        let number = pressed
            .map(|analysis| analysis.number)
            .unwrap_or_else(|| analyses.last().map_or(0, |analysis| analysis.number) + 1)
            .min(COUNT_MAX);
        let resumed = press
            .and_then(|id| {
                self.presses
                    .iter()
                    .position(|held| held.press.as_deref() == Some(id))
            })
            .map(|position| self.presses.remove(position));
        if let Some(previous) = self.current.take() {
            if previous.press.is_some() {
                self.presses.push(previous);
            }
        }
        let mut next = resumed.unwrap_or_else(|| Analysis {
            id: press.map_or_else(|| (self.inputs.new_id)(), str::to_string),
            press: press.map(str::to_string),
            number,
            started_at_ms: at_ms,
            last_at_ms: at_ms,
            added: HashSet::new(),
            changed: HashSet::new(),
            removed: HashSet::new(),
            counts: ShareCounts::default(),
        });
        next.counts = counts;
        let room = PRESSES_REMEMBERED - usize::from(next.press.is_some());
        if self.presses.len() > room {
            self.presses.drain(..self.presses.len() - room);
        }
        self.current = Some(next);
        stored.map(|tail| Fold {
            lines: fold_lines(&tail.text, at_ms),
            revision: tail.revision,
        })
    }

    /// Records one write. `measure` is called once, for a write that changed a concept and may move
    /// the share. A concept effect that is empty records nothing.
    pub fn record(
        &mut self,
        effect: &ConceptEffect,
        agent: Option<&str>,
        measure: ShareMeasure,
    ) -> Result<Recorded, SidecarError> {
        if effect.is_empty() {
            return Ok(Recorded::NothingChanged);
        }
        let at_ms = (self.inputs.now_ms)();
        let read = (self.inputs.read_press)(&self.sidecar, at_ms);
        let press: Option<String> = match read {
            PressRead::Outside => None,
            PressRead::Press(id) => Some(id),
            PressRead::Unknown => self
                .current
                .as_ref()
                .and_then(|current| current.press.clone()),
        };
        let starts_analysis = match &self.current {
            None => true,
            Some(current) => {
                press != current.press
                    || (press.is_none() && at_ms - current.last_at_ms > ANALYSIS_GAP_MS)
            }
        };
        let fold = if starts_analysis {
            self.begin(at_ms, press.as_deref())
        } else {
            None
        };
        let Some(current) = self.current.as_mut() else {
            return Ok(Recorded::NothingChanged);
        };
        current.apply(effect);
        current.last_at_ms = current.last_at_ms.max(at_ms);
        if let ShareMeasure::Measure(measure) = measure {
            current.counts = measure();
        }
        let line = to_string(&RecordLine {
            v: 1,
            analysis: &current.id,
            number: current.number,
            session: &self.session_id,
            origin: if press.is_some() { "press" } else { "session" },
            started_at: iso_8601(current.started_at_ms),
            at: iso_8601(at_ms),
            agent: agent.and_then(runtime_agent),
            source_commit: current.counts.source_commit.as_deref(),
            source_dirty: current.counts.source_dirty,
            abilities: current.counts.abilities.as_ref(),
            areas: current.counts.areas.as_ref(),
            concepts: ConceptCounts {
                added: current.added.len(),
                changed: current.changed.len(),
                removed: current.removed.len(),
            },
        })
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
        if let Some(fold) = fold {
            let mut folded = fold.lines;
            folded.push(line.clone());
            if self
                .sidecar
                .replace_text(
                    RECORD_FILE,
                    &format!("{}\n", folded.join("\n")),
                    Some(fold.revision),
                )
                .is_ok()
            {
                return Ok(Recorded::Line);
            }
            // Another session changed the file since it was read: append instead.
        }
        self.sidecar.append_line(RECORD_FILE, &line)?;
        Ok(Recorded::Line)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};
    use std::sync::Arc;

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

    struct Rig {
        vault: tempfile::TempDir,
        clock: Arc<AtomicI64>,
        press: Arc<std::sync::Mutex<PressRead>>,
        recorder: MapAnalysisRecorder,
    }

    fn rig(session: &str) -> Rig {
        rig_in(tempfile::tempdir().expect("temp dir"), session)
    }

    fn rig_in(vault: tempfile::TempDir, session: &str) -> Rig {
        let clock = Arc::new(AtomicI64::new(NOW_MS));
        let press = Arc::new(std::sync::Mutex::new(PressRead::Outside));
        let drawn = AtomicUsize::new(0);
        let session = session.to_string();
        let inputs = RecorderInputs {
            now_ms: {
                let clock = Arc::clone(&clock);
                Box::new(move || clock.load(Ordering::SeqCst))
            },
            new_id: Box::new(move || {
                let draw = drawn.fetch_add(1, Ordering::SeqCst);
                if draw == 0 {
                    session.clone()
                } else {
                    format!("analysis-{draw}")
                }
            }),
            read_press: {
                let press = Arc::clone(&press);
                Box::new(move |_, _| {
                    press
                        .lock()
                        .map(|held| held.clone())
                        .unwrap_or(PressRead::Unknown)
                })
            },
        };
        let recorder =
            MapAnalysisRecorder::new(VaultSidecar::new(vault.path().to_path_buf()), inputs);
        Rig {
            vault,
            clock,
            press,
            recorder,
        }
    }

    fn lines(rig: &Rig) -> Vec<Value> {
        std::fs::read_to_string(rig.vault.path().join(".ontology-atlas/map-analysis.jsonl"))
            .unwrap_or_default()
            .lines()
            .map(|line| serde_json::from_str(line).expect("a line"))
            .collect()
    }

    fn effect(added: &[&str], changed: &[&str], removed: &[&str]) -> ConceptEffect {
        let own = |slugs: &[&str]| slugs.iter().map(|slug| (*slug).to_string()).collect();
        ConceptEffect::new(own(added), own(changed), own(removed))
    }

    #[test]
    fn writes_in_one_session_are_one_analysis_whose_counts_grow_and_cancel() {
        let mut rig = rig("s-one");
        let counted = ShareCounts {
            source_commit: Some("abc1234".to_string()),
            source_dirty: Some(true),
            abilities: Some(AbilityShare {
                total: 10,
                off_map: 4,
            }),
            areas: None,
        };
        let measured = counted.clone();
        assert_eq!(
            rig.recorder
                .record(
                    &effect(&["elements/a", "elements/b"], &[], &[]),
                    Some("claude-code"),
                    ShareMeasure::Measure(Box::new(move || measured))
                )
                .expect("records"),
            Recorded::Line
        );
        rig.recorder
            .record(
                &effect(&[], &["elements/b", "capabilities/c"], &["elements/a"]),
                Some("not a runtime: path/x"),
                ShareMeasure::Unchanged,
            )
            .expect("records");
        assert_eq!(
            rig.recorder
                .record(&effect(&[], &[], &[]), None, ShareMeasure::Unchanged)
                .expect("records"),
            Recorded::NothingChanged
        );
        let written = lines(&rig);
        assert_eq!(written.len(), 1 + 1);
        let last = written.last().expect("a line");
        assert_eq!(last["analysis"], written[0]["analysis"]);
        assert_eq!(last["number"], 1);
        assert_eq!(last["session"], "s-one");
        assert_eq!(last["origin"], "session");
        assert_eq!(last["agent"], Value::Null);
        assert_eq!(written[0]["agent"], "claude-code");
        assert_eq!(
            last["abilities"],
            serde_json::json!({"total":10,"offMap":4})
        );
        assert_eq!(last["sourceCommit"], "abc1234");
        assert_eq!(
            last["concepts"],
            serde_json::json!({"added":1,"changed":1,"removed":0})
        );
        let raw =
            std::fs::read_to_string(rig.vault.path().join(".ontology-atlas/map-analysis.jsonl"))
                .expect("record");
        assert!(
            raw.starts_with(r#"{"v":1,"analysis":""#)
                && raw.contains(r#""origin":"session","startedAt":""#),
            "fields keep the order the readers' fixtures write them: {raw}"
        );
    }

    #[test]
    fn a_write_after_an_hours_silence_or_under_another_press_begins_the_next_analysis() {
        let mut rig = rig("s-two");
        let write = |rig: &mut Rig| {
            rig.recorder
                .record(
                    &effect(&["elements/x"], &[], &[]),
                    None,
                    ShareMeasure::Unchanged,
                )
                .expect("records");
        };
        write(&mut rig);
        rig.clock.fetch_add(ANALYSIS_GAP_MS + 1, Ordering::SeqCst);
        write(&mut rig);
        rig.clock.fetch_add(1, Ordering::SeqCst);
        write(&mut rig);
        rig.press
            .lock()
            .map(|mut held| *held = PressRead::Press("press-1".to_string()))
            .expect("lock");
        write(&mut rig);
        // The app's heartbeat cannot be read for a moment: the press goes on.
        rig.press
            .lock()
            .map(|mut held| *held = PressRead::Unknown)
            .expect("lock");
        write(&mut rig);
        let written = lines(&rig);
        // Starting an analysis folds the file to each session's last line, so the second analysis's
        // first line is gone by the time the third begins; its later line stays.
        assert_eq!(written.len(), 4);
        let numbers: Vec<u64> = written
            .iter()
            .filter_map(|line| line["number"].as_u64())
            .collect();
        assert_eq!(numbers, [1, 2, 3, 3]);
        let last = written.last().expect("a line");
        assert_eq!(
            (last["analysis"].as_str(), last["origin"].as_str()),
            (Some("press-1"), Some("press"))
        );
        assert_eq!(
            last["concepts"],
            serde_json::json!({"added":1,"changed":0,"removed":0})
        );
        assert_eq!(last["startedAt"], iso_8601(NOW_MS + ANALYSIS_GAP_MS + 2));
        assert_eq!(
            written[1]["concepts"],
            serde_json::json!({"added":1,"changed":0,"removed":0})
        );
        assert_eq!(
            written[1]["startedAt"],
            iso_8601(NOW_MS + ANALYSIS_GAP_MS + 1)
        );
    }

    #[test]
    fn two_sessions_that_fold_at_once_lose_no_line() {
        let vault = tempfile::tempdir().expect("temp dir");
        let path = vault.path().to_path_buf();
        let writers: Vec<_> = (0..4)
            .map(|writer| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let inputs = RecorderInputs {
                        now_ms: Box::new(|| NOW_MS),
                        new_id: Box::new({
                            let mut draw = 0;
                            move || {
                                draw += 1;
                                format!("w{writer}-{draw}")
                            }
                        }),
                        read_press: Box::new(|_, _| PressRead::Outside),
                    };
                    let mut recorder = MapAnalysisRecorder::new(VaultSidecar::new(path), inputs);
                    for index in 0..20 {
                        recorder
                            .record(
                                &ConceptEffect::new(
                                    vec![format!("elements/w{writer}-{index}")],
                                    vec![],
                                    vec![],
                                ),
                                None,
                                ShareMeasure::Unchanged,
                            )
                            .expect("records");
                    }
                })
            })
            .collect();
        for writer in writers {
            writer.join().expect("joined");
        }
        let text = std::fs::read_to_string(path.join(".ontology-atlas/map-analysis.jsonl"))
            .expect("record");
        let read: Vec<ReadLine> = text
            .lines()
            .filter_map(|line| parse_line(line, NOW_MS))
            .collect();
        assert_eq!(read.len(), text.lines().count(), "every line is whole");
        for writer in 0..4 {
            let session = format!("w{writer}-1");
            assert!(
                read.iter().any(|line| line.session == session),
                "session {session} left no line"
            );
        }
    }
}
