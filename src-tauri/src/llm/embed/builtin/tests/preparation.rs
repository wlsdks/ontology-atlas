use super::super::download::{part_path, OPEN_RUN};
use super::super::pins::{self, PinnedFile};
use super::fake::*;
use super::tiny::{self, Tiny};
use super::*;

/// The worker's two jobs on the tiny model, in this process.
struct InProcess {
    references: String,
}

impl ModelWork for InProcess {
    fn convert(
        &self,
        store: &ModelStore,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), EmbedError> {
        store.convert_download(tiny::TINY_CONFIG, cancel, on_progress)
    }

    fn check(&self, store: &ModelStore) -> Result<(), EmbedError> {
        check_conversion(
            &self.references,
            tiny::TINY_CONFIG,
            (Device::Cpu, DType::F32),
            &store.weights(),
            &store.tokenizer(),
        )
    }
}

fn plenty(_: &Path) -> std::io::Result<u64> {
    Ok(u64::MAX)
}

fn little(_: &Path) -> std::io::Result<u64> {
    Ok(1_000)
}

/// The tiny model served by the fake, as the real one is by Hugging Face.
struct Served {
    tiny: Tiny,
    vault: PathBuf,
    tokenizer: Vec<u8>,
    checkpoint: Vec<u8>,
    files: [PinnedFile; 2],
    references: String,
    work: InProcess,
}

fn served(tag: &str) -> Served {
    let tiny = tiny::tiny(tag);
    let vault = temp_dir(&format!("{tag}-vault"));
    let tokenizer = fs::read(&tiny.tokenizer).unwrap();
    let checkpoint = fs::read(&tiny.checkpoint).unwrap();
    let files = [
        pinned("tokenizer.json", &tokenizer),
        pinned("pytorch_model.bin", &checkpoint),
    ];
    let references = tiny::references(&tiny, 0.999);
    let work = InProcess {
        references: references.clone(),
    };
    Served {
        tiny,
        vault,
        tokenizer,
        checkpoint,
        files,
        references,
        work,
    }
}

impl Served {
    fn fake(&self) -> FakeFetch {
        FakeFetch::new(&self.vault)
            .hosting(&self.files[0], self.tokenizer.clone())
            .hosting(&self.files[1], self.checkpoint.clone())
    }

    fn recipe(&self) -> Recipe<'_> {
        Recipe {
            files: &self.files,
            converted_bytes: 4_096,
            free_space: plenty,
            work: &self.work,
        }
    }

    fn store(&self) -> ModelStore {
        ModelStore::in_app_data(&self.tiny.dir.join("app-data"))
    }

    fn prepare(&self, fetch: &dyn fetch::Fetch, recipe: &Recipe<'_>) -> Prepared {
        self.store()
            .prepare_with(fetch, recipe, &self.vault, &never(), &mut |_| {})
    }

    fn clean(self) {
        fs::remove_dir_all(&self.vault).ok();
        self.tiny.clean();
    }
}

fn names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

fn manifest(store: &ModelStore) -> serde_json::Value {
    serde_json::from_str(&fs::read_to_string(store.dir().join("manifest.json")).unwrap()).unwrap()
}

#[test]
fn prepare_downloads_converts_checks_and_keeps_only_the_model() {
    let served = served("prepare");
    let fake = served.fake();
    let store = served.store();
    let mut stages = Vec::new();
    let prepared = store.prepare_with(&fake, &served.recipe(), &served.vault, &never(), &mut |p| {
        if stages.last() != Some(&p.stage) {
            stages.push(p.stage);
        }
    });
    prepared.result.unwrap();

    assert_eq!(
        prepared.report.hosts,
        vec!["huggingface.co", "cdn-lfs.hf.co"]
    );
    assert_eq!(stages, vec![Stage::Download, Stage::Convert, Stage::Check]);
    assert_eq!(store.readiness_for(&served.recipe()), Readiness::Ready);
    assert_eq!(
        names(store.dir()),
        ["manifest.json", "model-f16.safetensors", "tokenizer.json"]
    );
    assert_eq!(
        fs::read(store.dir().join("tokenizer.json")).unwrap(),
        served.tokenizer
    );
    let weights = store.dir().join("model-f16.safetensors");
    let manifest = manifest(&store);
    assert_eq!(manifest["revision"], pins::REVISION);
    assert_eq!(
        manifest["weights"]["bytes"],
        fs::metadata(&weights).unwrap().len()
    );
    assert_eq!(
        manifest["weights"]["sha256"],
        hex(&Sha256::digest(fs::read(&weights).unwrap()))
    );
    assert_eq!(manifest["tokenizer"]["sha256"], served.files[0].sha256);
    assert_eq!(audit_lines(&served.vault).len(), 2);

    let again = served.prepare(&PanicFetch, &served.recipe());
    again.result.unwrap();
    assert_eq!(again.report, DownloadReport::default());
    served.clean();
}

