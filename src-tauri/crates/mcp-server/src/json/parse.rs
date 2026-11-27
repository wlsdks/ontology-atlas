//! Reading JSON the way `JSON.parse` does.

use super::value::{Object, Value};

/// A line nested deeper than this is refused instead of parsed, and a refused line gets no answer.
/// Declared difference: the JavaScript server answers a request nested far deeper (it was probed to
/// a million levels). No request an agent sends nests this deep, and a bound keeps the recursion,
/// and the drop of the value built, inside the thread's stack.
pub const MAX_DEPTH: usize = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParseError;

impl std::fmt::Display for ParseError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("not valid JSON")
    }
}

impl std::error::Error for ParseError {}

/// Parses one JSON text. The grammar is JSON's: no comments, no trailing commas, no `NaN`, a
/// leading byte-order mark is an error, and only space, tab, line feed and carriage return are
/// whitespace. A lone surrogate escape (`\ud800`) becomes U+FFFD, since a Rust string cannot hold
/// one.
pub fn parse(text: &str) -> Result<Value, ParseError> {
    parse_with(text, false)
}

/// The character that opens an escape in a string read by [`parse_keeping_surrogates`].
pub const SURROGATE_ESCAPE: char = '\u{f8ff}';

/// [`parse`] for the one place that must tell lone surrogates apart: a request id is written back
/// as it came, and two ids that differ only in a lone surrogate are two requests. Every string comes
/// back in a reversible form: a lone surrogate `\udXXX` is [`SURROGATE_ESCAPE`] followed by
/// U+E000 + (XXX - 0xD800), and a genuine [`SURROGATE_ESCAPE`] is doubled. Only ids are read from
/// such a parse; the rest of a message is read with [`parse`].
pub fn parse_keeping_surrogates(text: &str) -> Result<Value, ParseError> {
    parse_with(text, true)
}

fn parse_with(text: &str, keep_surrogates: bool) -> Result<Value, ParseError> {
    let mut parser = Parser {
        bytes: text.as_bytes(),
        text,
        position: 0,
        keep_surrogates,
    };
    parser.skip_whitespace();
    let value = parser.value(0)?;
    parser.skip_whitespace();
    if parser.position == parser.bytes.len() {
        Ok(value)
    } else {
        Err(ParseError)
    }
}

struct Parser<'a> {
    bytes: &'a [u8],
    text: &'a str,
    position: usize,
    keep_surrogates: bool,
}

