// Bridge to store and retrieve BYOK API keys in the **OS keychain** (#80).
//
// ## Why Rust owns the key
//
// The sole reason this module exists is: **to prevent WebView from ever seeing the key.**
//
// Storing keys in browser storage (localStorage/IndexedDB) exposes them to XSS.
// To use BYOK in a static export web build, you need the `anthropic-dangerous-direct-
// browser-access` header, and the header name itself is a vendor warning.
//
// So the contract is:
//
// - Storage: Frontend passes the key **once** and immediately clears it from its own state.
// - Retrieval: Frontend **cannot retrieve** the key. `secret_status` only returns "exists · what
//   it looks like (last 4 chars)". There is **no** command that returns the full value.
// - Usage: Even when attaching LLM calls later, read the keychain **inside Rust** and send the request.
//   The key does not cross the IPC boundary again.
//
// Trust charter (`local-first.md` v9) allows BYOK under conditions — opt-in · explicit transmission scope
// UI · local audit log — this module handles **storage** only. Transmission and auditing are
// implemented separately in the slice attaching the call.
//
// ## Why split account names by provider?
//
// Users can use Anthropic and OpenAI simultaneously. If bundled into one entry,
// deleting one causes the other to disappear too.

use keyring::Entry;
use serde::Serialize;

use crate::errors::coded;

/// Keychain service name — users find this by this name in Keychain Access.app.
/// Must match the app name to avoid "what is this?" confusion.
const SERVICE: &str = "Ontology Atlas";

/// Supported provider. We do not accept arbitrary strings because the value passed from the frontend
/// becomes the Keychain account name, so a single typo creates a "saved but unfound" ghost entry.
/// We lock this to an allowlist.
///
/// ## Naming vendors are **frozen at 3** here
///
/// The cost is not the number of vendors but the **number of concepts**. These three all share one syntax:
/// paste the key · store it in Keychain · look only at the last 4 characters · verify via the hardcoded formula
/// address. Thus, adding a third (gemini) did not increase the concepts users need to learn.
///
/// A fourth naming vendor is accepted only if it satisfies both conditions **simultaneously**:
/// ① It uses a proprietary authentication protocol that cannot be absorbed via Bearer compatibility (OpenAI style), and
/// ② There is evidence of actual demand.
///
/// Vendors that fail these conditions (Groq·Mistral·xAI·Together·LM Studio…) do not come here — the single path where users enter addresses directly, "connect by address," absorbs them all.
/// If we start maintaining the naming list per vendor, the list will always be short for someone
/// (long tail), and the code rots every time a vendor API changes.
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

/// The tail 4 characters, to show only the key's **shape**. The full value never goes
/// to the front end. The minimum information that lets the user confirm "is this the
/// key I put in".
fn tail4(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    let start = chars.len().saturating_sub(4);
    chars[start..].iter().collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    provider: String,
    /// Whether the key is in the keychain.
    stored: bool,
    /// Last 4 characters — only when present. **The full value leaves through no command whatsoever.**
    last4: Option<String>,
}

/// Store a key — **only when the user pastes it directly on the settings screen and presses save**.
///
/// An empty string is rejected (this blocks the path of erasing by accident — to
/// erase, call `secret_clear` explicitly).
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

/// Key status — **present or not · last 4 characters**. There is no path that returns the full value.
#[tauri::command]
pub fn secret_status(provider: String) -> Result<SecretStatus, String> {
    let known = validate_provider(&provider)?;
    match entry(&provider)?.get_password() {
        Ok(secret) => Ok(SecretStatus {
            provider: known.to_string(),
            stored: true,
            last4: Some(tail4(&secret)),
        }),
        // Absent = a normal state (not an error). Other keychain errors are also
        // demoted to "absent" — the only answer the user needs is "can I use it right
        // now", and surfacing a locked keychain as an error blocks the screen.
        Err(_) => Ok(SecretStatus {
            provider: known.to_string(),
            stored: false,
            last4: None,
        }),
    }
}

