// NFC, tokenize, run XLM-RoBERTa, keep the first token's last hidden state at
// length 1. Passages run sorted by token count in groups under a padded-size
// budget, so a batch costs about what its passages cost one by one.

use super::super::EmbedError;
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::xlm_roberta::{Config, XLMRobertaModel};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tokenizers::{NormalizedString, Tokenizer, TruncationParams};

/// Tokens kept per passage, `<s>` and `</s>` included: a guard, not a cut, since a
/// 2,000-character passage measured at most 1,211. Position ids are counted in the
/// weights' f16, exact only to 2,048, and the last one is this plus 1.
pub(crate) const MAX_TOKENS: usize = 2_046;
/// What one forward pass may hold, padding included.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Budget {
    pub tokens: usize,
    /// Rows times width squared: each layer's attention scores take 16 heads times
    /// 2 bytes per cell, so this bounds the peak a group of long passages adds.
    pub cells: usize,
}

pub(crate) const BUDGET: Budget = Budget {
    tokens: 512,
    cells: 1 << 18,
};

pub(crate) struct Encoder {
    tokenizer: Tokenizer,
    model: XLMRobertaModel,
    device: Device,
    pad_id: u32,
    max_tokens: usize,
    budget: Budget,
    /// One forward pass at a time on the device.
    compute: Mutex<()>,
    /// Questions waiting for `compute`; a build yields to them between groups.
    queries_waiting: AtomicUsize,
}

fn model_error(error: impl std::fmt::Display) -> EmbedError {
    EmbedError::ModelLoad(crate::errors::squeeze(&error.to_string()))
}

fn inference_error(error: impl std::fmt::Display) -> EmbedError {
    EmbedError::Inference(crate::errors::squeeze(&error.to_string()))
}

/// Metal on macOS with the weights' f16; elsewhere the CPU, computing in f32.
pub(crate) fn device() -> (Device, DType) {
    #[cfg(target_os = "macos")]
    if let Ok(device) = Device::new_metal(0) {
        return (device, DType::F16);
    }
    (Device::Cpu, DType::F32)
}

pub(crate) fn config(json: &str) -> Result<Config, EmbedError> {
    serde_json::from_str(json).map_err(model_error)
}

pub(crate) fn tokenizer(path: &Path, max_tokens: usize) -> Result<Tokenizer, EmbedError> {
    let mut tokenizer = Tokenizer::from_file(path).map_err(model_error)?;
    tokenizer.with_padding(None);
    tokenizer
        .with_truncation(Some(TruncationParams {
            max_length: max_tokens,
            ..TruncationParams::default()
        }))
        .map_err(model_error)?;
    Ok(tokenizer)
}

