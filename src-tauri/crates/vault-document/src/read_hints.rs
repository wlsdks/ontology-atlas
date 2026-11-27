//! What a read that found nothing tells the agent to do next: a hint made only from what the call
//! already has, attached to an empty or unresolved answer and never to a successful one. With no
//! real candidate it falls back to one generic example rather than a guessed node.

use std::collections::HashMap;

use answer_format::whitespace::{is_whitespace, trim};
use confined_files::raw_source_file_for_slug;
use serde::Serialize;

use crate::query_filter::QueryFilter;
use crate::reference_index::tail_of;

/// A hint: why the answer is empty, what to do, and a call that does it.
#[derive(Debug, Clone, Serialize)]
pub struct GrowthHint {
    reason: String,
    suggestion: String,
    #[serde(rename = "exampleCall")]
    example_call: ExampleCall,
}

#[derive(Debug, Clone, Serialize)]
struct ExampleCall {
    tool: &'static str,
    args: ExampleArguments,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
enum ExampleArguments {
    ReadSource { path: String },
    AddConcepts { concepts: Vec<ConceptStub> },
    GetConcepts { slugs: Vec<String> },
    ListConcepts { limit: u32 },
}

#[derive(Debug, Clone, Serialize)]
struct ConceptStub {
    slug: String,
    kind: &'static str,
    title: String,
}

/// A document that names the missing slug in a relation key, and the key.
#[derive(Debug, Clone, Serialize)]
pub struct Reference {
    pub slug: String,
    pub via: &'static str,
}

/// The slug's last segment as words, each capitalised: `capabilities/issue-invoice` is
/// `Issue Invoice`.
fn title_case_from_slug(slug: &str) -> String {
    let tail = {
        let tail = tail_of(slug);
        if tail.is_empty() {
            slug
        } else {
            tail
        }
    };
    let spaced: String = {
        let mut out = String::with_capacity(tail.len());
        let mut in_separator = false;
        for character in tail.chars() {
            if matches!(character, '-' | '_') {
                if !in_separator {
                    out.push(' ');
                }
                in_separator = true;
            } else {
                in_separator = false;
                out.push(character);
            }
        }
        out
    };
    let words = trim(&spaced);
    if words.is_empty() {
        return slug.to_string();
    }
    let mut titled = String::with_capacity(words.len());
    let mut characters = words.chars().peekable();
    while let Some(character) = characters.next() {
        if character.is_ascii_alphanumeric() || character == '_' {
            titled.push(character.to_ascii_uppercase());
            while let Some(next) = characters.next_if(|next| !is_whitespace(*next)) {
                titled.push(next);
            }
        } else {
            titled.push(character);
        }
    }
    titled
}

fn add_concept_example(slug: &str) -> ExampleCall {
    ExampleCall {
        tool: "add_concepts",
        args: ExampleArguments::AddConcepts {
            concepts: vec![ConceptStub {
                slug: slug.to_string(),
                kind: "element",
                title: title_case_from_slug(slug),
            }],
        },
    }
}

/// A name that opens no document. `raw_source` is the slug of the raw source under `sources/` the
/// name spells, when it does.
pub fn slug_not_found_hint(
    slug: &str,
    raw_source: Option<&str>,
    candidates: &[String],
    referenced_by: &[Reference],
) -> GrowthHint {
    if let Some(raw_source) = raw_source {
        return GrowthHint {
            reason: format!("\"{slug}\" opens {raw_source} under sources/, where every file is a raw source and never a node."),
            suggestion: "Read it as a source. To make it a node, move the file into its kind folder.".to_string(),
            example_call: ExampleCall {
                tool: "read_source",
                args: ExampleArguments::ReadSource {
                    path: raw_source_file_for_slug(raw_source),
                },
            },
        };
    }
    if !referenced_by.is_empty() {
        let cited = referenced_by
            .iter()
            .take(3)
            .map(|hit| format!("{} (via {})", hit.slug, hit.via))
            .collect::<Vec<_>>()
            .join(", ");
        let more = if referenced_by.len() > 3 {
            format!(" and {} more", referenced_by.len() - 3)
        } else {
            String::new()
        };
        return GrowthHint {
            reason: format!(
                "\"{slug}\" has no document of its own, but {} vault doc(s) reference it: {cited}{more}.",
                referenced_by.len()
            ),
            suggestion: "This is a referenced-only concept: the map counts it, the compiled graph does not, because nothing defines it yet. Create its document at exactly this slug so the existing references resolve to it.".to_string(),
            example_call: add_concept_example(slug),
        };
    }
    if let Some(closest) = candidates.first() {
        return GrowthHint {
            reason: format!("\"{slug}\" does not resolve to a vault node."),
            suggestion: format!(
                "Closest existing slug(s): {}: likely a typo or a missing folder segment rather than a missing node.",
                candidates.join(", ")
            ),
            example_call: ExampleCall {
                tool: "get_concepts",
                args: ExampleArguments::GetConcepts {
                    slugs: vec![closest.clone()],
                },
            },
        };
    }
    GrowthHint {
        reason: format!("\"{slug}\" does not resolve to a vault node, and no similarly-named node exists."),
        suggestion: "This may be a real gap in the vault: add it if it describes an actual capability/element/domain.".to_string(),
        example_call: add_concept_example(slug),
    }
}

fn missing_names(wanted: Vec<String>, counts: &HashMap<String, usize>) -> Vec<String> {
    let mut missing: Vec<String> = Vec::new();
    for name in wanted {
        if counts.get(&name).copied().unwrap_or(0) == 0 && !missing.contains(&name) {
            missing.push(name);
        }
    }
    missing
}

/// A filter that matched no row. A `kind=` or `domain=` the vault has no node of is named, so the
/// agent sees the filter aimed at something that does not exist. The names are the ones the parsed
/// filter requires, whole: a name inside a quoted title or one a `NOT` rules out is not one.
pub fn query_zero_rows_hint(
    filter: &QueryFilter,
    filter_text: &str,
    nodes_by_kind: &HashMap<String, usize>,
    nodes_by_domain: &HashMap<String, usize>,
) -> GrowthHint {
    let kinds = filter
        .required_values("kind")
        .into_iter()
        .map(str::to_lowercase)
        .collect();
    let missing_kinds = missing_names(kinds, nodes_by_kind);
    let domains = filter
        .required_values("domain")
        .into_iter()
        .map(str::to_string)
        .collect();
    let missing_domains = missing_names(domains, nodes_by_domain);
    let example_call = ExampleCall {
        tool: "list_concepts",
        args: ExampleArguments::ListConcepts { limit: 1 },
    };
    if missing_kinds.is_empty() && missing_domains.is_empty() {
        return GrowthHint {
            reason: format!("query_concepts matched 0 rows for filter: {filter_text}"),
            suggestion: "Loosen the filter: drop an AND clause or widen an equality: and retry."
                .to_string(),
            example_call,
        };
    }
    let facts: Vec<String> = missing_kinds
        .iter()
        .map(|kind| format!("kind=\"{kind}\" has 0 nodes in this vault"))
        .chain(
            missing_domains
                .iter()
                .map(|domain| format!("domain=\"{domain}\" has 0 nodes in this vault")),
        )
        .collect();
    GrowthHint {
        reason: format!("query_concepts matched 0 rows: {}.", facts.join("; ")),
        suggestion: "Check the census list_concepts returns for the real kind counts, and its domain filter for a domain, before retrying, or add the missing nodes.".to_string(),
        example_call,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_slug_becomes_words_with_each_capitalised() {
        assert_eq!(
            title_case_from_slug("capabilities/issue-invoice"),
            "Issue Invoice"
        );
        assert_eq!(title_case_from_slug("snake_case__name"), "Snake Case Name");
        assert_eq!(title_case_from_slug("--"), "--");
    }
}
