//! A scripted transport keyed by URL, and one that must never be asked.

use super::super::download::Downloader;
use super::super::fetch::{ContentRange, Fetch, Head, Sink};
use super::super::pins::{self, PinnedFile};
use super::*;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

pub(super) fn pinned(name: &'static str, data: &[u8]) -> PinnedFile {
    PinnedFile {
        name,
        bytes: data.len() as u64,
        sha256: Box::leak(crate::lower_hex::lower_hex(&Sha256::digest(data)).into_boxed_str()),
    }
}

pub(super) fn bytes(len: usize, seed: u32) -> Vec<u8> {
    let mut state = seed;
    (0..len)
        .map(|_| {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (state >> 24) as u8
        })
        .collect()
}

#[derive(Clone)]
pub(super) struct Response {
    pub head: Head,
    pub body: Vec<u8>,
}

pub(super) fn redirect(location: &str) -> Response {
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
pub(super) fn serve(data: &[u8], from: u64) -> Response {
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

pub(super) type Route = Box<dyn Fn(u64) -> Response + Send + Sync>;

pub(super) struct FakeFetch {
    pub routes: HashMap<String, Route>,
    requests: Mutex<Vec<(String, u64)>>,
    /// Audit lines on disk when each request was made.
    pub lines_at_request: Mutex<Vec<usize>>,
    vault: PathBuf,
    /// Stops the transfer, as a person pressing Stop would, after this many body bytes.
    pub stop_after: Option<u64>,
    /// Runs once the body of every request has been handed over.
    pub after_each: Option<Box<dyn Fn() + Send + Sync>>,
    sent: AtomicUsize,
}

impl FakeFetch {
    pub fn new(vault: &Path) -> Self {
        Self {
            routes: HashMap::new(),
            requests: Mutex::new(Vec::new()),
            lines_at_request: Mutex::new(Vec::new()),
            vault: vault.to_path_buf(),
            stop_after: None,
            after_each: None,
            sent: AtomicUsize::new(0),
        }
    }

    pub fn route(
        mut self,
        url: &str,
        route: impl Fn(u64) -> Response + Send + Sync + 'static,
    ) -> Self {
        self.routes.insert(url.to_string(), Box::new(route));
        self
    }

    /// huggingface.co redirects to a CDN host, which serves `data`.
    pub fn hosting(self, file: &PinnedFile, data: Vec<u8>) -> Self {
        let cdn = format!("https://cdn-lfs.hf.co/repos/x/{}?sig=abc", file.name);
        let to = cdn.clone();
        self.route(&pins::resolve_url(file), move |_| redirect(&to))
            .route(&cdn, move |from| serve(&data, from))
    }

    pub fn requests(&self) -> Vec<(String, u64)> {
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
        if let Some(after) = &self.after_each {
            after();
        }
        Ok(())
    }
}

/// For paths that must not reach the network.
pub(super) struct PanicFetch;

impl Fetch for PanicFetch {
    fn get(&self, url: &str, _: u64, _: &AtomicBool, _: &mut dyn Sink) -> Result<(), EmbedError> {
        panic!("asked the network for {url}")
    }
}

pub(super) struct Files {
    pub tokenizer: (PinnedFile, Vec<u8>),
    pub weights: (PinnedFile, Vec<u8>),
}

impl Files {
    pub fn pins(&self) -> [PinnedFile; 2] {
        [self.tokenizer.0, self.weights.0]
    }
}

pub(super) fn files() -> Files {
    let tokenizer = bytes(120, 7);
    let weights = bytes(1_000, 11);
    Files {
        tokenizer: (pinned("tokenizer.json", &tokenizer), tokenizer),
        weights: (pinned("pytorch_model.bin", &weights), weights),
    }
}

pub(super) fn download(
    fetch: &dyn Fetch,
    files: &[PinnedFile],
    dir: &Path,
    vault: &Path,
    cancel: &AtomicBool,
) -> (Result<DownloadReport, EmbedError>, Vec<Progress>) {
    let mut seen = Vec::new();
    let mut report = DownloadReport::default();
    let result = Downloader {
        fetch,
        files,
        dir,
        vault_dir: vault,
        cancel,
        on_progress: &mut |progress| seen.push(*progress),
    }
    .run(&mut report);
    (result.map(|()| report), seen)
}
