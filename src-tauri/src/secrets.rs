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
        .ok_or_else(|| format!("지원하지 않는 제공자예요: {provider}"))
}

fn entry(provider: &str) -> Result<Entry, String> {
    let account = validate_provider(provider)?;
    Entry::new(SERVICE, account).map_err(|err| format!("키체인을 열 수 없어요: {err}"))
}

/// 키의 **모양만** 보여주기 위한 꼬리 4자. 전체 값은 절대 프런트로 가지 않는다.
/// 사용자가 "내가 넣은 그 키가 맞나" 를 확인할 수 있는 최소 정보다.
fn tail4(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    let start = chars.len().saturating_sub(4);
    chars[start..].iter().collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    provider: String,
    /// 키가 키체인에 있는가.
    stored: bool,
    /// 마지막 4자 — 있을 때만. **전체 값은 어떤 커맨드로도 나가지 않는다.**
    last4: Option<String>,
}

/// 키 저장 — **사용자가 설정 화면에서 직접 붙여넣고 저장을 누를 때만**.
///
/// 빈 문자열은 거절한다(실수로 지워버리는 경로를 막는다 — 지우려면
/// `secret_clear` 를 명시적으로 부른다).
#[tauri::command]
pub fn secret_set(provider: String, secret: String) -> Result<SecretStatus, String> {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return Err("키가 비어 있어요. 지우려면 '지우기' 를 눌러주세요.".into());
    }
    let known = validate_provider(&provider)?;
    entry(&provider)?
        .set_password(trimmed)
        .map_err(|err| format!("키를 저장하지 못했어요: {err}"))?;
    Ok(SecretStatus {
        provider: known.to_string(),
        stored: true,
        last4: Some(tail4(trimmed)),
    })
}

/// 키 상태 — **있는가 · 마지막 4자**. 전체 값을 돌려주는 경로는 없다.
#[tauri::command]
pub fn secret_status(provider: String) -> Result<SecretStatus, String> {
    let known = validate_provider(&provider)?;
    match entry(&provider)?.get_password() {
        Ok(secret) => Ok(SecretStatus {
            provider: known.to_string(),
            stored: true,
            last4: Some(tail4(&secret)),
        }),
        // 없음 = 정상 상태다(에러가 아니다). 다른 키체인 오류도 "없음" 으로
        // 강등한다 — 사용자에게 필요한 답은 "지금 쓸 수 있나" 뿐이고, 잠긴
        // 키체인을 에러로 띄우면 화면이 막힌다.
        Err(_) => Ok(SecretStatus {
            provider: known.to_string(),
            stored: false,
            last4: None,
        }),
    }
}

/// **Rust 안에서만** 키를 읽는다 — 호출을 붙이는 쪽(`llm.rs`)이 요청 헤더를
/// 만들 때 쓴다. tauri 커맨드가 아니므로 이 값은 IPC 경계를 넘지 못한다
/// (파일 상단 계약 그대로: 전체 키를 반환하는 **커맨드**는 없다).
pub(crate) fn read_secret(provider: &str) -> Result<String, String> {
    let known = validate_provider(provider)?;
    entry(known)?
        .get_password()
        .map_err(|_| "저장된 키가 없어요. 먼저 키를 등록해 주세요.".to_string())
}

