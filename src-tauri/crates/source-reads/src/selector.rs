//! What `sourceReads` asks for, checked before any file is opened: at most sixteen selectors,
//! each an outline, a symbol or a line range of one path, with the refusal sentences of the
//! script server so an agent's repair stays the same.

use serde_json::{Map, Value};

pub const MAX_SELECTORS: usize = 16;
pub const MAX_PATH_CHARACTERS: usize = 1024;
/// Lines one read may ask for.
pub const MAX_LINES: usize = 200;
const MAX_SYMBOL_CHARACTERS: usize = 200;
const SAFE_INTEGER_LIMIT: f64 = 9_007_199_254_740_991.0;

/// What a selector reads of its file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadTarget {
    /// The file's declarations with their line numbers, no source text.
    Outline,
    /// One declared name (`issueInvoice`, `Invoice.total`): its lines, up to `max_lines`.
    Symbol {
        symbol: String,
        max_lines: Option<usize>,
    },
    Lines {
        start_line: usize,
        max_lines: usize,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceReadSelector {
    pub path: String,
    pub target: ReadTarget,
    pub expected_sha256: Option<String>,
}

/// A selector the call may not carry. `names_a_wrong_value` is true where the sentence says
/// what the value must be, which is how a caller tells a wrong argument from a wrong request.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{message}")]
pub struct SelectorRefusal {
    pub message: String,
    pub names_a_wrong_value: bool,
}

fn must_be(message: String) -> SelectorRefusal {
    SelectorRefusal {
        message,
        names_a_wrong_value: true,
    }
}

fn refused(message: String) -> SelectorRefusal {
    SelectorRefusal {
        message,
        names_a_wrong_value: false,
    }
}

/// A JSON number that is an integer JavaScript holds exactly.
fn safe_integer(value: &Value) -> Option<i64> {
    let number = value.as_f64()?;
    if number.fract() == 0.0 && number.abs() <= SAFE_INTEGER_LIMIT {
        value.as_i64().or(Some(number as i64))
    } else {
        None
    }
}

fn positive(value: &Value) -> Option<usize> {
    safe_integer(value)
        .filter(|number| *number > 0)
        .and_then(|number| usize::try_from(number).ok())
}

/// `^[A-Za-z_$#][\w$#]*(?:\.[A-Za-z_$#][\w$#]*)?$`
fn is_symbol_name(text: &str) -> bool {
    let word = |part: &str| {
        let mut characters = part.chars();
        characters
            .next()
            .is_some_and(|first| first.is_ascii_alphabetic() || matches!(first, '_' | '$' | '#'))
            && characters.all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '_' | '$' | '#')
            })
    };
    match text.split_once('.') {
        None => word(text),
        Some((owner, member)) => word(owner) && word(member),
    }
}

