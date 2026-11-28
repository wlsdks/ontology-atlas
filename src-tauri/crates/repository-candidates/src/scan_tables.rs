//! Detection tables the topic modules share, in one leaf module so no topic imports another for a
//! list.

use std::sync::LazyLock;

use regex::Regex;
use repository_survey::js_regex;

/// The folders the layered layout (feature-sliced design) mode scans. Detection uses the same
/// list, or a repository would be called layered and then nothing would be read.
pub const FSD_SCAN_ROOTS: [&str; 4] = ["features", "entities", "widgets", "views"];
pub const SOURCE_FOLDERS: [&str; 5] = ["src", "source", "lib", "app", "internal"];
pub const IMPLEMENTATION_ONLY_SOURCE_FOLDERS: [&str; 1] = ["internal"];
pub const WORKSPACE_FOLDERS: [&str; 2] = ["apps", "packages"];
pub const PYTHON_NON_PRODUCT_PACKAGES: [&str; 2] = ["test", "tests"];
pub const STARTER_ONTOLOGY_SLUGS: [&str; 2] =
    ["domains/example-domain", "capabilities/example-capability"];
pub const AUTOTOOLS_IDENTITY_FILES: [&str; 2] = ["configure.ac", "configure.in"];
pub const CARGO_PACKAGE_EVIDENCE_FIELDS: [&str; 5] =
    ["name", "version", "description", "edition", "rust-version"];
pub const SEMANTIC_DISCOVERY_ROOTS: [&str; 3] = ["docs", "site", "website"];
pub const SEMANTIC_DISCOVERY_SKIP_DIRS: [&str; 8] = [
    "_theme",
    "archive",
    "assets",
    "benchmarks",
    "evaluations",
    "goals",
    "images",
    "ontology",
];
pub const ELEMENT_ENTRY_FILES: [&str; 6] = [
    "index.ts",
    "index.tsx",
    "index.js",
    "index.mjs",
    "main.ts",
    "main.js",
];

/// Document names that seed the semantic evidence, with the role each plays.
pub const SEMANTIC_EVIDENCE_SEEDS: [(&str, &str); 10] = [
    ("README.md", "mission"),
    ("README.rst", "mission"),
    ("ARCHITECTURE.md", "architecture"),
    ("package.json", "package-contract"),
    ("Cargo.toml", "package-contract"),
    ("pyproject.toml", "package-contract"),
    ("setup.py", "package-contract"),
    ("docs/FEATURES.md", "product-capabilities"),
    ("docs/SYSTEM-MAP.md", "architecture"),
    ("AGENTS.md", "agent-guidance"),
];

pub struct AutotoolsManifest {
    pub file: &'static str,
    pub slug: &'static str,
    pub title: &'static str,
}

pub const AUTOTOOLS_IMPLEMENTATION_MANIFESTS: [AutotoolsManifest; 3] = [
    AutotoolsManifest {
        file: "configure.ac",
        slug: "elements/autotools-configure",
        title: "Autotools Configure",
    },
    AutotoolsManifest {
        file: "configure.in",
        slug: "elements/autotools-configure",
        title: "Autotools Configure",
    },
    AutotoolsManifest {
        file: "Makefile.am",
        slug: "elements/autotools-build",
        title: "Autotools Build",
    },
];

pub const IMPLEMENTATION_SHAPED_CAPABILITY_TOKENS: [&str; 18] = [
    "adapter",
    "api",
    "client",
    "config",
    "controller",
    "infra",
    "infrastructure",
    "logger",
    "middleware",
    "policy",
    "registry",
    "router",
    "server",
    "storage",
    "telemetry",
    "transport",
    "ui",
    "web",
];

pub static SOURCE_LAYOUT_COORDINATION_ROLE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)(?:^|[-_.])(app|main|index|manager|loader|registry|storage|client|server|router|controller)(?:[-_.]|$)",
    )
});
pub static SOURCE_LAYOUT_CODE_FILE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)\.(?:[cm]?[jt]sx?|py)$"));
pub static TEST_OR_SPEC_SCRIPT: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)\.(?:test|spec)\.(?:[cm]?[jt]sx?)$"));
pub static NATIVE_SOURCE_FILE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)\.(?:c|h)$"));
pub static NATIVE_ROLE_EVIDENCE_FILE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)\.(?:c|h(?:\.in)?)$"));

