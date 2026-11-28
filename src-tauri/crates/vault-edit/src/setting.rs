//! What a frontmatter key is set to: the few shapes the vault format writes. `Null` is "remove the
//! key" in a patch and never reaches a file.

use answer_format::number;
use vault_document::frontmatter::{in_object_order, Scalar, Value};

#[derive(Debug, Clone, PartialEq)]
pub enum Setting {
    Null,
    Text(String),
    Number(f64),
    Bool(bool),
    List(Vec<Setting>),
    /// Members in the order they are written.
    Map(Vec<(String, Setting)>),
}

impl Setting {
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text(text.into())
    }

    pub fn texts<S: Into<String>>(items: impl IntoIterator<Item = S>) -> Self {
        Self::List(items.into_iter().map(|item| Self::Text(item.into())).collect())
    }

    pub fn as_text(&self) -> Option<&str> {
        match self {
            Self::Text(text) => Some(text),
            _ => None,
        }
    }

    /// The member `key` of a map.
    pub fn member(&self, key: &str) -> Option<&Setting> {
        match self {
            Self::Map(members) => members
                .iter()
                .find(|(held, _)| held == key)
                .map(|(_, value)| value),
            _ => None,
        }
    }

    /// What JavaScript calls the type of the value, as a refusal names it.
    pub fn kind_name(&self) -> &'static str {
        match self {
            Self::Null => "null",
            Self::Text(_) => "string",
            Self::Number(_) => "number",
            Self::Bool(_) => "boolean",
            Self::List(_) => "array",
            Self::Map(_) => "object",
        }
    }

    /// What `String(value)` gives in JavaScript: a list joins its items with a comma, a map is
    /// `[object Object]`, and `null` inside a list is empty.
    pub fn display(&self) -> String {
        match self {
            Self::Null => "null".to_string(),
            Self::Text(text) => text.clone(),
            Self::Number(value) => number::text(*value),
            Self::Bool(flag) => flag.to_string(),
            Self::List(items) => items
                .iter()
                .map(|item| match item {
                    Self::Null => String::new(),
                    other => other.display(),
                })
                .collect::<Vec<_>>()
                .join(","),
            Self::Map(_) => "[object Object]".to_string(),
        }
    }
}

impl From<&Value> for Setting {
    fn from(value: &Value) -> Self {
        match value {
            Value::Text(text) => Self::Text(text.clone()),
            Value::Number(number) => Self::Number(*number),
            Value::Bool(flag) => Self::Bool(*flag),
            Value::List(items) => Self::texts(items.iter().cloned()),
            Value::Map(members) => Self::Map(
                in_object_order(members.iter())
                    .into_iter()
                    .map(|(key, member)| {
                        let setting = match member {
                            Scalar::Text(text) => Self::Text(text.clone()),
                            Scalar::Number(number) => Self::Number(*number),
                            Scalar::Bool(flag) => Self::Bool(*flag),
                        };
                        (key.clone(), setting)
                    })
                    .collect(),
            ),
        }
    }
}
