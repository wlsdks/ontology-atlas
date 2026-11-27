//! Tools only a test build has, to exercise what a real tool would: an unexpected stop, a call that
//! waits for a person, and arguments as the handler receives them.

#![allow(
    clippy::disallowed_methods,
    reason = "a test build's tool writes a file the way a handler's caller sees it written"
)]

use std::time::{Duration, Instant};

use serde::Serialize;

use confined_files::{PlanEntry, Reservations, ReservedForPerson};

use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::audit::{
    ActivityContent, ConceptEffect, ShareCounts, ShareMeasure, WriteDone, WriteRecord,
};
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::write_checkpoint::Permit;

/// A held call gives up after this, so a test that forgets to cancel it still ends.
const HOLD_LIMIT: Duration = Duration::from_secs(20);
const HOLD_POLL: Duration = Duration::from_millis(5);

pub fn call(
    context: &CallContext<'_>,
    name: &str,
    arguments: &Arguments,
) -> Option<Result<ToolOutput, ToolError>> {
    match name {
        "__test_panic" => Some(stop_unexpectedly()),
        "__test_hold" => Some(hold(context)),
        "__test_write_marker" => Some(write_marker(arguments)),
        "__test_echo" => Some(ToolOutput::json(&Echo { echo: arguments })),
        "__test_large_answer" => Some(large_answer(arguments)),
        _ => None,
    }
}

#[derive(Serialize)]
struct Echo<'a> {
    echo: &'a Arguments,
}

#[derive(Serialize)]
struct Large {
    data: String,
}

/// An answer of the number of bytes named by `bytes`, to see what a large answer costs.
fn large_answer(arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let bytes: usize = arguments.read("bytes")?.unwrap_or(1024);
    ToolOutput::json(&Large {
        data: "x".repeat(bytes),
    })
}

#[derive(Serialize)]
struct Held {
    held: bool,
    cancelled: bool,
}

#[allow(
    clippy::panic,
    reason = "the point of this test-only tool is to panic inside a handler"
)]
fn stop_unexpectedly() -> Result<ToolOutput, ToolError> {
    panic!("planted handler failure");
}

/// Waits off the queue until the call is cancelled or the session ends, as a consent question
/// does, and says which.
fn hold(context: &CallContext<'_>) -> Result<ToolOutput, ToolError> {
    let started = Instant::now();
    let cancelled = context.wait_off_queue(|| {
        while !context.is_cancelled() && started.elapsed() < HOLD_LIMIT {
            std::thread::sleep(HOLD_POLL);
        }
        context.is_cancelled()
    });
    ToolOutput::json(&Held {
        held: true,
        cancelled,
    })
}

#[derive(Serialize)]
struct Written {
    written: bool,
}

/// Creates the file named by the `path` argument, so a test can see that a handler ran.
fn write_marker(arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let path = arguments
        .string("path")
        .ok_or_else(|| ToolError::invalid("path must be a string."))?;
    std::fs::write(path, "ran").map_err(|error| ToolError::failed(error.to_string()))?;
    ToolOutput::json(&Written { written: true })
}

#[allow(
    clippy::panic,
    reason = "the point of this test-only share measurement is to panic while an audit line is written"
)]
fn measure_that_panics() -> ShareCounts {
    panic!("planted share measurement failure");
}

/// Writes `text` (or, with `append`, adds it to what the file holds after a pause, as a tool that
/// reads before it writes does) to the file named by `slug`, the way a real write tool does: its
/// path and its plan come from the permit, and a dry run gets no way to write. It says it changed a
/// concept, so the audit lines have something to record; `measurePanics` makes the measuring of the
/// share, which runs while the audit line is written, panic.
pub fn write_through_checkpoint(
    permit: &Permit<'_>,
    arguments: &Arguments,
) -> Result<WriteDone, ToolError> {
    let slug = arguments
        .string("slug")
        .ok_or_else(|| ToolError::invalid("slug must be a string."))?;
    let text = arguments.string("text").unwrap_or_default();
    let appended: Option<String> = arguments.read("append")?;
    let measure_panics: bool = arguments.read("measurePanics")?.unwrap_or(false);
    let reserved = |_: &std::path::Path, text: &str| {
        text.contains("review_state: human_decides")
            .then(|| ReservedForPerson {
                slug: slug.clone(),
                note: None,
            })
    };
    let Permit::Apply(write) = permit else {
        let output = ToolOutput::json(&Written { written: false })?;
        return Ok(WriteDone {
            output,
            record: WriteRecord::Nothing,
        });
    };
    let path = write
        .write_path(&slug)
        .map_err(|error| ToolError::invalid(error.to_string()))?;
    let entry = match appended {
        Some(appended) => {
            let before = permit
                .vault()
                .read_path(&slug)
                .ok()
                .and_then(|file| file.read_text().ok());
            // Long enough for a second call to read the same text if nothing kept it out.
            std::thread::sleep(Duration::from_millis(150));
            match before {
                Some(before) => {
                    PlanEntry::write(path, format!("{before}{appended}")).expecting_text(before)
                }
                None => PlanEntry::write(path, appended).expecting_absent(),
            }
        }
        None => PlanEntry::write(path, text),
    };
    write.apply(vec![entry], Reservations::Refuse(&reserved))?;
    let output = ToolOutput::json(&Written { written: true })?;
    let share = if measure_panics {
        ShareMeasure::Measure(Box::new(measure_that_panics))
    } else {
        ShareMeasure::Unchanged
    };
    Ok(WriteDone {
        output,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: slug.clone(),
                summary: format!("test write {slug}"),
                why: arguments.string("why"),
            },
            concepts: ConceptEffect::new(vec![slug], vec![], vec![]),
            share,
        },
    })
}
