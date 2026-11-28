//! The cites of a body judged against what this session served: under which path a cite names its
//! file, and whether every cited line was read.

use confined_files::SourceFiles;
use source_reads::ReadsUnder;

use crate::line_cites::{line_cites, Cite};

/// The cites of `body`, each under the repository path its file has when a sub-root read cited it.
pub(crate) fn session_cites(
    body: &str,
    reads: Option<&ReadsUnder>,
    source: Option<&dyn SourceFiles>,
) -> Vec<Cite> {
    let cites = line_cites(body, source);
    let Some(reads) = reads else {
        return cites;
    };
    cites
        .into_iter()
        .map(|cite| Cite {
            path: reads.read_path(&cite.path).to_string(),
            ..cite
        })
        .collect()
}

/// Whether every line of the cite was served by a read of this session.
pub(crate) fn cite_was_served(reads: &ReadsUnder, cite: &Cite) -> bool {
    let Some(ranges) = reads.reads.get(&cite.path) else {
        return false;
    };
    (cite.start_line..=cite.end_line).all(|line| {
        ranges
            .iter()
            .any(|range| range.start_line <= line && line <= range.end_line)
    })
}