/// An ability a repository's own narrative states and its implementation names.
pub struct CapabilityClue {
    pub slug: &'static str,
    pub title: &'static str,
    /// The domain the clue declares; the generic narrative clues declare none.
    pub domain: Option<&'static str>,
    pub prose: Vec<Regex>,
    pub implementation: Vec<Regex>,
}

fn patterns(sources: &[&str]) -> Vec<Regex> {
    sources.iter().map(|source| js_regex(source)).collect()
}

/// Outcome-oriented clues, not framework or folder names. A rule needs both semantic prose and a
/// matching implementation witness before it becomes a proposal, and a person or agent still
/// approves it.
pub static BUSINESS_CAPABILITY_CLUES: LazyLock<Vec<CapabilityClue>> = LazyLock::new(|| {
    vec![
        CapabilityClue {
            slug: "capabilities/decision-broadcast",
            title: "Decision Broadcast",
            domain: Some("domains/coordination"),
            prose: patterns(&[
                r"(?i)\bpublish(?:es|ed|ing)?\b.{0,60}\bdecisions?\b",
                r"(?i)\bdistribut(?:e|es|ed|ing)\b.{0,60}\btimeline updates?\b",
            ]),
            implementation: patterns(&[r"(?i)realtime", r"(?i)timeline", r"(?i)distribut"]),
        },
        CapabilityClue {
            slug: "capabilities/acknowledgement-tracking",
            title: "Acknowledgement Tracking",
            domain: Some("domains/coordination"),
            prose: patterns(&[
                r"(?i)\b(?:has|have|who has)\s+acknowledged\b",
                r"(?i)\backnowledg(?:e|ed|ement|ements|ing)\b",
            ]),
            implementation: patterns(&[
                r"(?i)\bweb\b",
                r"(?i)console",
                r"(?i)present",
                r"(?i)timeline",
            ]),
        },
        CapabilityClue {
            slug: "capabilities/workspace-authorization",
            title: "Workspace Authorization",
            domain: Some("domains/access-control"),
            prose: patterns(&[
                r"(?i)\bworkspace permissions?\b",
                r"(?i)\b(?:read|coordinate|administer)\b.{0,70}\b(?:incident|workspace)\b",
                r"(?i)\b(?:may|can)\s+read\b.{0,70}\badminister\b",
            ]),
            implementation: patterns(&[
                r"(?i)policy",
                r"(?i)permission",
                r"(?i)authori[sz]",
                r"(?i)access",
            ]),
        },
        CapabilityClue {
            slug: "capabilities/checkout",
            title: "Checkout",
            domain: Some("domains/purchase"),
            prose: patterns(&[
                r"(?i)\bauthori[sz]e\s+payment\b",
                r"(?i)\border confirmation\b",
                r"(?i)\b(?:purchase|purchase completion)\b",
            ]),
            implementation: patterns(&[r"(?i)checkout", r"(?i)cart", r"(?i)payment", r"(?i)order"]),
        },
        CapabilityClue {
            slug: "capabilities/inventory-sync",
            title: "Inventory Sync",
            domain: Some("domains/inventory"),
            prose: patterns(&[
                r"(?i)\breconcil\w*\b.{0,70}\b(?:stock|warehouse|availability)\b",
                r"(?i)\b(?:sellable|available) stock\b",
                r"(?i)\binventory availability\b",
            ]),
            implementation: patterns(&[
                r"(?i)inventory",
                r"(?i)stock",
                r"(?i)warehouse",
                r"(?i)reconcil",
            ]),
        },
        CapabilityClue {
            slug: "capabilities/intake",
            title: "Document Intake",
            domain: Some("domains/intake"),
            prose: patterns(&[
                r"(?i)\baccept\s+(?:a|the)\s+document\b",
                r"(?i)\bpreserv\w*\b.{0,70}\b(?:source|provenance|identity)\b",
                r"(?i)\bsubmitted business documents?\b",
            ]),
            implementation: patterns(&[
                r"(?i)\bintake\b",
                r"(?i)document",
                r"(?i)provenance",
                r"(?i)source",
            ]),
        },
        CapabilityClue {
            slug: "capabilities/review",
            title: "Uncertainty Review",
            domain: Some("domains/review"),
            prose: patterns(&[
                r"(?i)\broute\s+uncertain\b",
                r"(?i)\buncertain\s+(?:fields?|extraction results?)\b",
                r"(?i)\breviewer\s+before\s+(?:records?\s+are\s+)?published\b",
            ]),
            implementation: patterns(&[
                r"(?i)\breview\b",
                r"(?i)uncertain",
                r"(?i)reviewer",
                r"(?i)publish",
            ]),
        },
    ]
});

