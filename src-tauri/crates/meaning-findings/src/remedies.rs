//! What to do about each finding code of this crate. A finding names its node and what it is
//! about; the repair is the same for every finding of a code, so it is written once here and an
//! answer states it once per code.

/// The repair for `code`, or `None` for a code this crate does not own.
pub fn remedy(code: &str) -> Option<&'static str> {
    Some(match code {
        "folder-only-evidence" => "A folder's timestamp moves on almost any commit underneath it, so the node's evidence stays unknown rather than current or stale. Name the one file an unfamiliar agent should open first with patch_concept (frontmatter path); keep the folder in the body as context if it matters.",
        "dependency-unjudged" => "Cite a smaller file in `path:`, or name the file that imports the target in this relation's `why`.",
        "dependency-unwitnessed" => "Nothing is blocked: a missing import is not proof of independence (a record, an event or configuration needs none), and the edge stays listed here as unwitnessed. If a file does import it, name that repository-relative file in the edge's why with replace_relation (same from, to and type, confirm:true); remove_relation only an edge that came from look-alike names.",
        "starter-example-node" => "While the starter was the only node of its kind it was instructions; now it is a fake concept on the map next to the real ones. Delete it with delete_concept (without `confirm` it returns a dry-run listing of its backlinks, the other two starter examples, so delete all three together and the graph loses nothing). If you meant to keep it, patch_concept it into a real concept, then give it a real address with rename_concept; the UID does not change.",
        _ => return None,
    })
}
