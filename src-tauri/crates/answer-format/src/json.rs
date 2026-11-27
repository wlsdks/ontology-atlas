//! `JSON.stringify` for typed answers.
//!
//! `serde_json` already escapes strings, orders a struct's fields as declared and indents as
//! `JSON.stringify(value, null, 2)` does; what differs is the text of a fractional or very large
//! number (`1e+21`, not `1e21`), which these writers take from [`crate::number`]. Fields come out
//! in declaration order, so a typed answer's field order is its key order.

use std::io;

use serde::Serialize;
use serde_json::ser::{CompactFormatter, Formatter, PrettyFormatter};
use serde_json::value::RawValue;
use serde_json::Serializer;

/// JSON text kept as written, for an answer that embeds a part another crate wrote. The crates
/// that only carry such a part name it here and need no JSON library of their own.
pub use serde_json::value::RawValue as RawJson;

/// Any `serde_json` formatter, with a number written as JavaScript writes it. Every other part of
/// the layout is the inner formatter's.
struct JsNumbers<F>(F);

macro_rules! delegate {
    ($($method:ident($($argument:ident: $kind:ty),*);)*) => {$(
        fn $method<W>(&mut self, writer: &mut W $(, $argument: $kind)*) -> io::Result<()>
        where
            W: ?Sized + io::Write,
        {
            self.0.$method(writer $(, $argument)*)
        }
    )*};
}

impl<F: Formatter> Formatter for JsNumbers<F> {
    fn write_f64<W>(&mut self, writer: &mut W, value: f64) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        writer.write_all(crate::number::text(value).as_bytes())
    }

    fn write_f32<W>(&mut self, writer: &mut W, value: f32) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.write_f64(writer, f64::from(value))
    }

    delegate! {
        begin_array();
        end_array();
        begin_array_value(first: bool);
        end_array_value();
        begin_object();
        end_object();
        begin_object_key(first: bool);
        begin_object_value();
        end_object_value();
    }
}

fn into_text(bytes: Vec<u8>) -> String {
    // `serde_json` writes UTF-8 only: strings are `str`, everything else is ASCII.
    String::from_utf8(bytes).unwrap_or_default()
}

/// `JSON.stringify(value)`.
pub fn to_string<T: Serialize + ?Sized>(value: &T) -> Result<String, serde_json::Error> {
    let mut bytes = Vec::new();
    to_writer(&mut bytes, value)?;
    Ok(into_text(bytes))
}

/// `JSON.stringify(value)`, written straight to `writer` without holding the text.
pub fn to_writer<W: io::Write, T: Serialize + ?Sized>(
    writer: W,
    value: &T,
) -> Result<(), serde_json::Error> {
    value.serialize(&mut Serializer::with_formatter(
        writer,
        JsNumbers(CompactFormatter),
    ))
}

/// `JSON.stringify(value, null, indent)` with an indent of `indent` spaces.
pub fn to_string_indented<T: Serialize + ?Sized>(
    value: &T,
    indent: usize,
) -> Result<String, serde_json::Error> {
    let unit = " ".repeat(indent);
    let formatter = JsNumbers(PrettyFormatter::with_indent(unit.as_bytes()));
    let mut bytes = Vec::new();
    value.serialize(&mut Serializer::with_formatter(&mut bytes, formatter))?;
    Ok(into_text(bytes))
}

/// The value as JSON kept as written, for an answer that embeds it unchanged.
pub fn to_raw<T: Serialize + ?Sized>(value: &T) -> Result<Box<RawValue>, serde_json::Error> {
    let mut text = to_string(value)?;
    // At exactly its length the text becomes the raw value without being copied.
    text.shrink_to_fit();
    RawValue::from_string(text)
}

/// A string as `JSON.stringify` writes it, quotes included.
pub fn quote(text: &str) -> String {
    to_string(text).unwrap_or_else(|_| "\"\"".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Serialize)]
    struct Answer<'a> {
        total: f64,
        name: &'a str,
        items: Vec<u8>,
        none: Option<u8>,
    }

    #[test]
    fn a_typed_answer_is_written_in_field_order_with_javascript_numbers() {
        let answer = Answer {
            total: 1e21,
            name: "a\"b\u{2028}\u{7f}\n",
            items: vec![1, 2],
            none: None,
        };
        assert_eq!(
            to_string(&answer).expect("writes"),
            "{\"total\":1e+21,\"name\":\"a\\\"b\u{2028}\u{7f}\\n\",\"items\":[1,2],\"none\":null}"
        );
    }

    #[test]
    fn strings_escape_what_json_stringify_escapes_and_nothing_more() {
        let text = "a\"b\\c\u{8}\u{c}\n\r\t\u{1}\u{1f}\u{7f}\u{2028}\u{2029}é😀";
        assert_eq!(
            to_string(text).expect("writes"),
            "\"a\\\"b\\\\c\\b\\f\\n\\r\\t\\u0001\\u001f\u{7f}\u{2028}\u{2029}é😀\""
        );
    }

    #[test]
    fn numbers_in_every_position_use_javascript_text() {
        let values: Vec<f64> = vec![0.0, -0.0, -12.5, 0.1 + 0.2, 1e-7, f64::NAN, f64::INFINITY];
        assert_eq!(
            to_string(&values).expect("writes"),
            "[0,0,-12.5,0.30000000000000004,1e-7,null,null]"
        );
        assert_eq!(
            to_string_indented(&[1e21], 2).expect("writes"),
            "[\n  1e+21\n]"
        );
        assert_eq!(
            to_string(&[9_007_199_254_740_993_f64]).expect("writes"),
            "[9007199254740992]"
        );
    }

    #[test]
    fn the_indented_form_matches_json_stringify_with_two_spaces() {
        let value = serde_json::json!([{"a": [], "b": {}, "c": [1, 2.5]}]);
        assert_eq!(
            to_string_indented(&value, 2).expect("writes"),
            "[\n  {\n    \"a\": [],\n    \"b\": {},\n    \"c\": [\n      1,\n      2.5\n    ]\n  }\n]"
        );
    }

    #[test]
    fn raw_json_is_embedded_as_it_is() {
        #[derive(Serialize)]
        struct Holder {
            held: Box<RawValue>,
        }
        let held = to_raw(&[1, 2]).expect("writes");
        assert_eq!(
            to_string(&Holder { held }).expect("writes"),
            r#"{"held":[1,2]}"#
        );
        assert_eq!(quote("a\"b"), r#""a\"b""#);
    }
}
