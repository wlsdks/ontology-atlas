//! JSON that keeps its keys in the order they were read. A binding another project owns is written
//! back as it was found, so a write for one project never reorders the lines of another.

use indexmap::IndexMap;
use serde::de::{MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, PartialEq)]
pub enum OrderedJson {
    Null,
    Bool(bool),
    Number(serde_json::Number),
    Text(String),
    List(Vec<OrderedJson>),
    Object(IndexMap<String, OrderedJson>),
}

impl OrderedJson {
    pub fn get(&self, key: &str) -> Option<&Self> {
        match self {
            Self::Object(members) => members.get(key),
            _ => None,
        }
    }
}

impl Serialize for OrderedJson {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Null => serializer.serialize_unit(),
            Self::Bool(flag) => serializer.serialize_bool(*flag),
            Self::Number(number) => number.serialize(serializer),
            Self::Text(text) => serializer.serialize_str(text),
            Self::List(items) => items.serialize(serializer),
            Self::Object(members) => members.serialize(serializer),
        }
    }
}

struct OrderedVisitor;

impl<'de> Visitor<'de> for OrderedVisitor {
    type Value = OrderedJson;

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("any JSON value")
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(OrderedJson::Null)
    }

    fn visit_bool<E>(self, flag: bool) -> Result<Self::Value, E> {
        Ok(OrderedJson::Bool(flag))
    }

    fn visit_i64<E>(self, number: i64) -> Result<Self::Value, E> {
        Ok(OrderedJson::Number(number.into()))
    }

    fn visit_u64<E>(self, number: u64) -> Result<Self::Value, E> {
        Ok(OrderedJson::Number(number.into()))
    }

    fn visit_f64<E: serde::de::Error>(self, number: f64) -> Result<Self::Value, E> {
        serde_json::Number::from_f64(number)
            .map(OrderedJson::Number)
            .ok_or_else(|| E::custom("a number JSON cannot hold"))
    }

    fn visit_str<E>(self, text: &str) -> Result<Self::Value, E> {
        Ok(OrderedJson::Text(text.to_string()))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> Result<Self::Value, A::Error> {
        let mut items = Vec::new();
        while let Some(item) = sequence.next_element()? {
            items.push(item);
        }
        Ok(OrderedJson::List(items))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut members = IndexMap::new();
        while let Some((key, value)) = map.next_entry::<String, OrderedJson>()? {
            members.insert(key, value);
        }
        Ok(OrderedJson::Object(members))
    }
}

impl<'de> Deserialize<'de> for OrderedJson {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(OrderedVisitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_come_back_in_the_order_they_were_read() {
        let text = r#"{"z":1,"a":{"y":[true,null,"x"],"b":2.5}}"#;
        let parsed: OrderedJson = serde_json::from_str(text).expect("parses");
        assert_eq!(serde_json::to_string(&parsed).expect("writes"), text);
    }
}
