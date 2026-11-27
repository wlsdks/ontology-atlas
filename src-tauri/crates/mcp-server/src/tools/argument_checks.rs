//! Reading the arguments of a vault read as the JavaScript server reads them: every argument is
//! checked for what it is when a handler asks, and the refusal is the sentence agents have always
//! been given, so a saved prompt that repairs a call from it keeps working.
//!
//! An argument that was not sent is `None`. One that was sent as `null` is a value that is not what
//! the check wants, which is how JavaScript's `undefined` and `null` differ.

use serde_json::Value;

use crate::arguments::Arguments;
use crate::error::{ReceivedValue, ToolError};

/// The argument as a JSON value, or `None` when it was not sent.
pub fn argument(arguments: &Arguments, name: &str) -> Result<Option<Value>, ToolError> {
    arguments.read::<Value>(name)
}

/// Text that is not blank, has no space at either end and holds no null byte.
pub fn non_blank_text(value: &Value, name: &str) -> Result<String, ToolError> {
    let Some(text) = value
        .as_str()
        .filter(|text| !answer_format::whitespace::trim(text).is_empty())
    else {
        return Err(ToolError::invalid(format!(
            "{name} must be a non-empty string."
        )));
    };
    if text != answer_format::whitespace::trim(text) {
        return Err(ToolError::invalid(format!(
            "{name} must not have leading or trailing whitespace."
        )));
    }
    if text.contains('\0') {
        return Err(ToolError::invalid(format!(
            "{name} must not contain a null byte."
        )));
    }
    Ok(text.to_string())
}

pub fn optional_non_blank_text(
    arguments: &Arguments,
    name: &str,
) -> Result<Option<String>, ToolError> {
    argument(arguments, name)?
        .map(|value| non_blank_text(&value, name))
        .transpose()
}

pub fn required_non_blank_text(arguments: &Arguments, name: &str) -> Result<String, ToolError> {
    non_blank_text(&argument(arguments, name)?.unwrap_or(Value::Null), name)
}

/// A number that is not negative and not infinite.
pub fn optional_non_negative_number(
    arguments: &Arguments,
    name: &str,
) -> Result<Option<f64>, ToolError> {
    argument(arguments, name)?
        .map(|value| match value.as_f64() {
            Some(number) if number.is_finite() && number >= 0.0 => Ok(number),
            _ => Err(ToolError::invalid(format!(
                "{name} must be a non-negative finite number."
            ))),
        })
        .transpose()
}

fn whole_number(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .filter(|number| number.is_finite() && number.fract() == 0.0)
}

/// A whole number from zero up, and at most `max` when one is given.
pub fn optional_non_negative_integer(
    arguments: &Arguments,
    name: &str,
    max: Option<f64>,
) -> Result<Option<f64>, ToolError> {
    argument(arguments, name)?
        .map(|value| {
            let number = whole_number(&value)
                .filter(|number| *number >= 0.0)
                .ok_or_else(|| {
                    ToolError::invalid(format!("{name} must be a non-negative integer."))
                })?;
            within_maximum(number, name, max)
        })
        .transpose()
}

/// A whole number from one up, and at most `max` when one is given.
pub fn optional_positive_integer(
    arguments: &Arguments,
    name: &str,
    max: Option<f64>,
) -> Result<Option<f64>, ToolError> {
    argument(arguments, name)?
        .map(|value| {
            let number = whole_number(&value)
                .filter(|number| *number > 0.0)
                .ok_or_else(|| ToolError::invalid(format!("{name} must be a positive integer.")))?;
            within_maximum(number, name, max)
        })
        .transpose()
}

fn within_maximum(number: f64, name: &str, max: Option<f64>) -> Result<f64, ToolError> {
    match max {
        Some(max) if number > max => Err(ToolError::invalid(format!(
            "{name} must be <= {}.",
            answer_format::number::text(max)
        ))),
        _ => Ok(number),
    }
}

pub fn optional_boolean(arguments: &Arguments, name: &str) -> Result<Option<bool>, ToolError> {
    argument(arguments, name)?
        .map(|value| {
            value
                .as_bool()
                .ok_or_else(|| ToolError::invalid(format!("{name} must be a boolean.")))
        })
        .transpose()
}

