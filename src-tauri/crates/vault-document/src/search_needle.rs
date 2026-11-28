//! The text a search looks for in bodies, folded, with what a body is asked by without being read:
//! the hashed runs its signature checks, and the number its memo of the last answer is kept under.
//!
//! A memo keeps a number, not the text, so a search over fifty thousand documents copies the
//! needle into none of them. One number names one text: a search for the text the last search
//! looked for gets its number again, any other text a number never given before, so a memo can
//! only answer for the very text it was made for.

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

/// The number of `text`: the last search's when it looked for the same text, a new one otherwise.
fn memo_number_of(text: &str) -> u64 {
    static LAST: Mutex<Option<(String, u64)>> = Mutex::new(None);
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let mut last = LAST.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some((last_text, number)) = last.as_ref() {
        if last_text == text {
            return *number;
        }
    }
    let number = NEXT.fetch_add(1, Ordering::Relaxed);
    *last = Some((text.to_string(), number));
    number
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Other tests search at the same time, so only what holds under any interleaving is asserted.
    #[test]
    fn two_texts_never_share_a_number() {
        let ledger = SearchNeedle::new("ledger".into()).memo_number();
        let order = SearchNeedle::new("order".into()).memo_number();
        let ledger_again = SearchNeedle::new("ledger".into()).memo_number();
        assert_ne!(ledger, order);
        assert_ne!(ledger_again, order);
        assert!(ledger != 0 && order != 0);
    }
}
