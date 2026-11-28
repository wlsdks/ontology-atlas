//! The digest a source identity and a fingerprint are written as: SHA-256 of each part followed by
//! a zero byte, as `sha256:` and 64 lower-case hexadecimal digits.

use sha2::{Digest, Sha256};

pub(crate) fn lower_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

/// `sha256:` over each part and a zero byte after it.
pub fn source_digest(parts: &[&[u8]]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
        hasher.update([0]);
    }
    format!("sha256:{}", lower_hex(&hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_digest_ends_each_part_with_a_zero_byte_so_two_splits_of_one_text_differ() {
        assert_ne!(source_digest(&[b"ab", b"c"]), source_digest(&[b"a", b"bc"]));
        assert!(source_digest(&[b"git", b"/repo"]).starts_with("sha256:"));
    }
}
