//! Child processes the app spawns: hiding their console, capturing their output and
//! choosing the folder they start in.

pub(crate) mod command_output;
pub(crate) mod no_console;
pub(crate) mod working_dir;
