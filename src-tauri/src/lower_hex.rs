//! Digest output (`hybrid_array::Array`) has no `{:x}`, so every stored hash is written here.

use std::fmt::Write;

pub(crate) fn lower_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        // Writing into a String cannot fail.
        let _ = write!(out, "{byte:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::lower_hex;

    #[test]
    fn writes_two_lowercase_digits_per_byte() {
        assert_eq!(lower_hex(&[]), "");
        assert_eq!(lower_hex(&[0x00, 0x0f, 0xa0, 0xff]), "000fa0ff");
    }
}
