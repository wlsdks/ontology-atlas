use serde::Serialize;
use serde_json::Value;

pub(super) const TRAILER: &str = "\nATLAS_HTTP\t%{http_code}\t%header{x-ratelimit-remaining}\t%header{x-ratelimit-reset}\t%header{retry-after}";
pub(super) const TRAILER_LIMIT: usize = 512;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PullLookupFailure {
    pub kind: &'static str,
    pub retry_at: Option<String>,
}

#[derive(Debug)]
pub(crate) enum FetchError {
    Unavailable,
    RateLimited(Option<String>),
}
impl From<&str> for FetchError {
    fn from(_: &str) -> Self { Self::Unavailable }
}
impl FetchError {
    pub(super) fn failure(self) -> Option<PullLookupFailure> {
        match self {
            Self::RateLimited(retry_at) => Some(PullLookupFailure { kind: "rate-limited", retry_at }),
            Self::Unavailable => Some(PullLookupFailure { kind: "unavailable", retry_at: None }),
        }
    }
}

pub(super) fn parse(bytes: &[u8], max: usize, success: bool, now: i64) -> Result<(Value, usize), FetchError> {
    let split = bytes.iter().rposition(|b| *b == b'\n').ok_or(FetchError::Unavailable)?;
    let (body, trailer) = bytes.split_at(split);
    if body.len() > max || trailer.len() > TRAILER_LIMIT { return Err(FetchError::Unavailable); }
    let fields: Vec<_> = std::str::from_utf8(&trailer[1..]).map_err(|_| FetchError::Unavailable)?.split('\t').collect();
    if fields.len() != 5 || fields[0] != "ATLAS_HTTP" { return Err(FetchError::Unavailable); }
    let status = fields[1].parse::<u16>().map_err(|_| FetchError::Unavailable)?;
    let remaining = fields[2].parse::<u64>().ok();
    let retry_after = fields[4].parse::<i64>().ok().filter(|v| *v > 0 && *v <= 86_400);
    if status == 429 || (status == 403 && (remaining == Some(0) || retry_after.is_some())) {
        let reset = if remaining == Some(0) { fields[3].parse::<i64>().ok() } else { None };
        let retry_at = reset.into_iter().chain(retry_after.and_then(|v| now.checked_add(v)))
            .filter(|v| *v > now && *v <= now.saturating_add(86_400)).max()
            .and_then(|v| chrono::DateTime::from_timestamp(v, 0)).map(|v| v.to_rfc3339());
        return Err(FetchError::RateLimited(retry_at));
    }
    if !success || !(200..300).contains(&status) { return Err(FetchError::Unavailable); }
    serde_json::from_slice(body).map(|v| (v, body.len())).map_err(|_| FetchError::Unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOW: i64 = 1_790_000_000;
    #[test]
    fn recognizes_only_rate_limit_evidence_and_bounds_retry_times() {
        for trailer in ["403\t0\t1790000060\t", "429\t\t\t60", "403\t58\t1790000001\t60"] {
            let bytes = format!("\nATLAS_HTTP\t{trailer}");
            let Err(FetchError::RateLimited(Some(at))) = parse(bytes.as_bytes(), 20, false, NOW) else { panic!("missing rate limit: {trailer}"); };
            assert_eq!(at, chrono::DateTime::from_timestamp(NOW + 60, 0).unwrap().to_rfc3339());
        }
        for trailer in ["403\t58\t1790000060\t", "404\t0\t1790000060\t", "500\t0\t1790000060\t"] {
            assert!(matches!(parse(format!("\nATLAS_HTTP\t{trailer}").as_bytes(), 20, false, NOW), Err(FetchError::Unavailable)));
        }
        for reset in ["invalid", "1790000000", "999999999999999999999", "1791000000"] {
            assert!(matches!(parse(format!("\nATLAS_HTTP\t403\t0\t{reset}\t").as_bytes(), 20, false, NOW), Err(FetchError::RateLimited(None))));
        }
        assert!(matches!(parse(b"\nATLAS_HTTP\t429\t\t\t", 20, false, NOW), Err(FetchError::RateLimited(None))));
    }
    #[test]
    fn keeps_successful_json_and_rejects_missing_or_oversized_metadata() {
        assert_eq!(parse(b"{}\nATLAS_HTTP\t200\t0\t1790000060\t", 2, true, NOW).unwrap(), (serde_json::json!({}), 2));
        for bytes in [b"{}".to_vec(), b"{}\nATLAS_HTTP\t200\t0\t\t\textra".to_vec(), format!("{{}}\nATLAS_HTTP\t200\t{}\t\t", "0".repeat(600)).into_bytes()] {
            assert!(matches!(parse(&bytes, 2, true, NOW), Err(FetchError::Unavailable)));
        }
        assert!(parse(b"{\"x\":1}\nATLAS_HTTP\t200\t0\t\t", 2, true, NOW).is_err());
    }
}
