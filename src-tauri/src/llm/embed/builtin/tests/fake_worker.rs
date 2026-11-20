//! A worker serving a fake model, on a thread over OS pipes or in a child process.

use super::super::client::{Launch, Process, Spawned};
use super::super::infer::{expected_runtime, Runtime};
use super::super::protocol::{encode_reply, write_frame, Reply, PROTOCOL};
use super::super::worker::{serve, Model, Models};
use super::*;
use std::sync::atomic::AtomicUsize;
use std::sync::{Condvar, Mutex};
use std::thread::JoinHandle;

pub(super) const DIMENSIONS: usize = 8;

/// What the fake did, across every worker one launch started.
#[derive(Default)]
pub(super) struct Log {
    pub launches: AtomicUsize,
    pub loads: AtomicUsize,
    pub checks: AtomicUsize,
    pub texts: Mutex<Vec<String>>,
    /// Set when the app killed one of the workers.
    pub killed: AtomicBool,
}

/// Holds `gate` texts, and a load when `hold_load` is set, until opened.
#[derive(Default)]
pub(super) struct Gate {
    open: Mutex<bool>,
    changed: Condvar,
}

impl Gate {
    pub fn open(&self) {
        *self.open.lock().unwrap() = true;
        self.changed.notify_all();
    }

    fn wait(&self) {
        let mut open = self.open.lock().unwrap();
        while !*open {
            open = self.changed.wait(open).unwrap();
        }
    }
}

/// How a fake ends on `die`: a thread unwinds, a child process exits.
#[derive(Clone, Copy)]
pub(super) enum Death {
    Panic,
    Exit,
}

pub(super) struct FakeModels {
    pub log: Arc<Log>,
    pub gate: Arc<Gate>,
    pub killed: Arc<AtomicBool>,
    pub fail_load: bool,
    pub hold_load: bool,
    /// Holds a check until the gate opens; nothing else ends it but a kill.
    pub hold_check: bool,
    pub death: Death,
}

impl Models for FakeModels {
    fn load(&self) -> Result<Box<dyn Model>, EmbedError> {
        self.log.loads.fetch_add(1, Ordering::SeqCst);
        if self.hold_load {
            self.gate.wait();
        }
        if self.fail_load {
            return Err(EmbedError::ModelNotReady);
        }
        Ok(Box::new(FakeModel {
            log: self.log.clone(),
            gate: self.gate.clone(),
            killed: self.killed.clone(),
            death: self.death,
        }))
    }

