//! Compiling vaults a person or an agent could have left behind: identity faults stop the compile
//! and name every fault; every other fault is an issue and the graph still compiles.

mod support;

use ontology_graph::{compile, CompileIssue, Target};
use support::{compiled, node, plant, uid};

fn files(list: &[(&str, String)]) -> Vec<(String, String)> {
    list.iter()
        .map(|(name, text)| ((*name).to_string(), text.clone()))
        .collect()
}

#[test]
fn identity_faults_stop_the_compile_and_each_is_named_with_the_way_out() {
    let vault = plant(&files(&[
        (
            "capabilities/no-uid.md",
            "---\nkind: capability\ntitle: A\n---\n".into(),
        ),
        (
            "capabilities/bad-uid.md",
            "---\nuid: not-a-uuid\nkind: capability\ntitle: B\n---\n".into(),
        ),
        ("capabilities/twin-one.md", node(1, "capability", "")),
        ("capabilities/twin-two.md", node(1, "capability", "")),
        (
            "capabilities/merged.md",
            node(2, "capability", &format!("merged_uids:\n  - {}\n", uid(9))),
        ),
        ("capabilities/nine.md", node(9, "capability", "")),
        ("notes.md", "No frontmatter, so no node.\n".into()),
    ]));
    let error = compile(&vault.documents).expect_err("refused");
    assert_eq!(
        error.to_string(),
        "Ontology compilation failed with 4 node identity errors: invalid-uid (capabilities/bad-uid), missing-uid (capabilities/no-uid), duplicate-uid (capabilities/twin-one + capabilities/twin-two), primary-merged-uid-collision (unknown)\n  \u{2192} `uid:` must be a lowercase UUIDv4. Fix the value in the file, or let patch_concept rewrite it.\n  \u{2192} Hand-written nodes have no `uid:` yet. Any write repairs it: patch_concept(slug, {...}) mints one, or add the line yourself: `uid:` must be a lowercase UUIDv4."
    );
}

#[test]
fn a_vault_with_cycles_ambiguous_names_and_dangling_references_still_compiles() {
    let graph = compiled(&files(&[
        (
            "capabilities/a.md",
            node(
                1,
                "capability",
                "dependencies:\n  - b\n  - missing-thing\nelements:\n  - src/code.rs\n",
            ),
        ),
        (
            "capabilities/b.md",
            node(
                2,
                "capability",
                "dependencies:\n  - capabilities/a\n  - capabilities/b\n",
            ),
        ),
        ("domains/shared.md", node(3, "domain", "")),
        ("capabilities/shared.md", node(4, "capability", "")),
        (
            "capabilities/c.md",
            node(5, "capability", "relates:\n  - shared\n"),
        ),
    ]));
    assert_eq!(graph.nodes().len(), 5);
    let counts = graph.edge_counts();
    assert_eq!(
        (counts.resolved, counts.external, counts.unresolved),
        (3, 1, 2)
    );
    let targets: Vec<Target> = graph.edges().iter().map(|edge| edge.target).collect();
    assert_eq!(
        targets.iter().filter(|t| **t == Target::Unresolved).count(),
        2
    );
    let codes: Vec<&str> = graph.issues().iter().map(CompileIssue::code).collect();
    assert_eq!(
        codes,
        [
            "ambiguous-alias",
            "dangling-graph-reference",
            "dangling-graph-reference"
        ]
    );
    // The same vault compiles to the same hash, and one more edge is a different graph.
    let again = compiled(&files(&[
        (
            "capabilities/a.md",
            node(
                1,
                "capability",
                "dependencies:\n  - b\n  - missing-thing\nelements:\n  - src/code.rs\n",
            ),
        ),
        (
            "capabilities/b.md",
            node(
                2,
                "capability",
                "dependencies:\n  - capabilities/a\n  - capabilities/b\n",
            ),
        ),
        ("domains/shared.md", node(3, "domain", "")),
        ("capabilities/shared.md", node(4, "capability", "")),
        (
            "capabilities/c.md",
            node(
                5,
                "capability",
                "relates:\n  - shared\n  - capabilities/a\n",
            ),
        ),
    ]));
    assert_ne!(graph.graph_hash(), again.graph_hash());
}
