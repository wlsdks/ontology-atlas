//! The starter examples `init` wrote into a new vault, once the vault has real nodes of the same
//! kind: until then a starter is the product's own instructions, beside real nodes it is a fake
//! concept on the map.

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use vault_document::LoadedDocument;

use crate::finding::Finding;

/// The three nodes `init` writes into a new vault, by kind. The vault templates use the same
/// addresses.
const STARTER_EXAMPLE_SLUGS: [(&str, &str); 3] = [
    ("domain", "domains/example-domain"),
    ("capability", "capabilities/example-capability"),
    ("element", "elements/example-element"),
];

/// Sentences only the untouched starter body carries; they strengthen the message, while the slug
/// and the title decide whether the node is a starter.
const STARTER_BODY_MARKERS: [&str; 2] = [
    "this file is a starter, not an observation",
    "## how to fill it in",
];

fn starter_slug_of(kind: &str) -> Option<&'static str> {
    STARTER_EXAMPLE_SLUGS
        .iter()
        .find(|(starter_kind, _)| *starter_kind == kind)
        .map(|(_, slug)| *slug)
}

/// Is this one of the examples `init` wrote to be copied? The three template addresses match
/// outright. Otherwise both an `example-` slug tail and a title that starts with "Example" are
/// required, since either alone would accuse a real node. The body is not consulted, so rewriting
/// the prose but keeping the name still counts.
pub fn is_starter_example(slug: &str, kind: &str, title: &str) -> bool {
    let address = trim(slug);
    if address.is_empty() {
        return false;
    }
    if starter_slug_of(trim(kind)) == Some(address) {
        return true;
    }
    if STARTER_EXAMPLE_SLUGS
        .iter()
        .any(|(_, starter)| *starter == address)
    {
        return true;
    }
    let tail = address.rsplit('/').next().unwrap_or_default();
    tail.starts_with("example-") && trim(title).starts_with("Example")
}

fn has_untouched_starter_body(body: &str) -> bool {
    let lowered = body.to_lowercase();
    STARTER_BODY_MARKERS
        .iter()
        .all(|marker| lowered.contains(marker))
}

fn message(starter: &str, kind: &str, real: &str, untouched_body: bool) -> String {
    let body_note = if untouched_body {
        format!("; its body is still the starter's own explanation of what a {kind} is")
    } else {
        String::new()
    };
    format!("\"{starter}\" is the {kind} the `init` starter wrote as a shape to copy, and \"{real}\" is now a real {kind} beside it{body_note}")
}

struct Candidate<'a> {
    document: &'a LoadedDocument,
    kind: String,
    is_starter: bool,
}

/// Every starter example the vault has outgrown, ordered by slug. A starter is reported only when
/// a node of its kind that is not a starter exists; that node is named as the real one.
pub fn starter_example_findings(documents: &[LoadedDocument]) -> Vec<Finding> {
    let candidates: Vec<Candidate<'_>> = documents
        .iter()
        .filter_map(|document| {
            let kind = trim(document.frontmatter().text("kind")?).to_string();
            if kind.is_empty() {
                return None;
            }
            let title = document
                .frontmatter()
                .get("title")
                .map(|value| value.display_text())
                .unwrap_or_default();
            let is_starter = is_starter_example(document.slug(), &kind, &title);
            Some(Candidate {
                document,
                kind,
                is_starter,
            })
        })
        .collect();
    let mut findings = Vec::new();
    for candidate in candidates.iter().filter(|candidate| candidate.is_starter) {
        if starter_slug_of(&candidate.kind).is_none() {
            continue;
        }
        let Some(real) = candidates
            .iter()
            .find(|other| other.kind == candidate.kind && !other.is_starter)
        else {
            continue;
        };
        let address = trim(candidate.document.slug());
        let untouched = candidate
            .document
            .body()
            .is_ok_and(|body| has_untouched_starter_body(&body));
        findings.push(Finding {
            code: "starter-example-node",
            slug: address.to_string(),
            key: "slug".to_string(),
            refs: vec![real.document.slug().to_string()],
            count: 1,
            message: message(address, &candidate.kind, real.document.slug(), untouched),
        });
    }
    findings.sort_by(|left, right| compare_text(&left.slug, &right.slug));
    findings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_template_address_is_a_starter_and_a_real_node_that_is_named_like_one_needs_both_signs() {
        assert!(is_starter_example(
            "domains/example-domain",
            "domain",
            "Anything"
        ));
        assert!(is_starter_example(
            "capabilities/example-billing",
            "capability",
            "Example billing"
        ));
        assert!(!is_starter_example(
            "capabilities/example-billing",
            "capability",
            "Billing"
        ));
        assert!(!is_starter_example(
            "capabilities/billing",
            "capability",
            "Example billing"
        ));
    }
}