fn is_digest(text: &str) -> bool {
    text.len() == 64
        && text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

const ALLOWED_FIELDS: [&str; 6] = [
    "path",
    "startLine",
    "maxLines",
    "expectedSha256",
    "mode",
    "symbol",
];

fn selector_at(index: usize, object: &Map<String, Value>) -> Result<SourceReadSelector, SelectorRefusal> {
    if let Some(unknown) = object
        .keys()
        .find(|key| !ALLOWED_FIELDS.contains(&key.as_str()))
    {
        return Err(must_be(format!(
            "Unknown field \"{unknown}\" in sourceReads[{index}]."
        )));
    }
    let outline = match object.get("mode") {
        None => false,
        Some(Value::String(mode)) if mode == "outline" => true,
        Some(Value::String(mode)) if mode == "lines" => false,
        Some(_) => {
            return Err(must_be(format!(
                "sourceReads[{index}].mode must be \"lines\" or \"outline\"."
            )))
        }
    };
    let path = match object.get("path") {
        Some(Value::String(path)) if !path.is_empty() => path.clone(),
        _ => {
            return Err(must_be(format!(
                "sourceReads[{index}].path must be a non-empty string."
            )))
        }
    };
    if path.chars().count() > MAX_PATH_CHARACTERS {
        return Err(must_be(format!(
            "sourceReads[{index}].path must be at most {MAX_PATH_CHARACTERS} characters."
        )));
    }
    let start_line = object.get("startLine");
    let max_lines = object.get("maxLines");
    let target = if let Some(symbol) = object.get("symbol") {
        let name = match symbol {
            Value::String(name)
                if is_symbol_name(name) && name.chars().count() <= MAX_SYMBOL_CHARACTERS =>
            {
                name.clone()
            }
            _ => {
                return Err(must_be(format!(
                    "sourceReads[{index}].symbol must be one declared name such as \"issueInvoice\" or \"Invoice.total\"."
                )))
            }
        };
        if outline {
            return Err(refused(format!(
                "sourceReads[{index}].symbol does not apply to mode \"outline\"."
            )));
        }
        if start_line.is_some() {
            return Err(refused(format!(
                "sourceReads[{index}].startLine does not apply with symbol; the declaration decides where the read starts."
            )));
        }
        let lines = match max_lines {
            None => None,
            Some(value) => Some(positive(value).ok_or_else(|| {
                must_be(format!(
                    "sourceReads[{index}].maxLines must be a positive safe integer."
                ))
            })?),
        };
        if lines.is_some_and(|lines| lines > MAX_LINES) {
            return Err(must_be(format!(
                "sourceReads[{index}].maxLines must be <= {MAX_LINES}."
            )));
        }
        ReadTarget::Symbol {
            symbol: name,
            max_lines: lines,
        }
    } else if outline {
        for key in ["startLine", "maxLines"] {
            if object.contains_key(key) {
                return Err(refused(format!(
                    "sourceReads[{index}].{key} does not apply to mode \"outline\"."
                )));
            }
        }
        ReadTarget::Outline
    } else {
        let mut read = |key: &str, value: Option<&Value>| {
            value.and_then(positive).ok_or_else(|| {
                must_be(format!(
                    "sourceReads[{index}].{key} must be a positive safe integer."
                ))
            })
        };
        let start = read("startLine", start_line)?;
        let lines = read("maxLines", max_lines)?;
        if lines > MAX_LINES {
            return Err(must_be(format!(
                "sourceReads[{index}].maxLines must be <= {MAX_LINES}."
            )));
        }
        ReadTarget::Lines {
            start_line: start,
            max_lines: lines,
        }
    };
    let expected_sha256 = match object.get("expectedSha256") {
        None => None,
        Some(Value::String(digest)) if is_digest(digest) => Some(digest.clone()),
        Some(_) => {
            return Err(must_be(format!(
                "sourceReads[{index}].expectedSha256 must be 64 lowercase hexadecimal characters."
            )))
        }
    };
    Ok(SourceReadSelector {
        path,
        target,
        expected_sha256,
    })
}

/// The selectors of a `sourceReads` argument, or the first thing wrong with them.
pub fn parse_source_reads(value: &Value) -> Result<Vec<SourceReadSelector>, SelectorRefusal> {
    let Some(items) = value
        .as_array()
        .filter(|items| !items.is_empty() && items.len() <= MAX_SELECTORS)
    else {
        return Err(refused(format!(
            "sourceReads must contain between 1 and {MAX_SELECTORS} selectors."
        )));
    };
    items
        .iter()
        .enumerate()
        .map(|(index, item)| match item {
            Value::Object(object) => selector_at(index, object),
            _ => Err(must_be(format!("sourceReads[{index}] must be an object."))),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_call_is_refused_with_the_sentence_that_says_what_to_repair() {
        let cases = [
            (json!([]), "sourceReads must contain between 1 and 16 selectors."),
            (json!([1]), "sourceReads[0] must be an object."),
            (json!([{"path":"a.ts","x":1}]), "Unknown field \"x\" in sourceReads[0]."),
            (json!([{"path":"a.ts","mode":"outline","startLine":1}]), "sourceReads[0].startLine does not apply to mode \"outline\"."),
            (json!([{"path":"a.ts","symbol":"a b"}]), "sourceReads[0].symbol must be one declared name such as \"issueInvoice\" or \"Invoice.total\"."),
            (json!([{"path":"a.ts","symbol":"a","startLine":3}]), "sourceReads[0].startLine does not apply with symbol; the declaration decides where the read starts."),
            (json!([{"path":"a.ts","startLine":0,"maxLines":3}]), "sourceReads[0].startLine must be a positive safe integer."),
            (json!([{"path":"a.ts","startLine":1,"maxLines":201}]), "sourceReads[0].maxLines must be <= 200."),
            (json!([{"path":"a.ts","mode":"outline","expectedSha256":"AB"}]), "sourceReads[0].expectedSha256 must be 64 lowercase hexadecimal characters."),
        ];
        for (call, sentence) in cases {
            let refusal = parse_source_reads(&call).expect_err(sentence);
            assert_eq!(refusal.message, sentence);
        }
        assert_eq!(
            parse_source_reads(&json!([{"path":"a.ts","symbol":"Invoice.total","maxLines":5}])),
            Ok(vec![SourceReadSelector {
                path: "a.ts".into(),
                target: ReadTarget::Symbol { symbol: "Invoice.total".into(), max_lines: Some(5) },
                expected_sha256: None,
            }])
        );
    }
}
