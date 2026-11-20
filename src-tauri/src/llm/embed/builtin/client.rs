// The app's side of the model worker: at most one runs, it ends on `release`, on
// drop or when idle, and every worker that ends is collected. Every answer is
// checked before anyone stores it.

use super::audit::{self, RunEnd};
use super::infer::{self, Runtime};
use super::protocol::{
    decode_answer, encode_request, read_frame, write_frame, Answer, FrameError, Reply, Request,
    MAX_ANSWER_BYTES, PROTOCOL,
};
use super::worker::WORKER_FLAG;
use super::{pins, ModelStore, BUILTIN_SOURCE, MODEL_NAME};
use crate::llm::embed::response::check_vectors;
use crate::llm::embed::{
    check_passages, hex, BuildPlan, EmbedError, EmbedSession, Embedder, MAX_BATCH_BYTES,
    MAX_BATCH_PASSAGES,
};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// A started worker process as the app sees it.
pub(crate) trait Process: Send {
    fn kill(&mut self);
    /// Whether the process has exited within `within`, collected so no zombie is left.
    fn exited_within(&mut self, within: Duration) -> bool;
    fn id(&self) -> u32;
}

impl Process for Child {
    fn kill(&mut self) {
        let _ = Child::kill(self);
    }

    fn exited_within(&mut self, within: Duration) -> bool {
        let deadline = Instant::now() + within;
        loop {
            match self.try_wait() {
                Ok(Some(_)) | Err(_) => return true,
                Ok(None) if Instant::now() >= deadline => return false,
                Ok(None) => std::thread::sleep(Duration::from_millis(5)),
            }
        }
    }

    fn id(&self) -> u32 {
        Child::id(self)
    }
}

/// Waits `grace` for the process to exit, then kills it and collects it.
fn reap(process: &Mutex<Box<dyn Process>>, grace: Duration) {
    let mut process = process
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if !process.exited_within(grace) {
        process.kill();
        process.exited_within(Duration::from_secs(10));
    }
}

pub(crate) struct Spawned {
    pub input: Box<dyn Write + Send>,
    pub output: Box<dyn Read + Send>,
    pub process: Box<dyn Process>,
}

/// How a worker is started; tests start one that serves a fake model.
pub(crate) trait Launch: Send + Sync {
    fn launch(&self) -> Result<Spawned, EmbedError>;
}

/// This executable with `--embed-worker`.
pub(crate) struct SelfLaunch;

impl Launch for SelfLaunch {
    fn launch(&self) -> Result<Spawned, EmbedError> {
        let exe = std::env::current_exe().map_err(start_error)?;
        let mut command = Command::new(exe);
        crate::no_console::hide_console(&mut command).arg(WORKER_FLAG);
        spawn_piped(command)
    }
}

fn start_error(error: impl std::fmt::Display) -> EmbedError {
    EmbedError::WorkerStart(crate::errors::squeeze(&error.to_string()))
}

/// Starts `command` with piped stdin and stdout and stderr discarded.
pub(crate) fn spawn_piped(mut command: Command) -> Result<Spawned, EmbedError> {
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command.spawn().map_err(start_error)?;
    match (child.stdin.take(), child.stdout.take()) {
        (Some(input), Some(output)) => Ok(Spawned {
            input: Box::new(input),
            output: Box::new(output),
            process: Box::new(child),
        }),
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            Err(EmbedError::WorkerStart("pipes".into()))
        }
    }
}

/// How long each step may take before the worker is given up.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Limits {
    pub hello: Duration,
    /// Loading, or loading and checking a fresh conversion.
    pub load: Duration,
    pub batch: Duration,
    /// After a stop, how long the worker has to give the request up before it is killed.
    pub stop: Duration,
    /// How long an ending worker has to exit before it is killed.
    pub exit: Duration,
}

pub(crate) const LIMITS: Limits = Limits {
    hello: Duration::from_secs(10),
    load: Duration::from_secs(120),
    batch: Duration::from_secs(120),
    stop: Duration::from_secs(1),
    exit: Duration::from_secs(2),
};

const POLL: Duration = Duration::from_millis(20);
/// A vector whose length strays further from 1 was not normalised by the worker.
const UNIT_TOLERANCE: f32 = 1e-3;

