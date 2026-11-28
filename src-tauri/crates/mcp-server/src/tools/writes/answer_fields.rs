//! A write answer as an ordered object: each tool says which fields it carries and in what order,
//! and a field that is absent is not written, as JavaScript leaves `undefined` out.

use serde::ser::{SerializeMap, SerializeSeq};
use serde::{Serialize, Serializer};
use vault_edit::Setting;

use crate::answer::ToolOutput;
use crate::error::ToolError;

#[derive(Default)]
pub struct Fields(Vec<(String, Setting)>);

impl Fields {
    pub fn new() -> Self {
        Self::default()
    }

    #[must_use]
    pub fn with(mut self, key: &str, value: Setting) -> Self {
        self.0.push((key.to_string(), value));
        self
    }

    #[must_use]
    pub fn with_text(self, key: &str, value: &str) -> Self {
        self.with(key, Setting::text(value))
    }

    #[must_use]
    pub fn with_bool(self, key: &str, value: bool) -> Self {
        self.with(key, Setting::Bool(value))
    }

    #[must_use]
    pub fn with_some(self, key: &str, value: Option<Setting>) -> Self {
        match value {
            Some(value) => self.with(key, value),
            None => self,
        }
    }

    #[must_use]
    pub fn with_number(self, key: &str, value: Option<f64>) -> Self {
        self.with_some(key, value.map(Setting::Number))
    }

    /// A list written only when it holds something.
    #[must_use]
    pub fn with_texts_if_any(self, key: &str, values: Vec<String>) -> Self {
        if values.is_empty() {
            self
        } else {
            self.with(key, Setting::texts(values))
        }
    }

    pub fn into_setting(self) -> Setting {
        Setting::Map(self.0)
    }
}

pub struct Answer<'a>(pub &'a Setting);

impl Serialize for Answer<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0 {
            Setting::Null => serializer.serialize_none(),
            Setting::Text(text) => serializer.serialize_str(text),
            Setting::Number(number) => serializer.serialize_f64(*number),
            Setting::Bool(flag) => serializer.serialize_bool(*flag),
            Setting::List(items) => {
                let mut sequence = serializer.serialize_seq(Some(items.len()))?;
                for item in items {
                    sequence.serialize_element(&Answer(item))?;
                }
                sequence.end()
            }
            Setting::Map(members) => {
                let mut map = serializer.serialize_map(Some(members.len()))?;
                for (key, value) in members {
                    map.serialize_entry(key, &Answer(value))?;
                }
                map.end()
            }
        }
    }
}

pub fn output(fields: Fields) -> Result<ToolOutput, ToolError> {
    ToolOutput::json(&Answer(&fields.into_setting()))
}

/// A batch row: its own fields first, then the failure the row carries.
pub fn failed_row(fields: Fields, error: &ToolError) -> Result<Setting, ToolError> {
    let failure = serde_json::to_string(&error.as_row())
        .map_err(|cause| ToolError::failed(cause.to_string()))?;
    let parsed = super::sent_setting::parse(&failure)?;
    let Setting::Map(members) = parsed else {
        return Ok(fields.into_setting());
    };
    let Setting::Map(mut own) = fields.into_setting() else {
        return Ok(Setting::Map(members));
    };
    own.extend(members);
    Ok(Setting::Map(own))
}
