//! The home scan's name rule, plain string checks built on every platform so the native
//! import can apply it on Windows too; the confined reader and scan use the same functions.

use std::ffi::OsStr;

const DENIED_NAMES: &[&str] = &[
    "credential",
    "secret",
    "password",
    "passwd",
    "token",
    "apikey",
    "api-key",
    "api_key",
    "id_rsa",
    "id_ed25519",
    "id_dsa",
    "id_ecdsa",
    ".env",
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".keystore",
    ".jks",
    ".htpasswd",
];
const PRUNED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    "vendor",
    "Pods",
    "DerivedData",
    "__pycache__",
    "venv",
];

pub(crate) fn allowed_component(name: &OsStr) -> bool {
    let Some(name_str) = name.to_str() else {
        return false;
    };
    let lower = name_str.to_ascii_lowercase();
    !name_str.starts_with('.')
        && !DENIED_NAMES.iter().any(|v| lower.contains(v))
        && !PRUNED_DIRS.contains(&name_str)
}

pub(crate) fn supported_file(name: &OsStr) -> bool {
    let extension = name
        .to_str()
        .and_then(|file| file.rsplit_once('.'))
        .map(|(_, extension)| extension.to_ascii_lowercase());
    matches!(
        extension.as_deref(),
        Some("md" | "png" | "jpg" | "jpeg" | "webp" | "avif")
    )
}
