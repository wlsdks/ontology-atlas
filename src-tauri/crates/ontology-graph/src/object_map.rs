//! A map written as the JavaScript object it stood for: keys that are array indices first, in
//! numeric order, then every other key in the order it was added. The answers of the JavaScript
//! server are objects keyed by slug, kind or uid, so a vault with a node named `2024` lists it first.

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use vault_document::frontmatter::in_object_order;

/// Entries in the order they were added; a key is added once.
#[derive(Debug, Clone)]
pub struct ObjectMap<V>(pub Vec<(String, V)>);

impl<V> Default for ObjectMap<V> {
    fn default() -> Self {
        Self(Vec::new())
    }
}

impl<V: Serialize> Serialize for ObjectMap<V> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, value) in in_object_order(self.0.iter().map(|(key, value)| (key, value))) {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}
