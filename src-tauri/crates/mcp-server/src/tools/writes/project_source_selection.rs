//! Which project and which folder a `connect_project_source` call means, decided the same way for
//! the call itself and for the consent card that asks before it: the card must name the folder the
//! call would bind, not "inferred from this vault's location".

use std::path::{Path, PathBuf};

use project_source::{infer_source_folder, read_source_bindings, BindingsRead};
use vault_document::{LoadedDocument, SlugLookup};

use super::plain_refusal::plain_refusal;
use crate::tools::project_source_scope::{project_scope, ProjectScope};
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::tools::argument_checks::optional_non_blank_text;

/// Whether the call binds a folder for the first time, replaces a binding or measures it again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindMode {
    Connect,
    Replace,
    Remeasure,
}

impl BindMode {
    pub fn word(self) -> &'static str {
        match self {
            Self::Connect => "connect",
            Self::Replace => "replace",
            Self::Remeasure => "remeasure",
        }
    }
}

pub struct SourceSelection<'a> {
    pub project_slug: String,
    pub scope: ProjectScope<'a>,
    pub bindings: BindingsRead,
    pub root: PathBuf,
    pub mode: BindMode,
    pub inferred_from: Option<&'static str>,
}

fn is_absolute_like_a_script_server(path: &str) -> bool {
    Path::new(path).is_absolute() || (cfg!(windows) && path.starts_with(['/', '\\']))
}

/// The slug `name` means, or why no slug does. The refusal of a name that is no node.
pub fn existing_slug(
    root: &confined_files::VaultRoot,
    documents: &[LoadedDocument],
    name: &str,
) -> Result<Option<String>, ToolError> {
    SlugLookup::new(documents)
        .resolve(root, name)
        .map_err(|ambiguous| plain_refusal(ambiguous.to_string()))
}

/// The folder a connect call would bind, for the consent card; `None` when the call names no
/// project or folder the card could name, which the call itself then reports.
pub fn connect_consent_root(context: &CallContext<'_>, arguments: &Arguments) -> Option<String> {
    let read = crate::tools::read_vault::read_vault(context).ok()?;
    let selection =
        select_source_folder(context, &read.root, read.vault.documents(), arguments).ok()?;
    Some(selection.root.to_string_lossy().into_owned())
}

pub fn missing_project(name: &str) -> ToolError {
    plain_refusal(format!(
        "Project slug does not exist in vault: \"{name}\". Use list_concepts({{kind:\"project\"}}) to choose an exact project slug."
    ))
}

/// Reads `projectSlug` and `rootPath`, finds the project and its whole scope, and chooses the
/// folder: the one named, else the one already bound, else the one around the vault.
pub fn select_source_folder<'a>(
    context: &CallContext<'_>,
    vault: &confined_files::VaultRoot,
    documents: &'a [LoadedDocument],
    arguments: &Arguments,
) -> Result<SourceSelection<'a>, ToolError> {
    let project_name = optional_non_blank_text(arguments, "projectSlug")?;
    let named_root = optional_non_blank_text(arguments, "rootPath")?;
    let Some(project_name) = project_name else {
        return Err(plain_refusal("projectSlug is required."));
    };
    if let Some(root) = named_root.as_deref() {
        if !is_absolute_like_a_script_server(root) {
            return Err(plain_refusal(format!(
                "rootPath must be an absolute local path; received \"{root}\"."
            )));
        }
    }
    let Some(project_slug) = existing_slug(vault, documents, &project_name)? else {
        return Err(missing_project(&project_name));
    };
    let is_project = documents
        .iter()
        .find(|document| document.slug() == project_slug)
        .is_some_and(|document| document.frontmatter().text("kind") == Some("project"));
    if !is_project {
        return Err(plain_refusal(format!(
            "connect_project_source requires a kind: project node; received \"{project_slug}\"."
        )));
    }
    let graph = context.compiled_graph().read(context).ok();
    let scope = project_scope(graph.as_deref(), documents, &project_slug);
    if scope.graph_hash.is_none() {
        return Err(plain_refusal(format!(
            "connect_project_source blocked: the project scope for \"{project_slug}\" is incomplete, so no receipt could detect later ontology drift. Repair the project containment first (query_ontology({{operation:\"project_scope\", project:\"{project_slug}\"}}))."
        )));
    }
    let bindings = read_source_bindings(&context.config().vault_root);
    let held = bindings.bound_to(&project_slug);
    let (root, mode, inferred_from) = match (named_root, held.as_slice()) {
        (Some(root), held) => (
            PathBuf::from(root),
            if held.is_empty() { BindMode::Connect } else { BindMode::Replace },
            None,
        ),
        (None, [only]) => (PathBuf::from(&only.root_path), BindMode::Remeasure, None),
        (None, held) => {
            let Some(found) = infer_source_folder(&context.config().vault_root) else {
                return Err(plain_refusal(
                    "connect_project_source found no enclosing code folder for this vault (no git repository and no project manifest above it). Pass rootPath with the absolute folder that holds the code this ontology describes.",
                ));
            };
            (
                found.root,
                if held.is_empty() { BindMode::Connect } else { BindMode::Replace },
                Some(found.marker.word()),
            )
        }
    };
    Ok(SourceSelection {
        project_slug,
        scope,
        bindings,
        root,
        mode,
        inferred_from,
    })
}
