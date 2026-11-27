//! Numbers written as `Number.prototype.toString` writes them.

/// The text `Number.prototype.toString` gives `number`, as `JSON.stringify` writes it: a whole
/// double has no fraction, `-0` is `0`, and `NaN` or an infinity, which JSON cannot hold, is
/// `null`.
pub fn text(number: f64) -> String {
    if number.is_finite() {
        ryu_js::Buffer::new().format_finite(number).to_string()
    } else {
        "null".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exponents_and_long_fractions_follow_javascript() {
        assert_eq!(text(1e21), "1e+21");
        assert_eq!(text(1e-7), "1e-7");
        assert_eq!(text(123_456_789_012_345_680_000.0), "123456789012345680000");
        assert_eq!(text(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(text(5e-324), "5e-324");
    }

    #[test]
    fn what_json_cannot_hold_is_null() {
        assert_eq!(text(f64::NAN), "null");
        assert_eq!(text(f64::INFINITY), "null");
    }
}
