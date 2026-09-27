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
}
impl EvidenceReader {
    pub(crate) fn start(vault: &Path, source: &Path) -> Result<Self, String> {
        let binary = crate::agent_setup::resolve_bundled_binary()?;
        let mut child = Command::new(binary)
            .env_clear()
            .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
            .env("OATLAS_READ_ONLY", "1")
            .env("OATLAS_VAULT", vault)
            .env("OATLAS_REPO_ROOT", source)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
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
            "compile_ontology"
                | "get_concepts"
                | "infer_imports"
                | "query_ontology"
                | "analyze_repo_structure"
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
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}
