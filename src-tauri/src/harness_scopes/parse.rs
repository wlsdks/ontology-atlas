//! Allow-listed shapes of a settings file. A field these structs do not name is skipped by serde
//! without being kept, so `env`, `apiKeyHelper`, an `http` hook's address and headers, a prompt and
//! permission-rule text cannot reach a returned value.

use serde::de::{Deserializer, IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Serialize};
use std::fmt;

/// A value of the wrong type is read as absent instead of failing the whole file.
#[derive(Deserialize)]
#[serde(untagged)]
enum Lenient<T> {
    Known(T),
    Other(IgnoredAny),
}

impl<T> Lenient<T> {
    fn known(self) -> Option<T> {
        match self {
            Self::Known(value) => Some(value),
            Self::Other(_) => None,
        }
    }
}

fn known<T>(value: Option<Lenient<T>>) -> Option<T> {
    value.and_then(Lenient::known)
}

/// An array whose length is kept and whose items are skipped.
struct Counted(usize);

impl<'de> Deserialize<'de> for Counted {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct CountVisitor;
        impl<'de> Visitor<'de> for CountVisitor {
            type Value = Counted;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("an array")
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Counted, A::Error> {
                let mut count = 0;
                while seq.next_element::<IgnoredAny>()?.is_some() {
                    count += 1;
                }
                Ok(Counted(count))
            }
        }
        deserializer.deserialize_seq(CountVisitor)
    }
}

/// Event names in file order, so positions match what the person sees in the file.
struct HookEvents(Vec<(String, Option<Vec<Option<HookGroup>>>)>);

impl<'de> Deserialize<'de> for HookEvents {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct EventsVisitor;
        impl<'de> Visitor<'de> for EventsVisitor {
            type Value = HookEvents;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("an object of hook events")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<HookEvents, A::Error> {
                let mut events = Vec::new();
                while let Some(event) = map.next_key::<String>()? {
                    let groups = map
                        .next_value::<Lenient<Vec<Lenient<HookGroup>>>>()?
                        .known()
                        .map(|groups| groups.into_iter().map(Lenient::known).collect());
                    events.push((event, groups));
                }
                Ok(HookEvents(events))
            }
        }
        deserializer.deserialize_map(EventsVisitor)
    }
}

#[derive(Deserialize)]
struct HookGroup {
    matcher: Option<Lenient<String>>,
    hooks: Option<Lenient<Vec<Lenient<HookHandler>>>>,
}

#[derive(Deserialize)]
struct HookHandler {
    #[serde(rename = "type")]
    kind: Option<Lenient<String>>,
    command: Option<Lenient<String>>,
    timeout: Option<Lenient<f64>>,
    #[serde(rename = "async")]
    run_async: Option<Lenient<bool>>,
}

#[derive(Deserialize)]
struct PermissionLists {
    allow: Option<Lenient<Counted>>,
    deny: Option<Lenient<Counted>>,
    ask: Option<Lenient<Counted>>,
}

#[derive(Deserialize)]
struct ClaudeSettingsDocument {
    hooks: Option<Lenient<HookEvents>>,
    #[serde(rename = "disableAllHooks")]
    disable_all_hooks: Option<Lenient<bool>>,
    #[serde(rename = "allowManagedHooksOnly")]
    allow_managed_hooks_only: Option<Lenient<bool>>,
    permissions: Option<Lenient<PermissionLists>>,
}

#[derive(Deserialize)]
struct CodexHooksDocument {
    hooks: Option<Lenient<HookEvents>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub(crate) enum HookKind {
    #[serde(rename = "command")]
    Command,
    #[serde(rename = "http")]
    Http,
    #[serde(rename = "mcp_tool")]
    McpTool,
    #[serde(rename = "prompt")]
    Prompt,
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "other")]
    Other,
}

impl HookKind {
    fn from_type(kind: Option<&str>) -> Self {
        match kind {
            Some("command") => Self::Command,
            Some("http") => Self::Http,
            Some("mcp_tool") => Self::McpTool,
            Some("prompt") => Self::Prompt,
            Some("agent") => Self::Agent,
            _ => Self::Other,
        }
    }
}

/// One handler. `command`, `timeout_seconds` and `run_async` are filled for a `command` hook only.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScopeHook {
    pub event: String,
    /// Position of the group within the event's array.
    pub group: usize,
    /// Position of the handler within the group's `hooks` array.
    pub handler: usize,
    pub matcher: Option<String>,
    pub kind: HookKind,
    pub command: Option<String>,
    pub timeout_seconds: Option<f64>,
    #[serde(rename = "async")]
    pub run_async: Option<bool>,
}

#[derive(Debug, Default, PartialEq, Serialize)]
pub(crate) struct PermissionCounts {
    pub allow: usize,
    pub deny: usize,
    pub ask: usize,
}

