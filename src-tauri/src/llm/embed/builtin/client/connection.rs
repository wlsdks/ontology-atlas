// One worker and the thread reading its answers, and the one-shot workers that
// convert and check a download.

use super::process::{reap, Launch, Process};
use super::Limits;
use crate::llm::embed::builtin::protocol::{
    decode_answer, encode_request, read_frame, write_frame, Answer, FrameError, Reply, Request,
    MAX_ANSWER_BYTES, PROTOCOL,
};
use crate::llm::embed::response::check_vectors;
use crate::llm::embed::EmbedError;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

const POLL: Duration = Duration::from_millis(20);
/// Answers the reader thread may hold before the worker's output waits for the app: a
/// conversion's progress reports are the only answers nobody asked for one by one.
const ANSWERS_QUEUED: usize = 16;
/// A conversion may report progress for this long in all before it is given up.
const CONVERT_LIMIT: Duration = Duration::from_secs(30 * 60);
/// A vector whose length strays further from 1 was not normalised by the worker.
const UNIT_TOLERANCE: f32 = 1e-3;

pub(super) struct Connection {
    input: Box<dyn Write + Send>,
    answers: mpsc::Receiver<Result<Answer, EmbedError>>,
    pub(super) process: Arc<Mutex<Box<dyn Process>>>,
    pub(super) generation: u64,
    next_id: u64,
}

/// Why waiting for an answer ended without one.
pub(super) enum Wait {
    /// Stopped, and the worker gave the request up in time.
    Stopped,
    /// Stopped, and the worker did not answer in time.
    StoppedUnanswered,
    Failed(EmbedError),
}