/// 키 삭제 — 없어도 성공으로 본다(멱등). "지웠는데 에러" 는 사용자에게
/// 의미 없는 불안만 준다.
///
/// ## 다만 「없었다」와 「못 지웠다」는 다르다 (2026-08-17)
///
/// 예전에는 `let _ = handle.delete_credential();` 로 결과를 통째로 버리고
/// **무조건** `stored: false` 를 돌려줬다. 키체인이 잠겨 있거나 삭제가
/// 실패해도 화면은 「지웠어요」라고 말했고, **키는 그대로 남아 있었다.**
///
/// 멱등성 논리("없으면 성공")는 옳지만 여기까지 오면 안 된다. 이 모듈이 다루는
/// 것은 비밀이고, **지워졌다는 거짓말은 사용자가 안심하고 그 자리를 떠나게
/// 만든다** — 지워졌다고 믿고 컴퓨터를 넘기거나 공유한다. 이 파일 맨 위가
/// 선언한 계약("WebView 가 키를 절대 보지 못하게 한다")과 같은 무게의 약속이다.
///
/// 그래서 오류의 **종류를 가른다**: 없어서 실패한 것만 성공으로 보고, 나머지는
/// 실패라고 말한다. 지우지 못한 것을 지웠다고 하는 것보다, 못 지웠다고 하는
/// 편이 언제나 낫다.
///
/// ⚠️ **확인에 `secret_status` 를 쓰면 안 된다.** 그 함수는 일부러 모든
/// 키체인 오류를 「없음」으로 강등한다(잠긴 키체인 때문에 화면이 막히지 않게).
/// 그러니 그것으로 확인하면 잠긴 키체인이 그대로 「지워짐」으로 통과한다 —
/// 고치려던 결함과 똑같은 답이 나온다.
#[tauri::command]
pub fn secret_clear(provider: String) -> Result<SecretStatus, String> {
    let known = validate_provider(&provider)?;
    let handle = entry(&provider)?;
    let cleared = SecretStatus {
        provider: known.to_string(),
        stored: false,
        last4: None,
    };
    // 키체인 결과를 세 갈래로 좁혀서 **판정은 순수 함수에 맡긴다** — 키체인이
    // 있어야 도는 코드는 테스트할 수 없지만, 판정은 테스트할 수 있다.
    let deleted = match handle.delete_credential() {
        Ok(()) => Step::Done,
        Err(keyring::Error::NoEntry) => Step::Missing,
        Err(_) => Step::Failed,
    };
    // 지웠다고 주장하기 전에 되읽는다. 삭제가 애초에 실패했으면 되읽을 필요가
    // 없다(그 자체로 답이 나왔다).
    let readback = if deleted == Step::Done {
        match handle.get_password() {
            Ok(_) => Step::Done, // 아직 읽힌다 = 안 지워졌다
            Err(keyring::Error::NoEntry) => Step::Missing,
            Err(_) => Step::Failed,
        }
    } else {
        Step::Failed
    };
    if is_cleared(deleted, readback) {
        Ok(cleared)
    } else {
        Err(STILL_THERE.to_string())
    }
}

/// 키체인 한 번의 결과를 이 셋으로 좁힌다.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Step {
    /// 됐다(삭제 성공 · 되읽기에서 아직 값이 읽힘).
    Done,
    /// 그런 항목이 없다.
    Missing,
    /// 다른 이유로 실패했다 — 잠긴 키체인 등. **모른다는 뜻이다.**
    Failed,
}

/// 「정말 지워졌는가」 판정. 여기서 `true` 를 돌려주면 화면이 사용자에게
/// **지워졌다고 말한다** — 그 말에 기대어 사람은 컴퓨터를 넘기거나 공유한다.
/// 그래서 **확실할 때만** `true` 다.
pub(crate) fn is_cleared(deleted: Step, readback: Step) -> bool {
    match deleted {
        // 애초에 없었다 — 멱등. "지웠는데 에러" 라는 의미 없는 불안을 안 준다.
        Step::Missing => true,
        // 못 지웠다. 잠긴 키체인이면 값은 그대로 남아 있다.
        Step::Failed => false,
        Step::Done => match readback {
            // 확인됐다.
            Step::Missing => true,
            // 지웠다는데 아직 읽힌다 — 안 지워진 것이다.
            Step::Done => false,
            // 삭제 자체는 성공했다. 되읽기가 다른 이유로 실패한 것까지 실패로
            // 부르면 멀쩡한 삭제마다 경고가 뜬다.
            Step::Failed => true,
        },
    }
}

