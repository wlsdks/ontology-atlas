//! Reading the frontmatter of a Markdown file: Atlas's own reader, because the vault format is not
//! YAML. It reads the shapes the writer produces and the ones a person types by hand, and it
//! reports a line it cannot honour instead of refusing the file.

mod block;
mod block_scalar;
mod diagnostic;
mod entry_line;
mod inline;
mod javascript_number;
mod key;
mod line;
mod quoting;
mod value;

pub use answer_format::key_order::in_object_order;
pub use block::{read_block, ReadBlock, ReadEntry};
pub use diagnostic::{Diagnostic, DiagnosticCode};
pub use key::Key;
pub use line::Line;
pub use value::{Scalar, Value};

use std::collections::HashMap;

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

/// The keys of a node and what each holds, in the order the file wrote them. A key written twice
/// holds its last value at its first position. Written out, the keys come in the order a
/// JavaScript object lists them ([`in_object_order`]).
///
/// The entries are a list, not a hash table: a node has a dozen keys, which a look along the list
/// finds as soon as a hash would, and fifty thousand nodes keep fifty thousand fewer tables.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Frontmatter(Box<[(Key, Value)]>);

/// Past this many keys, a key written twice is found through a table while the entries are read.
const KEYS_FOUND_BY_LOOKING: usize = 32;

impl Serialize for Frontmatter {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, value) in in_object_order(self.iter()) {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}

fn pair((key, value): &(Key, Value)) -> (&Key, &Value) {
    (key, value)
}

type Entries<'a> =
    std::iter::Map<std::slice::Iter<'a, (Key, Value)>, fn(&(Key, Value)) -> (&Key, &Value)>;

impl Frontmatter {
    pub fn from_entries(entries: Vec<ReadEntry>) -> Self {
        let mut keys: Vec<(Key, Value)> = Vec::with_capacity(entries.len());
        let mut positions: HashMap<String, usize> = HashMap::new();
        let by_table = entries.len() > KEYS_FOUND_BY_LOOKING;
        for entry in entries {
            let Some(value) = entry.value else {
                continue;
            };
            let written = if by_table {
                positions.get(&entry.key).copied()
            } else {
                keys.iter().position(|(key, _)| *key == entry.key.as_str())
            };
            match written.and_then(|at| keys.get_mut(at)) {
                Some((_, held)) => *held = value,
                None => {
                    if by_table {
                        positions.insert(entry.key.clone(), keys.len());
                    }
                    keys.push((Key::new(&entry.key), value));
                }
            }
        }
        Self(keys.into_boxed_slice())
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.0
            .iter()
            .find(|(held, _)| *held == key)
            .map(|(_, value)| value)
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.get(key).is_some()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// The keys and values in the order they were written.
    pub fn iter(&self) -> Entries<'_> {
        self.0
            .iter()
            .map(pair as fn(&(Key, Value)) -> (&Key, &Value))
    }

    /// The keys and values in the order a JavaScript object lists them.
    pub fn in_object_order(&self) -> Vec<(&Key, &Value)> {
        in_object_order(self.iter())
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.0.iter().map(|(key, _)| key.as_str())
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
    type Item = (&'a Key, &'a Value);
    type IntoIter = Entries<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}
