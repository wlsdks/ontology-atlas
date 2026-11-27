//! A file's modification time as Node reports it, and the rule that decides two readings differ.

use std::fs::Metadata;
use std::time::SystemTime;

/// Milliseconds since the epoch as the double Node's `statSync(path).mtimeMs` holds:
/// `seconds * 1000 + nanoseconds / 1e6`, each part converted to a double first.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ModifiedTime(f64);

impl ModifiedTime {
    pub fn from_milliseconds(milliseconds: f64) -> Self {
        Self(milliseconds)
    }

    pub fn milliseconds(self) -> f64 {
        self.0
    }

    /// `None` when the file system keeps no modification time.
    pub fn of(metadata: &Metadata) -> Option<Self> {
        metadata.modified().ok().map(Self::from_system_time)
    }

    /// From nanoseconds since the epoch (negative before it), the way libuv splits a time into
    /// seconds and a positive nanosecond part.
    pub fn from_nanoseconds(nanoseconds: i128) -> Self {
        let seconds = nanoseconds.div_euclid(1_000_000_000);
        let remainder = nanoseconds.rem_euclid(1_000_000_000);
        Self(seconds as f64 * 1000.0 + remainder as f64 / 1_000_000.0)
    }

    pub fn from_system_time(time: SystemTime) -> Self {
        let (seconds, nanoseconds) = match time.duration_since(SystemTime::UNIX_EPOCH) {
            Ok(after) => (after.as_secs() as f64, f64::from(after.subsec_nanos())),
            Err(before) => {
                // Before the epoch libuv keeps a negative seconds part and a positive nanosecond part.
                let gap = before.duration();
                if gap.subsec_nanos() == 0 {
                    (-(gap.as_secs() as f64), 0.0)
                } else {
                    (
                        -(gap.as_secs() as f64) - 1.0,
                        f64::from(1_000_000_000 - gap.subsec_nanos()),
                    )
                }
            }
        };
        Self(seconds * 1000.0 + nanoseconds / 1_000_000.0)
    }

    /// Whether `current` is a different reading than `self` as the writers judge it: one
    /// millisecond or more apart.
    pub fn differs_from(self, current: Self) -> bool {
        (current.0 - self.0).abs() >= 1.0
    }

    /// The number as JavaScript prints it, for a conflict message.
    pub fn javascript_text(self) -> String {
        javascript_number_text(self.0)
    }
}

/// `null` or a number's JavaScript text, as a template literal prints a reading.
pub fn reading_text(reading: Option<ModifiedTime>) -> String {
    reading.map_or_else(|| "null".to_string(), ModifiedTime::javascript_text)
}

fn javascript_number_text(number: f64) -> String {
    ryu_js::Buffer::new().format(number).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn a_reading_is_seconds_times_a_thousand_plus_the_fraction() {
        let time = SystemTime::UNIX_EPOCH + Duration::new(1_700_000_000, 123_000_000);
        assert_eq!(
            ModifiedTime::from_system_time(time).milliseconds(),
            1_700_000_000_123.0
        );
        let before = SystemTime::UNIX_EPOCH - Duration::new(1, 500_000_000);
        assert_eq!(
            ModifiedTime::from_system_time(before).milliseconds(),
            -1500.0
        );
    }

    #[test]
    fn two_readings_differ_from_one_millisecond_apart() {
        let base = ModifiedTime::from_milliseconds(1000.0);
        assert!(!base.differs_from(ModifiedTime::from_milliseconds(1000.999)));
        assert!(base.differs_from(ModifiedTime::from_milliseconds(1001.0)));
        assert!(base.differs_from(ModifiedTime::from_milliseconds(999.0)));
        assert!(!base.differs_from(base));
    }

    #[test]
    fn a_reading_prints_as_javascript_prints_a_number() {
        assert_eq!(
            ModifiedTime::from_milliseconds(1_700_000_000_000.0).javascript_text(),
            "1700000000000"
        );
        assert_eq!(
            ModifiedTime::from_milliseconds(1_700_000_000_123.5).javascript_text(),
            "1700000000123.5"
        );
        assert_eq!(reading_text(None), "null");
    }
}
