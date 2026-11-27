//! Starting the program: the checks that can stop it, the line a client's log shows, and the
//! session on standard input and output.

use std::io::Write;

use crate::protocol::Session;
use crate::runtime::Config;
use crate::surface::Surface;

fn write_stderr(text: &str) {
    // A closed standard error is nobody's problem here; `eprintln!` would panic on it.
    let _ = std::io::stderr().write_all(text.as_bytes());
}

/// Runs the server on this process's standard streams and returns its exit status: 1 when it
/// cannot start, 0 when the client ends the session.
pub fn run_stdio() -> i32 {
    let config = match Config::from_environment() {
        Ok(config) => config,
        Err(error) => {
            for line in error.lines() {
                write_stderr(&format!("{line}\n"));
            }
            return 1;
        }
    };
    // Read the embedded surface now: a build with a broken copy stops here, not at a first request.
    Surface::embedded();
    std::panic::set_hook(Box::new(|information| {
        // One line, no backtrace: a tool's panic is answered as an error and the session goes on.
        write_stderr(&format!(
            "[ontology-atlas-mcp] a handler stopped unexpectedly: {information}\n"
        ));
    }));
    write_stderr(&format!(
        "[ontology-atlas-mcp] connected. vault={}\n",
        config.vault_root.display()
    ));
    let session = Session::new(config, Box::new(std::io::stdout()));
    session.run(std::io::stdin());
    0
}
