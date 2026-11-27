//! How the workbench names the node it is focused on, and how `builder_context` reads that name
//! back: `domain:order` is `domains/order`, and a project is named by its slug alone.

use answer_format::whitespace::trim;

use crate::compiled_graph::Node;

const FOCUS_KINDS: [&str; 4] = ["project", "domain", "capability", "element"];

/// The `p` the workbench takes to focus `node`: `kind:` and the slug without its folder, or the
/// whole slug for a kind the workbench has no focus for.
pub fn focus_param(node: &Node) -> String {
    let slug = node.slug();
    if !FOCUS_KINDS.contains(&node.kind()) {
        return slug.to_string();
    }
    let tail = slug.split_once('/').map_or(slug, |(_, tail)| tail);
    format!("{}:{tail}", node.kind())
}

/// The slug a focus name stands for. A name that is already a slug, or is no focus name, is
/// returned as it is, without a leading `/` or `ontology/`.
pub fn slug_of_focus(input: &str) -> String {
    let trimmed = trim(input).trim_start_matches('/');
    let name = trimmed.strip_prefix("ontology/").unwrap_or(trimmed);
    if name.is_empty() || name.contains('/') {
        return name.to_string();
    }
    let Some((kind, rest)) = name.split_once(':') else {
        return name.to_string();
    };
    let tail = trim(rest);
    if tail.is_empty() {
        return name.to_string();
    }
    let folder = match kind {
        "project" => return tail.to_string(),
        "domain" => "domains",
        "capability" => "capabilities",
        "element" => "elements",
        _ => return name.to_string(),
    };
    format!("{folder}/{tail}")
}

/// `encodeURIComponent`: every byte but a letter, a digit and `-_.!~*'()` as `%XX`.
pub fn encode_uri_component(text: &str) -> String {
    let mut encoded = String::with_capacity(text.len());
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_focus_name_reads_back_as_the_slug_it_was_made_from() {
        assert_eq!(slug_of_focus("domain:order"), "domains/order");
        assert_eq!(
            slug_of_focus(" /ontology/capability:cart "),
            "capabilities/cart"
        );
        assert_eq!(slug_of_focus("project:storefront"), "storefront");
        assert_eq!(slug_of_focus("domains/order"), "domains/order");
        assert_eq!(slug_of_focus("document:readme"), "document:readme");
        assert_eq!(slug_of_focus("domain:"), "domain:");
        assert_eq!(slug_of_focus("domain:a:b"), "domains/a:b");
    }

    #[test]
    fn a_uri_component_is_written_as_the_browser_writes_it() {
        assert_eq!(
            encode_uri_component("domain:a b/\u{c8fc}"),
            "domain%3Aa%20b%2F%EC%A3%BC"
        );
        assert_eq!(encode_uri_component("A-z_0.!~*'()"), "A-z_0.!~*'()");
    }
}
