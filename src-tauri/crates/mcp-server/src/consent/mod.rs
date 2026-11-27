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
//! A dry run changes nothing, so it asks nothing: pausing it would train people to click through the
//! card that matters.

mod consent_refusal;
mod person_answer;
mod shown_text;
mod write_question;

use std::time::Duration;

use serde::Serialize;

use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::protocol::{ClientAnswer, ClientReply, MAX_OPEN_REQUESTS};
use crate::write_tool::WriteTool;

pub use consent_refusal::{ConsentRefusal, QuestionProblem};
pub use person_answer::PersonAnswer;

/// How long a person has to answer. The JavaScript server's SDK gave 60 seconds, which is less than
/// it takes to read a diff in a card; a client with a shorter limit of its own cancels the call
/// sooner and the wait ends then. Waiting longer holds one thread and an agent that is waiting on a
/// person's decision anyway, and a refusal at the end costs a second card, never a write.
pub const ANSWER_WINDOW: Duration = Duration::from_secs(5 * 60);

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

/// Asks a person, if this vault asks, whether `tool` may do what `arguments` say. `Ok` is a yes or
/// a vault that does not ask; every other end is a refusal that wrote nothing.
pub fn ask_before_writing(
    context: &CallContext<'_>,
    tool: WriteTool,
    arguments: &Arguments,
) -> Result<(), ToolError> {
    ask_within(context, tool, arguments, ANSWER_WINDOW)
}

fn ask_within(
    context: &CallContext<'_>,
    tool: WriteTool,
    arguments: &Arguments,
    window: Duration,
) -> Result<(), ToolError> {
    if !context.config().modes.write_consent || arguments.is_dry_run() {
        return Ok(());
    }
    if !context.can_ask_client() {
        return Err(ConsentRefusal::NoWayToAsk.into());
    }
    let summary = write_question::summary(tool, arguments);
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
            Some(answer) if answer.approves() => Ok(()),
            Some(answer) => Err(ConsentRefusal::NotApproved {
                action: answer.action.word().to_string(),
                summary,
            }
            .into()),
            None => Err(failed(QuestionProblem::UnreadableAnswer)),
        },
        ClientAnswer::Replied(ClientReply::Failure { message, .. }) => {
            Err(failed(QuestionProblem::ClientRefused(message)))
        }
        ClientAnswer::TimedOut => Err(failed(QuestionProblem::NoAnswerInTime(window))),
        ClientAnswer::CallCancelled => Err(failed(QuestionProblem::CallCancelled)),
        ClientAnswer::SessionEnded => Err(failed(QuestionProblem::ConnectionClosed)),
        ClientAnswer::ClientUnreachable => Err(failed(QuestionProblem::ClientUnreachable)),
        ClientAnswer::TooManyOpen => Err(failed(QuestionProblem::TooManyOpen(MAX_OPEN_REQUESTS))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_question_is_one_message_with_no_fields_in_the_order_clients_already_read_it() {
        let question = serde_json::to_string(&Question {
            mode: "form",
            meta: Meta {
                codex_approval_kind: "mcp_tool_call",
            },
            message: "Edit concept a. Apply this change to the vault?",
            requested_schema: MessageOnly {
                kind: "object",
                properties: NoFields {},
            },
        })
        .expect("writes");
        assert_eq!(
            question,
            r#"{"mode":"form","_meta":{"codex_approval_kind":"mcp_tool_call"},"message":"Edit concept a. Apply this change to the vault?","requestedSchema":{"type":"object","properties":{}}}"#
        );
    }
}
