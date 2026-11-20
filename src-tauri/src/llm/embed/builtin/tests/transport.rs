//! The curl transport against a server on 127.0.0.1.

use super::super::fetch::{self, parse_head, ContentRange, CurlFetch, Fetch, Head, Sink};
use super::fake::bytes;
use super::*;
use std::io::Write as _;
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;

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

/// Records each request head before answering it, so a finished `get` has been seen.
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

/// Header names of a request head, lowercased, request line left out.
fn header_names(head: &str) -> Vec<String> {
    let mut names: Vec<String> = head
        .lines()
        .skip(1)
        .filter_map(|line| line.split_once(':'))
        .map(|(name, _)| name.trim().to_ascii_lowercase())
        .collect();
    names.sort();
    names
}

const LOCAL_HTTP: CurlFetch = CurlFetch {
    protocols: "=http",
    connect_timeout: Duration::from_secs(2),
    idle: Duration::from_secs(2),
};

#[derive(Default)]
struct Collect {
    head: Option<Head>,
    body: Vec<u8>,
    follow_body: bool,
    /// Set after the head, as a person pressing Stop would.
    stop: Option<Arc<AtomicBool>>,
}

impl Sink for Collect {
    fn head(&mut self, head: &Head) -> Result<bool, EmbedError> {
        self.head = Some(head.clone());
        if let Some(stop) = &self.stop {
            stop.store(true, Ordering::SeqCst);
        }
        Ok(self.follow_body)
    }

    fn body(&mut self, chunk: &[u8]) -> Result<(), EmbedError> {
        self.body.extend_from_slice(chunk);
        Ok(())
    }
}

fn following() -> Collect {
    Collect {
        follow_body: true,
        ..Collect::default()
    }
}

#[test]
fn the_shipped_transport_asks_https_only_and_sends_nothing_else() {
    let config = fetch::HTTPS_ONLY.config("https://huggingface.co/x\"\nurl = \"https://evil", 7);
    let lines: Vec<&str> = config.lines().collect();
    assert_eq!(
        lines.get(1..).unwrap(),
        [
            "header = \"Range: bytes=7-\"",
            "header = \"User-Agent:\"",
            "header = \"Accept:\"",
            "noproxy = \"*\"",
            "proto = \"=https\"",
            "globoff",
            "connect-timeout = 20",
            "speed-limit = 1",
            "speed-time = 60",
        ]
    );
    assert_eq!(
        lines.iter().filter(|line| line.starts_with("url")).count(),
        1
    );
    assert!(!fetch::HTTPS_ONLY
        .config("https://huggingface.co/x", 0)
        .contains("Range"));
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
fn curl_asks_for_the_rest_of_a_file_with_host_and_range_only() {
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
    let mut sink = following();
    let url = format!("http://{}/file", server.addr);
    LOCAL_HTTP.get(&url, 1_000, &never(), &mut sink).unwrap();
    let head = sink.head.unwrap();
    assert_eq!(head.status, 206);
    assert_eq!(head.content_range.unwrap().start, 1_000);
    assert_eq!(sink.body, data.get(1_000..).unwrap());

    LOCAL_HTTP.get(&url, 0, &never(), &mut following()).unwrap();
    let heads = server.heads.lock().unwrap();
    assert!(heads[0].contains("Range: bytes=1000-"), "{}", heads[0]);
    assert_eq!(header_names(&heads[0]), ["host", "range"]);
    assert_eq!(header_names(&heads[1]), ["host"]);
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
            &never(),
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
fn glob_characters_in_a_location_make_one_request() {
    let server =
        stub(|_| b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec());
    LOCAL_HTTP
        .get(
            &format!("http://{}/x?part=[1-3]{{a,b}}", server.addr),
            0,
            &never(),
            &mut following(),
        )
        .unwrap();
    let heads = server.heads.lock().unwrap();
    assert_eq!(heads.len(), 1);
    assert!(
        heads[0].starts_with("GET /x?part=[1-3]{a,b} "),
        "{}",
        heads[0]
    );
}

#[test]
fn the_shipped_transport_refuses_plain_http_before_connecting() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let mut sink = Collect::default();
    let result = fetch::HTTPS_ONLY.get(&format!("http://{addr}/file"), 0, &never(), &mut sink);
    assert!(result.is_err());
    assert!(sink.head.is_none());
    // curl has exited, so a connection it made would already be queued.
    listener.set_nonblocking(true).unwrap();
    assert!(matches!(
        listener.accept(),
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock
    ));
}

/// Answers with a head and a little of the body, then holds the connection open
/// and reports when the client goes away.
fn stalling() -> (std::net::SocketAddr, mpsc::Receiver<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (gone, closed) = mpsc::channel();
    std::thread::spawn(move || {
        let Ok((mut stream, _)) = listener.accept() else {
            return;
        };
        read_request(&mut stream);
        let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n\r\nabcdefgh");
        let mut buffer = [0u8; 64];
        while matches!(stream.read(&mut buffer), Ok(read) if read > 0) {}
        let _ = gone.send(());
    });
    (addr, closed)
}

#[test]
fn stop_kills_curl_mid_body() {
    let (addr, closed) = stalling();
    let stop = Arc::new(AtomicBool::new(false));
    let mut sink = Collect {
        follow_body: true,
        stop: Some(stop.clone()),
        ..Collect::default()
    };
    let result = LOCAL_HTTP.get(&format!("http://{addr}/file"), 0, &stop, &mut sink);
    assert!(matches!(result, Err(EmbedError::Cancelled)), "{result:?}");
    closed
        .recv_timeout(Duration::from_secs(5))
        .expect("curl kept the connection open after a stop");
}

#[test]
fn a_transfer_that_stalls_times_out() {
    let (addr, _closed) = stalling();
    let quick = CurlFetch {
        idle: Duration::from_secs(1),
        ..LOCAL_HTTP
    };
    let result = quick.get(
        &format!("http://{addr}/file"),
        0,
        &never(),
        &mut following(),
    );
    assert!(matches!(result, Err(EmbedError::TimedOut)), "{result:?}");
}

#[test]
fn a_host_that_refuses_the_connection_needs_a_direct_connection() {
    let addr = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap();
    let result = LOCAL_HTTP.get(
        &format!("http://{addr}/file"),
        0,
        &never(),
        &mut following(),
    );
    assert!(
        matches!(result, Err(EmbedError::NoDirectConnection)),
        "{result:?}"
    );
}