impl Parser<'_> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.position).copied()
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.position += 1;
        }
    }

    fn expect(&mut self, byte: u8) -> Result<(), ParseError> {
        if self.peek() == Some(byte) {
            self.position += 1;
            Ok(())
        } else {
            Err(ParseError)
        }
    }

    fn literal(&mut self, word: &str, value: Value) -> Result<Value, ParseError> {
        let end = self.position + word.len();
        if self.bytes.get(self.position..end) == Some(word.as_bytes()) {
            self.position = end;
            Ok(value)
        } else {
            Err(ParseError)
        }
    }

    fn value(&mut self, depth: usize) -> Result<Value, ParseError> {
        if depth > MAX_DEPTH {
            return Err(ParseError);
        }
        match self.peek().ok_or(ParseError)? {
            b'{' => self.object(depth),
            b'[' => self.array(depth),
            b'"' => self.string().map(Value::String),
            b't' => self.literal("true", Value::Bool(true)),
            b'f' => self.literal("false", Value::Bool(false)),
            b'n' => self.literal("null", Value::Null),
            b'-' | b'0'..=b'9' => self.number(),
            _ => Err(ParseError),
        }
    }

    fn array(&mut self, depth: usize) -> Result<Value, ParseError> {
        self.expect(b'[')?;
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.peek() == Some(b']') {
            self.position += 1;
            return Ok(Value::Array(items));
        }
        loop {
            self.skip_whitespace();
            items.push(self.value(depth + 1)?);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.position += 1,
                Some(b']') => {
                    self.position += 1;
                    return Ok(Value::Array(items));
                }
                _ => return Err(ParseError),
            }
        }
    }

    fn object(&mut self, depth: usize) -> Result<Value, ParseError> {
        self.expect(b'{')?;
        let mut object = Object::new();
        self.skip_whitespace();
        if self.peek() == Some(b'}') {
            self.position += 1;
            return Ok(Value::Object(object));
        }
        loop {
            self.skip_whitespace();
            let key = self.string()?;
            self.skip_whitespace();
            self.expect(b':')?;
            self.skip_whitespace();
            let value = self.value(depth + 1)?;
            object.insert(key, value);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.position += 1,
                Some(b'}') => {
                    self.position += 1;
                    return Ok(Value::Object(object));
                }
                _ => return Err(ParseError),
            }
        }
    }

    fn number(&mut self) -> Result<Value, ParseError> {
        let start = self.position;
        if self.peek() == Some(b'-') {
            self.position += 1;
        }
        match self.peek() {
            Some(b'0') => self.position += 1,
            Some(b'1'..=b'9') => self.digits(),
            _ => return Err(ParseError),
        }
        if self.peek() == Some(b'.') {
            self.position += 1;
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(ParseError);
            }
            self.digits();
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.position += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.position += 1;
            }
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(ParseError);
            }
            self.digits();
        }
        let literal = self.text.get(start..self.position).ok_or(ParseError)?;
        literal
            .parse::<f64>()
            .map(Value::Number)
            .map_err(|_| ParseError)
    }

    fn digits(&mut self) {
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.position += 1;
        }
    }

    fn hex4(&mut self) -> Result<u32, ParseError> {
        let digits = self
            .bytes
            .get(self.position..self.position + 4)
            .ok_or(ParseError)?;
        let mut number = 0u32;
        for digit in digits {
            let part = char::from(*digit).to_digit(16).ok_or(ParseError)?;
            number = number * 16 + part;
        }
        self.position += 4;
        Ok(number)
    }

    fn string(&mut self) -> Result<String, ParseError> {
        self.expect(b'"')?;
        let mut out = String::new();
        let mut plain_from = self.position;
        loop {
            let byte = self.peek().ok_or(ParseError)?;
            match byte {
                b'"' => {
                    self.push_plain(&mut out, plain_from)?;
                    self.position += 1;
                    return Ok(out);
                }
                0..=0x1f => return Err(ParseError),
                b'\\' => {
                    self.push_plain(&mut out, plain_from)?;
                    self.position += 1;
                    self.escape(&mut out)?;
                    plain_from = self.position;
                }
                _ => self.position += 1,
            }
        }
    }

    /// Appends the unescaped run that starts at `from` and ends here.
    fn push_plain(&self, out: &mut String, from: usize) -> Result<(), ParseError> {
        let run = self.text.get(from..self.position).ok_or(ParseError)?;
        if self.keep_surrogates && run.contains(SURROGATE_ESCAPE) {
            for character in run.chars() {
                self.push_character(out, character);
            }
        } else {
            out.push_str(run);
        }
        Ok(())
    }

    fn push_character(&self, out: &mut String, character: char) {
        out.push(character);
        if self.keep_surrogates && character == SURROGATE_ESCAPE {
            out.push(character);
        }
    }

    /// A surrogate escape with no partner: U+FFFD, or its reversible form when asked to keep it.
    fn push_lone_surrogate(&self, out: &mut String, code: u32) {
        if self.keep_surrogates {
            out.push(SURROGATE_ESCAPE);
            out.push(char::from_u32(0xe000 + (code - 0xd800)).unwrap_or('\u{fffd}'));
        } else {
            out.push('\u{fffd}');
        }
    }

    fn escape(&mut self, out: &mut String) -> Result<(), ParseError> {
        let kind = self.peek().ok_or(ParseError)?;
        self.position += 1;
        match kind {
            b'"' => out.push('"'),
            b'\\' => out.push('\\'),
            b'/' => out.push('/'),
            b'b' => out.push('\u{8}'),
            b'f' => out.push('\u{c}'),
            b'n' => out.push('\n'),
            b'r' => out.push('\r'),
            b't' => out.push('\t'),
            b'u' => {
                let first = self.hex4()?;
                let paired = match first {
                    0xd800..=0xdbff => self.low_surrogate(first),
                    0xdc00..=0xdfff => None,
                    other => Some(char::from_u32(other).unwrap_or('\u{fffd}')),
                };
                match paired {
                    Some(character) => self.push_character(out, character),
                    None => self.push_lone_surrogate(out, first),
                }
            }
            _ => return Err(ParseError),
        }
        Ok(())
    }

    /// The character a high surrogate escape and the low surrogate escape after it make; `None`
    /// when no low surrogate follows.
    fn low_surrogate(&mut self, high: u32) -> Option<char> {
        let follows = self.bytes.get(self.position..self.position + 2) == Some(b"\\u");
        if follows {
            let resume = self.position;
            self.position += 2;
            if let Ok(low @ 0xdc00..=0xdfff) = self.hex4() {
                let code = 0x10000 + ((high - 0xd800) << 10) + (low - 0xdc00);
                return Some(char::from_u32(code).unwrap_or('\u{fffd}'));
            }
            self.position = resume;
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::to_json;

    fn round(text: &str) -> String {
        to_json(&parse(text).expect("parses"))
    }

    #[test]
    fn the_json_grammar_is_enforced_as_javascript_enforces_it() {
        for bad in [
            "",
            "   ",
            "{",
            "[1,]",
            "{\"a\":1,}",
            "01",
            "-",
            "1.",
            ".5",
            "1e",
            "+1",
            "NaN",
            "Infinity",
            "'a'",
            "{a:1}",
            "\"\u{1}\"",
            "\"a\nb\"",
            "tru",
            "nul",
            "[1 2]",
            "{\"a\" 1}",
            "\u{feff}{}",
            "{}{}",
            "{} x",
            "\"\\x\"",
            "\"\\u12\"",
            "\"\\ud800",
            "// c\n1",
        ] {
            assert!(parse(bad).is_err(), "{bad:?} must not parse");
        }
        for good in [
            " {} ",
            "\t[1]\r\n",
            "-0",
            "0.5e-3",
            "1E+2",
            "\"\\u00e9\\/\"",
            "[[],{}]",
        ] {
            assert!(parse(good).is_ok(), "{good:?} must parse");
        }
    }

    #[test]
    fn numbers_read_as_doubles() {
        assert_eq!(parse("1e2").expect("parses"), Value::Number(100.0));
        assert_eq!(
            parse("9007199254740993").expect("parses"),
            Value::Number(9_007_199_254_740_992.0)
        );
        assert_eq!(
            parse("1e999").expect("parses"),
            Value::Number(f64::INFINITY)
        );
        assert_eq!(
            round("[0.1,1e-7,-0,123456789012345678901234567890]"),
            "[0.1,1e-7,0,1.2345678901234568e+29]"
        );
    }

    #[test]
    fn a_surrogate_pair_is_one_character_and_a_lone_one_is_replaced() {
        assert_eq!(
            parse("\"\\ud83d\\ude00\"").expect("parses"),
            Value::string("😀")
        );
        assert_eq!(
            parse("\"\\ud83dx\"").expect("parses"),
            Value::string("\u{fffd}x")
        );
        assert_eq!(
            parse("\"\\ude00\"").expect("parses"),
            Value::string("\u{fffd}")
        );
        assert_eq!(
            parse("\"\\ud83d\\u0041\"").expect("parses"),
            Value::string("\u{fffd}A")
        );
    }

    #[test]
    fn duplicate_keys_keep_the_first_place_and_the_last_value() {
        assert_eq!(round(r#"{"a":1,"b":2,"a":3}"#), r#"{"a":3,"b":2}"#);
    }

    #[test]
    fn integer_like_keys_are_listed_first() {
        assert_eq!(round(r#"{"b":1,"2":2,"1":3}"#), r#"{"1":3,"2":2,"b":1}"#);
    }

    #[test]
    fn nesting_up_to_the_bound_parses_and_beyond_it_is_refused() {
        let ok = format!("{}{}", "[".repeat(5000), "]".repeat(5000));
        let too_deep = format!("{}{}", "[".repeat(MAX_DEPTH + 2), "]".repeat(MAX_DEPTH + 2));
        // Deep enough to need a large stack, so run it where the server runs its parser.
        let handle = std::thread::Builder::new()
            .stack_size(256 * 1024 * 1024)
            .spawn(move || (parse(&ok).is_ok(), parse(&too_deep).is_err()))
            .expect("spawn");
        assert_eq!(handle.join().expect("joins"), (true, true));
    }
}
