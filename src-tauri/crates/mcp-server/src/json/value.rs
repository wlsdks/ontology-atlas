//! The value type and its JavaScript-ordered object.

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
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Object {
    entries: Vec<(String, Value)>,
    /// How many leading entries have array-index keys.
    index_keys: usize,
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

impl Object {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.entries
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value)
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.get(key).is_some()
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.entries.iter().map(|(name, _)| name.as_str())
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &Value)> {
        self.entries
            .iter()
            .map(|(name, value)| (name.as_str(), value))
    }

    /// Sets `key`. An existing key keeps its position and takes the new value.
    pub fn insert(&mut self, key: impl Into<String>, value: Value) {
        let key = key.into();
        if let Some(existing) = self.entries.iter_mut().find(|(name, _)| *name == key) {
            existing.1 = value;
            return;
        }
        match array_index(&key) {
            None => self.entries.push((key, value)),
            Some(index) => {
                let position = self
                    .entries
                    .iter()
                    .take(self.index_keys)
                    .position(|(name, _)| array_index(name).is_some_and(|other| other > index))
                    .unwrap_or(self.index_keys);
                self.entries.insert(position, (key, value));
                self.index_keys += 1;
            }
        }
    }

    /// Removes `key`, returning its value.
    pub fn remove(&mut self, key: &str) -> Option<Value> {
        let position = self.entries.iter().position(|(name, _)| name == key)?;
        if position < self.index_keys {
            self.index_keys -= 1;
        }
        Some(self.entries.remove(position).1)
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
}
