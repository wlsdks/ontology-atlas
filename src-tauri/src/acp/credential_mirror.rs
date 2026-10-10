use std::path::{Path, PathBuf};

use super::bounded_command::{bounded_output, bounded_success, KEYCHAIN_PROBE_TIMEOUT};

/// `Claude Code-credentials-<first 8 hex of sha256(config dir)>`; tests pin two measured values.
pub(super) fn claude_credentials_service(config_dir: &Path) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(config_dir.to_string_lossy().as_bytes());
    format!("Claude Code-credentials-{}", &hex_lower(&digest)[..8])
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// The terminal's login item when no `CLAUDE_CONFIG_DIR` is set.
const DEFAULT_CLAUDE_CREDENTIALS_SERVICE: &str = "Claude Code-credentials";

/// Not a precedence list; `choose_terminal_credential` decides.
fn terminal_login_services(home: &Path) -> Vec<String> {
    vec![
        DEFAULT_CLAUDE_CREDENTIALS_SERVICE.to_string(),
        claude_credentials_service(&home.join(".claude")),
    ]
}

/// Compared by digest and write time, never by handling the secret again.
#[derive(Debug, Clone, PartialEq, Eq)]
struct CredentialCarrier {
    /// Never the secret.
    pub(crate) label: String,
    pub(crate) digest: String,
    /// Sortable UTC `YYYYMMDDhhmmss`; `None` when unknown.
    pub(crate) written: Option<String>,
    /// The account half of the item name decides whether Claude Code reads it; `None` for a file.
    pub(crate) account: Option<String>,
}

/// Agreeing carriers name the login; disagreeing ones are decided by the newest
/// write (the terminal rewrites the one it uses); anything else is `None` and nothing
/// is installed. Stamps must share one clock (UTC), and `claude auth status` cannot arbitrate.
fn choose_terminal_credential(carriers: &[CredentialCarrier]) -> Option<usize> {
    let first = carriers.first()?;
    if carriers
        .iter()
        .all(|carrier| carrier.digest == first.digest)
    {
        return Some(0);
    }
    if carriers.iter().any(|carrier| carrier.written.is_none()) {
        return None;
    }
    let newest = carriers
        .iter()
        .filter_map(|carrier| carrier.written.as_deref())
        .max()?;
    let mut latest = carriers
        .iter()
        .enumerate()
        .filter(|(_, carrier)| carrier.written.as_deref() == Some(newest));
    let (index, winner) = latest.next()?;
    if latest.any(|(_, carrier)| carrier.digest != winner.digest) {
        return None;
    }
    Some(index)
}

/// The digest is the only form of the secret compared, logged or kept.
fn credential_digest(secret: &str) -> String {
    use sha2::{Digest, Sha256};
    hex_lower(&Sha256::digest(secret.as_bytes()))
}

/// The sortable part is the leading digit run in the last quoted field.
fn parse_keychain_written(attributes: &str) -> Option<String> {
    let line = attributes.lines().find(|line| line.contains("\"mdat\""))?;
    let quoted = line.rsplit('"').nth(1)?;
    let stamp: String = quoted.chars().take_while(char::is_ascii_digit).collect();
    (stamp.len() == 14).then_some(stamp)
}

/// The account decides which of several same-service items Claude Code reads.
fn parse_keychain_account(attributes: &str) -> Option<String> {
    let line = attributes.lines().find(|line| line.contains("\"acct\""))?;
    let account = line.rsplit('"').nth(1)?.trim();
    (!account.is_empty()).then(|| account.to_string())
}

fn file_written(path: &Path) -> Option<String> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let stamp: chrono::DateTime<chrono::Utc> = modified.into();
    Some(stamp.format("%Y%m%d%H%M%S").to_string())
}

fn profile_fetched_at(account: Option<&serde_json::Value>) -> Option<i64> {
    account?.get("profileFetchedAt")?.as_i64()
}

/// The account name is a cache refreshed separately on each side, so the terminal's
/// copy travels only when it is not the staler (`profileFetchedAt`).
fn merge_oauth_account(
    app_document: Option<serde_json::Value>,
    terminal_document: &serde_json::Value,
) -> Option<serde_json::Value> {
    let account = terminal_document.get("oauthAccount")?.clone();
    let mut document = match app_document {
        Some(serde_json::Value::Object(map)) => serde_json::Value::Object(map),
        _ => serde_json::Value::Object(serde_json::Map::new()),
    };
    let installed = profile_fetched_at(document.get("oauthAccount"));
    if let (Some(installed), Some(arriving)) = (installed, profile_fetched_at(Some(&account))) {
        if installed > arriving {
            return None;
        }
    }
    document
        .as_object_mut()?
        .insert("oauthAccount".to_string(), account);
    Some(document)
}

