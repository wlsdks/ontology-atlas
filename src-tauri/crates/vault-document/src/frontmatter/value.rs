//! What a frontmatter key holds once read: the few shapes the vault format has.

use indexmap::IndexMap;
use serde::ser::{SerializeMap, SerializeSeq};
use serde::{Serialize, Serializer};

/// One value of an inline or block mapping: text, a number or a boolean.
#[derive(Debug, Clone, PartialEq)]
pub enum Scalar {
    Text(String),
    Number(f64),
    Bool(bool),
}

/// What a frontmatter key holds. A list holds text only: `[1, 2]` and `- 1` read as the strings
/// `"1"` and `"2"`, since a relation is a name.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Text(String),
    Number(f64),
    Bool(bool),
    List(Vec<String>),
    Map(IndexMap<String, Scalar>),
}

impl Value {
    pub fn as_text(&self) -> Option<&str> {
        match self {
            Self::Text(text) => Some(text),
            _ => None,
        }
    }

    pub fn as_list(&self) -> Option<&[String]> {
        match self {
            Self::List(items) => Some(items),
            _ => None,
        }
    }

    pub fn as_map(&self) -> Option<&IndexMap<String, Scalar>> {
        match self {
            Self::Map(members) => Some(members),
            _ => None,
        }
    }

    /// What `String(value)` gives in JavaScript, for a value that is not a map: a list joins its
    /// items with a comma.
    pub fn display_text(&self) -> String {
        match self {
            Self::Text(text) => text.clone(),
            Self::Number(number) => answer_format::number::text(*number),
            Self::Bool(flag) => flag.to_string(),
            Self::List(items) => items.join(","),
            Self::Map(_) => "[object Object]".to_string(),
        }
    }

    /// JavaScript's truthiness, which `a || b` fallbacks in the answers lean on: empty text, zero
    /// and a false boolean are not.
    pub fn is_truthy(&self) -> bool {
        match self {
            Self::Text(text) => !text.is_empty(),
            Self::Number(number) => *number != 0.0 && !number.is_nan(),
            Self::Bool(flag) => *flag,
            Self::List(_) | Self::Map(_) => true,
        }
    }
}

impl Serialize for Scalar {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Text(text) => serializer.serialize_str(text),
            Self::Number(number) => serializer.serialize_f64(*number),
            Self::Bool(flag) => serializer.serialize_bool(*flag),
        }
    }
}

impl Serialize for Value {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Text(text) => serializer.serialize_str(text),
            Self::Number(number) => serializer.serialize_f64(*number),
            Self::Bool(flag) => serializer.serialize_bool(*flag),
            Self::List(items) => {
                let mut sequence = serializer.serialize_seq(Some(items.len()))?;
                for item in items {
                    sequence.serialize_element(item)?;
                }
                sequence.end()
            }
            Self::Map(members) => {
                let mut map = serializer.serialize_map(Some(members.len()))?;
                for (key, member) in super::in_object_order(members.iter()) {
                    map.serialize_entry(key, member)?;
                }
                map.end()
            }
        }
    }
}
