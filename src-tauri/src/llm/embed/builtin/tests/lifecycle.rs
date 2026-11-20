use super::super::infer::Encoder;
use super::tiny::{self, Tiny};
use super::*;
use std::sync::atomic::AtomicUsize;
use std::sync::mpsc;

fn plan(passages: usize, chars: usize) -> BuildPlan {
    BuildPlan {
        files: 1,
        passages,
        chars,
    }
}

fn loaded(tag: &str) -> (Tiny, BuiltinModel) {
    let tiny = tiny::tiny(tag);
    let encoder = tiny::encoder(&tiny);
    let model = BuiltinModel::with_encoder(ModelStore::at(tiny.dir.join("store")), encoder);
    (tiny, model)
}

/// A model whose loads are counted; each load builds the tiny encoder.
fn counted(tiny: &Tiny) -> (BuiltinModel, Arc<AtomicUsize>) {
    let loads = Arc::new(AtomicUsize::new(0));
    let counter = loads.clone();
    let tensors = tiny.tensors.clone();
    let tokenizer = tiny.tokenizer.clone();
    let model = BuiltinModel::with_loader(
        ModelStore::at(tiny.dir.join("store")),
        Box::new(move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
            let vb = candle_nn::VarBuilder::from_tensors(tensors.clone(), DType::F32, &Device::Cpu);
            Ok(tiny::encoder_from(vb, &tokenizer, 32))
        }),
    );
    (model, loads)
}

#[test]
fn a_build_writes_its_start_line_before_reading_and_closes_after() {
    let (tiny, model) = loaded("build");
    let vault = temp_dir("build-vault");
    let embedder: &dyn Embedder = &model;
    let mut session = embedder.start_build(&vault, plan(3, 200)).unwrap();
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0]["purpose"], "embed-build");
    assert_eq!(lines[0]["provider"], "built-in");
    assert_eq!(lines[0]["host"], "in-process");
    assert_eq!(lines[0]["model"], "bge-m3");
    assert_eq!(lines[0]["embed"]["phase"], "start");
    assert_eq!(lines[0]["embed"]["passagesPlanned"], 3);

    let vectors = session
        .embed_batch(&["search meaning", "검색 의미"])
        .unwrap();
    assert_eq!(vectors.len(), 2);
    assert!(matches!(
        session.embed_batch(&["dawn", "wave"]),
        Err(EmbedError::OverPlan)
    ));
    session.finish(RunEnd::Complete).unwrap();
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[1]["embed"]["phase"], "close");
    assert_eq!(lines[1]["embed"]["ended"], "complete");
    assert_eq!(lines[1]["embed"]["passagesSent"], 2);
    assert_eq!(lines[1]["embed"]["charsSent"], 19);
    assert_eq!(lines[1]["embed"]["run"], lines[0]["embed"]["run"]);
    assert!(model.idle_for().is_some());
    fs::remove_dir_all(&vault).ok();
    tiny.clean();
}

#[test]
fn a_stop_set_before_a_batch_reads_nothing_more() {
    let (tiny, model) = loaded("build-stop");
    let vault = temp_dir("build-stop-vault");
    let mut session = Embedder::start_build(&model, &vault, plan(2, 100)).unwrap();
    let stop = AtomicBool::new(true);
    assert_eq!(
        session.embed_batch_until(&["dawn wave"], &stop),
        Err(EmbedError::Cancelled)
    );
    session.finish(RunEnd::Stopped).unwrap();
    assert_eq!(audit_lines(&vault)[1]["embed"]["ended"], "stopped");
    fs::remove_dir_all(&vault).ok();
    tiny.clean();
}

#[test]
fn a_dropped_build_closes_as_stopped() {
    let (tiny, model) = loaded("build-drop");
    let vault = temp_dir("build-drop-vault");
    drop(Embedder::start_build(&model, &vault, plan(1, 10)).unwrap());
    assert_eq!(audit_lines(&vault)[1]["embed"]["ended"], "stopped");
    fs::remove_dir_all(&vault).ok();
    tiny.clean();
}

#[test]
fn a_question_writes_one_line_with_the_question() {
    let (tiny, model) = loaded("query");
    let vault = temp_dir("query-vault");
    let vector = Embedder::embed_query(&model, &vault, "의미 검색").unwrap();
    assert_eq!(vector.len(), 8);
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0]["purpose"], "embed-query");
    assert_eq!(lines[0]["question"], "의미 검색");
    assert_eq!(lines[0]["host"], "in-process");
    assert_eq!(lines[0]["outcome"], "ok");
    assert_eq!(lines[0]["httpStatus"], serde_json::Value::Null);
    fs::remove_dir_all(&vault).ok();
    tiny.clean();
}

