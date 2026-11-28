//! JSON as a record holds it: a number is a double and an object keeps its keys in the order the
//! file wrote them, as a script reads the record. Read once from the text of a metadata line and
//! never changed.

use std::fmt;

use indexmap::IndexMap;
use serde::de::{Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde::ser::{Serialize, SerializeMap, SerializeSeq, Serializer};

#[derive(Debug, Clone, PartialEq)]
pub enum RecordValue {
    Null,
    Bool(bool),
    Number(f64),
    Text(String),
    List(Vec<RecordValue>),
    Object(IndexMap<String, RecordValue>),
}

impl RecordValue {
    pub fn as_text(&self) -> Option<&str> {
        match self {
            Self::Text(text) => Some(text),
            _ => None,
        }
    }

    pub fn as_list(&self) -> Option<&[RecordValue]> {
        match self {
            Self::List(items) => Some(items),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&IndexMap<String, RecordValue>> {
        match self {
            Self::Object(entries) => Some(entries),
            _ => None,
        }
    }

    /// The value of `key` when this is an object that has it.
    pub fn get(&self, key: &str) -> Option<&RecordValue> {
        self.as_object()?.get(key)
    }

    pub fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }
}

struct ValueVisitor;

impl<'de> Visitor<'de> for ValueVisitor {
    type Value = RecordValue;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a JSON value")
    }

    fn visit_unit<E>(self) -> Result<RecordValue, E> {
        Ok(RecordValue::Null)
    }

    fn visit_bool<E>(self, value: bool) -> Result<RecordValue, E> {
        Ok(RecordValue::Bool(value))
    }

    #[allow(
        clippy::cast_precision_loss,
        reason = "a script reads every number as a double"
    )]
    fn visit_i64<E>(self, value: i64) -> Result<RecordValue, E> {
        Ok(RecordValue::Number(value as f64))
    }

    #[allow(
        clippy::cast_precision_loss,
        reason = "a script reads every number as a double"
    )]
    fn visit_u64<E>(self, value: u64) -> Result<RecordValue, E> {
        Ok(RecordValue::Number(value as f64))
    }

    fn visit_f64<E>(self, value: f64) -> Result<RecordValue, E> {
        Ok(RecordValue::Number(value))
    }

    fn visit_str<E>(self, value: &str) -> Result<RecordValue, E> {
        Ok(RecordValue::Text(value.to_string()))
    }

    fn visit_string<E>(self, value: String) -> Result<RecordValue, E> {
        Ok(RecordValue::Text(value))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut items: A) -> Result<RecordValue, A::Error> {
        let mut list = Vec::new();
        while let Some(item) = items.next_element()? {
            list.push(item);
        }
        Ok(RecordValue::List(list))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut entries: A) -> Result<RecordValue, A::Error> {
        // A key written twice keeps its first place and takes the last value, as a script object does.
        let mut object = IndexMap::new();
        while let Some((key, value)) = entries.next_entry::<String, RecordValue>()? {
            object.insert(key, value);
        }
        Ok(RecordValue::Object(object))
    }
}

impl<'de> Deserialize<'de> for RecordValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(ValueVisitor)
    }
}

/// Written as a script lists it: keys that are whole numbers first, ascending, then the others in
/// file order.
impl Serialize for RecordValue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Null => serializer.serialize_unit(),
            Self::Bool(value) => serializer.serialize_bool(*value),
            Self::Number(value) => serializer.serialize_f64(*value),
            Self::Text(text) => serializer.serialize_str(text),
            Self::List(items) => {
                let mut sequence = serializer.serialize_seq(Some(items.len()))?;
                for item in items {
                    sequence.serialize_element(item)?;
                }
                sequence.end()
            }
            Self::Object(entries) => {
                let mut map = serializer.serialize_map(Some(entries.len()))?;
                for (key, value) in answer_format::key_order::in_object_order(entries.iter()) {
                    map.serialize_entry(key, value)?;
                }
                map.end()
            }
        }
    }
}
