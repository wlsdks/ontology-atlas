use crate::errors::coded;

/// Keyless connect-by-address: any OpenAI-compatible runner (Ollama, LM Studio,
/// vLLM) without naming vendors. No keychain and no auth header on this branch.
pub(super) const LOCAL_PROVIDER: &str = "local";
pub(super) const LOCAL_DEFAULT_BASE_URL: &str = "http://localhost:11434";
/// The OpenAI-compatible list, not Ollama's `/api/tags`, so any runner verifies the same way.
pub(super) const LOCAL_MODELS_PATH: &str = "models";
pub(super) const LOCAL_CHAT_PATH: &str = "chat/completions";

/// Rejects `http` beyond loopback (no plaintext vault excerpts on the internet),
/// userinfo (URL secrets leak into logs), whitespace or quotes (a new curl config
/// line) and query or fragment (an unconfigured endpoint).
pub(super) fn normalize_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(coded("endpoint-empty", ""));
    }
    if trimmed.len() > 300 {
        return Err(coded("endpoint-too-long", ""));
    }
    if trimmed
        .chars()
        .any(|ch| ch.is_whitespace() || ch.is_control() || matches!(ch, '"' | '\\' | '?' | '#'))
    {
        return Err(coded("endpoint-invalid-characters", ""));
    }
    let (scheme, rest) = trimmed
        .split_once("://")
        .ok_or_else(|| coded("endpoint-scheme-unsupported", ""))?;
    if scheme != "http" && scheme != "https" {
        return Err(coded("endpoint-scheme-unsupported", ""));
    }
    let authority = rest.split('/').next().unwrap_or("");
    if authority.is_empty() {
        return Err(coded("endpoint-host-missing", ""));
    }
    if authority.contains('@') {
        return Err(coded("endpoint-credentials-in-url", ""));
    }
    if scheme == "http" && !is_loopback_authority(authority) {
        return Err(coded("endpoint-plaintext-blocked", ""));
    }
    Ok(trimmed.to_string())
}

pub(super) fn is_loopback_authority(authority: &str) -> bool {
    let host = match authority.strip_prefix('[') {
        Some(rest) => rest.split(']').next().unwrap_or(""),
        None => authority.split(':').next().unwrap_or(""),
    };
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

/// Accepts both Ollama's bare address and LM Studio's `/v1` as pasted.
pub(super) fn local_endpoint(base_url: &str, path: &str) -> String {
    if base_url.ends_with("/v1") {
        format!("{base_url}/{path}")
    } else {
        format!("{base_url}/v1/{path}")
    }
}

#[cfg(test)]
mod tests;
