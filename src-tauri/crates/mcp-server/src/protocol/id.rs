//! A request id: what the client calls a request, written back as it came.

use answer_format::json::quote;
use serde_json::value::RawValue;

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// A request id. A number must be a safe integer (`1.5`, `null` and `true` are not ids); a string is
/// kept as the UTF-16 code units JavaScript holds, so a lone surrogate in it is written back as it
/// came and two ids that differ in one stay two ids.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Id {
    Number(i64),
    Text(Box<[u16]>),
}

impl Id {
    /// A text id.
    pub fn text(text: &str) -> Self {
        Self::Text(text.encode_utf16().collect())
    }

    /// The id a JSON value is, when it is one: a string, or a number that is a safe integer.
    pub fn from_raw(raw: &RawValue) -> Option<Self> {
        let text = raw.get();
        if text.starts_with('"') {
            return unescape(text).map(|units| Self::Text(units.into()));
        }
        let number: f64 = text.parse().ok()?;
        if !number.is_finite() || number.fract() != 0.0 || number.abs() > MAX_SAFE_INTEGER {
            return None;
        }
        // The number is a safe integer, which an `i64` holds exactly; `-0` is the number 0.
        #[allow(
            clippy::cast_possible_truncation,
            reason = "checked above to be a safe integer"
        )]
        Some(Self::Number(number as i64))
    }

    /// The id as JSON, a lone surrogate written as the escape `JSON.stringify` gives it.
    pub fn to_json(&self) -> String {
        match self {
            Self::Number(number) => number.to_string(),
            Self::Text(units) => {
                let mut out = String::with_capacity(units.len() + 2);
                out.push('"');
                let mut plain = String::new();
                for unit in char::decode_utf16(units.iter().copied()) {
                    match unit {
                        Ok(character) => plain.push(character),
                        Err(lone) => {
                            push_body(&plain, &mut out);
                            plain.clear();
                            out.push_str(&format!("\\u{:04x}", lone.unpaired_surrogate()));
                        }
                    }
                }
                push_body(&plain, &mut out);
                out.push('"');
                out
            }
        }
    }

    /// The id as a JSON value to embed in an answer.
    pub fn to_raw(&self) -> Box<RawValue> {
        RawValue::from_string(self.to_json()).unwrap_or_else(|_| RawValue::NULL.to_owned())
    }
}

/// `text` written as a JSON string, without its quotes.
fn push_body(text: &str, out: &mut String) {
    let quoted = quote(text);
    out.push_str(
        quoted
            .get(1..quoted.len().saturating_sub(1))
            .unwrap_or_default(),
    );
}

/// The UTF-16 units of a JSON string, escapes resolved and lone surrogates kept. The text has
/// already been read as one JSON value, so its escapes are well formed.
fn unescape(quoted: &str) -> Option<Vec<u16>> {
    let inner = quoted.strip_prefix('"')?.strip_suffix('"')?;
    let mut units = Vec::with_capacity(inner.len());
    let mut characters = inner.chars();
    while let Some(character) = characters.next() {
        if character != '\\' {
            let mut buffer = [0u16; 2];
            units.extend_from_slice(character.encode_utf16(&mut buffer));
            continue;
        }
        let unit = match characters.next()? {
            '"' => u16::from(b'"'),
            '\\' => u16::from(b'\\'),
            '/' => u16::from(b'/'),
            'b' => 0x08,
            'f' => 0x0c,
            'n' => u16::from(b'\n'),
            'r' => u16::from(b'\r'),
            't' => u16::from(b'\t'),
            'u' => {
                let digits: String = characters.by_ref().take(4).collect();
                u16::from_str_radix(&digits, 16).ok()?
            }
            _ => return None,
        };
        units.push(unit);
    }
    Some(units)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(json: &str) -> Option<Id> {
        let raw: Box<RawValue> = serde_json::from_str(json).expect("one JSON value");
        Id::from_raw(&raw)
    }

    #[test]
    fn a_number_is_an_id_when_it_is_a_safe_integer() {
        assert_eq!(id("1"), Some(Id::Number(1)));
        assert_eq!(id("1e2"), Some(Id::Number(100)));
        assert_eq!(id("-0"), Some(Id::Number(0)));
        assert_eq!(
            id("9007199254740991"),
            Some(Id::Number(9_007_199_254_740_991))
        );
        for not_an_id in [
            "1.5",
            "null",
            "true",
            "{}",
            "[]",
            "9007199254740992",
            "12345678901234567890",
            "1e400",
        ] {
            assert_eq!(id(not_an_id), None, "{not_an_id}");
        }
    }

    #[test]
    fn a_string_id_is_written_back_as_javascript_writes_it() {
        assert_eq!(
            id("\"é😀\"").map(|id| id.to_json()).as_deref(),
            Some("\"é😀\"")
        );
        assert_eq!(
            id(r#""\u00e9\n\"""#).map(|id| id.to_json()).as_deref(),
            Some("\"é\\n\\\"\"")
        );
        assert_eq!(Id::Number(7).to_json(), "7");
    }

    #[test]
    fn ids_differing_in_a_lone_surrogate_stay_two_ids_written_back_as_sent() {
        let high = id(r#""a\ud800b""#).expect("an id");
        let other = id(r#""a\uD801b""#).expect("an id");
        let replacement = id("\"a\u{fffd}b\"").expect("an id");
        assert_ne!(high, other);
        assert_ne!(high, replacement);
        assert_eq!(high.to_json(), r#""a\ud800b""#);
        assert_eq!(other.to_json(), r#""a\ud801b""#);
        assert_eq!(replacement.to_json(), "\"a\u{fffd}b\"");
        assert_eq!(
            id(r#""\ude00\ud83d""#).map(|id| id.to_json()).as_deref(),
            Some(r#""\ude00\ud83d""#)
        );
        assert_eq!(id(r#""\ud83d\ude00""#), Some(Id::text("😀")));
    }

    #[test]
    fn a_private_use_character_is_just_a_character() {
        let id = id("\"\u{f8ff}\u{e001}\"").expect("an id");
        assert_eq!(id.to_json(), "\"\u{f8ff}\u{e001}\"");
    }
}