/// A worker and the thread reading its answers.
struct Connection {
    input: Box<dyn Write + Send>,
    answers: mpsc::Receiver<Result<Answer, EmbedError>>,
    process: Arc<Mutex<Box<dyn Process>>>,
    generation: u64,
    next_id: u64,
}

/// Why waiting for an answer ended without one.
enum Wait {
    /// Stopped, and the worker gave the request up in time.
    Stopped,
    /// Stopped, and the worker did not answer in time.
    StoppedUnanswered,
    Failed(EmbedError),
}

impl Connection {
    /// Starts a worker and waits for it to introduce itself. `on_end` runs when its
    /// output ends, which happens when it exits for any reason.
    fn open(
        launch: &dyn Launch,
        limits: Limits,
        generation: u64,
        on_end: impl FnOnce() + Send + 'static,
    ) -> Result<Self, EmbedError> {
        let spawned = launch.launch()?;
        let process = Arc::new(Mutex::new(spawned.process));
        let (sender, answers) = mpsc::channel();
        let reader_process = process.clone();
        let mut output = spawned.output;
        std::thread::spawn(move || {
            let broken = loop {
                let answer = match read_frame(&mut output, MAX_ANSWER_BYTES) {
                    Ok(Some(payload)) => decode_answer(&payload),
                    Ok(None) | Err(FrameError::Broken) => {
                        let _ = sender.send(Err(EmbedError::WorkerExited));
                        break false;
                    }
                    Err(FrameError::TooLarge) => Err(EmbedError::ResponseTooLarge),
                };
                let bad = answer.is_err();
                if sender.send(answer).is_err() || bad {
                    break bad;
                }
            };
            on_end();
            let grace = if broken { Duration::ZERO } else { limits.exit };
            reap(&reader_process, grace);
        });
        let connection = Self {
            input: spawned.input,
            answers,
            process,
            generation,
            next_id: 0,
        };
        match connection.receive(limits.hello) {
            Ok(Answer::Reply(Reply::Hello { protocol })) if protocol == PROTOCOL => Ok(connection),
            _ => {
                connection.kill();
                Err(EmbedError::WorkerStart("hello".into()))
            }
        }
    }

    fn next_id(&mut self) -> u64 {
        self.next_id += 1;
        self.next_id
    }

    fn send(&mut self, request: &Request) -> Result<(), EmbedError> {
        write_frame(&mut self.input, &encode_request(request)).map_err(|_| EmbedError::WorkerExited)
    }

    fn receive(&self, within: Duration) -> Result<Answer, EmbedError> {
        match self.answers.recv_timeout(within) {
            Ok(answer) => answer,
            Err(mpsc::RecvTimeoutError::Timeout) => Err(EmbedError::TimedOut),
            Err(mpsc::RecvTimeoutError::Disconnected) => Err(EmbedError::WorkerExited),
        }
    }

    /// Sends one request and waits for its answer; another id is a broken worker.
    fn ask(
        &mut self,
        request: impl FnOnce(u64) -> Request,
        within: Duration,
    ) -> Result<Answer, EmbedError> {
        let id = self.next_id();
        self.send(&request(id))?;
        let answer = self.receive(within)?;
        if answer.id() != Some(id) {
            return Err(EmbedError::ResponseInvalid("id"));
        }
        Ok(answer)
    }

