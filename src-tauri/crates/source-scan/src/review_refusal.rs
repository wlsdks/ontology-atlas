//! Why an import review or a focus page was refused, and which kind of failure it is: the tool
//! layer picks the `errorCode` an agent branches on from the kind, never from the words.

/// A refusal with the sentence an agent repairs its call from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewRefusal {
    kind: Kind,
    message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    /// An argument that is not what it must be.
    Invalid,
    /// A cursor that names nothing in the current evidence.
    NotFound,
    /// Any other refusal.
    Failed,
}

impl ReviewRefusal {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self {
            kind: Kind::Invalid,
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            kind: Kind::NotFound,
            message: message.into(),
        }
    }

    /// A combination of arguments no mode supports, which the JavaScript server reports as a
    /// plain failure.
    pub fn failed(message: impl Into<String>) -> Self {
        Self {
            kind: Kind::Failed,
            message: message.into(),
        }
    }

    pub fn is_invalid(&self) -> bool {
        self.kind == Kind::Invalid
    }

    pub fn is_not_found(&self) -> bool {
        self.kind == Kind::NotFound
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl std::fmt::Display for ReviewRefusal {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ReviewRefusal {}
