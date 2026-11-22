use super::*;

/// Stored library hashes stay valid only while this digest is byte-for-byte unchanged.
#[test]
fn copy_hashing_keeps_the_recorded_sha256_across_chunks() {
    let input: Vec<u8> = (0..200_000_u32).map(|i| (i % 251) as u8).collect();
    let mut copied = Vec::new();
    let (hash, length) = copy_hashing(&mut input.as_slice(), &mut copied).unwrap();
    assert_eq!(
        hash,
        "e24bc62381f1224fbbb74688663f8f9743b9680b193edd666835e97b06e730eb"
    );
    assert_eq!(length, 200_000);
    assert_eq!(copied, input);
}