    /// Waits for request `id`, telling the worker to stop it once `stop` is set.
    fn wait(&mut self, id: u64, stop: &AtomicBool, limits: Limits) -> Result<Answer, Wait> {
        let started = Instant::now();
        loop {
            match self.answers.recv_timeout(POLL) {
                Ok(Ok(answer)) if answer.id() == Some(id) => return Ok(answer),
                Ok(Ok(_)) => return Err(Wait::Failed(EmbedError::ResponseInvalid("id"))),
                Ok(Err(error)) => return Err(Wait::Failed(error)),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(Wait::Failed(EmbedError::WorkerExited))
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if stop.load(Ordering::Relaxed) {
                let _ = self.send(&Request::Stop { id });
                return match self.answers.recv_timeout(limits.stop) {
                    Ok(Ok(answer)) if answer.id() == Some(id) => Err(Wait::Stopped),
                    _ => Err(Wait::StoppedUnanswered),
                };
            }
            if started.elapsed() > limits.batch {
                return Err(Wait::Failed(EmbedError::TimedOut));
            }
        }
    }

    /// Waits for conversion `id` to finish. Each progress report restarts the batch
    /// limit, so only a worker that stops reporting times out.
    fn wait_converted(
        &mut self,
        id: u64,
        stop: &AtomicBool,
        limits: Limits,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), Wait> {
        let mut heard = Instant::now();
        loop {
            match self.answers.recv_timeout(POLL) {
                Ok(Ok(Answer::Reply(Reply::Progress {
                    id: of,
                    done,
                    total,
                }))) if of == id => {
                    on_progress(done, total);
                    heard = Instant::now();
                }
                Ok(Ok(Answer::Reply(Reply::Converted { id: of }))) if of == id => return Ok(()),
                Ok(Ok(Answer::Reply(Reply::Failed {
                    id: of,
                    code,
                    detail,
                }))) if of == id => return Err(Wait::Failed(from_worker(&code, detail))),
                Ok(Ok(_)) => return Err(Wait::Failed(EmbedError::ResponseInvalid("id"))),
                Ok(Err(error)) => return Err(Wait::Failed(error)),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(Wait::Failed(EmbedError::WorkerExited))
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if stop.load(Ordering::Relaxed) {
                let _ = self.send(&Request::Stop { id });
                let deadline = Instant::now() + limits.stop;
                while let Some(left) = deadline.checked_duration_since(Instant::now()) {
                    match self.answers.recv_timeout(left) {
                        Ok(Ok(Answer::Reply(Reply::Progress { .. }))) => {}
                        Ok(Ok(answer)) if answer.id() == Some(id) => return Err(Wait::Stopped),
                        _ => break,
                    }
                }
                return Err(Wait::StoppedUnanswered);
            }
            if heard.elapsed() > limits.batch {
                return Err(Wait::Failed(EmbedError::TimedOut));
            }
        }
    }

    /// Asks the worker to exit, closes its input, and collects it.
    fn end(mut self, limits: Limits) {
        let _ = self.send(&Request::Exit);
        drop(self.input);
        reap(&self.process, limits.exit);
    }

    fn kill(self) {
        drop(self.input);
        reap(&self.process, Duration::ZERO);
    }
}

/// Maps a worker's refusal back to the error it reported.
fn from_worker(code: &str, detail: String) -> EmbedError {
    let detail: String = detail.chars().take(200).collect();
    match code {
        "embed-model-not-ready" => EmbedError::ModelNotReady,
        "embed-model-load-failed" => EmbedError::ModelLoad(detail),
        "embed-inference-failed" => EmbedError::Inference(detail),
        "embed-cancelled" => EmbedError::Cancelled,
        "embed-batch-empty" => EmbedError::BatchEmpty,
        "embed-batch-too-large" => EmbedError::BatchTooLarge,
        "embed-passage-too-long" => EmbedError::PassageTooLong(detail.parse().unwrap_or(0)),
        "embed-response-invalid" => EmbedError::ResponseInvalid("worker"),
        _ => EmbedError::WorkerFailed(crate::errors::coded(
            &code.chars().take(80).collect::<String>(),
            detail,
        )),
    }
}

/// One finite vector per text, all of the model's width, each of length 1.
fn checked(
    vectors: Vec<Vec<f32>>,
    count: usize,
    dimensions: usize,
) -> Result<Vec<Vec<f32>>, EmbedError> {
    let vectors = check_vectors(vectors, count, Some(dimensions))?;
    let unit = |vector: &Vec<f32>| {
        let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
        (norm - 1.0).abs() <= UNIT_TOLERANCE
    };
    if !vectors.iter().all(unit) {
        return Err(EmbedError::ResponseInvalid("not-unit"));
    }
    Ok(vectors)
}

/// Starts a worker only to check a fresh conversion in the app's store.
pub(crate) fn check_in_worker(launch: &dyn Launch, limits: Limits) -> Result<(), EmbedError> {
    let mut connection = Connection::open(launch, limits, 0, || {})?;
    let answer = connection.ask(|id| Request::Check { id }, limits.load);
    connection.end(limits);
    match answer? {
        Answer::Reply(Reply::Checked { .. }) => Ok(()),
        Answer::Reply(Reply::Failed { code, detail, .. }) => Err(from_worker(&code, detail)),
        _ => Err(EmbedError::ResponseInvalid("answer")),
    }
}

/// Starts a worker only to convert the app store's download, passing its progress
/// on. A stop is honoured as in a batch: given up in time, or the worker is killed.
pub(crate) fn convert_in_worker(
    launch: &dyn Launch,
    limits: Limits,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(u64, u64),
) -> Result<(), EmbedError> {
    let mut connection = Connection::open(launch, limits, 0, || {})?;
    let id = connection.next_id();
    let converted = match connection.send(&Request::Convert { id }) {
        Ok(()) => connection.wait_converted(id, cancel, limits, on_progress),
        Err(error) => Err(Wait::Failed(error)),
    };
    match converted {
        Ok(()) => {
            connection.end(limits);
            Ok(())
        }
        Err(Wait::Stopped) => {
            connection.end(limits);
            Err(EmbedError::Cancelled)
        }
        Err(Wait::StoppedUnanswered) => {
            connection.kill();
            Err(EmbedError::Cancelled)
        }
        Err(Wait::Failed(error)) => {
            connection.kill();
            Err(error)
        }
    }
}

/// What the screen shows; reading it never waits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WorkerState {
    NotRunning,
    Starting,
    Loaded,
}

const NOT_RUNNING: u64 = 0;
const STARTING: u64 = 1;
const LOADED: u64 = 2;

/// The worker's generation and its state in one word, so a worker that ended
/// can only mark itself, never the one started after it.
fn word(generation: u64, state: u64) -> u64 {
    generation << 2 | state
}

/// The built-in model, run in a worker process. Builds and questions share the
/// one worker; a question takes the next turn before a build's next batch.
pub(crate) struct BuiltinModel {
    store: ModelStore,
    launch: Box<dyn Launch>,
    limits: Limits,
    dimensions: usize,
    /// Refuses before starting a worker when the store is not ready.
    precheck: bool,
    /// Held for one whole request, never by a state read.
    worker: Mutex<Option<Connection>>,
    state: Arc<AtomicU64>,
    generation: AtomicU64,
    questions_waiting: AtomicUsize,
    /// Open builds; a release waits for the last one.
    sessions: AtomicUsize,
    release_pending: AtomicBool,
    last_used: Mutex<Option<Instant>>,
    reported: Mutex<Option<Runtime>>,
    /// Who took each turn, `true` for a question.
    #[cfg(test)]
    pub turns: Mutex<Vec<bool>>,
    #[cfg(test)]
    builds_waiting: AtomicUsize,
}

impl BuiltinModel {
    pub(crate) fn new(store: ModelStore) -> Self {
        let mut model = Self::with_launch(store, Box::new(SelfLaunch), LIMITS, pins::DIMENSIONS);
        model.precheck = true;
        model
    }

