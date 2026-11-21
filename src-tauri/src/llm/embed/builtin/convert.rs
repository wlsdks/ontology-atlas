// candle's pickle reader treats `pytorch_model.bin` as data and calls nothing in it.
// Its index (names, dtypes, shapes) must equal what the compiled-in configuration
// expects before any tensor is read; then the writer asks for one tensor at a time.

use super::super::EmbedError;
use candle_core::pickle::PthTensors;
use candle_core::{CpuStorage, DType, Storage, Tensor};
use candle_transformers::models::xlm_roberta::Config;
use safetensors::{Dtype, View};
use std::borrow::Cow;
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

/// Only the encoder's tensors are kept; the pooler head is not part of the dense
/// embedding.
const KEPT_PREFIXES: [&str; 2] = ["embeddings.", "encoder."];

fn convert_error(error: impl std::fmt::Display) -> EmbedError {
    EmbedError::Convert(crate::coded_error::squeeze(&error.to_string()))
}

/// Every tensor an XLM-RoBERTa checkpoint of this configuration holds, with its
/// shape; `pooler.` ones are allowed and dropped.
pub(crate) fn expected_tensors(config: &Config) -> BTreeMap<String, Vec<usize>> {
    let (h, i) = (config.hidden_size, config.intermediate_size);
    let mut shapes = BTreeMap::new();
    let mut add = |name: String, shape: Vec<usize>| {
        shapes.insert(name, shape);
    };
    add(
        "embeddings.word_embeddings.weight".into(),
        vec![config.vocab_size, h],
    );
    add(
        "embeddings.position_embeddings.weight".into(),
        vec![config.max_position_embeddings, h],
    );
    add(
        "embeddings.token_type_embeddings.weight".into(),
        vec![config.type_vocab_size, h],
    );
    for norm in ["embeddings.LayerNorm", "pooler.dense"] {
        add(format!("{norm}.bias"), vec![h]);
    }
    add("embeddings.LayerNorm.weight".into(), vec![h]);
    add("pooler.dense.weight".into(), vec![h, h]);
    for layer in 0..config.num_hidden_layers {
        let at = |name: &str| format!("encoder.layer.{layer}.{name}");
        for part in [
            "attention.self.query",
            "attention.self.key",
            "attention.self.value",
            "attention.output.dense",
        ] {
            add(at(&format!("{part}.weight")), vec![h, h]);
            add(at(&format!("{part}.bias")), vec![h]);
        }
        for norm in ["attention.output.LayerNorm", "output.LayerNorm"] {
            add(at(&format!("{norm}.weight")), vec![h]);
            add(at(&format!("{norm}.bias")), vec![h]);
        }
        add(at("intermediate.dense.weight"), vec![i, h]);
        add(at("intermediate.dense.bias"), vec![i]);
        add(at("output.dense.weight"), vec![h, i]);
        add(at("output.dense.bias"), vec![h]);
    }
    shapes
}

/// Refuses on the first unknown name, non-float dtype, wrong shape or missing
/// encoder tensor; the index is all candle has read so far.
fn check_index(pth: &PthTensors, config: &Config) -> Result<Vec<(String, Vec<usize>)>, EmbedError> {
    let expected = expected_tensors(config);
    let limit: usize = expected
        .values()
        .map(|shape| shape.iter().product::<usize>() * DType::F32.size_in_bytes())
        .sum();
    let mut index: Vec<_> = pth.tensor_infos().iter().collect();
    index.sort_by(|a, b| a.0.cmp(b.0));
    let mut bytes = 0usize;
    for (name, info) in &index {
        let Some(shape) = expected.get(*name) else {
            return Err(EmbedError::Convert(format!("unknown {}", short(name))));
        };
        if !matches!(info.dtype, DType::F32 | DType::F16 | DType::BF16) {
            return Err(EmbedError::Convert(format!("dtype {name}")));
        }
        if info.layout.dims() != shape.as_slice() {
            return Err(EmbedError::Convert(format!("shape {name}")));
        }
        bytes = bytes.saturating_add(info.layout.shape().elem_count() * info.dtype.size_in_bytes());
    }
    let kept: Vec<(String, Vec<usize>)> = expected
        .into_iter()
        .filter(|(name, _)| KEPT_PREFIXES.iter().any(|prefix| name.starts_with(prefix)))
        .collect();
    if let Some((name, _)) = kept
        .iter()
        .find(|(name, _)| !pth.tensor_infos().contains_key(name))
    {
        return Err(EmbedError::Convert(format!("missing {name}")));
    }
    if bytes > limit {
        return Err(EmbedError::Convert("too-large".into()));
    }
    Ok(kept)
}

