//! A moment as `Date.prototype.toISOString` writes it, and as `Date.parse` reads it back.
//!
//! `2026-11-27T09:15:30.123Z`: UTC, always milliseconds, always `Z`. Counting days from the epoch
//! uses the proleptic Gregorian calendar, as ECMAScript's `Date` does; the arithmetic is Howard
//! Hinnant's `civil_from_days` and `days_from_civil`.

const MS_PER_DAY: i64 = 86_400_000;

/// The civil date of `days` after 1970-01-01.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// Days after 1970-01-01 of a civil date.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = year - i64::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year.rem_euclid(400);
    let month_index = if month > 2 { month - 3 } else { month + 9 };
    let day_of_year = (153 * month_index + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// `epoch_ms` as `YYYY-MM-DDTHH:MM:SS.mmmZ`; a year outside 0 to 9999 takes the six digits and sign
/// ECMAScript gives it.
pub fn to_iso_string(epoch_ms: i64) -> String {
    let days = epoch_ms.div_euclid(MS_PER_DAY);
    let in_day = epoch_ms.rem_euclid(MS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    let year_text = if (0..=9999).contains(&year) {
        format!("{year:04}")
    } else {
        format!("{}{:06}", if year < 0 { '-' } else { '+' }, year.abs())
    };
    format!(
        "{year_text}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        in_day / 3_600_000,
        in_day / 60_000 % 60,
        in_day / 1000 % 60,
        in_day % 1000
    )
}

fn digits(text: &str, length: usize) -> Option<i64> {
    if text.len() == length && text.bytes().all(|byte| byte.is_ascii_digit()) {
        text.parse().ok()
    } else {
        None
    }
}

/// The milliseconds a line's time names: `YYYY-MM-DD`, optionally `THH:MM`, `:SS` and `.fff`
/// (one to nine digits, cut to milliseconds), then `Z` or `+HH:MM` / `-HH:MM`. Anything else is
/// `None`. A time with no zone is UTC, which is what the writer always wrote.
pub fn parse_iso(text: &str) -> Option<i64> {
    let (date, rest) = match text.split_once('T') {
        Some((date, rest)) => (date, Some(rest)),
        None => (text, None),
    };
    let mut date_parts = date.split('-');
    let year = digits(date_parts.next()?, 4)?;
    let month = digits(date_parts.next()?, 2)?;
    let day = digits(date_parts.next()?, 2)?;
    if date_parts.next().is_some() || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let days = days_from_civil(year, month, day);
    if civil_from_days(days) != (year, month, day) {
        return None;
    }
    let mut at = days * MS_PER_DAY;
    let Some(rest) = rest else {
        return Some(at);
    };
    let (clock, offset_minutes) = split_zone(rest)?;
    let mut clock_parts = clock.splitn(3, ':');
    let hour = digits(clock_parts.next()?, 2)?;
    let minute = digits(clock_parts.next()?, 2)?;
    let (second, millisecond) = match clock_parts.next() {
        None => (0, 0),
        Some(seconds) => {
            let (whole, fraction) = match seconds.split_once('.') {
                Some((whole, fraction)) => (whole, Some(fraction)),
                None => (seconds, None),
            };
            let millisecond = match fraction {
                None => 0,
                Some(fraction) if (1..=9).contains(&fraction.len()) => {
                    digits(fraction, fraction.len())?;
                    let padded = format!("{fraction:0<3}");
                    padded.get(..3)?.parse().ok()?
                }
                Some(_) => return None,
            };
            (digits(whole, 2)?, millisecond)
        }
    };
    if hour > 24
        || minute > 59
        || second > 59
        || (hour == 24 && (minute, second, millisecond) != (0, 0, 0))
    {
        return None;
    }
    at += ((hour * 60 + minute) * 60 + second) * 1000 + millisecond;
    Some(at - offset_minutes * 60_000)
}

/// The clock part of a time and its offset from UTC in minutes.
fn split_zone(rest: &str) -> Option<(&str, i64)> {
    if let Some(clock) = rest.strip_suffix('Z') {
        return Some((clock, 0));
    }
    let sign_at = rest.rfind(['+', '-']);
    match sign_at {
        Some(position) if position >= 5 => {
            let (clock, zone) = rest.split_at(position);
            let sign = if zone.starts_with('-') { -1 } else { 1 };
            let (hours, minutes) = zone.get(1..)?.split_once(':')?;
            let offset = digits(hours, 2)? * 60 + digits(minutes, 2)?;
            Some((clock, sign * offset))
        }
        _ => Some((rest, 0)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_moment_is_written_as_to_iso_string_writes_it() {
        assert_eq!(to_iso_string(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(to_iso_string(1_790_000_000_000), "2026-09-21T14:13:20.000Z");
        assert_eq!(to_iso_string(4_102_444_800_000), "2100-01-01T00:00:00.000Z");
        assert_eq!(to_iso_string(951_782_400_123), "2000-02-29T00:00:00.123Z");
        assert_eq!(to_iso_string(-1), "1969-12-31T23:59:59.999Z");
        assert_eq!(
            to_iso_string(8_640_000_000_000_000),
            "+275760-09-13T00:00:00.000Z"
        );
    }

    #[test]
    fn a_moment_written_is_the_moment_read() {
        for moment in [
            0,
            1_790_000_000_123,
            4_102_444_800_000,
            951_782_400_000,
            1_582_934_400_999,
        ] {
            assert_eq!(parse_iso(&to_iso_string(moment)), Some(moment), "{moment}");
        }
    }

    #[test]
    fn zones_fractions_and_impossible_dates_read_as_a_script_reads_them() {
        assert_eq!(
            parse_iso("2026-11-20T09:10:00Z"),
            parse_iso("2026-11-20T09:10:00.000Z")
        );
        assert_eq!(
            parse_iso("2026-11-20T18:10:00+09:00"),
            parse_iso("2026-11-20T09:10:00.000Z")
        );
        assert_eq!(
            parse_iso("2026-11-20T09:10:00.1234567Z"),
            parse_iso("2026-11-20T09:10:00.123Z")
        );
        assert_eq!(
            parse_iso("2026-11-20"),
            parse_iso("2026-11-20T00:00:00.000Z")
        );
        for bad in [
            "yesterday",
            "",
            "2026-13-01T00:00:00Z",
            "2026-02-30T00:00:00Z",
            "2026-11-20T25:00:00Z",
            "2026-11-20T09:10:60Z",
            "2026-11-20T09:10:00.Z",
            "+275760-09-13T00:00:00.000Z",
        ] {
            assert_eq!(parse_iso(bad), None, "{bad}");
        }
    }
}