    pub(crate) fn with_launch(
        store: ModelStore,
        launch: Box<dyn Launch>,
        limits: Limits,
        dimensions: usize,
    ) -> Self {
        Self {
            store,
            launch,
            limits,
            dimensions,
            precheck: false,
            worker: Mutex::new(None),
            state: Arc::new(AtomicU64::new(word(0, NOT_RUNNING))),
            generation: AtomicU64::new(0),
            questions_waiting: AtomicUsize::new(0),
            sessions: AtomicUsize::new(0),
            release_pending: AtomicBool::new(false),
            last_used: Mutex::new(None),
            reported: Mutex::new(None),
            #[cfg(test)]
            turns: Mutex::new(Vec::new()),
            #[cfg(test)]
            builds_waiting: AtomicUsize::new(0),
        }
    }

    pub(crate) fn store(&self) -> &ModelStore {
        &self.store
    }

    pub(crate) fn state(&self) -> WorkerState {
        match self.state.load(Ordering::SeqCst) & 3 {
            STARTING => WorkerState::Starting,
            LOADED => WorkerState::Loaded,
            _ => WorkerState::NotRunning,
        }
    }

    /// Where the model runs and what it needs: as the worker reported it, or
    /// before any worker loaded, what this platform uses.
    pub(crate) fn runtime(&self) -> Runtime {
        lock(&self.reported).unwrap_or_else(infer::expected_runtime)
    }

    /// Time since the worker loaded or last answered; `None` before either.
    pub(crate) fn idle_for(&self) -> Option<Duration> {
        lock(&self.last_used).map(|at| at.elapsed())
    }

