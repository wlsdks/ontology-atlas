//! Why a write that needs a person's yes did not get one. Every refusal writes nothing and says so;
//! the agent is told it was not approved and why, so it reports back instead of retrying.

use std::time::Duration;

use thiserror::Error;

use super::person_answer::Action;
use crate::error::ToolError;

/// Why the question could not be put to a person or came back without a yes.
#[derive(Debug, Error)]
pub enum ConsentRefusal {
    #[error(
        "This vault requires a human decision before any write, and this client did not offer \
a way to ask (no \"elicitation\" capability was declared at initialize). No change was made. \
Use a client that can surface permission requests, or unset OATLAS_WRITE_CONSENT for a vault \
where the client owns the gate."
    )]
    NoWayToAsk,
    #[error("Asking for permission failed ({0}). No change was made.")]
    QuestionFailed(QuestionProblem),
    #[error("The change was not approved ({action}). No change was made: {summary}.")]
    NotApproved { action: Action, summary: String },
}

/// What went wrong between the question and a person's answer.
#[derive(Debug, Error)]
pub enum QuestionProblem {
    /// The client answered the request with an error of its own.
    #[error("{0}")]
    ClientRefused(String),
    #[error(
        "the answer was not an elicitation result: its action must be accept, decline or cancel"
    )]
    UnreadableAnswer,
    #[error("no answer came within {} seconds", .0.as_secs())]
    NoAnswerInTime(Duration),
    #[error("the call was cancelled while the question was open")]
    CallCancelled,
    #[error("the connection closed while the question was open")]
    ConnectionClosed,
    #[error("the client no longer reads the server's output")]
    ClientUnreachable,
    #[error("{0} questions are already waiting for a person")]
    TooManyOpen(usize),
}

impl From<ConsentRefusal> for ToolError {
    fn from(refusal: ConsentRefusal) -> Self {
        ToolError::failed(refusal.to_string())
    }
}
