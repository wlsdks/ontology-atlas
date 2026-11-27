//! One stdio session: a reader thread that keeps receiving while a call runs, a queue, and the
//! workers that answer.
//!
//! The JavaScript server reads and answers on one thread, and a tool runs to its end before the
//! next message is looked at, except where it waits (the consent question). This session keeps
//! that order and that freedom: requests are answered one at a time in arrival order, a call that
//! must wait for a person hands its place to another worker ([`Session::wait_off_queue`]) so a read
//! is answered meanwhile, and a `notifications/cancelled` takes effect at once because the reader
//! thread never stops.

use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};

use crate::json::{parse, Object, Value};
use crate::jsonrpc::{classify, error_line, result_line, Id, Incoming, RpcError};
use crate::methods::{handle_request, Reply};
use crate::runtime::Config;

/// Deep requests recurse on both threads; the stack is reserved, not touched, until used.
const THREAD_STACK_BYTES: usize = 256 * 1024 * 1024;
/// The SDK's `STDIO_DEFAULT_MAX_BUFFER_SIZE`: more unread bytes than this end the session.
const MAX_BUFFER_BYTES: usize = 10 * 1024 * 1024;
const READ_CHUNK_BYTES: usize = 64 * 1024;

struct Job {
    id: Id,
    method: String,
    params: Option<Object>,
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
    client_capabilities: Option<Object>,
}

pub struct Session {
    pub config: Config,
    output: Mutex<Box<dyn Write + Send>>,
    state: Mutex<State>,
    wakeup: Condvar,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A thread that panicked while holding the lock left plain data behind; the session goes on.
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl Session {
    pub fn new(config: Config, output: Box<dyn Write + Send>) -> Arc<Self> {
        Arc::new(Self {
            config,
            output: Mutex::new(output),
            state: Mutex::new(State::default()),
            wakeup: Condvar::new(),
        })
    }

    /// Reads requests from `input` until it ends or fails, answers each, and returns once the
    /// last answer is written. The reader thread is left behind if it is blocked on `input`.
    pub fn run(self: &Arc<Self>, input: impl Read + Send + 'static) {
        {
            let mut state = lock(&self.state);
            state.running = 1;
            state.allowed = 1;
        }
        let reader_session = Arc::clone(self);
        let reader = std::thread::Builder::new()
            .name("mcp-reader".to_string())
            .stack_size(THREAD_STACK_BYTES)
            .spawn(move || reader_session.read_loop(input));
        let worker_session = Arc::clone(self);
        let worker = std::thread::Builder::new()
            .name("mcp-worker".to_string())
            .stack_size(THREAD_STACK_BYTES)
            .spawn(move || worker_session.work_loop());
        if reader.is_err() || worker.is_err() {
            self.close();
            let mut state = lock(&self.state);
            state.running = 0;
            return;
        }
        let mut state = lock(&self.state);
        while state.running > 0 {
            state = self
                .wakeup
                .wait(state)
                .unwrap_or_else(std::sync::PoisonError::into_inner);
        }
    }

    pub fn is_closed(&self) -> bool {
        lock(&self.state).closed
    }

    /// The capabilities the client announced in `initialize`.
    pub fn client_capabilities(&self) -> Option<Object> {
        lock(&self.state).client_capabilities.clone()
    }

    pub(crate) fn set_client_capabilities(&self, capabilities: Object) {
        lock(&self.state).client_capabilities = Some(capabilities);
    }

    fn close(&self) {
        lock(&self.state).closed = true;
        self.wakeup.notify_all();
    }

    /// Writes one answer line. A closed standard output ends the session; nothing panics.
    fn send(&self, line: &str) {
        let written = {
            let mut output = lock(&self.output);
            output
                .write_all(line.as_bytes())
                .and_then(|()| output.flush())
        };
        if written.is_err() {
            // Nobody reads the answers any more: stop starting work, finish what is running.
            let mut state = lock(&self.state);
            state.closed = true;
            state.broken = true;
            drop(state);
            self.wakeup.notify_all();
        }
    }

    /// Runs `wait` — a call that blocks until a person answers — without holding up the queue: a
    /// second worker takes the next request meanwhile.
    pub fn wait_off_queue<R>(self: &Arc<Self>, wait: impl FnOnce() -> R) -> R {
        {
            let mut state = lock(&self.state);
            state.allowed += 1;
            state.running += 1;
        }
        let replacement = Arc::clone(self);
        let spawned = std::thread::Builder::new()
            .name("mcp-worker".to_string())
            .stack_size(THREAD_STACK_BYTES)
            .spawn(move || replacement.work_loop());
        if spawned.is_err() {
            let mut state = lock(&self.state);
            state.allowed -= 1;
            state.running -= 1;
        }
        let result = wait();
        {
            let mut state = lock(&self.state);
            if spawned.is_ok() {
                state.allowed -= 1;
            }
        }
        self.wakeup.notify_all();
        result
    }

    // The reader.

    fn read_loop(self: &Arc<Self>, mut input: impl Read) {
        let mut pending: Vec<u8> = Vec::new();
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
            let messages = take_messages(&mut pending);
            self.deliver(messages);
        }
        self.close();
    }

