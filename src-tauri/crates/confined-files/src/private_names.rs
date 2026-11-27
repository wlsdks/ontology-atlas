//! Names that are never read as evidence: hidden files (a leading `.`) and files named like a
//! credential. The same rule the browser bundle asks before it requests a file from the app.

const CREDENTIAL_STEMS: [&str; 9] = [
    "credential",
    "credentials",
    "secret",
    "secrets",
    "private-key",
    "private_key",
    "privatekey",
    "id_rsa",
    "id_ed25519",
];
const KEY_EXTENSIONS: [&str; 6] = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"];

/// Whether one file or folder name is a credential: `secret`, `credentials.json`, `id_rsa`,
/// `private_key.txt` (a stem, then at most one extension) or anything ending `.pem`, `.key`,
/// `.p12`, `.pfx`, `.jks` or `.keystore`, in any ASCII letter case.
pub fn is_credential_name(name: &str) -> bool {
    let lowered = name.to_ascii_lowercase();
    if KEY_EXTENSIONS
        .iter()
        .any(|extension| lowered.ends_with(extension))
    {
        return true;
    }
    let is_stem = |stem: &str| CREDENTIAL_STEMS.contains(&stem);
    if is_stem(&lowered) {
        return true;
    }
    // A single extension of at least one character that holds no dot.
    lowered
        .rsplit_once('.')
        .is_some_and(|(stem, extension)| !extension.is_empty() && is_stem(stem))
}

/// Whether a name is hidden: it starts with a dot.
pub fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

/// Whether any segment of a `/` path is hidden or named like a credential, so it is never read.
pub fn names_hidden_or_credential_file(path: &str) -> bool {
    path.split('/')
        .any(|part| is_hidden_name(part) || is_credential_name(part))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_credential_names_the_browser_bundle_refuses_are_refused() {
        for name in [
            "credential",
            "Credentials.json",
            "SECRET",
            "secrets.yaml",
            "private-key",
            "private_key.txt",
            "PrivateKey.pem",
            "id_rsa",
            "id_rsa.pub",
            "id_ed25519",
            "ID_ED25519.pub",
            "server.pem",
            "tls.KEY",
            "store.p12",
            "cert.pfx",
            "release.jks",
            "debug.keystore",
            "a.b.key",
        ] {
            assert!(is_credential_name(name), "{name}");
        }
    }

    #[test]
    fn a_name_that_only_mentions_a_credential_word_is_read() {
        for name in [
            "secret-sauce.md",
            "secretary.ts",
            "my-credentials.md",
            "id_rsa.backup.txt",
            "keys.md",
            "monkey",
            "credential.",
            "pem",
            "key",
            "private--key",
            "id_ed25519x",
            "README.md",
            // A Kelvin sign is not the letter K to this rule.
            "tls.\u{212a}EY",
        ] {
            assert!(!is_credential_name(name), "{name}");
        }
    }

    #[test]
    fn one_hidden_or_credential_segment_hides_the_whole_path() {
        assert!(names_hidden_or_credential_file(".env"));
        assert!(names_hidden_or_credential_file("src/.git/config"));
        assert!(names_hidden_or_credential_file("deploy/secrets/prod.md"));
        assert!(names_hidden_or_credential_file("a/b/server.pem"));
        assert!(!names_hidden_or_credential_file("src/lib/auth.ts"));
        assert!(!names_hidden_or_credential_file("docs/secret-sauce.md"));
        assert!(!names_hidden_or_credential_file(""));
    }
}
