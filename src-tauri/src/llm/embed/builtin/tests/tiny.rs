//! A tiny XLM-RoBERTa checkpoint in the publisher's format, written here.

use super::super::infer::{self, Encoder};
use super::*;
use candle_core::Tensor;
use candle_nn::VarBuilder;
use candle_transformers::models::xlm_roberta::{Config, XLMRobertaModel};
use std::collections::HashMap;
use std::io::Write as _;

pub(super) const TINY_CONFIG: &str = r#"{
  "hidden_size": 8, "layer_norm_eps": 1e-05, "attention_probs_dropout_prob": 0.1,
  "hidden_dropout_prob": 0.1, "num_attention_heads": 2, "position_embedding_type": "absolute",
  "intermediate_size": 16, "hidden_act": "gelu", "num_hidden_layers": 2, "vocab_size": 24,
  "max_position_embeddings": 40, "type_vocab_size": 1, "pad_token_id": 1
}"#;

pub(super) const WORDS: [&str; 16] = [
    "search",
    "meaning",
    "invoice",
    "partner",
    "monthly",
    "weekly",
    "dawn",
    "wave",
    "depot",
    "검색",
    "의미",
    "문서",
    "찾기",
    "한국어",
    "정산",
    "배송",
];

fn tokenizer_json() -> String {
    let mut vocab = serde_json::Map::new();
    for (id, token) in ["<s>", "<pad>", "</s>", "<unk>"].iter().enumerate() {
        vocab.insert((*token).into(), id.into());
    }
    for (offset, word) in WORDS.iter().enumerate() {
        vocab.insert((*word).into(), (4 + offset).into());
    }
    let special = |id: u32, content: &str| {
        serde_json::json!({ "id": id, "content": content, "single_word": false, "lstrip": false,
            "rstrip": false, "normalized": false, "special": true })
    };
    serde_json::json!({
        "version": "1.0",
        "truncation": null,
        "padding": null,
        "added_tokens": [special(0, "<s>"), special(1, "<pad>"), special(2, "</s>"), special(3, "<unk>")],
        "normalizer": null,
        "pre_tokenizer": { "type": "Whitespace" },
        "post_processor": {
            "type": "TemplateProcessing",
            "single": [
                { "SpecialToken": { "id": "<s>", "type_id": 0 } },
                { "Sequence": { "id": "A", "type_id": 0 } },
                { "SpecialToken": { "id": "</s>", "type_id": 0 } }
            ],
            "pair": [
                { "SpecialToken": { "id": "<s>", "type_id": 0 } },
                { "Sequence": { "id": "A", "type_id": 0 } },
                { "SpecialToken": { "id": "</s>", "type_id": 0 } },
                { "Sequence": { "id": "B", "type_id": 0 } },
                { "SpecialToken": { "id": "</s>", "type_id": 0 } }
            ],
            "special_tokens": {
                "<s>": { "id": "<s>", "ids": [0], "tokens": ["<s>"] },
                "</s>": { "id": "</s>", "ids": [2], "tokens": ["</s>"] }
            }
        },
        "decoder": null,
        "model": { "type": "WordLevel", "vocab": vocab, "unk_token": "<unk>" }
    })
    .to_string()
}

pub(super) fn config() -> Config {
    infer::config(TINY_CONFIG).unwrap()
}

/// One stored tensor; `long` writes int64 storage, as a position-id buffer would be.
#[derive(Clone)]
pub(super) struct Entry {
    pub name: String,
    pub shape: Vec<usize>,
    pub long: bool,
}

/// Every tensor the tiny configuration expects, pooler included.
pub(super) fn entries() -> Vec<Entry> {
    super::super::convert::expected_tensors(&config())
        .into_iter()
        .map(|(name, shape)| Entry {
            name,
            shape,
            long: false,
        })
        .collect()
}

fn values(name: &str, count: usize, seed: u32) -> Vec<f32> {
    let mut state = seed;
    (0..count)
        .map(|_| {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let noise = (state >> 8) as f32 / (1u32 << 24) as f32 - 0.5;
            if name.ends_with("LayerNorm.weight") {
                1.0 + 0.1 * noise
            } else {
                noise
            }
        })
        .collect()
}

