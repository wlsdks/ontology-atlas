//! Git's verdict on which changed paths it ignores: one `git check-ignore` per batch, through the
//! hardened runner, with the paths on its input. A tracked file is never reported as ignored.

use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::Path;
use std::process::Stdio;

/// Git ends `check-ignore` with 0 when it ignores some path and 1 when it ignores none.
const SOME_IGNORED: i32 = 0;
const NONE_IGNORED: i32 = 1;

/// The paths of `relative_paths` Git ignores in the worktree at `folder`; `None` when Git could
/// not say. Paths travel NUL-separated, so no name needs quoting.
pub(crate) fn ignored_paths<'a>(
    folder: &Path,
    relative_paths: impl Iterator<Item = &'a str>,
) -> Option<HashSet<String>> {
    let mut input = Vec::new();
    for path in relative_paths {
        input.extend_from_slice(path.as_bytes());
        input.push(0);
    }
    let mut child = crate::git::hardened_base_command()
        // `check-ignore` refuses every path under literal pathspecs; it takes no other magic.
        .env_remove("GIT_LITERAL_PATHSPECS")
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_ALLOW_PROTOCOL", "")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C")
        .args(["check-ignore", "-z", "--stdin"])
        .current_dir(folder)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdin = child.stdin.take()?;
    // Written from another thread so a full output pipe cannot stall the write.
    let writer = std::thread::spawn(move || stdin.write_all(&input));
    let mut printed = Vec::new();
    let read = child.stdout.take()?.read_to_end(&mut printed);
    let written = writer.join().ok().and_then(Result::ok);
    let status = child.wait().ok()?;
    read.ok()?;
    written?;
    match status.code() {
        Some(SOME_IGNORED | NONE_IGNORED) => Some(
            printed
                .split(|byte| *byte == 0)
                .filter(|path| !path.is_empty())
                .map(|path| String::from_utf8_lossy(path).into_owned())
                .collect(),
        ),
        _ => None,
    }
}
