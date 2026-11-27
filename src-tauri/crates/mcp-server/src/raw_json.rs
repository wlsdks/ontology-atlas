//! Reading a JSON value that is held as text: what kind it is, and a string's characters.

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

/// The elements of a JSON array, each left as text; `None` when `raw` is not an array.
pub fn elements(raw: &RawValue) -> Option<Vec<&RawValue>> {
    serde_json::from_str(raw.get()).ok()
}

/// The string at `key` of a JSON object; `None` when `raw` is no object, has no such member or the
/// member is not a string.
pub fn string_member(raw: &RawValue, key: &str) -> Option<String> {
    let members: std::collections::HashMap<String, &RawValue> =
        serde_json::from_str(raw.get()).ok()?;
    members.get(key).and_then(|member| string_value(member))
}
