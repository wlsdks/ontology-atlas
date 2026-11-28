//! The protocol: newline-delimited JSON-RPC over standard input and output, one session.
//!
//! The JavaScript server reads and answers on one thread, and a tool runs to its end before the next
//! message is looked at, except where it waits (the consent question). This session keeps that
//! order and that freedom. A reader thread never stops receiving, so a `notifications/cancelled`
//! takes effect at once; requests are answered one at a time in arrival order by a worker; a call
//! that must wait for a person hands its place to another worker ([`Session::wait_off_queue`]) so a
//! read is answered meanwhile.
//!
//! A cancelled request is not abandoned: its handler still runs, as the SDK's does, because the
//! cancellation reaches a handler only through a flag it may read, and only the answer is dropped.
//! A handler that panics is caught where the call is dispatched ([`crate::dispatch`]), and anything
//! that panics outside a handler is caught here, so one bad request is one error answer and the
//! session goes on.

mod capabilities;
mod id;
mod message;
mod methods;
mod params;
mod reply;
mod server_requests;
mod surrogates;

use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};

pub use capabilities::ClientCapabilities;
pub use id::Id;
pub use message::{ClientReply, Params, Request};
pub use methods::SUPPORTED_PROTOCOL_VERSIONS;
pub use reply::{Answer, RpcError};
pub use server_requests::{ClientAnswer, ServerRequestWait, MAX_OPEN_REQUESTS};

use message::{read_line, Inbound};
use methods::handle_request;
use reply::write_reply;

use vault_document::DocumentCache;

use crate::audit::AuditLog;
use crate::runtime::Config;
use crate::tools::KeptGraph;

/// The stack of a worker. A handler keeps its nesting in the heap, so this only has to hold what a
/// handler's own calls need, and the same size on every platform: a thread starts with 2 MiB on
/// Linux and macOS and 1 MiB on Windows.
const WORKER_STACK_BYTES: usize = 8 * 1024 * 1024;
/// The SDK's `STDIO_DEFAULT_MAX_BUFFER_SIZE`: more unread bytes than this end the session.
const MAX_BUFFER_BYTES: usize = 10 * 1024 * 1024;
const READ_CHUNK_BYTES: usize = 64 * 1024;