/// Reads the key **inside Rust only** — used by the side attaching the call
/// (`llm.rs`) when it builds the request headers. This is not a tauri command, so
/// the value cannot cross the IPC boundary (exactly the contract at the top of this
/// file: there is no **command** that returns the full key).
pub(crate) fn read_secret(provider: &str) -> Result<String, String> {
    let known = validate_provider(provider)?;
    entry(known)?
        .get_password()
        .map_err(|_| coded("secret-missing", ""))
}

/// Delete a key — absence still counts as success (idempotent). "I deleted it and got
/// an error" only gives the user meaningless anxiety.
///
/// ## But "it wasn't there" and "it couldn't be deleted" are different (2026-08-17)
///
/// Previously, `let _ = handle.delete_credential();` threw the result away wholesale
/// and returned `stored: false` **unconditionally**. Even when the keychain was locked
/// or the deletion failed, the screen said "deleted", and **the key was still there.**
///
/// The idempotency logic ("absent means success") is right, but it must not reach this
/// far. What this module handles is a secret, and **a lie that it was deleted lets the
/// user walk away reassured** — believing it is deleted, they hand over or share the
/// computer. This is a promise of the same weight as the contract declared at the top
/// of this file ("the WebView never sees the key").
///
/// So we **split errors by kind**: only failure-because-absent counts as success, and
/// the rest is reported as failure. Saying it could not be deleted is always better
/// than saying something was deleted when it was not.
///
/// ⚠️ **Do not use `secret_status` for the verification.** That function deliberately
/// demotes every keychain error to "absent" (so a locked keychain does not block the
/// screen). Verify with it, and a locked keychain passes straight through as
/// "deleted" — the exact same answer as the defect this was meant to fix.
#[tauri::command]
pub fn secret_clear(provider: String) -> Result<SecretStatus, String> {
    let known = validate_provider(&provider)?;
    let handle = entry(&provider)?;
    let cleared = SecretStatus {
        provider: known.to_string(),
        stored: false,
        last4: None,
    };
    // Narrow the keychain result to three branches and **leave the judgment to a pure
    // function** — code that needs a keychain to run cannot be tested, but the
    // judgment can.
    let deleted = match handle.delete_credential() {
        Ok(()) => Step::Done,
        Err(keyring::Error::NoEntry) => Step::Missing,
        Err(_) => Step::Failed,
    };
    // Read back before claiming it was deleted. If the deletion failed in the first
    // place, no read-back is needed (that alone is the answer).
    let readback = if deleted == Step::Done {
        match handle.get_password() {
            Ok(_) => Step::Done, // still readable = not deleted
            Err(keyring::Error::NoEntry) => Step::Missing,
            Err(_) => Step::Failed,
        }
    } else {
        Step::Failed
    };
    if is_cleared(deleted, readback) {
        Ok(cleared)
    } else {
        // The sentence the user reads lives in `messages/<locale>.json` under
        // `nativeErrors`, keyed by this code. It gives the reason together with **a
        // way to delete it themselves** — the same degradation-card discipline as
        // everywhere else here (why it cannot + where to go).
        Err(coded("keychain-clear-failed", ""))
    }
}

/// Narrows the result of one keychain call to these three.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Step {
    /// It went through (delete succeeded · on read-back, a value was still read).
    Done,
    /// No such entry.
    Missing,
    /// Failed for another reason — a locked keychain, etc. **It means we do not know.**
    Failed,
}

