// How a worker process is started and collected.

use super::super::worker::WORKER_FLAG;
use crate::llm::embed::EmbedError;
use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// A started worker process as the app sees it.
pub(crate) trait Process: Send {
    fn kill(&mut self);
    /// Whether the process has exited within `within`, collected so no zombie is left.
    fn exited_within(&mut self, within: Duration) -> bool;
    fn id(&self) -> u32;
}

impl Process for Child {
    fn kill(&mut self) {
        let _ = Child::kill(self);
    }

    fn exited_within(&mut self, within: Duration) -> bool {
        let deadline = Instant::now() + within;
        loop {
            match self.try_wait() {
                Ok(Some(_)) | Err(_) => return true,
                Ok(None) if Instant::now() >= deadline => return false,
                Ok(None) => std::thread::sleep(Duration::from_millis(5)),
            }
        }
    }

    fn id(&self) -> u32 {
        Child::id(self)
    }
}

/// Waits `grace` for the process to exit, then kills it and collects it.
pub(super) fn reap(process: &Mutex<Box<dyn Process>>, grace: Duration) {
    let mut process = process
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if !process.exited_within(grace) {
        process.kill();
        process.exited_within(Duration::from_secs(10));
    }
}

pub(crate) struct Spawned {
    pub input: Box<dyn Write + Send>,
    pub output: Box<dyn Read + Send>,
    pub process: Box<dyn Process>,
}

/// How a worker is started; tests start one that serves a fake model.
pub(crate) trait Launch: Send + Sync {
    fn launch(&self) -> Result<Spawned, EmbedError>;
}

/// This executable with `--embed-worker`.
pub(crate) struct SelfLaunch;

impl Launch for SelfLaunch {
    fn launch(&self) -> Result<Spawned, EmbedError> {
        let exe = std::env::current_exe().map_err(start_error)?;
        let mut command = Command::new(exe);
        crate::process::no_console::hide_console(&mut command).arg(WORKER_FLAG);
        spawn_piped(command)
    }
}

fn start_error(error: impl std::fmt::Display) -> EmbedError {
    EmbedError::WorkerStart(crate::errors::squeeze(&error.to_string()))
}

/// Starts `command` with piped stdin and stdout and stderr discarded.
pub(crate) fn spawn_piped(mut command: Command) -> Result<Spawned, EmbedError> {
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command.spawn().map_err(start_error)?;
    match (child.stdin.take(), child.stdout.take()) {
        (Some(input), Some(output)) => Ok(Spawned {
            input: Box::new(input),
            output: Box::new(output),
            process: Box::new(child),
        }),
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            Err(EmbedError::WorkerStart("pipes".into()))
        }
    }
}