    /// Reports half, waits for the gate or a stop, then reports the rest.
    fn convert(
        &self,
        stop: &AtomicBool,
        on_progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), EmbedError> {
        on_progress(1, 2);
        while !*self.gate.open.lock().unwrap() {
            if stop.load(Ordering::SeqCst) {
                return Err(EmbedError::Cancelled);
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        on_progress(2, 2);
        Ok(())
    }

    fn check(&self) -> Result<(), EmbedError> {
        self.log.checks.fetch_add(1, Ordering::SeqCst);
        if self.hold_check {
            // Ignores a stop, as the reference check does.
            while !*self.gate.open.lock().unwrap() {
                if self.killed.load(Ordering::SeqCst) {
                    return Err(EmbedError::Inference("killed".into()));
                }
                std::thread::sleep(Duration::from_millis(2));
            }
        }
        Ok(())
    }
}

struct FakeModel {
    log: Arc<Log>,
    gate: Arc<Gate>,
    killed: Arc<AtomicBool>,
    death: Death,
}

/// A unit vector that depends on the text.
pub(super) fn vector_of(text: &str) -> Vec<f32> {
    let seed = text.bytes().fold(7u32, |acc, byte| {
        acc.wrapping_mul(31).wrapping_add(u32::from(byte))
    });
    let mut vector: Vec<f32> = (0..DIMENSIONS)
        .map(|i| ((seed >> (i % 16)) & 0xff) as f32 + 1.0)
        .collect();
    let norm = vector.iter().map(|v| v * v).sum::<f32>().sqrt();
    vector.iter_mut().for_each(|v| *v /= norm);
    vector
}

impl Model for FakeModel {
    fn embed(&self, texts: &[&str], stop: &AtomicBool) -> Result<Vec<Vec<f32>>, EmbedError> {
        self.log
            .texts
            .lock()
            .unwrap()
            .extend(texts.iter().map(|text| (*text).to_string()));
        let mut out = Vec::new();
        for text in texts {
            // Between texts, as the encoder checks between groups.
            if *text != "hang" && stop.load(Ordering::SeqCst) {
                return Err(EmbedError::Cancelled);
            }
            match *text {
                "gate" => self.gate.wait(),
                // Gives up at a stop, as the encoder does between groups.
                "slow" => {
                    let started = Instant::now();
                    while started.elapsed() < Duration::from_secs(10) {
                        if stop.load(Ordering::SeqCst) {
                            return Err(EmbedError::Cancelled);
                        }
                        std::thread::sleep(Duration::from_millis(5));
                    }
                }
                // Ignores a stop, so only a kill ends it.
                "hang" => {
                    while !self.killed.load(Ordering::SeqCst) {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    return Err(EmbedError::Inference("killed".into()));
                }
                "die" => match self.death {
                    Death::Panic => panic!("the fake worker dies"),
                    Death::Exit => std::process::exit(9),
                },
                "nan" => {
                    out.push(vec![f32::NAN; DIMENSIONS]);
                    continue;
                }
                "long" => {
                    out.push(vec![1.0; DIMENSIONS]);
                    continue;
                }
                "wide" => {
                    out.push(vector_of("wide").into_iter().chain([0.0]).collect());
                    continue;
                }
                _ => {}
            }
            out.push(vector_of(text));
        }
        Ok(out)
    }

    fn runtime(&self) -> Runtime {
        expected_runtime()
    }
}

/// A worker on a thread; killing it releases a `hang` and closes its pipes.
struct ThreadWorker {
    handle: Option<JoinHandle<i32>>,
    killed: Arc<AtomicBool>,
    log: Option<Arc<Log>>,
}

impl Process for ThreadWorker {
    fn kill(&mut self) {
        self.killed.store(true, Ordering::SeqCst);
        if let Some(log) = &self.log {
            log.killed.store(true, Ordering::SeqCst);
        }
    }

    fn exited_within(&mut self, within: Duration) -> bool {
        let deadline = Instant::now() + within;
        loop {
            match &self.handle {
                None => return true,
                Some(handle) if handle.is_finished() => {
                    let _ = self.handle.take().map(JoinHandle::join);
                    return true;
                }
                Some(_) if Instant::now() >= deadline => return false,
                Some(_) => std::thread::sleep(Duration::from_millis(2)),
            }
        }
    }

    fn id(&self) -> u32 {
        0
    }
}

pub(super) struct ThreadLaunch {
    pub log: Arc<Log>,
    pub gate: Arc<Gate>,
    pub idle: Duration,
    pub fail_load: bool,
    pub hold_load: bool,
    pub hold_check: bool,
}

impl ThreadLaunch {
    pub fn new() -> Self {
        Self {
            log: Arc::default(),
            gate: Arc::default(),
            idle: Duration::from_secs(60),
            fail_load: false,
            hold_load: false,
            hold_check: false,
        }
    }
}

impl Launch for ThreadLaunch {
    fn launch(&self) -> Result<Spawned, EmbedError> {
        self.log.launches.fetch_add(1, Ordering::SeqCst);
        let (requests, input) = std::io::pipe().unwrap();
        let (output, answers) = std::io::pipe().unwrap();
        let killed = Arc::new(AtomicBool::new(false));
        let models = FakeModels {
            log: self.log.clone(),
            gate: self.gate.clone(),
            killed: killed.clone(),
            fail_load: self.fail_load,
            hold_load: self.hold_load,
            hold_check: self.hold_check,
            death: Death::Panic,
        };
        let idle = self.idle;
        let handle = std::thread::spawn(move || serve(requests, answers, &models, idle));
        Ok(Spawned {
            input: Box::new(input),
            output: Box::new(output),
            process: Box::new(ThreadWorker {
                handle: Some(handle),
                killed,
                log: Some(self.log.clone()),
            }),
        })
    }
}

/// A worker that says hello, loads, then answers every embed with `answer`
/// written as is, and lives until its input closes or it is killed.
pub(super) struct ScriptedLaunch {
    pub hello: Vec<u8>,
    pub answer: Vec<u8>,
}

impl ScriptedLaunch {
    pub fn answering(answer: Vec<u8>) -> Self {
        let hello = encode_reply(&Reply::Hello {
            protocol: PROTOCOL.into(),
        });
        let mut framed = (hello.len() as u32).to_le_bytes().to_vec();
        framed.extend(hello);
        Self {
            hello: framed,
            answer,
        }
    }
}

impl Launch for ScriptedLaunch {
    fn launch(&self) -> Result<Spawned, EmbedError> {
        let (mut requests, input) = std::io::pipe().unwrap();
        let (output, mut answers) = std::io::pipe().unwrap();
        let killed = Arc::new(AtomicBool::new(false));
        let (hello, answer) = (self.hello.clone(), self.answer.clone());
        let handle = std::thread::spawn(move || {
            use std::io::Write as _;
            let _ = answers.write_all(&hello);
            loop {
                let Ok(Some(payload)) = super::super::protocol::read_frame(&mut requests, 1 << 20)
                else {
                    return 0;
                };
                let request = super::super::protocol::decode_request(&payload);
                let reply = match request {
                    Some(super::super::protocol::Request::Load { id }) => {
                        encode_reply(&Reply::Loaded {
                            id,
                            device: "cpu".into(),
                            dtype: "f32".into(),
                            memory_bytes: 1,
                        })
                    }
                    Some(super::super::protocol::Request::Embed { .. }) => {
                        let _ = answers.write_all(&answer);
                        continue;
                    }
                    _ => return 0,
                };
                let _ = write_frame(&mut answers, &reply);
            }
        });
        Ok(Spawned {
            input: Box::new(input),
            output: Box::new(output),
            process: Box::new(ThreadWorker {
                handle: Some(handle),
                killed,
                log: None,
            }),
        })
    }
}

/// Reads past the test harness's own first lines to the worker's first frame.
pub(super) struct AfterHarnessBanner<R> {
    inner: R,
    seen: bool,
}

impl<R: std::io::Read> AfterHarnessBanner<R> {
    pub fn new(inner: R) -> Self {
        Self { inner, seen: false }
    }
}

impl<R: std::io::Read> std::io::Read for AfterHarnessBanner<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if !self.seen {
            const BANNER: &[u8] = b"running 1 test\n";
            let mut tail = Vec::new();
            let mut byte = [0u8; 1];
            while !tail.ends_with(BANNER) {
                if self.inner.read(&mut byte)? == 0 {
                    return Ok(0);
                }
                tail.push(byte[0]);
            }
            self.seen = true;
        }
        self.inner.read(buf)
    }
}