/// The "was it really deleted" judgment. Returning `true` here makes the screen tell
/// the user **it was deleted** — and leaning on that word, a person hands over or
/// shares the computer. So it is `true` **only when certain**.
pub(crate) fn is_cleared(deleted: Step, readback: Step) -> bool {
    match deleted {
        // It was never there — idempotent. No meaningless "deleted, yet an error" anxiety.
        Step::Missing => true,
        // Could not delete. With a locked keychain the value is still there.
        Step::Failed => false,
        Step::Done => match readback {
            // Confirmed.
            Step::Missing => true,
            // Claimed deleted yet still readable — it was not deleted.
            Step::Done => false,
            // The deletion itself succeeded. Calling a read-back that failed for some
            // other reason a failure too would raise a warning on every perfectly fine delete.
            Step::Failed => true,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clearing_is_only_claimed_when_it_is_certain() {
        // Reproduces the 2026-08-17 observation: the old code threw the delete result
        // away wholesale and returned "deleted" unconditionally. On a locked keychain
        // the key was still there.
        assert!(!is_cleared(Step::Failed, Step::Failed), "못 지웠으면 지웠다고 하면 안 된다");
        // If it claims deleted but still reads back, it was not deleted.
        assert!(!is_cleared(Step::Done, Step::Done), "아직 읽히면 안 지워진 것이다");
    }

    #[test]
    fn absent_key_still_counts_as_cleared() {
        // Idempotent — the original intent is kept. No anxiety over "deleted something absent".
        assert!(is_cleared(Step::Missing, Step::Failed));
        assert!(is_cleared(Step::Missing, Step::Missing));
    }

    #[test]
    fn a_verified_delete_is_cleared() {
        // A judgment that always fails is not a judgment — also check that the normal path passes.
        assert!(is_cleared(Step::Done, Step::Missing));
    }

    #[test]
    fn a_successful_delete_survives_an_unreadable_readback() {
        // Calling it a failure even when the delete succeeded and only the read-back
        // failed for another reason would raise a warning on every perfectly fine delete.
        assert!(is_cleared(Step::Done, Step::Failed));
    }

    #[test]
    fn provider_allowlist_rejects_arbitrary_names() {
        // The string the front end passes becomes the keychain account as-is, so a typo
        // creates a ghost entry — everything outside the allowlist is rejected.
        assert!(validate_provider("anthropic").is_ok());
        assert!(validate_provider("openai").is_ok());
        assert!(validate_provider("gemini").is_ok());
        // Case variants, whitespace, and aliases are all rejected — let even one
        // through and the same key splits across two account names, ending in the
        // "saved but unfound" state.
        for bad in ["", "Anthropic", "anthropic ", "../etc", "Gemini", "google"] {
            assert!(validate_provider(bad).is_err(), "should reject {bad:?}");
        }
    }

    #[test]
    fn the_named_vendor_list_stays_frozen_at_three() {
        // A fourth comes only when both hold: "cannot be absorbed via Bearer
        // compatibility + evidence of demand". If this assertion broke, first check
        // that those two conditions are written in the PR body.
        assert_eq!(PROVIDERS.len(), 3, "명명 벤더는 3에서 동결한다");
    }

    #[test]
    fn tail4_never_leaks_more_than_four_characters() {
        assert_eq!(tail4("sk-ant-api03-abcdefgh"), "efgh");
        assert_eq!(tail4("abc"), "abc"); // under 4 characters, as many as there are
        assert_eq!(tail4(""), "");
        // Even on a long key, nothing beyond the tail 4 characters leaks.
        let long = "x".repeat(200);
        assert_eq!(tail4(&long).chars().count(), 4);
    }

    #[test]
    fn tail4_is_safe_on_multibyte_input() {
        // Byte slicing would panic here — it must be char-based.
        assert_eq!(tail4("키가한글이면어떡하지"), "어떡하지");
    }

    #[test]
    fn empty_secret_is_rejected_so_saving_cannot_silently_erase() {
        assert!(secret_set("anthropic".into(), "   ".into()).is_err());
        assert!(secret_set("anthropic".into(), "".into()).is_err());
    }

    #[test]
    fn there_is_no_command_that_returns_the_whole_secret() {
        // Checks against the source the contract that this file must have no pub
        // command returning the `get_password` result as-is. Accidentally exposing the
        // full value while adding a new command gets caught here.
        let source = include_str!("secrets.rs");
        // Only `SecretStatus` is used as a return type.
        let command_count = source.matches("#[tauri::command]").count();
        let status_returns = source.matches("Result<SecretStatus, String>").count();
        assert_eq!(command_count, status_returns, "모든 커맨드는 SecretStatus 만 반환해야 한다");
    }
}
