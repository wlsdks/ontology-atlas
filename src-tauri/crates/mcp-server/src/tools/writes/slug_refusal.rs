//! A slug a write cannot use, in the sentence an agent has always been given. The vault's own
//! refusal says what happened; the sentence that tells an agent what to write instead is here.

use answer_format::json::to_string;
use confined_files::{SlugError, UnwritableReason};

use crate::error::ToolError;
use crate::tools::get_concepts::raw_source_issue;

fn reason_sentence(slug: &str, reason: &UnwritableReason) -> String {
    match reason {
        UnwritableReason::InvisibleCharacter { code_point } => format!(
            "slug {} contains U+{code_point:04X}, a control or invisible formatting character, and a write tool never names one: it can break a line or disguise which file is meant. Type the slug in visible characters only.",
            to_string(&slug).unwrap_or_default()
        ),
        UnwritableReason::ShortFileName { segment } => format!(
            "slug \"{slug}\" has the segment \"{segment}\", which ends like a Windows short file name (\"~1\"), and a write tool never names one: on Windows it can open a different file. Drop the \"~<number>\" ending."
        ),
        UnwritableReason::HiddenSegment { segment } => format!(
            "slug \"{slug}\" has the path segment \"{segment}\", and a write tool never names a segment that starts with \".\": hidden folders such as .claude, .agents, .codex, .github and .git hold agent and tool configuration, and the vault never reads them as nodes. Use a slug without a leading-dot segment, such as \"capabilities/<name>\"."
        ),
        UnwritableReason::ColonInSegment { segment } => format!(
            "slug \"{slug}\" has the segment \"{segment}\" with a colon, which on Windows names a data stream or a drive: a write tool never names one. Drop the colon."
        ),
        UnwritableReason::AgentInstructionFile { file_name } => format!(
            "slug \"{slug}\" names {file_name}.md, a file coding agents load as their instructions (AGENTS.md, AGENTS.override.md, CLAUDE.md, CLAUDE.local.md or GEMINI.md, in any letter case, because macOS and Windows open those as one file). A write tool never creates, edits or deletes one; a person edits it by hand. Name the node for what it means instead, such as \"domains/agent-runtime\"."
        ),
        UnwritableReason::VaultReadme => format!(
            "slug \"{slug}\" is the vault README (kind vault-readme), which a write tool never authors. Write the overview as a document node instead, such as \"overview\"."
        ),
    }
}

pub fn slug_refusal(error: &SlugError) -> ToolError {
    match error {
        SlugError::RawSource { raw_source } => ToolError::invalid(raw_source_issue(raw_source)),
        SlugError::Unwritable { slug, reason } => ToolError::failed(reason_sentence(slug, reason)),
        SlugError::UnwritableThroughLink {
            slug,
            resolved,
            reason,
        } => ToolError::failed(format!(
            "slug \"{slug}\" resolves through a link to \"{resolved}\". {}",
            reason_sentence(resolved, reason)
        )),
        SlugError::OutsideRootThroughLink { .. } => ToolError::failed(error.to_string()),
        other => ToolError::invalid(other.to_string()),
    }
}
