//! The text a search looks for in bodies, folded, with what a body is asked by without being read:
//! the hashed runs its signature checks, and the number its memo of the last answer is kept under.
//!
//! A memo keeps a number, not the text, so a search over fifty thousand documents copies the
//! needle into none of them. One number names one text: a text asked recently gets its number
//! again, any other text a number never given before, so a memo can only answer for the very text
//! it was made for. Searches that run at the same time keep their numbers apart.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};

use crate::body_signature::hashed_runs;

/// The runs a signature is asked about: those of the first bytes of a needle. Any subset of a
/// needle's runs never rules out a body that holds it, and this many already rule out nearly
/// every body that does not, so a needle of megabytes costs a document no more than a sentence.
const PROBED_RUNS: usize = 256;

#[derive(Debug)]
pub(crate) struct SearchNeedle {
    text: String,
    hashed_runs: Box<[u64]>,
    memo_number: u64,
}

impl SearchNeedle {
    /// The needle for text already folded (`search_text::folded`).
    pub(crate) fn new(folded: String) -> Self {
        let hashed_runs = hashed_runs(folded.as_bytes()).take(PROBED_RUNS).collect();
        let memo_number = memo_number_of(&folded);
        Self {
            text: folded,
            hashed_runs,
            memo_number,
        }
    }

    pub(crate) fn text(&self) -> &str {
        &self.text
    }

    pub(crate) fn hashed_runs(&self) -> &[u64] {
        &self.hashed_runs
    }

    /// The number a document's memo keeps for this text; never zero.
    pub(crate) fn memo_number(&self) -> u64 {
        self.memo_number
    }
}

/// How many texts keep their numbers: the last ones asked.
const RECENT_TEXTS: usize = 64;

/// A longer text gets a new number each time it is asked: it is kept nowhere, and a query of
/// thousands of words is rarely asked twice.
const RECENT_TEXT_MAX_BYTES: usize = 1024;

/// The number of `text`: the one it was given when it was asked recently, a new one otherwise. A
/// number is never given to a second text, even after its text is forgotten.
fn memo_number_of(text: &str) -> u64 {
    static RECENT: Mutex<VecDeque<(Box<str>, u64)>> = Mutex::new(VecDeque::new());
    static NEXT: AtomicU64 = AtomicU64::new(1);
    if text.len() > RECENT_TEXT_MAX_BYTES {
        return NEXT.fetch_add(1, Ordering::Relaxed);
    }
    let mut recent = RECENT.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some((_, number)) = recent.iter().find(|(known, _)| **known == *text) {
        return *number;
    }
    let number = NEXT.fetch_add(1, Ordering::Relaxed);
    if recent.len() >= RECENT_TEXTS {
        recent.pop_front();
    }
    recent.push_back((text.into(), number));
    number
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Other tests search at the same time; together they ask far fewer than `RECENT_TEXTS` texts.
    #[test]
    fn a_text_keeps_its_number_while_others_are_asked_and_no_two_share_one() {
        let ledger = SearchNeedle::new("ledger".into()).memo_number();
        let order = SearchNeedle::new("order".into()).memo_number();
        assert_eq!(SearchNeedle::new("ledger".into()).memo_number(), ledger);
        assert_ne!(ledger, order);
        assert!(ledger != 0 && order != 0);
        let long = "w".repeat(RECENT_TEXT_MAX_BYTES + 1);
        assert_ne!(
            SearchNeedle::new(long.clone()).memo_number(),
            SearchNeedle::new(long).memo_number(),
            "a long text is kept nowhere"
        );
    }
}
