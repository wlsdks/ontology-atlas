//! `roundScore`: the rounding every score an answer writes goes through.

/// `Number(value.toFixed(6))`: six decimals, a tie rounding up. The decimal expansion of the
/// number is exact, so the seventh digit decides.
pub(in crate::query) fn round_score(value: f64) -> f64 {
    let written = format!("{value:.30}");
    let Some((whole, fraction)) = written.split_once('.') else {
        return value;
    };
    let mut digits: Vec<u8> = whole.bytes().chain(fraction.bytes().take(6)).collect();
    let round_up = fraction
        .as_bytes()
        .get(6)
        .is_some_and(|digit| *digit >= b'5');
    if round_up {
        let mut at = digits.len();
        loop {
            let Some(previous) = at.checked_sub(1) else {
                digits.insert(0, b'1');
                break;
            };
            at = previous;
            match digits.get_mut(at) {
                Some(digit) if *digit == b'9' => *digit = b'0',
                Some(digit) => {
                    *digit += 1;
                    break;
                }
                None => break,
            }
        }
    }
    let split = digits.len().saturating_sub(6);
    let text = format!(
        "{}.{}",
        String::from_utf8_lossy(digits.get(..split).unwrap_or_default()),
        String::from_utf8_lossy(digits.get(split..).unwrap_or_default())
    );
    text.parse().unwrap_or(value)
}
