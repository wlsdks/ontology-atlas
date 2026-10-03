// BYOK API keys live in the OS keychain so the WebView never sees them, since
// browser storage is exposed to XSS: the frontend stores a key once, and
// only presence and the last four characters ever come back.

use keyring::Entry;
use serde::Serialize;

use crate::errors::coded;

/// Users find the entry under this name in Keychain Access.
const SERVICE: &str = "Ontology Atlas";

/// An allowlist, because the value becomes the keychain account name and a typo
/// would create a ghost entry. A fourth named vendor needs its own non-Bearer
/// auth protocol and evidence of demand; others use the connect-by-address path.
const PROVIDERS: [&str; 3] = ["anthropic", "openai", "gemini"];

pub(crate) fn validate_provider(provider: &str) -> Result<&'static str, String> {
    PROVIDERS
        .iter()
        .find(|known| **known == provider)
        .copied()
        .ok_or_else(|| coded("unsupported-provider", provider))
}

fn entry(provider: &str) -> Result<Entry, String> {
    let account = validate_provider(provider)?;
    Entry::new(SERVICE, account).map_err(|err| coded("keychain-unavailable", err))
}

fn tail4(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    let start = chars.len().saturating_sub(4);
    chars[start..].iter().collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    provider: String,
    stored: bool,
    last4: Option<String>,
}

/// An empty key is rejected; erasing goes through `secret_clear`.
#[tauri::command]
pub fn secret_set(provider: String, secret: String) -> Result<SecretStatus, String> {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return Err(coded("secret-empty", ""));
    }
    let known = validate_provider(&provider)?;
    entry(&provider)?
        .set_password(trimmed)
        .map_err(|err| coded("keychain-write-failed", err))?;
    Ok(SecretStatus {
        provider: known.to_string(),
        stored: true,
        last4: Some(tail4(trimmed)),
    })
}

#[tauri::command(async)]
pub fn secret_status(provider: String) -> Result<SecretStatus, String> {
    let known = validate_provider(&provider)?;
    match entry(&provider)?.get_password() {
        Ok(secret) => Ok(SecretStatus {
            provider: known.to_string(),
            stored: true,
            last4: Some(tail4(&secret)),
        }),
        // Every keychain error reads as absent: a locked keychain must not block the screen.
        Err(_) => Ok(SecretStatus {
            provider: known.to_string(),
            stored: false,
            last4: None,
        }),
    }
}

/// Not a tauri command, so the key never crosses the IPC boundary.
pub(crate) fn read_secret(provider: &str) -> Result<String, String> {
    let known = validate_provider(provider)?;
    entry(known)?
        .get_password()
        .map_err(|_| coded("secret-missing", ""))
}

/// Absent counts as success, but any other failure is reported: claiming a
/// key was deleted while it remains is worse than an error. Verify with a
/// read-back, not `secret_status`, which demotes a locked keychain to absent.
#[tauri::command]
pub fn secret_clear(provider: String) -> Result<SecretStatus, String> {
    let known = validate_provider(&provider)?;
    let handle = entry(&provider)?;
    let cleared = SecretStatus {
        provider: known.to_string(),
        stored: false,
        last4: None,
    };
    let deleted = match handle.delete_credential() {
        Ok(()) => Step::Done,
        Err(keyring::Error::NoEntry) => Step::Missing,
        Err(_) => Step::Failed,
    };
    let readback = if deleted == Step::Done {
        match handle.get_password() {
            Ok(_) => Step::Done,
            Err(keyring::Error::NoEntry) => Step::Missing,
            Err(_) => Step::Failed,
        }
    } else {
        Step::Failed
    };
    if is_cleared(deleted, readback) {
        Ok(cleared)
    } else {
        Err(coded("keychain-clear-failed", ""))
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Step {
    /// Delete succeeded, or on read-back a value was still read.
    Done,
    Missing,
    /// Failed for another reason, such as a locked keychain: unknown.
    Failed,
}

/// `true` only when certain, because the screen then tells the user it is gone.
pub(crate) fn is_cleared(deleted: Step, readback: Step) -> bool {
    match deleted {
        Step::Missing => true,
        Step::Failed => false,
        Step::Done => match readback {
            Step::Missing => true,
            Step::Done => false,
            // A read-back failing for another reason must not warn on every good delete.
            Step::Failed => true,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clearing_is_only_claimed_when_it_is_certain() {
        assert!(
            !is_cleared(Step::Failed, Step::Failed),
            "a failed delete must not report deleted"
        );
        assert!(
            !is_cleared(Step::Done, Step::Done),
            "still readable means not deleted"
        );
    }

    #[test]
    fn absent_key_still_counts_as_cleared() {
        assert!(is_cleared(Step::Missing, Step::Failed));
        assert!(is_cleared(Step::Missing, Step::Missing));
    }

    #[test]
    fn a_verified_delete_is_cleared() {
        assert!(is_cleared(Step::Done, Step::Missing));
    }

    #[test]
    fn a_successful_delete_survives_an_unreadable_readback() {
        assert!(is_cleared(Step::Done, Step::Failed));
    }

    #[test]
    fn provider_allowlist_rejects_arbitrary_names() {
        assert!(validate_provider("anthropic").is_ok());
        assert!(validate_provider("openai").is_ok());
        assert!(validate_provider("gemini").is_ok());
        for bad in ["", "Anthropic", "anthropic ", "../etc", "Gemini", "google"] {
            assert!(validate_provider(bad).is_err(), "should reject {bad:?}");
        }
    }

    #[test]
    fn the_named_vendor_list_stays_frozen_at_three() {
        assert_eq!(PROVIDERS.len(), 3, "named vendors stay frozen at three");
    }

    #[test]
    fn tail4_never_leaks_more_than_four_characters() {
        assert_eq!(tail4("sk-ant-api03-abcdefgh"), "efgh");
        assert_eq!(tail4("abc"), "abc");
        assert_eq!(tail4(""), "");
        let long = "x".repeat(200);
        assert_eq!(tail4(&long).chars().count(), 4);
    }

    #[test]
    fn tail4_is_safe_on_multibyte_input() {
        // Byte slicing would panic here.
        assert_eq!(tail4("키가한글이면어떡하지"), "어떡하지");
    }

    #[test]
    fn empty_secret_is_rejected_so_saving_cannot_silently_erase() {
        assert!(secret_set("anthropic".into(), "   ".into()).is_err());
        assert!(secret_set("anthropic".into(), "".into()).is_err());
    }

    #[test]
    fn there_is_no_command_that_returns_the_whole_secret() {
        let source = include_str!("secrets.rs");
        let signatures: Vec<_> = source
            .split_inclusive('\n')
            .scan(0usize, |offset, line| {
                let start = *offset;
                *offset += line.len();
                Some((start, line))
            })
            .filter_map(|(start, line)| {
                line.trim_start()
                    .starts_with("#[tauri::command")
                    .then(|| source[start..].split_once('{').unwrap().0)
            })
            .collect();
        for signature in &signatures {
            let compact: String = signature.chars().filter(|c| !c.is_whitespace()).collect();
            assert!(
                compact.ends_with("->Result<SecretStatus,String>"),
                "a command returns a type outside SecretStatus: {signature}"
            );
        }
        assert_eq!(
            signatures.len(),
            3,
            "set, status and clear must be inventoried"
        );
    }
}