    /// Hands one chunk's messages over together, so a cancellation in the same chunk as the request
    /// it names is seen before any worker starts that request.
    fn deliver(&self, messages: Vec<Incoming>) {
        let mut state = lock(&self.state);
        for message in messages {
            match message {
                Incoming::Request { id, method, params } => {
                    let cancelled = Arc::new(AtomicBool::new(false));
                    state.in_flight.insert(id.clone(), Arc::clone(&cancelled));
                    state.queue.push_back(Job {
                        id,
                        method,
                        params,
                        cancelled,
                    });
                }
                Incoming::Notification { method, params } => {
                    if method == "notifications/cancelled" {
                        if let Some(id) = params.as_ref().and_then(cancelled_request) {
                            if let Some(flag) = state.in_flight.get(&id) {
                                flag.store(true, Ordering::SeqCst);
                            }
                        }
                    }
                }
                // Answers to questions the server asked belong to the consent family.
                Incoming::Response { .. } | Incoming::ErrorResponse { .. } => {}
            }
        }
        drop(state);
        self.wakeup.notify_all();
    }

    // The workers.

    fn work_loop(self: &Arc<Self>) {
        loop {
            let job = {
                let mut state = lock(&self.state);
                loop {
                    if state.broken {
                        state.queue.clear();
                    }
                    if state.running > state.allowed {
                        state.running -= 1;
                        drop(state);
                        self.wakeup.notify_all();
                        return;
                    }
                    if let Some(job) = state.queue.pop_front() {
                        break job;
                    }
                    if state.closed {
                        state.running -= 1;
                        drop(state);
                        self.wakeup.notify_all();
                        return;
                    }
                    state = self
                        .wakeup
                        .wait(state)
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                }
            };
            self.answer(&job);
            let mut state = lock(&self.state);
            if state
                .in_flight
                .get(&job.id)
                .is_some_and(|held| Arc::ptr_eq(held, &job.cancelled))
            {
                state.in_flight.remove(&job.id);
            }
        }
    }

    /// Answers one request, unless it was cancelled: a cancelled request gets no answer at all.
    fn answer(self: &Arc<Self>, job: &Job) {
        if job.cancelled.load(Ordering::SeqCst) {
            return;
        }
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            handle_request(self, &job.method, job.params.as_ref(), &job.cancelled)
        }))
        .unwrap_or_else(|_| Err(RpcError::new(RpcError::INTERNAL_ERROR, "Internal error")));
        if job.cancelled.load(Ordering::SeqCst) {
            return;
        }
        let line = match outcome {
            Ok(Reply::Value(value)) => result_line(&job.id, &value),
            Ok(Reply::RawJson(json)) => crate::jsonrpc::raw_result_line(&job.id, &json),
            Err(error) => error_line(&job.id, &error),
        };
        self.send(&line);
    }
}

fn cancelled_request(params: &Object) -> Option<Id> {
    match params.get("requestId")? {
        Value::String(text) => Some(Id::Text(text.clone())),
        Value::Number(number)
            if number.fract() == 0.0 && number.abs() <= 9_007_199_254_740_991.0 =>
        {
            Some(Id::Number(crate::jsonrpc::safe_integer(*number)))
        }
        _ => None,
    }
}

/// Every complete line in `pending`, read as a message; the lines are removed and a partial last
/// line stays. A line that is not JSON, or not a valid message, is dropped without an answer.
fn take_messages(pending: &mut Vec<u8>) -> Vec<Incoming> {
    let mut messages = Vec::new();
    let mut start = 0;
    while let Some(offset) = pending
        .get(start..)
        .and_then(|rest| rest.iter().position(|byte| *byte == b'\n'))
    {
        let end = start + offset;
        let mut line = pending.get(start..end).unwrap_or_default();
        if line.last() == Some(&b'\r') {
            line = line.get(..line.len() - 1).unwrap_or_default();
        }
        if let Some(message) = parse(&String::from_utf8_lossy(line))
            .ok()
            .as_ref()
            .and_then(classify)
        {
            messages.push(message);
        }
        start = end + 1;
    }
    pending.drain(..start);
    messages
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn complete_lines_become_messages_and_a_partial_line_waits() {
        let mut pending = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\r\nnot json\n{\"jsonrpc\":\"2.0\",\"id\":2,\"me".to_vec();
        let messages = take_messages(&mut pending);
        assert_eq!(messages.len(), 1);
        assert_eq!(pending, b"{\"jsonrpc\":\"2.0\",\"id\":2,\"me");
        pending.extend_from_slice(b"thod\":\"ping\"}\n");
        assert_eq!(take_messages(&mut pending).len(), 1);
        assert!(pending.is_empty());
    }

    #[test]
    fn a_line_without_its_newline_is_never_read() {
        let mut pending = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}".to_vec();
        assert!(take_messages(&mut pending).is_empty());
        assert!(!pending.is_empty());
    }

    #[test]
    fn invalid_utf8_is_replaced_not_fatal() {
        let mut pending = b"{\"jsonrpc\":\"2.0\",\"id\":\"\xff\",\"method\":\"ping\"}\n".to_vec();
        let messages = take_messages(&mut pending);
        assert!(
            matches!(messages.first(), Some(Incoming::Request { id: Id::Text(text), .. }) if text == "\u{fffd}")
        );
    }
}
