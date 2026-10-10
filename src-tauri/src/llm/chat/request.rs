use crate::llm::curl::curl_config_for;
use crate::llm::local_endpoint::{LOCAL_CHAT_PATH, LOCAL_PROVIDER, local_endpoint, normalize_base_url};
use crate::llm::verify::{ANTHROPIC_VERSION, Target, checked_secret, wrong_target};
use crate::errors::coded;

/// Same host as the verify URL, or chat goes somewhere key registration never promised.
pub(super) const ANTHROPIC_CHAT_URL: &str = "https://api.anthropic.com/v1/messages";
const OPENAI_CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";
/// The model name flows into the path, so `validate_model_id` must narrow it first
/// or it could escape the path or inject a query.
const GEMINI_CHAT_URL_PREFIX: &str = "https://generativelanguage.googleapis.com/v1beta/models/";

/// Carries vault excerpts in its body.
pub(super) struct ChatRequest {
    pub(super) url: String,
    pub(super) headers: Vec<(String, String)>,
    pub(super) body: String,
}

/// Placement decides which characters are allowed.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ModelPlacement {
    /// Runner names like `qwen3:8b` need `:` and `/`.
    Body,
    /// There `:` and `/` are syntax and would redirect the key.
    UrlPath,
}

pub(super) fn model_placement(provider: &str) -> ModelPlacement {
    if provider == "gemini" {
        ModelPlacement::UrlPath
    } else {
        ModelPlacement::Body
    }
}

pub(super) fn validate_model_id(model: &str, placement: ModelPlacement) -> Result<&str, String> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return Err(coded("model-empty", ""));
    }
    let allowed = |ch: char| {
        ch.is_ascii_alphanumeric()
            || matches!(ch, '.' | '_' | '-')
            || (placement == ModelPlacement::Body && matches!(ch, ':' | '/'))
    };
    if trimmed.len() > 100 || !trimmed.chars().all(allowed) {
        return Err(coded("model-invalid", trimmed));
    }
    Ok(trimmed)
}

pub(super) fn chat_request(
    provider: &str,
    model: &str,
    target: &Target<'_>,
    body: &str,
) -> Result<ChatRequest, String> {
    let model = validate_model_id(model, model_placement(provider))?;
    let json = ("content-type".to_string(), "application/json".to_string());
    match (provider, target) {
        ("anthropic", Target::Vendor { secret }) => Ok(ChatRequest {
            url: ANTHROPIC_CHAT_URL.to_string(),
            headers: vec![
                ("x-api-key".into(), checked_secret(secret)?.to_string()),
                ("anthropic-version".into(), ANTHROPIC_VERSION.into()),
                json,
            ],
            body: body.to_string(),
        }),
        ("openai", Target::Vendor { secret }) => Ok(ChatRequest {
            url: OPENAI_CHAT_URL.to_string(),
            headers: vec![
                (
                    "authorization".into(),
                    format!("Bearer {}", checked_secret(secret)?),
                ),
                json,
            ],
            body: body.to_string(),
        }),
        ("gemini", Target::Vendor { secret }) => Ok(ChatRequest {
            url: format!("{GEMINI_CHAT_URL_PREFIX}{model}:generateContent"),
            headers: vec![
                ("x-goog-api-key".into(), checked_secret(secret)?.to_string()),
                json,
            ],
            body: body.to_string(),
        }),
        // The OpenAI-compatible endpoint rather than Ollama's `/api/chat`, so any runner
        // works.
        (LOCAL_PROVIDER, Target::Address { base_url }) => Ok(ChatRequest {
            url: local_endpoint(&normalize_base_url(base_url)?, LOCAL_CHAT_PATH),
            headers: vec![json],
            body: body.to_string(),
        }),
        (LOCAL_PROVIDER, _) | ("anthropic" | "openai" | "gemini", _) => Err(wrong_target(provider)),
        (other, _) => Err(coded("unsupported-provider", other)),
    }
}

pub(super) fn curl_chat_config(request: &ChatRequest) -> String {
    curl_config_for(&request.url, &request.headers, Some(&request.body))
}

#[cfg(test)]
mod tests;
