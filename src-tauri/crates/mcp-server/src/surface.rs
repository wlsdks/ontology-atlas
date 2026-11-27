//! The tool surface the server advertises: every tool's name, description, input and output
//! schema and annotations, the `initialize` instructions, and which tools each mode shows.
//!
//! During the port the JavaScript registry (`mcp/src/server/registry.mjs`) is the one authored
//! source. `scripts/mcp/surface/generate-surface.mjs` writes a copy into `surface/`, which this
//! module embeds; `pnpm mcp:surface:check` is red when the registry changed and the copy did not.
//! Each tool is sent to the agent as the text the generator wrote, never read and written again.

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use answer_format::utf16;
use answer_format::OrderedMap;
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;

use crate::runtime::{Modes, ToolProfile};

const TOOLS_JSON: &str = include_str!("../surface/tools.json");
const REGISTRY_JSON: &str = include_str!("../surface/registry.json");
const INSTRUCTIONS_TEMPLATE: &str = include_str!("../surface/instructions.txt");

/// One advertised tool, as `tools/list` shows it.
#[derive(Debug)]
pub struct ToolDef {
    pub name: String,
    /// The tool as the generator wrote it, which is how `tools/list` sends it.
    advertised: &'static RawValue,
    /// The names of the arguments the tool accepts, in schema order.
    pub argument_names: Vec<String>,
    /// The `readOnlyHint` annotation: a read tool.
    pub read_only: bool,
}

/// What the server reads of a tool in `surface/tools.json`.
#[derive(Deserialize)]
struct ToolHeader {
    name: String,
    #[serde(rename = "inputSchema", default)]
    input_schema: InputSchema,
    #[serde(default)]
    annotations: Annotations,
}

#[derive(Default, Deserialize)]
struct InputSchema {
    #[serde(default)]
    properties: OrderedMap<IgnoredAny>,
}

#[derive(Default, Deserialize)]
struct Annotations {
    #[serde(rename = "readOnlyHint", default)]
    read_only: bool,
}

/// `surface/registry.json`.
#[derive(Deserialize)]
struct Registry {
    #[serde(rename = "serverName")]
    server_name: String,
    #[serde(rename = "serverVersion")]
    server_version: String,
    #[serde(rename = "toolInventoryPlaceholder")]
    placeholder: String,
    #[serde(rename = "readTools")]
    read_tools: HashSet<String>,
    #[serde(rename = "constructionTools")]
    construction_tools: HashSet<String>,
    #[serde(rename = "retiredTools")]
    retired_tools: Vec<RetiredTool>,
    #[serde(rename = "topLevelNonBlankArguments")]
    non_blank: HashMap<String, Vec<String>>,
}

#[derive(Deserialize)]
struct RetiredTool {
    name: String,
    replacement: String,
}

#[derive(Debug)]
pub struct Surface {
    tools: Vec<ToolDef>,
    by_name: HashMap<String, usize>,
    read_tools: HashSet<String>,
    retired: HashMap<String, String>,
    construction: HashSet<String>,
    non_blank: HashMap<String, Vec<String>>,
    pub server_name: String,
    pub server_version: String,
    placeholder: String,
}

/// The `tools/list` result.
#[derive(Serialize)]
pub struct ToolsList<'a> {
    tools: Vec<&'a RawValue>,
}

