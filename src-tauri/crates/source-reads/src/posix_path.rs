//! `/`-separated path arithmetic for the repository-relative paths a read names, the way Node's
//! `path.posix` computes it: the paths are already `/`-separated whatever the host, and an import
//! resolves against them, not against the disk.

pub fn extname(path: &str) -> &str {
    let base = basename(path);
    match base.rfind('.') {
        Some(at) if at > 0 => base.get(at..).unwrap_or(""),
        _ => "",
    }
}

pub fn basename(path: &str) -> &str {
    let trimmed = path.trim_end_matches('/');
    trimmed.rsplit('/').next().unwrap_or("")
}

pub fn dirname(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    match trimmed.rfind('/') {
        None => ".".to_string(),
        Some(0) => "/".to_string(),
        Some(at) => trimmed
            .get(..at)
            .unwrap_or("")
            .trim_end_matches('/')
            .to_string(),
    }
}

pub fn normalize(path: &str) -> String {
    if path.is_empty() {
        return ".".to_string();
    }
    let absolute = path.starts_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if parts.last().is_some_and(|last| *last != "..") {
                    parts.pop();
                } else if !absolute {
                    parts.push("..");
                }
            }
            other => parts.push(other),
        }
    }
    let joined = parts.join("/");
    let kept_slash = path.ends_with('/') && !joined.is_empty();
    match (absolute, joined.is_empty()) {
        (true, true) => "/".to_string(),
        (false, true) => ".".to_string(),
        (true, false) => format!("/{joined}{}", if kept_slash { "/" } else { "" }),
        (false, false) => format!("{joined}{}", if kept_slash { "/" } else { "" }),
    }
}

pub fn join(parts: &[&str]) -> String {
    let kept: Vec<&str> = parts
        .iter()
        .copied()
        .filter(|part| !part.is_empty())
        .collect();
    if kept.is_empty() {
        ".".to_string()
    } else {
        normalize(&kept.join("/"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_resolve_as_node_posix_resolves_them() {
        assert_eq!(extname("a/b.test.ts"), ".ts");
        assert_eq!(extname(".bashrc"), "");
        assert_eq!(dirname("a/b/c.ts"), "a/b");
        assert_eq!(dirname("c.ts"), ".");
        assert_eq!(
            join(&["src/order", "../payment/charge"]),
            "src/payment/charge"
        );
        assert_eq!(join(&[".", "x"]), "x");
        assert_eq!(normalize("../a/./b/.."), "../a");
        assert_eq!(basename("a/index"), "index");
    }
}
