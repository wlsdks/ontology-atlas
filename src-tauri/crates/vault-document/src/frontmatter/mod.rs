//! Reading the frontmatter of a Markdown file: Atlas's own reader, because the vault format is not
//! YAML. It reads the shapes the writer produces and the ones a person types by hand, and it
//! reports a line it cannot honour instead of refusing the file.

mod block;
mod block_scalar;
mod diagnostic;
mod entry_line;
mod inline;
mod javascript_number;
mod key_order;
mod line;
mod quoting;
mod value;

pub use block::{read_block, ReadBlock, ReadEntry};
pub use diagnostic::{Diagnostic, DiagnosticCode};
pub use key_order::in_object_order;
pub use line::Line;
pub use value::{Scalar, Value};

use indexmap::IndexMap;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

/// The keys of a node and what each holds, in the order the file wrote them. A key written twice
/// holds its last value at its first position. Written out, the keys come in the order a
/// JavaScript object lists them ([`in_object_order`]).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Frontmatter(IndexMap<String, Value>);

impl Serialize for Frontmatter {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, value) in in_object_order(self.0.iter()) {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}

impl Frontmatter {
    pub fn from_entries(entries: &[ReadEntry]) -> Self {
        let mut keys = IndexMap::with_capacity(entries.len());
        for entry in entries {
            if let Some(value) = &entry.value {
                keys.insert(entry.key.clone(), value.clone());
            }
        }
        Self(keys)
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.0.get(key)
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.0.contains_key(key)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// The keys and values in the order they were written.
    pub fn iter(&self) -> indexmap::map::Iter<'_, String, Value> {
        self.0.iter()
    }

    /// The keys and values in the order a JavaScript object lists them.
    pub fn in_object_order(&self) -> Vec<(&String, &Value)> {
        in_object_order(self.0.iter())
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.0.keys().map(String::as_str)
    }

    /// The text under `key`, when it holds text.
    pub fn text(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(Value::as_text)
    }

    /// The items under `key`, when it holds a list.
    pub fn list(&self, key: &str) -> Option<&[String]> {
        self.get(key).and_then(Value::as_list)
    }

    /// JavaScript's `frontmatter[key] || fallback`: a missing key, empty text, zero and `false`
    /// give the fallback.
    pub fn truthy(&self, key: &str) -> Option<&Value> {
        self.get(key).filter(|value| value.is_truthy())
    }
}

impl<'a> IntoIterator for &'a Frontmatter {
    type Item = (&'a String, &'a Value);
    type IntoIter = indexmap::map::Iter<'a, String, Value>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}
