//! Whether the hosted `latest.json` is offered to this app. A beta and the stable release promoted
//! from it share one version, so the stable manifest names its commit in build metadata
//! (`2.5.0+<12 hex>`). An app built from another commit of that version is offered the stable;
//! the promoted build itself is not. Build metadata never changes precedence: a higher version
//! is offered and a lower one is not, whatever commit either names.

use semver::Version;
use std::cmp::Ordering;

/// The length of the commit identity in the manifest's build metadata.
const COMMIT_ID_LEN: usize = 12;

/// The commit the release workflow built this binary from; a local build has none.
const BUILD_COMMIT: Option<&str> = option_env!("ATLAS_BUILD_COMMIT");

pub(crate) fn offers_update(current: &Version, remote: &Version) -> bool {
    offers_update_for_build(current, remote, BUILD_COMMIT)
}

fn is_lower_hex(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

/// The first twelve characters of a full lowercase commit hash, or nothing for any other value.
fn build_commit_id(build_commit: Option<&str>) -> Option<&str> {
    let commit = build_commit?;
    if commit.len() < COMMIT_ID_LEN || !is_lower_hex(commit) {
        return None;
    }
    commit.get(..COMMIT_ID_LEN)
}

fn offers_update_for_build(
    current: &Version,
    remote: &Version,
    build_commit: Option<&str>,
) -> bool {
    match remote.cmp_precedence(current) {
        Ordering::Greater => true,
        Ordering::Less => false,
        Ordering::Equal => {
            let remote_commit = remote.build.as_str();
            if remote_commit.len() != COMMIT_ID_LEN || !is_lower_hex(remote_commit) {
                return false;
            }
            build_commit_id(build_commit).is_some_and(|local| local != remote_commit)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::offers_update_for_build;
    use semver::Version;

    const BUILT: &str = "0123456789abcdef0123456789abcdef01234567";

    fn offered(current: &str, remote: &str, build_commit: Option<&str>) -> bool {
        offers_update_for_build(
            &Version::parse(current).unwrap(),
            &Version::parse(remote).unwrap(),
            build_commit,
        )
    }

    #[test]
    fn the_build_the_manifest_names_is_not_offered_itself() {
        assert!(!offered("2.5.0", "2.5.0+0123456789ab", Some(BUILT)));
    }

    #[test]
    fn another_commit_of_the_same_version_is_offered_the_stable() {
        assert!(offered("2.5.0", "2.5.0+fedcba987654", Some(BUILT)));
    }

    #[test]
    fn a_higher_version_is_offered_whatever_commit_either_names() {
        assert!(offered("2.5.0", "2.5.1+0123456789ab", Some(BUILT)));
        assert!(offered("2.4.0", "2.5.0", Some(BUILT)));
        assert!(offered("2.4.0", "2.5.0+0123456789ab", None));
    }

    #[test]
    fn a_lower_version_is_never_offered_even_from_another_commit() {
        assert!(!offered("2.5.0", "2.4.0+fedcba987654", Some(BUILT)));
        assert!(!offered("2.5.0", "2.4.0", None));
    }

    #[test]
    fn a_manifest_without_a_commit_compares_versions_alone() {
        assert!(!offered("2.5.0", "2.5.0", Some(BUILT)));
        assert!(offered("2.5.0", "2.5.1", Some(BUILT)));
        for metadata in ["build.7", "0123456789AB", "0123456789abc", "0123456789a"] {
            assert!(
                !offered("2.5.0", &format!("2.5.0+{metadata}"), Some(BUILT)),
                "{metadata}"
            );
        }
    }

    #[test]
    fn a_build_without_a_commit_compares_versions_alone() {
        assert!(!offered("2.5.0", "2.5.0+fedcba987654", None));
        assert!(!offered("2.5.0", "2.5.0+fedcba987654", Some("")));
        assert!(!offered(
            "2.5.0",
            "2.5.0+fedcba987654",
            Some("not-a-commit")
        ));
        assert!(offered("2.5.0", "2.6.0+fedcba987654", None));
    }
}
