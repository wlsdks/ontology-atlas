//! `.ontology-atlas/map-analysis.jsonl`: one line per agent session's write, counts only
//! (`docs/specs/2026-11-24-map-analysis-record.md`). Only this server writes it; the app reads it.
//!
//! The file is read only when an analysis begins: the session's first write, its first after
//! [`ANALYSIS_GAP_MS`], or the first whose press id differs from the last. That read folds earlier
//! sessions to their last line in one atomic replace; every other write is one appended line, and a
//! fold that finds the file changed since it was read appends instead, so concurrent sessions lose
//! no line. A line is believed only when it has the shape [`parse_line`] requires.

use std::collections::HashSet;

use answer_format::iso_time::to_iso_string;
use answer_format::json::to_string;
use confined_files::{Revision, VaultSidecar};
use serde::Serialize;

use super::agent_heartbeat::{self, PressRead};
use super::map_analysis_lines::{fold_lines, read_analyses, COUNT_MAX};
use super::record_shapes::runtime_agent;
use super::write_record::{AbilityShare, AreaShare, ConceptEffect, ShareCounts, ShareMeasure};
use super::AuditError;

const RECORD_FILE: &str = "map-analysis.jsonl";
/// A session whose next write comes later than this after its last begins a new analysis.
const ANALYSIS_GAP_MS: i64 = 60 * 60_000;
/// The most of the file one read takes, from its end; the app's tail read is bounded the same way.
const READ_MAX_BYTES: u64 = 1024 * 1024;
/// The presses one process can return to and go on counting, the most recent kept.
const PRESSES_REMEMBERED: usize = 16;

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

/// A fresh random id (version 4 UUID) for a session or an analysis.
fn new_id_text() -> String {
    #[cfg(feature = "differential-inputs")]
    if let Some(pinned) = crate::pinned_inputs::next_id("map-analysis-log") {
        return pinned;
    }
    uuid::Uuid::new_v4().to_string()
}

impl RecorderInputs {
    /// The system clock, random ids and the app's heartbeat.
    pub fn live(now_ms: impl Fn() -> i64 + Send + 'static) -> Self {
        Self {
            now_ms: Box::new(now_ms),
            new_id: Box::new(new_id_text),
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
    ) -> Result<Recorded, AuditError> {
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
            started_at: to_iso_string(current.started_at_ms),
            at: to_iso_string(at_ms),
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
        })?;
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
    use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};
    use std::sync::Arc;

    use serde_json::Value;

    use super::super::map_analysis_lines::{parse_line, ReadLine};
    use super::*;

    const NOW_MS: i64 = 1_790_000_000_000;

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
        assert_eq!(
            last["startedAt"],
            to_iso_string(NOW_MS + ANALYSIS_GAP_MS + 2)
        );
        assert_eq!(
            written[1]["concepts"],
            serde_json::json!({"added":1,"changed":0,"removed":0})
        );
        assert_eq!(
            written[1]["startedAt"],
            to_iso_string(NOW_MS + ANALYSIS_GAP_MS + 1)
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
