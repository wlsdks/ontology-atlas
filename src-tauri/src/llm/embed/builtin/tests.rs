use super::download::{checked_url, part_path, Downloader};
use super::fetch::{parse_head, ContentRange, CurlFetch, Fetch, Head, Sink};
use super::infer::{groups, nfc, Encoder};
use super::pins::{self, PinnedFile};
use super::*;
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::xlm_roberta::{Config, XLMRobertaModel};
use std::collections::HashMap;
use std::io::{Read as _, Write as _};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

mod measure;

fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "atlas-builtin-{tag}-{}",
        uuid::Uuid::new_v4().simple()
    ));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn audit_lines(vault: &Path) -> Vec<serde_json::Value> {
    fs::read_to_string(crate::llm_audit::audit_log_path(vault))
        .unwrap_or_default()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

/// An audit log that cannot be opened: a directory where the file belongs.
fn block_audit_log(vault: &Path) {
    fs::create_dir_all(crate::llm_audit::audit_log_path(vault)).unwrap();
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    dot / (na * nb)
}

// --- Download: a scripted transport keyed by URL. ---

fn pinned(name: &'static str, data: &[u8]) -> PinnedFile {
    PinnedFile {
        name,
        bytes: data.len() as u64,
        sha256: Box::leak(super::super::hex(&Sha256::digest(data)).into_boxed_str()),
    }
}

fn bytes(len: usize, seed: u32) -> Vec<u8> {
    let mut state = seed;
    (0..len)
        .map(|_| {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (state >> 24) as u8
        })
        .collect()
}

#[derive(Clone)]
struct Response {
    head: Head,
    body: Vec<u8>,
}

fn redirect(location: &str) -> Response {
    Response {
        head: Head {
            status: 302,
            location: Some(location.to_string()),
            ..Head::default()
        },
        body: Vec::new(),
    }
}

/// 200 for the whole file, 206 with a Content-Range when asked from an offset.
fn serve(data: &[u8], from: u64) -> Response {
    let len = data.len() as u64;
    if from == 0 {
        return Response {
            head: Head {
                status: 200,
                content_length: Some(len),
                ..Head::default()
            },
            body: data.to_vec(),
        };
    }
    Response {
        head: Head {
            status: 206,
            content_length: Some(len - from),
            content_range: Some(ContentRange {
                start: from,
                end: len - 1,
                total: len,
            }),
            ..Head::default()
        },
        body: data.get(from as usize..).unwrap().to_vec(),
    }
}

type Route = Box<dyn Fn(u64) -> Response + Send + Sync>;

struct FakeFetch {
    routes: HashMap<String, Route>,
    requests: Mutex<Vec<(String, u64)>>,
    /// Audit lines on disk when each request was made.
    lines_at_request: Mutex<Vec<usize>>,
    vault: PathBuf,
    /// Stops the transfer, as a person pressing Stop would, after this many body bytes.
    stop_after: Option<u64>,
    sent: AtomicUsize,
}

impl FakeFetch {
    fn new(vault: &Path) -> Self {
        Self {
            routes: HashMap::new(),
            requests: Mutex::new(Vec::new()),
            lines_at_request: Mutex::new(Vec::new()),
            vault: vault.to_path_buf(),
            stop_after: None,
            sent: AtomicUsize::new(0),
        }
    }

    fn route(mut self, url: &str, route: impl Fn(u64) -> Response + Send + Sync + 'static) -> Self {
        self.routes.insert(url.to_string(), Box::new(route));
        self
    }

    /// huggingface.co redirects to a CDN host, which serves `data`.
    fn hosting(self, file: &PinnedFile, data: Vec<u8>) -> Self {
        let cdn = format!("https://cdn-lfs.hf.co/repos/x/{}?sig=abc", file.name);
        let to = cdn.clone();
        self.route(&pins::resolve_url(file), move |_| redirect(&to))
            .route(&cdn, move |from| serve(&data, from))
    }

    fn requests(&self) -> Vec<(String, u64)> {
        self.requests.lock().unwrap().clone()
    }
}

impl Fetch for FakeFetch {
    fn get(
        &self,
        url: &str,
        from: u64,
        cancel: &AtomicBool,
        sink: &mut dyn Sink,
    ) -> Result<(), EmbedError> {
        self.requests.lock().unwrap().push((url.to_string(), from));
        self.lines_at_request
            .lock()
            .unwrap()
            .push(audit_lines(&self.vault).len());
        let route = self
            .routes
            .get(url)
            .unwrap_or_else(|| panic!("no route for {url}"));
        let response = route(from);
        if !sink.head(&response.head)? {
            return Ok(());
        }
        for chunk in response.body.chunks(7) {
            if let Some(limit) = self.stop_after {
                if self.sent.load(Ordering::SeqCst) as u64 >= limit {
                    cancel.store(true, Ordering::SeqCst);
                    return Err(EmbedError::Cancelled);
                }
            }
            sink.body(chunk)?;
            self.sent.fetch_add(chunk.len(), Ordering::SeqCst);
        }
        Ok(())
    }
}

struct Files {
    tokenizer: (PinnedFile, Vec<u8>),
    weights: (PinnedFile, Vec<u8>),
}

fn files() -> Files {
    let tokenizer = bytes(120, 7);
    let weights = bytes(1_000, 11);
    Files {
        tokenizer: (pinned("tokenizer.json", &tokenizer), tokenizer),
        weights: (pinned("pytorch_model.bin", &weights), weights),
    }
}

fn download(
    fake: &FakeFetch,
    files: &[PinnedFile],
    dir: &Path,
    vault: &Path,
    cancel: &AtomicBool,
) -> (Result<DownloadReport, EmbedError>, Vec<Progress>) {
    let mut seen = Vec::new();
    let result = Downloader {
        fetch: fake,
        files,
        dir,
        vault_dir: vault,
        cancel,
        on_progress: &mut |progress| seen.push(*progress),
    }
    .run();
    (result, seen)
}

#[test]
fn downloads_through_an_allowed_redirect_after_its_start_line() {
    let (vault, dir) = (temp_dir("dl-vault"), temp_dir("dl-model"));
    let f = files();
    let fake = FakeFetch::new(&vault)
        .hosting(&f.tokenizer.0, f.tokenizer.1.clone())
        .hosting(&f.weights.0, f.weights.1.clone());
    let pins = [f.tokenizer.0, f.weights.0];
    let (result, progress) = download(&fake, &pins, &dir, &vault, &AtomicBool::new(false));
    let report = result.unwrap();

    assert_eq!(report.hosts, vec!["huggingface.co", "cdn-lfs.hf.co"]);
    assert_eq!(report.bytes_received, 1_120);
    assert_eq!(fs::read(dir.join("tokenizer.json")).unwrap(), f.tokenizer.1);
    assert_eq!(
        fs::read(dir.join("pytorch_model.bin")).unwrap(),
        f.weights.1
    );
    assert!(!part_path(&dir, &f.weights.0).exists());
    assert!(fake
        .lines_at_request
        .lock()
        .unwrap()
        .iter()
        .all(|&n| n == 1));
    let last = progress.last().unwrap();
    assert_eq!(
        (last.stage, last.done, last.total),
        (Stage::Download, 1_120, 1_120)
    );
    assert!(progress.windows(2).all(|pair| pair[0].done <= pair[1].done));

    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    for line in &lines {
        assert_eq!(line["purpose"], "model-download");
        assert_eq!(line["provider"], "built-in");
        assert_eq!(line["host"], "huggingface.co");
        assert_eq!(line["question"], serde_json::Value::Null);
        assert_eq!(line["scope"]["vaultChars"], 0);
        assert_eq!(line["download"]["source"], "hugging-face");
        assert_eq!(line["download"]["revision"], pins::REVISION);
    }
    assert_eq!(lines[0]["download"]["phase"], "start");
    assert_eq!(lines[1]["download"]["phase"], "close");
    assert_eq!(lines[1]["download"]["ended"], "complete");
    assert_eq!(lines[1]["download"]["bytes"], 1_120);
    assert_eq!(lines[1]["outcome"], "ok");
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn resumes_a_partial_file_from_where_it_stopped() {
    let (vault, dir) = (temp_dir("resume-vault"), temp_dir("resume-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    fs::write(
        part_path(&dir, &f.weights.0),
        f.weights.1.get(..400).unwrap(),
    )
    .unwrap();
    let fake = FakeFetch::new(&vault).hosting(&f.weights.0, f.weights.1.clone());
    let pins = [f.tokenizer.0, f.weights.0];
    let (result, _) = download(&fake, &pins, &dir, &vault, &AtomicBool::new(false));

    assert_eq!(result.unwrap().bytes_received, 600);
    assert!(fake.requests().iter().all(|(_, from)| *from == 400));
    assert_eq!(
        fs::read(dir.join("pytorch_model.bin")).unwrap(),
        f.weights.1
    );
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn starts_over_when_the_server_ignores_the_range() {
    let (vault, dir) = (temp_dir("norange-vault"), temp_dir("norange-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    fs::write(
        part_path(&dir, &f.weights.0),
        f.weights.1.get(..400).unwrap(),
    )
    .unwrap();
    let data = f.weights.1.clone();
    let fake =
        FakeFetch::new(&vault).route(&pins::resolve_url(&f.weights.0), move |_| serve(&data, 0));
    let pins = [f.tokenizer.0, f.weights.0];
    let (result, _) = download(&fake, &pins, &dir, &vault, &AtomicBool::new(false));

    assert_eq!(result.unwrap().bytes_received, 1_000);
    assert_eq!(
        fs::read(dir.join("pytorch_model.bin")).unwrap(),
        f.weights.1
    );
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_file_already_in_place_asks_nothing_and_writes_no_line() {
    let (vault, dir) = (temp_dir("present-vault"), temp_dir("present-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    fs::write(dir.join("pytorch_model.bin"), &f.weights.1).unwrap();
    let fake = FakeFetch::new(&vault);
    let pins = [f.tokenizer.0, f.weights.0];
    let (result, progress) = download(&fake, &pins, &dir, &vault, &AtomicBool::new(false));

    assert_eq!(result.unwrap(), DownloadReport::default());
    assert!(fake.requests().is_empty());
    assert!(!crate::llm_audit::audit_log_path(&vault).exists());
    assert!(progress.iter().all(|p| p.stage == Stage::Verify));
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_hash_mismatch_deletes_the_download_and_closes_as_failed() {
    let (vault, dir) = (temp_dir("hash-vault"), temp_dir("hash-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    let mut tampered = f.weights.1.clone();
    tampered[500] ^= 1;
    let fake = FakeFetch::new(&vault).hosting(&f.weights.0, tampered);
    let pins = [f.tokenizer.0, f.weights.0];
    let (result, _) = download(&fake, &pins, &dir, &vault, &AtomicBool::new(false));

    assert!(matches!(result, Err(EmbedError::HashMismatch(name)) if name == "pytorch_model.bin"));
    assert!(!dir.join("pytorch_model.bin").exists());
    assert!(!part_path(&dir, &f.weights.0).exists());
    let lines = audit_lines(&vault);
    assert_eq!(lines[1]["download"]["ended"], "failed");
    assert_eq!(lines[1]["outcome"], "error");
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_size_mismatch_is_refused_before_or_while_the_body_arrives() {
    let f = files();
    let url = pins::resolve_url(&f.weights.0);
    let data = f.weights.1.clone();
    let wrong_length: Route = Box::new(move |_| Response {
        head: Head {
            status: 200,
            content_length: Some(999),
            ..Head::default()
        },
        body: data.clone(),
    });
    let mut longer = f.weights.1.clone();
    longer.extend_from_slice(b"extra");
    let too_long: Route = Box::new(move |_| Response {
        head: Head {
            status: 200,
            ..Head::default()
        },
        body: longer.clone(),
    });
    let wrong_total: Route = Box::new(|from| Response {
        head: Head {
            status: 206,
            content_range: Some(ContentRange {
                start: from,
                end: 1_999,
                total: 2_000,
            }),
            ..Head::default()
        },
        body: Vec::new(),
    });
    for (tag, route, partial) in [
        ("length", wrong_length, 0),
        ("long", too_long, 0),
        ("total", wrong_total, 100),
    ] {
        let (vault, dir) = (temp_dir("size-vault"), temp_dir("size-model"));
        fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
        if partial > 0 {
            fs::write(
                part_path(&dir, &f.weights.0),
                f.weights.1.get(..partial).unwrap(),
            )
            .unwrap();
        }
        let mut fake = FakeFetch::new(&vault);
        fake.routes.insert(url.clone(), route);
        let pins = [f.tokenizer.0, f.weights.0];
        let (result, _) = download(&fake, &pins, &dir, &vault, &AtomicBool::new(false));
        assert!(
            matches!(result, Err(EmbedError::SizeMismatch(_))),
            "{tag}: {result:?}"
        );
        assert!(!part_path(&dir, &f.weights.0).exists(), "{tag}");
        assert!(!dir.join("pytorch_model.bin").exists(), "{tag}");
        fs::remove_dir_all(&vault).ok();
        fs::remove_dir_all(&dir).ok();
    }
}

#[test]
fn stop_keeps_the_partial_file_and_the_next_run_resumes_it() {
    let (vault, dir) = (temp_dir("stop-vault"), temp_dir("stop-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    let pins = [f.tokenizer.0, f.weights.0];
    let mut fake = FakeFetch::new(&vault).hosting(&f.weights.0, f.weights.1.clone());
    fake.stop_after = Some(300);
    let cancel = AtomicBool::new(false);
    let (result, _) = download(&fake, &pins, &dir, &vault, &cancel);

    assert!(matches!(result, Err(EmbedError::Cancelled)));
    let kept = fs::metadata(part_path(&dir, &f.weights.0)).unwrap().len();
    assert!((300..1_000).contains(&kept), "{kept}");
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[1]["download"]["ended"], "stopped");
    assert_eq!(lines[1]["download"]["bytes"], kept);

    let fake = FakeFetch::new(&vault).hosting(&f.weights.0, f.weights.1.clone());
    let (result, _) = download(&fake, &pins, &dir, &vault, &AtomicBool::new(false));
    assert_eq!(result.unwrap().bytes_received, 1_000 - kept);
    assert!(fake.requests().iter().all(|(_, from)| *from == kept));
    assert_eq!(
        fs::read(dir.join("pytorch_model.bin")).unwrap(),
        f.weights.1
    );
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn an_unwritable_audit_log_means_nothing_is_requested() {
    let (vault, dir) = (temp_dir("blocked-vault"), temp_dir("blocked-model"));
    block_audit_log(&vault);
    let f = files();
    let fake = FakeFetch::new(&vault)
        .hosting(&f.tokenizer.0, f.tokenizer.1.clone())
        .hosting(&f.weights.0, f.weights.1.clone());
    let pins = [f.tokenizer.0, f.weights.0];
    let (result, _) = download(&fake, &pins, &dir, &vault, &AtomicBool::new(false));

    assert!(matches!(result, Err(EmbedError::AuditBlocked(_))));
    assert!(fake.requests().is_empty());
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_redirect_outside_the_allowed_hosts_is_never_followed() {
    let (vault, dir) = (temp_dir("evil-vault"), temp_dir("evil-model"));
    let f = files();
    let fake = FakeFetch::new(&vault).route(&pins::resolve_url(&f.tokenizer.0), |_| {
        redirect("https://downloads.example.com/tokenizer.json")
    });
    let pins = [f.tokenizer.0, f.weights.0];
    let (result, _) = download(&fake, &pins, &dir, &vault, &AtomicBool::new(false));

    assert!(
        matches!(&result, Err(EmbedError::HostRefused(host)) if host == "https://downloads.example.com"),
        "{result:?}"
    );
    assert_eq!(fake.requests().len(), 1);
    assert_eq!(audit_lines(&vault)[1]["download"]["ended"], "failed");
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn only_https_on_hugging_face_hosts_passes_the_redirect_check() {
    let base =
        url::Url::parse("https://huggingface.co/BAAI/bge-m3/resolve/x/tokenizer.json").unwrap();
    for allowed in [
        "https://cdn-lfs.hf.co/repos/a/b?X-Amz-Signature=1",
        "https://cas-bridge.xethub.hf.co/xet-bridge-us/abc",
        "https://cdn-lfs-us-1.huggingface.co/x",
        "/api/resolve-cache/models/BAAI/bge-m3/x/tokenizer.json",
    ] {
        assert!(checked_url(allowed, Some(&base)).is_ok(), "{allowed}");
    }
    for refused in [
        "http://cdn-lfs.hf.co/x",
        "https://huggingface.co.evil.example.com/x",
        "https://evilhf.co/x",
        "https://user@cdn-lfs.hf.co/x",
        "https://huggingface.co@evil.example.com/x",
        "https://cdn-lfs.hf.co:8443/x",
        "https://127.0.0.1/x",
        "https://[::1]/x",
        "ftp://huggingface.co/x",
        "//evil.example.com/x",
    ] {
        assert!(
            matches!(
                checked_url(refused, Some(&base)),
                Err(EmbedError::HostRefused(_))
            ),
            "{refused}"
        );
    }
}

#[test]
fn a_relative_redirect_stays_on_huggingface() {
    let (vault, dir) = (temp_dir("rel-vault"), temp_dir("rel-model"));
    let f = files();
    let cache = "https://huggingface.co/api/resolve-cache/models/BAAI/bge-m3/x/tokenizer.json";
    let data = f.tokenizer.1.clone();
    let fake = FakeFetch::new(&vault)
        .route(&pins::resolve_url(&f.tokenizer.0), |_| {
            redirect("/api/resolve-cache/models/BAAI/bge-m3/x/tokenizer.json")
        })
        .route(cache, move |from| serve(&data, from));
    let (result, _) = download(
        &fake,
        &[f.tokenizer.0],
        &dir,
        &vault,
        &AtomicBool::new(false),
    );
    assert_eq!(result.unwrap().hosts, vec!["huggingface.co"]);
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_redirect_loop_ends() {
    let (vault, dir) = (temp_dir("loop-vault"), temp_dir("loop-model"));
    let f = files();
    let url = pins::resolve_url(&f.tokenizer.0);
    let again = url.clone();
    let fake = FakeFetch::new(&vault).route(&url, move |_| redirect(&again));
    let (result, _) = download(
        &fake,
        &[f.tokenizer.0],
        &dir,
        &vault,
        &AtomicBool::new(false),
    );
    assert!(matches!(result, Err(EmbedError::ResponseInvalid(_))));
    assert!(fake.requests().len() <= 9);
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn response_heads_parse_from_http1_and_http2() {
    let head = parse_head(&[
        "HTTP/2 206".to_string(),
        "content-range: bytes 400-999/1000".to_string(),
        "Content-Length: 600".to_string(),
    ])
    .unwrap();
    assert_eq!(head.status, 206);
    assert_eq!(head.content_length, Some(600));
    assert_eq!(
        head.content_range,
        Some(ContentRange {
            start: 400,
            end: 999,
            total: 1_000
        })
    );
    let head = parse_head(&[
        "HTTP/1.1 302 Found".to_string(),
        "Location: https://cdn-lfs.hf.co/a?b=c:d".to_string(),
    ])
    .unwrap();
    assert_eq!(
        head.location.as_deref(),
        Some("https://cdn-lfs.hf.co/a?b=c:d")
    );
    assert!(parse_head(&["garbage".to_string()]).is_err());
}

#[test]
fn the_shipped_transport_asks_https_only_and_sends_nothing_else() {
    let config = fetch::HTTPS_ONLY.config("https://huggingface.co/x\"\nurl = \"https://evil", 7);
    assert!(config.contains("proto = \"=https\"\n"));
    assert!(config.contains("noproxy = \"*\"\n"));
    assert!(config.contains("header = \"Range: bytes=7-\"\n"));
    let starting = |key: &str| config.lines().filter(|line| line.starts_with(key)).count();
    assert_eq!(starting("url = "), 1);
    assert_eq!(starting("header = "), 1);
    assert_eq!(config.lines().count(), 7);
    assert!(!fetch::HTTPS_ONLY
        .config("https://huggingface.co/x", 0)
        .contains("header"));
}

// --- The curl transport against a local server. ---

struct Stub {
    addr: std::net::SocketAddr,
    heads: Arc<Mutex<Vec<String>>>,
}

fn read_request(stream: &mut TcpStream) -> String {
    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    while !head.ends_with(b"\r\n\r\n") {
        if stream.read(&mut byte).unwrap_or(0) == 0 {
            break;
        }
        head.push(byte[0]);
    }
    String::from_utf8_lossy(&head).to_string()
}

fn stub(reply: impl Fn(&str) -> Vec<u8> + Send + Sync + 'static) -> Stub {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let heads = Arc::new(Mutex::new(Vec::new()));
    let heads_in = heads.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let head = read_request(&mut stream);
            heads_in.lock().unwrap().push(head.clone());
            let _ = stream.write_all(&reply(&head));
        }
    });
    Stub { addr, heads }
}

const LOCAL_HTTP: CurlFetch = CurlFetch {
    protocols: "=http",
    connect_timeout: std::time::Duration::from_secs(2),
    idle: std::time::Duration::from_secs(2),
};

#[derive(Default)]
struct Collect {
    head: Option<Head>,
    body: Vec<u8>,
    follow_body: bool,
}

impl Sink for Collect {
    fn head(&mut self, head: &Head) -> Result<bool, EmbedError> {
        self.head = Some(head.clone());
        Ok(self.follow_body)
    }

    fn body(&mut self, chunk: &[u8]) -> Result<(), EmbedError> {
        self.body.extend_from_slice(chunk);
        Ok(())
    }
}

#[test]
fn curl_asks_for_the_rest_of_a_file_and_hands_over_head_and_body() {
    let data = bytes(300_000, 3);
    let served = data.clone();
    let server = stub(move |head| {
        let from: usize = head
            .lines()
            .find_map(|line| {
                line.to_ascii_lowercase()
                    .strip_prefix("range: bytes=")
                    .map(str::to_string)
            })
            .and_then(|range| range.trim_end_matches('-').parse().ok())
            .unwrap_or(0);
        let body = served.get(from..).unwrap();
        let mut out = format!(
            "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {from}-{}/{}\r\nConnection: close\r\n\r\n",
            body.len(),
            served.len() - 1,
            served.len()
        )
        .into_bytes();
        out.extend_from_slice(body);
        out
    });
    let mut sink = Collect {
        follow_body: true,
        ..Collect::default()
    };
    LOCAL_HTTP
        .get(
            &format!("http://{}/file", server.addr),
            1_000,
            &AtomicBool::new(false),
            &mut sink,
        )
        .unwrap();
    let head = sink.head.unwrap();
    assert_eq!(head.status, 206);
    assert_eq!(head.content_range.unwrap().start, 1_000);
    assert_eq!(sink.body, data.get(1_000..).unwrap());
    let heads = server.heads.lock().unwrap();
    let asked = heads[0].to_ascii_lowercase();
    assert!(asked.contains("range: bytes=1000-"), "{asked}");
    assert!(
        !asked.contains("cookie") && !asked.contains("authorization"),
        "{asked}"
    );
}

#[test]
fn curl_hands_back_a_redirect_without_following_it() {
    let server = stub(|_| {
        b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/next\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            .to_vec()
    });
    let mut sink = Collect::default();
    LOCAL_HTTP
        .get(
            &format!("http://{}/file", server.addr),
            0,
            &AtomicBool::new(false),
            &mut sink,
        )
        .unwrap();
    assert_eq!(
        sink.head.unwrap().location.as_deref(),
        Some("http://127.0.0.1:9/next")
    );
    assert_eq!(server.heads.lock().unwrap().len(), 1);
}

#[test]
fn the_shipped_transport_refuses_plain_http_before_connecting() {
    let server = stub(|_| b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n".to_vec());
    let mut sink = Collect::default();
    let result = fetch::HTTPS_ONLY.get(
        &format!("http://{}/file", server.addr),
        0,
        &AtomicBool::new(false),
        &mut sink,
    );
    assert!(result.is_err());
    assert!(sink.head.is_none());
    std::thread::sleep(std::time::Duration::from_millis(100));
    assert!(server.heads.lock().unwrap().is_empty());
}

// --- A tiny XLM-RoBERTa checkpoint in the publisher's format. ---

const TINY_CONFIG: &str = r#"{
  "hidden_size": 8, "layer_norm_eps": 1e-05, "attention_probs_dropout_prob": 0.1,
  "hidden_dropout_prob": 0.1, "num_attention_heads": 2, "position_embedding_type": "absolute",
  "intermediate_size": 16, "hidden_act": "gelu", "num_hidden_layers": 2, "vocab_size": 24,
  "max_position_embeddings": 40, "type_vocab_size": 1, "pad_token_id": 1
}"#;

const WORDS: [&str; 16] = [
    "search",
    "meaning",
    "invoice",
    "partner",
    "monthly",
    "weekly",
    "dawn",
    "wave",
    "depot",
    "검색",
    "의미",
    "문서",
    "찾기",
    "한국어",
    "정산",
    "배송",
];

fn tiny_tokenizer_json() -> String {
    let mut vocab = serde_json::Map::new();
    for (id, token) in ["<s>", "<pad>", "</s>", "<unk>"].iter().enumerate() {
        vocab.insert((*token).into(), id.into());
    }
    for (offset, word) in WORDS.iter().enumerate() {
        vocab.insert((*word).into(), (4 + offset).into());
    }
    let special = |id: u32, content: &str| {
        serde_json::json!({ "id": id, "content": content, "single_word": false, "lstrip": false,
            "rstrip": false, "normalized": false, "special": true })
    };
    serde_json::json!({
        "version": "1.0",
        "truncation": null,
        "padding": null,
        "added_tokens": [special(0, "<s>"), special(1, "<pad>"), special(2, "</s>"), special(3, "<unk>")],
        "normalizer": null,
        "pre_tokenizer": { "type": "Whitespace" },
        "post_processor": {
            "type": "TemplateProcessing",
            "single": [
                { "SpecialToken": { "id": "<s>", "type_id": 0 } },
                { "Sequence": { "id": "A", "type_id": 0 } },
                { "SpecialToken": { "id": "</s>", "type_id": 0 } }
            ],
            "pair": [
                { "SpecialToken": { "id": "<s>", "type_id": 0 } },
                { "Sequence": { "id": "A", "type_id": 0 } },
                { "SpecialToken": { "id": "</s>", "type_id": 0 } },
                { "Sequence": { "id": "B", "type_id": 0 } },
                { "SpecialToken": { "id": "</s>", "type_id": 0 } }
            ],
            "special_tokens": {
                "<s>": { "id": "<s>", "ids": [0], "tokens": ["<s>"] },
                "</s>": { "id": "</s>", "ids": [2], "tokens": ["</s>"] }
            }
        },
        "decoder": null,
        "model": { "type": "WordLevel", "vocab": vocab, "unk_token": "<unk>" }
    })
    .to_string()
}

fn tiny_shapes() -> Vec<(String, Vec<usize>)> {
    let (h, i, v, p) = (8, 16, 24, 40);
    let mut shapes = vec![
        ("embeddings.word_embeddings.weight".to_string(), vec![v, h]),
        (
            "embeddings.position_embeddings.weight".to_string(),
            vec![p, h],
        ),
        (
            "embeddings.token_type_embeddings.weight".to_string(),
            vec![1, h],
        ),
        ("embeddings.LayerNorm.weight".to_string(), vec![h]),
        ("embeddings.LayerNorm.bias".to_string(), vec![h]),
        ("pooler.dense.weight".to_string(), vec![h, h]),
        ("pooler.dense.bias".to_string(), vec![h]),
    ];
    for layer in 0..2 {
        let at = |name: &str| format!("encoder.layer.{layer}.{name}");
        for part in ["query", "key", "value"] {
            shapes.push((at(&format!("attention.self.{part}.weight")), vec![h, h]));
            shapes.push((at(&format!("attention.self.{part}.bias")), vec![h]));
        }
        shapes.push((at("attention.output.dense.weight"), vec![h, h]));
        shapes.push((at("attention.output.dense.bias"), vec![h]));
        shapes.push((at("attention.output.LayerNorm.weight"), vec![h]));
        shapes.push((at("attention.output.LayerNorm.bias"), vec![h]));
        shapes.push((at("intermediate.dense.weight"), vec![i, h]));
        shapes.push((at("intermediate.dense.bias"), vec![i]));
        shapes.push((at("output.dense.weight"), vec![h, i]));
        shapes.push((at("output.dense.bias"), vec![h]));
        shapes.push((at("output.LayerNorm.weight"), vec![h]));
        shapes.push((at("output.LayerNorm.bias"), vec![h]));
    }
    shapes
}

fn tiny_values(name: &str, count: usize, seed: u32) -> Vec<f32> {
    let mut state = seed;
    (0..count)
        .map(|_| {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let noise = (state >> 8) as f32 / (1u32 << 24) as f32 - 0.5;
            if name.ends_with("LayerNorm.weight") {
                1.0 + 0.1 * noise
            } else {
                noise
            }
        })
        .collect()
}

/// Just the pickle opcodes a PyTorch checkpoint uses: a dict of
/// `_rebuild_tensor_v2(storage, offset, size, stride, False, OrderedDict())`.
fn pickle_state_dict(shapes: &[(String, Vec<usize>)]) -> Vec<u8> {
    fn int(out: &mut Vec<u8>, value: usize) {
        if value < 256 {
            out.extend_from_slice(&[b'K', value as u8]);
        } else {
            out.push(b'J');
            out.extend_from_slice(&(value as i32).to_le_bytes());
        }
    }
    fn text(out: &mut Vec<u8>, value: &str) {
        out.push(b'X');
        out.extend_from_slice(&(value.len() as u32).to_le_bytes());
        out.extend_from_slice(value.as_bytes());
    }
    fn global(out: &mut Vec<u8>, module: &str, name: &str) {
        out.push(b'c');
        out.extend_from_slice(format!("{module}\n{name}\n").as_bytes());
    }
    let mut out = vec![0x80, 2, b'}', b'('];
    for (index, (name, shape)) in shapes.iter().enumerate() {
        text(&mut out, name);
        global(&mut out, "torch._utils", "_rebuild_tensor_v2");
        out.push(b'(');
        out.push(b'(');
        text(&mut out, "storage");
        global(&mut out, "torch", "FloatStorage");
        text(&mut out, &index.to_string());
        text(&mut out, "cpu");
        int(&mut out, shape.iter().product());
        out.extend_from_slice(b"tQ");
        int(&mut out, 0);
        out.push(b'(');
        for &dim in shape {
            int(&mut out, dim);
        }
        out.push(b't');
        out.push(b'(');
        for axis in 0..shape.len() {
            int(&mut out, shape.iter().skip(axis + 1).product());
        }
        out.push(b't');
        out.push(0x89);
        global(&mut out, "collections", "OrderedDict");
        out.extend_from_slice(b")R");
        out.extend_from_slice(b"tR");
    }
    out.extend_from_slice(b"u.");
    out
}

fn write_tiny_checkpoint(path: &Path) -> HashMap<String, Tensor> {
    let shapes = tiny_shapes();
    let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("archive/data.pkl", stored).unwrap();
    zip.write_all(&pickle_state_dict(&shapes)).unwrap();
    let mut tensors = HashMap::new();
    for (index, (name, shape)) in shapes.iter().enumerate() {
        let values = tiny_values(name, shape.iter().product(), index as u32 + 1);
        zip.start_file(format!("archive/data/{index}"), stored)
            .unwrap();
        for value in &values {
            zip.write_all(&value.to_le_bytes()).unwrap();
        }
        tensors.insert(
            name.clone(),
            Tensor::from_vec(values, shape.as_slice(), &Device::Cpu).unwrap(),
        );
    }
    zip.finish().unwrap();
    tensors
}

fn tiny_config() -> Config {
    infer::config(TINY_CONFIG).unwrap()
}

struct Tiny {
    dir: PathBuf,
    checkpoint: PathBuf,
    tokenizer: PathBuf,
    tensors: HashMap<String, Tensor>,
}

fn tiny(tag: &str) -> Tiny {
    let dir = temp_dir(tag);
    let checkpoint = dir.join("pytorch_model.bin");
    let tokenizer = dir.join("tokenizer.json");
    fs::write(&tokenizer, tiny_tokenizer_json()).unwrap();
    let tensors = write_tiny_checkpoint(&checkpoint);
    Tiny {
        dir,
        checkpoint,
        tokenizer,
        tensors,
    }
}

fn encoder_from(vb: VarBuilder, tokenizer: &Path, max_tokens: usize) -> Encoder {
    let config = tiny_config();
    let model = XLMRobertaModel::new(&config, vb).unwrap();
    Encoder::from_parts(
        infer::tokenizer(tokenizer, max_tokens).unwrap(),
        model,
        Device::Cpu,
        config.pad_token_id,
        max_tokens,
    )
}

fn tiny_encoder(tiny: &Tiny) -> Encoder {
    let vb = VarBuilder::from_tensors(tiny.tensors.clone(), DType::F32, &Device::Cpu);
    encoder_from(vb, &tiny.tokenizer, 32)
}

fn sentences() -> Vec<String> {
    (0..23)
        .map(|n| {
            (0..(1 + n * 3 % 17))
                .map(|k| WORDS[(n * 7 + k * 5) % WORDS.len()])
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect()
}

#[test]
fn candle_reads_the_synthetic_checkpoint_as_written() {
    let tiny = tiny("pth");
    let pth = candle_core::pickle::PthTensors::new(&tiny.checkpoint, None).unwrap();
    assert_eq!(pth.tensor_infos().len(), tiny_shapes().len());
    let read = pth
        .get("encoder.layer.1.intermediate.dense.weight")
        .unwrap()
        .unwrap();
    let written = &tiny.tensors["encoder.layer.1.intermediate.dense.weight"];
    assert_eq!(read.dims(), written.dims());
    let diff: f32 = (read - written)
        .unwrap()
        .abs()
        .unwrap()
        .sum_all()
        .unwrap()
        .to_scalar()
        .unwrap();
    assert_eq!(diff, 0.0);
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn conversion_writes_f16_encoder_tensors_whose_vectors_match_the_f32_ones() {
    let tiny = tiny("convert");
    let out = tiny.dir.join("model-f16.safetensors");
    let mut seen = Vec::new();
    convert::convert(
        &tiny.checkpoint,
        &out,
        &AtomicBool::new(false),
        &mut |done, total| seen.push((done, total)),
    )
    .unwrap();

    let header = safetensors::SafeTensors::read_metadata(&fs::read(&out).unwrap())
        .unwrap()
        .1;
    let names: Vec<String> = header.tensors().keys().cloned().collect();
    assert_eq!(names.len(), tiny_shapes().len() - 2);
    assert!(names.iter().all(|name| !name.starts_with("pooler.")));
    assert!(header
        .tensors()
        .values()
        .all(|info| info.dtype == safetensors::Dtype::F16));
    let (done, total) = *seen.last().unwrap();
    assert_eq!(done, total);

    let converted = Encoder::load(
        &out,
        &tiny.tokenizer,
        &tiny_config(),
        Device::Cpu,
        DType::F32,
    )
    .unwrap();
    let reference = tiny_encoder(&tiny);
    let texts = sentences();
    let texts: Vec<&str> = texts.iter().map(String::as_str).collect();
    let a = converted.embed(&texts, false).unwrap();
    let b = reference.embed(&texts, false).unwrap();
    for (x, y) in a.iter().zip(&b) {
        assert_eq!(x.len(), 8);
        assert!(cosine(x, y) >= 0.999, "{}", cosine(x, y));
    }
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn a_stopped_or_failed_conversion_leaves_no_file() {
    let tiny = tiny("convert-stop");
    let out = tiny.dir.join("model-f16.safetensors");
    let result = convert::convert(
        &tiny.checkpoint,
        &out,
        &AtomicBool::new(true),
        &mut |_, _| {},
    );
    assert!(matches!(result, Err(EmbedError::Cancelled)));
    assert!(!out.exists());

    let not_a_checkpoint = tiny.dir.join("not.bin");
    fs::write(&not_a_checkpoint, b"not a zip").unwrap();
    let result = convert::convert(
        &not_a_checkpoint,
        &out,
        &AtomicBool::new(false),
        &mut |_, _| {},
    );
    assert!(matches!(result, Err(EmbedError::Convert(_))));
    assert!(!out.exists());
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn a_converted_file_with_a_missing_tensor_does_not_load() {
    let tiny = tiny("convert-missing");
    let mut tensors = tiny.tensors.clone();
    tensors.remove("encoder.layer.1.output.dense.weight");
    let out = tiny.dir.join("partial.safetensors");
    candle_core::safetensors::save(&tensors, &out).unwrap();
    assert!(matches!(
        Encoder::load(
            &out,
            &tiny.tokenizer,
            &tiny_config(),
            Device::Cpu,
            DType::F32
        ),
        Err(EmbedError::ModelLoad(_))
    ));
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn a_batch_equals_its_passages_embedded_one_by_one() {
    let tiny = tiny("batch");
    // A budget this small splits the batch into several padded groups.
    let encoder = tiny_encoder(&tiny).with_budget(infer::Budget {
        tokens: 40,
        cells: 400,
    });
    let texts = sentences();
    let texts: Vec<&str> = texts.iter().map(String::as_str).collect();
    let batch = encoder.embed(&texts, false).unwrap();
    assert_eq!(batch.len(), texts.len());
    for (text, vector) in texts.iter().zip(&batch) {
        let alone = encoder.embed(&[text], true).unwrap();
        assert!(cosine(vector, &alone[0]) >= 0.9999, "{text}");
        let norm: f32 = vector.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5);
    }
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn groups_keep_order_and_stay_within_the_budget() {
    let ids: Vec<Vec<u32>> = [3, 9, 4, 30, 12, 12, 2, 7]
        .iter()
        .map(|&len| vec![5; len])
        .collect();
    let mut order: Vec<usize> = (0..ids.len()).collect();
    order.sort_by_key(|&index| ids[index].len());
    let budget = infer::Budget {
        tokens: 32,
        cells: 250,
    };
    let grouped = groups(&order, &ids, budget);
    let flat: Vec<usize> = grouped.iter().flatten().copied().collect();
    assert_eq!(flat, order);
    for group in &grouped {
        let width = group.iter().map(|&i| ids[i].len()).max().unwrap();
        let fits = group.len() * width <= 32 && group.len() * width * width <= 250;
        assert!(group.len() == 1 || fits, "{group:?}");
    }
    // The 12-token pair fits the token budget but not the cell budget.
    assert!(grouped
        .iter()
        .any(|group| group.len() == 1 && ids[group[0]].len() == 12));
}

#[test]
fn decomposed_hangul_embeds_exactly_like_composed_hangul() {
    let tiny = tiny("nfc");
    let encoder = tiny_encoder(&tiny);
    let composed = "검색 의미 문서 찾기 한국어";
    let decomposed: String = {
        let mut normalized = tokenizers::NormalizedString::from(composed);
        normalized.nfd();
        normalized.get().to_string()
    };
    assert_ne!(decomposed, composed);
    assert_eq!(nfc(&decomposed), composed);
    let ids = encoder.encode(&[composed, &decomposed]).unwrap();
    assert_eq!(ids[0], ids[1]);
    assert!(!ids[0].contains(&3), "a composed word fell to <unk>");
    let vectors = encoder.embed(&[composed, &decomposed], false).unwrap();
    assert_eq!(vectors[0], vectors[1]);
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn a_long_passage_is_cut_at_the_token_limit() {
    let tiny = tiny("truncate");
    let encoder = tiny_encoder(&tiny);
    let long = vec!["search"; 100].join(" ");
    let ids = encoder.encode(&[&long]).unwrap();
    assert_eq!(ids[0].len(), 32);
    assert_eq!(ids[0].last(), Some(&2), "the end token survives truncation");
    assert_eq!(encoder.embed(&[&long], false).unwrap()[0].len(), 8);
    fs::remove_dir_all(&tiny.dir).ok();
}

// --- The Embedder contract and its audit lines. ---

fn plan(passages: usize, chars: usize) -> BuildPlan {
    BuildPlan {
        files: 1,
        passages,
        chars,
    }
}

fn tiny_model(tag: &str) -> (Tiny, BuiltinModel) {
    let tiny = tiny(tag);
    let encoder = tiny_encoder(&tiny);
    let model = BuiltinModel::with_encoder(ModelStore::at(tiny.dir.join("store")), encoder);
    (tiny, model)
}

#[test]
fn a_build_writes_its_start_line_before_reading_and_closes_after() {
    let (tiny, model) = tiny_model("build");
    let vault = temp_dir("build-vault");
    let embedder: &dyn Embedder = &model;
    let mut session = embedder.start_build(&vault, plan(3, 200)).unwrap();
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0]["purpose"], "embed-build");
    assert_eq!(lines[0]["provider"], "built-in");
    assert_eq!(lines[0]["host"], "in-process");
    assert_eq!(lines[0]["model"], "bge-m3");
    assert_eq!(lines[0]["embed"]["phase"], "start");
    assert_eq!(lines[0]["embed"]["passagesPlanned"], 3);

    let vectors = session
        .embed_batch(&["search meaning", "검색 의미"])
        .unwrap();
    assert_eq!(vectors.len(), 2);
    assert!(matches!(
        session.embed_batch(&["dawn", "wave"]),
        Err(EmbedError::OverPlan)
    ));
    session.finish(RunEnd::Complete).unwrap();
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[1]["embed"]["phase"], "close");
    assert_eq!(lines[1]["embed"]["ended"], "complete");
    assert_eq!(lines[1]["embed"]["passagesSent"], 2);
    assert_eq!(lines[1]["embed"]["charsSent"], 19);
    assert_eq!(lines[1]["embed"]["run"], lines[0]["embed"]["run"]);
    assert!(model.idle_for().is_some());
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn a_dropped_build_closes_as_stopped() {
    let (tiny, model) = tiny_model("build-drop");
    let vault = temp_dir("build-drop-vault");
    drop(Embedder::start_build(&model, &vault, plan(1, 10)).unwrap());
    assert_eq!(audit_lines(&vault)[1]["embed"]["ended"], "stopped");
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn a_question_writes_one_line_with_the_question() {
    let (tiny, model) = tiny_model("query");
    let vault = temp_dir("query-vault");
    let vector = Embedder::embed_query(&model, &vault, "의미 검색").unwrap();
    assert_eq!(vector.len(), 8);
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0]["purpose"], "embed-query");
    assert_eq!(lines[0]["question"], "의미 검색");
    assert_eq!(lines[0]["host"], "in-process");
    assert_eq!(lines[0]["outcome"], "ok");
    assert_eq!(lines[0]["httpStatus"], serde_json::Value::Null);
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&tiny.dir).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn nothing_is_read_while_the_audit_log_is_unwritable() {
    let (tiny, model) = tiny_model("blocked");
    let vault = temp_dir("blocked-build-vault");
    block_audit_log(&vault);
    assert!(matches!(
        Embedder::start_build(&model, &vault, plan(1, 10)),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert!(matches!(
        Embedder::embed_query(&model, &vault, "question"),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert!(model.idle_for().is_none(), "the model read something");
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn a_model_not_prepared_refuses_and_writes_no_line() {
    let store = ModelStore::at(temp_dir("absent").join("bge-m3"));
    let model = BuiltinModel::new(store);
    let vault = temp_dir("absent-vault");
    assert!(matches!(
        Embedder::start_build(&model, &vault, plan(1, 10)),
        Err(EmbedError::ModelNotReady)
    ));
    assert!(matches!(
        Embedder::embed_query(&model, &vault, "question"),
        Err(EmbedError::ModelNotReady)
    ));
    assert!(!crate::llm_audit::audit_log_path(&vault).exists());
    assert!(!model.is_loaded());
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn unload_drops_the_model_and_a_running_build_keeps_its_own() {
    let (tiny, model) = tiny_model("unload");
    let vault = temp_dir("unload-vault");
    let mut session = Embedder::start_build(&model, &vault, plan(2, 100)).unwrap();
    model.unload();
    assert!(!model.is_loaded());
    assert_eq!(session.embed_batch(&["dawn wave"]).unwrap().len(), 1);
    session.finish(RunEnd::Complete).unwrap();
    // Nothing is prepared on disk, so the next use cannot load it again.
    assert!(matches!(model.load(), Err(EmbedError::ModelNotReady)));
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&tiny.dir).ok();
}

#[test]
fn the_store_reports_its_bytes_and_deletes_everything() {
    let app_data = temp_dir("store");
    let store = ModelStore::in_app_data(&app_data);
    assert_eq!(store.dir(), app_data.join("models").join("bge-m3"));
    assert_eq!(store.bytes(), 0);
    assert!(!store.is_ready());
    fs::create_dir_all(store.dir().join("download")).unwrap();
    fs::write(store.dir().join("model-f16.safetensors"), vec![0u8; 300]).unwrap();
    fs::write(store.dir().join("tokenizer.json"), vec![0u8; 20]).unwrap();
    fs::write(
        store.dir().join("download").join("pytorch_model.bin.part"),
        vec![0u8; 5],
    )
    .unwrap();
    assert!(store.is_ready());
    assert_eq!(store.bytes(), 325);
    let vault = temp_dir("store-vault");
    let ready = store.prepare(&vault, &AtomicBool::new(false), &mut |_| {});
    assert_eq!(ready.unwrap(), DownloadReport::default());
    assert!(!crate::llm_audit::audit_log_path(&vault).exists());
    fs::remove_dir_all(&vault).ok();
    assert_eq!(BuiltinModel::new(store.clone()).store().bytes(), 325);
    store.delete().unwrap();
    assert!(!store.dir().exists());
    assert_eq!(store.bytes(), 0);
    store.delete().unwrap();
    fs::remove_dir_all(&app_data).ok();
}

#[test]
fn the_pins_name_one_commit_and_full_hashes() {
    assert_eq!(pins::REVISION.len(), 40);
    for file in pins::DOWNLOADS {
        assert_eq!(file.sha256.len(), 64);
        assert!(file
            .sha256
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        let url = pins::resolve_url(&file);
        assert!(url.starts_with("https://huggingface.co/BAAI/bge-m3/resolve/5617a9f61b02"));
        assert!(checked_url(&url, None).is_ok());
    }
    let config = infer::config(pins::CONFIG_JSON).unwrap();
    assert_eq!(config.hidden_size, pins::DIMENSIONS);
    assert!(
        infer::MAX_TOKENS + 2 <= 2_048 && infer::MAX_TOKENS + 2 <= config.max_position_embeddings
    );
}

// --- Preparation end to end, with the tiny model served by the fake. ---

fn cpu() -> (Device, DType) {
    (Device::Cpu, DType::F32)
}

struct Served {
    tiny: Tiny,
    vault: PathBuf,
    tokenizer: Vec<u8>,
    checkpoint: Vec<u8>,
    files: [PinnedFile; 2],
}

fn served(tag: &str) -> Served {
    let tiny = tiny(tag);
    let vault = temp_dir(&format!("{tag}-vault"));
    let tokenizer = fs::read(&tiny.tokenizer).unwrap();
    let checkpoint = fs::read(&tiny.checkpoint).unwrap();
    let files = [
        pinned("tokenizer.json", &tokenizer),
        pinned("pytorch_model.bin", &checkpoint),
    ];
    Served {
        tiny,
        vault,
        tokenizer,
        checkpoint,
        files,
    }
}

impl Served {
    fn fake(&self) -> FakeFetch {
        FakeFetch::new(&self.vault)
            .hosting(&self.files[0], self.tokenizer.clone())
            .hosting(&self.files[1], self.checkpoint.clone())
    }

    fn recipe(&self) -> Recipe<'_> {
        Recipe {
            files: &self.files,
            config: TINY_CONFIG,
            device: cpu,
        }
    }

    fn store(&self) -> ModelStore {
        ModelStore::in_app_data(&self.tiny.dir.join("app-data"))
    }

    fn clean(self) {
        fs::remove_dir_all(&self.vault).ok();
        fs::remove_dir_all(&self.tiny.dir).ok();
    }
}

#[test]
fn prepare_downloads_converts_checks_and_keeps_only_the_model() {
    let served = served("prepare");
    let fake = served.fake();
    let store = served.store();
    let mut stages = Vec::new();
    let report = store
        .prepare_with(
            &fake,
            &served.recipe(),
            &served.vault,
            &AtomicBool::new(false),
            &mut |p| {
                if stages.last() != Some(&p.stage) {
                    stages.push(p.stage);
                }
            },
        )
        .unwrap();

    assert_eq!(report.hosts, vec!["huggingface.co", "cdn-lfs.hf.co"]);
    assert_eq!(stages, vec![Stage::Download, Stage::Convert, Stage::Check]);
    assert!(store.is_ready());
    assert!(!store.dir().join("download").exists());
    assert!(!store
        .dir()
        .join("model-f16.safetensors.converting")
        .exists());
    assert_eq!(
        fs::read(store.dir().join("tokenizer.json")).unwrap(),
        served.tokenizer
    );
    let weights = fs::metadata(store.dir().join("model-f16.safetensors"))
        .unwrap()
        .len();
    assert_eq!(store.bytes(), weights + served.tokenizer.len() as u64);
    assert_eq!(audit_lines(&served.vault).len(), 2);

    let asked = fake.requests().len();
    let again = store
        .prepare_with(
            &fake,
            &served.recipe(),
            &served.vault,
            &AtomicBool::new(false),
            &mut |_| {},
        )
        .unwrap();
    assert_eq!(again, DownloadReport::default());
    assert_eq!(fake.requests().len(), asked);
    served.clean();
}

#[test]
fn a_stopped_preparation_is_not_ready_and_resumes_its_download() {
    let served = served("prepare-stop");
    let mut fake = served.fake();
    fake.stop_after = Some(served.tokenizer.len() as u64 + 500);
    let store = served.store();
    let result = store.prepare_with(
        &fake,
        &served.recipe(),
        &served.vault,
        &AtomicBool::new(false),
        &mut |_| {},
    );
    assert!(matches!(result, Err(EmbedError::Cancelled)));
    assert!(!store.is_ready());
    let kept = fs::metadata(part_path(&store.dir().join("download"), &served.files[1]))
        .unwrap()
        .len();
    assert!(kept > 0);

    let report = store
        .prepare_with(
            &served.fake(),
            &served.recipe(),
            &served.vault,
            &AtomicBool::new(false),
            &mut |_| {},
        )
        .unwrap();
    assert_eq!(report.bytes_received, served.checkpoint.len() as u64 - kept);
    assert!(store.is_ready());
    served.clean();
}
