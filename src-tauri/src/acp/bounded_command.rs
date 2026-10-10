const MAX_PROBE_OUTPUT_BYTES: u64 = 1024 * 1024;

/// `Command::output()` waits forever, and a locked keychain or a networked wrapper
/// can hang session start. `None` means unknown, not failed.
pub(crate) fn bounded_output(
    command: std::process::Command,
    limit: std::time::Duration,
) -> Option<String> {
    crate::command_output::run(command, limit, MAX_PROBE_OUTPUT_BYTES).ok().map(|(_, stdout)| stdout)
}

/// `security add-generic-password` prints nothing either way, so only the exit status
/// proves a write; a false yes would delete the working credential links.
pub(super) fn bounded_success(command: std::process::Command, limit: std::time::Duration) -> bool {
    crate::command_output::run(command, limit, MAX_PROBE_OUTPUT_BYTES)
        .map(|(success, _)| success)
        .unwrap_or(false)
}

/// A multiple of the measured times (claude 300ms, codex 45ms).
pub(super) const LOGIN_PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// A locked keychain waits on an unlock dialog, which must not eat session start.
pub(super) const KEYCHAIN_PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

#[cfg(test)]
mod tests;
