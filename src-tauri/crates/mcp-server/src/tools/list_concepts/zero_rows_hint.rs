//! What `list_concepts` says when `mentions` or `filter` matched nothing: which part of the
//! question found no node, and a call that would help. Plain `kind`, `domain` and `since`
//! narrowing carries no hint.

use std::collections::{HashMap, HashSet};

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use serde::Serialize;
use vault_document::frontmatter::Value;
use vault_document::{DisplayTitle, LoadedDocument, QueryFilter};

const NEAR_TITLES_LISTED: usize = 3;
/// The share of the words of two titles that must be common for one to be named near the other.
const NEAR_TITLE_FLOOR: f64 = 0.3;

#[derive(Serialize)]
pub struct ZeroRowsHint {
    reason: String,
    suggestion: String,
    #[serde(rename = "exampleCall")]
    example_call: ExampleCall,
}

#[derive(Serialize)]
struct ExampleCall {
    tool: &'static str,
    args: ExampleArguments,
}

#[derive(Serialize)]
#[serde(untagged)]
enum ExampleArguments {
    OneRow { limit: u32 },
    ReadSlugs { slugs: Vec<String> },
    NewConcepts { concepts: Vec<ConceptStub> },
}

#[derive(Serialize)]
struct ConceptStub {
    slug: String,
    kind: &'static str,
    title: String,
}

/// The hint for a `filter` that matched no node. A kind or domain the filter requires and no node
/// of the vault carries is named, so the agent sees the filter aimed at something that is not there.
pub fn for_filter(
    filter: &QueryFilter,
    filter_text: &str,
    documents: &[LoadedDocument],
) -> ZeroRowsHint {
    let mut nodes_by_kind: HashMap<String, usize> = HashMap::new();
    let mut nodes_by_domain: HashMap<String, usize> = HashMap::new();
    for document in documents {
        let frontmatter = document.frontmatter();
        if frontmatter.truthy("kind").is_none() {
            continue;
        }
        *nodes_by_kind
            .entry(
                frontmatter
                    .get("kind")
                    .map(Value::display_text)
                    .unwrap_or_default(),
            )
            .or_default() += 1;
        if let Some(Value::Text(domain)) = frontmatter
            .get("domain")
            .filter(|domain| domain.is_truthy())
        {
            *nodes_by_domain.entry(domain.clone()).or_default() += 1;
        }
    }
    let kinds = filter
        .required_values("kind")
        .into_iter()
        .map(str::to_lowercase);
    let domains = filter
        .required_values("domain")
        .into_iter()
        .map(str::to_string);
    let missing_kinds = absent(kinds, &nodes_by_kind);
    let missing_domains = absent(domains, &nodes_by_domain);
    let example_call = ExampleCall {
        tool: "list_concepts",
        args: ExampleArguments::OneRow { limit: 1 },
    };
    if missing_kinds.is_empty() && missing_domains.is_empty() {
        return ZeroRowsHint {
            reason: format!("list_concepts filter matched 0 rows for filter: {filter_text}"),
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
    ZeroRowsHint {
        reason: format!("list_concepts filter matched 0 rows: {}.", facts.join("; ")),
        suggestion: "Check the census list_concepts returns for the real kind counts, and its domain filter for a domain, before retrying, or add the missing nodes.".to_string(),
        example_call,
    }
}

/// The names, each once and in the order met, that no node carries.
fn absent(wanted: impl Iterator<Item = String>, counts: &HashMap<String, usize>) -> Vec<String> {
    let mut seen = HashSet::new();
    wanted
        .filter(|name| seen.insert(name.clone()))
        .filter(|name| counts.get(name).copied().unwrap_or(0) == 0)
        .collect()
}

/// The hint for `mentions` that no node says: the titles of `candidates` that share words with it.
pub fn for_mentions(text: &str, candidates: &[&LoadedDocument]) -> ZeroRowsHint {
    let near = near_titles(text, candidates);
    if let Some(closest) = near.first() {
        let names: Vec<String> = near
            .iter()
            .map(|title| format!("{} ({})", title.title, title.slug))
            .collect();
        return ZeroRowsHint {
            reason: format!("No vault node mentions \"{text}\"."),
            suggestion: format!(
                "Closest existing node(s) by title: {}: confirm this isn't the same concept under a different name before adding a new one.",
                names.join(", ")
            ),
            example_call: ExampleCall {
                tool: "get_concepts",
                args: ExampleArguments::ReadSlugs {
                    slugs: vec![closest.slug.to_string()],
                },
            },
        };
    }
    ZeroRowsHint {
        reason: format!("No vault node mentions \"{text}\", and no similarly-titled node exists."),
        suggestion: "This concept may not be captured in the vault yet: add it if it describes a real capability/element/domain.".to_string(),
        example_call: ExampleCall {
            tool: "add_concepts",
            args: ExampleArguments::NewConcepts {
                concepts: vec![ConceptStub {
                    slug: slug_of_words(text),
                    kind: "element",
                    title: text.to_string(),
                }],
            },
        },
    }
}

struct NearTitle<'a> {
    slug: &'a str,
    title: String,
    score: f64,
}

/// Up to three titles that share at least a third of their words with `query`, closest first.
fn near_titles<'a>(query: &str, candidates: &[&'a LoadedDocument]) -> Vec<NearTitle<'a>> {
    let query_words = words(query);
    if query_words.is_empty() {
        return Vec::new();
    }
    let mut near: Vec<NearTitle<'a>> = candidates
        .iter()
        .filter_map(|document| {
            let title = listed_title(document);
            let title_words = words(&title);
            let shared = query_words.intersection(&title_words).count();
            if shared == 0 {
                return None;
            }
            let all = query_words.union(&title_words).count();
            let score = shared as f64 / all as f64;
            (score >= NEAR_TITLE_FLOOR).then(|| NearTitle {
                slug: document.slug(),
                title,
                score: (score * 1000.0).round() / 1000.0,
            })
        })
        .collect();
    near.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| compare_text(left.slug, right.slug))
    });
    near.truncate(NEAR_TITLES_LISTED);
    near
}

