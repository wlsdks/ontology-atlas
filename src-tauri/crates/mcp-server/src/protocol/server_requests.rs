//! A request the server makes of the client, and the wait for its answer.
//!
//! Only one question exists today, the consent question of a write (`elicitation/create`), but the
//! mechanism is the protocol's: a request line with the next id, an answer that arrives on the reader
//! thread, a wait that ends when the answer comes, the time runs out, the asking call is cancelled or
//! the session ends. A wait that ends without an answer tells the client to drop the question
//! (`notifications/cancelled`), so a person is not left holding a card nobody is waiting for.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;

use super::id::Id;
use super::message::ClientReply;
use super::reply::write_line;
use super::{lock, Session};

/// Questions open at once. Each holds a worker thread and, in the client, a card a person must
/// read, so an agent that sends writes faster than a person can answer is refused instead of
/// piling up threads and cards.
pub const MAX_OPEN_REQUESTS: usize = 8;

/// How long, and until when, [`Session::ask_client`] may wait.
#[derive(Debug, Clone, Copy)]
pub struct ServerRequestWait<'a> {
    pub limit: Duration,
    /// Set when the call that asks is cancelled.
    pub cancelled: &'a AtomicBool,
}

/// How a question ended.
#[derive(Debug)]
pub enum ClientAnswer {
    Replied(ClientReply),
    TimedOut,
    /// The call that asked was cancelled, so nobody wants the answer.
    CallCancelled,
    /// Standard input closed or standard output failed while the question was open.
    SessionEnded,
    /// The question could not be written: the client no longer reads standard output.
    ClientUnreachable,
    /// [`MAX_OPEN_REQUESTS`] questions are already waiting for a person.
    TooManyOpen,
}

/// The request line. The SDK writes `method` and `params` before `jsonrpc` and `id`.
#[derive(Serialize)]
struct RequestLine<'a, T: Serialize> {
    method: &'a str,
    params: &'a T,
    jsonrpc: &'static str,
    id: i64,
}

#[derive(Serialize)]
struct CancelledParams<'a> {
    #[serde(rename = "requestId")]
    request_id: i64,
    reason: &'a str,
}

#[derive(Serialize)]
struct NotificationLine<'a> {
    jsonrpc: &'static str,
    method: &'static str,
    params: CancelledParams<'a>,
}

impl Session {
    /// Puts `method` with `params` to the client and waits for its answer. The caller waits off the
    /// queue (`CallContext::wait_off_queue`) so reads are answered meanwhile.
    pub fn ask_client<T: Serialize>(
        &self,
        method: &str,
        params: &T,
        wait: ServerRequestWait<'_>,
    ) -> ClientAnswer {
        let number = {
            let mut state = lock(&self.state);
            if state.server_requests.len() >= MAX_OPEN_REQUESTS {
                return ClientAnswer::TooManyOpen;
            }
            let number = state.next_server_request;
            state.next_server_request += 1;
            state.server_requests.insert(Id::Number(number), None);
            number
        };
        let line = RequestLine {
            method,
            params,
            jsonrpc: "2.0",
            id: number,
        };
        if write_line(&mut **lock(&self.output), &line).is_err() {
            lock(&self.state)
                .server_requests
                .remove(&Id::Number(number));
            self.stop_after_output_failure();
            return ClientAnswer::ClientUnreachable;
        }
        let answer = self.wait_for_answer(number, wait);
        let reason = match answer {
            ClientAnswer::TimedOut => Some("The question was not answered in time"),
            ClientAnswer::CallCancelled => Some("The call that asked was cancelled"),
            _ => None,
        };
        if let Some(reason) = reason {
            self.withdraw(number, reason);
        }
        answer
    }