#[derive(Debug, thiserror::Error)]
#[error("the embedded tool surface is unreadable: {0}")]
struct SurfaceError(#[from] serde_json::Error);

impl Surface {
    fn load() -> Result<Self, SurfaceError> {
        let registry: Registry = serde_json::from_str(REGISTRY_JSON)?;
        let adverts: Vec<&'static RawValue> = serde_json::from_str(TOOLS_JSON)?;
        let mut tools = Vec::with_capacity(adverts.len());
        let mut by_name = HashMap::with_capacity(adverts.len());
        for advertised in adverts {
            let header: ToolHeader = serde_json::from_str(advertised.get())?;
            by_name.insert(header.name.clone(), tools.len());
            tools.push(ToolDef {
                name: header.name,
                advertised,
                argument_names: header
                    .input_schema
                    .properties
                    .keys()
                    .map(str::to_string)
                    .collect(),
                read_only: header.annotations.read_only,
            });
        }
        Ok(Self {
            tools,
            by_name,
            read_tools: registry.read_tools,
            retired: registry
                .retired_tools
                .into_iter()
                .map(|tool| (tool.name, tool.replacement))
                .collect(),
            construction: registry.construction_tools,
            non_blank: registry.non_blank,
            server_name: registry.server_name,
            server_version: registry.server_version,
            placeholder: registry.placeholder,
        })
    }

    /// The embedded surface, read on first use. The files are compiled in, so a failure is a defect
    /// of the build that the surface tests find, not a state a running server is in.
    #[allow(
        clippy::expect_used,
        reason = "the embedded files are fixed at build time and read by the tests"
    )]
    pub fn embedded() -> &'static Surface {
        static SURFACE: OnceLock<Surface> = OnceLock::new();
        SURFACE.get_or_init(|| Surface::load().expect("the embedded tool surface is valid"))
    }

    /// A tool by name, retired ones included: the registry stays complete so the unknown-tool hint
    /// and the read-only guard see every name.
    pub fn tool(&self, name: &str) -> Option<&ToolDef> {
        self.by_name
            .get(name)
            .and_then(|position| self.tools.get(*position))
    }

    pub fn is_read_tool(&self, name: &str) -> bool {
        self.read_tools.contains(name)
    }

    /// The tool that replaces a retired one, in the words the answer's note uses.
    pub fn retired_replacement(&self, name: &str) -> Option<&str> {
        self.retired.get(name).map(String::as_str)
    }

    /// The arguments of `name` whose non-blank rule the server enforces before the handler runs.
    pub fn top_level_non_blank_arguments(&self, name: &str) -> &[String] {
        self.non_blank.get(name).map_or(&[], Vec::as_slice)
    }

    /// The names an unknown-tool error lists: every registered tool that is not retired, sorted.
    pub fn allowed_tool_names(&self) -> Vec<&str> {
        let mut names: Vec<&str> = self
            .tools
            .iter()
            .filter(|tool| !self.retired.contains_key(&tool.name))
            .map(|tool| tool.name.as_str())
            .collect();
        utf16::sort(&mut names);
        names
    }

    /// The tools `tools/list` shows under `modes`: not retired, read tools only in read-only mode,
    /// and only the construction set under that profile.
    pub fn tools_for_list(&self, modes: &Modes) -> Vec<&ToolDef> {
        self.tools
            .iter()
            .filter(|tool| {
                !self.retired.contains_key(&tool.name)
                    && (!modes.read_only || self.read_tools.contains(&tool.name))
                    && (modes.profile == ToolProfile::Full
                        || self.construction.contains(&tool.name))
            })
            .collect()
    }

    /// The `tools/list` result: each listed tool exactly as the registry advertises it.
    pub fn tools_list(&self, modes: &Modes) -> ToolsList<'_> {
        ToolsList {
            tools: self
                .tools_for_list(modes)
                .into_iter()
                .map(|tool| tool.advertised)
                .collect(),
        }
    }

    /// The `initialize` instructions: the template with the live tool inventory in its place.
    pub fn instructions(&self, modes: &Modes) -> String {
        let listed = self.tools_for_list(modes);
        let section = inventory_section(&listed);
        INSTRUCTIONS_TEMPLATE.replacen(&self.placeholder, &section, 1)
    }
}

fn names_line(tools: &[&ToolDef]) -> String {
    if tools.is_empty() {
        return "none".to_string();
    }
    tools
        .iter()
        .map(|tool| format!("`{}`", tool.name))
        .collect::<Vec<_>>()
        .join(" · ")
}

