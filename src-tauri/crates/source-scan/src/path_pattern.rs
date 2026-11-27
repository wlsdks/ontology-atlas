//! The path patterns an architecture profile writes its roles and scope in: `*` is any run of
//! characters inside one folder name, `?` one such character, `**` any run across folders and
//! `**/` any number of folders, possibly none. A pattern is read once and tests a path by
//! stepping every way it could match at once, so a path costs its length times the pattern's, never
//! a search that doubles on each `*`. Characters are UTF-16 units, as the JavaScript server counts
//! them, so `?` does not match one emoji.

/// `path` as a profile reads it: `/` separators, no leading `./`, no trailing `/`.
pub fn normalize_path(path: &str) -> String {
    let slashed = path.replace('\\', "/");
    let without_dot = slashed.strip_prefix("./").unwrap_or(&slashed);
    without_dot.trim_end_matches('/').to_string()
}

const STAR: u16 = b'*' as u16;
const SLASH: u16 = b'/' as u16;
const QUESTION: u16 = b'?' as u16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Step {
    Literal(u16),
    /// `*`: any run of characters but `/`.
    InFolder,
    /// `**`: any run of characters but a line break.
    AcrossFolders,
    /// `?`: one character but `/`.
    OneInFolder,
    /// The start of `**/`: this step and the two after it (`**`, `/`) may all be skipped.
    OptionalFolders,
}

impl Step {
    /// Whether a step that loops takes `unit` and stays where it is.
    fn takes_and_stays(self, unit: u16) -> bool {
        match self {
            Self::InFolder => unit != SLASH,
            Self::AcrossFolders => !matches!(unit, 0x0A | 0x0D | 0x2028 | 0x2029),
            _ => false,
        }
    }

    /// Whether a step that reads one unit takes `unit` and moves on.
    fn takes_and_advances(self, unit: u16) -> bool {
        match self {
            Self::Literal(expected) => expected == unit,
            Self::OneInFolder => unit != SLASH,
            _ => false,
        }
    }
}

fn is_set(states: &[bool], index: usize) -> bool {
    states.get(index).copied().unwrap_or(false)
}

fn set(states: &mut [bool], index: usize) {
    if let Some(state) = states.get_mut(index) {
        *state = true;
    }
}

/// A pattern ready to test paths with.
#[derive(Debug, Clone)]
pub struct PathPattern {
    steps: Vec<Step>,
}

impl PathPattern {
    /// The pattern, or `None` when it is empty once normalized (it matches nothing).
    pub fn new(pattern: &str) -> Option<Self> {
        let normalized: Vec<u16> = normalize_path(pattern).encode_utf16().collect();
        if normalized.is_empty() {
            return None;
        }
        let mut steps = Vec::with_capacity(normalized.len());
        let mut index = 0;
        while let Some(&character) = normalized.get(index) {
            let at = |offset: usize| normalized.get(index + offset).copied();
            if character == STAR && at(1) == Some(STAR) {
                if at(2) == Some(SLASH) {
                    steps.extend([Step::OptionalFolders, Step::AcrossFolders, Step::Literal(SLASH)]);
                    index += 3;
                    // Repeated `**/` add nothing.
                    while normalized.get(index..index + 3) == Some(&[STAR, STAR, SLASH]) {
                        index += 3;
                    }
                } else {
                    steps.push(Step::AcrossFolders);
                    index += 2;
                }
                continue;
            }
            steps.push(match character {
                STAR => Step::InFolder,
                QUESTION => Step::OneInFolder,
                other => Step::Literal(other),
            });
            index += 1;
        }
        Some(Self { steps })
    }

    pub fn matches(&self, path: &str) -> bool {
        let size = self.steps.len();
        let mut active = vec![false; size + 1];
        let mut next = vec![false; size + 1];
        set(&mut active, 0);
        self.close(&mut active);
        for unit in path.encode_utf16() {
            next.fill(false);
            let mut live = false;
            for (state, step) in self.steps.iter().enumerate() {
                if !is_set(&active, state) {
                    continue;
                }
                if step.takes_and_stays(unit) {
                    set(&mut next, state);
                    live = true;
                }
                if step.takes_and_advances(unit) {
                    set(&mut next, state + 1);
                    live = true;
                }
            }
            if !live {
                return false;
            }
            std::mem::swap(&mut active, &mut next);
            self.close(&mut active);
        }
        is_set(&active, size)
    }

    /// Adds the states reachable without reading a character: past a `*` or `**` that matches
    /// nothing, and past all of `**/`.
    fn close(&self, states: &mut [bool]) {
        for (index, step) in self.steps.iter().enumerate() {
            if !is_set(states, index) {
                continue;
            }
            match step {
                Step::InFolder | Step::AcrossFolders => set(states, index + 1),
                Step::OptionalFolders => {
                    set(states, index + 1);
                    set(states, index + 3);
                }
                _ => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matches(pattern: &str, path: &str) -> bool {
        PathPattern::new(pattern).is_some_and(|pattern| pattern.matches(&normalize_path(path)))
    }

    #[test]
    fn stars_stay_in_a_folder_and_double_stars_cross_folders() {
        assert!(matches("src/*.ts", "src/a.ts"));
        assert!(!matches("src/*.ts", "src/a/b.ts"));
        assert!(matches("src/**/*.ts", "src/a.ts"));
        assert!(matches("src/**/*.ts", "src/a/b/c.ts"));
        assert!(matches("src/**", "src/a/b"));
        assert!(matches("a?c", "abc"));
        assert!(!matches("a?c", "a/c"));
        assert!(matches("./src/features/", "src/features"));
        assert!(matches("src\\x", "src/x"));
    }

    #[test]
    fn a_pattern_made_of_many_stars_does_not_blow_up_on_a_long_miss() {
        let pattern = "*a*a*a*a*a*a*a*a*a*a*a*a*a*a*a*b";
        let path = "a".repeat(2_000);
        assert!(!matches(pattern, &path));
    }

    #[test]
    fn an_empty_pattern_matches_nothing() {
        assert!(!matches("", "a"));
        assert!(!matches("./", ""));
    }
}
