//! An argument as the agent sent it, with the order of its members kept: a patch adds new keys to
//! the file in the order they were sent, and a plain JSON value would sort them.

use std::fmt;

use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use vault_edit::Setting;

use crate::error::ToolError;

pub struct Sent(pub Setting);

struct SettingVisitor;

impl<'de> Visitor<'de> for SettingVisitor {
    type Value = Setting;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a JSON value")
    }

    fn visit_unit<E: de::Error>(self) -> Result<Setting, E> {
        Ok(Setting::Null)
    }

    fn visit_none<E: de::Error>(self) -> Result<Setting, E> {
        Ok(Setting::Null)
    }

    fn visit_bool<E: de::Error>(self, value: bool) -> Result<Setting, E> {
        Ok(Setting::Bool(value))
    }

    #[allow(clippy::cast_precision_loss, reason = "JavaScript numbers are doubles")]
    fn visit_i64<E: de::Error>(self, value: i64) -> Result<Setting, E> {
        Ok(Setting::Number(value as f64))
    }

    #[allow(clippy::cast_precision_loss, reason = "JavaScript numbers are doubles")]
    fn visit_u64<E: de::Error>(self, value: u64) -> Result<Setting, E> {
        Ok(Setting::Number(value as f64))
    }

    fn visit_f64<E: de::Error>(self, value: f64) -> Result<Setting, E> {
        Ok(Setting::Number(value))
    }

    fn visit_str<E: de::Error>(self, value: &str) -> Result<Setting, E> {
        Ok(Setting::Text(value.to_string()))
    }

    fn visit_string<E: de::Error>(self, value: String) -> Result<Setting, E> {
        Ok(Setting::Text(value))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Setting, A::Error> {
        let mut items = Vec::new();
        while let Some(Sent(item)) = seq.next_element()? {
            items.push(item);
        }
        Ok(Setting::List(items))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Setting, A::Error> {
        let mut members: Vec<(String, Setting)> = Vec::new();
        while let Some((key, Sent(value))) = map.next_entry::<String, Sent>()? {
            match members.iter_mut().find(|(held, _)| *held == key) {
                Some((_, held)) => *held = value,
                None => members.push((key, value)),
            }
        }
        Ok(Setting::Map(members))
    }
}

impl<'de> Deserialize<'de> for Sent {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(SettingVisitor).map(Sent)
    }
}

/// The text of one JSON value as a [`Setting`].
pub fn setting_of(raw: &serde_json::value::RawValue) -> Result<Setting, ToolError> {
    serde_json::from_str::<Sent>(raw.get())
        .map(|Sent(setting)| setting)
        .map_err(|error| ToolError::invalid(format!("Invalid arguments: {error}.")))
}

/// JSON text as a [`Setting`].
pub fn parse(text: &str) -> Result<Setting, ToolError> {
    serde_json::from_str::<Sent>(text)
        .map(|Sent(setting)| setting)
        .map_err(|error| ToolError::failed(format!("A write answer could not be read: {error}.")))
}
