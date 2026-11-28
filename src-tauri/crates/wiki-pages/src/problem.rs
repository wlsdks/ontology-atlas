//! One finding about a page. `message` is the English sentence agents read; `detail` carries its
//! pieces so a screen can retell it in the reader's language. `key` names the sentence, not the
//! code, since some codes have two shapes.

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

/// The named pieces of a sentence, written as one object in the order given.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Values(pub Vec<(&'static str, String)>);

impl Serialize for Values {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, value) in &self.0 {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Detail {
    pub key: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Values>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Problem {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<Detail>,
}

impl Problem {
    pub(crate) fn new(
        code: impl Into<String>,
        message: impl Into<String>,
        line: Option<usize>,
        key: &'static str,
        values: Vec<(&'static str, String)>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            line,
            detail: Some(Detail {
                key,
                values: (!values.is_empty()).then_some(Values(values)),
            }),
        }
    }

    /// A finding that carries no pieces to retell: the caller's own, such as a page that is missing.
    pub fn plain(code: &str, message: String) -> Self {
        Self {
            code: code.to_string(),
            message,
            line: None,
            detail: None,
        }
    }
}