    /// Starts and loads a worker on another thread and returns at once; cancels a
    /// release still waiting for a build.
    pub(crate) fn warm(self: &Arc<Self>) {
        self.release_pending.store(false, Ordering::SeqCst);
        if self.state() != WorkerState::NotRunning {
            return;
        }
        let model = self.clone();
        std::thread::spawn(move || {
            let mut slot = model.turn(false);
            let _ = model.connected(&mut slot);
            model.apply_pending(&mut slot);
        });
    }

    /// Ends the worker now and returns `true`, or, while a build is open, when the
    /// last build ends and returns `false`.
    pub(crate) fn release(&self) -> bool {
        self.release_pending.store(true, Ordering::SeqCst);
        if self.sessions.load(Ordering::SeqCst) > 0 {
            return false;
        }
        let mut slot = lock(&self.worker);
        if self.sessions.load(Ordering::SeqCst) > 0 {
            return false;
        }
        self.end(&mut slot);
        self.release_pending.store(false, Ordering::SeqCst);
        true
    }

    #[cfg(test)]
    pub(crate) fn builds_waiting(&self) -> usize {
        self.builds_waiting.load(Ordering::SeqCst)
    }

    #[cfg(test)]
    pub(crate) fn questions_waiting(&self) -> usize {
        self.questions_waiting.load(Ordering::SeqCst)
    }

    #[cfg(test)]
    pub(crate) fn worker_id(&self) -> Option<u32> {
        let slot = lock(&self.worker);
        let connection = slot.as_ref()?;
        let id = lock(&connection.process).id();
        Some(id)
    }

    fn touch(&self) {
        *lock(&self.last_used) = Some(Instant::now());
    }

    /// The worker, for one request. A question goes before a build's next batch.
    fn turn(&self, question: bool) -> MutexGuard<'_, Option<Connection>> {
        let slot = if question {
            self.questions_waiting.fetch_add(1, Ordering::SeqCst);
            let slot = lock(&self.worker);
            self.questions_waiting.fetch_sub(1, Ordering::SeqCst);
            slot
        } else {
            #[cfg(test)]
            self.builds_waiting.fetch_add(1, Ordering::SeqCst);
            let slot = loop {
                while self.questions_waiting.load(Ordering::SeqCst) > 0 {
                    std::thread::sleep(Duration::from_millis(1));
                }
                let slot = lock(&self.worker);
                if self.questions_waiting.load(Ordering::SeqCst) == 0 {
                    break slot;
                }
            };
            #[cfg(test)]
            self.builds_waiting.fetch_sub(1, Ordering::SeqCst);
            slot
        };
        #[cfg(test)]
        lock(&self.turns).push(question);
        slot
    }

    fn is_current(&self, generation: u64) -> bool {
        let now = self.state.load(Ordering::SeqCst);
        now >> 2 == generation && now & 3 != NOT_RUNNING
    }

    fn mark_ended(&self, generation: u64) {
        for from in [STARTING, LOADED] {
            let _ = self.state.compare_exchange(
                word(generation, from),
                word(generation, NOT_RUNNING),
                Ordering::SeqCst,
                Ordering::SeqCst,
            );
        }
    }

    fn end(&self, slot: &mut Option<Connection>) {
        if let Some(connection) = slot.take() {
            let generation = connection.generation;
            connection.end(self.limits);
            self.mark_ended(generation);
        }
    }

    fn kill(&self, slot: &mut Option<Connection>) {
        if let Some(connection) = slot.take() {
            let generation = connection.generation;
            connection.kill();
            self.mark_ended(generation);
        }
    }

    fn apply_pending(&self, slot: &mut Option<Connection>) {
        if self.release_pending.load(Ordering::SeqCst) && self.sessions.load(Ordering::SeqCst) == 0
        {
            self.end(slot);
            self.release_pending.store(false, Ordering::SeqCst);
        }
    }

