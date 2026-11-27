//! `Number(text)` as ECMAScript's StringToNumber reads it, so `version: 0x10`, `size: 1e3` and
//! `x: Infinity` are the numbers both the app's parser and the JavaScript server read, and
//! `1_000` and `5px` stay text.

use answer_format::whitespace::trim;

/// The number `Number(text)` gives, or `None` where it gives `NaN`.
pub fn to_number(text: &str) -> Option<f64> {
    let text = trim(text);
    if text.is_empty() {
        return Some(0.0);
    }
    if let Some(radix_digits) = radix_literal(text) {
        return radix_digits;
    }
    let (sign, unsigned) = match text.as_bytes().first() {
        Some(b'+') => (1.0, text.get(1..)?),
        Some(b'-') => (-1.0, text.get(1..)?),
        _ => (1.0, text),
    };
    if unsigned == "Infinity" {
        return Some(sign * f64::INFINITY);
    }
    if !is_decimal_literal(unsigned) {
        return None;
    }
    unsigned.parse::<f64>().ok().map(|value| sign * value)
}

/// `0x`, `0o` and `0b` integers, which take no sign. `None` when the text is not one;
/// `Some(None)` when it opens like one and holds a digit it cannot.
fn radix_literal(text: &str) -> Option<Option<f64>> {
    let mut characters = text.chars();
    if characters.next() != Some('0') {
        return None;
    }
    let radix = match characters.next()? {
        'x' | 'X' => 16,
        'o' | 'O' => 8,
        'b' | 'B' => 2,
        _ => return None,
    };
    let digits = text.get(2..)?;
    if digits.is_empty() {
        return Some(None);
    }
    let mut value = 0.0_f64;
    for digit in digits.chars() {
        match digit.to_digit(radix) {
            Some(place) => value = value * f64::from(radix) + f64::from(place),
            None => return Some(None),
        }
    }
    Some(Some(value))
}

/// `digits [. digits?] | . digits`, then an optional exponent: ECMAScript's StrUnsignedDecimalLiteral.
fn is_decimal_literal(text: &str) -> bool {
    let bytes = text.as_bytes();
    let mut index = 0;
    let integer_digits = count_digits(bytes, index);
    index += integer_digits;
    let mut fraction_digits = 0;
    if bytes.get(index) == Some(&b'.') {
        index += 1;
        fraction_digits = count_digits(bytes, index);
        index += fraction_digits;
    }
    if integer_digits + fraction_digits == 0 {
        return false;
    }
    if matches!(bytes.get(index), Some(b'e' | b'E')) {
        index += 1;
        if matches!(bytes.get(index), Some(b'+' | b'-')) {
            index += 1;
        }
        let exponent_digits = count_digits(bytes, index);
        if exponent_digits == 0 {
            return false;
        }
        index += exponent_digits;
    }
    index == bytes.len()
}

fn count_digits(bytes: &[u8], from: usize) -> usize {
    bytes
        .iter()
        .skip(from)
        .take_while(|byte| byte.is_ascii_digit())
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_numbers_javascript_reads_are_numbers() {
        for (text, expected) in [
            ("42", 42.0),
            ("-3.5", -3.5),
            (".5", 0.5),
            ("5.", 5.0),
            ("1e3", 1000.0),
            ("0x1F", 31.0),
            ("0b101", 5.0),
            ("0o17", 15.0),
            ("007", 7.0),
            ("+7", 7.0),
            (" 12 ", 12.0),
            ("", 0.0),
        ] {
            assert_eq!(to_number(text), Some(expected), "{text:?}");
        }
        assert_eq!(to_number("-Infinity"), Some(f64::NEG_INFINITY));
    }

    #[test]
    fn what_javascript_reads_as_nan_is_not_a_number() {
        for text in [
            "1_000", "5px", "inf", "nan", "infinity", "NaN", "0x", "-0x10", "1e", "e5", ".", "+",
            "-", "0x1G", "1 2", "--1", "1.2.3",
        ] {
            assert_eq!(to_number(text), None, "{text:?}");
        }
    }
}
