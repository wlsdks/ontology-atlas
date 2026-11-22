//! A real child process speaking the protocol: this test binary started again with
//! only `fake_worker_child` selected, which serves the fake model on its stdin and
//! stdout. The harness prints one banner line first; `AfterHarnessBanner` skips it.

use super::super::client::{spawn_piped, BuiltinModel, Launch, Limits, Spawned, WorkerState};
use super::super::worker::serve;
use super::fake_worker::{vector_of, AfterHarnessBanner, Death, FakeModels, Gate, Log, DIMENSIONS};
use super::*;
use std::process::Command;

const CHILD_ENV: &str = "ATLAS_FAKE_EMBED_WORKER_IDLE_MS";

#[test]
#[ignore = "the child the worker process tests start"]
fn fake_worker_child() {
    let Some(idle) = std::env::var(CHILD_ENV).ok().and_then(|ms| ms.parse().ok()) else {
        return;
    };
    let models = FakeModels {
        log: Arc::new(Log::default()),
        gate: Arc::new(Gate::default()),
        killed: Arc::default(),
        fail_load: false,
        hold_load: false,
        hold_check: false,
        death: Death::Exit,
    };
    let code = serve(
        std::io::stdin(),
        std::io::stdout(),
        &models,
        Duration::from_millis(idle),
    );
    std::process::exit(code);
}

/// Starts this test binary again as a worker selecting only `test`.
pub(super) fn harness_child(test: &str, env: &[(&str, String)]) -> Result<Spawned, EmbedError> {
    let mut command = Command::new(std::env::current_exe().map_err(|_| EmbedError::WorkerExited)?);
    crate::child_process::no_console::hide_console(&mut command)
        .args([
            "--exact",
            test,
            "--ignored",
            "--nocapture",
            "--test-threads=1",
            "-q",
        ])
        .envs(env.iter().map(|(key, value)| (*key, value)));
    let mut spawned = spawn_piped(command)?;
    spawned.output = Box::new(AfterHarnessBanner::new(spawned.output));
    Ok(spawned)
}

struct ChildLaunch {
    idle: Duration,
}

impl Launch for ChildLaunch {
    fn launch(&self) -> Result<Spawned, EmbedError> {
        harness_child(
            "llm::embed::builtin::tests::process::fake_worker_child",
            &[(CHILD_ENV, self.idle.as_millis().to_string())],
        )
    }
}

const LIMITS: Limits = Limits {
    hello: Duration::from_secs(20),
    load: Duration::from_secs(10),
    batch: Duration::from_secs(10),
    question: Duration::from_secs(20),
    stop: Duration::from_millis(500),
    exit: Duration::from_secs(2),
};

fn model(idle: Duration) -> BuiltinModel {
    model_within(idle, LIMITS)
}

fn model_within(idle: Duration, limits: Limits) -> BuiltinModel {
    BuiltinModel::with_launch(
        no_store(),
        Box::new(ChildLaunch { idle }),
        limits,
        DIMENSIONS,
    )
}

fn wait_until(what: &str, done: impl Fn() -> bool) {
    let started = Instant::now();
    while !done() {
        assert!(started.elapsed() < Duration::from_secs(20), "{what}");
        std::thread::sleep(Duration::from_millis(2));
    }
}

#[test]
fn a_question_the_worker_never_answers_ends_at_its_limit_and_the_next_gets_a_fresh_worker() {
    // Long enough for a loaded runner to start a child; the hang alone waits it out.
    let limits = Limits {
        question: Duration::from_secs(8),
        ..LIMITS
    };
    let model = model_within(Duration::from_secs(60), limits);
    let vault = temp_dir("child-hang-vault");
    let mut session = Embedder::start_build(
        &model,
        &vault,
        BuildPlan {
            files: 1,
            passages: 2,
            chars: 100,
        },
    )
    .unwrap();
    let hung = model.worker_id().unwrap();
    let stop = AtomicBool::new(false);
    std::thread::scope(|scope| {
        let question = scope.spawn(|| Embedder::embed_query(&model, &vault, "hang"));
        wait_until("the question holding the worker", || {
            model.turns.lock().unwrap().contains(&true)
        });
        // A job's batch queued behind the question is stopped at once, not after it.
        let stopper = scope.spawn(|| {
            wait_until("the batch waiting", || model.builds_waiting() == 1);
            stop.store(true, Ordering::SeqCst);
        });
        assert_eq!(
            session.embed_batch_until(&["wave"], &stop),
            Err(EmbedError::Cancelled)
        );
        stopper.join().unwrap();
        assert!(!question.is_finished(), "the stop waited for the question");
        assert_eq!(question.join().unwrap(), Err(EmbedError::TimedOut));
    });
    assert_eq!(model.state(), WorkerState::NotRunning);
    assert_gone(hung);
    let vector = Embedder::embed_query(&model, &vault, "의미").unwrap();
    assert_eq!(vector, vector_of("의미"));
    let fresh = model.worker_id().unwrap();
    assert_ne!(fresh, hung);
    drop(session);
    assert!(model.release());
    assert_gone(fresh);
    fs::remove_dir_all(&vault).ok();
}