/// Mirrors the terminal's login into the app-scoped keychain item before every
/// session, because that item shadows the linked file. Failure is silent.
/// The secret rides one `security` argv, as when Claude Code writes the item itself; only its digest is logged.
pub(super) fn mirror_terminal_login(config_dir: &Path, home: &Path) -> bool {
    #[allow(unused_mut)]
    let mut mirrored = false;
    #[cfg(target_os = "macos")]
    {
        // Only the real home has a terminal login; tests would leave keychain litter.
        if std::env::var_os("HOME").map(PathBuf::from).as_deref() != Some(home) {
            return false;
        }

        let app_service = claude_credentials_service(config_dir);

        // The file counts as a carrier beside the keychain items.
        let mut secrets: Vec<String> = Vec::new();
        let mut carriers: Vec<CredentialCarrier> = Vec::new();
        for service in terminal_login_services(home) {
            let mut read = std::process::Command::new("security");
            read.args(["find-generic-password", "-s", &service, "-w"]);
            let Some(secret) = bounded_output(read, KEYCHAIN_PROBE_TIMEOUT) else {
                continue;
            };
            let secret = secret.trim_end_matches(['\n', '\r']).to_string();
            if secret.is_empty() {
                continue;
            }
            let mut show = std::process::Command::new("security");
            show.args(["find-generic-password", "-s", &service]);
            let attributes = bounded_output(show, KEYCHAIN_PROBE_TIMEOUT);
            let written = attributes.as_deref().and_then(parse_keychain_written);
            let account = attributes.as_deref().and_then(parse_keychain_account);
            carriers.push(CredentialCarrier {
                label: service,
                digest: credential_digest(&secret),
                written,
                account,
            });
            secrets.push(secret);
        }
        let terminal_file = home.join(".claude").join(".credentials.json");
        if let Ok(secret) = std::fs::read_to_string(&terminal_file) {
            let secret = secret.trim_end_matches(['\n', '\r']).to_string();
            if !secret.is_empty() {
                carriers.push(CredentialCarrier {
                    label: terminal_file.to_string_lossy().to_string(),
                    digest: credential_digest(&secret),
                    written: file_written(&terminal_file),
                    account: None,
                });
                secrets.push(secret);
            }
        }

        if let Some(chosen) = choose_terminal_credential(&carriers) {
            let carrier = &carriers[chosen];
            let account = mirror_account(&carriers, home);
            // Skip when identical so a locked keychain is not prompted. Reads are
            // account-qualified, or `security` answers with whichever item it reaches first.
            let mut read_app = std::process::Command::new("security");
            read_app.args([
                "find-generic-password",
                "-s",
                &app_service,
                "-a",
                &account,
                "-w",
            ]);
            let installed = bounded_output(read_app, KEYCHAIN_PROBE_TIMEOUT)
                .map(|secret| credential_digest(secret.trim_end_matches(['\n', '\r'])));
            if installed.as_deref() == Some(carrier.digest.as_str()) {
                log::info!("acp login already matches {}", carrier.label);
                mirrored = true;
            } else {
                let mut write = std::process::Command::new("security");
                write.args([
                    "add-generic-password",
                    "-U",
                    "-s",
                    &app_service,
                    "-a",
                    &account,
                    "-w",
                    &secrets[chosen],
                ]);
                // Only the exit status proves the write; a false yes would take down the symlink below.
                if bounded_success(write, KEYCHAIN_PROBE_TIMEOUT) {
                    log::info!(
                        "acp login mirrored from {} into the app-scoped keychain item for {account}",
                        carrier.label
                    );
                    mirrored = true;
                } else {
                    log::warn!(
                        "acp login not mirrored: writing the app-scoped keychain item for {account} failed"
                    );
                }
            }
            if mirrored && account != LEGACY_MIRROR_ACCOUNT {
                // The old-account copy is never read and makes unqualified reads ambiguous.
                let _ = std::process::Command::new("security")
                    .args([
                        "delete-generic-password",
                        "-s",
                        &app_service,
                        "-a",
                        LEGACY_MIRROR_ACCOUNT,
                    ])
                    .output();
            }
        } else if !carriers.is_empty() {
            // Never install a guess.
            log::info!(
                "acp login left alone: {} terminal carriers disagree and none is newest",
                carriers.len()
            );
        }

        let terminal_document = std::fs::read_to_string(home.join(".claude.json"))
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
        if let Some(terminal_document) = terminal_document {
            let app_path = config_dir.join(".claude.json");
            let app_document = std::fs::read_to_string(&app_path)
                .ok()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
            if let Some(merged) = merge_oauth_account(app_document, &terminal_document) {
                if let Ok(text) = serde_json::to_string_pretty(&merged) {
                    let _ = std::fs::write(&app_path, text);
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (config_dir, home);
    }
    mirrored
}

/// Kept only to clear the unread legacy copy.
const LEGACY_MIRROR_ACCOUNT: &str = "claude";

/// Claude Code reads the account it writes, the login name; copy it from the
/// carriers, falling back to the home folder name.
fn mirror_account(carriers: &[CredentialCarrier], home: &Path) -> String {
    carriers
        .iter()
        .find_map(|carrier| carrier.account.clone())
        .or_else(|| {
            home.file_name()
                .map(|name| name.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| LEGACY_MIRROR_ACCOUNT.to_string())
}

#[cfg(test)]
mod tests;
