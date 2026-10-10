use super::RECORD_LIMIT;
use sha2::{Digest, Sha256};

pub(super) fn digest_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(super) fn validate_digest(value: &str) -> Result<&str, String> {
    let hex = value
        .strip_prefix("sha256:")
        .ok_or_else(|| "artifact digest must use sha256:<lowercase hex>".to_string())?;
    if hex.len() != 64
        || !hex
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err("artifact digest must use sha256:<lowercase hex>".into());
    }
    Ok(hex)
}

pub(super) fn artifact_file_name(digest: &str) -> Result<String, String> {
    Ok(format!("{}.artifact", validate_digest(digest)?))
}

pub(super) fn validate_record_file_name(name: &str) -> Result<(), String> {
    if !name.is_ascii() || name.len() != 64 || !name.ends_with(".md") {
        return Err("invalid meaning transition record file name".into());
    }
    let bytes = name.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        let valid = match index {
            4 | 7 | 13 | 16 | 19 | 24 | 33 | 38 | 43 | 48 => *byte == b'-',
            10 => *byte == b'T',
            23 => *byte == b'Z',
            61 => *byte == b'.',
            62 => *byte == b'm',
            63 => *byte == b'd',
            25..=60 => byte.is_ascii_digit() || (b'a'..=b'f').contains(byte),
            _ => byte.is_ascii_digit(),
        };
        if !valid {
            return Err("invalid meaning transition record file name".into());
        }
    }
    if bytes[39] != b'4' || !matches!(bytes[44], b'8' | b'9' | b'a' | b'b') {
        return Err("meaning transition record name must carry a UUIDv4".into());
    }
    Ok(())
}

fn header_string(content: &str, key: &str) -> Result<String, String> {
    serde_json::from_value(header_value(content, key)?)
        .map_err(|_| format!("invalid meaning transition {key}"))
}

fn header_value(content: &str, key: &str) -> Result<serde_json::Value, String> {
    let header = content
        .strip_prefix("---\n")
        .and_then(|rest| rest.split_once("\n---\n").map(|pair| pair.0))
        .ok_or_else(|| "meaning transition metadata is missing".to_string())?;
    let prefix = format!("{key}: ");
    let mut values = header.lines().filter_map(|line| line.strip_prefix(&prefix));
    let value = values
        .next()
        .ok_or_else(|| format!("meaning transition metadata is missing {key}"))?;
    if values.next().is_some() {
        return Err(format!("meaning transition metadata repeats {key}"));
    }
    serde_json::from_str(value).map_err(|_| format!("invalid meaning transition {key}"))
}

pub(super) fn referenced_artifact_digests(
    content: &str,
) -> Result<std::collections::HashSet<String>, String> {
    let schema = header_string(content, "schema")?;
    let proposal = header_value(content, "proposal")?;
    let mut result = std::collections::HashSet::new();
    if schema == "atlas-meaning-transition/v2" {
        let artifacts = proposal
            .get("artifacts")
            .and_then(|value| value.as_object())
            .ok_or_else(|| "meaning transition v2 artifacts are missing".to_string())?;
        if artifacts.len() != 3
            || !["retainedBefore", "preview", "decision"]
                .iter()
                .all(|key| artifacts.contains_key(*key))
        {
            return Err("meaning transition v2 requires exact retained before, preview, and decision artifacts".into());
        }
        for artifact in artifacts.values() {
            let digest = artifact
                .get("contentDigest")
                .and_then(|value| value.as_str())
                .ok_or_else(|| "meaning transition v2 artifact digest is missing".to_string())?;
            validate_digest(digest)?;
            result.insert(digest.to_string());
        }
        if result.len() != 3 {
            return Err("meaning transition v2 artifacts must use distinct content digests".into());
        }
    } else {
        let code = header_value(content, "codeEvidence")?;
        let proposal_digest = proposal
            .pointer("/artifact/contentDigest")
            .and_then(|value| value.as_str())
            .ok_or_else(|| "meaning transition proposal artifact digest is missing".to_string())?;
        validate_digest(proposal_digest)?;
        result.insert(proposal_digest.to_string());
        if let Some(diff) = code.get("diffArtifact").filter(|value| !value.is_null()) {
            let digest = diff
                .get("contentDigest")
                .and_then(|value| value.as_str())
                .ok_or_else(|| "meaning transition diff artifact digest is missing".to_string())?;
            validate_digest(digest)?;
            result.insert(digest.to_string());
        }
    }
    Ok(result)
}

pub(super) fn validate_record_envelope(name: &str, content: &str) -> Result<(), String> {
    validate_record_file_name(name)?;
    if content.len() > RECORD_LIMIT {
        return Err("meaning transition record exceeds the supported byte budget".into());
    }
    if !matches!(
        header_string(content, "schema")?.as_str(),
        "atlas-meaning-transition/v1" | "atlas-meaning-transition/v2"
    ) {
        return Err("unsupported meaning transition schema".into());
    }
    let id = header_string(content, "event_id")?;
    let created_at = header_string(content, "created_at")?;
    let parsed = chrono::DateTime::parse_from_rfc3339(&created_at)
        .map_err(|_| "invalid meaning transition creation time".to_string())?;
    if parsed.to_rfc3339_opts(chrono::SecondsFormat::Millis, true) != created_at {
        return Err("meaning transition creation time must be an exact UTC timestamp".into());
    }
    let expected = format!("{}-{id}.md", created_at.replace([':', '.'], "-"));
    if name != expected {
        return Err("meaning transition record name must match its generated identity".into());
    }
    Ok(())
}
