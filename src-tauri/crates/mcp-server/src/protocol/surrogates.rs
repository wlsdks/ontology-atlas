//! Lone surrogates in a message.
//!
//! JSON may escape half of a surrogate pair (`\ud800`) and JavaScript keeps it in a string; a Rust
//! string cannot hold one. The server reads every string of a message with each lone surrogate
//! replaced by U+FFFD, except a request id, which is written back as it came
//! ([`super::id::Id`]).

use std::borrow::Cow;

fn is_hex4(digits: &[u8]) -> bool {
    digits.len() == 4 && digits.iter().all(u8::is_ascii_hexdigit)
}

/// The escape's code unit, when `bytes` starts with `\uXXXX`.
fn escape_unit(bytes: &[u8]) -> Option<u16> {
    let (backslash, rest) = bytes.split_first()?;
    let (letter, digits) = rest.split_first()?;
    if *backslash != b'\\' || *letter != b'u' {
        return None;
    }
    let digits = digits.get(..4).filter(|digits| is_hex4(digits))?;
    u16::from_str_radix(std::str::from_utf8(digits).ok()?, 16).ok()
}

/// `text` with every escaped lone surrogate written as `\ufffd`; the same text, not copied, when
/// it has none.
pub fn without_lone(text: &str) -> Cow<'_, str> {
    let bytes = text.as_bytes();
    if !bytes
        .windows(3)
        .any(|window| matches!(window, [b'\\', b'u', b'd' | b'D']))
    {
        return Cow::Borrowed(text);
    }
    let mut out = String::with_capacity(text.len());
    let mut copied = 0;
    let mut position = 0;
    let mut changed = false;
    while position < bytes.len() {
        if bytes.get(position) != Some(&b'\\') {
            position += 1;
            continue;
        }
        let rest = bytes.get(position..).unwrap_or_default();
        match escape_unit(rest) {
            Some(0xd800..=0xdbff) => {
                let paired = rest
                    .get(6..)
                    .and_then(escape_unit)
                    .is_some_and(|low| (0xdc00..=0xdfff).contains(&low));
                if paired {
                    position += 12;
                } else {
                    changed = true;
                    out.push_str(text.get(copied..position).unwrap_or_default());
                    out.push_str("\\ufffd");
                    position += 6;
                    copied = position;
                }
            }
            Some(0xdc00..=0xdfff) => {
                changed = true;
                out.push_str(text.get(copied..position).unwrap_or_default());
                out.push_str("\\ufffd");
                position += 6;
                copied = position;
            }
            Some(_) => position += 6,
            // `\\`, `\"` or another escape: skip both bytes so an escaped backslash is not read
            // as the start of an escape.
            None => position += 2,
        }
    }
    if !changed {
        return Cow::Borrowed(text);
    }
    out.push_str(text.get(copied..).unwrap_or_default());
    Cow::Owned(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_text_without_a_surrogate_escape_is_not_copied() {
        assert!(matches!(
            without_lone(r#"{"a":"\u00e9\n"}"#),
            Cow::Borrowed(_)
        ));
        assert!(matches!(
            without_lone(r#"{"a":"\ud83d\ude00"}"#),
            Cow::Borrowed(_)
        ));
    }

    #[test]
    fn a_lone_surrogate_becomes_the_replacement_character_in_any_case() {
        assert_eq!(without_lone(r#""a\ud800b""#), r#""a\ufffdb""#);
        assert_eq!(without_lone(r#""a\uDC00b""#), r#""a\ufffdb""#);
        assert_eq!(without_lone(r#""\ude00\ud83d""#), r#""\ufffd\ufffd""#);
        assert_eq!(
            without_lone(r#""\ud83d\ud83d\ude00""#),
            r#""\ufffd\ud83d\ude00""#
        );
    }

    #[test]
    fn an_escaped_backslash_before_u_is_not_an_escape() {
        let text = r#""\\ud800""#;
        assert!(matches!(without_lone(text), Cow::Borrowed(_)));
        assert_eq!(without_lone(r#""\\\ud800""#), r#""\\\ufffd""#);
    }
}
