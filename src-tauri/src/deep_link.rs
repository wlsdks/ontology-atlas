//! The one inbound address `ontology-atlas://mcp?install=<payload>`, which only
//! opens a pre-filled form: no node addresses, nothing that writes or executes.
//! It rejects rather than repairs, and a refusal never navigates the window.

/// A real base64 config is a few hundred bytes; nothing interesting fits beside it.
pub(crate) const MAX_INSTALL_PAYLOAD_BYTES: usize = 4096;

/// Every variant is logged verbatim so a link that did nothing has a reason.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum DeepLinkRefusal {
    ForeignScheme,
    NotTheInstallDoor,
    NoPayload,
    ExtraQueryKey(String),
    PayloadCharacter(char),
    PayloadTooLong(usize),
}

impl std::fmt::Display for DeepLinkRefusal {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ForeignScheme => write!(formatter, "not an ontology-atlas: URL"),
            Self::NotTheInstallDoor => {
                write!(formatter, "only ontology-atlas://mcp?install= is answered")
            }
            Self::NoPayload => write!(formatter, "no install payload"),
            Self::ExtraQueryKey(key) => write!(formatter, "unexpected query key {key:?}"),
            Self::PayloadCharacter(character) => {
                write!(formatter, "payload character {character:?} is not URL-safe")
            }
            Self::PayloadTooLong(length) => write!(
                formatter,
                "payload is {length} bytes, over the {MAX_INSTALL_PAYLOAD_BYTES} cap"
            ),
        }
    }
}

/// No quote, backslash, angle bracket, ampersand or space, or the payload could
/// end the JavaScript literal the route script builds.
fn is_payload_character(character: char) -> bool {
    character.is_ascii_alphanumeric()
        || matches!(character, '+' | '/' | '=' | '-' | '_' | '.' | '~' | '%')
}

/// Returned still encoded, so the route receives exactly what the web parser
/// (`src/shared/lib/mcp-install-link.ts`) would get from an address bar.
pub(crate) fn parse_install_deep_link(raw: &str) -> Result<String, DeepLinkRefusal> {
    let trimmed = raw.trim();
    let rest = trimmed
        .strip_prefix("ontology-atlas://")
        .or_else(|| {
            // Only the scheme is case-folded; clients may capitalise it.
            let (scheme, rest) = trimmed.split_once("://")?;
            scheme
                .eq_ignore_ascii_case("ontology-atlas")
                .then_some(rest)
        })
        .ok_or(DeepLinkRefusal::ForeignScheme)?;

    let (destination, query) = match rest.split_once('?') {
        Some((destination, query)) => (destination, query),
        None => (rest, ""),
    };
    // `mcp/` comes from clients that root a bare host; anything else is another address.
    if !matches!(destination, "mcp" | "mcp/") {
        return Err(DeepLinkRefusal::NotTheInstallDoor);
    }

    let mut payload: Option<&str> = None;
    for pair in query.split('&').filter(|pair| !pair.is_empty()) {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key != "install" {
            return Err(DeepLinkRefusal::ExtraQueryKey(key.to_string()));
        }
        // Picking one of two payloads would be guessing.
        if payload.is_some() {
            return Err(DeepLinkRefusal::ExtraQueryKey("install".to_string()));
        }
        payload = Some(value);
    }

    let payload = payload
        .filter(|value| !value.is_empty())
        .ok_or(DeepLinkRefusal::NoPayload)?;
    if payload.len() > MAX_INSTALL_PAYLOAD_BYTES {
        return Err(DeepLinkRefusal::PayloadTooLong(payload.len()));
    }
    if let Some(character) = payload
        .chars()
        .find(|character| !is_payload_character(*character))
    {
        return Err(DeepLinkRefusal::PayloadCharacter(character));
    }
    Ok(payload.to_string())
}

/// Escaped again although `parse_install_deep_link` refused literal-ending characters: a new caller would skip that check.
/// One location.assign per link, marked in sessionStorage, because re-evaluating it would restart the navigation.
pub(crate) fn build_install_route_script(payload: &str) -> String {
    build_install_route_script_for(payload, &crate::APP_LOCALES)
}