/// How many tools, and their names by read and write.
fn inventory_section(listed: &[&ToolDef]) -> String {
    let (read, write): (Vec<&ToolDef>, Vec<&ToolDef>) =
        listed.iter().copied().partition(|tool| tool.read_only);
    format!(
        "## Tool inventory ({} tools = read {} + write {})\n\n**read** — {}.\n**write** — {}.",
        listed.len(),
        read.len(),
        write.len(),
        names_line(&read),
        names_line(&write)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use answer_format::json::to_string;

    fn surface() -> &'static Surface {
        Surface::embedded()
    }

    #[test]
    fn the_full_surface_lists_thirty_three_tools_and_hides_the_retired_seven() {
        let listed = surface().tools_for_list(&Modes::FULL);
        assert_eq!(listed.len(), 33);
        let read = listed.iter().filter(|tool| tool.read_only).count();
        assert_eq!((read, listed.len() - read), (19, 14));
        for retired in [
            "get_concept",
            "add_concept",
            "add_relation",
            "find_path",
            "find_neighbors",
            "list_kinds",
            "index_project",
        ] {
            assert!(
                surface().tool(retired).is_some(),
                "{retired} is still registered"
            );
            assert!(
                listed.iter().all(|tool| tool.name != retired),
                "{retired} is not listed"
            );
            assert!(surface().retired_replacement(retired).is_some());
        }
    }

    #[test]
    fn read_only_mode_shows_read_tools_only_and_the_construction_profile_sixteen() {
        let read_only = Modes {
            read_only: true,
            ..Modes::FULL
        };
        assert!(surface()
            .tools_for_list(&read_only)
            .iter()
            .all(|tool| tool.read_only));
        let construction = Modes {
            profile: ToolProfile::Construction,
            ..Modes::FULL
        };
        assert_eq!(surface().tools_for_list(&construction).len(), 16);
    }

    #[test]
    fn the_inventory_section_counts_what_is_listed() {
        let instructions = surface().instructions(&Modes::FULL);
        assert!(instructions.contains("## Tool inventory (33 tools = read 19 + write 14)"));
        assert!(!instructions.contains("__ONTOLOGY_ATLAS_ACTIVE_TOOL_INVENTORY__"));
        let read_only = surface().instructions(&Modes {
            read_only: true,
            ..Modes::FULL
        });
        assert!(
            read_only.contains("= read 19 + write 0)") && read_only.contains("**write** — none.")
        );
    }

    #[test]
    fn the_listed_answer_is_the_advertised_tools_joined_in_order() {
        let json = to_string(&surface().tools_list(&Modes::FULL)).expect("writes");
        assert!(json.starts_with("{\"tools\":[{\"name\":\"connection_info\""));
        assert!(json.ends_with("}]}"));
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");
        assert_eq!(parsed["tools"].as_array().map(Vec::len), Some(33));
        let advertised: Vec<&str> = TOOLS_JSON
            .lines()
            .filter(|line| line.starts_with('{'))
            .collect();
        assert_eq!(advertised.len(), 33 + 7);
        assert!(json.contains(
            advertised
                .first()
                .copied()
                .unwrap_or_default()
                .trim_end_matches(',')
        ));
    }

    #[test]
    fn an_unknown_tool_lists_every_registered_name_that_is_not_retired_in_utf16_order() {
        let names = surface().allowed_tool_names();
        assert_eq!(names.len(), 33);
        assert!(names.windows(2).all(|pair| pair.first() < pair.get(1)));
    }

    #[test]
    fn a_tool_knows_its_arguments_in_schema_order() {
        let tool = surface().tool("list_concepts").expect("registered");
        assert_eq!(
            tool.argument_names,
            ["kind", "domain", "since", "offset", "summary", "limit"]
        );
        assert!(surface()
            .tool("git_status")
            .expect("registered")
            .argument_names
            .is_empty());
    }
}
