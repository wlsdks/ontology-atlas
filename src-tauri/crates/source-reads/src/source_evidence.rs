//! The rows a call's selectors ask for, held to the text one call may carry.

use std::collections::HashSet;

use confined_files::SourceRoot;

use crate::path_policy::ignored_names;
use crate::read_environment::ReadEnvironment;
use crate::read_one::{read_one, CallBudget};
use crate::refusal_reason::RefusalReason;
use crate::selector::{ReadTarget, SourceReadSelector};
use crate::source_row::{AskedFor, SourceEvidence, SourceRow};

/// The source text all the reads of one call may carry together; an outline draws on none of it,
/// because the answer is held to its own size.
pub const AGGREGATE_TEXT_BYTES: usize = 32 * 1024;

/// The rows `selectors` ask for. A read the aggregate cannot hold is not returned, and named so a
/// later call can ask for it. `cancelled` is asked before each selector: once it answers true the
/// rows made so far are returned and no more are read, because nobody waits for the answer.
pub fn read_source_evidence(
    root: &SourceRoot,
    selectors: &[SourceReadSelector],
    extra_ignore: &[String],
    cancelled: &dyn Fn() -> bool,
) -> SourceEvidence {
    let ignore: HashSet<String> = ignored_names(extra_ignore);
    let environment = ReadEnvironment::new(root, extra_ignore, &ignore);
    let mut evidence = SourceEvidence::default();
    for (index, selector) in selectors.iter().enumerate() {
        if cancelled() {
            break;
        }
        let budget = CallBudget {
            remaining_bytes: AGGREGATE_TEXT_BYTES.saturating_sub(evidence.total_returned_bytes),
            reads_left: selectors
                .iter()
                .skip(index)
                .filter(|candidate| candidate.target != ReadTarget::Outline)
                .count(),
        };
        let mut row = read_one(&environment, selector, budget);
        if let SourceRow::Read(read) = &row {
            if evidence.total_returned_bytes + read.returned_bytes > AGGREGATE_TEXT_BYTES {
                row = SourceRow::Omitted {
                    asked: AskedFor::of(selector),
                    reason: RefusalReason::AggregateTextBudget,
                };
            }
        }
        if let SourceRow::Read(read) = &row {
            evidence.total_returned_bytes += read.returned_bytes;
        }
        evidence.rows.push(row);
    }
    evidence
}
