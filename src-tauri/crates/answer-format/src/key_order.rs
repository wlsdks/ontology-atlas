//! An object's keys in the order JavaScript lists them: array-index keys first, ascending, then
//! every other key in the order it was first added.

use std::fmt;

use indexmap::IndexMap;
use serde::de::{Deserialize, Deserializer};
use serde::ser::{Serialize, SerializeMap, Serializer};

/// A canonical array index: `0`, or digits without a leading zero, below 2^32 - 1.
fn array_index(key: &str) -> Option<u32> {
    let bytes = key.as_bytes();
    if bytes.is_empty() || bytes.len() > 10 || (bytes.len() > 1 && bytes.first() == Some(&b'0')) {
        return None;
    }
    if !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    key.parse::<u32>().ok().filter(|index| *index != u32::MAX)
}

/// A map of string keys to `V` that lists its entries as a JavaScript object does. Adding a key
/// that is already there replaces its value where it stands.
#[derive(Clone)]
pub struct OrderedMap<V> {
    entries: IndexMap<String, V>,
    /// How many keys are array indices; while there are none, insertion order is the order.
    indexed: usize,
}

impl<V> Default for OrderedMap<V> {
    fn default() -> Self {
        Self::new()
    }
}

impl<V: fmt::Debug> fmt::Debug for OrderedMap<V> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_map().entries(self.iter()).finish()
    }
}

impl<V> OrderedMap<V> {
    pub fn new() -> Self {
        Self {
            entries: IndexMap::new(),
            indexed: 0,
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Sets `key`, returning the value it replaced.
    pub fn insert(&mut self, key: String, value: V) -> Option<V> {
        let is_index = array_index(&key).is_some();
        let replaced = self.entries.insert(key, value);
        if replaced.is_none() && is_index {
            self.indexed += 1;
        }
        replaced
    }

    pub fn get(&self, key: &str) -> Option<&V> {
        self.entries.get(key)
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.entries.contains_key(key)
    }

    /// Removes `key`, keeping the order of the others.
    pub fn remove(&mut self, key: &str) -> Option<V> {
        let removed = self.entries.shift_remove(key);
        if removed.is_some() && array_index(key).is_some() {
            self.indexed -= 1;
        }
        removed
    }

    /// The entries in JavaScript's order.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &V)> {
        let mut indices: Vec<(u32, usize)> = if self.indexed == 0 {
            Vec::new()
        } else {
            self.entries
                .keys()
                .enumerate()
                .filter_map(|(position, key)| Some((array_index(key)?, position)))
                .collect()
        };
        indices.sort_unstable();
        let first = indices
            .into_iter()
            .filter_map(|(_, position)| self.entries.get_index(position));
        let rest = self
            .entries
            .iter()
            .filter(|(key, _)| self.indexed == 0 || array_index(key).is_none());
        first.chain(rest).map(|(key, value)| (key.as_str(), value))
    }

    /// The keys in JavaScript's order.
    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.iter().map(|(key, _)| key)
    }
}

impl<V> FromIterator<(String, V)> for OrderedMap<V> {
    fn from_iter<I: IntoIterator<Item = (String, V)>>(entries: I) -> Self {
        let mut map = Self::new();
        for (key, value) in entries {
            map.insert(key, value);
        }
        map
    }
}

impl<V: Serialize> Serialize for OrderedMap<V> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.len()))?;
        for (key, value) in self.iter() {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}

impl<'de, V: Deserialize<'de>> Deserialize<'de> for OrderedMap<V> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let entries = IndexMap::<String, V>::deserialize(deserializer)?;
        let indexed = entries
            .keys()
            .filter(|key| array_index(key).is_some())
            .count();
        Ok(Self { entries, indexed })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(map: &OrderedMap<u8>) -> Vec<&str> {
        map.keys().collect()
    }

    #[test]
    fn array_index_keys_come_first_ascending_then_the_rest_as_added() {
        let mut map = OrderedMap::new();
        for key in [
            "b",
            "10",
            "2",
            "a",
            "01",
            "-1",
            "4294967295",
            "4294967294",
            "0",
        ] {
            map.insert(key.to_string(), 0);
        }
        assert_eq!(
            keys(&map),
            [
                "0",
                "2",
                "10",
                "4294967294",
                "b",
                "a",
                "01",
                "-1",
                "4294967295"
            ]
        );
    }

    #[test]
    fn setting_a_key_again_replaces_its_value_in_place() {
        let mut map = OrderedMap::new();
        map.insert("b".to_string(), 1);
        map.insert("a".to_string(), 2);
        assert_eq!(map.insert("b".to_string(), 3), Some(1));
        assert_eq!(keys(&map), ["b", "a"]);
        assert_eq!(map.get("b"), Some(&3));
        assert_eq!(map.len(), 2);
    }

    #[test]
    fn removing_a_key_keeps_the_order_of_the_others() {
        let mut map: OrderedMap<u8> = [("b", 1), ("1", 2), ("a", 3)]
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect();
        assert_eq!(map.remove("1"), Some(2));
        assert_eq!(map.remove("1"), None);
        assert_eq!(keys(&map), ["b", "a"]);
        map.insert("1".to_string(), 4);
        assert_eq!(keys(&map), ["1", "b", "a"]);
    }

    #[test]
    fn a_map_read_from_json_keeps_the_same_rule() {
        let map: OrderedMap<u8> =
            serde_json::from_str(r#"{"b":1,"2":2,"a":3,"1":4,"b":5}"#).expect("reads");
        assert_eq!(keys(&map), ["1", "2", "b", "a"]);
        assert_eq!(map.get("b"), Some(&5));
    }
}
