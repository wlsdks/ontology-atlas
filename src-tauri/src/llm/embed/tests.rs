use super::loopback::Resolve;
use super::ollama::{is_embedding_only_name, PullTracker};
use super::response::parse_embeddings;
use super::transport::{curl_config, CurlTransport, Request, StreamLimits, Transport};
use super::*;
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::thread::JoinHandle;
use std::time::Duration;

mod audit_before_send;
mod batches;
mod closing_line;
mod cloud;
mod limits;
mod loopback_rule;
mod shared_reader;
mod validation;

const FAST: Timeouts = Timeouts {
    batch: "2",
    query: "1",
    probe: "1",
    line_wait: Duration::from_millis(1_500),
    query_line_wait: Duration::from_millis(200),
    question: Duration::from_secs(2),
    pull: StreamLimits {
        max_bytes: 64 * 1024,
        idle: Duration::from_secs(1),
        total: Duration::from_secs(4),
    },
};

fn loopback_resolver(_: &str, _: u16) -> io::Result<Vec<IpAddr>> {
    Ok(vec![IpAddr::V4(Ipv4Addr::LOCALHOST)])
}

type Answer = dyn Fn(&Request<'_>) -> Result<(u16, String), EmbedError> + Send + Sync;

/// Records every send and answers from a closure; the closure can look at the
/// audit log at the moment of sending. `/api/show` is answered and counted apart,
/// as a local model unless the test says otherwise.
struct Fake {
    calls: AtomicUsize,
    shows: AtomicUsize,
    answer: Box<Answer>,
    show: String,
}

const LOCAL_SHOW: &str = r#"{"details":{"family":"bert","parameter_size":"566.70M"}}"#;

impl Fake {
    fn new(
        answer: impl Fn(&Request<'_>) -> Result<(u16, String), EmbedError> + Send + Sync + 'static,
    ) -> Arc<Self> {
        Self::showing(LOCAL_SHOW, answer)
    }

    fn showing(
        show: &str,
        answer: impl Fn(&Request<'_>) -> Result<(u16, String), EmbedError> + Send + Sync + 'static,
    ) -> Arc<Self> {
        Arc::new(Self {
            calls: AtomicUsize::new(0),
            shows: AtomicUsize::new(0),
            answer: Box::new(answer),
            show: show.to_string(),
        })
    }

    fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

impl Transport for Fake {
    fn send(&self, request: &Request<'_>) -> Result<(u16, String), EmbedError> {
        if request.url.ends_with("/api/show") {
            self.shows.fetch_add(1, Ordering::SeqCst);
            return Ok((200, self.show.clone()));
        }
        self.calls.fetch_add(1, Ordering::SeqCst);
        (self.answer)(request)
    }

    fn stream(
        &self,
        _: &Request<'_>,
        _: &StreamLimits,
        _: &AtomicBool,
        _: &mut dyn FnMut(&str) -> bool,
    ) -> Result<Option<u16>, EmbedError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Err(EmbedError::Request("fake".into()))
    }
}

fn fake_runner(base: &str, fake: &Arc<Fake>) -> Result<LocalRunner, EmbedError> {
    LocalRunner::connect_with(
        base,
        "bge-m3",
        &loopback_resolver,
        fake.clone() as Arc<dyn Transport>,
        FAST,
    )
}

/// A well-formed answer of `count` vectors of `dims` values each.
fn embeddings_json(count: usize, dims: usize) -> String {
    let data: Vec<_> = (0..count)
        .map(|index| serde_json::json!({ "index": index, "embedding": vec![0.25_f32; dims] }))
        .collect();
    serde_json::json!({ "object": "list", "data": data }).to_string()
}

fn request_input_count(request: &Request<'_>) -> usize {
    let body: serde_json::Value = serde_json::from_str(request.body.unwrap_or("{}")).unwrap();
    body["input"].as_array().map_or(0, Vec::len)
}

fn temp_vault(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "atlas-embed-{tag}-{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[cfg(any(unix, windows))]
fn audit_lines(vault: &Path) -> Vec<serde_json::Value> {
    std::fs::read_to_string(crate::llm_audit::audit_log_path(vault))
        .unwrap_or_default()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

enum Reply {
    Raw(Vec<u8>),
    /// Accepts and never answers.
    Hang,
    /// Writes these lines with a pause between them, then holds the socket open.
    Trickle(Vec<String>),
}

fn http(status: &str, extra_headers: &str, body: &[u8]) -> Reply {
    let mut out = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{extra_headers}\r\n",
        body.len()
    )
    .into_bytes();
    out.extend_from_slice(body);
    Reply::Raw(out)
}

struct Stub {
    addr: SocketAddr,
    hits: Arc<AtomicUsize>,
    heads: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Stub {
    fn start(reply: impl Fn() -> Reply + Send + Sync + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let hits = Arc::new(AtomicUsize::new(0));
        let heads = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let reply = Arc::new(reply);
        let (hits_in, heads_in, stop_in) = (hits.clone(), heads.clone(), stop.clone());
        let thread = std::thread::spawn(move || {
            for stream in listener.incoming() {
                if stop_in.load(Ordering::SeqCst) {
                    return;
                }
                let Ok(mut stream) = stream else { continue };
                hits_in.fetch_add(1, Ordering::SeqCst);
                let (reply, heads) = (reply.clone(), heads_in.clone());
                let stop = stop_in.clone();
                std::thread::spawn(move || {
                    let head = read_request(&mut stream);
                    heads.lock().unwrap().push(head);
                    match reply() {
                        Reply::Raw(bytes) => {
                            let _ = stream.write_all(&bytes);
                        }
                        Reply::Hang => wait_for(&stop, Duration::from_secs(6)),
                        Reply::Trickle(lines) => {
                            let _ = stream.write_all(
                                b"HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\n\r\n",
                            );
                            for line in lines {
                                let _ = stream.write_all(format!("{line}\n").as_bytes());
                                let _ = stream.flush();
                                std::thread::sleep(Duration::from_millis(30));
                            }
                            wait_for(&stop, Duration::from_secs(6));
                        }
                    }
                });
            }
        });
        Self {
            addr,
            hits,
            heads,
            stop,
            thread: Some(thread),
        }
    }

    fn base(&self) -> String {
        format!("http://{}", self.addr)
    }

    fn hits(&self) -> usize {
        self.hits.load(Ordering::SeqCst)
    }
}

impl Drop for Stub {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(self.addr);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn wait_for(stop: &AtomicBool, at_most: Duration) {
    let until = Instant::now() + at_most;
    while !stop.load(Ordering::SeqCst) && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn read_request(stream: &mut TcpStream) -> String {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 4096];
    while let Ok(read) = stream.read(&mut chunk) {
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..read]);
        let text = String::from_utf8_lossy(&bytes);
        if let Some((head, body)) = text.split_once("\r\n\r\n") {
            let length = head
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())?
                })
                .unwrap_or(0);
            if body.len() >= length {
                return head.to_string();
            }
        }
    }
    String::from_utf8_lossy(&bytes).to_string()
}

fn curl_runner(base: &str) -> LocalRunner {
    LocalRunner::connect_with(
        base,
        "bge-m3",
        &loopback_resolver,
        Arc::new(CurlTransport),
        FAST,
    )
    .unwrap()
}

fn plan(passages: usize, chars: usize) -> BuildPlan {
    BuildPlan {
        files: 1,
        passages,
        chars,
    }
}

fn progress_lines(lines: &[&str]) -> Reply {
    http("200 OK", "", format!("{}\n", lines.join("\n")).as_bytes())
}