/// Whether a process with this id still exists, a zombie included.
#[cfg(unix)]
fn exists(pid: u32) -> bool {
    // SAFETY: signal 0 only checks that the process exists.
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

fn assert_gone(pid: u32) {
    #[cfg(unix)]
    assert!(!exists(pid), "worker {pid} was not collected");
    #[cfg(not(unix))]
    let _ = pid;
}

#[test]
fn a_child_worker_answers_and_is_collected_on_release() {
    let model = model(Duration::from_secs(60));
    let vault = temp_dir("child-vault");
    let vector = Embedder::embed_query(&model, &vault, "의미 검색").unwrap();
    assert_eq!(vector, vector_of("의미 검색"));
    let pid = model.worker_id().unwrap();
    assert_eq!(model.state(), WorkerState::Loaded);
    assert!(model.release());
    assert_eq!(model.state(), WorkerState::NotRunning);
    assert_gone(pid);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_child_that_exits_mid_batch_is_collected_and_replaced() {
    let model = model(Duration::from_secs(60));
    let vault = temp_dir("child-die-vault");
    let mut session = Embedder::start_build(
        &model,
        &vault,
        BuildPlan {
            files: 1,
            passages: 3,
            chars: 100,
        },
    )
    .unwrap();
    let first = model.worker_id().unwrap();
    assert_eq!(
        session.embed_batch(&["dawn", "die"]),
        Err(EmbedError::WorkerExited)
    );
    assert_gone(first);
    assert_eq!(
        session.embed_batch(&["wave"]).unwrap(),
        vec![vector_of("wave")]
    );
    let second = model.worker_id().unwrap();
    assert_ne!(first, second);
    drop(session);
    assert!(model.release());
    assert_gone(second);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_child_that_ignores_a_stop_is_killed_and_collected() {
    let model = model(Duration::from_secs(60));
    let vault = temp_dir("child-hang-vault");
    let mut session = Embedder::start_build(
        &model,
        &vault,
        BuildPlan {
            files: 1,
            passages: 3,
            chars: 100,
        },
    )
    .unwrap();
    let pid = model.worker_id().unwrap();
    let stop = AtomicBool::new(false);
    let stopped_at = std::thread::scope(|scope| {
        let stopping = scope.spawn(|| {
            std::thread::sleep(Duration::from_millis(200));
            stop.store(true, Ordering::SeqCst);
            Instant::now()
        });
        assert_eq!(
            session.embed_batch_until(&["hang"], &stop),
            Err(EmbedError::Cancelled)
        );
        stopping.join().unwrap()
    });
    assert!(stopped_at.elapsed() < Duration::from_millis(1_500));
    assert_eq!(model.state(), WorkerState::NotRunning);
    assert_gone(pid);
    drop(session);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn a_child_that_sits_idle_exits_and_is_collected() {
    let model = model(Duration::from_millis(300));
    let vault = temp_dir("child-idle-vault");
    Embedder::embed_query(&model, &vault, "의미").unwrap();
    let pid = model.worker_id().unwrap();
    let started = Instant::now();
    while model.state() != WorkerState::NotRunning {
        assert!(started.elapsed() < Duration::from_secs(10), "never exited");
        std::thread::sleep(Duration::from_millis(10));
    }
    #[cfg(unix)]
    {
        let collected = Instant::now();
        while exists(pid) {
            assert!(
                collected.elapsed() < Duration::from_secs(5),
                "not collected"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    Embedder::embed_query(&model, &vault, "검색").unwrap();
    assert_ne!(model.worker_id(), Some(pid));
    fs::remove_dir_all(&vault).ok();
}
