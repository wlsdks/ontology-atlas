// The reference vectors and the check a fresh conversion must pass.

use super::infer::{self, Encoder};
use crate::llm::embed::EmbedError;
use candle_core::{DType, Device};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
pub(super) struct References {
    /// The least cosine each probe may show against its reference vector.
    pub floor: f32,
    pub probes: Vec<Probe>,
}

#[derive(Debug, Deserialize)]
pub(super) struct Probe {
    pub text: String,
    pub vector: Vec<f32>,
}

/// The converted file must turn each reference text into a vector within the floor
/// of the one recorded from an independent implementation of the same model.
pub(crate) fn check_conversion(
    references: &str,
    config: &str,
    (device, dtype): (Device, DType),
    weights: &Path,
    tokenizer: &Path,
) -> Result<(), EmbedError> {
    let references: References =
        serde_json::from_str(references).map_err(|_| EmbedError::ModelLoad("references".into()))?;
    if references.probes.is_empty() {
        return Err(EmbedError::ModelLoad("references".into()));
    }
    let config = infer::config(config)?;
    let encoder = Encoder::load(weights, tokenizer, &config, device, dtype)?;
    let texts: Vec<&str> = references
        .probes
        .iter()
        .map(|probe| probe.text.as_str())
        .collect();
    let vectors = encoder.embed(&texts)?;
    for (index, (vector, probe)) in vectors.iter().zip(&references.probes).enumerate() {
        let mut expected = probe.vector.clone();
        if vector.len() != config.hidden_size || expected.len() != vector.len() {
            return Err(EmbedError::ModelLoad(format!("reference {index} width")));
        }
        infer::normalize(&mut expected)?;
        let cosine: f32 = vector.iter().zip(&expected).map(|(a, b)| a * b).sum();
        if cosine < references.floor {
            return Err(EmbedError::ModelLoad(format!(
                "reference {index} cosine {cosine:.4}"
            )));
        }
    }
    Ok(())
}
