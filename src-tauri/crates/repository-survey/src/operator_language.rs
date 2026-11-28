//! The four languages whose operator code (subcommands, flags, settings, workers) the survey
//! reads line by line.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperatorLanguage {
    Go,
    Python,
    Rust,
    Script,
}

/// The extension of the last path segment as `path.extname` reads it: the text from the last dot,
/// none when the dot opens the name.
fn extname(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    match name.rfind('.') {
        Some(at) if at > 0 => name.get(at..).unwrap_or(""),
        _ => "",
    }
}

impl OperatorLanguage {
    pub fn of_path(path: &str) -> Option<Self> {
        match extname(path).to_ascii_lowercase().as_str() {
            ".go" => Some(Self::Go),
            ".py" => Some(Self::Python),
            ".rs" => Some(Self::Rust),
            ".ts" | ".tsx" | ".js" | ".jsx" | ".mjs" | ".cjs" | ".mts" | ".cts" => {
                Some(Self::Script)
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_language_is_named_by_the_extension_and_a_name_that_is_all_extension_has_none() {
        assert_eq!(
            OperatorLanguage::of_path("cmd/Root.GO"),
            Some(OperatorLanguage::Go)
        );
        assert_eq!(
            OperatorLanguage::of_path("src/app.mts"),
            Some(OperatorLanguage::Script)
        );
        assert_eq!(OperatorLanguage::of_path("src/.js"), None);
        assert_eq!(OperatorLanguage::of_path("README.md"), None);
    }
}
