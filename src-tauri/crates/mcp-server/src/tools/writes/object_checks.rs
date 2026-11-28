//! The checks a write makes on a row or an object an agent nested in its arguments, with the
//! sentences the JavaScript server gave: a saved prompt that repairs a call from them keeps
//! working. `None` is a field that was not sent; `Setting::Null` is one sent as `null`.

use answer_format::whitespace::trim;
use vault_edit::Setting;

use crate::error::{ToolError, UnknownField};
use crate::suggestions::closest_allowed_value;

pub fn non_blank<'a>(value: Option<&'a Setting>, name: &str) -> Result<&'a str, ToolError> {
    let Some(text) = value
        .and_then(Setting::as_text)
        .filter(|text| !trim(text).is_empty())
    else {
        return Err(ToolError::invalid(format!(
            "{name} must be a non-empty string."
        )));
    };
    if text != trim(text) {
        return Err(ToolError::invalid(format!(
            "{name} must not have leading or trailing whitespace."
        )));
    }
    if text.contains('\0') {
        return Err(ToolError::invalid(format!(
            "{name} must not contain a null byte."
        )));
    }
    Ok(text)
}

pub fn optional_non_blank<'a>(
    value: Option<&'a Setting>,
    name: &str,
) -> Result<Option<&'a str>, ToolError> {
    value.map(|value| non_blank(Some(value), name)).transpose()
}

/// A list of at most `max` texts, each non-blank, unpadded and free of a null byte.
pub fn optional_text_list(
    value: Option<&Setting>,
    name: &str,
    max: usize,
) -> Result<Option<Vec<String>>, ToolError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let Setting::List(items) = value else {
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
        let Some(text) = item.as_text() else {
            return Err(ToolError::invalid(format!(
                "{name} must be an array of strings."
            )));
        };
        if trim(text).is_empty() {
            return Err(ToolError::invalid(format!(
                "{name} items must be non-empty strings."
            )));
        }
        if text != trim(text) {
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

pub fn plain_object<'a>(
    value: &'a Setting,
    name: &str,
) -> Result<&'a [(String, Setting)], ToolError> {
    match value {
        Setting::Map(members) => Ok(members),
        _ => Err(ToolError::invalid(format!("{name} must be an object."))),
    }
}

pub fn allowed_keys(
    members: &[(String, Setting)],
    name: &str,
    allowed: &[&str],
) -> Result<(), ToolError> {
    let unknown: Vec<UnknownField> = members
        .iter()
        .filter(|(key, _)| !allowed.contains(&key.as_str()))
        .map(|(key, _)| UnknownField {
            name: key.clone(),
            suggestion: nearest_field(key, allowed),
        })
        .collect();
    if unknown.is_empty() {
        return Ok(());
    }
    let mut received: Vec<String> = members.iter().map(|(key, _)| key.clone()).collect();
    received.sort_by(|left, right| utf16_order(left, right));
    Err(ToolError::unknown_fields(name, unknown, allowed, received))
}

fn utf16_order(left: &str, right: &str) -> std::cmp::Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

fn nearest_field(key: &str, allowed: &[&str]) -> Option<String> {
    if key == "relation" && allowed.contains(&"type") {
        return Some("type".to_string());
    }
    closest_allowed_value(key, allowed)
}

/// A value from `allowed`, or the refusal that names what was received.
pub fn one_of<'a>(
    value: Option<&Setting>,
    name: &str,
    allowed: &[&'a str],
) -> Result<&'a str, ToolError> {
    use crate::error::ReceivedValue;
    let received = match value {
        Some(Setting::Text(text)) => {
            if let Some(found) = allowed.iter().copied().find(|candidate| candidate == text) {
                return Ok(found);
            }
            ReceivedValue::Text(text)
        }
        Some(other) => ReceivedValue::Other(other.kind_name()),
        None => ReceivedValue::Other("undefined"),
    };
    Err(ToolError::not_an_allowed_value(name, received, allowed))
}
