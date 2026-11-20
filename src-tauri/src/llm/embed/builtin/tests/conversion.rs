use super::super::convert::{self, expected_tensors};
use super::super::infer::{self, Encoder};
use super::super::pins;
use super::tiny::{self, Entry};
use super::*;

fn convert_into(checkpoint: &Path, out: &Path, cancel: &AtomicBool) -> Result<(), EmbedError> {
    convert::convert(checkpoint, &tiny::config(), out, cancel, &mut |_, _| {})
}

#[test]
fn candle_reads_the_synthetic_checkpoint_as_written() {
    let tiny = tiny::tiny("pth");
    let pth = candle_core::pickle::PthTensors::new(&tiny.checkpoint, None).unwrap();
    assert_eq!(pth.tensor_infos().len(), tiny::entries().len());
    let name = "encoder.layer.1.intermediate.dense.weight";
    let read = pth.get(name).unwrap().unwrap();
    let written = &tiny.tensors[name];
    assert_eq!(read.dims(), written.dims());
    let diff: f32 = (read - written)
        .unwrap()
        .abs()
        .unwrap()
        .sum_all()
        .unwrap()
        .to_scalar()
        .unwrap();
    assert_eq!(diff, 0.0);
    tiny.clean();
}

#[test]
fn conversion_writes_f16_encoder_tensors_whose_vectors_match_the_f32_ones() {
    let tiny = tiny::tiny("convert");
    let out = tiny.dir.join("model-f16.safetensors");
    let mut seen = Vec::new();
    convert::convert(
        &tiny.checkpoint,
        &tiny::config(),
        &out,
        &never(),
        &mut |done, total| seen.push((done, total)),
    )
    .unwrap();

    let header = safetensors::SafeTensors::read_metadata(&fs::read(&out).unwrap())
        .unwrap()
        .1;
    let names: Vec<String> = header.tensors().keys().cloned().collect();
    assert_eq!(names.len(), tiny::entries().len() - 2);
    assert!(names.iter().all(|name| !name.starts_with("pooler.")));
    assert!(header
        .tensors()
        .values()
        .all(|info| info.dtype == safetensors::Dtype::F16));
    let (done, total) = *seen.last().unwrap();
    assert_eq!(done, total);

    let converted = Encoder::load(
        &out,
        &tiny.tokenizer,
        &tiny::config(),
        Device::Cpu,
        DType::F32,
    )
    .unwrap();
    let reference = tiny::encoder(&tiny);
    let texts = tiny::sentences();
    let texts: Vec<&str> = texts.iter().map(String::as_str).collect();
    let a = converted.embed(&texts).unwrap();
    let b = reference.embed(&texts).unwrap();
    for (x, y) in a.iter().zip(&b) {
        assert_eq!(x.len(), 8);
        assert!(cosine(x, y) >= 0.999, "{}", cosine(x, y));
    }
    tiny.clean();
}

#[test]
fn a_stopped_or_failed_conversion_leaves_no_file() {
    let tiny = tiny::tiny("convert-stop");
    let out = tiny.dir.join("model-f16.safetensors");
    let result = convert_into(&tiny.checkpoint, &out, &AtomicBool::new(true));
    assert!(matches!(result, Err(EmbedError::Cancelled)));
    assert!(!out.exists());

    let not_a_checkpoint = tiny.dir.join("not.bin");
    fs::write(&not_a_checkpoint, b"not a zip").unwrap();
    let result = convert_into(&not_a_checkpoint, &out, &never());
    assert!(matches!(result, Err(EmbedError::Convert(_))));
    assert!(!out.exists());
    tiny.clean();
}

#[test]
fn the_index_must_match_the_configuration_before_any_tensor_is_read() {
    let tiny = tiny::tiny("convert-index");
    let base = tiny::entries();
    let edit = |change: &dyn Fn(&mut Vec<Entry>)| {
        let mut entries = base.clone();
        change(&mut entries);
        entries
    };
    let at = |entries: &mut Vec<Entry>, name: &str| {
        entries.iter().position(|entry| entry.name == name).unwrap()
    };
    let cases: Vec<(&str, Vec<Entry>, &str)> = vec![
        (
            "unknown",
            edit(&|entries| {
                entries.push(Entry {
                    name: "encoder.layer.9.extra.weight".into(),
                    shape: vec![8],
                    long: false,
                })
            }),
            "unknown encoder.layer.9.extra.weight",
        ),
        (
            "integer",
            edit(&|entries| {
                let index = at(entries, "embeddings.token_type_embeddings.weight");
                entries[index].long = true;
            }),
            "dtype embeddings.token_type_embeddings.weight",
        ),
        (
            "shape",
            edit(&|entries| {
                let index = at(entries, "encoder.layer.0.output.dense.weight");
                entries[index].shape = vec![16, 8];
            }),
            "shape encoder.layer.0.output.dense.weight",
        ),
        (
            "missing",
            edit(&|entries| {
                let index = at(entries, "encoder.layer.1.output.LayerNorm.bias");
                entries.remove(index);
            }),
            "missing encoder.layer.1.output.LayerNorm.bias",
        ),
    ];
    for (tag, entries, reason) in cases {
        let checkpoint = tiny.dir.join(format!("{tag}.bin"));
        tiny::write_checkpoint(&checkpoint, &entries);
        let out = tiny.dir.join(format!("{tag}.safetensors"));
        let mut read = 0;
        let result = convert::convert(&checkpoint, &tiny::config(), &out, &never(), &mut |_, _| {
            read += 1
        });
        assert_eq!(result, Err(EmbedError::Convert(reason.into())), "{tag}");
        assert_eq!(read, 0, "{tag}: a tensor was read");
        assert!(!out.exists(), "{tag}");
    }
    tiny.clean();
}

#[test]
fn a_converted_file_with_a_missing_tensor_does_not_load() {
    let tiny = tiny::tiny("convert-missing");
    let mut tensors = tiny.tensors.clone();
    tensors.remove("encoder.layer.1.output.dense.weight");
    let out = tiny.dir.join("partial.safetensors");
    candle_core::safetensors::save(&tensors, &out).unwrap();
    assert!(matches!(
        Encoder::load(
            &out,
            &tiny.tokenizer,
            &tiny::config(),
            Device::Cpu,
            DType::F32
        ),
        Err(EmbedError::ModelLoad(_))
    ));
    tiny.clean();
}

#[test]
fn the_pinned_converted_size_is_the_encoder_tensors_in_f16() {
    let config = infer::config(pins::CONFIG_JSON).unwrap();
    let expected = expected_tensors(&config);
    assert_eq!(expected.len(), 5 + 2 + 16 * config.num_hidden_layers);
    let data: u64 = expected
        .iter()
        .filter(|(name, _)| !name.starts_with("pooler."))
        .map(|(_, shape)| shape.iter().product::<usize>() as u64 * 2)
        .sum();
    let header = pins::CONVERTED_BYTES - data;
    assert!(header > 0 && header < 64 * 1024, "{header}");
}
