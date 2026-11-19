---
id: 9e9ebc55-dcb9-4ec0-b1e7-1103853b3072
date: 2026-11-19
---
## 2026-11-19 — The built-in model downloads only after a dialog the person approves

**Why**: owner, 2026-11-19: one-click download approved on condition a dialog explains it and asks first. Checked 2026-11-19: BAAI/bge-m3 is MIT on its card at 5617a9f; FlagEmbedding's LICENSE is "MIT License, Copyright (c) 2022 staoxiao"; base xlm-roberta-large is MIT; the Hugging Face repo has no LICENSE file.
**Prior**: e4505512, source 1.
**Decision**: nothing downloads until "Download and prepare" in a dialog opened by the first press; Cancel is the default. It states: a model that turns text into numbers so passages of similar meaning are found; name, maker, licence; exact download size, disk space and folder; the host; that no folder content is sent; memory while preparing; delete in Settings. Runtime: pure-Rust or ONNX, chosen by measured size. The file is the smallest quantised bge-m3 whose results hold against fp32: recall@8 within 1 point, cross-language within 2, mean cosine ≥ 0.99. Its repo, commit and SHA-256 are compiled in, never fetched from the host; a mismatch keeps nothing. A third-party conversion must inherit MIT and be pinned. The licence screen keeps the MIT text with that copyright line, a model-card link (Hugging Face terms forbid dropping the reference) and the paper: "BGE M3-Embedding" (Chen, Xiao, Zhang, Luo, Lian, Liu, 2024), arXiv 2402.03216, https://arxiv.org/abs/2402.03216. Downloads write `model-download` lines; the host is an outbound row.
**Dissent**: one more dialog before the first search, for a person who already chose to press.
**Falsifier**: the runtime adds more than 30 MB to the installer; any byte downloads before the press; a kept file's SHA-256 differs from the compiled one; the shipped file misses fp32 by more than those margins.
**Owner**: Stark
