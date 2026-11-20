// Frames over the worker's stdin and stdout: a little-endian u32 length, then JSON,
// or vectors as raw little-endian f32. Each side refuses a frame over its cap
// before reading its body.

use super::pins;
use crate::llm::embed::{EmbedError, MAX_BATCH_BYTES, MAX_BATCH_PASSAGES, MAX_DIMENSIONS};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};

/// The worker's first frame; anything else first means it is not our worker.
pub(crate) const PROTOCOL: &str = "atlas-embed-worker/1";

/// A full batch with every byte escaped as `\u00XX` still fits.
pub(crate) const MAX_REQUEST_BYTES: usize = MAX_BATCH_BYTES * 6 + 4 * 1024;
/// A full batch of the pinned model's vectors and the answer's header.
pub(crate) const MAX_ANSWER_BYTES: usize = MAX_BATCH_PASSAGES * pins::DIMENSIONS * 4 + 4 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "kebab-case")]
pub(crate) enum Request {
    /// Load the prepared model from the store.
    Load {
        id: u64,
    },
    /// Convert the store's downloaded weights to its converting file.
    Convert {
        id: u64,
    },
    /// Load the store's two files without a manifest and compare them with the
    /// reference vectors built into the worker.
    Check {
        id: u64,
    },
    /// Embed passages, or one question; the texts are only tokenised.
    Embed {
        id: u64,
        texts: Vec<String>,
        question: bool,
    },
    /// Give up request `id` at its next group.
    Stop {
        id: u64,
    },
    Exit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "reply", rename_all = "kebab-case")]
pub(crate) enum Reply {
    Hello {
        protocol: String,
    },
    Loaded {
        id: u64,
        device: String,
        dtype: String,
        memory_bytes: u64,
    },
    Checked {
        id: u64,
    },
    /// Bytes of the converted file written so far, before `Converted`.
    Progress {
        id: u64,
        done: u64,
        total: u64,
    },
    Converted {
        id: u64,
    },
    /// `code` is an `EmbedError` code; id 0 answers a request that could not be read.
    Failed {
        id: u64,
        code: String,
        detail: String,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Answer {
    Reply(Reply),
    Vectors { id: u64, vectors: Vec<Vec<f32>> },
}

impl Answer {
    pub(crate) fn id(&self) -> Option<u64> {
        match self {
            Self::Reply(Reply::Hello { .. }) => None,
            Self::Reply(
                Reply::Loaded { id, .. }
                | Reply::Checked { id }
                | Reply::Progress { id, .. }
                | Reply::Converted { id }
                | Reply::Failed { id, .. },
            )
            | Self::Vectors { id, .. } => Some(*id),
        }
    }
}

const JSON: u8 = b'J';
const VECTORS: u8 = b'V';
const VECTORS_HEADER: usize = 1 + 8 + 4 + 4;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum FrameError {
    /// The length prefix names more than the cap; nothing after it was read.
    TooLarge,
    /// The stream ended inside a frame, or reading failed.
    Broken,
}

pub(crate) fn write_frame(out: &mut dyn Write, payload: &[u8]) -> std::io::Result<()> {
    let len = u32::try_from(payload.len())
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
    out.write_all(&len.to_le_bytes())?;
    out.write_all(payload)?;
    out.flush()
}

/// The next frame, or `None` when the stream ends cleanly between frames.
pub(crate) fn read_frame(input: &mut dyn Read, cap: usize) -> Result<Option<Vec<u8>>, FrameError> {
    let mut len = [0u8; 4];
    let mut filled = 0;
    while filled < len.len() {
        let slot = len.get_mut(filled..).ok_or(FrameError::Broken)?;
        match input.read(slot) {
            Ok(0) if filled == 0 => return Ok(None),
            Ok(0) => return Err(FrameError::Broken),
            Ok(read) => filled += read,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => return Err(FrameError::Broken),
        }
    }
    let len = u32::from_le_bytes(len) as usize;
    if len > cap {
        return Err(FrameError::TooLarge);
    }
    let mut payload = vec![0u8; len];
    input
        .read_exact(&mut payload)
        .map_err(|_| FrameError::Broken)?;
    Ok(Some(payload))
}

pub(crate) fn encode_request(request: &Request) -> Vec<u8> {
    serde_json::to_vec(request).unwrap_or_default()
}

pub(crate) fn decode_request(payload: &[u8]) -> Option<Request> {
    serde_json::from_slice(payload).ok()
}

pub(crate) fn encode_reply(reply: &Reply) -> Vec<u8> {
    let mut out = vec![JSON];
    out.extend(serde_json::to_vec(reply).unwrap_or_default());
    out
}

/// Every vector must have the first one's length; the reader checks the rest.
pub(crate) fn encode_vectors(id: u64, vectors: &[Vec<f32>]) -> Vec<u8> {
    let dimensions = vectors.first().map_or(0, Vec::len);
    let mut out = Vec::with_capacity(VECTORS_HEADER + vectors.len() * dimensions * 4);
    out.push(VECTORS);
    out.extend(id.to_le_bytes());
    out.extend((vectors.len() as u32).to_le_bytes());
    out.extend((dimensions as u32).to_le_bytes());
    for value in vectors.iter().flatten() {
        out.extend(value.to_le_bytes());
    }
    out
}

pub(crate) fn decode_answer(payload: &[u8]) -> Result<Answer, EmbedError> {
    let invalid = EmbedError::ResponseInvalid("frame");
    match payload.split_first() {
        Some((&JSON, json)) => serde_json::from_slice(json)
            .map(Answer::Reply)
            .map_err(|_| invalid),
        Some((&VECTORS, _)) => {
            let word = |at: usize, width: usize| -> Option<u64> {
                let bytes = payload.get(at..at + width)?;
                let mut wide = [0u8; 8];
                wide.get_mut(..width)?.copy_from_slice(bytes);
                Some(u64::from_le_bytes(wide))
            };
            let (Some(id), Some(count), Some(dimensions)) = (word(1, 8), word(9, 4), word(13, 4))
            else {
                return Err(invalid);
            };
            let (count, dimensions) = (count as usize, dimensions as usize);
            if count > MAX_BATCH_PASSAGES || dimensions > MAX_DIMENSIONS {
                return Err(invalid);
            }
            let body = payload.get(VECTORS_HEADER..).ok_or(invalid.clone())?;
            if body.len() != count * dimensions * 4 {
                return Err(invalid);
            }
            let values: Vec<f32> = body
                .as_chunks::<4>()
                .0
                .iter()
                .map(|bytes| f32::from_le_bytes(*bytes))
                .collect();
            let vectors = if dimensions == 0 {
                vec![Vec::new(); count]
            } else {
                values.chunks(dimensions).map(<[f32]>::to_vec).collect()
            };
            Ok(Answer::Vectors { id, vectors })
        }
        _ => Err(invalid),
    }
}
