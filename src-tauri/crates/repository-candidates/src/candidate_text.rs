//! Naming and text normalisation shared across the analysis: folder names to titles, titles to
//! slugs, domain matching, and the heading-underline forms that README detection and
//! semantic-document extraction both recognise.

use std::collections::{BTreeSet, HashMap};
use std::sync::LazyLock;

use answer_format::utf16;
use answer_format::whitespace::{collapse_whitespace, is_whitespace, trim};
use regex::Regex;
use repository_survey::js_regex;

/// A heading longer than this is data, not a label; only its start is read.
const LABEL_LIMIT: usize = 2000;

static HEADING_IMAGE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"!\[[^\]]*\]\([^)]*\)"));
static HEADING_LINK: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\[([^\]]+)\]\([^)]*\)"));
static HEADING_TAG: LazyLock<Regex> = LazyLock::new(|| js_regex(r"<[^>]+>"));
static HEADING_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)&(?:nbsp|middot|amp|lt|gt);"));
static LETTER_OR_NUMBER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[\p{L}\p{N}]$"));
static NOT_SLUG_CHARACTER: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"[^a-z0-9\x{AC00}-\x{D7A3}\s-]"));
static SEPARATORS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[-_/]+"));
static WHITESPACE_RUN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\s+"));

/// The strings that are not blank, each once, in the order first seen.
pub fn unique_strings<'a>(values: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut unique = Vec::new();
    for value in values {
        if !trim(value).is_empty() && seen.insert(value) {
            unique.push(value.to_string());
        }
    }
    unique
}

/// A heading's text without images, links, tags and entities, on one line.
pub fn clean_heading_label(value: &str) -> String {
    let head = utf16::prefix(value, LABEL_LIMIT);
    let no_images = HEADING_IMAGE.replace_all(head, " ");
    let no_links = HEADING_LINK.replace_all(&no_images, "$1");
    let no_tags = HEADING_TAG.replace_all(&no_links, " ");
    let no_entities = HEADING_ENTITY.replace_all(&no_tags, " ");
    collapse_whitespace(&no_entities)
}

/// A line that is one punctuation character three or more times: the underline of a heading.
pub fn is_heading_adornment(line: &str) -> bool {
    let mut characters = line.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    let mut buffer = [0_u8; 4];
    if LETTER_OR_NUMBER.is_match(first.encode_utf8(&mut buffer)) || is_whitespace(first) {
        return false;
    }
    let mut repeats = 0;
    for next in characters {
        if next != first {
            return false;
        }
        repeats += 1;
    }
    repeats >= 2
}

pub fn heading_level_for_adornment(line: &str, has_title: bool) -> usize {
    if line.starts_with('=') {
        1
    } else if line.starts_with('-') || has_title {
        2
    } else {
        1
    }
}

/// `pull-requests` as `Pull Requests`: separators become spaces and each word starts upper case.
pub fn humanize(value: &str) -> String {
    let spaced = SEPARATORS.replace_all(value, " ");
    let collapsed = collapse_whitespace(&spaced);
    let mut out = String::with_capacity(collapsed.len());
    let mut previous_is_word = false;
    for character in collapsed.chars() {
        let is_word = character.is_ascii_alphanumeric() || character == '_';
        if is_word && !previous_is_word {
            out.extend(character.to_uppercase());
        } else {
            out.push(character);
        }
        previous_is_word = is_word;
    }
    out
}

pub fn slugify(value: &str) -> String {
    let lowered = value.to_lowercase();
    let kept = NOT_SLUG_CHARACTER.replace_all(&lowered, "");
    WHITESPACE_RUN.replace_all(trim(&kept), "-").into_owned()
}

/// The last part of a `kind/name` slug.
pub fn tail_slug(slug: &str) -> &str {
    slug.split('/')
        .rfind(|part| !part.is_empty())
        .unwrap_or_default()
}

/// The words of a name, each without a plural `s`.
pub fn semantic_tokens(value: &str) -> BTreeSet<String> {
    slugify(value)
        .split('-')
        .filter(|token| !token.is_empty())
        .map(|token| {
            if utf16::len(token) > 3 && token.ends_with('s') {
                token.strip_suffix('s').unwrap_or(token).to_string()
            } else {
                token.to_string()
            }
        })
        .collect()
}

pub fn path_semantic_tokens(value: &str) -> BTreeSet<String> {
    let spaced: String = value
        .chars()
        .map(|character| match character {
            '\\' | '/' | '.' | '_' => '-',
            other => other,
        })
        .collect();
    semantic_tokens(&spaced)
}

/// The one domain whose words overlap the name most; `None` when two overlap equally or none do.
/// A sole README heading is still not role evidence, so a name no domain matches is not absorbed
/// into the only available domain by elimination.
pub fn match_domain_slug(name: &str, domain_slugs: &[&str]) -> Option<String> {
    let candidate_tokens = semantic_tokens(name);
    if candidate_tokens.is_empty() {
        return match domain_slugs {
            [only] => Some((*only).to_string()),
            _ => None,
        };
    }
    let mut best: Option<&str> = None;
    let mut best_score = 0;
    let mut tied = false;
    for slug in domain_slugs {
        let domain_tokens = semantic_tokens(tail_slug(slug));
        let overlap = candidate_tokens
            .iter()
            .filter(|token| domain_tokens.contains(*token))
            .count();
        if overlap > best_score {
            best = Some(slug);
            best_score = overlap;
            tied = false;
        } else if overlap > 0 && overlap == best_score {
            tied = true;
        }
    }
    if best_score > 0 && !tied {
        best.map(str::to_string)
    } else {
        None
    }
}

/// `find` for a text searched forward many times: each needle's last answer is reused while the
/// new start falls before it, so any number of searches for one needle read the text about once.
pub struct ForwardFinder<'a> {
    text: &'a str,
    last: HashMap<String, (usize, Option<usize>)>,
}

impl<'a> ForwardFinder<'a> {
    pub fn new(text: &'a str) -> Self {
        Self {
            text,
            last: HashMap::new(),
        }
    }

    pub fn find(&mut self, needle: &str, from: usize) -> Option<usize> {
        if let Some((held_from, held_at)) = self.last.get(needle) {
            let reusable = from >= *held_from && held_at.is_none_or(|at| from <= at);
            if reusable {
                return *held_at;
            }
        }
        let at = self
            .text
            .get(from..)
            .and_then(|rest| rest.find(needle))
            .map(|offset| from + offset);
        self.last.insert(needle.to_string(), (from, at));
        at
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_name_becomes_a_title_and_a_slug_the_way_the_script_server_wrote_it() {
        assert_eq!(humanize("pull-requests/api_v2"), "Pull Requests Api V2");
        assert_eq!(slugify("  Place Order! "), "place-order");
        assert_eq!(slugify("주문 Order"), "주문-order");
    }

    #[test]
    fn a_domain_is_matched_only_when_one_domain_overlaps_most() {
        let domains = ["domains/orders", "domains/payment"];
        assert_eq!(
            match_domain_slug("order", &domains).as_deref(),
            Some("domains/orders")
        );
        assert_eq!(match_domain_slug("billing", &domains), None);
        assert_eq!(
            match_domain_slug("", &["domains/orders"]).as_deref(),
            Some("domains/orders")
        );
    }

    #[test]
    fn an_underline_is_one_punctuation_character_repeated() {
        assert!(is_heading_adornment("==="));
        assert!(is_heading_adornment("----"));
        assert!(!is_heading_adornment("--"));
        assert!(!is_heading_adornment("aaa"));
        assert!(!is_heading_adornment("-=-"));
    }
}