fn short(text: &str) -> String {
    text.chars()
        .filter(|ch| !ch.is_control())
        .take(120)
        .collect()
}

struct Shared<'a> {
    error: Option<EmbedError>,
    done: u64,
    total: u64,
    cancel: &'a AtomicBool,
    on_progress: &'a mut dyn FnMut(u64, u64),
}

struct Lazy<'a, 'p> {
    pth: &'p PthTensors,
    name: String,
    shape: Vec<usize>,
    shared: &'p RefCell<Shared<'a>>,
}

/// The little-endian bytes of an f16 tensor on the CPU, read from its storage.
fn f16_bytes(tensor: &Tensor) -> Result<Vec<u8>, EmbedError> {
    let (storage, layout) = tensor.storage_and_layout();
    let Storage::Cpu(CpuStorage::F16(values)) = &*storage else {
        return Err(EmbedError::Convert("storage".into()));
    };
    let start = layout.start_offset();
    let values = values
        .get(start..start + layout.shape().elem_count())
        .ok_or_else(|| EmbedError::Convert("storage".into()))?;
    Ok(values
        .iter()
        .flat_map(|value| value.to_bits().to_le_bytes())
        .collect())
}

impl Lazy<'_, '_> {
    fn load(&self) -> Result<Vec<u8>, EmbedError> {
        let tensor = self
            .pth
            .get(&self.name)
            .map_err(convert_error)?
            .ok_or_else(|| EmbedError::Convert(format!("missing {}", self.name)))?;
        let half = tensor
            .to_dtype(DType::F16)
            .and_then(|half| half.contiguous())
            .map_err(convert_error)?;
        drop(tensor);
        if half.dims() != self.shape.as_slice() {
            return Err(EmbedError::Convert(format!("shape {}", self.name)));
        }
        let bytes = f16_bytes(&half)?;
        if bytes.len() != self.data_len() {
            return Err(EmbedError::Convert(format!("length {}", self.name)));
        }
        Ok(bytes)
    }
}

impl View for Lazy<'_, '_> {
    fn dtype(&self) -> Dtype {
        Dtype::F16
    }

    fn shape(&self) -> &[usize] {
        &self.shape
    }

    /// `View` cannot fail, so an error is kept for after the write, the remaining
    /// tensors are written empty, and the caller deletes the result.
    fn data(&self) -> Cow<'_, [u8]> {
        let skip = {
            let mut shared = self.shared.borrow_mut();
            if shared.error.is_none() && shared.cancel.load(Ordering::Relaxed) {
                shared.error = Some(EmbedError::Cancelled);
            }
            shared.error.is_some()
        };
        if skip {
            return Cow::Owned(Vec::new());
        }
        let loaded = self.load();
        let mut shared = self.shared.borrow_mut();
        match loaded {
            Ok(bytes) => {
                shared.done += bytes.len() as u64;
                let (done, total) = (shared.done, shared.total);
                (shared.on_progress)(done, total);
                Cow::Owned(bytes)
            }
            Err(error) => {
                shared.error = Some(error);
                Cow::Owned(Vec::new())
            }
        }
    }

    fn data_len(&self) -> usize {
        self.shape.iter().product::<usize>() * 2
    }
}

/// Writes `out`; on any failure or a stop, `out` does not exist afterwards. The
/// writer's own temporary file is a hidden sibling of `out`, which the store's
/// sweep removes if the process ends mid-write.
pub(crate) fn convert(
    weights: &Path,
    config: &Config,
    out: &Path,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(u64, u64),
) -> Result<(), EmbedError> {
    let pth = PthTensors::new(weights, None).map_err(convert_error)?;
    let names = check_index(&pth, config)?;
    let total = names
        .iter()
        .map(|(_, shape)| shape.iter().product::<usize>() as u64 * 2)
        .sum();
    let shared = RefCell::new(Shared {
        error: None,
        done: 0,
        total,
        cancel,
        on_progress,
    });
    let views: Vec<(String, Lazy<'_, '_>)> = names
        .into_iter()
        .map(|(name, shape)| {
            let view = Lazy {
                pth: &pth,
                name: name.clone(),
                shape,
                shared: &shared,
            };
            (name, view)
        })
        .collect();
    let written = safetensors::serialize_to_file(views, None, out);
    let failed = shared.into_inner().error;
    match (written, failed) {
        (Ok(()), None) => Ok(()),
        (_, Some(error)) => {
            super::disk::remove_if_present(out)?;
            Err(error)
        }
        (Err(error), None) => {
            super::disk::remove_if_present(out)?;
            Err(convert_error(error))
        }
    }
}
