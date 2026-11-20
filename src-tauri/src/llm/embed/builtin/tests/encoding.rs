use super::super::convert;
use super::super::infer::{self, groups, nfc, normalize, Budget, Encoder};
use super::tiny;
use super::*;

#[test]
fn a_batch_equals_its_passages_embedded_one_by_one() {
    let tiny = tiny::tiny("batch");
    // A budget this small splits the batch into several padded groups.
    let encoder = tiny::encoder(&tiny).with_budget(Budget {
        tokens: 40,
        cells: 400,
    });
    let texts = tiny::sentences();
    let texts: Vec<&str> = texts.iter().map(String::as_str).collect();
    let batch = encoder.embed(&texts).unwrap();
    assert_eq!(batch.len(), texts.len());
    for (text, vector) in texts.iter().zip(&batch) {
        let alone = encoder.embed(&[text]).unwrap();
        assert!(cosine(vector, &alone[0]) >= 0.9999, "{text}");
        let norm: f32 = vector.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5);
    }
    tiny.clean();
}

#[test]
fn groups_keep_order_and_stay_within_the_budget() {
    let ids: Vec<Vec<u32>> = [3, 9, 4, 30, 12, 12, 2, 7]
        .iter()
        .map(|&len| vec![5; len])
        .collect();
    let mut order: Vec<usize> = (0..ids.len()).collect();
    order.sort_by_key(|&index| ids[index].len());
    let budget = Budget {
        tokens: 32,
        cells: 250,
    };
    let grouped = groups(&order, &ids, budget);
    let flat: Vec<usize> = grouped.iter().flatten().copied().collect();
    assert_eq!(flat, order);
    for group in &grouped {
        let width = group.iter().map(|&i| ids[i].len()).max().unwrap();
        let fits = group.len() * width <= 32 && group.len() * width * width <= 250;
        assert!(group.len() == 1 || fits, "{group:?}");
    }
    // The 12-token pair fits the token budget but not the cell budget.
    assert!(grouped
        .iter()
        .any(|group| group.len() == 1 && ids[group[0]].len() == 12));
}

#[test]
fn decomposed_hangul_embeds_exactly_like_composed_hangul() {
    let tiny = tiny::tiny("nfc");
    let encoder = tiny::encoder(&tiny);
    let composed = "검색 의미 문서 찾기 한국어";
    let decomposed: String = {
        let mut normalized = tokenizers::NormalizedString::from(composed);
        normalized.nfd();
        normalized.get().to_string()
    };
    assert_ne!(decomposed, composed);
    assert_eq!(nfc(&decomposed), composed);
    let ids = encoder.encode(&[composed, &decomposed]).unwrap();
    assert_eq!(ids[0], ids[1]);
    assert!(!ids[0].contains(&3), "a composed word fell to <unk>");
    let vectors = encoder.embed(&[composed, &decomposed]).unwrap();
    assert_eq!(vectors[0], vectors[1]);
    tiny.clean();
}

#[test]
fn a_long_passage_is_cut_at_the_token_limit() {
    let tiny = tiny::tiny("truncate");
    let encoder = tiny::encoder(&tiny);
    let long = vec!["search"; 100].join(" ");
    let ids = encoder.encode(&[&long]).unwrap();
    assert_eq!(ids[0].len(), 32);
    assert_eq!(ids[0].last(), Some(&2), "the end token survives truncation");
    assert_eq!(encoder.embed(&[&long]).unwrap()[0].len(), 8);
    tiny.clean();
}

#[test]
fn normalize_scales_to_length_one_and_refuses_zero_or_non_finite() {
    let mut vector = vec![3.0, 4.0];
    normalize(&mut vector).unwrap();
    assert_eq!(vector, [0.6, 0.8]);
    for mut bad in [
        vec![0.0, 0.0],
        vec![f32::NAN, 1.0],
        vec![f32::INFINITY, 1.0],
        vec![f32::MAX, f32::MAX],
    ] {
        assert_eq!(
            normalize(&mut bad),
            Err(EmbedError::ResponseInvalid("not-finite")),
            "{bad:?}"
        );
    }
}

#[test]
fn a_stop_ends_a_batch_between_groups() {
    let tiny = tiny::tiny("stop");
    let encoder = tiny::encoder(&tiny).with_budget(Budget {
        tokens: 8,
        cells: 64,
    });
    let texts = tiny::sentences();
    let texts: Vec<&str> = texts.iter().map(String::as_str).collect();
    let stop = AtomicBool::new(true);
    assert_eq!(
        encoder.embed_until(&texts, &stop),
        Err(EmbedError::Cancelled)
    );
    tiny.clean();
}

/// Accelerate has no f16 matmul, so a Mac runs f16 on Metal; elsewhere, Windows
/// CI included, the CPU computes it.
fn f16_device() -> Option<Device> {
    if cfg!(target_os = "macos") {
        Device::new_metal(0).ok()
    } else {
        Some(Device::Cpu)
    }
}

#[test]
fn the_f16_weights_compute_and_match_the_f32_ones() {
    let Some(device) = f16_device() else {
        eprintln!("no f16 device on this computer");
        return;
    };
    let tiny = tiny::tiny("f16");
    let out = tiny.dir.join("model-f16.safetensors");
    convert::convert(
        &tiny.checkpoint,
        &tiny::config(),
        &out,
        &never(),
        &mut |_, _| {},
    )
    .unwrap();
    let half = Encoder::load(&out, &tiny.tokenizer, &tiny::config(), device, DType::F16).unwrap();
    let reference = tiny::encoder(&tiny);
    let texts = tiny::sentences();
    let texts: Vec<&str> = texts.iter().map(String::as_str).collect();
    let a = half.embed(&texts).unwrap();
    let b = reference.embed(&texts).unwrap();
    for (x, y) in a.iter().zip(&b) {
        assert!(cosine(x, y) >= 0.99, "{}", cosine(x, y));
    }
    tiny.clean();
}

#[test]
fn the_cpu_reports_f32_and_its_memory_need() {
    let runtime = infer::runtime_of(&Device::Cpu);
    assert_eq!((runtime.device, runtime.dtype), ("cpu", "f32"));
    assert!(runtime.memory_bytes > 2_271_145_830);
}