#[test]
fn a_stopped_preparation_is_not_ready_and_resumes_its_download() {
    let served = served("prepare-stop");
    let mut fake = served.fake();
    fake.stop_after = Some(served.tokenizer.len() as u64 + 500);
    let store = served.store();
    let stopped = served.prepare(&fake, &served.recipe());
    assert!(matches!(stopped.result, Err(EmbedError::Cancelled)));
    assert_eq!(
        stopped.report.hosts,
        vec!["huggingface.co", "cdn-lfs.hf.co"]
    );
    assert_eq!(
        store.readiness_for(&served.recipe()),
        Readiness::NotPrepared
    );
    let kept = fs::metadata(part_path(&store.dir().join("download"), &served.files[1]))
        .unwrap()
        .len();
    assert!(kept > 0);

    let resumed = served.prepare(&served.fake(), &served.recipe());
    resumed.result.unwrap();
    assert_eq!(
        resumed.report.bytes_received,
        served.checkpoint.len() as u64 - kept
    );
    assert_eq!(store.readiness_for(&served.recipe()), Readiness::Ready);
    served.clean();
}

#[test]
fn what_a_quit_leaves_behind_is_removed_by_the_next_preparation() {
    let served = served("leftovers");
    let store = served.store();
    let downloads = store.dir().join("download");
    fs::create_dir_all(store.dir().join("stale")).unwrap();
    fs::create_dir_all(&downloads).unwrap();
    for leftover in [
        store.dir().join(".tmpQ1w2E3"),
        store.dir().join("model-f16.safetensors.converting"),
        store.dir().join("model-f16.safetensors"),
        downloads.join("junk"),
        downloads.join("open-run.json.tmp"),
    ] {
        fs::write(leftover, vec![0u8; 512]).unwrap();
    }
    served
        .prepare(&served.fake(), &served.recipe())
        .result
        .unwrap();
    assert_eq!(
        names(store.dir()),
        ["manifest.json", "model-f16.safetensors", "tokenizer.json"]
    );

    // A ready model whose download outlived it: removed with no request and no line.
    fs::create_dir_all(&downloads).unwrap();
    fs::write(downloads.join("pytorch_model.bin"), &served.checkpoint).unwrap();
    fs::write(store.dir().join(".tmpR4t5Y6"), vec![0u8; 512]).unwrap();
    let lines = audit_lines(&served.vault).len();
    served
        .prepare(&PanicFetch, &served.recipe())
        .result
        .unwrap();
    assert_eq!(
        names(store.dir()),
        ["manifest.json", "model-f16.safetensors", "tokenizer.json"]
    );
    assert_eq!(audit_lines(&served.vault).len(), lines);
    served.clean();
}

#[test]
fn readiness_needs_a_manifest_that_matches_the_pins_and_the_files() {
    let served = served("manifest");
    let store = served.store();
    let recipe = served.recipe();
    served.prepare(&served.fake(), &recipe).result.unwrap();
    let path = store.dir().join("manifest.json");
    let good = fs::read_to_string(&path).unwrap();
    assert_eq!(store.readiness_for(&recipe), Readiness::Ready);
    // This build's own pins name bge-m3's tokenizer, not the tiny one.
    assert_eq!(store.readiness(), Readiness::Mismatch("tokenizer"));

    let mut other = manifest(&store);
    other["revision"] = "0000000000000000000000000000000000000000".into();
    fs::write(&path, other.to_string()).unwrap();
    assert_eq!(
        store.readiness_for(&recipe),
        Readiness::Mismatch("revision")
    );
    fs::write(&path, "{").unwrap();
    assert_eq!(
        store.readiness_for(&recipe),
        Readiness::Mismatch("manifest")
    );
    fs::remove_file(&path).unwrap();
    assert_eq!(store.readiness_for(&recipe), Readiness::NotPrepared);
    assert!(!store.is_ready());

    fs::write(&path, &good).unwrap();
    let weights = store.dir().join("model-f16.safetensors");
    let full = fs::metadata(&weights).unwrap().len();
    fs::OpenOptions::new()
        .write(true)
        .open(&weights)
        .unwrap()
        .set_len(full - 1)
        .unwrap();
    assert_eq!(
        store.readiness_for(&recipe),
        Readiness::Mismatch("weights-size")
    );

    // Not ready, so preparing again starts from the download.
    served.prepare(&served.fake(), &recipe).result.unwrap();
    assert_eq!(store.readiness_for(&recipe), Readiness::Ready);
    served.clean();
}