struct Job {
    request: Request,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
struct State {
    queue: VecDeque<Job>,
    closed: bool,
    /// Standard output failed: the queue is dropped instead of answered.
    broken: bool,
    /// Worker threads alive.
    running: usize,
    /// Worker threads that may be alive: one, plus one for each call waiting off the queue.
    allowed: usize,
    /// The cancel flag of each request being answered, by id; a later request with the same id
    /// replaces it, as the SDK's abort controllers do.
    in_flight: HashMap<Id, Arc<AtomicBool>>,
    client_capabilities: ClientCapabilities,
    /// `clientInfo.name` of the latest valid `initialize`.
    client_name: String,
    /// Requests the server made and the client has not answered, by id; `Some` once it answered.
    server_requests: HashMap<Id, Option<ClientReply>>,
    /// The id of the next request the server makes; the SDK's count starts at 0.
    next_server_request: i64,
}

pub struct Session {
    config: Config,
    audit: AuditLog,
    /// What the reads have read of each vault file, kept while the file is as it was.
    documents: DocumentCache,
    /// The compiled graph of the documents as they were last read.
    graph: KeptGraph,
    /// The source lines served through `sourceReads` so far; the process is the session.
    source_reads: source_reads::SessionReads,
    /// Held by the one write in progress, from its approval to its audit line.
    write_lock: Mutex<()>,
    output: Mutex<Box<dyn Write + Send>>,
    state: Mutex<State>,
    wakeup: Condvar,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A thread that panicked while holding the lock left plain data behind; the session goes on.
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Session {
    pub fn new(config: Config, output: Box<dyn Write + Send>) -> Arc<Self> {
        Arc::new(Self {
            audit: AuditLog::new(config.vault_root.clone()),
            documents: DocumentCache::new(),
            graph: KeptGraph::new(),
            source_reads: source_reads::SessionReads::new(),
            write_lock: Mutex::new(()),
            config,
            output: Mutex::new(output),
            state: Mutex::new(State::default()),
            wakeup: Condvar::new(),
        })
    }

    fn spawn_worker(self: &Arc<Self>) -> std::io::Result<()> {
        let session = Arc::clone(self);
        std::thread::Builder::new()
            .name("mcp-worker".to_string())
            .stack_size(WORKER_STACK_BYTES)
            .spawn(move || session.work_loop())
            .map(drop)
    }

    /// Reads requests from `input` until it ends or fails, answers each, and returns once the last
    /// answer is written. The reader thread is left behind if it is blocked on `input`.
    pub fn run(self: &Arc<Self>, input: impl Read + Send + 'static) {
        {
            let mut state = lock(&self.state);
            state.running = 1;
            state.allowed = 1;
        }
        let reader_session = Arc::clone(self);
        let reader = std::thread::Builder::new()
            .name("mcp-reader".to_string())
            .spawn(move || reader_session.read_loop(input));
        if reader.is_err() || self.spawn_worker().is_err() {
            self.close();
            lock(&self.state).running = 0;
            return;
        }
        let mut state = lock(&self.state);
        while state.running > 0 {
            state = self
                .wakeup
                .wait(state)
                .unwrap_or_else(PoisonError::into_inner);
        }
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    /// Waits for any write in progress to finish, then is the write in progress until dropped.
    pub(crate) fn lock_writes(&self) -> MutexGuard<'_, ()> {
        lock(&self.write_lock)
    }

    pub fn audit(&self) -> &AuditLog {
        &self.audit
    }

    pub fn documents(&self) -> &DocumentCache {
        &self.documents
    }

    pub fn graph(&self) -> &KeptGraph {
        &self.graph
    }

    pub fn source_reads(&self) -> &source_reads::SessionReads {
        &self.source_reads
    }

    pub fn is_closed(&self) -> bool {
        lock(&self.state).closed
    }

    /// What the client announced in `initialize`; nothing until it has.
    pub fn client_capabilities(&self) -> ClientCapabilities {
        lock(&self.state).client_capabilities
    }

    /// The name the client gave itself in `initialize`; empty until it has.
    pub fn client_name(&self) -> String {
        lock(&self.state).client_name.clone()
    }

    fn set_client(&self, capabilities: ClientCapabilities, name: String) {
        let mut state = lock(&self.state);
        state.client_capabilities = capabilities;
        state.client_name = name;
    }

    fn close(&self) {
        lock(&self.state).closed = true;
        self.wakeup.notify_all();
    }

    /// Writes the answer to one request. A closed standard output ends the session; nothing panics.
    fn send(&self, id: &Id, outcome: &Result<Answer, RpcError>) {
        if write_reply(&mut **lock(&self.output), id, outcome).is_err() {
            self.stop_after_output_failure();
        }
    }

    /// Nobody reads the answers any more: stop starting work, finish what is running.
    fn stop_after_output_failure(&self) {
        {
            let mut state = lock(&self.state);
            state.closed = true;
            state.broken = true;
        }
        self.wakeup.notify_all();
    }

    /// Runs `wait` (a call that blocks until a person answers) without holding up the queue: a
    /// second worker takes the next request meanwhile.
    pub fn wait_off_queue<R>(self: &Arc<Self>, wait: impl FnOnce() -> R) -> R {
        {
            let mut state = lock(&self.state);
            state.allowed += 1;
            state.running += 1;
        }
        let replaced = self.spawn_worker().is_ok();
        if !replaced {
            let mut state = lock(&self.state);
            state.allowed -= 1;
            state.running -= 1;
        }
        // Dropped when the wait ends, however it ends: a wait that panics gives the place back too.
        let _place = OffQueuePlace {
            session: self,
            replaced,
        };
        wait()
    }

    // The reader.

    fn read_loop(self: &Arc<Self>, mut input: impl Read) {
        let mut pending: Vec<u8> = Vec::new();
        // How much of `pending` is known to hold no line end, so each byte is looked at once.
        let mut searched = 0;
        let mut chunk = vec![0u8; READ_CHUNK_BYTES];
        loop {
            let count = match input.read(&mut chunk) {
                Ok(0) => break,
                Ok(count) => count,
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            };
            if pending.len() + count > MAX_BUFFER_BYTES {
                break;
            }
            pending.extend_from_slice(chunk.get(..count).unwrap_or_default());
            self.deliver(take_messages(&mut pending, &mut searched));
        }
        self.close();
    }

    /// Hands one chunk's messages over together, so a cancellation in the same chunk as the request
    /// it names is seen before any worker starts that request.
    fn deliver(&self, messages: Vec<Inbound>) {
        let mut state = lock(&self.state);
        for message in messages {
            match message {
                Inbound::Cancel(id) => {
                    if let Some(flag) = state.in_flight.get(&id) {
                        flag.store(true, Ordering::SeqCst);
                    }
                }
                Inbound::Answer { id, reply } => {
                    // An answer to a request nobody is waiting for, or a second answer, changes
                    // nothing, as in the SDK.
                    if let Some(slot @ None) = state.server_requests.get_mut(&id) {
                        *slot = Some(reply);
                    }
                }
                Inbound::Request(request) => {
                    let cancelled = Arc::new(AtomicBool::new(false));
                    state
                        .in_flight
                        .insert(request.id.clone(), Arc::clone(&cancelled));
                    state.queue.push_back(Job { request, cancelled });
                }
            }
        }
        drop(state);
        self.wakeup.notify_all();
    }

    // The workers.

    /// The next job, or `None` when this worker should end: the session is over and the queue is
    /// empty, or more workers are alive than are allowed.
    fn next_job(&self) -> Option<Job> {
        let mut state = lock(&self.state);
        loop {
            if state.broken {
                state.queue.clear();
            }
            if state.running > state.allowed {
                break;
            }
            if let Some(job) = state.queue.pop_front() {
                return Some(job);
            }
            if state.closed {
                break;
            }
            state = self
                .wakeup
                .wait(state)
                .unwrap_or_else(PoisonError::into_inner);
        }
        state.running -= 1;
        drop(state);
        self.wakeup.notify_all();
        None
    }

    fn work_loop(self: &Arc<Self>) {
        while let Some(job) = self.next_job() {
            self.answer(&job);
            let mut state = lock(&self.state);
            if state
                .in_flight
                .get(&job.request.id)
                .is_some_and(|held| Arc::ptr_eq(held, &job.cancelled))
            {
                state.in_flight.remove(&job.request.id);
            }
        }
    }

    /// Runs one request and answers it, unless it was cancelled: a cancelled request gets no answer
    /// at all, though its handler has run.
    fn answer(self: &Arc<Self>, job: &Job) {
        let request = &job.request;
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            handle_request(
                self,
                &request.method,
                request.params.as_ref(),
                &job.cancelled,
            )
        }))
        .unwrap_or(Err(RpcError::Unexpected));
        if job.cancelled.load(Ordering::SeqCst) {
            return;
        }
        self.send(&request.id, &outcome);
    }
}