fn build_install_route_script_for(payload: &str, locales: &[&str]) -> String {
    let payload = crate::js_string_literal(payload);
    let locales = locales
        .iter()
        .map(|locale| crate::js_string_literal(locale))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        r#"(() => {{
  const payload = {payload};
  const query = "?tab=connectors&install=" + payload;
  if (location.pathname.endsWith("/mcp/") && location.search === query) return true;
  let tried = null;
  try {{ tried = sessionStorage.getItem("atlas.deepLink"); }} catch (error) {{ tried = null; }}
  if (tried === payload) return true;
  try {{ sessionStorage.setItem("atlas.deepLink", payload); }} catch (error) {{ /* private mode */ }}
  const locales = [{locales}];
  const first = location.pathname.split("/")[1];
  const locale = locales.includes(first) ? first : "en";
  location.assign("/" + locale + "/mcp/" + query);
  return false;
}})()"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_mcp_install_door_hands_back_its_payload_untouched() {
        let payload = "eyJuYW1lIjoiTm90aW9uIiwidHlwZSI6Imh0dHAiLCJ1cmwiOiJodHRwczovL21jcC5ub3Rpb24uY29tL21jcCJ9";
        assert_eq!(
            parse_install_deep_link(&format!("ontology-atlas://mcp?install={payload}")),
            Ok(payload.to_string())
        );
    }

    #[test]
    fn a_rooted_path_and_a_capitalised_scheme_are_the_same_door() {
        assert_eq!(
            parse_install_deep_link("ontology-atlas://mcp/?install=e30"),
            Ok("e30".to_string())
        );
        assert_eq!(
            parse_install_deep_link("Ontology-Atlas://mcp?install=e30"),
            Ok("e30".to_string())
        );
    }

    /// A token beside the payload refuses the whole URL, or a link could carry a
    /// credential into the app.
    #[test]
    fn a_url_carrying_a_token_is_refused_whole() {
        for url in [
            "ontology-atlas://mcp?install=e30&token=sk-live-0123456789",
            "ontology-atlas://mcp?token=sk-live-0123456789&install=e30",
            "ontology-atlas://mcp?install=e30&access_token=abc",
        ] {
            assert!(
                matches!(
                    parse_install_deep_link(url),
                    Err(DeepLinkRefusal::ExtraQueryKey(_))
                ),
                "{url} must be refused whole, not trimmed down to its payload"
            );
        }
    }

    #[test]
    fn a_second_install_parameter_refuses_rather_than_picks() {
        assert!(parse_install_deep_link("ontology-atlas://mcp?install=e30&install=e31").is_err());
    }

    #[test]
    fn no_other_destination_is_answered() {
        for url in [
            "ontology-atlas://concept/9d1f?install=e30",
            "ontology-atlas://topology?install=e30",
            "ontology-atlas://mcp/install?config=e30",
            "ontology-atlas://mcp/connectors?install=e30",
            "ontology-atlas://",
        ] {
            assert!(
                parse_install_deep_link(url).is_err(),
                "{url} must not open anything"
            );
        }
    }

    #[test]
    fn a_foreign_scheme_is_refused_before_anything_else() {
        assert_eq!(
            parse_install_deep_link("https://ontologyatlas.com/mcp?install=e30"),
            Err(DeepLinkRefusal::ForeignScheme)
        );
        assert_eq!(
            parse_install_deep_link("file:///etc/passwd"),
            Err(DeepLinkRefusal::ForeignScheme)
        );
    }

    #[test]
    fn a_payload_with_an_unsafe_character_is_refused() {
        for url in [
            "ontology-atlas://mcp?install=e30\"+alert(1)",
            "ontology-atlas://mcp?install=e30'",
            "ontology-atlas://mcp?install=e30\\",
            "ontology-atlas://mcp?install=e 30",
            "ontology-atlas://mcp?install=<script>",
        ] {
            assert!(
                matches!(
                    parse_install_deep_link(url),
                    Err(DeepLinkRefusal::PayloadCharacter(_))
                ),
                "{url} must be refused for its characters"
            );
        }
    }

    #[test]
    fn an_oversized_payload_is_refused_rather_than_truncated() {
        let payload = "a".repeat(MAX_INSTALL_PAYLOAD_BYTES + 1);
        assert_eq!(
            parse_install_deep_link(&format!("ontology-atlas://mcp?install={payload}")),
            Err(DeepLinkRefusal::PayloadTooLong(
                MAX_INSTALL_PAYLOAD_BYTES + 1
            ))
        );
    }

    #[test]
    fn the_script_builds_the_locale_relative_connectors_route() {
        let script = build_install_route_script("e30");
        assert!(script.contains(r#"const payload = "e30";"#), "{script}");
        assert!(
            script.contains(r#""?tab=connectors&install=" + payload"#),
            "{script}"
        );
        assert!(
            script.contains(r#"const locales = ["en", "ko", "ja", "zh"];"#),
            "{script}"
        );
        assert!(
            script.contains(r#"locales.includes(first) ? first : "en""#),
            "{script}"
        );
        let four = build_install_route_script_for("e30", &["en", "ko", "ja", "zh"]);
        assert!(
            four.contains(r#"const locales = ["en", "ko", "ja", "zh"];"#),
            "{four}"
        );
        assert!(script.contains("return true;"), "{script}");
        assert!(
            script.contains(r#"sessionStorage.setItem("atlas.deepLink", payload)"#),
            "{script}"
        );
        assert!(
            script.contains("if (tried === payload) return true;"),
            "{script}"
        );
    }
}
