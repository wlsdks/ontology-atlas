//! `JSON.stringify` for typed answers.
//!
//! `serde_json` already escapes strings, orders a struct's fields as declared and indents as
//! `JSON.stringify(value, null, 2)` does; what differs is the text of a fractional or very large
//! number (`1e+21`, not `1e21`), which these writers take from [`crate::number`]. Fields come out
//! in declaration order, so a typed answer's field order is its key order; a map whose order
//! matters is an [`crate::OrderedMap`].

use std::io;

use serde::Serialize;
use serde_json::ser::{Formatter, PrettyFormatter};
use serde_json::value::RawValue;
use serde_json::Serializer;

/// `serde_json`'s compact writer with JavaScript's number text.
struct CompactFormatter;

impl Formatter for CompactFormatter {
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
}

/// The indenting writer with JavaScript's number text.
struct IndentedFormatter<'a>(PrettyFormatter<'a>);

impl Formatter for IndentedFormatter<'_> {
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

    fn begin_array<W>(&mut self, writer: &mut W) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.0.begin_array(writer)
    }

    fn end_array<W>(&mut self, writer: &mut W) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.0.end_array(writer)
    }

    fn begin_array_value<W>(&mut self, writer: &mut W, first: bool) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.0.begin_array_value(writer, first)
    }

    fn end_array_value<W>(&mut self, writer: &mut W) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.0.end_array_value(writer)
    }

    fn begin_object<W>(&mut self, writer: &mut W) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.0.begin_object(writer)
    }

    fn end_object<W>(&mut self, writer: &mut W) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.0.end_object(writer)
    }

    fn begin_object_key<W>(&mut self, writer: &mut W, first: bool) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.0.begin_object_key(writer, first)
    }

    fn begin_object_value<W>(&mut self, writer: &mut W) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.0.begin_object_value(writer)
    }

    fn end_object_value<W>(&mut self, writer: &mut W) -> io::Result<()>
    where
        W: ?Sized + io::Write,
    {
        self.0.end_object_value(writer)
    }
}

fn into_text(bytes: Vec<u8>) -> String {
    // `serde_json` writes UTF-8 only: strings are `str`, everything else is ASCII.
    String::from_utf8(bytes).unwrap_or_default()
}

/// `JSON.stringify(value)`.
pub fn to_string<T: Serialize + ?Sized>(value: &T) -> Result<String, serde_json::Error> {
    let mut bytes = Vec::new();
    value.serialize(&mut Serializer::with_formatter(
        &mut bytes,
        CompactFormatter,
    ))?;
    Ok(into_text(bytes))
}

/// `JSON.stringify(value, null, indent)` with an indent of `indent` spaces.
pub fn to_string_indented<T: Serialize + ?Sized>(
    value: &T,
    indent: usize,
) -> Result<String, serde_json::Error> {
    let unit = " ".repeat(indent);
    let formatter = IndentedFormatter(PrettyFormatter::with_indent(unit.as_bytes()));
    let mut bytes = Vec::new();
    value.serialize(&mut Serializer::with_formatter(&mut bytes, formatter))?;
    Ok(into_text(bytes))
}

/// The value as JSON kept as written, for an answer that embeds it unchanged.
pub fn to_raw<T: Serialize + ?Sized>(value: &T) -> Result<Box<RawValue>, serde_json::Error> {
    RawValue::from_string(to_string(value)?)
}

/// A string as `JSON.stringify` writes it, quotes included.
pub fn quote(text: &str) -> String {
    to_string(text).unwrap_or_else(|_| "\"\"".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::OrderedMap;

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
    fn an_ordered_map_lists_integer_keys_first() {
        let mut map = OrderedMap::new();
        map.insert("b".to_string(), 1);
        map.insert("2".to_string(), 2);
        map.insert("a".to_string(), 3);
        map.insert("1".to_string(), 4);
        assert_eq!(
            to_string(&map).expect("writes"),
            r#"{"1":4,"2":2,"b":1,"a":3}"#
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
