//! The structural analysis a caller asks for by name. Relations that only restate "the project
//! contains every candidate" or connect folder-named element candidates are not sent
//! (`infer_imports` carries the import edges with their evidence), and a scan that found no ability
//! says so in one line.

use std::collections::BTreeSet;

use crate::repository_analysis::RepositoryAnalysis;

/// Keeps the relations between domains and capabilities and returns the note a scan with no
/// capability candidate carries.
pub fn narrow_to_view(analysis: &mut RepositoryAnalysis) -> Option<String> {
    let proposable: BTreeSet<String> = analysis
        .domains
        .iter()
        .map(|row| row.slug.clone())
        .chain(analysis.capabilities.iter().map(|row| row.slug.clone()))
        .collect();
    analysis
        .suggested_relations
        .retain(|row| proposable.contains(&row.from) && proposable.contains(&row.to));
    analysis.capabilities.is_empty().then(|| {
        format!(
            "No capability candidate: folder and package names are not abilities. Outline the entry points with sourceReads mode:\"outline\" and propose capabilities from what the code does; the {} element candidates are folder names, not roles.",
            analysis.elements.len()
        )
    })
}
