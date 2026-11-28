//! Two nodes that each declare a dependency on the other. A dependency runs from consumer to
//! provider, so one of the two directions is wrong.

use std::collections::HashSet;

use vault_document::{Issue, LoadedDocument};

use crate::node_fields::{refs_of, SlugResolver};

/// Every `depends_on` edge as consumer and provider slugs, in the order the nodes declare them.
pub(crate) fn dependency_edges(documents: &[LoadedDocument]) -> Vec<(&str, &str)> {
    let resolver = SlugResolver::of(documents);
    let mut edges = Vec::new();
    for document in documents {
        for reference in refs_of(document, &["dependencies", "depends_on"]) {
            if let Some(provider) = resolver.resolve(reference) {
                if provider != document.slug() {
                    edges.push((document.slug(), provider));
                }
            }
        }
    }
    edges
}

/// One finding on the lesser slug of each pair that depends on each other.
pub fn two_way_dependency_findings(documents: &[LoadedDocument]) -> Vec<(String, Issue)> {
    let edges = dependency_edges(documents);
    let known: HashSet<(&str, &str)> = edges.iter().copied().collect();
    let mut seen: HashSet<(&str, &str)> = HashSet::new();
    let mut findings = Vec::new();
    for (from, to) in edges {
        if !seen.insert((from, to))
            || encode_utf16_greater(from, to)
            || !known.contains(&(to, from))
        {
            continue;
        }
        findings.push((
            from.to_string(),
            Issue::warning(
                "dependency-both-ways",
                format!("{from} and {to} each depend on the other"),
            ),
        ));
    }
    findings
}

/// Whether `left` sorts after `right` by UTF-16 code unit, as a script's `>` compares strings.
fn encode_utf16_greater(left: &str, right: &str) -> bool {
    left.encode_utf16().gt(right.encode_utf16())
}
