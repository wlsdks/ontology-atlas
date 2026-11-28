//! The titles a vault already holds that a search found nothing for might have meant: the words
//! the title shares with them, or a typo's distance from them.
//!
//! The JavaScript server compared words made of `a-z` and `0-9` only, so a Korean or accented title
//! never had a near title and the hint said no similar node existed. Words here are letters and
//! digits of any script, and a title one transposition or one slip away counts too
//! (`strsim::osa_distance`, which counts a swap of two letters as one edit).

use answer_format::collation::compare_text;
use rayon::prelude::*;
use std::collections::HashSet;

use crate::search_text::{folded, words};

/// A title is near the query when this share of its words is shared (the Jaccard index of the two
/// sets of words), or when its letters are this close (one minus the edits over the longer length).
const SHARED_WORDS_FLOOR: f64 = 0.3;
const TYPO_FLOOR: f64 = 0.7;
/// A title this long is not a typo of another: its distance is not measured, which bounds a pair
/// to 128 by 128 letters whatever a vault or a query holds.
const TYPO_MAX_CHARACTERS: usize = 128;
const NEAR_TITLES_LISTED: usize = 3;

#[derive(Debug, Clone, PartialEq)]
pub struct NearTitle {
    pub slug: String,
    pub title: String,
    pub score: f64,
}

struct Folded {
    text: String,
    characters: usize,
    words: HashSet<String>,
}

impl Folded {
    fn of(text: &str) -> Self {
        let text = folded(text).into_owned();
        Self {
            characters: text.chars().count(),
            words: words(&text).map(str::to_string).collect(),
            text,
        }
    }
}

fn shared_words(query: &Folded, candidate: &Folded) -> f64 {
    let shared = candidate
        .words
        .iter()
        .filter(|word| query.words.contains(*word))
        .count();
    if shared == 0 {
        return 0.0;
    }
    shared as f64 / (query.words.len() + candidate.words.len() - shared) as f64
}

fn typo_closeness(query: &Folded, candidate: &Folded) -> f64 {
    let longer = query.characters.max(candidate.characters);
    if longer == 0
        || longer > TYPO_MAX_CHARACTERS
        || query.characters.abs_diff(candidate.characters) as f64
            > longer as f64 * (1.0 - TYPO_FLOOR)
    {
        return 0.0;
    }
    1.0 - strsim::osa_distance(&query.text, &candidate.text) as f64 / longer as f64
}

/// Up to three titles near `query`, nearest first, equally near ones in the collation of their
/// slugs. `candidates` are `(slug, title)`.
pub fn near_titles<'a>(
    query: &str,
    candidates: impl IntoIterator<Item = (&'a str, String)>,
) -> Vec<NearTitle> {
    let query = Folded::of(query);
    let candidates: Vec<(&str, String)> = candidates.into_iter().collect();
    let mut near: Vec<NearTitle> = candidates
        .par_iter()
        .filter_map(|(slug, title)| {
            let candidate = Folded::of(title);
            if candidate.text.is_empty() {
                return None;
            }
            let by_words = shared_words(&query, &candidate);
            let by_letters = typo_closeness(&query, &candidate);
            let score = match (by_words >= SHARED_WORDS_FLOOR, by_letters >= TYPO_FLOOR) {
                (true, true) => by_words.max(by_letters),
                (true, false) => by_words,
                (false, true) => by_letters,
                (false, false) => return None,
            };
            Some(NearTitle {
                slug: (*slug).to_string(),
                title: title.clone(),
                score: (score * 1000.0).round() / 1000.0,
            })
        })
        .collect();
    near.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| compare_text(&left.slug, &right.slug))
    });
    near.truncate(NEAR_TITLES_LISTED);
    near
}

#[cfg(test)]
mod tests {
    use super::*;

    fn titles(query: &str, held: &[(&'static str, &str)]) -> Vec<String> {
        near_titles(
            query,
            held.iter()
                .map(|(slug, title)| (*slug, (*title).to_string())),
        )
        .into_iter()
        .map(|near| near.slug)
        .collect()
    }

    #[test]
    fn a_slip_a_swap_and_another_script_each_find_the_title() {
        let held = [
            ("capabilities/charge-card", "Charge Card"),
            ("capabilities/place-order", "Place Order"),
            (
                "capabilities/cancel-order",
                "\u{c8fc}\u{bb38} \u{CDE8}\u{c18c}",
            ),
        ];
        assert_eq!(titles("Chrage Card", &held), ["capabilities/charge-card"]);
        assert_eq!(titles("Place Ordr", &held), ["capabilities/place-order"]);
        assert_eq!(
            titles("\u{CDE8}\u{c18c} \u{c8fc}\u{bb38}", &held),
            ["capabilities/cancel-order"]
        );
        assert!(titles("refund policy", &held).is_empty());
    }

    #[test]
    fn a_query_or_a_title_of_thousands_of_characters_costs_no_distance() {
        let long = "word ".repeat(5000);
        let held = [("a", "word word"), ("b", long.as_str())];
        let near = titles(&long, &held);
        assert!(near.contains(&"b".to_string()));
    }
}