/// 지우지 못했을 때 사용자가 읽는 문장. 왜 안 됐는지와 **직접 지우는 길**을
/// 같이 준다 — 이 저장소의 강등 카드 규율과 같다(못 하는 이유 + 갈 곳).
const STILL_THERE: &str = "키를 지우지 못했어요. 키체인이 잠겨 있을 수 있어요 — \
잠금을 풀고 다시 시도하거나, 키체인 접근 앱에서 \"Ontology Atlas\" 항목을 직접 지워 주세요.";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clearing_is_only_claimed_when_it_is_certain() {
        // 2026-08-17 실측 재현: 예전 코드는 삭제 결과를 통째로 버리고 무조건
        // "지웠어요" 를 돌려줬다. 잠긴 키체인에서 키는 그대로 남아 있었다.
        assert!(!is_cleared(Step::Failed, Step::Failed), "못 지웠으면 지웠다고 하면 안 된다");
        // 지웠다는데 아직 읽히면 안 지워진 것이다.
        assert!(!is_cleared(Step::Done, Step::Done), "아직 읽히면 안 지워진 것이다");
    }

    #[test]
    fn absent_key_still_counts_as_cleared() {
        // 멱등 — 원래 의도는 지킨다. "없는 걸 지웠다" 로 불안 주지 않는다.
        assert!(is_cleared(Step::Missing, Step::Failed));
        assert!(is_cleared(Step::Missing, Step::Missing));
    }

    #[test]
    fn a_verified_delete_is_cleared() {
        // 늘 실패하는 판정은 판정이 아니다 — 정상 경로가 통과하는지도 본다.
        assert!(is_cleared(Step::Done, Step::Missing));
    }

    #[test]
    fn a_successful_delete_survives_an_unreadable_readback() {
        // 삭제는 됐는데 되읽기만 다른 이유로 실패한 경우까지 실패로 부르면
        // 멀쩡한 삭제마다 경고가 뜬다.
        assert!(is_cleared(Step::Done, Step::Failed));
    }

    #[test]
    fn provider_allowlist_rejects_arbitrary_names() {
        // 프런트가 넘긴 문자열이 그대로 키체인 계정이 되므로 오타는 유령
        // 엔트리를 만든다 — 허용 목록 밖은 전부 거절한다.
        assert!(validate_provider("anthropic").is_ok());
        assert!(validate_provider("openai").is_ok());
        assert!(validate_provider("gemini").is_ok());
        // 대소문자·공백·별칭은 전부 거절 — 하나라도 통과하면 같은 키가 두 계정
        // 이름으로 나뉘어 "저장은 됐는데 못 찾는" 상태가 된다.
        for bad in ["", "Anthropic", "anthropic ", "../etc", "Gemini", "google"] {
            assert!(validate_provider(bad).is_err(), "should reject {bad:?}");
        }
    }

    #[test]
    fn the_named_vendor_list_stays_frozen_at_three() {
        // 4번째는 "Bearer 호환으로 흡수 불가 + 수요 증거" 둘 다일 때만이다.
        // 이 단언이 깨졌다면 그 두 조건을 PR 본문에 적었는지 먼저 확인하라.
        assert_eq!(PROVIDERS.len(), 3, "명명 벤더는 3에서 동결한다");
    }

    #[test]
    fn tail4_never_leaks_more_than_four_characters() {
        assert_eq!(tail4("sk-ant-api03-abcdefgh"), "efgh");
        assert_eq!(tail4("abc"), "abc"); // 4자 미만이면 있는 만큼
        assert_eq!(tail4(""), "");
        // 긴 키에서도 꼬리 4자 초과로 새지 않는다.
        let long = "x".repeat(200);
        assert_eq!(tail4(&long).chars().count(), 4);
    }

    #[test]
    fn tail4_is_safe_on_multibyte_input() {
        // 바이트 슬라이싱이면 여기서 패닉한다 — char 단위여야 한다.
        assert_eq!(tail4("키가한글이면어떡하지"), "어떡하지");
    }

    #[test]
    fn empty_secret_is_rejected_so_saving_cannot_silently_erase() {
        assert!(secret_set("anthropic".into(), "   ".into()).is_err());
        assert!(secret_set("anthropic".into(), "".into()).is_err());
    }

    #[test]
    fn there_is_no_command_that_returns_the_whole_secret() {
        // 이 파일에 `get_password` 결과를 그대로 반환하는 pub 커맨드가 없어야
        // 한다는 계약을 소스로 확인한다. 새 커맨드를 추가하다 실수로 전체 값을
        // 노출하면 여기서 걸린다.
        let source = include_str!("secrets.rs");
        // `SecretStatus` 만 반환 타입으로 쓴다.
        let command_count = source.matches("#[tauri::command]").count();
        let status_returns = source.matches("Result<SecretStatus, String>").count();
        assert_eq!(command_count, status_returns, "모든 커맨드는 SecretStatus 만 반환해야 한다");
    }
}
