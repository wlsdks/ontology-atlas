//! Checking what an embedding function answered, and the two forms a vector is stored in.

/// A vector as stored: unit length, int8 times `scale`, and its sign bits.
pub(super) struct Quantized {
    pub(super) scale: f64,
    pub(super) int8: Vec<u8>,
    /// Bit `i` of byte `i / 8` is set when component `i` is positive; padded to whole 64-bit words.
    pub(super) bits: Vec<u8>,
}

/// Normalises a vector and quantises it; `None` for a zero or non-finite one. O(d).
fn quantize(vector: &[f32]) -> Option<Quantized> {
    let norm = vector
        .iter()
        .map(|&x| f64::from(x) * f64::from(x))
        .sum::<f64>()
        .sqrt();
    if !norm.is_finite() || norm <= 0.0 {
        return None;
    }
    let peak = vector
        .iter()
        .map(|&x| (f64::from(x) / norm).abs())
        .fold(0.0, f64::max);
    let scale = peak / 127.0;
    let mut bits = vec![0u8; vector.len().div_ceil(64) * 8];
    let mut int8 = Vec::with_capacity(vector.len());
    for (index, &x) in vector.iter().enumerate() {
        let unit = f64::from(x) / norm;
        int8.push(((unit / scale).round().clamp(-127.0, 127.0) as i8) as u8);
        if unit > 0.0 {
            if let Some(byte) = bits.get_mut(index / 8) {
                *byte |= 1 << (index % 8);
            }
        }
    }
    Some(Quantized { scale, int8, bits })
}

/// Why vectors from the embedding function were refused. Nothing from that batch is stored.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Refusal {
    WrongCount {
        expected: usize,
        got: usize,
    },
    WrongDimension {
        index: usize,
        expected: usize,
        got: usize,
    },
    NotFinite {
        index: usize,
    },
    Zero {
        index: usize,
    },
}

impl std::fmt::Display for Refusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Refusal::WrongCount { expected, got } => {
                write!(f, "{got} vectors for {expected} passages")
            }
            Refusal::WrongDimension {
                index,
                expected,
                got,
            } => write!(f, "vector {index} has {got} dimensions, not {expected}"),
            Refusal::NotFinite { index } => write!(f, "vector {index} is not finite"),
            Refusal::Zero { index } => write!(f, "vector {index} is zero"),
        }
    }
}

/// Exactly one finite, non-zero vector of `dimensions` per passage, or a refusal.
pub(super) fn check_vectors(
    vectors: &[Vec<f32>],
    passages: usize,
    dimensions: usize,
) -> Result<Vec<Quantized>, Refusal> {
    if vectors.len() != passages {
        return Err(Refusal::WrongCount {
            expected: passages,
            got: vectors.len(),
        });
    }
    vectors
        .iter()
        .enumerate()
        .map(|(index, vector)| check_vector(index, vector, dimensions))
        .collect()
}

pub(super) fn check_vector(
    index: usize,
    vector: &[f32],
    dimensions: usize,
) -> Result<Quantized, Refusal> {
    if vector.len() != dimensions {
        return Err(Refusal::WrongDimension {
            index,
            expected: dimensions,
            got: vector.len(),
        });
    }
    if !vector.iter().all(|x| x.is_finite()) {
        return Err(Refusal::NotFinite { index });
    }
    quantize(vector).ok_or(Refusal::Zero { index })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quantizing_keeps_direction_and_signs() {
        let vector: Vec<f32> = (0..130).map(|i| (i as f32 - 64.5) / 10.0).collect();
        let quantized = quantize(&vector).unwrap();
        assert_eq!(quantized.bits.len(), 24, "three 64-bit words");
        let norm: f64 = vector
            .iter()
            .map(|&x| f64::from(x).powi(2))
            .sum::<f64>()
            .sqrt();
        for (index, &x) in vector.iter().enumerate() {
            let restored = f64::from(quantized.int8[index] as i8) * quantized.scale;
            assert!((restored - f64::from(x) / norm).abs() <= quantized.scale / 2.0 + 1e-9);
            assert_eq!((quantized.bits[index / 8] >> (index % 8)) & 1 == 1, x > 0.0);
        }
        assert!(quantize(&[0.0; 4]).is_none());
        assert!(
            quantize(&[f32::MAX, f32::MAX]).is_some(),
            "no overflow while normalising"
        );
    }

    #[test]
    fn every_vector_is_checked_before_any_is_kept() {
        let good = vec![1.0, 0.0];
        assert!(check_vectors(&[good.clone(), good.clone()], 2, 2).is_ok());
        assert_eq!(
            check_vectors(std::slice::from_ref(&good), 2, 2).err(),
            Some(Refusal::WrongCount {
                expected: 2,
                got: 1
            })
        );
        assert_eq!(
            check_vectors(&[good.clone(), vec![1.0]], 2, 2).err(),
            Some(Refusal::WrongDimension {
                index: 1,
                expected: 2,
                got: 1
            })
        );
        for bad in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            assert_eq!(
                check_vectors(&[good.clone(), vec![bad, 0.0]], 2, 2).err(),
                Some(Refusal::NotFinite { index: 1 })
            );
        }
        assert_eq!(
            check_vectors(&[vec![0.0, 0.0]], 1, 2).err(),
            Some(Refusal::Zero { index: 0 })
        );
    }
}
