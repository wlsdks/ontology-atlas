//! What one product file says about how the program starts or is reached: a `main`, a shebang, a
//! plugin class, a route it registers. Read from the text alone; nothing runs.

use std::sync::LazyLock;

use regex::Regex;

use crate::js_pattern::js_regex;

/// A survey lists at most this many routes.
pub const ROUTE_LIMIT: usize = 12;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EntrySignals {
    /// The symbol of the executable this file is.
    pub executable: Option<String>,
    pub plugins: Vec<String>,
    /// Distinct routes in the order found, at most [`ROUTE_LIMIT`].
    pub routes: Vec<String>,
}

static GO_PACKAGE_MAIN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?m)^package main\b"));
static GO_FUNC_MAIN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?m)^func main\(\)"));
static RUST_FN_MAIN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?m)^fn main\(\)"));
static PYTHON_MAIN: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"(?m)^if __name__ == ["']__main__["']"#));
static NODE_SHEBANG: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^#!.*\bnode\b"));
static PLUGIN_CLASS: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?m)^export\s+(?:default\s+)?class\s+(\w+)[^{\n]*\bimplements\s+(?:\w+\.)?I?\w*Plugin\b",
    )
});
static ROUTE_GO: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"\b(?:HandleFunc|Handle)\(\s*"(/[^"]*)""#));
static ROUTE_METHOD_CALL: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r#"\b(?:app|router|server|api|r|e|g)\.(get|post|put|patch|delete|GET|POST|PUT|PATCH|DELETE)\(\s*["'`](/[^"'`]*)["'`]"#,
    )
});
static ROUTE_DECORATOR: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r#"@(?:app|router|api|bp|blueprint)\.(?:route|get|post|put|patch|delete)\(\s*["'](/[^"']*)["']"#,
    )
});

/// The file name without its last extension.
pub fn stem_of(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    match name.rfind('.') {
        Some(dot) if dot > 0 && dot + 1 < name.len() => name.get(..dot).unwrap_or(name),
        _ => name,
    }
}

fn extension_of(path: &str) -> String {
    path.rsplit('/')
        .next()
        .and_then(|name| name.rfind('.').and_then(|dot| name.get(dot..)))
        .unwrap_or("")
        .to_string()
}

fn is_script(path: &str) -> bool {
    matches!(
        extension_of(path).to_lowercase().as_str(),
        ".ts" | ".tsx" | ".js" | ".jsx" | ".mjs" | ".cjs" | ".mts" | ".cts" | ".vue" | ".svelte"
    )
}

/// What `text`, the start of the file at `path`, says about how it is reached.
pub fn read_entry_signals(path: &str, text: &str) -> EntrySignals {
    let extension = extension_of(path);
    let name = path.rsplit('/').next().unwrap_or(path);
    let executable =
        if extension == ".go" && GO_PACKAGE_MAIN.is_match(text) && GO_FUNC_MAIN.is_match(text)
            || extension == ".rs" && RUST_FN_MAIN.is_match(text)
        {
            Some("main".to_string())
        } else if extension == ".py" && (name == "__main__.py" || PYTHON_MAIN.is_match(text)) {
            Some("__main__".to_string())
        } else if NODE_SHEBANG.is_match(text) {
            Some(stem_of(path).to_string())
        } else {
            None
        };
    let plugins = if is_script(path) {
        PLUGIN_CLASS
            .captures_iter(text)
            .filter_map(|found| found.get(1).map(|name| name.as_str().to_string()))
            .collect()
    } else {
        Vec::new()
    };
    let mut routes: Vec<String> = Vec::new();
    let mut keep = |route: String| {
        if routes.len() < ROUTE_LIMIT && !routes.contains(&route) {
            routes.push(route);
        }
    };
    for found in ROUTE_GO.captures_iter(text) {
        if let Some(route) = found.get(1) {
            keep(route.as_str().to_string());
        }
    }
    for found in ROUTE_METHOD_CALL.captures_iter(text) {
        if let (Some(method), Some(route)) = (found.get(1), found.get(2)) {
            keep(format!(
                "{} {}",
                method.as_str().to_uppercase(),
                route.as_str()
            ));
        }
    }
    for found in ROUTE_DECORATOR.captures_iter(text) {
        if let Some(route) = found.get(1) {
            keep(route.as_str().to_string());
        }
    }
    EntrySignals {
        executable,
        plugins,
        routes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_main_function_or_a_shebang_makes_an_executable_named_as_its_language_does() {
        assert_eq!(
            read_entry_signals("cmd/a/main.go", "package main\n\nfunc main() {}\n")
                .executable
                .as_deref(),
            Some("main")
        );
        assert_eq!(
            read_entry_signals("a/lib.rs", "fn main() {}\n")
                .executable
                .as_deref(),
            Some("main")
        );
        assert_eq!(
            read_entry_signals("pkg/__main__.py", "")
                .executable
                .as_deref(),
            Some("__main__")
        );
        assert_eq!(
            read_entry_signals("bin/atlas.js", "#!/usr/bin/env node\n")
                .executable
                .as_deref(),
            Some("atlas")
        );
        assert_eq!(
            read_entry_signals("a.go", "package a\nfunc main() {}").executable,
            None
        );
    }

    #[test]
    fn routes_are_distinct_and_the_method_is_upper_case() {
        let text = "app.get('/orders', h);\nrouter.post(\"/orders\", h);\napp.get('/orders', h);\nmux.HandleFunc(\"/health\", h)\n";
        assert_eq!(
            read_entry_signals("server.go", text).routes,
            ["/health", "GET /orders", "POST /orders"]
        );
    }

    #[test]
    fn a_file_names_at_most_twelve_routes() {
        let text: String = (0..20).map(|n| format!("app.get('/r{n}', h);\n")).collect();
        assert_eq!(read_entry_signals("a.ts", &text).routes.len(), ROUTE_LIMIT);
    }

    #[test]
    fn a_plugin_class_is_named() {
        let text = "export default class Billing implements IPlugin {\n}\n";
        assert_eq!(read_entry_signals("a.ts", text).plugins, ["Billing"]);
        assert!(read_entry_signals("a.py", text).plugins.is_empty());
    }
}
