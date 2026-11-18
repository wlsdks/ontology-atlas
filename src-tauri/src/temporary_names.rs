//! The names Atlas gives a file while it is being written, in one place, so the writers and
//! the vault-open sweep that removes leftovers cannot drift apart. The sweep deletes only a
//! whole name in one of these exact shapes; a person's file that merely mentions the marker
//! is never touched.
//!
//! | Writer | Shape |
//! |---|---|
//! | app atomic write | `.<name>.oatlas-tmp-<pid>-<hex>-<hex>` |
//! | app create-only write | `.oatlas-create-<pid>-<hex>-<hex>.tmp` |
//! | MCP sidecar write (`mcp/src/vault/vault-sidecar.mjs`) | `.<name>.oatlas-tmp-<pid>-<uuid>` |
//! | MCP and CLI atomic write (`atomic-writes.mjs`, `atomic-write.mjs`) | `<name>.oatlas-tmp-<pid>` |

const TEMPORARY_MARKER: &str = ".oatlas-tmp-";
const CREATE_PREFIX: &str = ".oatlas-create-";
const CREATE_SUFFIX: &str = ".tmp";

pub(crate) fn atomic_temporary_name(
    file_name: &str,
    pid: u32,
    nonce: u128,
    sequence: u64,
) -> String {
    format!(".{file_name}{TEMPORARY_MARKER}{pid}-{nonce:x}-{sequence:x}")
}

pub(crate) fn create_temporary_name(pid: u32, nonce: u128, sequence: u64) -> String {
    format!("{CREATE_PREFIX}{pid}-{nonce:x}-{sequence:x}{CREATE_SUFFIX}")
}

fn is_digits(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_lower_hex(text: &str) -> bool {
    !text.is_empty()
        && text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// `<pid>-<hex>-<hex>`, as the app's writers produce.
fn is_pid_hex_hex(text: &str) -> bool {
    let mut parts = text.split('-');
    matches!(
        (parts.next(), parts.next(), parts.next(), parts.next()),
        (Some(pid), Some(nonce), Some(sequence), None)
            if is_digits(pid) && is_lower_hex(nonce) && is_lower_hex(sequence)
    )
}

/// `<pid>-<uuid>`, as Node's `randomUUID()` produces: lower-case 8-4-4-4-12 hex.
fn is_pid_uuid(text: &str) -> bool {
    let Some((pid, uuid)) = text.split_once('-') else {
        return false;
    };
    let groups: Vec<&str> = uuid.split('-').collect();
    is_digits(pid)
        && groups.len() == 5
        && groups
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(group, length)| group.len() == length && is_lower_hex(group))
}

/// True only for a whole name in one of the writers' shapes above.
pub(crate) fn is_atlas_temporary(name: &str) -> bool {
    if let Some(middle) = name
        .strip_prefix(CREATE_PREFIX)
        .and_then(|rest| rest.strip_suffix(CREATE_SUFFIX))
    {
        return is_pid_hex_hex(middle);
    }
    let Some((target, suffix)) = name.rsplit_once(TEMPORARY_MARKER) else {
        return false;
    };
    if is_digits(suffix) {
        return !target.is_empty();
    }
    let hidden_target = target
        .strip_prefix('.')
        .is_some_and(|rest| !rest.is_empty());
    hidden_target && (is_pid_hex_hex(suffix) || is_pid_uuid(suffix))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_name_the_app_writers_produce_is_recognised() {
        for (file_name, pid, nonce, sequence) in [
            ("note.md", 41, 0x18f_u128, 0),
            ("library-collections.json", 7, u128::MAX, u64::MAX),
            (".mcp.json", 1, 1, 1),
        ] {
            let atomic = atomic_temporary_name(file_name, pid, nonce, sequence);
            assert!(is_atlas_temporary(&atomic), "{atomic}");
        }
        let create = create_temporary_name(41, 0x18f, 3);
        assert!(is_atlas_temporary(&create), "{create}");
    }

    /// The JS writers cannot call this module, so their source must still spell the shape
    /// this module accepts; a change there fails here instead of leaving debris or worse.
    #[test]
    fn the_mcp_and_cli_writers_still_use_the_recognised_shapes() {
        let sidecar = include_str!("../../mcp/src/vault/vault-sidecar.mjs");
        assert!(sidecar.contains("`.${filename}.oatlas-tmp-${process.pid}-${randomUUID()}`"));
        assert!(is_atlas_temporary(
            ".library-collections.json.oatlas-tmp-912-3b241101-e2bb-4255-8caf-4136c566a962"
        ));
        for source in [
            include_str!("../../mcp/src/vault/atomic-writes.mjs"),
            include_str!("../../cli/src/lib/vault-files/atomic-write.mjs"),
        ] {
            assert!(source.contains("`${filePath}.oatlas-tmp-${process.pid}`"));
        }
        assert!(is_atlas_temporary("note.md.oatlas-tmp-912"));
    }

    /// A person may name a file after the marker; only the writers' exact shapes are Atlas's.
    #[test]
    fn a_person_s_file_that_mentions_the_marker_is_not_a_temporary() {
        for name in [
            ".oatlas-tmp-notes.md",
            "why.oatlas-tmp-files-appear.md",
            ".oatlas-create-plan.tmp",
            "pkg.oatlas-tmp-fixture",
            ".oatlas-tmp-123",
            "note.md.oatlas-tmp-",
            "note.md.oatlas-tmp-12a",
            ".note.md.oatlas-tmp-1-ABC-0",
            "note.md.oatlas-tmp-1-18f-0",
            ".note.md.oatlas-tmp-1-18f-0-9",
            ".oatlas-create-1-18f.tmp",
            ".oatlas-create-1-18f-0.tmp.md",
            ".note.md.oatlas-tmp-1-3b241101-e2bb-4255-8caf-4136c566a96",
            "note.md",
            ".DS_Store",
        ] {
            assert!(!is_atlas_temporary(name), "{name}");
        }
    }
}
