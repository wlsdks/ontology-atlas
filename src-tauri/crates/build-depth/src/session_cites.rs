//! The cites of a body under the repository path their file has when a sub-root read cited it.

use confined_files::SourceFiles;
use source_reads::ReadsUnder;

use crate::line_cites::{line_cites, Cite};

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
