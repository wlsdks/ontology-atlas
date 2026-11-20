//! The app's side of the worker, against a fake worker on a thread.

use super::super::client::{convert_in_worker, BuiltinModel, Launch, Limits, WorkerState, LIMITS};
use super::super::protocol::{encode_reply, encode_vectors, Reply, MAX_ANSWER_BYTES};
use super::fake_worker::{vector_of, Log, ScriptedLaunch, ThreadLaunch, DIMENSIONS};
use super::*;

fn plan(passages: usize, chars: usize) -> BuildPlan {
    BuildPlan {
        files: 1,
        passages,
        chars,
    }
}

const QUICK: Limits = Limits {
    hello: Duration::from_secs(5),
    load: Duration::from_secs(5),
    batch: Duration::from_secs(5),
    stop: Duration::from_millis(500),
    exit: Duration::from_secs(2),
};

fn model_with(launch: impl Launch + 'static) -> BuiltinModel {
    let store = no_store();
    BuiltinModel::with_launch(store, Box::new(launch), QUICK, DIMENSIONS)
}

/// A model on a fake worker, and the fake's log.
fn fake() -> (BuiltinModel, Arc<Log>, Arc<super::fake_worker::Gate>) {
    let launch = ThreadLaunch::new();
    let (log, gate) = (launch.log.clone(), launch.gate.clone());
    (model_with(launch), log, gate)
}

fn launches(log: &Log) -> usize {
    log.launches.load(Ordering::SeqCst)
}

fn wait_until(what: &str, done: impl Fn() -> bool) {
    let started = Instant::now();
    while !done() {
        assert!(started.elapsed() < Duration::from_secs(5), "{what}");
        std::thread::sleep(Duration::from_millis(2));
    }
}

