// BYOK API 키를 **OS 키체인**에 넣고 꺼내는 브리지 (#80).
//
// ## 왜 Rust 가 키를 소유하는가
//
// 이 모듈의 존재 이유는 단 하나다: **WebView 가 키를 절대 보지 못하게 한다.**
//
// 브라우저 저장소(localStorage/IndexedDB)에 키를 두면 XSS 하나로 키가 털린다.
// 정적 export 로 나가는 웹 빌드에서 BYOK 를 하려면 `anthropic-dangerous-direct-
// browser-access` 헤더가 필요한데, 그 헤더 이름 자체가 벤더의 경고다.
//
// 그래서 계약이 이렇다:
//
// - 저장: 프런트가 키를 **한 번** 넘기고 즉시 자기 상태에서 지운다.
// - 조회: 프런트는 키를 **꺼낼 수 없다**. `secret_status` 는 "있는가 · 어떤
//   모양인가(마지막 4자)" 만 돌려준다. 전체 값을 반환하는 커맨드가 **없다.**
// - 사용: 나중에 LLM 호출을 붙일 때도 **Rust 안에서** 키체인을 읽어 요청을
//   보낸다. 키가 IPC 경계를 다시 넘지 않는다.
//
// 신뢰 헌장(`local-first.md` v9)이 BYOK 를 허용하는 조건 — opt-in · 전송 범위
// UI 명시 · 로컬 감사 로그 — 중 이 모듈은 **보관**만 담당한다. 전송·감사는
// 호출을 붙이는 슬라이스에서 별도로 구현한다.
//
// ## 왜 계정 이름을 provider 로 쪼개는가
//
// 사용자가 Anthropic 과 OpenAI 를 동시에 쓸 수 있다. 하나의 엔트리에 뭉치면
// 하나를 지울 때 다른 하나가 같이 날아간다.

use keyring::Entry;
use serde::Serialize;

/// 키체인 서비스 이름 — Keychain Access.app 에서 사용자가 이 이름으로 찾는다.
/// 앱 이름과 같아야 "이게 뭐지" 가 안 생긴다.
const SERVICE: &str = "Ontology Atlas";

/// 지원 provider. 임의 문자열을 받지 않는 이유: 프런트가 넘긴 값이 그대로
/// 키체인 계정 이름이 되므로, 오타 하나가 "저장은 됐는데 못 찾는" 유령 엔트리를
/// 만든다. 허용 목록으로 고정한다.
const PROVIDERS: [&str; 2] = ["anthropic", "openai"];

fn validate_provider(provider: &str) -> Result<&'static str, String> {
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

/// 키 삭제 — 없어도 성공으로 본다(멱등). "지웠는데 에러" 는 사용자에게
/// 의미 없는 불안만 준다.
#[tauri::command]
pub fn secret_clear(provider: String) -> Result<SecretStatus, String> {
    let known = validate_provider(&provider)?;
    if let Ok(handle) = entry(&provider) {
        let _ = handle.delete_credential();
    }
    Ok(SecretStatus {
        provider: known.to_string(),
        stored: false,
        last4: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_allowlist_rejects_arbitrary_names() {
        // 프런트가 넘긴 문자열이 그대로 키체인 계정이 되므로 오타는 유령
        // 엔트리를 만든다 — 허용 목록 밖은 전부 거절한다.
        assert!(validate_provider("anthropic").is_ok());
        assert!(validate_provider("openai").is_ok());
        for bad in ["", "Anthropic", "anthropic ", "../etc", "gemini"] {
            assert!(validate_provider(bad).is_err(), "should reject {bad:?}");
        }
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
