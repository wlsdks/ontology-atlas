//! The value type and its JavaScript-ordered object.

use std::collections::{BTreeMap, HashMap};

/// A JSON value. Numbers are IEEE doubles, as in JavaScript.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Value>),
    Object(Object),
}

impl Value {
    pub fn string(text: impl Into<String>) -> Self {
        Self::String(text.into())
    }

    /// An integer-valued number. Integers beyond 2^53 lose precision, as they do in JavaScript.
    #[allow(clippy::cast_precision_loss)]
    pub fn integer(number: i64) -> Self {
        Self::Number(number as f64)
    }

    pub fn array(items: impl IntoIterator<Item = Value>) -> Self {
        Self::Array(items.into_iter().collect())
    }

    /// An object from `(key, value)` pairs, ordered as JavaScript would order them.
    pub fn object<K: Into<String>>(pairs: impl IntoIterator<Item = (K, Value)>) -> Self {
        Self::Object(pairs.into_iter().collect())
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::String(text) => Some(text),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Self::Number(number) => Some(*number),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Bool(flag) => Some(*flag),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[Value]> {
        match self {
            Self::Array(items) => Some(items),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&Object> {
        match self {
            Self::Object(object) => Some(object),
            _ => None,
        }
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.as_object().and_then(|object| object.get(key))
    }

    /// The word JavaScript's `typeof` gives, with `null` and arrays told apart as zod reports them.
    pub fn received_kind(&self) -> &'static str {
        match self {
            Self::Null => "null",
            Self::Bool(_) => "boolean",
            Self::Number(_) => "number",
            Self::String(_) => "string",
            Self::Array(_) => "array",
            Self::Object(_) => "object",
        }
    }
}

/// An object whose keys keep JavaScript's order: array-index keys first and ascending, then every
/// other key in the order it was first added. Setting a key again replaces its value in place.
///
/// Array-index keys live in an ordered map and the rest in insertion order beside a hash index of
/// their positions, so a lookup or an insert costs the same however many keys the object holds.
///
/// The entries sit behind one pointer that an empty object does not allocate, so a [`Value`] stays
/// small however the bookkeeping grows.
#[derive(Debug, Clone, Default)]
pub struct Object(Option<Box<Entries>>);

#[derive(Debug, Clone, Default)]
struct Entries {
    indexed: BTreeMap<u32, (String, Value)>,
    named: Vec<(String, Value)>,
    /// Position in `named` of each name there.
    positions: HashMap<String, usize>,
}

impl PartialEq for Object {
    fn eq(&self, other: &Self) -> bool {
        self.len() == other.len()
            && self
                .iter()
                .zip(other.iter())
                .all(|(left, right)| left == right)
    }
}

/// A canonical array index: `0`, or digits without a leading zero, below 2^32 - 1.
fn array_index(key: &str) -> Option<u32> {
    let bytes = key.as_bytes();
    if bytes.is_empty() || bytes.len() > 10 || (bytes.len() > 1 && bytes.first() == Some(&b'0')) {
        return None;
    }
    if !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let number: u64 = key.parse().ok()?;
    if number < u64::from(u32::MAX) {
        u32::try_from(number).ok()
    } else {
        None
    }
}

#[cfg(test)]
thread_local! {
    /// Entries visited by the one linear operation an object has (`remove`), so a test can prove
    /// lookups and inserts visit none.
    static LINEAR_STEPS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

impl Object {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.0
            .as_ref()
            .map_or(0, |entries| entries.indexed.len() + entries.named.len())
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        let entries = self.0.as_ref()?;
        match array_index(key) {
            Some(index) => entries.indexed.get(&index).map(|(_, value)| value),
            None => {
                let position = *entries.positions.get(key)?;
                entries.named.get(position).map(|(_, value)| value)
            }
        }
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.get(key).is_some()
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.entries().map(|(name, _)| name.as_str())
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &Value)> {
        self.entries().map(|(name, value)| (name.as_str(), value))
    }

    fn entries(&self) -> impl Iterator<Item = &(String, Value)> {
        self.0
            .iter()
            .flat_map(|entries| entries.indexed.values().chain(entries.named.iter()))
    }

    /// Sets `key`. An existing key keeps its position and takes the new value.
    pub fn insert(&mut self, key: impl Into<String>, value: Value) {
        let key = key.into();
        let entries = self.0.get_or_insert_with(Box::default);
        if let Some(index) = array_index(&key) {
            entries.indexed.insert(index, (key, value));
            return;
        }
        if let Some(entry) = entries
            .positions
            .get(&key)
            .and_then(|position| entries.named.get_mut(*position))
        {
            entry.1 = value;
            return;
        }
        entries.positions.insert(key.clone(), entries.named.len());
        entries.named.push((key, value));
    }

    /// Removes `key`, returning its value. Removing a name renumbers the names after it, so this
    /// is the one operation that costs in proportion to the object's size.
    pub fn remove(&mut self, key: &str) -> Option<Value> {
        let entries = self.0.as_mut()?;
        if let Some(index) = array_index(key) {
            return entries.indexed.remove(&index).map(|(_, value)| value);
        }
        let position = entries.positions.remove(key)?;
        let (_, value) = entries.named.remove(position);
        for (name, _) in entries.named.iter().skip(position) {
            #[cfg(test)]
            LINEAR_STEPS.with(|steps| steps.set(steps.get() + 1));
            if let Some(slot) = entries.positions.get_mut(name.as_str()) {
                *slot -= 1;
            }
        }
        Some(value)
    }
}

impl<K: Into<String>> FromIterator<(K, Value)> for Object {
    fn from_iter<I: IntoIterator<Item = (K, Value)>>(pairs: I) -> Self {
        let mut object = Object::new();
        for (key, value) in pairs {
            object.insert(key, value);
        }
        object
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(object: &Object) -> Vec<&str> {
        object.keys().collect()
    }

    #[test]
    fn integer_like_keys_come_first_and_ascending() {
        let object: Object = [
            ("b", Value::Null),
            ("10", Value::Null),
            ("a", Value::Null),
            ("2", Value::Null),
            ("1", Value::Null),
        ]
        .into_iter()
        .collect();
        assert_eq!(keys(&object), vec!["1", "2", "10", "b", "a"]);
    }

    #[test]
    fn only_canonical_array_indices_are_reordered() {
        let object: Object = [
            ("z", Value::Null),
            ("01", Value::Null),
            ("-1", Value::Null),
            ("1.5", Value::Null),
            ("4294967295", Value::Null),
            ("4294967294", Value::Null),
            ("0", Value::Null),
        ]
        .into_iter()
        .collect();
        assert_eq!(
            keys(&object),
            vec!["0", "4294967294", "z", "01", "-1", "1.5", "4294967295"]
        );
    }

    #[test]
    fn setting_a_key_again_keeps_its_place() {
        let mut object = Object::new();
        object.insert("a", Value::Number(1.0));
        object.insert("b", Value::Number(2.0));
        object.insert("a", Value::Number(3.0));
        assert_eq!(keys(&object), vec!["a", "b"]);
        assert_eq!(object.get("a"), Some(&Value::Number(3.0)));
    }

    #[test]
    fn removing_an_index_key_keeps_the_count_of_leading_index_keys_true() {
        let mut object: Object = [("2", Value::Null), ("a", Value::Null)]
            .into_iter()
            .collect();
        object.remove("2");
        object.insert("1", Value::Null);
        assert_eq!(keys(&object), vec!["1", "a"]);
    }

    #[test]
    fn a_proto_key_is_an_ordinary_key() {
        let object: Object = [("__proto__", Value::Bool(true))].into_iter().collect();
        assert_eq!(object.get("__proto__"), Some(&Value::Bool(true)));
    }

    #[test]
    fn eighty_thousand_keys_cost_no_linear_scan() {
        LINEAR_STEPS.with(|steps| steps.set(0));
        let mut object = Object::new();
        for number in 0..40_000 {
            object.insert(format!("name{number}"), Value::integer(number));
            // Array-index keys arrive in descending order, the worst case for a sorted insert.
            object.insert((40_000 - number).to_string(), Value::integer(number));
        }
        assert_eq!(object.len(), 80_000);
        // Setting every name again replaces it in place and adds nothing.
        for number in 0..40_000 {
            object.insert(format!("name{number}"), Value::integer(-number));
        }
        assert_eq!(object.len(), 80_000);
        assert_eq!(object.get("name39999"), Some(&Value::integer(-39_999)));
        assert_eq!(object.get("1"), Some(&Value::integer(39_999)));
        let keys: Vec<&str> = object.keys().collect();
        assert_eq!(keys.first(), Some(&"1"));
        assert_eq!(keys.get(39_999), Some(&"40000"));
        assert_eq!(keys.get(40_000), Some(&"name0"));
        assert_eq!(
            LINEAR_STEPS.with(std::cell::Cell::get),
            0,
            "insert and get never walk the entries"
        );
    }

    #[test]
    fn removing_a_name_renumbers_only_the_names_after_it() {
        let mut object: Object = [("a", Value::Null), ("b", Value::Null), ("c", Value::Null)]
            .into_iter()
            .collect();
        LINEAR_STEPS.with(|steps| steps.set(0));
        assert_eq!(object.remove("a"), Some(Value::Null));
        assert_eq!(LINEAR_STEPS.with(std::cell::Cell::get), 2);
        assert_eq!(keys(&object), vec!["b", "c"]);
        assert!(object.get("c").is_some());
        object.insert("a", Value::Bool(true));
        assert_eq!(keys(&object), vec!["b", "c", "a"]);
    }
}
