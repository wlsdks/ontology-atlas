//! The consent question: with `OATLAS_WRITE_CONSENT` on, a write asks a person before it touches the
//! disk, through the client (MCP elicitation, `elicitation/create`).
//!
//! An agent's own permission gate need not cover this server: a read-only agent session once changed
//! a vault through it with no card. So the server that performs the write asks, whichever client
//! called, and it fails closed: with no way to ask, or no yes, nothing is written.
//!
//! The question is a message and nothing else: `codex-acp` forwards a form with fields only to a
//! client that offers generic forms, and Atlas answers `session/request_permission` alone, so a
//! form with fields would be cancelled before a card appeared. Allow, decline or cancel is the
//! whole answer. The `_meta` hint carries no authority; it lets the app bind the card to the call.
//!
//! A preview changes nothing, so it asks nothing: pausing it would train people to click through the
//! card that matters. A call that says `confirm: false` is that preview, and [`ask_before_writing`]
//! returns for it without a question. A call that leaves `confirm` out asks, because a tool
//! decides for itself what no `confirm` means.

mod consent_refusal;
mod person_answer;
mod shown_text;
mod write_question;

use std::time::Duration;

use confined_files::AbsorbedPlace;
use serde::Serialize;

use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::protocol::{ClientAnswer, ClientReply, MAX_OPEN_REQUESTS};
use crate::write_tool::WriteTool;

pub use consent_refusal::{ConsentRefusal, QuestionProblem};
pub use person_answer::{Action, PersonAnswer};

/// How long a person has to answer. The JavaScript server's SDK gave a request 60 seconds, and
/// clients built on it give up at the same moment: a yes that arrives after the agent was told the
/// call failed is worse than a second question, so the wait ends when theirs does. A refusal at the
/// end costs a second card, never a write.
pub const ANSWER_WINDOW: Duration = Duration::from_secs(60);

#[derive(Serialize)]
struct Meta {
    codex_approval_kind: &'static str,
}

#[derive(Serialize)]
struct NoFields {}

#[derive(Serialize)]
struct MessageOnly {
    #[serde(rename = "type")]
    kind: &'static str,
    properties: NoFields,
}

/// The `params` of `elicitation/create`, in the order the SDK writes them.
#[derive(Serialize)]
struct Question<'a> {
    mode: &'static str,
    #[serde(rename = "_meta")]
    meta: Meta,
    message: &'a str,
    #[serde(rename = "requestedSchema")]
    requested_schema: MessageOnly,
}

/// What a person said yes to, beyond the words of the card: the file an `absorb_document` card
/// named. The handler must write that file, not whatever the typed path leads to by then.
#[derive(Debug, Clone, Default)]
pub struct Approval {
    /// The place the card showed, when the card found one: `None` is a card that showed the typed
    /// path because it could not resolve it, which approves no file at all.
    pub absorbed_place: Option<AbsorbedPlace>,
}

/// Asks a person, if this vault asks, whether `tool` may do what `arguments` say. `Ok(Some)` is a
/// person's yes, `Ok(None)` a vault or a call that does not ask; every other end is a refusal that
/// wrote nothing.
pub fn ask_before_writing(
    context: &CallContext<'_>,
    tool: WriteTool,
    arguments: &Arguments,
) -> Result<Option<Approval>, ToolError> {
    ask_within(context, tool, arguments, ANSWER_WINDOW)
}

fn ask_within(
    context: &CallContext<'_>,
    tool: WriteTool,
    arguments: &Arguments,
    window: Duration,
) -> Result<Option<Approval>, ToolError> {
    if !context.config().modes.write_consent {
        return Ok(None);
    }
    if arguments.asks_for_preview() {
        return Ok(None);
    }
    if !context.can_ask_client() {
        return Err(ConsentRefusal::NoWayToAsk.into());
    }
    // The card names the folder a connect would bind, not "inferred from this vault's location".
    let named;
    let shown_arguments = if tool == WriteTool::ConnectProjectSource {
        match crate::tools::connect_consent_root(context, arguments) {
            Some(root) => {
                named = arguments.with_text("rootPath", &root);
                &named
            }
            None => arguments,
        }
    } else {
        arguments
    };
    let absorbed_place = (tool == WriteTool::AbsorbDocument)
        .then(|| arguments.string("filePath"))
        .flatten()
        .and_then(|requested| AbsorbedPlace::locate(&requested, context.config().absorb_repository()).ok());
    let summary = write_question::summary(tool, shown_arguments, absorbed_place.as_ref());
    let message = format!("{summary}. Apply this change to the vault?");
    let question = Question {
        mode: "form",
        meta: Meta {
            codex_approval_kind: "mcp_tool_call",
        },
        message: &message,
        requested_schema: MessageOnly {
            kind: "object",
            properties: NoFields {},
        },
    };
    let failed = |problem| ConsentRefusal::QuestionFailed(problem).into();
    match context.ask_client("elicitation/create", &question, window) {
        ClientAnswer::Replied(ClientReply::Result(result)) => match PersonAnswer::read(&result) {
            Some(answer) if answer.approves() => Ok(Some(Approval { absorbed_place })),
            Some(answer) => Err(ConsentRefusal::NotApproved {
                action: answer.action,
                summary,
            }
            .into()),
            None => Err(failed(QuestionProblem::UnreadableAnswer)),
        },
        ClientAnswer::Replied(ClientReply::Failure { message }) => {
            Err(failed(QuestionProblem::ClientRefused(message)))
        }
        ClientAnswer::TimedOut => Err(failed(QuestionProblem::NoAnswerInTime(window))),
        ClientAnswer::CallCancelled => Err(failed(QuestionProblem::CallCancelled)),
        ClientAnswer::SessionEnded => Err(failed(QuestionProblem::ConnectionClosed)),
        ClientAnswer::ClientUnreachable => Err(failed(QuestionProblem::ClientUnreachable)),
        ClientAnswer::TooManyOpen => Err(failed(QuestionProblem::TooManyOpen(MAX_OPEN_REQUESTS))),
    }
}
