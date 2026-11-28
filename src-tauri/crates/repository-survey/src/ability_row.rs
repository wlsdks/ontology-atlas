//! One ability the survey lists: something a user, an operator or a calling program can do with
//! the product, as the code shows it without reading meaning into names. The rows are a floor under
//! the abilities a builder names from the outlines and docs.

use crate::survey_text::repo_text;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AbilityKind {
    Executable,
    Command,
    Route,
    Plugin,
    Library,
    Family,
    Api,
    Export,
    Operation,
    Documented,
}

impl AbilityKind {
    pub fn word(self) -> &'static str {
        match self {
            Self::Executable => "executable",
            Self::Command => "command",
            Self::Route => "route",
            Self::Plugin => "plugin",
            Self::Library => "library",
            Self::Family => "family",
            Self::Api => "api",
            Self::Export => "export",
            Self::Operation => "operation",
            Self::Documented => "documented",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AbilityRow {
    pub kind: AbilityKind,
    pub name: String,
    pub path: String,
    pub symbol: Option<String>,
    pub line: usize,
    /// `path:Lline`, the place the ability was found.
    pub evidence: String,
    /// The names a family or module API holds.
    pub members: Option<Vec<String>>,
    pub members_omitted: usize,
    /// The heading and place of the page that documents it, `path:Lline`.
    pub doc: Option<String>,
}

impl AbilityRow {
    pub fn at(kind: AbilityKind, name: &str, path: &str, line: usize) -> Self {
        Self {
            kind,
            name: name.to_string(),
            path: path.to_string(),
            symbol: None,
            line,
            evidence: format!("{path}:L{line}"),
            members: None,
            members_omitted: 0,
            doc: None,
        }
    }

    #[must_use]
    pub fn with_symbol(mut self, symbol: &str) -> Self {
        self.symbol = Some(symbol.to_string());
        self
    }

    #[must_use]
    pub fn with_members(mut self, members: Vec<String>) -> Self {
        self.members = Some(members);
        self
    }

    #[must_use]
    pub fn with_doc(mut self, doc: String) -> Self {
        self.doc = Some(doc);
        self
    }
}

/// Members a family or group shows before the rest are counted.
pub const MEMBERS_SHOWN: usize = 16;
/// An evidence `path:Lline` is cut only past a root path, so its line number survives.
const EVIDENCE_CHARS: usize = 400;

/// The row as the survey writes it: kind, name, evidence and symbol; a family or group with its
/// first `members_shown` members and the rest counted. `with_folder: false` leaves out a family's
/// folder, which its evidence names.
pub fn ability_row_text(row: &AbilityRow, members_shown: usize, with_folder: bool) -> String {
    let listed_count = row.members.as_ref().map_or(0, Vec::len);
    let hidden = row.members_omitted + listed_count.saturating_sub(members_shown);
    let members = row.members.as_ref().map_or_else(String::new, |names| {
        let listed = names
            .iter()
            .take(members_shown)
            .map(|name| repo_text(name, 80))
            .collect::<Vec<_>>()
            .join(", ");
        let more = if hidden > 0 {
            format!("+{hidden}")
        } else {
            String::new()
        };
        let both: Vec<String> = [listed, more]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect();
        format!(": {}", both.join(" "))
    });
    let symbol = row
        .symbol
        .as_ref()
        .filter(|symbol| **symbol != row.name)
        .map_or_else(String::new, |symbol| format!(" {}", repo_text(symbol, 120)));
    let doc = row
        .doc
        .as_ref()
        .map_or_else(String::new, |doc| format!(" ({})", repo_text(doc, 160)));
    let evidence = repo_text(&row.evidence, EVIDENCE_CHARS);
    if row.kind != AbilityKind::Family {
        return format!(
            "{} {} {evidence}{symbol}{doc}{members}",
            row.kind.word(),
            repo_text(&row.name, 120)
        );
    }
    let name = if row.name == row.path {
        String::new()
    } else {
        repo_text(&row.name, 120)
    };
    if !with_folder {
        let named = if name.is_empty() {
            String::new()
        } else {
            format!("{name} ")
        };
        return format!("family {named}{evidence}{members}");
    }
    let named = if name.is_empty() {
        String::new()
    } else {
        format!("{name} in ")
    };
    format!(
        "family {named}{} {evidence}{members}",
        repo_text(&row.path, 160)
    )
}
