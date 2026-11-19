---
id: 9e9ebc55-dcb9-4ec0-b1e7-1103853b3072
date: 2026-11-19
---
## 2026-11-19 — The built-in model downloads only after a dialog the person approves

**Why**: owner, 2026-11-19: one click after a dialog explains and asks. Measured against official fp32: int8 exports: cosine 0.974, top-8 overlap 83%; q4f16 needs `MatMulNBits`, with a public out-of-bounds exploit; fp16: cosine 1.0000, overlap 99.8%. bge-m3 is MIT on its card (FlagEmbedding: "MIT License, Copyright (c) 2022 staoxiao"); the repo ships no LICENSE file.
**Prior**: e4505512, source 1.
**Decision**: nothing downloads until "Download and prepare" in a dialog opened by the first press; Cancel is the default. It states what the model does; name, maker, licence; download 2.27 GB, kept 1.14 GB, and where; about 1.8 GB of memory while indexing; host huggingface.co, redirected to its CDN; that no folder content is sent; delete in Settings. Runtime: candle (MIT/Apache, about 2.2 MB). It fetches `BAAI/bge-m3@5617a9f61b028005a4858fdac845db406aefb181` `pytorch_model.bin` (SHA-256 b5e0ce3470abf5ef3831aa1bd5553b486803e83251590ab7ff35a117cf6aad38) and `tokenizer.json`, every SHA-256 compiled in; a mismatch keeps nothing. candle reads the pickle without running code; the app keeps f16 safetensors and deletes the `.bin`. Indexing runs in the background and resumes; search works mid-index. Fallback: ort (Microsoft's library) with `Xenova/bge-m3@4de13258303883538bd53b696b452bf8099f0858` `onnx/model_fp16.onnx` (4f1a646a3d4f39985589e9991a717044ede8278617fe55e3d246838bc05055e9). The licence screen shows the MIT text, a model-card link and "BGE M3-Embedding" (Chen, Xiao, Zhang, Luo, Lian, Liu, 2024), https://arxiv.org/abs/2402.03216. Downloads write `model-download` lines; the host is an outbound row.
**Dissent**: one more dialog; conversion once peaks at 2.1 GB RAM, 3.4 GB disk; 100k passages: 2.3 h on Metal.
**Falsifier**: candle adds over 30 MB to the installer; a byte downloads before the press; a kept file's SHA-256 differs from the compiled one; a quantised file under 1.14 GB reaches cosine ≥ 0.99 with standard ops; indexing memory leaves 1–2 GB.
**Owner**: Stark
