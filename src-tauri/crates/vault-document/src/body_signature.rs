//! A fingerprint of a folded body that says "this text cannot be in it" without reading it: a set
//! of bits, one for each run of three and each run of five bytes the body holds.
//!
//! Any text that occurs in a body has every one of its runs in the body, so a needle with a run
//! the body lacks is not in it. The answer "maybe" is checked by reading the body. A body of 5 KB
//! takes 1 KB of bits; the table is never larger than 8 KiB.

const SHORT_RUN: usize = 3;
const LONG_RUN: usize = 5;
const MIN_BITS: usize = 256;
const MAX_BITS: usize = 65_536;
const GOLDEN: u64 = 0x9E37_79B9_7F4A_7C15;

#[derive(Debug)]
pub(crate) struct BodySignature {
    words: Vec<u64>,
    bit_count_log2: u32,
}

/// The run of `length` bytes at `start` as a number: a run of five fits in 40 bits.
fn run_value(bytes: &[u8], start: usize, length: usize) -> u64 {
    bytes
        .get(start..start + length)
        .unwrap_or_default()
        .iter()
        .fold(length as u64, |value, &byte| (value << 8) | u64::from(byte))
}

fn bit_of(value: u64, bit_count_log2: u32) -> usize {
    usize::try_from(value.wrapping_mul(GOLDEN) >> (64 - bit_count_log2)).unwrap_or(0)
}

impl BodySignature {
    /// The signature of a body already folded (`search_text::folded`).
    pub(crate) fn of(folded_body: &str) -> Self {
        let bytes = folded_body.as_bytes();
        let mut bits = MIN_BITS;
        while bits < bytes.len() && bits < MAX_BITS {
            bits *= 2;
        }
        let bit_count_log2 = bits.trailing_zeros();
        let mut words = vec![0u64; bits / 64];
        for start in 0..bytes.len() {
            for length in [SHORT_RUN, LONG_RUN] {
                if start + length <= bytes.len() {
                    let bit = bit_of(run_value(bytes, start, length), bit_count_log2);
                    if let Some(word) = words.get_mut(bit / 64) {
                        *word |= 1 << (bit % 64);
                    }
                }
            }
        }
        Self {
            words,
            bit_count_log2,
        }
    }

    /// False only when `folded_needle` cannot be in the body this was made from.
    pub(crate) fn may_contain(&self, folded_needle: &str) -> bool {
        let bytes = folded_needle.as_bytes();
        if bytes.len() < SHORT_RUN {
            return true;
        }
        (0..bytes.len()).all(|start| {
            [SHORT_RUN, LONG_RUN].into_iter().all(|length| {
                if start + length > bytes.len() {
                    return true;
                }
                let bit = bit_of(run_value(bytes, start, length), self.bit_count_log2);
                self.words
                    .get(bit / 64)
                    .is_some_and(|word| word & (1 << (bit % 64)) != 0)
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_text_in_the_body_is_never_ruled_out() {
        let body = "the ledger balances every order a customer places, \u{c8fc}\u{bb38} included";
        let signature = BodySignature::of(body);
        for needle in ["ledger", "balances every", "customer places", "\u{c8fc}\u{bb38}", "of", "x"] {
            if body.contains(needle) {
                assert!(signature.may_contain(needle), "{needle}");
            }
        }
        assert!(signature.may_contain("or"));
        assert!(!signature.may_contain("a refund policy"));
    }
}