#[test]
fn a_build_writes_its_start_line_before_sending_and_closes_after() {
    let (model, log, _) = fake();
    let vault = temp_dir("build-vault");
    let embedder: &dyn Embedder = &model;
    let mut session = embedder.start_build(&vault, plan(3, 200)).unwrap();
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0]["purpose"], "embed-build");
    assert_eq!(lines[0]["provider"], "built-in");
    assert_eq!(lines[0]["host"], "local-worker");
    assert_eq!(lines[0]["model"], "bge-m3");
    assert_eq!(lines[0]["embed"]["passagesPlanned"], 3);
    assert!(log.texts.lock().unwrap().is_empty());

    let vectors = session
        .embed_batch(&["search meaning", "검색 의미"])
        .unwrap();
    assert_eq!(
        vectors,
        vec![vector_of("search meaning"), vector_of("검색 의미")]
    );
    assert_eq!(
        session.embed_batch(&["dawn", "wave"]),
        Err(EmbedError::OverPlan)
    );
    session.finish(RunEnd::Complete).unwrap();
    let lines = audit_lines(&vault);
    assert_eq!(lines[1]["embed"]["ended"], "complete");
    assert_eq!(lines[1]["embed"]["passagesSent"], 2);
    assert_eq!(lines[1]["embed"]["charsSent"], 19);
    assert_eq!(model.state(), WorkerState::Loaded);
    assert!(model.idle_for().is_some());
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_question_writes_one_line_and_a_dropped_build_closes_as_stopped() {
    let (model, _, _) = fake();
    let vault = temp_dir("query-vault");
    let vector = Embedder::embed_query(&model, &vault, "의미 검색").unwrap();
    assert_eq!(vector, vector_of("의미 검색"));
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0]["purpose"], "embed-query");
    assert_eq!(lines[0]["question"], "의미 검색");
    assert_eq!(lines[0]["outcome"], "ok");

    drop(Embedder::start_build(&model, &vault, plan(1, 10)).unwrap());
    assert_eq!(audit_lines(&vault)[2]["embed"]["ended"], "stopped");
    fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn nothing_reaches_the_worker_while_the_audit_log_is_unwritable() {
    let (model, log, _) = fake();
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
    assert!(log.texts.lock().unwrap().is_empty());
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_model_not_prepared_refuses_without_starting_a_worker_or_writing_a_line() {
    let model = BuiltinModel::new(no_store());
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
    assert_eq!(model.state(), WorkerState::NotRunning);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_worker_that_cannot_load_is_reported_and_gone() {
    let launch = ThreadLaunch {
        fail_load: true,
        ..ThreadLaunch::new()
    };
    let log = launch.log.clone();
    let model = model_with(launch);
    let vault = temp_dir("no-load-vault");
    assert_eq!(
        Embedder::embed_query(&model, &vault, "의미").map(|_| ()),
        Err(EmbedError::ModelNotReady)
    );
    assert_eq!(model.state(), WorkerState::NotRunning);
    assert!(model.worker_id().is_none());
    assert_eq!(log.loads.load(Ordering::SeqCst), 1);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_release_during_a_build_waits_for_it_and_questions_share_the_one_worker() {
    let (model, log, _) = fake();
    let vault = temp_dir("one-worker-vault");
    let mut session = Embedder::start_build(&model, &vault, plan(2, 100)).unwrap();
    assert!(!model.release(), "released while a build was open");
    assert_eq!(model.state(), WorkerState::Loaded);

    Embedder::embed_query(&model, &vault, "의미 검색").unwrap();
    session.embed_batch(&["dawn wave"]).unwrap();
    assert_eq!(launches(&log), 1, "a second worker was started");
    assert_eq!(log.loads.load(Ordering::SeqCst), 1);

    session.finish(RunEnd::Complete).unwrap();
    assert_eq!(model.state(), WorkerState::NotRunning);
    assert!(model.worker_id().is_none());

    Embedder::embed_query(&model, &vault, "검색").unwrap();
    assert_eq!(launches(&log), 2);
    assert!(model.release());
    assert_eq!(model.state(), WorkerState::NotRunning);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn warm_returns_at_once_and_state_reads_never_wait_for_the_load() {
    let launch = ThreadLaunch {
        hold_load: true,
        ..ThreadLaunch::new()
    };
    let (log, gate) = (launch.log.clone(), launch.gate.clone());
    let model = Arc::new(model_with(launch));
    let vault = temp_dir("warm-vault");
    model.warm();
    wait_until("the worker starting", || {
        log.loads.load(Ordering::SeqCst) == 1
    });
    assert_eq!(model.state(), WorkerState::Starting);
    std::thread::scope(|scope| {
        let question = scope.spawn(|| Embedder::embed_query(&*model, &vault, "의미"));
        assert_eq!(model.state(), WorkerState::Starting);
        gate.open();
        question.join().unwrap().unwrap();
    });
    assert_eq!(model.state(), WorkerState::Loaded);
    assert_eq!(launches(&log), 1);
    assert!(model.idle_for().is_some());
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_release_asked_for_during_a_load_ends_the_worker_once_it_loads() {
    let launch = ThreadLaunch {
        hold_load: true,
        ..ThreadLaunch::new()
    };
    let (log, gate) = (launch.log.clone(), launch.gate.clone());
    let model = Arc::new(model_with(launch));
    model.warm();
    wait_until("the worker starting", || {
        log.loads.load(Ordering::SeqCst) == 1
    });
    std::thread::scope(|scope| {
        let release = scope.spawn(|| model.release());
        gate.open();
        assert!(release.join().unwrap());
    });
    assert_eq!(model.state(), WorkerState::NotRunning);
    assert!(model.worker_id().is_none());
}

#[test]
fn a_worker_that_dies_mid_batch_fails_the_batch_and_the_next_call_starts_another() {
    let (model, log, _) = fake();
    let vault = temp_dir("die-vault");
    let mut session = Embedder::start_build(&model, &vault, plan(3, 100)).unwrap();
    assert_eq!(
        session.embed_batch(&["dawn", "die"]),
        Err(EmbedError::WorkerExited)
    );
    assert_eq!(model.state(), WorkerState::NotRunning);
    assert_eq!(
        session.embed_batch(&["wave"]).unwrap(),
        vec![vector_of("wave")]
    );
    assert_eq!(launches(&log), 2);
    drop(session);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_stop_mid_batch_returns_within_a_second_and_keeps_a_worker_that_gave_up() {
    let (model, log, _) = fake();
    let vault = temp_dir("stop-vault");
    let mut session = Embedder::start_build(&model, &vault, plan(4, 100)).unwrap();
    let stop = AtomicBool::new(false);
    std::thread::scope(|scope| {
        let stopping = scope.spawn(|| {
            wait_until("the batch reaching the worker", || {
                !log.texts.lock().unwrap().is_empty()
            });
            let at = Instant::now();
            stop.store(true, Ordering::SeqCst);
            at
        });
        let result = session.embed_batch_until(&["slow"], &stop);
        let stopped_at = stopping.join().unwrap();
        assert_eq!(result, Err(EmbedError::Cancelled));
        assert!(stopped_at.elapsed() < Duration::from_secs(1));
    });
    assert_eq!(model.state(), WorkerState::Loaded);
    assert_eq!(session.embed_batch(&["wave"]).unwrap().len(), 1);
    assert_eq!(launches(&log), 1);
    drop(session);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_worker_that_ignores_a_stop_is_killed_and_replaced() {
    let (model, log, _) = fake();
    let vault = temp_dir("hang-vault");
    let mut session = Embedder::start_build(&model, &vault, plan(4, 100)).unwrap();
    let stop = AtomicBool::new(false);
    std::thread::scope(|scope| {
        let stopping = scope.spawn(|| {
            wait_until("the batch reaching the worker", || {
                !log.texts.lock().unwrap().is_empty()
            });
            let at = Instant::now();
            stop.store(true, Ordering::SeqCst);
            at
        });
        let result = session.embed_batch_until(&["hang"], &stop);
        let stopped_at = stopping.join().unwrap();
        assert_eq!(result, Err(EmbedError::Cancelled));
        assert!(stopped_at.elapsed() < QUICK.stop + Duration::from_secs(1));
    });
    assert_eq!(model.state(), WorkerState::NotRunning);
    assert_eq!(session.embed_batch(&["wave"]).unwrap().len(), 1);
    assert_eq!(launches(&log), 2);
    drop(session);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn answers_that_are_not_unit_vectors_of_the_model_width_are_refused() {
    for (text, reason) in [
        ("nan", "not-finite"),
        ("long", "not-unit"),
        ("wide", "dimension"),
    ] {
        let (model, log, _) = fake();
        let vault = temp_dir("invalid-vault");
        let mut session = Embedder::start_build(&model, &vault, plan(2, 100)).unwrap();
        assert_eq!(
            session.embed_batch(&[text]),
            Err(EmbedError::ResponseInvalid(reason)),
            "{text}"
        );
        assert_eq!(model.state(), WorkerState::NotRunning, "{text}");
        assert_eq!(launches(&log), 1);
        drop(session);
        fs::remove_dir_all(&vault).ok();
    }
}

fn framed(payload: &[u8]) -> Vec<u8> {
    let mut out = (payload.len() as u32).to_le_bytes().to_vec();
    out.extend(payload);
    out
}

#[test]
fn a_broken_or_oversized_answer_ends_the_worker() {
    let oversized = ((MAX_ANSWER_BYTES + 1) as u32).to_le_bytes().to_vec();
    let mut short_vectors = encode_vectors(1, &[vector_of("a")]);
    short_vectors.truncate(short_vectors.len() - 4);
    let wrong_id = encode_vectors(99, &[vector_of("a")]);
    for (tag, answer, error) in [
        ("oversized", oversized, EmbedError::ResponseTooLarge),
        (
            "not-a-frame",
            framed(b"Xgarbage"),
            EmbedError::ResponseInvalid("frame"),
        ),
        (
            "short",
            framed(&short_vectors),
            EmbedError::ResponseInvalid("frame"),
        ),
        (
            "wrong-id",
            framed(&wrong_id),
            EmbedError::ResponseInvalid("id"),
        ),
    ] {
        let model = model_with(ScriptedLaunch::answering(answer));
        let vault = temp_dir("broken-vault");
        let mut session = Embedder::start_build(&model, &vault, plan(1, 10)).unwrap();
        assert_eq!(session.embed_batch(&["a"]), Err(error), "{tag}");
        assert_eq!(model.state(), WorkerState::NotRunning, "{tag}");
        drop(session);
        fs::remove_dir_all(&vault).ok();
    }
}

#[test]
fn a_worker_that_does_not_introduce_itself_is_refused() {
    let mut launch = ScriptedLaunch::answering(Vec::new());
    launch.hello = framed(&encode_reply(&Reply::Hello {
        protocol: "something-else/9".into(),
    }));
    let model = model_with(launch);
    let vault = temp_dir("hello-vault");
    assert_eq!(
        Embedder::embed_query(&model, &vault, "의미").map(|_| ()),
        Err(EmbedError::WorkerStart("hello".into()))
    );
    assert_eq!(model.state(), WorkerState::NotRunning);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_question_takes_the_turn_before_a_waiting_build_batch() {
    let (model, log, gate) = fake();
    let vault = temp_dir("turn-vault");
    let build = |text: &'static str| {
        let mut session = Embedder::start_build(&model, &vault, plan(1, 10)).unwrap();
        session.embed_batch(&[text]).map(|_| ())
    };
    std::thread::scope(|scope| {
        let holding = scope.spawn(|| build("gate"));
        wait_until("the first batch in the worker", || {
            !log.texts.lock().unwrap().is_empty()
        });
        model.turns.lock().unwrap().clear();
        let waiting_build = scope.spawn(|| build("wave"));
        wait_until("the second build waiting", || model.builds_waiting() == 1);
        let question = scope.spawn(|| Embedder::embed_query(&model, &vault, "의미"));
        wait_until("the question waiting", || model.questions_waiting() == 1);
        gate.open();
        holding.join().unwrap().unwrap();
        waiting_build.join().unwrap().unwrap();
        question.join().unwrap().unwrap();
    });
    // The question, then the second build's start and its batch.
    assert_eq!(*model.turns.lock().unwrap(), [true, false, false]);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_conversion_in_a_worker_passes_its_progress_on_and_honours_a_stop() {
    let launch = ThreadLaunch::new();
    let mut seen = Vec::new();
    let stop = AtomicBool::new(false);
    let started = std::thread::scope(|scope| {
        let stopping = scope.spawn(|| {
            std::thread::sleep(Duration::from_millis(100));
            stop.store(true, Ordering::SeqCst);
            Instant::now()
        });
        let result = convert_in_worker(&launch, QUICK, &stop, &mut |done, total| {
            seen.push((done, total))
        });
        assert_eq!(result, Err(EmbedError::Cancelled));
        stopping.join().unwrap()
    });
    assert!(started.elapsed() < Duration::from_secs(1));
    assert_eq!(seen, [(1, 2)]);

    launch.gate.open();
    seen.clear();
    convert_in_worker(&launch, QUICK, &never(), &mut |done, total| {
        seen.push((done, total))
    })
    .unwrap();
    assert_eq!(seen, [(1, 2), (2, 2)]);
    assert_eq!(launches(&launch.log), 2);
}

#[test]
fn the_shipped_limits_return_a_stop_within_about_a_second() {
    assert!(LIMITS.stop <= Duration::from_secs(1));
    assert!(LIMITS.exit <= Duration::from_secs(2));
}
