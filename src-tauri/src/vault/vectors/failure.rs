//! Which failure, and which detail, the person sees for an embedding error: decided by where the
//! error happened.

use super::types::VectorFailure;
use crate::llm::embed::EmbedError;

/// Where an embedding error happened decides which failure the person sees.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum During {
    /// Downloading the built-in model, and the space check before it.
    ModelPrepare,
    /// A worker converting the download or checking the converted model; the download is kept.
    ModelConvert,
    /// Preparing passages or answering a question, through the built-in model or a runner.
    Embedding { runner: bool },
}

pub(super) fn failure_of(error: &EmbedError, during: During) -> VectorFailure {
    use EmbedError as E;
    if let E::AuditBlocked(_) = error {
        return VectorFailure::AuditBlocked;
    }
    match during {
        During::ModelPrepare => match error {
            E::NoDirectConnection => VectorFailure::NeedsDirect,
            E::DiskSpace { .. } => VectorFailure::DiskShort,
            // The two ways a download fails to match the published file; each deletes it.
            E::HashMismatch(_) | E::SizeMismatch(_) => VectorFailure::ModelCheck,
            E::Store(_) => VectorFailure::Write,
            _ => VectorFailure::Download,
        },
        During::ModelConvert => match error {
            E::DiskSpace { .. } => VectorFailure::DiskShort,
            E::Store(_) => VectorFailure::Write,
            _ => VectorFailure::ModelFailed,
        },
        During::Embedding { runner } => match error {
            E::ModelNotReady => VectorFailure::ModelGone,
            E::ModelMissing => VectorFailure::ModelMissing,
            E::Request(_)
            | E::TimedOut
            | E::Http(_)
            | E::Redirected(_)
            | E::NotLocal
            | E::ResolvesElsewhere
            | E::Endpoint(_)
                if runner =>
            {
                VectorFailure::RunnerDown
            }
            _ => VectorFailure::ModelFailed,
        },
    }
}

/// Where the model was when it failed: converting the download, checking the converted model, or
/// answering (preparing passages or a question).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ModelStep {
    Convert,
    Check,
    Answer,
}

/// The one detail a `modelFailed` failure carries: a closed list the screens hold the same way
/// (`MODEL_FAILED_DETAILS`), so no other string reaches them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ModelFailedDetail {
    Load,
    Convert,
    Check,
    WorkerExited,
    TimedOut,
    Internal,
}

impl ModelFailedDetail {
    #[cfg(test)]
    pub(super) const ALL: [Self; 6] = [
        Self::Load,
        Self::Convert,
        Self::Check,
        Self::WorkerExited,
        Self::TimedOut,
        Self::Internal,
    ];

    /// The only place a detail becomes the string the screens read.
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Load => "load",
            Self::Convert => "convert",
            Self::Check => "check",
            Self::WorkerExited => "worker-exited",
            Self::TimedOut => "timed-out",
            Self::Internal => "internal",
        }
    }

    pub(super) fn of(error: &EmbedError, step: ModelStep) -> Self {
        use EmbedError as E;
        match (error, step) {
            (E::WorkerExited, _) => Self::WorkerExited,
            (E::TimedOut, _) => Self::TimedOut,
            (E::ModelLoad(detail), ModelStep::Check) if detail.starts_with("reference") => {
                Self::Check
            }
            (E::ModelLoad(_) | E::WorkerStart(_) | E::ModelNotReady, _) => Self::Load,
            (_, ModelStep::Convert) => Self::Convert,
            (_, ModelStep::Check | ModelStep::Answer) => Self::Check,
        }
    }
}

/// A failure and its detail as the screens read them: a `modelFailed` detail from the closed list,
/// any other failure's detail the error's code.
pub(super) fn failure_detail(
    error: &EmbedError,
    during: During,
    step: ModelStep,
) -> (VectorFailure, String) {
    let failure = failure_of(error, during);
    let detail = if failure == VectorFailure::ModelFailed {
        ModelFailedDetail::of(error, step).as_str()
    } else {
        error.code()
    };
    (failure, detail.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_failure_reaches_the_screen_as_its_code() {
        use EmbedError as E;
        let prepare = During::ModelPrepare;
        let convert = During::ModelConvert;
        let builtin = During::Embedding { runner: false };
        let runner = During::Embedding { runner: true };
        let cases = [
            (E::NoDirectConnection, prepare, VectorFailure::NeedsDirect),
            // Offline: a failed lookup or connect with no proxy named.
            (
                E::Request("connect-failed".into()),
                prepare,
                VectorFailure::Download,
            ),
            (
                E::DiskSpace { needed: 2, free: 1 },
                prepare,
                VectorFailure::DiskShort,
            ),
            (
                E::HashMismatch("x".into()),
                prepare,
                VectorFailure::ModelCheck,
            ),
            (
                E::SizeMismatch("x".into()),
                prepare,
                VectorFailure::ModelCheck,
            ),
            (E::Store("full".into()), prepare, VectorFailure::Write),
            (E::Request("reset".into()), prepare, VectorFailure::Download),
            (E::HostRefused("x".into()), prepare, VectorFailure::Download),
            (
                E::ModelLoad("reference 0".into()),
                convert,
                VectorFailure::ModelFailed,
            ),
            (
                E::ModelLoad("weights".into()),
                convert,
                VectorFailure::ModelFailed,
            ),
            (E::WorkerExited, convert, VectorFailure::ModelFailed),
            (E::TimedOut, convert, VectorFailure::ModelFailed),
            (
                E::WorkerStart("spawn".into()),
                convert,
                VectorFailure::ModelFailed,
            ),
            (E::Store("full".into()), convert, VectorFailure::Write),
            (
                E::AuditBlocked("x".into()),
                prepare,
                VectorFailure::AuditBlocked,
            ),
            (
                E::AuditBlocked("x".into()),
                runner,
                VectorFailure::AuditBlocked,
            ),
            (E::ModelNotReady, builtin, VectorFailure::ModelGone),
            (E::WorkerExited, builtin, VectorFailure::ModelFailed),
            (E::TimedOut, builtin, VectorFailure::ModelFailed),
            (E::TimedOut, runner, VectorFailure::RunnerDown),
            (
                E::Request("refused".into()),
                runner,
                VectorFailure::RunnerDown,
            ),
            (E::NotLocal, runner, VectorFailure::RunnerDown),
            (E::ModelMissing, runner, VectorFailure::ModelMissing),
            (
                E::ResponseInvalid("count"),
                runner,
                VectorFailure::ModelFailed,
            ),
        ];
        for (error, during, expected) in cases {
            assert_eq!(failure_of(&error, during), expected, "{error}");
        }
    }
}