impl Connection {
    /// Starts a worker and waits for it to introduce itself. `on_end` runs when its
    /// output ends, which happens when it exits for any reason.
    pub(super) fn open(
        launch: &dyn Launch,
        limits: Limits,
        generation: u64,
        on_end: impl FnOnce() + Send + 'static,
    ) -> Result<Self, EmbedError> {
        let spawned = launch.launch()?;
        let process = Arc::new(Mutex::new(spawned.process));
        let (sender, answers) = mpsc::sync_channel(ANSWERS_QUEUED);
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

    pub(super) fn next_id(&mut self) -> u64 {
        self.next_id += 1;
        self.next_id
    }

    pub(super) fn send(&mut self, request: &Request) -> Result<(), EmbedError> {
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
    pub(super) fn ask(
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

    /// The next answer within one poll; `None` when none came yet.
    fn poll(&self) -> Result<Option<Answer>, Wait> {
        match self.answers.recv_timeout(POLL) {
            Ok(Ok(answer)) => Ok(Some(answer)),
            Ok(Err(error)) => Err(Wait::Failed(error)),
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err(Wait::Failed(EmbedError::WorkerExited))
            }
            Err(mpsc::RecvTimeoutError::Timeout) => Ok(None),
        }
    }

    /// The answer to request `id` within one poll; another id is a broken worker.
    fn poll_for(&self, id: u64) -> Result<Option<Answer>, Wait> {
        match self.poll()? {
            Some(answer) if answer.id() != Some(id) => {
                Err(Wait::Failed(EmbedError::ResponseInvalid("id")))
            }
            answer => Ok(answer),
        }
    }

    /// Waits for request `id`, telling the worker to stop it once `stop` is set.
    pub(super) fn wait(
        &mut self,
        id: u64,
        stop: &AtomicBool,
        limits: Limits,
    ) -> Result<Answer, Wait> {
        let started = Instant::now();
        loop {
            if let Some(answer) = self.poll_for(id)? {
                return Ok(answer);
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
    /// limit, so a worker that stops reporting times out, and one that reports
    /// forever times out at `overall`.
    fn wait_converted(
        &mut self,
        id: u64,
        stop: &AtomicBool,
        limits: Limits,
        overall: Duration,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), Wait> {
        let started = Instant::now();
        let mut heard = started;
        loop {
            match self.poll()? {
                Some(Answer::Reply(Reply::Progress {
                    id: of,
                    done,
                    total,
                })) if of == id => {
                    on_progress(done, total);
                    heard = Instant::now();
                }
                Some(Answer::Reply(Reply::Converted { id: of })) if of == id => return Ok(()),
                Some(Answer::Reply(Reply::Failed {
                    id: of,
                    code,
                    detail,
                })) if of == id => return Err(Wait::Failed(from_worker(&code, detail))),
                Some(_) => return Err(Wait::Failed(EmbedError::ResponseInvalid("id"))),
                None => {}
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
            if heard.elapsed() > limits.batch || started.elapsed() > overall {
                return Err(Wait::Failed(EmbedError::TimedOut));
            }
        }
    }

    /// Waits for the answer to request `id`, giving it up once `stop` is set or `within` passed.
    fn wait_answer(
        &mut self,
        id: u64,
        stop: &AtomicBool,
        within: Duration,
    ) -> Result<Answer, Wait> {
        let started = Instant::now();
        loop {
            if let Some(answer) = self.poll_for(id)? {
                return Ok(answer);
            }
            if stop.load(Ordering::Relaxed) {
                return Err(Wait::StoppedUnanswered);
            }
            if started.elapsed() > within {
                return Err(Wait::Failed(EmbedError::TimedOut));
            }
        }
    }

    /// Asks the worker to exit, closes its input, and collects it.
    pub(super) fn end(mut self, limits: Limits) {
        let _ = self.send(&Request::Exit);
        drop(self.input);
        reap(&self.process, limits.exit);
    }

    pub(super) fn kill(self) {
        drop(self.input);
        reap(&self.process, Duration::ZERO);
    }
}

/// Maps a worker's refusal back to the error it reported.
pub(super) fn from_worker(code: &str, detail: String) -> EmbedError {
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
        _ => EmbedError::WorkerFailed(crate::coded_error::coded(
            &code.chars().take(80).collect::<String>(),
            detail,
        )),
    }
}

/// One finite vector per text, all of the model's width, each of length 1.
pub(super) fn checked(
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

/// Starts a worker only to check a fresh conversion in the app's store. A stop kills
/// the worker: the check writes nothing, and the caller removes what it was checking.
pub(crate) fn check_in_worker(
    launch: &dyn Launch,
    limits: Limits,
    cancel: &AtomicBool,
) -> Result<(), EmbedError> {
    if cancel.load(Ordering::Relaxed) {
        return Err(EmbedError::Cancelled);
    }
    let mut connection = Connection::open(launch, limits, 0, || {})?;
    let id = connection.next_id();
    let answer = match connection.send(&Request::Check { id }) {
        Ok(()) => connection.wait_answer(id, cancel, limits.load),
        Err(error) => Err(Wait::Failed(error)),
    };
    let answer = match answer {
        Ok(answer) => answer,
        Err(Wait::Stopped | Wait::StoppedUnanswered) => {
            connection.kill();
            return Err(EmbedError::Cancelled);
        }
        Err(Wait::Failed(error)) => {
            connection.kill();
            return Err(error);
        }
    };
    connection.end(limits);
    match answer {
        Answer::Reply(Reply::Checked { .. }) => Ok(()),
        Answer::Reply(Reply::Failed { code, detail, .. }) => Err(from_worker(&code, detail)),
        _ => Err(EmbedError::ResponseInvalid("answer")),
    }
}

/// Starts a worker only to convert the app store's download, passing its progress
/// on. A stop kills the worker once it gave the request up or its time to do so
/// passed; the caller removes the half-written file.
pub(crate) fn convert_in_worker(
    launch: &dyn Launch,
    limits: Limits,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(u64, u64),
) -> Result<(), EmbedError> {
    if cancel.load(Ordering::Relaxed) {
        return Err(EmbedError::Cancelled);
    }
    let mut connection = Connection::open(launch, limits, 0, || {})?;
    let id = connection.next_id();
    let converted = match connection.send(&Request::Convert { id }) {
        Ok(()) => connection.wait_converted(id, cancel, limits, CONVERT_LIMIT, on_progress),
        Err(error) => Err(Wait::Failed(error)),
    };
    match converted {
        Ok(()) => {
            connection.end(limits);
            Ok(())
        }
        Err(Wait::Stopped | Wait::StoppedUnanswered) => {
            connection.kill();
            Err(EmbedError::Cancelled)
        }
        Err(Wait::Failed(error)) => {
            connection.kill();
            Err(error)
        }
    }
}