#[cfg(any(unix, windows))]
#[test]
fn nothing_is_read_while_the_audit_log_is_unwritable() {
    let (tiny, model) = loaded("blocked");
    let vault = temp_dir("blocked-build-vault");
    block_audit_log(&vault);
    assert!(matches!(
        Embedder::start_build(&model, &vault, plan(1, 10)),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert!(matches!(
        Embedder::embed_query(&model, &vault, "question"),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert!(model.idle_for().is_none(), "the model read something");
    fs::remove_dir_all(&vault).ok();
    tiny.clean();
}

#[test]
fn a_model_not_prepared_refuses_and_writes_no_line() {
    let store = ModelStore::at(temp_dir("absent").join("bge-m3"));
    let model = BuiltinModel::new(store);
    let vault = temp_dir("absent-vault");
    assert!(matches!(
        Embedder::start_build(&model, &vault, plan(1, 10)),
        Err(EmbedError::ModelNotReady)
    ));
    assert!(matches!(
        Embedder::embed_query(&model, &vault, "question"),
        Err(EmbedError::ModelNotReady)
    ));
    assert!(!crate::llm_audit::audit_log_path(&vault).exists());
    assert_eq!(model.state(), ModelState::Unloaded);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn an_unload_during_a_build_waits_for_it_and_no_second_copy_is_loaded() {
    let tiny = tiny::tiny("one-copy");
    let (model, loads) = counted(&tiny);
    let vault = temp_dir("one-copy-vault");

    let mut session = Embedder::start_build(&model, &vault, plan(2, 100)).unwrap();
    assert_eq!(loads.load(Ordering::SeqCst), 1);
    assert!(!model.unload(), "freed while a build held it");
    assert_eq!(model.state(), ModelState::Loaded);

    Embedder::embed_query(&model, &vault, "의미 검색").unwrap();
    assert_eq!(session.embed_batch(&["dawn wave"]).unwrap().len(), 1);
    assert_eq!(loads.load(Ordering::SeqCst), 1, "a second copy was loaded");
    assert_eq!(model.state(), ModelState::Loaded);

    session.finish(RunEnd::Complete).unwrap();
    assert_eq!(model.state(), ModelState::Unloaded);

    Embedder::embed_query(&model, &vault, "검색").unwrap();
    assert_eq!(loads.load(Ordering::SeqCst), 2);
    assert!(model.unload());
    assert_eq!(model.state(), ModelState::Unloaded);
    fs::remove_dir_all(&vault).ok();
    tiny.clean();
}

#[test]
fn status_reads_do_not_wait_for_a_load_and_a_second_caller_shares_it() {
    let tiny = tiny::tiny("loading");
    let (release, gate) = mpsc::channel::<()>();
    let gate = Mutex::new(gate);
    let loads = Arc::new(AtomicUsize::new(0));
    let counter = loads.clone();
    let tensors = tiny.tensors.clone();
    let tokenizer = tiny.tokenizer.clone();
    let loader = move |_: &ModelStore| -> Result<Encoder, EmbedError> {
        counter.fetch_add(1, Ordering::SeqCst);
        gate.lock().unwrap().recv().unwrap();
        let vb = candle_nn::VarBuilder::from_tensors(tensors.clone(), DType::F32, &Device::Cpu);
        Ok(tiny::encoder_from(vb, &tokenizer, 32))
    };
    let model = BuiltinModel::with_loader(ModelStore::at(tiny.dir.join("store")), Box::new(loader));
    let vault = temp_dir("loading-vault");

    std::thread::scope(|scope| {
        let first = scope.spawn(|| model.load());
        let started = Instant::now();
        while model.state() != ModelState::Loading {
            assert!(started.elapsed() < Duration::from_secs(5));
            std::thread::yield_now();
        }
        assert!(!model.is_loaded());
        let second = scope.spawn(|| Embedder::embed_query(&model, &vault, "의미"));
        release.send(()).unwrap();
        first.join().unwrap().unwrap();
        second.join().unwrap().unwrap();
    });
    assert_eq!(model.state(), ModelState::Loaded);
    assert_eq!(loads.load(Ordering::SeqCst), 1);
    assert!(model.idle_for().is_some(), "a load counts as use");
    drop(release);
    fs::remove_dir_all(&vault).ok();
    tiny.clean();
}

#[test]
fn an_unload_asked_for_during_a_load_frees_it_when_the_load_returns() {
    let tiny = tiny::tiny("load-unload");
    let (release, gate) = mpsc::channel::<()>();
    let gate = Mutex::new(gate);
    let tensors = tiny.tensors.clone();
    let tokenizer = tiny.tokenizer.clone();
    let model = BuiltinModel::with_loader(
        ModelStore::at(tiny.dir.join("store")),
        Box::new(move |_| {
            gate.lock().unwrap().recv().unwrap();
            let vb = candle_nn::VarBuilder::from_tensors(tensors.clone(), DType::F32, &Device::Cpu);
            Ok(tiny::encoder_from(vb, &tokenizer, 32))
        }),
    );
    std::thread::scope(|scope| {
        let loading = scope.spawn(|| model.load());
        while model.state() != ModelState::Loading {
            std::thread::yield_now();
        }
        assert!(!model.unload());
        release.send(()).unwrap();
        loading.join().unwrap().unwrap();
    });
    assert_eq!(model.state(), ModelState::Unloaded);
    tiny.clean();
}

#[test]
fn the_runtime_names_the_loaded_copy_and_its_memory_need() {
    let (tiny, model) = loaded("runtime");
    let runtime = model.runtime();
    assert_eq!((runtime.device, runtime.dtype), ("cpu", "f32"));
    assert!(runtime.memory_bytes > 0);
    assert!(model.unload());
    assert!(model.runtime().memory_bytes > 1_000_000_000);
    tiny.clean();
}

#[test]
fn a_second_preparation_of_the_same_directory_is_refused() {
    let dir = temp_dir("busy").join("bge-m3");
    let store = ModelStore::at(dir.clone());
    let held = Busy::claim(&dir).unwrap();
    assert!(matches!(Busy::claim(&dir), Err(EmbedError::ModelBusy)));
    assert_eq!(store.delete(), Err(EmbedError::ModelBusy));
    let other = Busy::claim(&dir.with_file_name("other"));
    assert!(other.is_ok());
    drop(held);
    assert!(Busy::claim(&dir).is_ok());
    fs::remove_dir_all(dir.parent().unwrap()).ok();
}