impl Encoder {
    /// Reads f16 safetensors; the file is the app's own conversion of a verified download.
    pub(crate) fn load(
        weights: &Path,
        tokenizer_path: &Path,
        config: &Config,
        device: Device,
        dtype: DType,
    ) -> Result<Self, EmbedError> {
        let tokenizer = tokenizer(tokenizer_path, MAX_TOKENS)?;
        // SAFETY: the file sits in the app's own data directory and is not written
        // while mapped; the mapping is dropped when loading returns.
        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&[weights], dtype, &device) }
            .map_err(model_error)?;
        let model = XLMRobertaModel::new(config, vb).map_err(model_error)?;
        Ok(Self::from_parts(
            tokenizer,
            model,
            device,
            config.pad_token_id,
            MAX_TOKENS,
        ))
    }

    pub(crate) fn from_parts(
        tokenizer: Tokenizer,
        model: XLMRobertaModel,
        device: Device,
        pad_id: u32,
        max_tokens: usize,
    ) -> Self {
        Self {
            tokenizer,
            model,
            device,
            pad_id,
            max_tokens,
            budget: BUDGET,
            compute: Mutex::new(()),
            queries_waiting: AtomicUsize::new(0),
        }
    }

    pub(crate) fn with_budget(mut self, budget: Budget) -> Self {
        self.budget = budget;
        self
    }

    /// Token ids per text, after NFC, within the token limit.
    pub(crate) fn encode(&self, texts: &[&str]) -> Result<Vec<Vec<u32>>, EmbedError> {
        let normalized: Vec<String> = texts.iter().map(|text| nfc(text)).collect();
        let encodings = self
            .tokenizer
            .encode_batch(normalized, true)
            .map_err(inference_error)?;
        Ok(encodings
            .iter()
            .map(|encoding| {
                let ids = encoding.get_ids();
                ids.get(..self.max_tokens).unwrap_or(ids).to_vec()
            })
            .collect())
    }

    /// One unit vector per text, in order. A question passes `priority`, so it runs
    /// before a build's next group.
    pub(crate) fn embed(
        &self,
        texts: &[&str],
        priority: bool,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
        let ids = self.encode(texts)?;
        let mut order: Vec<usize> = (0..ids.len()).collect();
        order.sort_by_key(|&index| ids.get(index).map_or(0, Vec::len));
        let mut vectors: Vec<Option<Vec<f32>>> = vec![None; ids.len()];
        for group in groups(&order, &ids, self.budget) {
            let rows: Vec<&[u32]> = group
                .iter()
                .filter_map(|&index| ids.get(index).map(Vec::as_slice))
                .collect();
            let embedded = self.forward(&rows, priority)?;
            for (&index, vector) in group.iter().zip(embedded) {
                if let Some(slot) = vectors.get_mut(index) {
                    *slot = Some(vector);
                }
            }
        }
        vectors
            .into_iter()
            .map(|vector| vector.ok_or(EmbedError::ResponseInvalid("count")))
            .collect()
    }

    fn forward(&self, rows: &[&[u32]], priority: bool) -> Result<Vec<Vec<f32>>, EmbedError> {
        let width = rows.iter().map(|row| row.len()).max().unwrap_or(0);
        if width == 0 {
            return Err(EmbedError::BatchEmpty);
        }
        let mut ids = vec![self.pad_id; rows.len() * width];
        let mut mask = vec![0u32; rows.len() * width];
        for (row_index, row) in rows.iter().enumerate() {
            let start = row_index * width;
            if let Some(slot) = ids.get_mut(start..start + row.len()) {
                slot.copy_from_slice(row);
            }
            if let Some(slot) = mask.get_mut(start..start + row.len()) {
                slot.fill(1);
            }
        }
        let _turn = self.turn(priority);
        let shape = (rows.len(), width);
        let run = || -> candle_core::Result<Vec<Vec<f32>>> {
            let ids = Tensor::from_vec(ids, shape, &self.device)?;
            let mask = Tensor::from_vec(mask, shape, &self.device)?;
            let types = ids.zeros_like()?;
            let hidden = self.model.forward(&ids, &mask, &types, None, None, None)?;
            hidden
                .narrow(1, 0, 1)?
                .squeeze(1)?
                .to_dtype(DType::F32)?
                .to_vec2()
        };
        let mut vectors = run().map_err(inference_error)?;
        for vector in &mut vectors {
            normalize(vector)?;
        }
        Ok(vectors)
    }

    /// A question announces itself and takes the next turn; a build waits while any
    /// question is waiting.
    fn turn(&self, priority: bool) -> std::sync::MutexGuard<'_, ()> {
        if priority {
            self.queries_waiting.fetch_add(1, Ordering::SeqCst);
            let guard = self
                .compute
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            self.queries_waiting.fetch_sub(1, Ordering::SeqCst);
            return guard;
        }
        while self.queries_waiting.load(Ordering::SeqCst) > 0 {
            std::thread::sleep(Duration::from_millis(2));
        }
        self.compute
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Consecutive runs of the length-sorted order whose padded size fits the budget;
/// a row over it on its own runs alone.
pub(crate) fn groups(order: &[usize], ids: &[Vec<u32>], budget: Budget) -> Vec<Vec<usize>> {
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut current: Vec<usize> = Vec::new();
    for &index in order {
        let len = ids.get(index).map_or(0, Vec::len);
        // Sorted ascending, so this row sets the group's width.
        let rows = current.len() + 1;
        let over = rows.saturating_mul(len) > budget.tokens
            || rows.saturating_mul(len).saturating_mul(len) > budget.cells;
        if !current.is_empty() && over {
            groups.push(std::mem::take(&mut current));
        }
        current.push(index);
    }
    if !current.is_empty() {
        groups.push(current);
    }
    groups
}

pub(crate) fn nfc(text: &str) -> String {
    let mut normalized = NormalizedString::from(text);
    normalized.nfc();
    normalized.get().to_string()
}

fn normalize(vector: &mut [f32]) -> Result<(), EmbedError> {
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if !norm.is_finite() || norm <= f32::EPSILON || vector.iter().any(|v| !v.is_finite()) {
        return Err(EmbedError::ResponseInvalid("not-finite"));
    }
    for value in vector.iter_mut() {
        *value /= norm;
    }
    Ok(())
}
