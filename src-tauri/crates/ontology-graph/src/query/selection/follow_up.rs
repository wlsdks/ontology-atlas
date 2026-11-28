//! The calls a scan suggests next: it only lists candidates, so an agent proves a row with a
//! focused call before it treats the row as evidence.

use serde::Serialize;

/// The arguments of a suggested `query_ontology` call. One list of fields keeps each call's keys
/// in the order the calls have always been written.
#[derive(Serialize, Default)]
struct CallArguments<'a> {
    operation: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    slug: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    depth: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    direction: Option<&'static str>,
    #[serde(rename = "includeExternal", skip_serializing_if = "Option::is_none")]
    include_external: Option<bool>,
    #[serde(rename = "includeUnresolved", skip_serializing_if = "Option::is_none")]
    include_unresolved: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<usize>,
}

#[derive(Serialize)]
struct SuggestedCall<'a> {
    id: &'static str,
    label: &'static str,
    tool: &'static str,
    arguments: CallArguments<'a>,
}

fn call<'a>(
    id: &'static str,
    label: &'static str,
    arguments: CallArguments<'a>,
) -> SuggestedCall<'a> {
    SuggestedCall {
        id,
        label,
        tool: "query_ontology",
        arguments,
    }
}

/// What to call after `match_nodes`, about its first row.
#[derive(Serialize)]
pub struct NodeFollowUp<'a> {
    #[serde(rename = "focusSlug")]
    focus_slug: &'a str,
    reason: &'static str,
    calls: Vec<SuggestedCall<'a>>,
}

impl<'a> NodeFollowUp<'a> {
    pub fn about(slug: &'a str) -> Self {
        Self {
            focus_slug: slug,
            reason: "match_nodes is a scan; use these focused follow-up calls before treating a row as graph evidence.",
            calls: vec![
                call(
                    "profile_focus",
                    "Profile the first matched node before editing.",
                    CallArguments {
                        operation: "node_profile",
                        slug: Some(slug),
                        limit: Some(12),
                        ..CallArguments::default()
                    },
                ),
                call(
                    "outgoing_edges",
                    "Inspect outgoing edges from the first match.",
                    CallArguments {
                        operation: "neighbors",
                        slug: Some(slug),
                        direction: Some("outgoing"),
                        include_external: Some(true),
                        include_unresolved: Some(true),
                        limit: Some(20),
                        ..CallArguments::default()
                    },
                ),
                call(
                    "incoming_edges",
                    "Inspect incoming edges into the first match.",
                    CallArguments {
                        operation: "neighbors",
                        slug: Some(slug),
                        direction: Some("incoming"),
                        limit: Some(20),
                        ..CallArguments::default()
                    },
                ),
                call(
                    "incoming_impact",
                    "Check incoming blast radius before changing this node.",
                    CallArguments {
                        operation: "blast_radius",
                        slug: Some(slug),
                        depth: Some(2),
                        direction: Some("incoming"),
                        ..CallArguments::default()
                    },
                ),
            ],
        }
    }
}
