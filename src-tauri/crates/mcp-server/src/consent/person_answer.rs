//! What the client reports a person answered (`ElicitResult`).

use std::collections::HashMap;

use serde::Deserialize;
use serde_json::value::RawValue;
use serde_json::Value;

/// The `action` of the answer, the whole of what a person decides.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Accept,
    Decline,
    Cancel,
}

impl Action {
    pub fn word(self) -> &'static str {
        match self {
            Self::Accept => "accept",
            Self::Decline => "decline",
            Self::Cancel => "cancel",
        }
    }
}

#[derive(Debug, Deserialize)]
struct Wire {
    action: Action,
    #[serde(default)]
    content: Option<HashMap<String, Value>>,
}

/// A person's answer to the consent question.
#[derive(Debug, PartialEq, Eq)]
pub struct PersonAnswer {
    pub action: Action,
    /// An older form client reports `confirm: false` beside `accept`.
    confirmed_no: bool,
}

impl PersonAnswer {
    /// The answer in `result`, or `None` when it is not an elicitation result: no `action`, an
    /// `action` that is not one of the three words, or `content` that is not an object.
    pub fn read(result: &RawValue) -> Option<Self> {
        let wire: Wire = serde_json::from_str(result.get()).ok()?;
        let confirmed_no = wire
            .content
            .as_ref()
            .and_then(|content| content.get("confirm"))
            .is_some_and(|confirm| *confirm == Value::Bool(false));
        Some(Self {
            action: wire.action,
            confirmed_no,
        })
    }

    /// Only `accept` approves, and `confirm: false` beside it is still a no; a `confirm` that is
    /// absent is not.
    pub fn approves(&self) -> bool {
        self.action == Action::Accept && !self.confirmed_no
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(text: &str) -> Option<PersonAnswer> {
        PersonAnswer::read(&RawValue::from_string(text.to_string()).expect("json"))
    }

    #[test]
    fn only_accept_without_a_confirm_of_false_approves() {
        assert!(read(r#"{"action":"accept"}"#).is_some_and(|answer| answer.approves()));
        assert!(read(r#"{"action":"accept","content":{}}"#).is_some_and(|answer| answer.approves()));
        assert!(read(r#"{"action":"accept","content":{"confirm":true}}"#)
            .is_some_and(|answer| answer.approves()));
        for no in [
            r#"{"action":"decline"}"#,
            r#"{"action":"cancel"}"#,
            r#"{"action":"accept","content":{"confirm":false}}"#,
        ] {
            assert!(read(no).is_some_and(|answer| !answer.approves()), "{no}");
        }
    }

    #[test]
    fn an_answer_that_is_not_an_elicitation_result_is_not_an_answer() {
        for bad in [
            "{}",
            r#"{"action":"yes"}"#,
            r#"{"action":"Accept"}"#,
            r#"{"action":true}"#,
            r#"{"action":"accept","content":"x"}"#,
            r#"{"content":{}}"#,
        ] {
            assert!(read(bad).is_none(), "{bad}");
        }
    }
}
