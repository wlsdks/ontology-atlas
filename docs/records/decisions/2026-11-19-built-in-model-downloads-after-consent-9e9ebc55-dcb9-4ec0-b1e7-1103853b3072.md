---
id: 9e9ebc55-dcb9-4ec0-b1e7-1103853b3072
date: 2026-11-19
---
## 2026-11-19 — The built-in model downloads only after a dialog the person approves

**Why**: owner, 2026-11-19: one click, after a dialog that asks. Against official fp32: int8: cosine 0.974, top-8 overlap 83%; q4f16 needs `MatMulNBits`, which has a public exploit; fp16 1.0000, 99.8%. bge-m3 is MIT on its card (FlagEmbedding: "MIT License, Copyright (c) 2022 staoxiao"); no LICENSE file ships.
**Prior**: e4505512, source 1.
**Decision**: nothing downloads before "Download and prepare" in the first press's dialog; Cancel is default. It states what the model does; name, maker, licence; 2.27 GB download, 1.14 GB kept, and where; ~1.8 GB memory while indexing; the hosts; that no folder content is sent; delete in Settings. HTTPS only, to `huggingface.co` and its signed redirect to `us.aws.cdn.hf.co`; any other host stops it. Runtime: candle (MIT/Apache, ~2.2 MB). It fetches `BAAI/bge-m3@5617a9f61b028005a4858fdac845db406aefb181` `pytorch_model.bin` (b5e0ce3470abf5ef3831aa1bd5553b486803e83251590ab7ff35a117cf6aad38) and `tokenizer.json`; each SHA-256 is compiled in, checked before candle reads it; a mismatch keeps nothing. candle parses the pickle without running code; f16 safetensors are kept, the `.bin` deleted. Why 2.27 GB: only BAAI's file carries its provenance; the one fp16 file is a third-party ONNX export needing ONNX Runtime (+33 MB, 3.7 CPU-s/passage, 3.5 GB peak); converting here keeps BAAI's bytes and stores 1.14 GB. Fallback: ort with that export (`Xenova/bge-m3` `onnx/model_fp16.onnx`), pinned alike. The licence screen shows the MIT text, a model-card link and "BGE M3-Embedding" (Chen, Xiao, Zhang, Luo, Lian, Liu, 2024), https://arxiv.org/abs/2402.03216. Downloads write `model-download` lines; the hosts are outbound rows.
**Dissent**: one more dialog; conversion once peaks at 2.1 GB RAM, 3.4 GB disk.
**Falsifier**: candle adds over 30 MB; a byte downloads before the press; a kept file's SHA-256 is not the compiled one; a quantised file under 1.14 GB reaches cosine ≥ 0.99 with standard ops; indexing memory leaves 1–2 GB.
**Owner**: Stark