/// Just the pickle opcodes a PyTorch checkpoint uses: a dict of
/// `_rebuild_tensor_v2(storage, offset, size, stride, False, OrderedDict())`.
fn pickle_state_dict(entries: &[Entry]) -> Vec<u8> {
    fn int(out: &mut Vec<u8>, value: usize) {
        if value < 256 {
            out.extend_from_slice(&[b'K', value as u8]);
        } else {
            out.push(b'J');
            out.extend_from_slice(&(value as i32).to_le_bytes());
        }
    }
    fn text(out: &mut Vec<u8>, value: &str) {
        out.push(b'X');
        out.extend_from_slice(&(value.len() as u32).to_le_bytes());
        out.extend_from_slice(value.as_bytes());
    }
    fn global(out: &mut Vec<u8>, module: &str, name: &str) {
        out.push(b'c');
        out.extend_from_slice(format!("{module}\n{name}\n").as_bytes());
    }
    let mut out = vec![0x80, 2, b'}', b'('];
    for (index, entry) in entries.iter().enumerate() {
        let shape = &entry.shape;
        text(&mut out, &entry.name);
        global(&mut out, "torch._utils", "_rebuild_tensor_v2");
        out.push(b'(');
        out.push(b'(');
        text(&mut out, "storage");
        let storage = if entry.long {
            "LongStorage"
        } else {
            "FloatStorage"
        };
        global(&mut out, "torch", storage);
        text(&mut out, &index.to_string());
        text(&mut out, "cpu");
        int(&mut out, shape.iter().product());
        out.extend_from_slice(b"tQ");
        int(&mut out, 0);
        out.push(b'(');
        for &dim in shape {
            int(&mut out, dim);
        }
        out.push(b't');
        out.push(b'(');
        for axis in 0..shape.len() {
            int(&mut out, shape.iter().skip(axis + 1).product());
        }
        out.push(b't');
        out.push(0x89);
        global(&mut out, "collections", "OrderedDict");
        out.extend_from_slice(b")R");
        out.extend_from_slice(b"tR");
    }
    out.extend_from_slice(b"u.");
    out
}

/// Writes the checkpoint and returns its float tensors as written.
pub(super) fn write_checkpoint(path: &Path, entries: &[Entry]) -> HashMap<String, Tensor> {
    let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("archive/data.pkl", stored).unwrap();
    zip.write_all(&pickle_state_dict(entries)).unwrap();
    let mut tensors = HashMap::new();
    for (index, entry) in entries.iter().enumerate() {
        let count = entry.shape.iter().product();
        zip.start_file(format!("archive/data/{index}"), stored)
            .unwrap();
        if entry.long {
            for value in 0..count as i64 {
                zip.write_all(&value.to_le_bytes()).unwrap();
            }
            continue;
        }
        let values = values(&entry.name, count, index as u32 + 1);
        for value in &values {
            zip.write_all(&value.to_le_bytes()).unwrap();
        }
        tensors.insert(
            entry.name.clone(),
            Tensor::from_vec(values, entry.shape.as_slice(), &Device::Cpu).unwrap(),
        );
    }
    zip.finish().unwrap();
    tensors
}

pub(super) struct Tiny {
    pub dir: PathBuf,
    pub checkpoint: PathBuf,
    pub tokenizer: PathBuf,
    pub tensors: HashMap<String, Tensor>,
}

impl Tiny {
    pub fn clean(&self) {
        fs::remove_dir_all(&self.dir).ok();
    }
}

pub(super) fn tiny(tag: &str) -> Tiny {
    let dir = temp_dir(tag);
    let checkpoint = dir.join("pytorch_model.bin");
    let tokenizer = dir.join("tokenizer.json");
    fs::write(&tokenizer, tokenizer_json()).unwrap();
    let tensors = write_checkpoint(&checkpoint, &entries());
    Tiny {
        dir,
        checkpoint,
        tokenizer,
        tensors,
    }
}

pub(super) fn encoder_from(vb: VarBuilder, tokenizer: &Path, max_tokens: usize) -> Encoder {
    let config = config();
    let model = XLMRobertaModel::new(&config, vb).unwrap();
    Encoder::from_parts(
        infer::tokenizer(tokenizer, max_tokens).unwrap(),
        model,
        Device::Cpu,
        config.pad_token_id,
        max_tokens,
    )
}

/// The written f32 tensors, run on the CPU in f32.
pub(super) fn encoder(tiny: &Tiny) -> Encoder {
    let vb = VarBuilder::from_tensors(tiny.tensors.clone(), DType::F32, &Device::Cpu);
    encoder_from(vb, &tiny.tokenizer, 32)
}

pub(super) fn sentences() -> Vec<String> {
    (0..23)
        .map(|n| {
            (0..(1 + n * 3 % 17))
                .map(|k| WORDS[(n * 7 + k * 5) % WORDS.len()])
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect()
}

/// Reference vectors for `check`, from the f32 encoder, in the pinned file's format.
pub(super) fn references(tiny: &Tiny, floor: f32) -> String {
    let encoder = encoder(tiny);
    let texts = ["search meaning", "검색 의미 문서", "dawn wave depot"];
    let vectors = encoder.embed(&texts, false).unwrap();
    let probes: Vec<serde_json::Value> = texts
        .iter()
        .zip(vectors)
        .map(|(text, vector)| serde_json::json!({ "text": text, "vector": vector }))
        .collect();
    serde_json::json!({ "floor": floor, "probes": probes }).to_string()
}
