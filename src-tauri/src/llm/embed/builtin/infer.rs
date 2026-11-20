// NFC, tokenize, run XLM-RoBERTa, keep the first token's last hidden state at
// length 1. Passages run sorted by token count in groups under a padded-size
// budget, so a batch costs about what its passages cost one by one.

use super::super::EmbedError;
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::xlm_roberta::{Config, XLMRobertaModel};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use tokenizers::{NormalizedString, Tokenizer, TruncationParams};

/// Tokens kept per passage, `<s>` and `</s>` included: a guard, not a cut, since a
/// 2,000-character passage measured at most 1,211. Position ids are counted in the
/// weights' f16, exact only to 2,048, and the last one is this plus 1.
pub(crate) const MAX_TOKENS: usize = 2_046;

/// What one forward pass may hold, padding included. A stop is honoured between
/// passes, so the budget also bounds how long a stop waits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Budget {
    pub tokens: usize,
    /// Rows times width squared: each layer's attention scores take 16 heads times
    /// 2 bytes per cell, so this bounds the peak a group of long passages adds.
    pub cells: usize,
}

pub(crate) const METAL_BUDGET: Budget = Budget {
    tokens: 512,
    cells: 1 << 18,
};

/// On an M-series CPU in f32 a 652-token passage alone took 0.6 s and a 32-passage
/// batch ran in 20 passes of 0.33 s, so a stop waits well under a few seconds.
pub(crate) const CPU_BUDGET: Budget = Budget {
    tokens: 256,
    cells: 1 << 17,
};

/// Where the model runs and what it needs, for the screen that offers it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Runtime {
    /// `metal` or `cpu`.
    pub device: &'static str,
    /// The weights' type in memory.
    pub dtype: &'static str,
    /// Peak physical memory while embedding, measured on bge-m3.
    pub memory_bytes: u64,
}

/// A 2,505-passage build peaked at 1.66 GiB (`pnpm perf:builtin-model`).
const METAL_RUNTIME: Runtime = Runtime {
    device: "metal",
    dtype: "f16",
    memory_bytes: 1_800_000_000,
};

/// The f16 file becomes f32 on load: 2.27 GB of weights stay resident, and a
/// batch peaked at 3.15 GiB.
const CPU_RUNTIME: Runtime = Runtime {
    device: "cpu",
    dtype: "f32",
    memory_bytes: 3_300_000_000,
};

pub(crate) struct Encoder {
    tokenizer: Tokenizer,
    model: XLMRobertaModel,
    device: Device,
    pad_id: u32,
    max_tokens: usize,
    budget: Budget,
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

pub(crate) fn runtime_of(device: &Device) -> Runtime {
    if device.is_metal() {
        METAL_RUNTIME
    } else {
        CPU_RUNTIME
    }
}

/// What `device` will pick on this platform, without creating a device.
pub(crate) fn expected_runtime() -> Runtime {
    if cfg!(target_os = "macos") {
        METAL_RUNTIME
    } else {
        CPU_RUNTIME
    }
}

/// A worker's report, accepted only for a device and type this build runs.
pub(crate) fn reported_runtime(device: &str, dtype: &str, memory_bytes: u64) -> Option<Runtime> {
    let known = [METAL_RUNTIME, CPU_RUNTIME]
        .into_iter()
        .find(|runtime| runtime.device == device && runtime.dtype == dtype)?;
    Some(Runtime {
        memory_bytes,
        ..known
    })
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

/// Metal hands back autoreleased objects for every command buffer. A thread
/// without a pool keeps them for its whole life, so each pass drains its own.
fn in_pool<T>(work: impl FnOnce() -> T) -> T {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "objc", kind = "dylib")]
        extern "C" {
            fn objc_autoreleasePoolPush() -> *mut std::ffi::c_void;
            fn objc_autoreleasePoolPop(pool: *mut std::ffi::c_void);
        }
        struct Pool(*mut std::ffi::c_void);
        impl Drop for Pool {
            fn drop(&mut self) {
                // SAFETY: popped once, on the thread that pushed it, in reverse order.
                unsafe { objc_autoreleasePoolPop(self.0) }
            }
        }
        // SAFETY: the pool is popped by `Pool`'s drop before this frame returns.
        let _pool = Pool(unsafe { objc_autoreleasePoolPush() });
        work()
    }
    #[cfg(not(target_os = "macos"))]
    work()
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
        let model = in_pool(|| {
            // SAFETY: the file sits in the app's own data directory and is not
            // written while mapped; the mapping is dropped when loading returns.
            let vb = unsafe { VarBuilder::from_mmaped_safetensors(&[weights], dtype, &device) }
                .map_err(model_error)?;
            XLMRobertaModel::new(config, vb).map_err(model_error)
        })?;
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
        let budget = if device.is_metal() {
            METAL_BUDGET
        } else {
            CPU_BUDGET
        };
        Self {
            tokenizer,
            model,
            device,
            pad_id,
            max_tokens,
            budget,
        }
    }

    pub(crate) fn with_budget(mut self, budget: Budget) -> Self {
        self.budget = budget;
        self
    }

    pub(crate) fn runtime(&self) -> Runtime {
        runtime_of(&self.device)
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

    /// One unit vector per text, in order.
    pub(crate) fn embed(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, EmbedError> {
        self.embed_until(texts, &AtomicBool::new(false))
    }

    /// `embed` that returns `Cancelled` before the next group once `stop` is set.
    pub(crate) fn embed_until(
        &self,
        texts: &[&str],
        stop: &AtomicBool,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
        let ids = self.encode(texts)?;
        let mut order: Vec<usize> = (0..ids.len()).collect();
        order.sort_by_key(|&index| ids.get(index).map_or(0, Vec::len));
        let mut vectors: Vec<Option<Vec<f32>>> = vec![None; ids.len()];
        for group in groups(&order, &ids, self.budget) {
            if stop.load(Ordering::Relaxed) {
                return Err(EmbedError::Cancelled);
            }
            let rows: Vec<&[u32]> = group
                .iter()
                .filter_map(|&index| ids.get(index).map(Vec::as_slice))
                .collect();
            let embedded = self.forward(&rows)?;
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

    fn forward(&self, rows: &[&[u32]]) -> Result<Vec<Vec<f32>>, EmbedError> {
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
        let mut vectors = in_pool(run).map_err(inference_error)?;
        for vector in &mut vectors {
            normalize(vector)?;
        }
        Ok(vectors)
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

/// Scales to length 1; a zero or non-finite vector is refused, not stored.
pub(crate) fn normalize(vector: &mut [f32]) -> Result<(), EmbedError> {
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if !norm.is_finite() || norm <= f32::EPSILON || vector.iter().any(|v| !v.is_finite()) {
        return Err(EmbedError::ResponseInvalid("not-finite"));
    }
    for value in vector.iter_mut() {
        *value /= norm;
    }
    Ok(())
}
