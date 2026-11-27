//! A version 4 UUID for the ids of an analysis and a session. They name things in a log, they guard
//! nothing, so the operating system's random keys that `std` seeds every `RandomState` with are
//! enough; no crate is added for them.

use std::hash::{BuildHasher, RandomState};
use std::sync::atomic::{AtomicU64, Ordering};

/// A fresh id such as `3f2b8c1e-5a0d-4e7b-9c36-1d2e3f405162`.
pub fn new_uuid() -> String {
    static DRAWN: AtomicU64 = AtomicU64::new(0);
    let draw = DRAWN.fetch_add(1, Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    let high = RandomState::new().hash_one((nanos, draw, 0_u8));
    let low = RandomState::new().hash_one((nanos, draw, 1_u8));
    let mut bytes = [high.to_be_bytes(), low.to_be_bytes()].concat();
    if let Some(version) = bytes.get_mut(6) {
        *version = (*version & 0x0f) | 0x40;
    }
    if let Some(variant) = bytes.get_mut(8) {
        *variant = (*variant & 0x3f) | 0x80;
    }
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        hex.get(..8).unwrap_or_default(),
        hex.get(8..12).unwrap_or_default(),
        hex.get(12..16).unwrap_or_default(),
        hex.get(16..20).unwrap_or_default(),
        hex.get(20..).unwrap_or_default()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_id_is_a_version_4_uuid_and_two_ids_differ() {
        let first = new_uuid();
        let shape: Vec<usize> = first.split('-').map(str::len).collect();
        assert_eq!(shape, [8, 4, 4, 4, 12]);
        assert!(first
            .bytes()
            .all(|byte| byte == b'-' || byte.is_ascii_hexdigit()));
        assert_eq!(first.chars().nth(14), Some('4'));
        assert!(matches!(first.chars().nth(19), Some('8' | '9' | 'a' | 'b')));
        let ids: std::collections::HashSet<String> = (0..1000).map(|_| new_uuid()).collect();
        assert_eq!(ids.len(), 1000);
    }
}
