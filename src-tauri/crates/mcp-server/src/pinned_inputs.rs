//! The two inputs the differential harness pins in every server it compares: the clock and the
//! source of random ids. Only a build with the `differential-inputs` feature reads them, from the
//! same two variables the JavaScript server's test preload reads; the shipped program has no such
//! feature, so no environment variable can steer what a vault write or an audit line says.
//!
//! Ids come from named streams, so an id drawn for one purpose cannot shift the ids drawn for
//! another: `schema` for node identities, `map-analysis-log` for session and analysis ids.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use sha2::{Digest, Sha256};

const CLOCK_VARIABLE: &str = "ATLAS_DIFF_CLOCK_MS";
const SEED_VARIABLE: &str = "ATLAS_DIFF_UID_SEED";

/// The fixed instant, in epoch milliseconds, or `None` when none is pinned.
pub fn clock_ms() -> Option<i64> {
    let text = std::env::var(CLOCK_VARIABLE).ok()?;
    let milliseconds: f64 = text.trim().parse().ok()?;
    #[allow(clippy::cast_possible_truncation, reason = "an epoch time in milliseconds")]
    milliseconds.is_finite().then_some(milliseconds as i64)
}

/// The next id of `stream`, or `None` when no seed is pinned.
pub fn next_id(stream: &str) -> Option<String> {
    static COUNTERS: Mutex<Option<HashMap<String, u64>>> = Mutex::new(None);
    let seed = std::env::var(SEED_VARIABLE).ok()?;
    let index = {
        let mut counters = COUNTERS.lock().unwrap_or_else(PoisonError::into_inner);
        let counter = counters
            .get_or_insert_with(HashMap::new)
            .entry(stream.to_string())
            .or_insert(0);
        let index = *counter;
        *counter += 1;
        index
    };
    let digest = Sha256::digest(format!("{seed}\0{stream}\0{index}").as_bytes());
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(digest.get(..16)?);
    if let Some(version) = bytes.get_mut(6) {
        *version = (*version & 0x0f) | 0x40;
    }
    if let Some(variant) = bytes.get_mut(8) {
        *variant = (*variant & 0x3f) | 0x80;
    }
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    Some(format!(
        "{}-{}-{}-{}-{}",
        hex.get(..8)?,
        hex.get(8..12)?,
        hex.get(12..16)?,
        hex.get(16..20)?,
        hex.get(20..32)?
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_seeded_id_is_a_version_four_uuid_and_each_stream_counts_apart() {
        std::env::set_var(SEED_VARIABLE, "unit");
        let first = next_id("schema").expect("seeded");
        let other = next_id("other").expect("seeded");
        let second = next_id("schema").expect("seeded");
        std::env::remove_var(SEED_VARIABLE);
        assert!(vault_document::schema::is_node_uid(&first), "{first}");
        assert!(vault_document::schema::is_node_uid(&second), "{second}");
        assert_ne!(first, second);
        assert_ne!(first, other);
    }
}
