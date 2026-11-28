//! The implementation roles two or more capabilities' reads pass through, and where each sits on
//! the map: an element whose `path:` is its file (and, when the file holds several listed roles,
//! whose cited symbol is this one or whose body cites lines inside this role's) or whose title
//! names it; one line in the project's `## Uncertainty` or `## Excludes` that points at it alone
//! and says why; or unplaced. A capability's reads are the symbol reads whose body it cites, or
//! whose context it cites when the read is of its own `path:` file. A role is a callee,
//! constructor or implementation one of those reads returned, grouped by its type. Without this
//! session's reads a restarted server cannot tell, so nothing is measured.

use std::collections::{BTreeSet, HashMap};

use answer_format::collation::compare_text;
use repository_survey::{repo_text, AbilityKind, AbilityRow};
use source_reads::{ContextRole, ReadsUnder};
use vault_document::LoadedDocument;

use crate::line_cites::cited_symbol;
use crate::name_matching::{
    code_tokens, exactly_named, gives_reason, is_generic, named_in_code, names_word, spoken_forms,
};
use crate::node_fields::{kind_of, node_path, project_of, section_of};
use crate::session_cites::session_cites;
use confined_files::SourceFiles;

/// Shared roles listed at most, most shared first; a longer list is a tail of helpers.
const ROLE_LIMIT: usize = 8;

/// The writes that give each unplaced role its element, or its one-line exclusion.
pub(crate) const ROLE_REPAIR: &str = "add_concepts an element for each, titled for the job it does for those abilities (not its code name), with path: its file and a body saying what they rely on it for that cites lines inside the range listed for it (path:Lstart-Lend, not the whole file); then add_relations from each capability that leans on it. Or exclude one in the project's ## Uncertainty with one line for it alone that cites its path:Lline and says why it is no shared role";

/// A shared role no element or exclusion holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct UnplacedRole {
    pub name: String,
    /// `path:Lstart-Lend`.
    pub lines: String,
    /// The capabilities whose reads pass through it, sorted.
    pub users: Vec<String>,
}

impl UnplacedRole {
    pub(crate) fn label(&self) -> String {
        let shown: Vec<&str> = self.users.iter().take(3).map(String::as_str).collect();
        let more = self.users.len().saturating_sub(3);
        let users = if more > 0 {
            format!("{} and {more} more", shown.join(", "))
        } else {
            shown.join(", ")
        };
        format!(
            "{} ({}, read for {users})",
            repo_text(&self.name, 120),
            repo_text(&self.lines, 160)
        )
    }
}

pub(crate) struct RoleDepth {
    pub unplaced: Vec<UnplacedRole>,
}

struct Group {
    name: String,
    path: String,
    line: usize,
    end_line: usize,
    users: BTreeSet<String>,
}

/// A Go method's role is its type: `Session.Send` and `Session.close` are both the session.
fn role_name(symbol: &str) -> &str {
    let mut parts = symbol.split('.');
    match (parts.next(), parts.next()) {
        (Some(owner), Some(member))
            if !member.is_empty() && owner.chars().next().is_some_and(|c| c.is_ascii_uppercase()) =>
        {
            owner
        }
        _ => symbol,
    }
}

fn is_role_part(role: Option<ContextRole>) -> bool {
    matches!(
        role,
        Some(ContextRole::Callee | ContextRole::Constructor | ContextRole::Implementation)
    )
}

struct Element {
    path: Option<String>,
    symbol: Option<String>,
    cites: Vec<(usize, usize)>,
    title: String,
}

/// Whether `line` holds `evidence` and no digit follows it, so `a.ts:L1` does not point at `L12`.
fn cites_exact_line(line: &str, evidence: &str) -> bool {
    line.match_indices(evidence).any(|(at, _)| {
        !line
            .get(at + evidence.len()..)
            .and_then(|rest| rest.chars().next())
            .is_some_and(|next| next.is_ascii_digit())
    })
}

