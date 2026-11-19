//! Stands in for the app's two row commands outside the app, for `pnpm perf:vault-open`, the
//! manifest equality test and the crate's process tests. It calls the same decode and row
//! functions as `src-tauri/src/vault/index_rows.rs`.
//!
//! Frames on stdin: `<get|put|size|delete> <body bytes>\n<body>`. Each answer on stdout:
//! `<ok|err> <bytes>\n<body>`. A `get` or `put` body is the wire body the app sends; a `size` or
//! `delete` body is the vault root.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::Path;
use vault_index::rows::{self, GetRequest, PutRequest};

fn main() {
    if std::env::var_os(vault_index::INDEX_DIR_OVERRIDE_ENV).is_some()
        && !vault_index::index_dir_override_honoured()
    {
        eprintln!("this build ignores OATLAS_INDEX_DIR; build with --features index-dir-override");
        std::process::exit(2);
    }
    if let Err(error) = serve() {
        eprintln!("vault-rows-bridge: {error}");
        std::process::exit(1);
    }
}

fn serve() -> io::Result<()> {
    let mut input = BufReader::new(io::stdin().lock());
    let mut output = io::stdout().lock();
    let mut header = String::new();
    loop {
        header.clear();
        if input.read_line(&mut header)? == 0 {
            return Ok(());
        }
        let mut words = header.split_whitespace();
        let command = words.next().unwrap_or_default().to_string();
        let length: usize = words
            .next()
            .and_then(|length| length.parse().ok())
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "frame has no length"))?;
        let mut body = vec![0u8; length];
        input.read_exact(&mut body)?;
        let (status, answer) = match handle(&command, &body) {
            Ok(answer) => ("ok", answer),
            Err(error) => ("err", error.to_string().into_bytes()),
        };
        writeln!(output, "{status} {}", answer.len())?;
        output.write_all(&answer)?;
        output.flush()?;
    }
}

fn handle(command: &str, body: &[u8]) -> vault_index::Result<Vec<u8>> {
    match command {
        "get" => {
            let request = GetRequest::decode(body)?;
            rows::get(Path::new(&request.root), &request.namespace, &request.paths)
        }
        "put" => {
            let request = PutRequest::decode(body)?;
            let report = rows::put(
                Path::new(&request.root),
                &request.namespace,
                &request.rows,
                request.retain.as_deref(),
            )?;
            Ok(format!(
                "{{\"written\":{},\"skipped\":{},\"removed\":{}}}",
                report.written, report.skipped, report.removed
            )
            .into_bytes())
        }
        "size" => {
            let root = Path::new(std::str::from_utf8(body).unwrap_or_default());
            Ok(format!(
                "{{\"rowsBytes\":{},\"folderBytes\":{}}}",
                rows::rows_bytes(root)?,
                vault_index::stored_bytes(Some(root))?
            )
            .into_bytes())
        }
        "delete" => {
            let root = Path::new(std::str::from_utf8(body).unwrap_or_default());
            vault_index::delete(Some(root))?;
            Ok(b"{}".to_vec())
        }
        other => Err(vault_index::Error::Io(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("unknown command {other}"),
        ))),
    }
}