/// What JavaScript calls the kind of a value that is not text, as a refusal names it.
fn kind_of(value: &Value) -> ReceivedValue<'_> {
    match value {
        Value::String(text) => ReceivedValue::Text(text),
        Value::Null => ReceivedValue::Other("null"),
        Value::Array(_) => ReceivedValue::Other("array"),
        Value::Bool(_) => ReceivedValue::Other("boolean"),
        Value::Number(_) => ReceivedValue::Other("number"),
        Value::Object(_) => ReceivedValue::Other("object"),
    }
}

/// A value from `allowed`, named for what the agent received when it is not one.
pub fn one_of<'a>(value: &Value, name: &str, allowed: &[&'a str]) -> Result<&'a str, ToolError> {
    value
        .as_str()
        .and_then(|text| allowed.iter().copied().find(|candidate| *candidate == text))
        .ok_or_else(|| ToolError::not_an_allowed_value(name, kind_of(value), allowed))
}

pub fn optional_one_of<'a>(
    arguments: &Arguments,
    name: &str,
    allowed: &[&'a str],
) -> Result<Option<&'a str>, ToolError> {
    argument(arguments, name)?
        .map(|value| one_of(&value, name, allowed))
        .transpose()
}

/// A list of at most `max` texts, each non-blank, unpadded and free of a null byte.
pub fn optional_text_list(
    arguments: &Arguments,
    name: &str,
    max: usize,
) -> Result<Option<Vec<String>>, ToolError> {
    let Some(value) = argument(arguments, name)? else {
        return Ok(None);
    };
    let Some(items) = value.as_array() else {
        return Err(ToolError::invalid(format!(
            "{name} must be an array of strings."
        )));
    };
    if items.len() > max {
        return Err(ToolError::invalid(format!(
            "{name} must contain at most {max} items."
        )));
    }
    let mut texts = Vec::with_capacity(items.len());
    for item in items {
        let Some(text) = item.as_str() else {
            return Err(ToolError::invalid(format!(
                "{name} must be an array of strings."
            )));
        };
        if answer_format::whitespace::trim(text).is_empty() {
            return Err(ToolError::invalid(format!(
                "{name} items must be non-empty strings."
            )));
        }
        if text != answer_format::whitespace::trim(text) {
            return Err(ToolError::invalid(format!(
                "{name} items must not have leading or trailing whitespace."
            )));
        }
        if text.contains('\0') {
            return Err(ToolError::invalid(format!(
                "{name} items must not contain a null byte."
            )));
        }
        texts.push(text.to_string());
    }
    Ok(Some(texts))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(text: &str) -> Arguments {
        Arguments::from_fields(serde_json::from_str(text).expect("reads"))
    }

    fn refusal<T: std::fmt::Debug>(result: Result<T, ToolError>) -> String {
        result.expect_err("refused").message().to_string()
    }

    #[test]
    fn every_refusal_is_the_sentence_the_javascript_server_gives() {
        let sent = arguments(r#"{"a":-1,"b":1.5,"c":501,"d":"x","e":null,"f":" p ","g":[1]}"#);
        assert_eq!(
            refusal(optional_non_negative_number(&sent, "a")),
            "a must be a non-negative finite number."
        );
        assert_eq!(
            refusal(optional_non_negative_integer(&sent, "b", None)),
            "b must be a non-negative integer."
        );
        assert_eq!(
            refusal(optional_positive_integer(&sent, "c", Some(500.0))),
            "c must be <= 500."
        );
        assert_eq!(
            refusal(optional_boolean(&sent, "d")),
            "d must be a boolean."
        );
        assert_eq!(
            refusal(optional_non_blank_text(&sent, "e")),
            "e must be a non-empty string."
        );
        assert_eq!(
            refusal(optional_non_blank_text(&sent, "f")),
            "f must not have leading or trailing whitespace."
        );
        assert_eq!(
            refusal(optional_text_list(&sent, "g", 6)),
            "g must be an array of strings."
        );
        assert_eq!(
            optional_positive_integer(&sent, "missing", None).expect("absent is fine"),
            None
        );
    }

    #[test]
    fn a_value_outside_the_allowed_ones_is_named_with_the_nearest() {
        let sent = arguments(r#"{"kind":"capabilty","size":7}"#);
        let error = optional_one_of(&sent, "kind", &["capability", "domain"]).expect_err("refused");
        assert_eq!(
            error.message(),
            "kind must be one of: capability, domain. Received: \"capabilty\". Did you mean \"capability\"?"
        );
        assert_eq!(
            refusal(optional_one_of(&sent, "size", &["a"])),
            "size must be one of: a. Received: number."
        );
    }
}