pub static GENERIC_NARRATIVE_CAPABILITY_CLUES: LazyLock<Vec<CapabilityClue>> =
    LazyLock::new(|| {
        vec![
            CapabilityClue {
                slug: "capabilities/request-client",
                title: "Request Client",
                domain: None,
                prose: patterns(&[
                    r"(?i)\b(?:promise[-\s]+based\s+)?(?:http|https)(?:/\d+(?:\.\d+)?)?\s+client\b",
                    r"(?i)\bclient\b.{0,80}\b(?:http|https)(?:/\d+(?:\.\d+)?)?\s+(?:requests?|responses?|apis?)\b",
                    r"(?i)\b(?:make|perform|issue|send)\s+(?:http|https)(?:/\d+(?:\.\d+)?)?\s+(?:requests?|calls?)\b",
                ]),
                implementation: patterns(&[
                    r"(?i)\b(?:client|request|response)s?\b",
                    r"(?i)\b(?:adapters?|dispatchers?|transports?|handlers?)\b",
                    r"(?i)\b(?:http|https|fetch|xhr)\b",
                ]),
            },
            CapabilityClue {
                slug: "capabilities/package-management",
                title: "Package Management",
                domain: None,
                prose: patterns(&[
                    r"(?i)\bpackage manager\b.{0,100}\b(?:keeps?|manages?|resolves?|installs?|publishes?|coordinates?|fast|efficient|strict|deterministic|for|that|which|using)\b",
                    r"(?i)\bdependency graph\b.{0,80}\b(?:consistent|resolv|manage|coordinate)",
                    r"(?i)\b(?:downloads?|manages?|resolves?|installs?|compiles?)\b.{0,80}\b(?:project|dependencies|packages?)\b",
                    r"(?i)\bmonorepos?\b.{0,80}\b(?:support|manage|work|build|coordinate)",
                ]),
                implementation: patterns(&[
                    r"(?i)package",
                    r"(?i)workspace",
                    r"(?i)dependenc",
                    r"(?i)lockfile",
                    r"(?i)install",
                ]),
            },
            CapabilityClue {
                slug: "capabilities/data-validation",
                title: "Data Validation",
                domain: None,
                prose: patterns(&[
                    r"(?i)\bdata validation\b.{0,80}\b(?:using|with|keeps?|rejects?|validat(?:es|ed|ing)?|ensur(?:es|e)|checks?)\b",
                    r"(?i)\bvalidat(?:e|es|ed|ing)\b.{0,80}\b(?:data|records?|models?|fields?)\b",
                ]),
                implementation: patterns(&[
                    r"(?i)valid",
                    r"(?i)schema",
                    r"(?i)model",
                    r"(?i)field",
                    r"(?i)parse",
                ]),
            },
            CapabilityClue {
                slug: "capabilities/web-framework",
                title: "Web Framework",
                domain: None,
                prose: patterns(&[
                    r"(?i)\bweb framework\b.{0,100}\b(?:routes?|serves?|handles?|builds?|provides?|supports?|for|that|which|node\.js)\b",
                    r"(?i)\bframework\b.{0,80}\b(?:routes?|serves?|handles?|builds?|for|that|which)\b.{0,40}\b(?:web|http|node\.js)\b",
                ]),
                implementation: patterns(&[
                    r"(?i)web",
                    r"(?i)http",
                    r"(?i)request",
                    r"(?i)response",
                    r"(?i)application",
                    r"(?i)route",
                    r"(?i)url",
                ]),
            },
            CapabilityClue {
                slug: "capabilities/build-tooling",
                title: "Build Tooling",
                domain: None,
                prose: patterns(&[
                    r"(?i)\b(?:web|javascript|typescript)\s+bundler\b",
                    r"(?i)\bbundler\s+project\b",
                    r"(?i)\bbundl(?:e|es|ed|ing)\b.{0,80}\b(?:web|javascript|typescript)\b",
                ]),
                implementation: patterns(&[r"(?i)\b(?:bundler|builder|compiler|linker)s?\b"]),
            },
        ]
    });
