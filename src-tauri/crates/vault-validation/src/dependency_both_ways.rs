//! Two nodes that each declare a dependency on the other. A dependency runs from consumer to
//! provider, so one of the two directions is wrong.

use std::collections::{HashMap, HashSet};

use vault_document::{Issue, LoadedDocument};

/// A reference as an exact slug, or the one node whose slug ends with it.
struct SlugResolver<'a> {
    slugs: HashSet<&'a str>,
    by_tail: HashMap<&'a str, Option<&'a str>>,
}

impl<'a> SlugResolver<'a> {
    fn of(documents: &'a [LoadedDocument]) -> Self {
        let mut by_tail: HashMap<&str, Option<&str>> = HashMap::new();
        for document in documents {
            let slug = document.slug();
            let tail = slug.rsplit('/').next().unwrap_or(slug);
            by_tail
                .entry(tail)
                .and_modify(|held| *held = None)
                .or_insert(Some(slug));
        }
        Self {
            slugs: documents.iter().map(LoadedDocument::slug).collect(),
            by_tail,
        }
    }

    fn resolve(&self, reference: &str) -> Option<&'a str> {
        if let Some(slug) = self.slugs.get(reference) {
            return Some(slug);
        }
        self.by_tail.get(reference).copied().flatten()
    }
}

/// Every `depends_on` edge as consumer and provider slugs, in the order the nodes declare them.
fn dependency_edges(documents: &[LoadedDocument]) -> Vec<(&str, &str)> {
    let resolver = SlugResolver::of(documents);
    let mut edges = Vec::new();
    for document in documents {
        for key in ["dependencies", "depends_on"] {
            for reference in document.frontmatter().list(key).unwrap_or_default() {
                let reference = answer_format::whitespace::trim(reference);
                if reference.is_empty() {
                    continue;
                }
                if let Some(provider) = resolver.resolve(reference) {
                    if provider != document.slug() {
                        edges.push((document.slug(), provider));
                    }
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
                format!("{from} and {to} each depend on the other. A dependency runs from consumer to provider: a caller depends on the interface it calls, an implementation does not depend on its interface, and a composition root depends on what it wires. Keep the direction the code shows and remove_relation the other."),
            ),
        ));
    }
    findings
}

/// Whether `left` sorts after `right` by UTF-16 code unit, as a script's `>` compares strings.
fn encode_utf16_greater(left: &str, right: &str) -> bool {
    left.encode_utf16().gt(right.encode_utf16())
}
