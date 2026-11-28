//! Names that are never read as evidence: hidden files (a leading `.`) and files named like a
//! credential. The same rule the browser bundle asks before it requests a file from the app.

use icu_normalizer::ComposingNormalizerBorrowed;

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

/// A name as a case-insensitive, normalization-insensitive disk sees it: composed (NFC), then
/// lower-cased in full. APFS and NTFS open `private_\u{212a}ey.txt` (a Kelvin sign) as
/// `private_key.txt`, and macOS finds a decomposed name by its composed form; a rule that compares
/// the typed letters would pass the lookalike while the disk opens the credential.
pub(crate) fn folded_name(name: &str) -> String {
    if name.is_ascii() {
        return name.to_ascii_lowercase();
    }
    ComposingNormalizerBorrowed::new_nfc()
        .normalize(name)
        .to_lowercase()
}

/// Whether one file or folder name is a credential: `secret`, `credentials.json`, `id_rsa`,
/// `private_key.txt` (a stem, then at most one extension) or anything ending `.pem`, `.key`,
/// `.p12`, `.pfx`, `.jks` or `.keystore`, in any letter case and in any Unicode form that folds to
/// those letters.
pub fn is_credential_name(name: &str) -> bool {
    let lowered = folded_name(name);
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
            // A Kelvin sign folds to the letter K on a case-insensitive disk (APFS, NTFS), so the
            // disk opens these as `private_key.txt` and `tls.key`.
            "private_\u{212a}ey.txt",
            "tls.\u{212a}EY",
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