#[allow(clippy::too_many_lines, reason = "one pass: users of each read, the roles they reach, their place")]
pub(crate) fn measure_roles(
    documents: &[LoadedDocument],
    reads: &ReadsUnder,
    source: Option<&dyn SourceFiles>,
) -> Option<RoleDepth> {
    if reads.reads.is_empty() {
        return None;
    }
    let capabilities: Vec<&LoadedDocument> = documents
        .iter()
        .filter(|document| kind_of(document) == "capability")
        .collect();
    let mut users_of: HashMap<&str, BTreeSet<&str>> = HashMap::new();
    let mut entries: BTreeSet<(String, String)> = BTreeSet::new();
    // The lines a capability cites in its own entry file: code there is that ability, not a role.
    let mut own: Vec<(String, usize, usize)> = Vec::new();
    for document in &capabilities {
        let body = document.body().map(std::borrow::Cow::into_owned).unwrap_or_default();
        let path = node_path(document);
        if let Some(symbol) = path.as_deref().and_then(|path| cited_symbol(&body, path)) {
            let tail = symbol.rsplit('.').next().unwrap_or(&symbol).to_string();
            entries.insert((path.clone().unwrap_or_default(), tail));
        }
        for cite in session_cites(&body, Some(reads), source) {
            if Some(&cite.path) == path.as_ref() {
                own.push((cite.path.clone(), cite.start_line, cite.end_line));
            }
            for range in reads.reads.get(&cite.path).map_or(&[][..], Vec::as_slice) {
                let Some(read) = range.read.as_deref() else {
                    continue;
                };
                if range.start_line > cite.end_line || range.end_line < cite.start_line {
                    continue;
                }
                // A part another read returned (its callee) is not this capability's way through
                // that read's other callees.
                if range.role.is_some() {
                    let of_file = read.rfind(":L").map_or(read, |at| read.get(..at).unwrap_or(read));
                    if Some(of_file) != path.as_deref() {
                        continue;
                    }
                }
                users_of.entry(read).or_default().insert(document.slug());
            }
        }
    }
    let mut groups: HashMap<(String, String), Group> = HashMap::new();
    for (path, ranges) in &reads.reads {
        if reads.cited.contains_key(path) {
            continue;
        }
        for range in ranges {
            let users = range.read.as_deref().and_then(|read| users_of.get(read));
            let (Some(users), Some(symbol)) = (users, range.symbol.as_deref()) else {
                continue;
            };
            // A part found by name alone (its import names no file here) is weaker evidence.
            if !is_role_part(range.role) || range.by_name {
                continue;
            }
            let tail = symbol.rsplit('.').next().unwrap_or(symbol).to_string();
            if entries.contains(&(path.clone(), tail))
                || own.iter().any(|(own_path, start, end)| {
                    own_path == path && *start <= range.end_line && *end >= range.start_line
                })
            {
                continue;
            }
            let name = role_name(symbol).to_string();
            let group = groups
                .entry((path.clone(), name.clone()))
                .or_insert_with(|| Group {
                    name,
                    path: path.clone(),
                    line: range.start_line,
                    end_line: range.end_line,
                    users: BTreeSet::new(),
                });
            group.line = group.line.min(range.start_line);
            group.end_line = group.end_line.max(range.end_line);
            group.users.extend(users.iter().map(|slug| (*slug).to_string()));
        }
    }
    let mut candidates: Vec<Group> = groups
        .into_values()
        .filter(|group| group.users.len() >= 2)
        .collect();
    candidates.sort_by(|left, right| {
        right
            .users
            .len()
            .cmp(&left.users.len())
            .then_with(|| compare_text(&left.path, &right.path))
            .then_with(|| left.line.cmp(&right.line))
            .then_with(|| left.name.cmp(&right.name))
    });
    candidates.truncate(ROLE_LIMIT);
    let rows: Vec<AbilityRow> = candidates
        .iter()
        .map(|group| {
            let mut row = AbilityRow::at(AbilityKind::Export, &group.name, &group.path, group.line);
            row.symbol = Some(group.name.clone());
            row
        })
        .collect();

    let elements: Vec<Element> = documents
        .iter()
        .filter(|document| kind_of(document) == "element")
        .map(|document| {
            let body = document.body().map(std::borrow::Cow::into_owned).unwrap_or_default();
            let path = node_path(document);
            let symbol = path
                .as_deref()
                .and_then(|path| cited_symbol(&body, path))
                .map(|symbol| role_name(&symbol).to_string());
            let cites = path.as_deref().map_or_else(Vec::new, |path| {
                session_cites(&body, Some(reads), source)
                    .into_iter()
                    .filter(|cite| cite.path == path)
                    .map(|cite| (cite.start_line, cite.end_line))
                    .collect()
            });
            Element {
                path,
                symbol,
                cites,
                title: document.frontmatter().text("title").unwrap_or("").to_string(),
            }
        })
        .collect();
    let exclusion_lines: Vec<String> = project_of(documents)
        .map(|project| {
            let body = project.body().map(std::borrow::Cow::into_owned).unwrap_or_default();
            format!("{}\n{}", section_of(&body, "Uncertainty"), section_of(&body, "Excludes"))
                .split('\n')
                .filter(|line| !line.trim().is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    // A title is a name a reader sees; a body that mentions a role places nothing.
    let titled = |element: &Element, group: &Group| {
        !is_generic(&group.name)
            && spoken_forms(&group.name)
                .iter()
                .any(|form| names_word(&element.title, form))
    };
    let is_placed = |index: usize, group: &Group| {
        let same_file = candidates.iter().filter(|other| other.path == group.path).count();
        let names = |element: &Element| {
            element.symbol.as_deref() == Some(group.name.as_str())
                || element
                    .cites
                    .iter()
                    .any(|(start, end)| *start >= group.line && *end <= group.end_line)
        };
        if elements.iter().any(|element| {
            (element.path.as_deref() == Some(group.path.as_str()) && (same_file == 1 || names(element)))
                || titled(element, group)
        }) {
            return true;
        }
        exclusion_lines.iter().any(|line| {
            let tokens = code_tokens(line);
            let pointed: Vec<usize> = rows
                .iter()
                .enumerate()
                .filter(|(_, other)| {
                    cites_exact_line(line, &other.evidence)
                        || named_in_code(line, other, &tokens)
                        || exactly_named(line, other)
                })
                .map(|(at, _)| at)
                .collect();
            let pointed_rows: Vec<&AbilityRow> = pointed.iter().filter_map(|at| rows.get(*at)).collect();
            pointed == [index] && gives_reason(line, &pointed_rows)
        })
    };
    let unplaced = candidates
        .iter()
        .enumerate()
        .filter(|(index, group)| !is_placed(*index, group))
        .map(|(_, group)| UnplacedRole {
            name: group.name.clone(),
            lines: format!("{}:L{}-L{}", group.path, group.line, group.end_line),
            users: group.users.iter().cloned().collect(),
        })
        .collect();
    Some(RoleDepth { unplaced })
}
