use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const MAX_RPC_LINE: u64 = 8 * 1024 * 1024;
pub(crate) struct EvidenceReader {
    child: Child,
    input: ChildStdin,
    replies: Receiver<Value>,
    reader: Option<JoinHandle<()>>,
    deadline: Instant,
    next_id: u64,
    input_namespace: InputNamespace,
}
impl EvidenceReader {
    pub(crate) fn start(
        vault: &Path,
        snapshot: &crate::gray_area_scope::SourceObservation,
    ) -> Result<Self, String> {
        let binary = crate::agent_setup::resolve_bundled_binary()?;
        let input_namespace = InputNamespace::new()?;
        let snapshot_file = snapshot_descriptor(&input_namespace.0, snapshot)?;
        let mut command = Command::new(&binary);
        command.current_dir(binary.parent().ok_or("reader_unavailable")?);
        command
            .env_clear()
            .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
            .env("OATLAS_READ_ONLY", "1")
            .env("OATLAS_CONFINED_SOURCE_READS", "1")
            .env("OATLAS_SOURCE_SNAPSHOT_FD", "198")
            .env("OATLAS_VAULT", vault)
            .env("OATLAS_REPO_ROOT", &input_namespace.0)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::fd::AsRawFd;
            use std::os::unix::process::CommandExt;
            let fd = snapshot_file.as_raw_fd();
            unsafe {
                command.pre_exec(move || {
                    if libc::dup2(fd, 198) < 0 || libc::fcntl(198, libc::F_SETFD, 0) < 0 {
                        return Err(std::io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
        }
        let mut child = command
            .spawn()
            .map_err(|_| "reader_unavailable".to_string())?;
        let input = child.stdin.take().ok_or("reader_unavailable")?;
        let output = child.stdout.take().ok_or("reader_unavailable")?;
        let (send, replies) = mpsc::channel();
        let reader = thread::spawn(move || {
            let mut stream = BufReader::new(output);
            loop {
                let mut line = Vec::new();
                let result = stream
                    .by_ref()
                    .take(MAX_RPC_LINE + 1)
                    .read_until(b'\n', &mut line);
                if result.is_err() || line.is_empty() || line.len() as u64 > MAX_RPC_LINE {
                    break;
                }
                if let Ok(value) = serde_json::from_slice(&line) {
                    if send.send(value).is_err() {
                        break;
                    }
                }
            }
        });
        let mut client = Self {
            child,
            input,
            replies,
            reader: Some(reader),
            deadline: Instant::now() + Duration::from_secs(60),
            next_id: 1,
            input_namespace,
        };
        client.request("initialize", json!({"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"atlas-gray-area","version":"1"}}))?;
        writeln!(
            client.input,
            "{}",
            json!({"jsonrpc":"2.0","method":"notifications/initialized"})
        )
        .map_err(|_| "reader_unavailable")?;
        Ok(client)
    }
    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        writeln!(
            self.input,
            "{}",
            json!({"jsonrpc":"2.0","id":id,"method":method,"params":params})
        )
        .map_err(|_| "reader_unavailable")?;
        self.input.flush().map_err(|_| "reader_unavailable")?;
        loop {
            let left = self.deadline.saturating_duration_since(Instant::now());
            let row = self
                .replies
                .recv_timeout(left)
                .map_err(|_| "reader_timeout")?;
            if row.get("id").and_then(Value::as_u64) != Some(id) {
                continue;
            }
            if row.get("error").is_some() {
                return Err("reader_refused".into());
            }
            return row
                .get("result")
                .cloned()
                .ok_or_else(|| "reader_unavailable".into());
        }
    }
    pub(crate) fn call(&mut self, name: &str, arguments: Value) -> Result<Value, String> {
        if !matches!(
            name,
            "compile_ontology" | "get_concepts" | "infer_imports" | "query_ontology"
        ) {
            return Err("reader_refused".into());
        }
        let result = self.request("tools/call", json!({"name":name,"arguments":arguments}))?;
        if result.get("isError").and_then(Value::as_bool) == Some(true) {
            return Err("reader_refused".into());
        }
        if let Some(value) = result.get("structuredContent") {
            return Ok(value.clone());
        }
        result
            .pointer("/content/0/text")
            .and_then(Value::as_str)
            .and_then(|text| serde_json::from_str(text).ok())
            .ok_or_else(|| "reader_unavailable".into())
    }
}
impl Drop for EvidenceReader {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = &self.input_namespace;
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}

fn snapshot_descriptor(
    source: &Path,
    snapshot: &crate::gray_area_scope::SourceObservation,
) -> Result<std::fs::File, String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let path = source.join(".captured-input");
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&path)
            .map_err(|_| "reader_unavailable")?;
        let result = (|| {
            serde_json::to_writer(&file,&json!({"contract":"confinedSourceSnapshot:v1","rootPath":source.to_string_lossy(),"truncated":snapshot.limited,"entries":snapshot.entries,"excluded":snapshot.excluded})).map_err(|_|"reader_unavailable")?;
            {
                use std::os::unix::fs::MetadataExt;
                let read = std::fs::OpenOptions::new()
                    .read(true)
                    .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC)
                    .open(&path)
                    .map_err(|_| "reader_unavailable")?;
                let original = file.metadata().map_err(|_| "reader_unavailable")?;
                let opened = read.metadata().map_err(|_| "reader_unavailable")?;
                if original.dev() != opened.dev() || original.ino() != opened.ino() {
                    return Err("reader_unavailable");
                }
                Ok(read)
            }
        })();
        let _ = std::fs::remove_file(path);
        drop(file);
        result.map_err(String::from)
    }
    #[cfg(not(unix))]
    {
        let _ = (source, snapshot);
        Err("unsupported_platform".into())
    }
}

struct InputNamespace(std::path::PathBuf);
impl InputNamespace {
    fn new() -> Result<Self, String> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "reader_unavailable")?
                .as_nanos();
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let serial = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "atlas-source-namespace-{}-{nonce}-{serial}",
                std::process::id()
            ));
            std::fs::DirBuilder::new()
                .mode(0o700)
                .create(&path)
                .map_err(|_| "reader_unavailable")?;
            Ok(Self(
                std::fs::canonicalize(path).map_err(|_| "reader_unavailable")?,
            ))
        }
        #[cfg(not(unix))]
        {
            Err("unsupported_platform".into())
        }
    }
}
impl Drop for InputNamespace {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir(&self.0);
    }
}