#[derive(Debug, Default, PartialEq)]
pub(super) struct ParsedSettings {
    pub hooks: Vec<ScopeHook>,
    /// Handlers past `HOOKS_PER_FILE_MAX`, counted and not returned.
    pub hooks_truncated: usize,
    pub disable_all_hooks: Option<bool>,
    pub allow_managed_hooks_only: Option<bool>,
    pub permission_counts: Option<PermissionCounts>,
}

/// `None` when the text is not a JSON object of this shape. The parser's error is dropped
/// because it can quote a value.
pub(super) fn parse_claude_settings(bytes: &[u8]) -> Option<ParsedSettings> {
    let document: ClaudeSettingsDocument = serde_json::from_slice(json_object(bytes)?).ok()?;
    let (hooks, hooks_truncated) = flatten_hooks(known(document.hooks));
    Some(ParsedSettings {
        hooks,
        hooks_truncated,
        disable_all_hooks: known(document.disable_all_hooks),
        allow_managed_hooks_only: known(document.allow_managed_hooks_only),
        permission_counts: known(document.permissions).map(|lists| PermissionCounts {
            allow: known(lists.allow).map_or(0, |list| list.0),
            deny: known(lists.deny).map_or(0, |list| list.0),
            ask: known(lists.ask).map_or(0, |list| list.0),
        }),
    })
}

pub(super) fn parse_codex_hooks(bytes: &[u8]) -> Option<ParsedSettings> {
    let document: CodexHooksDocument = serde_json::from_slice(json_object(bytes)?).ok()?;
    let (hooks, hooks_truncated) = flatten_hooks(known(document.hooks));
    Some(ParsedSettings {
        hooks,
        hooks_truncated,
        ..ParsedSettings::default()
    })
}

/// Serde reads a struct from an array too, so anything but an object is refused first.
fn json_object(bytes: &[u8]) -> Option<&[u8]> {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    let first = bytes.iter().find(|byte| !byte.is_ascii_whitespace())?;
    (*first == b'{').then_some(bytes)
}

/// A 1 MiB file of empty handlers holds hundreds of thousands; a real one holds dozens.
pub(crate) const HOOKS_PER_FILE_MAX: usize = 500;

/// The first `HOOKS_PER_FILE_MAX` handlers in file order, and how many more there are.
fn flatten_hooks(events: Option<HookEvents>) -> (Vec<ScopeHook>, usize) {
    let mut out = Vec::new();
    let mut truncated = 0;
    for (event, groups) in events.map(|events| events.0).unwrap_or_default() {
        if !is_event_name(&event) {
            continue;
        }
        for (group_index, group) in groups.unwrap_or_default().into_iter().enumerate() {
            let Some(group) = group else { continue };
            let matcher = known(group.matcher);
            let handlers = known(group.hooks).unwrap_or_default();
            for (handler_index, handler) in handlers.into_iter().enumerate() {
                let Some(handler) = handler.known() else {
                    continue;
                };
                if out.len() == HOOKS_PER_FILE_MAX {
                    truncated += 1;
                    continue;
                }
                let kind = HookKind::from_type(known(handler.kind).as_deref());
                let is_command = kind == HookKind::Command;
                out.push(ScopeHook {
                    event: event.clone(),
                    group: group_index,
                    handler: handler_index,
                    matcher: matcher.clone(),
                    kind,
                    command: known(handler.command).filter(|_| is_command),
                    timeout_seconds: known(handler.timeout).filter(|_| is_command),
                    run_async: known(handler.run_async).filter(|_| is_command),
                });
            }
        }
    }
    (out, truncated)
}

const EVENT_NAME_MAX_CHARS: usize = 64;

/// Event names from `[hooks.<Event>]` and `[[hooks.<Event>...]]` headers. Only a plain
/// identifier is kept, so a quoted `[hooks.state."<path>:..."]` key never is.
pub(super) fn inline_hook_events(text: &str) -> Vec<String> {
    let mut events: Vec<String> = Vec::new();
    for line in text.lines() {
        let Some(event) = inline_hook_event(line) else {
            continue;
        };
        if !events.contains(&event) {
            events.push(event);
        }
    }
    events
}

fn inline_hook_event(line: &str) -> Option<String> {
    let header = line.trim_start().strip_prefix('[')?;
    let header = header.strip_prefix('[').unwrap_or(header).trim_start();
    let rest = ["hooks", "\"hooks\"", "'hooks'"]
        .iter()
        .find_map(|name| header.strip_prefix(name))?;
    let rest = rest.trim_start().strip_prefix('.')?.trim_start();
    let quote = rest.chars().next().filter(|c| *c == '"' || *c == '\'');
    let name = match quote {
        Some(quote) => {
            let inner = &rest[1..];
            &inner[..inner.find(quote)?]
        }
        None => {
            let end = rest
                .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-'))
                .unwrap_or(rest.len());
            &rest[..end]
        }
    };
    (is_event_name(name) && name != "state").then(|| name.to_string())
}

/// Vendors name events in plain identifiers; any other key is never returned.
fn is_event_name(name: &str) -> bool {
    name.len() <= EVENT_NAME_MAX_CHARS
        && name.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}
