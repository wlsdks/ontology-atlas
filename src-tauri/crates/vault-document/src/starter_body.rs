//! The body a new node of each kind starts with, so a first file explains itself. A body that is
//! still this text, or a reworded copy of it, says nothing about the concept yet.

/// The public contract for choosing a kind or a relation.
pub const META_MODEL_REFERENCE: &str =
    "https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind";

fn closing_line() -> String {
    format!("Kind and relation contract: {META_MODEL_REFERENCE}\n")
}

/// The starter body of `kind` for a node titled `title`, or `None` for a kind with no starter.
pub fn starter_body(kind: &str, title: &str) -> Option<String> {
    let template = match kind {
        "project" => format!(
            "# {title}\n\n\
             One- or two-line summary of this project: *what / for whom / why*.\n\n\
             ## How it grows\n\n\
             - Fill `domains: [...]` in the frontmatter and the domain nodes hang\n  \
             off the project tree automatically.\n\
             - Each domain's capabilities and elements follow the same pattern.\n\n"
        ),
        "domain" => format!(
            "# {title}\n\n\
             Describe the stable responsibility or problem boundary, what it includes, \
             what it excludes, and the evidence that makes it more than a folder or team.\n\n\
             ## Includes\n\n\
             - <one responsibility this domain owns>\n\n\
             ## Excludes\n\n\
             - <one neighbouring responsibility this domain does not own>\n\n\
             ## Evidence\n\n\
             - <what makes this more than a folder or a team name>\n\n\
             ## Uncertainty\n\n\
             - <what you did not read or could not check>\n\n"
        ),
        "capability" => format!(
            "# {title}\n\n\
             Describe the observable, implementation-independent ability, its boundary, \
             and the evidence or scenario that proves the product or system can perform it.\n\n\
             ## Includes\n\n\
             - <one thing this capability can do>\n\n\
             ## Excludes\n\n\
             - <one nearby ability this capability does not provide>\n\n\
             ## Evidence\n\n\
             - path: <file> — what it proves\n\n\
             ## Uncertainty\n\n\
             - <what you did not read or could not check>\n\n"
        ),
        "element" => format!(
            "# {title}\n\n\
             Describe the distinct implementation role, what it realizes or proves, and \
             the source path or interface that supports the claim. A path alone is evidence, not a node.\n\n\
             ## Includes\n\n\
             - <one part of the role this element plays>\n\n\
             ## Excludes\n\n\
             - <one nearby role this element does not play>\n\n\
             ## Evidence\n\n\
             - path: <file> — what it proves\n\n\
             ## Uncertainty\n\n\
             - <what you did not read or could not check>\n\n"
        ),
        "document" => format!(
            "# {title}\n\n\
             State what this narrative or reference artifact explains and which graph concept it describes.\n\n"
        ),
        _ => return None,
    };
    Some(template + &closing_line())
}