    fn wait_for_answer(&self, number: i64, wait: ServerRequestWait<'_>) -> ClientAnswer {
        let id = Id::Number(number);
        let deadline = Instant::now() + wait.limit;
        let mut state = lock(&self.state);
        loop {
            // An answer that arrived wins over a cancellation or a close that came after it.
            if let Some(Some(_)) = state.server_requests.get(&id) {
                if let Some(Some(reply)) = state.server_requests.remove(&id) {
                    return ClientAnswer::Replied(reply);
                }
            }
            let ended = if wait.cancelled.load(Ordering::SeqCst) {
                Some(ClientAnswer::CallCancelled)
            } else if state.closed {
                Some(ClientAnswer::SessionEnded)
            } else if Instant::now() >= deadline {
                Some(ClientAnswer::TimedOut)
            } else {
                None
            };
            if let Some(ended) = ended {
                state.server_requests.remove(&id);
                return ended;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            state = self
                .wakeup
                .wait_timeout(state, remaining)
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .0;
        }
    }

    /// Tells the client the question with this id is no longer asked. Best effort: a client that
    /// cannot be written to has nothing to drop.
    fn withdraw(&self, number: i64, reason: &str) {
        let line = NotificationLine {
            jsonrpc: "2.0",
            method: "notifications/cancelled",
            params: CancelledParams {
                request_id: number,
                reason,
            },
        };
        if write_line(&mut **lock(&self.output), &line).is_err() {
            self.stop_after_output_failure();
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::sync::{Arc, Mutex};

    use super::super::message::Inbound;
    use super::*;
    use crate::runtime::{Config, Modes};

    /// An output the test can read what the server wrote from.
    #[derive(Clone, Default)]
    struct Written(Arc<Mutex<Vec<u8>>>);

    impl Write for Written {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0
                .lock()
                .map_err(|_| std::io::Error::other("poisoned"))?
                .extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl Written {
        fn text(&self) -> String {
            String::from_utf8_lossy(&self.0.lock().map(|bytes| bytes.clone()).unwrap_or_default())
                .into_owned()
        }
    }

    fn session(output: Written) -> Arc<Session> {
        Session::new(
            Config {
                modes: Modes::FULL,
                vault_root: std::env::temp_dir(),
            },
            Box::new(output),
        )
    }

    fn answer(session: &Session, number: i64, text: &str) {
        let reply = ClientReply::Result(
            serde_json::value::RawValue::from_string(text.to_string()).expect("json"),
        );
        lock(&session.state)
            .server_requests
            .insert(Id::Number(number), Some(reply));
        session.wakeup.notify_all();
    }

    fn wait<'a>(limit: Duration, cancelled: &'a AtomicBool) -> ServerRequestWait<'a> {
        ServerRequestWait { limit, cancelled }
    }

    #[test]
    fn a_question_is_written_as_the_sdk_writes_it_and_numbered_from_zero() {
        let output = Written::default();
        let session = session(output.clone());
        let asker = {
            let session = Arc::clone(&session);
            std::thread::spawn(move || {
                let cancelled = AtomicBool::new(false);
                session.ask_client(
                    "x/y",
                    &serde_json::json!({"a": 1}),
                    wait(Duration::from_secs(30), &cancelled),
                )
            })
        };
        while !output.text().contains('\n') {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(
            output.text(),
            "{\"method\":\"x/y\",\"params\":{\"a\":1},\"jsonrpc\":\"2.0\",\"id\":0}\n"
        );
        answer(&session, 0, r#"{"action":"accept"}"#);
        assert!(matches!(
            asker.join().expect("joined"),
            ClientAnswer::Replied(ClientReply::Result(_))
        ));
        assert!(lock(&session.state).server_requests.is_empty());
    }

    #[test]
    fn a_question_nobody_answers_is_withdrawn_when_time_runs_out_or_the_call_is_cancelled() {
        let output = Written::default();
        let session = session(output.clone());
        let cancelled = AtomicBool::new(false);
        assert!(matches!(
            session.ask_client(
                "q",
                &serde_json::json!({}),
                wait(Duration::from_millis(30), &cancelled)
            ),
            ClientAnswer::TimedOut
        ));
        cancelled.store(true, Ordering::SeqCst);
        assert!(matches!(
            session.ask_client(
                "q",
                &serde_json::json!({}),
                wait(Duration::from_secs(30), &cancelled)
            ),
            ClientAnswer::CallCancelled
        ));
        let lines: Vec<String> = output.text().lines().map(str::to_string).collect();
        assert_eq!(lines.len(), 4, "{lines:?}");
        assert_eq!(
            lines.get(1).map(String::as_str),
            Some(
                r#"{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":0,"reason":"The question was not answered in time"}}"#
            )
        );
        assert_eq!(
            lines.get(3).map(String::as_str),
            Some(
                r#"{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1,"reason":"The call that asked was cancelled"}}"#
            )
        );
        assert!(lock(&session.state).server_requests.is_empty());
    }

    #[test]
    fn a_question_open_when_the_session_ends_is_ended_and_not_withdrawn() {
        let output = Written::default();
        let session = session(output.clone());
        let closer = {
            let session = Arc::clone(&session);
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(50));
                session.close();
            })
        };
        let cancelled = AtomicBool::new(false);
        assert!(matches!(
            session.ask_client(
                "q",
                &serde_json::json!({}),
                wait(Duration::from_secs(30), &cancelled)
            ),
            ClientAnswer::SessionEnded
        ));
        closer.join().expect("joined");
        assert_eq!(output.text().lines().count(), 1);
    }

    #[test]
    fn no_more_than_eight_questions_wait_and_answers_nobody_asked_for_take_no_place() {
        let session = session(Written::default());
        // A client that answers requests the server never made, or answers twice, must not use up
        // the places real questions wait in.
        let strays = (0..i64::try_from(MAX_OPEN_REQUESTS).unwrap_or(8) + 4)
            .map(|number| Inbound::Answer {
                id: Id::Number(100 + number),
                reply: ClientReply::Failure {
                    message: "nobody asked".to_string(),
                },
            })
            .collect();
        session.deliver(strays);
        assert!(lock(&session.state).server_requests.is_empty());
        let cancelled = AtomicBool::new(false);
        assert!(matches!(
            session.ask_client(
                "q",
                &serde_json::json!({}),
                wait(Duration::from_millis(30), &cancelled)
            ),
            ClientAnswer::TimedOut
        ));
        for number in 0..i64::try_from(MAX_OPEN_REQUESTS).unwrap_or(8) {
            lock(&session.state)
                .server_requests
                .insert(Id::Number(number), None);
        }
        assert!(matches!(
            session.ask_client(
                "q",
                &serde_json::json!({}),
                wait(Duration::from_secs(30), &cancelled)
            ),
            ClientAnswer::TooManyOpen
        ));
    }

    #[test]
    fn a_client_that_no_longer_reads_ends_the_question_and_the_session() {
        struct Closed;
        impl Write for Closed {
            fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
                Err(std::io::ErrorKind::BrokenPipe.into())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let session = Session::new(
            Config {
                modes: Modes::FULL,
                vault_root: std::env::temp_dir(),
            },
            Box::new(Closed),
        );
        let cancelled = AtomicBool::new(false);
        assert!(matches!(
            session.ask_client(
                "q",
                &serde_json::json!({}),
                wait(Duration::from_secs(30), &cancelled)
            ),
            ClientAnswer::ClientUnreachable
        ));
        assert!(session.is_closed());
    }
}
