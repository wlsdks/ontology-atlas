// The app's own executable started with `--embed-worker`: it touches only the model
// store's files, and exits on `exit`, when stdin closes or when idle, so the
// model's memory leaves with the process.

use super::infer::{Encoder, Runtime};
use super::protocol::{
    decode_request, encode_reply, encode_vectors, read_frame, write_frame, Reply, Request,
    MAX_REQUEST_BYTES, PROTOCOL,
};
use super::reference::check_conversion;
use super::{load_from_store, pins, ModelStore};
use crate::llm::embed::{check_passages, EmbedError, MAX_BATCH_BYTES, MAX_BATCH_PASSAGES};
use std::cell::Cell;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

pub(crate) const WORKER_FLAG: &str = "--embed-worker";
/// Ollama's default keep-alive.
pub(crate) const WORKER_IDLE: Duration = Duration::from_secs(5 * 60);
/// The bundle identifier in `tauri.conf.json`; Tauri's `app_data_dir` joins it.
const APP_IDENTIFIER: &str = "dev.jinan.ontology-atlas";

/// Exit codes the app may see; it only needs to know the worker is gone.
const EXIT_OK: i32 = 0;
const EXIT_OUTPUT: i32 = 1;
const EXIT_REQUEST: i32 = 2;
const EXIT_NO_DATA_DIR: i32 = 3;

/// A loaded model as the worker uses it.
pub(crate) trait Model {
    fn embed(&self, texts: &[&str], stop: &AtomicBool) -> Result<Vec<Vec<f32>>, EmbedError>;
    fn runtime(&self) -> Runtime;
}

impl Model for Encoder {
    fn embed(&self, texts: &[&str], stop: &AtomicBool) -> Result<Vec<Vec<f32>>, EmbedError> {
        self.embed_until(texts, stop)
    }

    fn runtime(&self) -> Runtime {
        Encoder::runtime(self)
    }
}

/// Where the worker's model comes from; tests pass a fake.
pub(crate) trait Models {
    fn load(&self) -> Result<Box<dyn Model>, EmbedError>;
    fn convert(
        &self,
        stop: &AtomicBool,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), EmbedError>;
    fn check(&self) -> Result<(), EmbedError>;
}

/// The prepared store in the app's data directory.
pub(crate) struct StoreModels(pub ModelStore);

impl Models for StoreModels {
    fn load(&self) -> Result<Box<dyn Model>, EmbedError> {
        Ok(Box::new(load_from_store(&self.0)?))
    }

    fn convert(
        &self,
        stop: &AtomicBool,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), EmbedError> {
        self.0
            .convert_download(pins::CONFIG_JSON, stop, on_progress)
    }

    fn check(&self) -> Result<(), EmbedError> {
        check_conversion(
            pins::REFERENCES_JSON,
            pins::CONFIG_JSON,
            super::infer::device(),
            &self.0.weights(),
            &self.0.tokenizer(),
        )
    }
}

/// The store the app uses: `ModelStore::in_app_data` of Tauri's `app_data_dir`.
pub(crate) fn app_store() -> Option<ModelStore> {
    dirs::data_dir().map(|dir| ModelStore::in_app_data(&dir.join(APP_IDENTIFIER)))
}

/// `main`'s branch: true only for exactly `<exe> --embed-worker`.
pub fn requested(args: &[std::ffi::OsString]) -> bool {
    matches!(args, [_, flag] if flag == WORKER_FLAG)
}

/// The process entry; returns the exit code.
pub fn run() -> i32 {
    let Some(store) = app_store() else {
        return EXIT_NO_DATA_DIR;
    };
    serve(
        std::io::stdin(),
        std::io::stdout(),
        &StoreModels(store),
        WORKER_IDLE,
    )
}

/// The request being computed, and stops for requests still queued, so a stop
/// that arrives before or during its request ends that request only.
#[derive(Default)]
struct Stops {
    /// The current id and the queued ids already stopped.
    state: Mutex<(u64, Vec<u64>)>,
    flag: AtomicBool,
    /// The input ended, so every request from now on is stopped.
    closed: AtomicBool,
}

/// More queued stops than this means the app is not the one asking.
const MAX_QUEUED_STOPS: usize = 64;

impl Stops {
    fn begin(&self, id: u64) {
        let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        state.0 = id;
        let stopped = state.1.contains(&id);
        state.1.retain(|queued| *queued > id);
        let closed = self.closed.load(Ordering::SeqCst);
        self.flag.store(stopped || closed, Ordering::SeqCst);
    }

    fn close(&self) {
        let _state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        self.closed.store(true, Ordering::SeqCst);
        self.flag.store(true, Ordering::SeqCst);
    }

    fn stop(&self, id: u64) {
        let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        if state.0 == id {
            self.flag.store(true, Ordering::SeqCst);
        } else if id > state.0 && state.1.len() < MAX_QUEUED_STOPS {
            state.1.push(id);
        }
    }
}

