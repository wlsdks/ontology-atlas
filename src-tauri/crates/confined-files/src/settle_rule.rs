//! When a stamp can be trusted: the one rule every cache of a file's contents asks.
//!
//! A file written again inside the clock's grain keeps its stamp, so a later stamp that equals the
//! one a cache holds proves nothing unless the file was already old when that stamp was taken.
//! The moment to name is the one before the file was read or stamped: a later moment makes the
//! file look older than it was.

use std::time::{SystemTime, UNIX_EPOCH};

/// How old a file's newest time must be, when its stamp is taken, for an equal stamp later to
/// prove the file was not written since. Two seconds covers one FAT or exFAT timestamp tick and a
/// rewrite of the same size inside one tick.
pub const SETTLE_NANOSECONDS: i128 = 2_000_000_000;

/// Nanoseconds since the epoch now: the `read_at_ns` to take before reading or stamping a file.
pub fn now_nanoseconds() -> i128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| i128::try_from(elapsed.as_nanos()).unwrap_or(0))
}

/// Whether a file last changed at `changed_ns` was at least [`SETTLE_NANOSECONDS`] old at
/// `read_at_ns`. A time in the future is never settled.
pub fn is_settled_at(changed_ns: i128, read_at_ns: i128) -> bool {
    read_at_ns.saturating_sub(changed_ns) >= SETTLE_NANOSECONDS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_is_settled_once_two_seconds_separate_its_change_from_the_read() {
        let read_at = 10_000_000_000;
        assert!(!is_settled_at(read_at, read_at));
        assert!(!is_settled_at(read_at - SETTLE_NANOSECONDS + 1, read_at));
        assert!(is_settled_at(read_at - SETTLE_NANOSECONDS, read_at));
        assert!(
            !is_settled_at(read_at + 5, read_at),
            "a time in the future is never trusted"
        );
    }
}