    /// The loaded worker, started first when none runs or the last one ended.
    fn connected<'s>(
        &self,
        slot: &'s mut Option<Connection>,
    ) -> Result<&'s mut Connection, EmbedError> {
        if slot
            .as_ref()
            .is_some_and(|connection| !self.is_current(connection.generation))
        {
            self.end(slot);
        }
        if slot.is_none() {
            if self.precheck && !self.store.is_ready() {
                return Err(EmbedError::ModelNotReady);
            }
            let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
            self.state
                .store(word(generation, STARTING), Ordering::SeqCst);
            let state = self.state.clone();
            let on_end = move || {
                for from in [STARTING, LOADED] {
                    let _ = state.compare_exchange(
                        word(generation, from),
                        word(generation, NOT_RUNNING),
                        Ordering::SeqCst,
                        Ordering::SeqCst,
                    );
                }
            };
            let opened = Connection::open(&*self.launch, self.limits, generation, on_end)
                .and_then(|connection| self.load(connection));
            match opened {
                Ok((connection, runtime)) => {
                    *slot = Some(connection);
                    *lock(&self.reported) = Some(runtime);
                    self.state.store(word(generation, LOADED), Ordering::SeqCst);
                    self.touch();
                }
                Err(error) => {
                    self.mark_ended(generation);
                    return Err(error);
                }
            }
        }
        slot.as_mut().ok_or(EmbedError::WorkerExited)
    }

    fn load(&self, mut connection: Connection) -> Result<(Connection, Runtime), EmbedError> {
        let answer = connection.ask(|id| Request::Load { id }, self.limits.load);
        let runtime = match answer {
            Ok(Answer::Reply(Reply::Loaded {
                device,
                dtype,
                memory_bytes,
                ..
            })) => infer::reported_runtime(&device, &dtype, memory_bytes)
                .ok_or(EmbedError::ResponseInvalid("runtime")),
            Ok(Answer::Reply(Reply::Failed { code, detail, .. })) => {
                Err(from_worker(&code, detail))
            }
            Ok(_) => Err(EmbedError::ResponseInvalid("answer")),
            Err(error) => Err(error),
        };
        match runtime {
            Ok(runtime) => Ok((connection, runtime)),
            Err(error) => {
                connection.end(self.limits);
                Err(error)
            }
        }
    }

    /// One batch or one question through the worker, checked before it returns.
    fn embed(
        &self,
        texts: &[&str],
        question: bool,
        stop: &AtomicBool,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
        let mut slot = self.turn(question);
        let embedded = self.embed_in(&mut slot, texts, question, stop);
        self.touch();
        self.apply_pending(&mut slot);
        embedded
    }

    fn embed_in(
        &self,
        slot: &mut Option<Connection>,
        texts: &[&str],
        question: bool,
        stop: &AtomicBool,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
        if stop.load(Ordering::Relaxed) {
            return Err(EmbedError::Cancelled);
        }
        let connection = self.connected(slot)?;
        let id = connection.next_id();
        let request = Request::Embed {
            id,
            texts: texts.iter().map(|text| (*text).to_string()).collect(),
            question,
        };
        let answer = match connection.send(&request) {
            Ok(()) => connection.wait(id, stop, self.limits),
            Err(error) => Err(Wait::Failed(error)),
        };
        let result = match answer {
            Ok(Answer::Vectors { vectors, .. }) => checked(vectors, texts.len(), self.dimensions),
            Ok(Answer::Reply(Reply::Failed { code, detail, .. })) => {
                return Err(from_worker(&code, detail))
            }
            Ok(_) => Err(EmbedError::ResponseInvalid("answer")),
            Err(Wait::Stopped) => return Err(EmbedError::Cancelled),
            Err(Wait::StoppedUnanswered) => Err(EmbedError::Cancelled),
            Err(Wait::Failed(error)) => Err(error),
        };
        if result.is_err() {
            self.kill(slot);
        }
        result
    }
}

impl Drop for BuiltinModel {
    fn drop(&mut self) {
        let mut slot = lock(&self.worker);
        self.end(&mut slot);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// An open build; while one is open a release waits for it.
struct Session<'m>(&'m BuiltinModel);

impl<'m> Session<'m> {
    fn open(model: &'m BuiltinModel) -> Self {
        model.sessions.fetch_add(1, Ordering::SeqCst);
        Self(model)
    }
}

impl Drop for Session<'_> {
    fn drop(&mut self) {
        let model = self.0;
        if model.sessions.fetch_sub(1, Ordering::SeqCst) == 1
            && model.release_pending.load(Ordering::SeqCst)
        {
            let mut slot = lock(&model.worker);
            model.apply_pending(&mut slot);
        }
    }
}

impl Embedder for BuiltinModel {
    fn model(&self) -> &str {
        MODEL_NAME
    }

