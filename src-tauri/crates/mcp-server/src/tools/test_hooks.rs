//! Tools only a test build has, to exercise what a real tool would: an unexpected stop, a call that
//! waits for a person, and arguments as the handler receives them.

use std::time::{Duration, Instant};

use serde::Serialize;

use confined_files::{PlanEntry, Reservations, ReservedForPerson};

use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ConceptEffect, ShareMeasure, WriteDone, WriteRecord};
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::write_checkpoint::WritePermit;

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

/// Writes `text` to the file named by `slug`, the way a real write tool does: its path comes from
/// the permit and its plan goes through the permit. It says it changed a concept, so the audit
/// lines have something to record.
pub fn write_through_checkpoint(
    permit: &WritePermit<'_>,
    arguments: &Arguments,
) -> Result<WriteDone, ToolError> {
    let slug = arguments
        .string("slug")
        .ok_or_else(|| ToolError::invalid("slug must be a string."))?;
    let text = arguments.string("text").unwrap_or_default();
    let path = permit
        .vault()
        .write_path(&slug)
        .map_err(|error| ToolError::invalid(error.to_string()))?;
    let reserved = |_: &std::path::Path, text: &str| {
        text.contains("review_state: human_decides")
            .then(|| ReservedForPerson {
                slug: slug.clone(),
                note: None,
            })
    };
    let dry_run = arguments.is_dry_run();
    if !dry_run {
        permit.apply(
            vec![PlanEntry::write(path, text)],
            Reservations::Refuse(&reserved),
        )?;
    }
    let output = ToolOutput::json(&Written { written: !dry_run })?;
    let record = if dry_run {
        WriteRecord::Nothing
    } else {
        WriteRecord::Wrote {
            activity: ActivityContent {
                target: slug.clone(),
                summary: format!("test write {slug}"),
                why: arguments.string("why"),
            },
            concepts: ConceptEffect::new(vec![slug], vec![], vec![]),
            share: ShareMeasure::Unchanged,
        }
    };
    Ok(WriteDone { output, record })
}
