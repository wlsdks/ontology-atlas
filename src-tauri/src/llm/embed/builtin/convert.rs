// candle's pickle reader treats `pytorch_model.bin` as data and calls nothing in it.
// The writer asks for each tensor as it reaches it, so the peak is the largest
// tensor in f32 plus its f16 copy, not the whole model.

use super::super::EmbedError;
use candle_core::pickle::PthTensors;
use candle_core::DType;
use safetensors::{Dtype, View};
use std::borrow::Cow;
use std::cell::RefCell;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

/// Only the encoder's tensors are kept; the pooler head is not part of the dense
/// embedding.
const KEPT_PREFIXES: [&str; 2] = ["embeddings.", "encoder."];

fn convert_error(error: impl std::fmt::Display) -> EmbedError {
    EmbedError::Convert(crate::errors::squeeze(&error.to_string()))
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
        let bytes = View::data(&half).into_owned();
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

    /// `View` cannot fail, so an error is kept for after the write and the rest of
    /// the file is left short; the caller then deletes it.
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

/// Writes `out`; on any failure or a stop, `out` does not exist afterwards.
pub(crate) fn convert(
    weights: &Path,
    out: &Path,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(u64, u64),
) -> Result<(), EmbedError> {
    let pth = PthTensors::new(weights, None).map_err(convert_error)?;
    let mut names: Vec<(String, Vec<usize>)> = pth
        .tensor_infos()
        .iter()
        .filter(|(name, _)| KEPT_PREFIXES.iter().any(|prefix| name.starts_with(prefix)))
        .map(|(name, info)| (name.clone(), info.layout.dims().to_vec()))
        .collect();
    if names.is_empty() {
        return Err(EmbedError::Convert("no-tensors".into()));
    }
    if let Some((name, _)) = pth.tensor_infos().iter().find(|(name, info)| {
        KEPT_PREFIXES.iter().any(|prefix| name.starts_with(prefix))
            && !matches!(info.dtype, DType::F32 | DType::F16 | DType::BF16)
    }) {
        return Err(EmbedError::Convert(format!("dtype {name}")));
    }
    names.sort();
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
            super::download::remove_if_present(out)?;
            Err(error)
        }
        (Err(error), None) => {
            super::download::remove_if_present(out)?;
            Err(convert_error(error))
        }
    }
}