#[test]
fn a_failed_check_keeps_the_download_for_the_next_try() {
    let served = served("check-fails");
    let store = served.store();
    let mut wrong: serde_json::Value = serde_json::from_str(&served.references).unwrap();
    let first = wrong["probes"][0]["vector"].clone();
    wrong["probes"][0]["vector"] = wrong["probes"][1]["vector"].clone();
    wrong["probes"][1]["vector"] = first;
    let wrong = InProcess {
        references: wrong.to_string(),
    };
    let recipe = Recipe {
        work: &wrong,
        ..served.recipe()
    };
    let failed = served.prepare(&served.fake(), &recipe);
    assert!(
        matches!(&failed.result, Err(EmbedError::ModelLoad(reason)) if reason.starts_with("reference 0")),
        "{:?}",
        failed.result
    );
    assert_eq!(
        names(&store.dir().join("download")),
        ["pytorch_model.bin", "tokenizer.json"]
    );
    assert_eq!(names(store.dir()), ["download"]);

    served
        .prepare(&PanicFetch, &served.recipe())
        .result
        .unwrap();
    assert_eq!(store.readiness_for(&served.recipe()), Readiness::Ready);
    served.clean();
}

#[test]
fn too_little_free_space_is_refused_before_the_first_byte() {
    let served = served("space");
    let recipe = Recipe {
        free_space: little,
        ..served.recipe()
    };
    let refused = served.prepare(&PanicFetch, &recipe);
    let needed = (served.tokenizer.len() + served.checkpoint.len()) as u64 + 4_096 + SPACE_MARGIN;
    assert_eq!(
        refused.result,
        Err(EmbedError::DiskSpace {
            needed,
            free: 1_000
        })
    );
    assert!(!served.store().dir().exists());
    assert!(!crate::llm_audit::audit_log_path(&served.vault).exists());
    served.clean();
}

#[cfg(unix)]
#[test]
fn a_store_is_not_ready_until_its_download_has_a_close_line() {
    use std::os::unix::fs::PermissionsExt;
    let served = served("close-fails");
    let store = served.store();
    let log = crate::llm_audit::audit_log_path(&served.vault);
    let set_mode = |mode: u32| {
        fs::set_permissions(&log, fs::Permissions::from_mode(mode)).unwrap();
    };
    let bodies = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let mut fake = served.fake();
    let (counter, path) = (bodies.clone(), log.clone());
    fake.after_each = Some(Box::new(move || {
        if counter.fetch_add(1, Ordering::SeqCst) == 1 {
            fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();
        }
    }));
    let failed = served.prepare(&fake, &served.recipe());
    assert!(
        matches!(failed.result, Err(EmbedError::AuditBlocked(_))),
        "{:?}",
        failed.result
    );
    assert_eq!(
        store.readiness_for(&served.recipe()),
        Readiness::NotPrepared
    );
    assert!(store.dir().join("download").join(OPEN_RUN).exists());

    set_mode(0o644);
    served
        .prepare(&PanicFetch, &served.recipe())
        .result
        .unwrap();
    let lines = audit_lines(&served.vault);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[1]["download"]["run"], lines[0]["download"]["run"]);
    assert_eq!(lines[1]["download"]["phase"], "close");
    assert_eq!(
        lines[1]["download"]["hosts"],
        serde_json::json!(["huggingface.co", "cdn-lfs.hf.co"])
    );
    assert_eq!(store.readiness_for(&served.recipe()), Readiness::Ready);
    served.clean();
}

#[test]
fn the_store_reports_its_bytes_and_deletes_everything() {
    let served = served("bytes");
    let store = served.store();
    assert_eq!(store.dir(), served.tiny.dir.join("app-data/models/bge-m3"));
    assert_eq!(store.bytes(), 0);
    served
        .prepare(&served.fake(), &served.recipe())
        .result
        .unwrap();
    let on_disk: u64 = ["manifest.json", "model-f16.safetensors", "tokenizer.json"]
        .iter()
        .map(|name| fs::metadata(store.dir().join(name)).unwrap().len())
        .sum();
    assert_eq!(store.bytes(), on_disk);
    assert_eq!(
        super::super::client::BuiltinModel::new(store.clone())
            .store()
            .bytes(),
        on_disk
    );
    store.delete().unwrap();
    assert!(!store.dir().exists());
    assert_eq!(store.bytes(), 0);
    store.delete().unwrap();
    served.clean();
}

#[test]
fn the_pins_name_one_commit_and_full_hashes() {
    assert_eq!(pins::REVISION.len(), 40);
    for file in pins::DOWNLOADS {
        assert_eq!(file.sha256.len(), 64);
        assert!(file
            .sha256
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        let url = pins::resolve_url(&file);
        assert!(url.starts_with("https://huggingface.co/BAAI/bge-m3/resolve/5617a9f61b02"));
        assert!(super::super::download::checked_url(&url, None).is_ok());
    }
    let config = infer::config(pins::CONFIG_JSON).unwrap();
    assert_eq!(config.hidden_size, pins::DIMENSIONS);
    assert!(
        infer::MAX_TOKENS + 2 <= 2_048 && infer::MAX_TOKENS + 2 <= config.max_position_embeddings
    );
    let references: References = serde_json::from_str(pins::REFERENCES_JSON).unwrap();
    assert!(references.probes.len() >= 3);
    assert!((0.9..1.0).contains(&references.floor));
    for probe in &references.probes {
        assert_eq!(probe.vector.len(), pins::DIMENSIONS);
    }
}