fn listed_title(document: &LoadedDocument) -> String {
    match document.display_title() {
        DisplayTitle::Value(value) => value.display_text(),
        DisplayTitle::Slug(slug) => slug.to_string(),
    }
}

/// The lowercase runs of ASCII letters and digits.
fn words(text: &str) -> HashSet<String> {
    text.to_lowercase()
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_string)
        .collect()
}

/// A slug an agent could add the missing concept under: lowercase letters, digits and Hangul
/// syllables joined by single hyphens.
fn slug_of_words(text: &str) -> String {
    let lowered = text.to_lowercase();
    let mut slug = String::new();
    let mut separated = false;
    for character in trim(&lowered).chars() {
        let kept = character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || ('\u{ac00}'..='\u{d7a3}').contains(&character);
        if !kept {
            separated = true;
            continue;
        }
        if separated && !slug.is_empty() {
            slug.push('-');
        }
        separated = false;
        slug.push(character);
    }
    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_slug_keeps_letters_digits_and_hangul_and_joins_the_rest_with_one_hyphen() {
        assert_eq!(slug_of_words("  Issue  Invoice! "), "issue-invoice");
        assert_eq!(
            slug_of_words("\u{c8fc}\u{bb38} \u{ccb4}\u{d06c}"),
            "\u{c8fc}\u{bb38}-\u{ccb4}\u{d06c}"
        );
        assert_eq!(slug_of_words("!!!"), "untitled");
    }

    #[test]
    fn words_are_the_ascii_runs_of_the_lowercased_text() {
        let found = words("Order-Cancel v2 \u{c8fc}\u{bb38}");
        let mut sorted: Vec<&str> = found.iter().map(String::as_str).collect();
        sorted.sort_unstable();
        assert_eq!(sorted, ["cancel", "order", "v2"]);
    }
}