    /// Starts and loads the worker, then writes the run's start line; no passage
    /// is sent before the line is on disk.
    fn start_build<'a>(
        &'a self,
        vault_dir: &Path,
        plan: BuildPlan,
    ) -> Result<Box<dyn EmbedSession + 'a>, EmbedError> {
        let session = Session::open(self);
        {
            let mut slot = self.turn(false);
            self.connected(&mut slot)?;
        }
        let run = audit::write_start(vault_dir, &BUILTIN_SOURCE, plan)?;
        Ok(Box::new(BuiltinRun {
            model: self,
            session: Some(session),
            vault_dir: vault_dir.to_path_buf(),
            run,
            plan,
            passages_sent: 0,
            chars_sent: 0,
            sent_hash: Sha256::new(),
            started: Instant::now(),
            closed: false,
        }))
    }

    fn embed_query(&self, vault_dir: &Path, question: &str) -> Result<Vec<f32>, EmbedError> {
        check_passages(&[question])?;
        // One turn from the load to the answer, so a build's batch cannot slip in
        // between the line and the question.
        let mut slot = self.turn(true);
        self.connected(&mut slot)?;
        let payload = serde_json::json!([question]).to_string();
        let reservation = audit::reserve_query(vault_dir, &BUILTIN_SOURCE, question, &payload)?;
        let started = Instant::now();
        let embedded = self.embed_in(&mut slot, &[question], true, &AtomicBool::new(false));
        self.touch();
        self.apply_pending(&mut slot);
        drop(slot);
        let outcome = if embedded.is_ok() { "ok" } else { "error" };
        audit::finalize_query(reservation, outcome, None, 0, started)?;
        embedded?.pop().ok_or(EmbedError::ResponseInvalid("count"))
    }
}

/// One open build: the same caps and plan as the loopback run, and the same
/// closing line, with `passagesSent` counting passages sent to the worker.
struct BuiltinRun<'m> {
    model: &'m BuiltinModel,
    session: Option<Session<'m>>,
    vault_dir: PathBuf,
    run: String,
    plan: BuildPlan,
    passages_sent: usize,
    chars_sent: usize,
    sent_hash: Sha256,
    started: Instant,
    closed: bool,
}

impl BuiltinRun<'_> {
    fn close(&mut self, ended: RunEnd) -> Result<(), EmbedError> {
        self.closed = true;
        self.session = None;
        let hash = std::mem::take(&mut self.sent_hash).finalize();
        audit::write_close(
            &self.vault_dir,
            &BUILTIN_SOURCE,
            &audit::Close {
                run: &self.run,
                plan: self.plan,
                passages_sent: self.passages_sent,
                chars_sent: self.chars_sent,
                sent_sha256: &hex(&hash),
                ended,
                duration_ms: self.started.elapsed().as_millis() as u64,
            },
        )
    }
}

impl EmbedSession for BuiltinRun<'_> {
    fn embed_batch(&mut self, passages: &[&str]) -> Result<Vec<Vec<f32>>, EmbedError> {
        self.embed_batch_until(passages, &AtomicBool::new(false))
    }

    /// A stop is honoured within about a second: the worker gives the batch up at
    /// its next group, or is killed.
    fn embed_batch_until(
        &mut self,
        passages: &[&str],
        stop: &AtomicBool,
    ) -> Result<Vec<Vec<f32>>, EmbedError> {
        let chars = check_passages(passages)?;
        if passages.len() > MAX_BATCH_PASSAGES
            || passages.iter().map(|p| p.len()).sum::<usize>() > MAX_BATCH_BYTES
        {
            return Err(EmbedError::BatchTooLarge);
        }
        if self.passages_sent + passages.len() > self.plan.passages
            || self.chars_sent + chars > self.plan.chars
        {
            return Err(EmbedError::OverPlan);
        }
        if self.session.is_none() {
            return Err(EmbedError::ModelNotReady);
        }
        self.passages_sent += passages.len();
        self.chars_sent += chars;
        self.sent_hash
            .update(serde_json::json!(passages).to_string().as_bytes());
        self.model.embed(passages, false, stop)
    }

    fn finish(mut self: Box<Self>, ended: RunEnd) -> Result<(), EmbedError> {
        self.close(ended)
    }
}

impl Drop for BuiltinRun<'_> {
    fn drop(&mut self) {
        if !self.closed {
            if let Err(error) = self.close(RunEnd::Stopped) {
                log::error!("embed-build run {} has no closing line: {error}", self.run);
            }
        }
    }
}