/// The place a call waiting off the queue holds: while it lives, one more worker may run.
struct OffQueuePlace<'a> {
    session: &'a Session,
    replaced: bool,
}

impl Drop for OffQueuePlace<'_> {
    fn drop(&mut self) {
        if self.replaced {
            lock(&self.session.state).allowed -= 1;
        }
        self.session.wakeup.notify_all();
    }
}

/// Every complete line in `pending`, read as a message; the lines are removed and a partial last
/// line stays. A line that is not JSON, or not a valid message, is dropped without an answer.
/// `searched` is how many bytes of `pending` an earlier call found to hold no line end; it is
/// updated, so a long line arriving in pieces is scanned once, not once per piece.
fn take_messages(pending: &mut Vec<u8>, searched: &mut usize) -> Vec<Inbound> {
    let mut messages = Vec::new();
    let mut start = 0;
    let mut from = *searched;
    while let Some(offset) = pending
        .get(from..)
        .and_then(|rest| rest.iter().position(|byte| *byte == b'\n'))
    {
        let end = from + offset;
        let mut line = pending.get(start..end).unwrap_or_default();
        if let Some(without_return) = line.strip_suffix(b"\r") {
            line = without_return;
        }
        if let Some(message) = read_line(&String::from_utf8_lossy(line)) {
            messages.push(message);
        }
        start = end + 1;
        from = start;
    }
    pending.drain(..start);
    *searched = pending.len();
    messages
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::Modes;
    use std::time::{Duration, Instant};

    const PING: &[u8] = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}";

    #[test]
    fn lines_end_at_a_newline_with_or_without_a_carriage_return_and_a_partial_line_waits() {
        let mut pending = [PING, b"\r\nnot json\n", PING, b"\n", &PING[..20]].concat();
        let mut searched = 0;
        assert_eq!(take_messages(&mut pending, &mut searched).len(), 2);
        assert_eq!(pending, &PING[..20]);
        assert_eq!(searched, 20);
        pending.extend_from_slice(&PING[20..]);
        assert!(take_messages(&mut pending, &mut searched).is_empty());
        pending.extend_from_slice(b"\r\n");
        assert_eq!(take_messages(&mut pending, &mut searched).len(), 1);
        assert!(pending.is_empty());
    }

    #[test]
    fn a_long_line_arriving_in_small_pieces_is_scanned_once() {
        let mut pending = Vec::new();
        let mut searched = 0;
        let started = Instant::now();
        for _ in 0..4096 {
            pending.extend_from_slice(&[b'x'; 1024]);
            assert!(take_messages(&mut pending, &mut searched).is_empty());
        }
        assert_eq!(searched, 4096 * 1024);
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    fn session() -> Arc<Session> {
        let config = Config::at_vault(Modes::FULL, std::env::temp_dir());
        Session::new(config, Box::new(std::io::sink()))
    }

    #[test]
    fn a_wait_that_panics_gives_its_place_back() {
        let session = session();
        {
            let mut state = lock(&session.state);
            state.running = 1;
            state.allowed = 1;
        }
        let stopped = catch_unwind(AssertUnwindSafe(|| {
            session.wait_off_queue(|| panic!("the wait stopped"));
        }));
        assert!(stopped.is_err());
        let started = Instant::now();
        loop {
            let (running, allowed) = {
                let state = lock(&session.state);
                (state.running, state.allowed)
            };
            if (running, allowed) == (1, 1) {
                break;
            }
            assert!(
                started.elapsed() < Duration::from_secs(5),
                "running {running}, allowed {allowed}"
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        session.close();
    }
}