fn failed(id: u64, error: &EmbedError) -> Vec<u8> {
    encode_reply(&Reply::Failed {
        id,
        code: error.code().to_string(),
        detail: error.detail(),
    })
}

/// A batch the client could have sent: the same caps a loopback runner gets.
fn checked_texts(texts: &[String], question: bool) -> Result<Vec<&str>, EmbedError> {
    let texts: Vec<&str> = texts.iter().map(String::as_str).collect();
    check_passages(&texts)?;
    let bytes: usize = texts.iter().map(|text| text.len()).sum();
    let limit = if question { 1 } else { MAX_BATCH_PASSAGES };
    if texts.len() > limit || bytes > MAX_BATCH_BYTES {
        return Err(EmbedError::BatchTooLarge);
    }
    Ok(texts)
}

/// Requests read ahead of the one being computed. The client sends one at a time, so a full queue
/// means a client that does not wait; the reader then stops reading until one is taken.
const REQUESTS_QUEUED: usize = 8;

/// Serves requests until `exit`, the end of `input`, or `idle` without one.
pub(crate) fn serve(
    input: impl Read + Send + 'static,
    mut output: impl Write,
    models: &dyn Models,
    idle: Duration,
) -> i32 {
    let stops = Arc::new(Stops::default());
    let (requests, received) = mpsc::sync_channel::<Option<Request>>(REQUESTS_QUEUED);
    let reader_stops = stops.clone();
    std::thread::spawn(move || {
        let mut input = input;
        loop {
            let request = match read_frame(&mut input, MAX_REQUEST_BYTES) {
                Ok(Some(payload)) => decode_request(&payload),
                // The app is gone: nobody will read the batch being computed.
                Ok(None) => return reader_stops.close(),
                Err(_) => None,
            };
            match request {
                Some(Request::Stop { id }) => reader_stops.stop(id),
                Some(request) => {
                    if requests.send(Some(request)).is_err() {
                        return;
                    }
                }
                None => {
                    let _ = requests.send(None);
                    return;
                }
            }
        }
    });

    let hello = encode_reply(&Reply::Hello {
        protocol: PROTOCOL.into(),
    });
    if write_frame(&mut output, &hello).is_err() {
        return EXIT_OUTPUT;
    }
    let mut model: Option<Box<dyn Model>> = None;
    loop {
        let request = match received.recv_timeout(idle) {
            Ok(Some(request)) => request,
            Ok(None) => {
                let refused = failed(0, &EmbedError::WorkerFailed("request".into()));
                let _ = write_frame(&mut output, &refused);
                return EXIT_REQUEST;
            }
            Err(_) => return EXIT_OK,
        };
        let answer = match request {
            Request::Exit => return EXIT_OK,
            Request::Stop { .. } => continue,
            Request::Load { id } => {
                if model.is_none() {
                    match models.load() {
                        Ok(loaded) => model = Some(loaded),
                        Err(error) => {
                            if write_frame(&mut output, &failed(id, &error)).is_err() {
                                return EXIT_OUTPUT;
                            }
                            continue;
                        }
                    }
                }
                let runtime = model.as_ref().map(|model| model.runtime());
                match runtime {
                    Some(runtime) => encode_reply(&Reply::Loaded {
                        id,
                        device: runtime.device.into(),
                        dtype: runtime.dtype.into(),
                        memory_bytes: runtime.memory_bytes,
                    }),
                    None => failed(id, &EmbedError::ModelNotReady),
                }
            }
            Request::Convert { id } => {
                stops.begin(id);
                let unwritten = Cell::new(false);
                let converted = models.convert(&stops.flag, &mut |done, total| {
                    let progress = encode_reply(&Reply::Progress { id, done, total });
                    if write_frame(&mut output, &progress).is_err() {
                        unwritten.set(true);
                        stops.flag.store(true, Ordering::SeqCst);
                    }
                });
                if unwritten.get() {
                    return EXIT_OUTPUT;
                }
                match converted {
                    Ok(()) => encode_reply(&Reply::Converted { id }),
                    Err(error) => failed(id, &error),
                }
            }
            Request::Check { id } => match models.check() {
                Ok(()) => encode_reply(&Reply::Checked { id }),
                Err(error) => failed(id, &error),
            },
            Request::Embed {
                id,
                texts,
                question,
            } => {
                stops.begin(id);
                let embedded = checked_texts(&texts, question).and_then(|texts| {
                    let model = model.as_ref().ok_or(EmbedError::ModelNotReady)?;
                    model.embed(&texts, &stops.flag)
                });
                match embedded {
                    Ok(vectors) => encode_vectors(id, &vectors),
                    Err(error) => failed(id, &error),
                }
            }
        };
        if write_frame(&mut output, &answer).is_err() {
            return EXIT_OUTPUT;
        }
    }
}
