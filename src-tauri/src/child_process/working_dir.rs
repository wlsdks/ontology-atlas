//! A child inherits the app's working directory. An app started from a terminal keeps
//! that terminal's folder, which may since have been deleted; `claude` and `codex` then
//! exit 1 at once, the code the login probe reads as signed out.

use std::process::Command;

/// For a child that needs no folder of its own: the temporary directory always exists.
pub(crate) fn run_from_temp_dir(command: &mut Command) -> &mut Command {
    command.current_dir(std::env::temp_dir())
}
