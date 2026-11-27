//! Writing a value the way `JSON.stringify` does.

use super::value::{Object, Value};

/// `JSON.stringify(value)`.
pub fn to_json(value: &Value) -> String {
    let mut out = String::new();
    write_json(value, &mut out);
    out
}

pub fn write_json(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(true) => out.push_str("true"),
        Value::Bool(false) => out.push_str("false"),
        Value::Number(number) => write_number(*number, out),
        Value::String(text) => write_string(text, out),
        Value::Array(items) => {
            out.push('[');
            for (position, item) in items.iter().enumerate() {
                if position > 0 {
                    out.push(',');
                }
                write_json(item, out);
            }
            out.push(']');
        }
        Value::Object(object) => {
            out.push('{');
            for (position, (key, item)) in object.iter().enumerate() {
                if position > 0 {
                    out.push(',');
                }
                write_string(key, out);
                out.push(':');
                write_json(item, out);
            }
            out.push('}');
        }
    }
}

/// `JSON.stringify(value, null, indent)`.
pub fn to_json_pretty(value: &Value, indent: usize) -> String {
    let mut out = String::new();
    write_pretty(value, indent, 0, &mut out);
    out
}

fn push_indent(out: &mut String, width: usize, depth: usize) {
    out.push('\n');
    out.extend(std::iter::repeat_n(' ', width * depth));
}

fn write_pretty(value: &Value, width: usize, depth: usize, out: &mut String) {
    match value {
        Value::Array(items) if !items.is_empty() => {
            out.push('[');
            for (position, item) in items.iter().enumerate() {
                if position > 0 {
                    out.push(',');
                }
                push_indent(out, width, depth + 1);
                write_pretty(item, width, depth + 1, out);
            }
            push_indent(out, width, depth);
            out.push(']');
        }
        Value::Object(object) if !object.is_empty() => {
            write_pretty_object(object, width, depth, out)
        }
        other => write_json(other, out),
    }
}

fn write_pretty_object(object: &Object, width: usize, depth: usize, out: &mut String) {
    out.push('{');
    for (position, (key, item)) in object.iter().enumerate() {
        if position > 0 {
            out.push(',');
        }
        push_indent(out, width, depth + 1);
        write_string(key, out);
        out.push_str(": ");
        write_pretty(item, width, depth + 1, out);
    }
    push_indent(out, width, depth);
    out.push('}');
}

/// A number as `Number.prototype.toString` writes it; a number JSON cannot hold is `null`.
fn write_number(number: f64, out: &mut String) {
    if number.is_finite() {
        out.push_str(ryu_js::Buffer::new().format_finite(number));
    } else {
        out.push_str("null");
    }
}

/// A string as `JSON.stringify` writes it: the quote, the backslash and the control characters are
/// escaped, everything else (U+2028 and U+2029 included) is written as it is.
pub fn write_string(text: &str, out: &mut String) {
    out.push('"');
    let mut plain_from = 0;
    for (position, character) in text.char_indices() {
        let escape: Option<&str> = match character {
            '"' => Some("\\\""),
            '\\' => Some("\\\\"),
            '\u{8}' => Some("\\b"),
            '\u{c}' => Some("\\f"),
            '\n' => Some("\\n"),
            '\r' => Some("\\r"),
            '\t' => Some("\\t"),
            _ => None,
        };
        let control = character < '\u{20}' && escape.is_none();
        if escape.is_none() && !control {
            continue;
        }
        out.push_str(text.get(plain_from..position).unwrap_or_default());
        match escape {
            Some(sequence) => out.push_str(sequence),
            None => {
                out.push_str("\\u00");
                out.push(char::from_digit(u32::from(character) >> 4, 16).unwrap_or('0'));
                out.push(char::from_digit(u32::from(character) & 0xf, 16).unwrap_or('0'));
            }
        }
        plain_from = position + character.len_utf8();
    }
    out.push_str(text.get(plain_from..).unwrap_or_default());
    out.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn number(value: f64) -> String {
        to_json(&Value::Number(value))
    }

    #[test]
    fn numbers_are_written_with_the_digits_javascript_gives() {
        assert_eq!(number(0.0), "0");
        assert_eq!(number(-0.0), "0");
        assert_eq!(number(1.0), "1");
        assert_eq!(number(-12.5), "-12.5");
        assert_eq!(number(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(number(1e21), "1e+21");
        assert_eq!(number(1e-7), "1e-7");
        assert_eq!(
            number(123_456_789_012_345_680_000.0),
            "123456789012345680000"
        );
        assert_eq!(number(5e-324), "5e-324");
        assert_eq!(number(9_007_199_254_740_993.0), "9007199254740992");
        assert_eq!(number(f64::NAN), "null");
        assert_eq!(number(f64::INFINITY), "null");
        assert_eq!(number(f64::NEG_INFINITY), "null");
    }

    #[test]
    fn strings_escape_what_json_stringify_escapes_and_nothing_more() {
        let text = "a\"b\\c\u{8}\u{c}\n\r\t\u{1}\u{1f}\u{7f}\u{2028}\u{2029}é😀";
        assert_eq!(
            to_json(&Value::string(text)),
            "\"a\\\"b\\\\c\\b\\f\\n\\r\\t\\u0001\\u001f\u{7f}\u{2028}\u{2029}é😀\""
        );
    }

    #[test]
    fn objects_write_in_javascript_key_order() {
        let value = Value::object([
            ("b", Value::Null),
            ("2", Value::Bool(true)),
            ("a", Value::Number(1.0)),
            ("1", Value::Null),
        ]);
        assert_eq!(to_json(&value), r#"{"1":null,"2":true,"b":null,"a":1}"#);
    }

    #[test]
    fn pretty_output_matches_json_stringify_with_two_spaces() {
        let value = Value::Array(vec![Value::object([
            ("expected", Value::string("string")),
            (
                "path",
                Value::array([Value::string("params"), Value::string("name")]),
            ),
            ("empty", Value::Array(Vec::new())),
            ("none", Value::object::<&str>([])),
        ])]);
        let expected = "[\n  {\n    \"expected\": \"string\",\n    \"path\": [\n      \"params\",\n      \"name\"\n    ],\n    \"empty\": [],\n    \"none\": {}\n  }\n]";
        assert_eq!(to_json_pretty(&value, 2), expected);
    }

    #[test]
    fn a_value_survives_a_round_trip_byte_for_byte() {
        let text = r#"{"a":[1,2.5,-0.25,1e+21,"x\ny"],"3":{"z":null,"y":true},"b":false}"#;
        let value = parse(text).expect("parses");
        assert_eq!(
            to_json(&value),
            r#"{"3":{"z":null,"y":true},"a":[1,2.5,-0.25,1e+21,"x\ny"],"b":false}"#
        );
    }
}
