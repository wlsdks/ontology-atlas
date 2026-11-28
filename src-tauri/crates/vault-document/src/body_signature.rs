//! A fingerprint of a folded body that says "this text cannot be in it" without reading it: the
//! body's length, and a set of bits, one for each run of three and each run of five bytes it holds.
//!
//! Any text that occurs in a body is no longer than it and has every one of its runs in it, so a
//! longer needle, or one with a run the body lacks, is not in it. The answer "maybe" is checked by
//! reading the body. A needle's runs are hashed once per search ([`SearchNeedle`]), so a document
//! costs a look at one bit per run, and none for a needle longer than its body.

use crate::search_needle::SearchNeedle;

const SHORT_RUN: usize = 3;
const LONG_RUN: usize = 5;
const MIN_BITS: usize = 256;
const MAX_BITS: usize = 65_536;
const GOLDEN: u64 = 0x9E37_79B9_7F4A_7C15;

#[derive(Debug)]
pub(crate) struct BodySignature {
    words: Box<[u64]>,
    bit_count_log2: u32,
    body_bytes: usize,
}

/// The run of `length` bytes at `start` as a number: a run of five fits in 40 bits.
fn run_value(bytes: &[u8], start: usize, length: usize) -> u64 {
    bytes
        .get(start..start + length)
        .unwrap_or_default()
        .iter()
        .fold(length as u64, |value, &byte| (value << 8) | u64::from(byte))
}

/// Every run of `bytes`, hashed: the bit a run sets in a table of `2^n` bits is its top `n` bits.
pub(crate) fn hashed_runs(bytes: &[u8]) -> impl Iterator<Item = u64> + '_ {
    (0..bytes.len()).flat_map(move |start| {
        [SHORT_RUN, LONG_RUN]
            .into_iter()
            .filter(move |length| start + length <= bytes.len())
            .map(move |length| run_value(bytes, start, length).wrapping_mul(GOLDEN))
    })
}

impl BodySignature {
    /// The signature of a body already folded (`search_text::folded`). The table has as many bits
    /// as the body has bytes, to the next power of two, between 256 and 65,536.
    pub(crate) fn of(folded_body: &str) -> Self {
        let bytes = folded_body.as_bytes();
        let mut bits = MIN_BITS;
        while bits < bytes.len() && bits < MAX_BITS {
            bits *= 2;
        }
        let bit_count_log2 = bits.trailing_zeros();
        let mut words = vec![0u64; bits / 64].into_boxed_slice();
        for hashed in hashed_runs(bytes) {
            let bit = bit_of(hashed, bit_count_log2);
            if let Some(word) = words.get_mut(bit / 64) {
                *word |= 1 << (bit % 64);
            }
        }
        Self {
            words,
            bit_count_log2,
            body_bytes: bytes.len(),
        }
    }

    /// False only when `needle` cannot be in the body this was made from.
    pub(crate) fn may_contain(&self, needle: &SearchNeedle) -> bool {
        if needle.text().len() > self.body_bytes {
            return false;
        }
        needle.hashed_runs().iter().all(|&hashed| {
            let bit = bit_of(hashed, self.bit_count_log2);
            self.words
                .get(bit / 64)
                .is_some_and(|word| word & (1 << (bit % 64)) != 0)
        })
    }
}

fn bit_of(hashed: u64, bit_count_log2: u32) -> usize {
    usize::try_from(hashed >> (64 - bit_count_log2)).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_text_in_the_body_is_never_ruled_out() {
        let body = "the ledger balances every order a customer places, \u{c8fc}\u{bb38} included";
        let signature = BodySignature::of(body);
        let may_contain = |needle: &str| signature.may_contain(&SearchNeedle::new(needle.into()));
        for needle in [
            "ledger",
            "balances every",
            "customer places",
            "\u{c8fc}\u{bb38}",
            "of",
            "x",
        ] {
            if body.contains(needle) {
                assert!(may_contain(needle), "{needle}");
            }
        }
        assert!(may_contain("or"));
        assert!(!may_contain("a refund policy"));
        assert!(
            !may_contain(&format!("{body} and more")),
            "longer than the body"
        );
    }
}
