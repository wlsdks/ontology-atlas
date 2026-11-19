// The loopback rule for both http and https: an IP literal must be loopback, and
// `localhost` must resolve only to loopback, after which curl is pinned to those
// addresses so a later lookup cannot move the connection elsewhere.

use super::super::local_endpoint::{local_endpoint as openai_path, normalize_base_url};
use super::EmbedError;
use std::net::{IpAddr, ToSocketAddrs};

/// Host and port to addresses; injected so tests can answer as a hostile resolver.
pub(super) type Resolve = dyn Fn(&str, u16) -> std::io::Result<Vec<IpAddr>> + Send + Sync;

pub(super) fn system_resolve(host: &str, port: u16) -> std::io::Result<Vec<IpAddr>> {
    Ok((host, port).to_socket_addrs()?.map(|a| a.ip()).collect())
}

#[derive(Debug, Clone)]
pub(super) struct Endpoint {
    /// As normalized, possibly ending in `/v1`.
    base: String,
    host: String,
    /// A curl `resolve` entry, present when the host is a name.
    pin: Option<String>,
}

impl Endpoint {
    pub(super) fn host(&self) -> &str {
        &self.host
    }

    pub(super) fn pin(&self) -> Option<&str> {
        self.pin.as_deref()
    }

    pub(super) fn openai_url(&self, path: &str) -> String {
        openai_path(&self.base, path)
    }

    /// Ollama's own routes hang off the root, not `/v1`.
    pub(super) fn api_url(&self, path: &str) -> String {
        format!("{}/api/{path}", self.base.trim_end_matches("/v1"))
    }
}

pub(super) fn local_endpoint(raw: &str, resolve: &Resolve) -> Result<Endpoint, EmbedError> {
    let base = normalize_base_url(raw).map_err(EmbedError::Endpoint)?;
    let (scheme, rest) = base
        .split_once("://")
        .ok_or_else(|| EmbedError::Endpoint("endpoint-scheme-unsupported".into()))?;
    let authority = rest.split('/').next().unwrap_or("");
    let (host, port) = split_authority(authority, scheme)?;
    let pin = match host.parse::<IpAddr>() {
        Ok(address) if address.is_loopback() => None,
        Ok(_) => return Err(EmbedError::NotLocal),
        Err(_) if host.eq_ignore_ascii_case("localhost") => {
            let addresses = resolve(host, port).map_err(|_| EmbedError::ResolvesElsewhere)?;
            if addresses.is_empty() || addresses.iter().any(|a| !a.is_loopback()) {
                return Err(EmbedError::ResolvesElsewhere);
            }
            Some(format!("{host}:{port}:{}", curl_addresses(&addresses)))
        }
        Err(_) => return Err(EmbedError::NotLocal),
    };
    Ok(Endpoint {
        host: authority.to_string(),
        base,
        pin,
    })
}

/// The host without brackets, and the port the scheme implies when none is given.
fn split_authority<'a>(authority: &'a str, scheme: &str) -> Result<(&'a str, u16), EmbedError> {
    let (host, port) = match authority.strip_prefix('[') {
        Some(rest) => {
            let (host, tail) = rest.split_once(']').ok_or(EmbedError::NotLocal)?;
            (host, tail.strip_prefix(':'))
        }
        None => match authority.split_once(':') {
            Some((host, port)) => (host, Some(port)),
            None => (authority, None),
        },
    };
    let port = match port {
        Some(port) => port
            .parse::<u16>()
            .map_err(|_| EmbedError::Endpoint("endpoint-port-invalid".into()))?,
        None if scheme == "https" => 443,
        None => 80,
    };
    Ok((host, port))
}

fn curl_addresses(addresses: &[IpAddr]) -> String {
    let mut seen: Vec<String> = Vec::new();
    for address in addresses {
        let text = match address {
            IpAddr::V4(v4) => v4.to_string(),
            IpAddr::V6(v6) => format!("[{v6}]"),
        };
        if !seen.contains(&text) {
            seen.push(text);
        }
    }
    seen.join(",")
}
