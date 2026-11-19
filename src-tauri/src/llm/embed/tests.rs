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

const FAST: Timeouts = Timeouts {
    batch: "2",
    query: "1",
    probe: "1",
    line_wait: Duration::from_millis(1_500),
    query_line_wait: Duration::from_millis(200),
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

// --- A local HTTP stub, so curl's real behaviour is what the tests see. ---

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

// --- The loopback rule. ---

#[test]
fn a_remote_address_is_refused_before_any_request() {
    let fake = Fake::new(|_| Ok((200, embeddings_json(1, 4))));
    for remote in [
        "https://example.com",
        "https://93.184.216.34:11434",
        "https://10.0.0.5",
        "https://[2606:2800:220:1::]:443",
        "https://127.0.0.1.nip.io",
        "https://localhost.example.com",
    ] {
        assert!(
            matches!(fake_runner(remote, &fake), Err(EmbedError::NotLocal)),
            "{remote} must be refused"
        );
    }
    // The public entry point resolves and refuses the same way.
    assert!(matches!(
        LocalRunner::connect("https://example.com", "bge-m3"),
        Err(EmbedError::NotLocal)
    ));
    // Plain http beyond loopback is already refused by the shared address check.
    assert!(matches!(
        fake_runner("http://example.com", &fake),
        Err(EmbedError::Endpoint(_))
    ));
    assert_eq!(fake.calls(), 0);
}

#[test]
fn every_loopback_spelling_is_accepted_for_http_and_https() {
    let fake = Fake::new(|_| Ok((200, embeddings_json(1, 4))));
    for local in [
        "http://localhost:11434",
        "https://localhost:11434",
        "http://127.0.0.1:11434",
        "http://127.8.9.10",
        "https://[::1]:8443",
        "http://localhost:1234/v1",
    ] {
        assert!(
            fake_runner(local, &fake).is_ok(),
            "{local} must be accepted"
        );
    }
}

#[test]
fn a_localhost_that_resolves_elsewhere_is_refused() {
    let fake = Fake::new(|_| Ok((200, embeddings_json(1, 4))));
    let remote: &Resolve = &|_, _| Ok(vec!["93.184.216.34".parse().unwrap()]);
    let mixed: &Resolve = &|_, _| {
        Ok(vec![
            "127.0.0.1".parse().unwrap(),
            "192.168.1.20".parse().unwrap(),
        ])
    };
    let none: &Resolve = &|_, _| Ok(vec![]);
    let failing: &Resolve = &|_, _| Err(io::Error::other("no resolver"));
    for resolve in [remote, mixed, none, failing] {
        let runner = LocalRunner::connect_with(
            "http://localhost:11434",
            "bge-m3",
            resolve,
            fake.clone(),
            FAST,
        );
        assert!(matches!(runner, Err(EmbedError::ResolvesElsewhere)));
    }
    assert_eq!(fake.calls(), 0);
}

#[test]
fn a_resolved_localhost_is_pinned_and_proxies_are_off() {
    let both: &Resolve = &|_, _| Ok(vec!["::1".parse().unwrap(), "127.0.0.1".parse().unwrap()]);
    let seen = Arc::new(Mutex::new(String::new()));
    let seen_in = seen.clone();
    let fake = Fake::new(move |request| {
        *seen_in.lock().unwrap() = curl_config(request);
        Ok((200, r#"{"version":"0.35.1"}"#.into()))
    });
    let runner =
        LocalRunner::connect_with("http://localhost:11434", "bge-m3", both, fake, FAST).unwrap();
    runner.version().unwrap();
    let config = seen.lock().unwrap().clone();
    assert!(
        config.contains("resolve = \"localhost:11434:[::1],127.0.0.1\"\n"),
        "{config}"
    );
    assert!(config.contains("noproxy = \"*\"\n"), "{config}");
    assert!(config.contains("proto = \"=http,https\"\n"), "{config}");
}

#[test]
fn curl_connects_to_the_pinned_address_and_keeps_the_host_name() {
    let stub = Stub::start(|| http("200 OK", "", br#"{"version":"0.35.1"}"#));
    let runner = curl_runner(&format!("http://localhost:{}", stub.addr.port()));
    assert_eq!(runner.version().unwrap(), "0.35.1");
    let heads = stub.heads.lock().unwrap();
    let head = heads.first().unwrap().to_ascii_lowercase();
    assert!(head.starts_with("get /api/version "), "{head}");
    assert!(
        head.contains(&format!("host: localhost:{}", stub.addr.port())),
        "{head}"
    );
}

#[test]
fn a_redirect_is_refused_and_never_followed() {
    let elsewhere = Stub::start(|| http("200 OK", "", br#"{"version":"9"}"#));
    let target = format!("http://{}/api/version", elsewhere.addr);
    let stub = Stub::start(move || {
        http(
            "307 Temporary Redirect",
            &format!("Location: {target}\r\n"),
            b"",
        )
    });
    assert_eq!(
        curl_runner(&stub.base()).version(),
        Err(EmbedError::Redirected(307))
    );
    assert_eq!(stub.hits(), 1);
    assert_eq!(elsewhere.hits(), 0);
}

// --- Response limits, with curl and a real socket. ---

#[test]
fn a_five_mib_answer_is_refused() {
    let stub = Stub::start(|| http("200 OK", "", &vec![b' '; 5 * 1024 * 1024]));
    assert_eq!(
        curl_runner(&stub.base()).version(),
        Err(EmbedError::ResponseTooLarge)
    );
}

#[test]
fn a_runner_that_never_answers_times_out() {
    let stub = Stub::start(|| Reply::Hang);
    let started = Instant::now();
    assert_eq!(
        curl_runner(&stub.base()).version(),
        Err(EmbedError::TimedOut)
    );
    assert!(started.elapsed() < Duration::from_secs(5));
}

// --- Response validation. ---

#[test]
fn a_well_formed_answer_is_returned_in_index_order() {
    let text = r#"{"data":[{"index":1,"embedding":[0,1]},{"index":0,"embedding":[1,0]}]}"#;
    assert_eq!(
        parse_embeddings(text, 2, None).unwrap(),
        vec![vec![1.0, 0.0], vec![0.0, 1.0]]
    );
}

#[test]
fn every_malformed_answer_is_refused_whole() {
    let cases: [(&str, usize, Option<usize>, &str); 9] = [
        (r#"{"data":[{"embedding":[NaN,1]}]}"#, 1, None, "not-json"),
        (
            r#"{"data":[{"embedding":[1e39,1]}]}"#,
            1,
            None,
            "not-finite",
        ),
        (
            r#"{"data":[{"embedding":[-1e39,1]}]}"#,
            1,
            None,
            "not-finite",
        ),
        (
            r#"{"data":[{"embedding":[1,2]},{"embedding":[1,2,3]}]}"#,
            2,
            None,
            "dimension",
        ),
        (r#"{"data":[{"embedding":[1,2]}]}"#, 1, Some(3), "dimension"),
        (r#"{"data":[{"embedding":[]}]}"#, 1, None, "dimension"),
        (r#"{"data":[{"embedding":[1,2]}]}"#, 2, None, "count"),
        (
            r#"{"data":[{"index":0,"embedding":[1]},{"index":0,"embedding":[2]}]}"#,
            2,
            None,
            "index",
        ),
        (
            r#"{"data":[{"index":5,"embedding":[1]}]}"#,
            1,
            None,
            "index",
        ),
    ];
    for (text, count, dims, reason) in cases {
        assert_eq!(
            parse_embeddings(text, count, dims),
            Err(EmbedError::ResponseInvalid(reason)),
            "{text}"
        );
    }
}

// --- Batches. ---

#[test]
fn batches_stay_within_thirty_two_passages_and_sixty_four_kib() {
    let short = "a".repeat(100);
    let long = "가".repeat(1_900); // 5,700 bytes
    let shorts: Vec<&str> = vec![short.as_str(); 70];
    assert_eq!(plan_batches(&shorts), vec![0..32, 32..64, 64..70]);
    let longs: Vec<&str> = vec![long.as_str(); 30];
    let batches = plan_batches(&longs);
    assert!(batches
        .iter()
        .all(|b| b.len() * long.len() <= MAX_BATCH_BYTES));
    assert_eq!(batches.iter().map(|b| b.len()).sum::<usize>(), 30);
    assert!(plan_batches(&[]).is_empty());
}

#[test]
fn pull_progress_is_summed_over_layers_and_never_goes_back() {
    let mut tracker = PullTracker::default();
    let lines = [
        r#"{"status":"pulling manifest"}"#,
        r#"{"status":"pulling a","digest":"sha256:a","total":1000,"completed":500}"#,
        r#"{"status":"pulling b","digest":"sha256:b","total":1000,"completed":0}"#,
        r#"{"status":"pulling a","digest":"sha256:a","total":1000,"completed":1000}"#,
        r#"{"status":"pulling b","digest":"sha256:b","total":1000,"completed":1000}"#,
        r#"{"status":"verifying sha256 digest"}"#,
        r#"{"status":"success"}"#,
    ];
    let percents: Vec<u8> = lines
        .iter()
        .filter_map(|line| tracker.read(line))
        .map(|p| p.percent)
        .collect();
    assert_eq!(percents, vec![0, 50, 50, 50, 100, 100, 100]);
    assert!(tracker.succeeded);
    let mut failing = PullTracker::default();
    assert!(failing
        .read(r#"{"error":"pull model manifest: file does not exist"}"#)
        .is_none());
    assert_eq!(
        failing.error.as_deref(),
        Some("pull model manifest: file does not exist")
    );
    assert!(failing.read("not json").is_none());
}

#[test]
fn only_allow_listed_models_may_be_pulled() {
    let fake = Fake::new(|_| Ok((200, String::new())));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let vault = temp_vault("pull-allow");
    let cancel = AtomicBool::new(false);
    for model in [
        "embeddinggemma",
        "bge-m3:latest",
        "qwen3-embedding:8b",
        "llama3",
        "",
    ] {
        assert!(matches!(
            runner.pull(&vault, model, &cancel, &mut |_| {}),
            Err(EmbedError::ModelNotAllowed(_))
        ));
    }
    assert_eq!(fake.calls(), 0);
    assert!(!crate::llm_audit::audit_log_path(&vault).exists());
    std::fs::remove_dir_all(&vault).ok();
}

fn progress_lines(lines: &[&str]) -> Reply {
    http("200 OK", "", format!("{}\n", lines.join("\n")).as_bytes())
}

#[cfg(any(unix, windows))]
#[test]
fn a_pull_streams_progress_between_its_two_download_lines() {
    let vault = temp_vault("pull-ok");
    let vault_in = vault.clone();
    let lines_at_request = Arc::new(Mutex::new(None));
    let seen_lines = lines_at_request.clone();
    let stub = Stub::start(move || {
        *seen_lines.lock().unwrap() = Some(audit_lines(&vault_in));
        progress_lines(&[
            r#"{"status":"pulling manifest"}"#,
            r#"{"status":"pulling x","digest":"sha256:x","total":200,"completed":100}"#,
            r#"{"status":"pulling x","digest":"sha256:x","total":200,"completed":200}"#,
            r#"{"status":"success"}"#,
        ])
    });
    let mut seen = Vec::new();
    curl_runner(&stub.base())
        .pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |p| {
            seen.push(p.percent)
        })
        .unwrap();
    assert_eq!(seen, vec![0, 50, 100, 100]);
    assert!(stub.heads.lock().unwrap()[0].starts_with("POST /api/pull "));

    let before = lines_at_request.lock().unwrap().clone().unwrap();
    assert_eq!(
        before.len(),
        1,
        "the start line is on disk before the request"
    );
    assert_eq!(before[0]["purpose"], "model-download");
    assert_eq!(before[0]["download"]["phase"], "start");
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    let close = &lines[1];
    assert_eq!(close["download"]["run"], lines[0]["download"]["run"]);
    assert_eq!(close["download"]["source"], "ollama-pull");
    assert_eq!(close["download"]["revision"], "sha256:x");
    assert_eq!(close["download"]["bytes"], 200);
    assert_eq!(close["download"]["ended"], "complete");
    assert_eq!(close["model"], "bge-m3");
    assert_eq!(close["scope"]["vaultChars"], 0);
    assert_eq!(close["outcome"], "ok");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_pull_error_line_is_reported_and_closed_as_failed() {
    let vault = temp_vault("pull-error");
    let stub = Stub::start(|| {
        progress_lines(&[
            r#"{"status":"pulling manifest"}"#,
            r#"{"error":"no space left on device"}"#,
        ])
    });
    let outcome =
        curl_runner(&stub.base()).pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |_| {});
    assert_eq!(
        outcome,
        Err(EmbedError::PullFailed("no space left on device".into()))
    );
    let lines = audit_lines(&vault);
    assert_eq!(lines[1]["download"]["ended"], "failed");
    assert_eq!(lines[1]["outcome"], "error");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_pull_stops_when_cancelled() {
    let vault = temp_vault("pull-cancel");
    let stub = Stub::start(|| {
        Reply::Trickle(vec![
            r#"{"status":"pulling x","digest":"sha256:x","total":100,"completed":1}"#.into(),
            r#"{"status":"pulling x","digest":"sha256:x","total":100,"completed":2}"#.into(),
        ])
    });
    let cancel = AtomicBool::new(false);
    let started = Instant::now();
    let outcome = curl_runner(&stub.base()).pull(&vault, "bge-m3", &cancel, &mut |_| {
        cancel.store(true, Ordering::Relaxed)
    });
    assert_eq!(outcome, Err(EmbedError::Cancelled));
    assert!(started.elapsed() < Duration::from_secs(3));
    assert_eq!(audit_lines(&vault)[1]["download"]["ended"], "stopped");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_pull_stream_is_cut_at_its_byte_and_silence_limits() {
    let vault = temp_vault("pull-limits");
    let line = r#"{"status":"pulling x","digest":"sha256:x","total":100,"completed":1}"#;
    let flood = Stub::start(move || progress_lines(&vec![line; 2_000]));
    assert_eq!(
        curl_runner(&flood.base()).pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |_| {}),
        Err(EmbedError::ResponseTooLarge)
    );
    let silent = Stub::start(|| Reply::Trickle(vec![line.into()]));
    let started = Instant::now();
    assert_eq!(
        curl_runner(&silent.base()).pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |_| {}),
        Err(EmbedError::TimedOut)
    );
    assert!(started.elapsed() < Duration::from_secs(4));
    std::fs::remove_dir_all(&vault).ok();
}

#[test]
fn pull_progress_stays_linear_and_bounded_over_eighty_thousand_digests() {
    let lines: Vec<String> = (0..80_000)
        .map(|i| {
            format!(r#"{{"status":"pulling","digest":"sha256:{i}","total":10,"completed":5}}"#)
        })
        .collect();
    let mut tracker = PullTracker::default();
    let started = Instant::now();
    for line in &lines {
        tracker.read(line);
    }
    let elapsed = started.elapsed();
    assert!(elapsed < Duration::from_millis(100), "{elapsed:?}");
    assert_eq!(tracker.error.as_deref(), Some("too-many-layers"));

    let mut repeated = PullTracker::default();
    let started = Instant::now();
    for i in 0..80_000u64 {
        repeated.read(&format!(
            r#"{{"status":"pulling","digest":"sha256:{}","total":80000,"completed":{i}}}"#,
            i % 3
        ));
    }
    assert!(started.elapsed() < Duration::from_secs(2));
    assert!(repeated.error.is_none());
}

#[test]
fn embedding_models_are_found_by_capability_then_by_name() {
    let fake = Fake::new(|_| {
        Ok((
            200,
            r#"{"models":[
                {"name":"qwen3.8:27b","capabilities":["completion","tools"]},
                {"name":"qwen3-embedding:0.6b","capabilities":["embedding"]},
                {"name":"bge-m3:latest","capabilities":["embedding"]},
                {"name":"nomic-embed-text:latest"},
                {"name":"llama3:8b"}
            ]}"#
            .into(),
        ))
    });
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    assert_eq!(
        runner.embedding_models().unwrap(),
        vec![
            "bge-m3:latest",
            "nomic-embed-text:latest",
            "qwen3-embedding:0.6b"
        ]
    );
    assert!(is_embedding_only_name("BGE-M3:latest"));
    assert!(!is_embedding_only_name("bgem3"));
}

// --- Audit before send. On other platforms the log refuses, so nothing is sent. ---

fn plan(passages: usize, chars: usize) -> BuildPlan {
    BuildPlan {
        files: 1,
        passages,
        chars,
    }
}

#[cfg(not(any(unix, windows)))]
#[test]
fn without_a_supported_audit_log_nothing_is_sent() {
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let vault = temp_vault("unsupported");
    assert!(matches!(
        runner.start_build(&vault, plan(1, 5)),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert!(matches!(
        runner.embed_query(&vault, "question"),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert_eq!(fake.calls(), 0);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_run_writes_its_start_line_before_the_first_request_and_closes_after() {
    let vault = temp_vault("run");
    let lines_at_send = Arc::new(Mutex::new(Vec::new()));
    let (vault_in, seen) = (vault.clone(), lines_at_send.clone());
    let fake = Fake::new(move |request| {
        seen.lock().unwrap().push(audit_lines(&vault_in));
        Ok((200, embeddings_json(request_input_count(request), 4)))
    });
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let mut run = runner
        .start_build(
            &vault,
            BuildPlan {
                files: 2,
                passages: 3,
                chars: 15,
            },
        )
        .unwrap();
    assert_eq!(run.embed_batch(&["alpha", "bravo"]).unwrap().len(), 2);
    assert_eq!(run.embed_batch(&["gamma"]).unwrap(), vec![vec![0.25; 4]]);
    assert_eq!(run.passages_sent(), 3);
    run.finish(RunEnd::Complete).unwrap();

    let at_send = lines_at_send.lock().unwrap();
    assert_eq!(at_send.len(), 2);
    for lines in at_send.iter() {
        assert_eq!(lines.len(), 1, "only the start line exists while sending");
        assert_eq!(lines[0]["purpose"], "embed-build");
        assert_eq!(lines[0]["embed"]["phase"], "start");
    }
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    let (start, close) = (&lines[0], &lines[1]);
    assert_eq!(start["host"], "127.0.0.1:11434");
    assert_eq!(start["model"], "bge-m3");
    assert_eq!(start["embed"]["filesPlanned"], 2);
    assert_eq!(start["embed"]["passagesPlanned"], 3);
    assert_eq!(start["embed"]["charsPlanned"], 15);
    assert!(start.get("outcome").is_none());
    assert_eq!(close["embed"]["phase"], "close");
    assert_eq!(close["embed"]["run"], start["embed"]["run"]);
    assert_eq!(close["embed"]["passagesSent"], 3);
    assert_eq!(close["embed"]["charsSent"], 15);
    assert_eq!(close["embed"]["ended"], "complete");
    assert_eq!(close["outcome"], "ok");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn the_runner_serves_through_the_embedder_trait() {
    let vault = temp_vault("trait");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let embedder: &dyn Embedder = &runner;
    assert_eq!(embedder.model(), "bge-m3");
    let mut session = embedder.start_build(&vault, plan(1, 3)).unwrap();
    assert_eq!(session.embed_batch(&["one"]).unwrap().len(), 1);
    session.finish(RunEnd::Complete).unwrap();
    assert_eq!(embedder.embed_query(&vault, "q").unwrap().len(), 4);
    let purposes: Vec<_> = audit_lines(&vault)
        .iter()
        .map(|line| line["purpose"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(purposes, ["embed-build", "embed-build", "embed-query"]);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_dropped_run_closes_as_stopped() {
    let vault = temp_vault("drop");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    {
        let mut run = runner.start_build(&vault, plan(4, 100)).unwrap();
        run.embed_batch(&["one"]).unwrap();
    }
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[1]["embed"]["ended"], "stopped");
    assert_eq!(lines[1]["embed"]["passagesSent"], 1);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_bad_answer_inside_a_run_returns_no_vectors() {
    let vault = temp_vault("bad");
    for (answer, expected) in [
        (
            r#"{"data":[{"embedding":[1,2]},{"embedding":[1,2,3]}]}"#.to_string(),
            EmbedError::ResponseInvalid("dimension"),
        ),
        (
            r#"{"data":[{"embedding":[1e39,2]},{"embedding":[1,2]}]}"#.to_string(),
            EmbedError::ResponseInvalid("not-finite"),
        ),
        (embeddings_json(1, 4), EmbedError::ResponseInvalid("count")),
    ] {
        let fake = Fake::new(move |_| Ok((200, answer.clone())));
        let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
        let mut run = runner.start_build(&vault, plan(2, 10)).unwrap();
        assert_eq!(run.embed_batch(&["one", "two"]), Err(expected));
        run.finish(RunEnd::Failed).unwrap();
    }
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 6);
    assert_eq!(lines[5]["embed"]["ended"], "failed");
    assert_eq!(lines[5]["outcome"], "error");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_run_refuses_to_send_more_than_it_announced_or_an_oversized_batch() {
    let vault = temp_vault("plan");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let mut run = runner.start_build(&vault, plan(1, 3)).unwrap();
    assert_eq!(run.embed_batch(&["four"]), Err(EmbedError::OverPlan));
    assert_eq!(run.embed_batch(&["a", "b"]), Err(EmbedError::OverPlan));
    let many = vec!["x"; MAX_BATCH_PASSAGES + 1];
    assert_eq!(run.embed_batch(&many), Err(EmbedError::BatchTooLarge));
    let long = "x".repeat(MAX_PASSAGE_CHARS + 1);
    assert_eq!(
        run.embed_batch(&["ok", &long]),
        Err(EmbedError::PassageTooLong(1))
    );
    assert_eq!(run.embed_batch(&[]), Err(EmbedError::BatchEmpty));
    drop(run);
    assert_eq!(fake.calls(), 0);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn each_query_writes_one_line_holding_the_question_before_it_sends() {
    let vault = temp_vault("query");
    let (vault_in, counts) = (vault.clone(), Arc::new(Mutex::new(Vec::new())));
    let counts_in = counts.clone();
    let fake = Fake::new(move |request| {
        assert_eq!(request.timeout, FAST.query);
        counts_in.lock().unwrap().push(audit_lines(&vault_in).len());
        Ok((200, embeddings_json(1, 4)))
    });
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    for question in [
        "결제 실패는 어디서 다시 시도하나요?",
        "where is retry decided",
    ] {
        assert_eq!(runner.embed_query(&vault, question).unwrap().len(), 4);
    }
    assert_eq!(*counts.lock().unwrap(), vec![1, 2]);
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["purpose"], "embed-query");
    assert_eq!(lines[0]["question"], "결제 실패는 어디서 다시 시도하나요?");
    assert_eq!(lines[0]["outcome"], "ok");
    assert_eq!(lines[1]["question"], "where is retry decided");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_failed_query_is_still_one_closed_line() {
    let vault = temp_vault("query-down");
    let fake = Fake::new(|_| Err(EmbedError::TimedOut));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    assert_eq!(
        runner.embed_query(&vault, "anything"),
        Err(EmbedError::TimedOut)
    );
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0]["outcome"], "error");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(unix)]
#[test]
fn a_symlinked_audit_log_means_nothing_is_sent() {
    let vault = temp_vault("symlink");
    let elsewhere = temp_vault("symlink-target").join("captured.jsonl");
    std::fs::write(&elsewhere, "").unwrap();
    std::fs::create_dir_all(vault.join(".ontology-atlas")).unwrap();
    std::os::unix::fs::symlink(&elsewhere, crate::llm_audit::audit_log_path(&vault)).unwrap();
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    assert!(matches!(
        runner.start_build(&vault, plan(1, 5)),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert!(matches!(
        runner.embed_query(&vault, "question"),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert_eq!(fake.calls(), 0);
    assert_eq!(std::fs::read_to_string(&elsewhere).unwrap(), "");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(unix)]
#[test]
fn an_unwritable_audit_folder_means_nothing_is_sent() {
    use std::os::unix::fs::PermissionsExt;
    let vault = temp_vault("readonly");
    let sidecar = vault.join(".ontology-atlas");
    std::fs::create_dir_all(&sidecar).unwrap();
    std::fs::set_permissions(&sidecar, std::fs::Permissions::from_mode(0o500)).unwrap();
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let build = runner.start_build(&vault, plan(1, 5));
    let query = runner.embed_query(&vault, "question");
    std::fs::set_permissions(&sidecar, std::fs::Permissions::from_mode(0o700)).unwrap();
    assert!(matches!(build, Err(EmbedError::AuditBlocked(_))));
    assert!(matches!(query, Err(EmbedError::AuditBlocked(_))));
    assert_eq!(fake.calls(), 0);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_batch_reaches_a_real_runner_over_curl() {
    let stub = Stub::start(|| http("200 OK", "", embeddings_json(2, 3).as_bytes()));
    let vault = temp_vault("curl");
    let runner = curl_runner(&stub.base()).with_dimensions(3);
    let mut run = runner.start_build(&vault, plan(2, 6)).unwrap();
    assert_eq!(run.embed_batch(&["one", "two"]).unwrap().len(), 2);
    run.finish(RunEnd::Complete).unwrap();
    let heads = stub.heads.lock().unwrap();
    assert!(heads[0].starts_with("POST /api/show "));
    assert!(heads[1].starts_with("POST /v1/embeddings "));
    std::fs::remove_dir_all(&vault).ok();
}

#[test]
fn every_error_code_is_kebab_case() {
    for error in [
        EmbedError::Endpoint("x".into()),
        EmbedError::NotLocal,
        EmbedError::ResolvesElsewhere,
        EmbedError::AuditBlocked("x".into()),
        EmbedError::ModelInvalid,
        EmbedError::ModelNotAllowed("x".into()),
        EmbedError::BatchEmpty,
        EmbedError::BatchTooLarge,
        EmbedError::PassageTooLong(0),
        EmbedError::OverPlan,
        EmbedError::Request("x".into()),
        EmbedError::TimedOut,
        EmbedError::Redirected(302),
        EmbedError::ModelMissing,
        EmbedError::Http(500),
        EmbedError::ResponseTooLarge,
        EmbedError::ResponseInvalid("x"),
        EmbedError::Cancelled,
        EmbedError::PullFailed("x".into()),
    ] {
        let code = error.code();
        assert!(code.chars().all(|ch| ch.is_ascii_lowercase() || ch == '-'));
        assert!(error.to_string().starts_with(code));
    }
}

// --- Ollama cloud models forward the input to another host. ---

#[test]
fn a_cloud_model_name_is_refused_before_any_request() {
    let fake = Fake::new(|_| Ok((200, embeddings_json(1, 4))));
    for name in [
        "x:cloud",
        "gpt-oss:120b-cloud",
        "Embed-Cloud:latest",
        "team/cloud",
    ] {
        let runner = LocalRunner::connect_with(
            "http://127.0.0.1:11434",
            name,
            &loopback_resolver,
            fake.clone(),
            FAST,
        );
        assert!(matches!(runner, Err(EmbedError::ModelRemote)), "{name}");
    }
    assert!(LocalRunner::connect_with(
        "http://127.0.0.1:11434",
        "cloudberry-embed",
        &loopback_resolver,
        fake.clone(),
        FAST
    )
    .is_ok());
    assert_eq!(fake.calls(), 0);
}

#[test]
fn the_model_list_leaves_out_cloud_and_remote_models() {
    let fake = Fake::new(|_| {
        Ok((
            200,
            r#"{"models":[
                {"name":"x:cloud","capabilities":["embedding"]},
                {"name":"y-embed:latest","remote_host":"https://ollama.com:443","capabilities":["embedding"]},
                {"name":"z-embed:latest","details":{"remote_model":"z"},"capabilities":["embedding"]},
                {"name":"bge-m3:latest","remote_host":"","capabilities":["embedding"]}
            ]}"#
            .into(),
        ))
    });
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    assert_eq!(runner.embedding_models().unwrap(), vec!["bge-m3:latest"]);
}

#[cfg(any(unix, windows))]
#[test]
fn a_model_the_runner_shows_as_remote_is_refused_with_nothing_sent() {
    let vault = temp_vault("remote-show");
    for show in [
        r#"{"remote_host":"https://ollama.com:443","remote_model":"bge-m3"}"#,
        r#"{"details":{"remote_host":"https://ollama.com"}}"#,
        r#"{"remote_model":"bge-m3"}"#,
    ] {
        let fake = Fake::showing(show, |_| Ok((200, embeddings_json(1, 4))));
        let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
        assert!(matches!(
            runner.start_build(&vault, plan(1, 3)),
            Err(EmbedError::ModelRemote)
        ));
        assert_eq!(
            runner.embed_query(&vault, "question"),
            Err(EmbedError::ModelRemote)
        );
        assert_eq!(fake.calls(), 0, "{show}");
    }
    assert!(audit_lines(&vault).is_empty());
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_runner_that_is_not_ollama_is_checked_once_and_used() {
    let vault = temp_vault("not-ollama");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:1234/v1", &fake).unwrap();
    runner.embed_query(&vault, "one").unwrap();
    runner.embed_query(&vault, "two").unwrap();
    assert_eq!(fake.shows.load(Ordering::SeqCst), 1);
    std::fs::remove_dir_all(&vault).ok();
}

// --- A closing line waits out a query that holds the log. ---

#[cfg(any(unix, windows))]
fn hold_the_log(vault: &Path, for_how_long: Duration) -> JoinHandle<()> {
    let held = crate::llm_audit::reserve(
        vault,
        crate::llm_audit::AuditDraft {
            v: 1,
            at: crate::llm_audit::now_iso(),
            provider: "local".into(),
            host: "127.0.0.1:11434".into(),
            model: Some("bge-m3".into()),
            purpose: "embed-query".into(),
            question: Some("held".into()),
            scope: crate::llm_audit::AuditScope {
                nodes: vec![],
                prompt_chars: 4,
                vault_chars: 0,
            },
            tools: None,
            payload_sha256: crate::llm_audit::sha256_hex(""),
            embed: None,
            download: None,
        },
    )
    .unwrap();
    std::thread::spawn(move || {
        std::thread::sleep(for_how_long);
        crate::llm_audit::finalize(
            held,
            &crate::llm_audit::AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 1,
                duration_ms: 1,
            },
        )
        .unwrap();
    })
}

#[cfg(any(unix, windows))]
#[test]
fn a_closing_line_waits_for_a_query_that_holds_the_log() {
    let vault = temp_vault("close-wait");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let mut run = runner.start_build(&vault, plan(1, 3)).unwrap();
    run.embed_batch(&["one"]).unwrap();
    let holder = hold_the_log(&vault, Duration::from_millis(400));
    run.finish(RunEnd::Complete).unwrap();
    holder.join().unwrap();
    let phases: Vec<_> = audit_lines(&vault)
        .iter()
        .map(|line| {
            line["embed"]["phase"]
                .as_str()
                .unwrap_or("query")
                .to_string()
        })
        .collect();
    assert_eq!(phases, ["start", "query", "close"]);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_closing_line_that_cannot_be_written_is_reported_not_dropped() {
    let vault = temp_vault("close-lost");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = LocalRunner::connect_with(
        "http://127.0.0.1:11434",
        "bge-m3",
        &loopback_resolver,
        fake.clone(),
        Timeouts {
            line_wait: Duration::from_millis(100),
            ..FAST
        },
    )
    .unwrap();
    let mut run = runner.start_build(&vault, plan(1, 3)).unwrap();
    run.embed_batch(&["one"]).unwrap();
    let holder = hold_the_log(&vault, Duration::from_millis(800));
    let closed = run.finish(RunEnd::Complete);
    holder.join().unwrap();
    assert!(
        matches!(&closed, Err(EmbedError::AuditBlocked(detail)) if detail == "audit-blocked:audit-log-busy"),
        "{closed:?}"
    );
    std::fs::remove_dir_all(&vault).ok();
}

// --- The lines this module writes are the lines the Settings screen reads. ---

#[cfg(any(unix, windows))]
#[test]
fn the_embed_and_download_lines_match_the_shared_reader_fixture() {
    fn stable(mut line: serde_json::Value) -> serde_json::Value {
        line["at"] = "2026-11-19T09:00:00.000Z".into();
        if line.get("durationMs").is_some() {
            line["durationMs"] = 1.into();
        }
        for key in ["embed", "download"] {
            if line.get(key).is_some() {
                line[key]["run"] = "00000000-0000-4000-8000-000000000000".into();
            }
        }
        line
    }
    let vault = temp_vault("fixture");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let mut run = runner
        .start_build(
            &vault,
            BuildPlan {
                files: 1,
                passages: 2,
                chars: 10,
            },
        )
        .unwrap();
    run.embed_batch(&["alpha", "bravo"]).unwrap();
    run.finish(RunEnd::Complete).unwrap();
    runner
        .embed_query(&vault, "결제 재시도는 어디서 정하나요?")
        .unwrap();
    let pull = Stub::start(|| {
        progress_lines(&[
            r#"{"status":"pulling x","digest":"sha256:daec91ffb5dd0c27411bd71f29932917c49cf529a641d0168496c3a501e3062c","total":1157671200,"completed":1157671200}"#,
            r#"{"status":"success"}"#,
        ])
    });
    let puller = LocalRunner::connect_with(
        "http://127.0.0.1:11434",
        "bge-m3",
        &loopback_resolver,
        Arc::new(CurlTransport),
        FAST,
    )
    .unwrap();
    let pull_base = pull.base();
    let pulling = LocalRunner {
        endpoint: loopback::local_endpoint(&pull_base, &loopback_resolver).unwrap(),
        ..puller
    };
    pulling
        .pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |_| {})
        .unwrap();

    let written: Vec<_> = audit_lines(&vault).into_iter().map(stable).collect();
    let fixture: Vec<serde_json::Value> =
        include_str!("../../../../tests/fixtures/llm-audit-log.sample.jsonl")
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str(line).unwrap())
            .filter(|line: &serde_json::Value| {
                line["purpose"]
                    .as_str()
                    .is_some_and(|p| p.starts_with("embed-") || p == "model-download")
            })
            .collect();
    let mut expected = fixture;
    // The pull stub listens on a random port; the fixture names the default one.
    for line in written.iter().zip(expected.iter_mut()) {
        if line.0["purpose"] == "model-download" {
            line.1["host"] = line.0["host"].clone();
        }
    }
    assert_eq!(written, expected);
    std::fs::remove_dir_all(&vault).ok();
}
