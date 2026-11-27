//! What the client said it can do, read once when it introduces itself.

use std::collections::HashMap;

use serde_json::value::RawValue;

use crate::raw_json::Kind;

/// The capabilities announced in `initialize`, as far as the server acts on them.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ClientCapabilities {
    elicitation: bool,
}

/// Whether JavaScript would call `raw` true: the test the JavaScript server applies to a capability.
fn is_truthy(raw: &RawValue) -> bool {
    match Kind::of(raw) {
        Kind::Null => false,
        Kind::Boolean => raw.get() == "true",
        Kind::Number => raw.get().parse::<f64>().is_ok_and(|number| number != 0.0),
        Kind::String => raw.get() != "\"\"",
        Kind::Array | Kind::Object => true,
    }
}

impl ClientCapabilities {
    /// The capabilities of the `capabilities` object of `initialize`; one that is not an object, or
    /// names nothing the server uses, announces none.
    pub fn announced(capabilities: &RawValue) -> Self {
        let members: HashMap<String, &RawValue> =
            serde_json::from_str(capabilities.get()).unwrap_or_default();
        Self {
            elicitation: members.get("elicitation").copied().is_some_and(is_truthy),
        }
    }

    /// Whether a question can be put to the person at the client (`elicitation/create`): the
    /// client announced `elicitation`. A write that needs a person's answer is refused without it.
    pub fn can_ask_client(self) -> bool {
        self.elicitation
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn announced(text: &str) -> ClientCapabilities {
        ClientCapabilities::announced(&RawValue::from_string(text.to_string()).expect("json"))
    }

    #[test]
    fn only_what_a_script_calls_true_announces_elicitation() {
        for text in [
            r#"{"elicitation":{}}"#,
            r#"{"elicitation":{"form":{}},"sampling":{}}"#,
            r#"{"elicitation":true}"#,
            r#"{"elicitation":1}"#,
        ] {
            assert!(announced(text).can_ask_client(), "{text}");
        }
        for text in [
            "{}",
            "[]",
            r#"{"elicitation":null}"#,
            r#"{"elicitation":false}"#,
            r#"{"elicitation":0}"#,
            r#"{"elicitation":-0}"#,
            r#"{"elicitation":""}"#,
            r#"{"sampling":{}}"#,
        ] {
            assert!(!announced(text).can_ask_client(), "{text}");
        }
    }
}
