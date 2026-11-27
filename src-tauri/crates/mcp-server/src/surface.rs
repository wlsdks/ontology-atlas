//! The tool surface the server advertises: every tool's name, description, input and output
//! schema and annotations, the `initialize` instructions, and which tools each mode shows.
//!
//! During the port the JavaScript registry (`mcp/src/server/registry.mjs`) is the one authored
//! source. `scripts/mcp/surface/generate-surface.mjs` writes a copy into `surface/`, which this
//! module embeds; `pnpm mcp:surface:check` is red when the registry changed and the copy did not.

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use crate::json::{parse, to_json, Value};
use crate::runtime::{Modes, ToolProfile};

const TOOLS_JSON: &str = include_str!("../surface/tools.json");
const REGISTRY_JSON: &str = include_str!("../surface/registry.json");
const INSTRUCTIONS_TEMPLATE: &str = include_str!("../surface/instructions.txt");

/// One advertised tool, as `tools/list` shows it.
#[derive(Debug)]
pub struct ToolDef {
    pub name: String,
    /// The tool as `JSON.stringify` writes it into the `tools/list` answer.
    pub advertised_json: String,
    /// The names of the arguments the tool accepts, in schema order.
    pub argument_names: Vec<String>,
    /// The `readOnlyHint` annotation: a read tool.
    pub read_only: bool,
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

fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

impl Surface {
    fn load() -> Result<Self, String> {
        let tools_value =
            parse(TOOLS_JSON).map_err(|_| "surface/tools.json is not JSON".to_string())?;
        let registry =
            parse(REGISTRY_JSON).map_err(|_| "surface/registry.json is not JSON".to_string())?;
        let mut tools = Vec::new();
        let mut by_name = HashMap::new();
        for tool in tools_value.as_array().unwrap_or_default() {
            let name = tool
                .get("name")
                .and_then(Value::as_str)
                .ok_or("a tool has no name")?
                .to_string();
            let argument_names = tool
                .get("inputSchema")
                .and_then(|schema| schema.get("properties"))
                .and_then(Value::as_object)
                .map(|properties| properties.keys().map(str::to_string).collect())
                .unwrap_or_default();
            let read_only = tool
                .get("annotations")
                .and_then(|annotations| annotations.get("readOnlyHint"))
                .and_then(Value::as_bool)
                .unwrap_or(false);
            by_name.insert(name.clone(), tools.len());
            tools.push(ToolDef {
                name,
                advertised_json: to_json(tool),
                argument_names,
                read_only,
            });
        }
        let retired = registry
            .get("retiredTools")
            .and_then(Value::as_array)
            .unwrap_or_default()
            .iter()
            .filter_map(|entry| {
                Some((
                    entry.get("name")?.as_str()?.to_string(),
                    entry.get("replacement")?.as_str()?.to_string(),
                ))
            })
            .collect();
        let non_blank = registry
            .get("topLevelNonBlankArguments")
            .and_then(Value::as_object)
            .map(|object| {
                object
                    .iter()
                    .map(|(name, list)| (name.to_string(), strings(Some(list))))
                    .collect()
            })
            .unwrap_or_default();
        Ok(Self {
            tools,
            by_name,
            read_tools: strings(registry.get("readTools")).into_iter().collect(),
            retired,
            construction: strings(registry.get("constructionTools"))
                .into_iter()
                .collect(),
            non_blank,
            server_name: registry
                .get("serverName")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            server_version: registry
                .get("serverVersion")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            placeholder: registry
                .get("toolInventoryPlaceholder")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        })
    }

    /// The embedded surface, parsed on first use. A broken copy is a build defect the surface test
    /// finds; the server then answers with an empty surface rather than stopping.
    pub fn embedded() -> &'static Surface {
        static SURFACE: OnceLock<Surface> = OnceLock::new();
        SURFACE.get_or_init(|| {
            Surface::load().unwrap_or_else(|reason| {
                let _ = std::io::Write::write_all(
                    &mut std::io::stderr(),
                    format!(
                        "[ontology-atlas-mcp] the embedded tool surface is unreadable: {reason}\n"
                    )
                    .as_bytes(),
                );
                Surface {
                    tools: Vec::new(),
                    by_name: HashMap::new(),
                    read_tools: HashSet::new(),
                    retired: HashMap::new(),
                    construction: HashSet::new(),
                    non_blank: HashMap::new(),
                    server_name: "ontology-atlas-mcp".to_string(),
                    server_version: String::new(),
                    placeholder: String::new(),
                }
            })
        })
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
        names.sort_by(|left, right| crate::js_text::compare_utf16(left, right));
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

    /// The `tools/list` result: `{"tools":[...]}` with each tool exactly as the registry advertises.
    pub fn tools_list_result_json(&self, modes: &Modes) -> String {
        let listed = self.tools_for_list(modes);
        let mut out = String::with_capacity(
            listed
                .iter()
                .map(|tool| tool.advertised_json.len() + 1)
                .sum::<usize>()
                + 12,
        );
        out.push_str("{\"tools\":[");
        for (position, tool) in listed.iter().enumerate() {
            if position > 0 {
                out.push(',');
            }
            out.push_str(&tool.advertised_json);
        }
        out.push_str("]}");
        out
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

/// `buildToolInventorySection`: how many tools, and their names by read and write.
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
        let json = surface().tools_list_result_json(&Modes::FULL);
        assert!(json.starts_with("{\"tools\":[{\"name\":\"connection_info\""));
        assert!(json.ends_with("}]}"));
        let parsed = parse(&json).expect("valid JSON");
        assert_eq!(
            parsed
                .get("tools")
                .and_then(Value::as_array)
                .map(<[Value]>::len),
            Some(33)
        );
    }

    #[test]
    fn an_unknown_tool_lists_every_registered_name_that_is_not_retired_in_utf16_order() {
        let names = surface().allowed_tool_names();
        assert_eq!(names.len(), 33);
        assert!(names.windows(2).all(|pair| pair.first() < pair.get(1)));
    }
}
