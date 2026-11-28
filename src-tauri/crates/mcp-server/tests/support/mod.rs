//! Running the server as an agent does: a child process on standard input and output.

#![allow(
    dead_code,
    reason = "each integration test file compiles this module and uses part of it"
)]

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::time::Duration;

use serde::Deserialize;
use serde_json::value::RawValue;

/// The variables the server reads; each test starts from none of them.
const SERVER_VARIABLES: [&str; 7] = [
    "OATLAS_VAULT",
    "OATLAS_REPO_ROOT",
    "OATLAS_READ_ONLY",
    "OATLAS_TOOL_PROFILE",
    "OATLAS_WRITE_CONSENT",
    "OATLAS_CONFINED_SOURCE_READS",
    "OATLAS_SOURCE_SNAPSHOT_FD",
];

pub fn repository_root() -> PathBuf {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest
        .join("../../..")
        .canonicalize()
        .expect("the repository root exists")
}

pub fn storefront() -> PathBuf {
    repository_root().join("samples/storefront")
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Program {
    Rust,
    JavaScript,
}

/// Whether the JavaScript server can run here: Node and the server's own packages.
pub fn javascript_oracle_available() -> bool {
    let packages = repository_root().join("mcp/node_modules/@modelcontextprotocol/server");
    packages.exists()
        && Command::new("node")
            .arg("--version")
            .output()
            .is_ok_and(|out| out.status.success())
}

fn command(program: Program, environment: &[(&str, &str)]) -> Command {
    let mut command = match program {
        Program::Rust => Command::new(env!("CARGO_BIN_EXE_ontology-atlas-mcp-rust")),
        Program::JavaScript => {
            let mut node = Command::new("node");
            node.arg(repository_root().join("mcp/src/javascript-server.mjs"));
            node
        }
    };
    configure(&mut command, environment);
    command
}

/// The Rust server with the census file open on descriptor 198 for the whole of its life, as the
/// app starts it. `bash` opens the file: a descriptor number above 9 is not POSIX `sh`, and the
/// std library cannot place a child's descriptor at a number of its choosing.
fn command_with_census(environment: &[(&str, &str)], census: &Path) -> Command {
    let mut bash = Command::new("bash");
    bash.args(["-c", "exec \"$0\" 198<\"$1\""])
        .arg(env!("CARGO_BIN_EXE_ontology-atlas-mcp-rust"))
        .arg(census);
    configure(&mut bash, environment);
    bash
}

fn configure(command: &mut Command, environment: &[(&str, &str)]) {
    for name in SERVER_VARIABLES {
        command.env_remove(name);
    }
    command.env("OATLAS_VAULT", storefront());
    for (name, value) in environment {
        command.env(name, value);
    }
    command
        .current_dir(repository_root())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
}

/// What a finished session wrote.
#[derive(Debug)]
pub struct Run {
    pub lines: Vec<String>,
    pub stderr: String,
    pub code: Option<i32>,
}

/// Writes `input` in one piece, closes standard input, and reads everything to the end.
pub fn run_to_end(program: Program, environment: &[(&str, &str)], input: &[u8]) -> Run {
    run_command(command(program, environment), input)
}

/// [`run_to_end`] for the Rust server, with the census in `census` open on descriptor 198 (none
/// when `census` is `None`, though the environment may still name the descriptor).
pub fn run_rust_with_census(
    environment: &[(&str, &str)],
    census: Option<&Path>,
    input: &[u8],
) -> Run {
    let command = match census {
        Some(file) => command_with_census(environment, file),
        None => command(Program::Rust, environment),
    };
    run_command(command, input)
}

fn run_command(mut command: Command, input: &[u8]) -> Run {
    let mut child = command.spawn().expect("spawn the server");
    let mut stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    let mut stderr = child.stderr.take().expect("stderr");
    let writer = {
        let input = input.to_vec();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&input);
        })
    };
    let stderr_reader = std::thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        text
    });
    // Split on `\n` alone, so a `\r` the server wrote stays in the line for a test to see.
    let mut bytes = Vec::new();
    let _ = BufReader::new(stdout).read_to_end(&mut bytes);
    let lines: Vec<String> = String::from_utf8_lossy(&bytes)
        .split_terminator('\n')
        .map(str::to_string)
        .collect();
    let _ = writer.join();
    let status = child.wait().expect("wait");
    Run {
        lines,
        stderr: stderr_reader.join().expect("stderr reader"),
        code: status.code(),
    }
}

/// An answer line's id as the key answers are matched by, `None` for a line that is not an answer.
pub fn answer_id(line: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct Line<'a> {
        #[serde(borrow)]
        id: &'a RawValue,
    }
    let line: Line<'_> = serde_json::from_str(line).ok()?;
    Some(line.id.get().to_string())
}

/// The answers of a run by request id. Two requests answered in another order are still equal: the
/// SDK answers a failure before a success that was asked first.
pub fn by_id(run: &Run) -> Vec<(String, String)> {
    let mut answers: Vec<(String, String)> = run
        .lines
        .iter()
        .map(|line| {
            (
                answer_id(line).unwrap_or_else(|| "?".to_string()),
                line.clone(),
            )
        })
        .collect();
    answers.sort();
    answers
}

pub fn request(id: u32, method: &str, params: &str) -> String {
    format!("{{\"jsonrpc\":\"2.0\",\"id\":{id},\"method\":\"{method}\",\"params\":{params}}}\n")
}

pub fn initialize(version: &str) -> String {
    request(
        1,
        "initialize",
        &format!("{{\"protocolVersion\":\"{version}\",\"capabilities\":{{}},\"clientInfo\":{{\"name\":\"t\",\"version\":\"1\"}}}}"),
    )
}

pub const INITIALIZED: &str = "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n";

pub fn call(id: u32, name: &str, arguments: &str) -> String {
    request(
        id,
        "tools/call",
        &format!("{{\"name\":\"{name}\",\"arguments\":{arguments}}}"),
    )
}

pub fn ping(id: u32) -> String {
    format!("{{\"jsonrpc\":\"2.0\",\"id\":{id},\"method\":\"ping\"}}\n")
}

/// A server kept open, for tests that read an answer before sending the next request.
pub struct Live {
    child: Child,
    stdin: Option<ChildStdin>,
    answers: Receiver<String>,
}

impl Live {
    pub fn start(environment: &[(&str, &str)]) -> Self {
        let mut child = command(Program::Rust, environment)
            .spawn()
            .expect("spawn the server");
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().expect("stdout");
        let (sender, answers) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        Self {
            child,
            stdin,
            answers,
        }
    }

    pub fn send(&mut self, text: &str) {
        let stdin = self.stdin.as_mut().expect("stdin is open");
        stdin.write_all(text.as_bytes()).expect("write");
        stdin.flush().expect("flush");
    }

    /// The next answer line, or `None` when none comes within `wait`.
    pub fn next_line(&mut self, wait: Duration) -> Option<String> {
        self.answers.recv_timeout(wait).ok()
    }

    /// Closes standard input and waits for the exit.
    pub fn finish(mut self) -> Option<i32> {
        self.stdin.take();
        self.child.wait().expect("wait").code()
    }
}

impl Drop for Live {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
