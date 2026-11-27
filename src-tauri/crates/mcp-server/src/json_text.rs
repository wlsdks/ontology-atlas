//! Telling what JSON text is without reading all of it.

use serde_json::value::RawValue;

/// The kind of a JSON value, from its first character.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Null,
    Boolean,
    Number,
    String,
    Array,
    Object,
}

impl Kind {
    /// The kind of `raw`, which `serde_json` has already checked is one JSON value.
    pub fn of(raw: &RawValue) -> Self {
        match raw.get().trim_start().bytes().next() {
            Some(b'{') => Self::Object,
            Some(b'[') => Self::Array,
            Some(b'"') => Self::String,
            Some(b't' | b'f') => Self::Boolean,
            Some(b'n') => Self::Null,
            _ => Self::Number,
        }
    }

    /// The word the SDK's schema check uses for a value that is not the type it expected.
    pub fn received(self) -> &'static str {
        match self {
            Self::Null => "null",
            Self::Boolean => "boolean",
            Self::Number => "number",
            Self::String => "string",
            Self::Array => "array",
            Self::Object => "object",
        }
    }
}

/// The text of a JSON string, escapes resolved.
pub fn string_value(raw: &RawValue) -> Option<String> {
    serde_json::from_str(raw.get()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(text: &str) -> Kind {
        let raw: Box<RawValue> = serde_json::from_str(text).expect("one value");
        Kind::of(&raw)
    }

    #[test]
    fn a_value_is_told_by_its_first_character() {
        assert_eq!(kind("{}"), Kind::Object);
        assert_eq!(kind(" [1] "), Kind::Array);
        assert_eq!(kind("\"x\""), Kind::String);
        assert_eq!(kind("true"), Kind::Boolean);
        assert_eq!(kind("false"), Kind::Boolean);
        assert_eq!(kind("null"), Kind::Null);
        assert_eq!(kind("-1.5e3"), Kind::Number);
        assert_eq!(kind("0"), Kind::Number);
    }

    #[test]
    fn a_string_is_read_with_its_escapes() {
        let raw: Box<RawValue> = serde_json::from_str(r#""a\n\u00e9\ud83d\ude00""#).expect("reads");
        assert_eq!(string_value(&raw).as_deref(), Some("a\né😀"));
    }
}
