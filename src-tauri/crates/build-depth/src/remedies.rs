//! What to do about each finding code of this crate. A finding names its node and the files; the
//! repair is the same for every finding of a code, so it is written once here and an answer
//! states it once per code.

/// The repair for `code`, or `None` for a code this crate does not own.
pub fn remedy(code: &str) -> Option<&'static str> {
    Some(match code {
        "rule-without-read-lines" => "A reader cannot check the rule, and a rule taken from a body without its guard or default can be backwards. Read the entry file (analyze_repo_structure with sourceOnly and sourceReads, by symbol where the body names one), then patch_concept each rule with the cite of the returned lines that hold its condition, as `path:L12-L30`.",
        "dependency-both-ways" => "A dependency runs from consumer to provider: a caller depends on the interface it calls, an implementation does not depend on its interface, and a composition root depends on what it wires. Keep the direction the code shows and remove_relation the other.",
        "relation-note-on-unread" => "Read the named files, then replace_relation (same from, to and type, confirm:true) with a why that says what the read shows, and patch_concept any ## Uncertainty line that said the code was not read. Without the read, make the same call with a why that says only what the outline shows.",
        "path-without-code" => "Point path at the file the ability starts in, with patch_concept.",
        "path-shared" => "A drift check cannot tell the nodes apart. Give each node the more specific file its ability enters through with patch_concept, and keep one element for this file's role.",
        "not-mapped-line-mismatch" => "The app shows a share of the code on the map that is not the measured one, and finalize_project_meaning refuses. patch_concept the project body so its ## Uncertainty holds exactly the keepLines of this answer's coverage, replacing any earlier Not mapped yet lines; with every area mapped, remove them.",
        _ => return None,
    })
}
