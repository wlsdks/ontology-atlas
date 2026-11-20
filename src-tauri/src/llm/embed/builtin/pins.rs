// The one model the app downloads, pinned to a commit with each file's size and
// SHA-256; anything else the network answers is refused. The architecture is
// compiled in too, so no downloaded file decides the shape of the network.

/// One file of the pinned commit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PinnedFile {
    pub name: &'static str,
    pub bytes: u64,
    pub sha256: &'static str,
}

pub(crate) const MODEL_NAME: &str = "bge-m3";
pub(crate) const REPOSITORY: &str = "BAAI/bge-m3";
pub(crate) const REVISION: &str = "5617a9f61b028005a4858fdac845db406aefb181";

pub(crate) const WEIGHTS: PinnedFile = PinnedFile {
    name: "pytorch_model.bin",
    bytes: 2_271_145_830,
    sha256: "b5e0ce3470abf5ef3831aa1bd5553b486803e83251590ab7ff35a117cf6aad38",
};

pub(crate) const TOKENIZER: PinnedFile = PinnedFile {
    name: "tokenizer.json",
    bytes: 17_098_108,
    sha256: "21106b6d7dab2952c1d496fb21d5dc9db75c28ed361a05f5020bbba27810dd08",
};

/// Downloaded in this order: the small file first, so a wrong network fails fast.
pub(crate) const DOWNLOADS: [PinnedFile; 2] = [TOKENIZER, WEIGHTS];

/// The dense embedding's width.
pub(crate) const DIMENSIONS: usize = 1_024;

/// The f16 conversion's size, the same on every run, for the free-space check.
pub(crate) const CONVERTED_BYTES: u64 = 1_133_454_928;

/// Reference texts with the vectors Ollama's own build of bge-m3 gave them, and the
/// least cosine the converted model must reach on each.
pub(crate) const REFERENCES_JSON: &str = include_str!("reference-vectors.json");

/// `config.json` at the pinned commit, minus fields the encoder does not read.
pub(crate) const CONFIG_JSON: &str = r#"{
  "hidden_size": 1024,
  "layer_norm_eps": 1e-05,
  "attention_probs_dropout_prob": 0.1,
  "hidden_dropout_prob": 0.1,
  "num_attention_heads": 16,
  "position_embedding_type": "absolute",
  "intermediate_size": 4096,
  "hidden_act": "gelu",
  "num_hidden_layers": 24,
  "vocab_size": 250002,
  "max_position_embeddings": 8194,
  "type_vocab_size": 1,
  "pad_token_id": 1
}"#;

/// `https://huggingface.co/<repository>/resolve/<revision>/<file>`.
pub(crate) fn resolve_url(file: &PinnedFile) -> String {
    format!(
        "https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{}",
        file.name
    )
}
