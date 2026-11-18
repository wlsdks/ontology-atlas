#![allow(dead_code)]

pub mod walk;

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Once;
use vault_index::{canonical_vault_root, index_dir, Searcher};

/// Every test in this binary shares one index root; each vault gets its own folder under it.
pub fn setup() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let root = std::env::temp_dir().join(format!("vault-index-tests-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::env::set_var(vault_index::INDEX_DIR_OVERRIDE_ENV, &root);
    });
}

pub struct TempVault {
    pub root: PathBuf,
}

impl TempVault {
    pub fn new(name: &str) -> TempVault {
        setup();
        let dir = std::env::temp_dir().join(format!("vault-index-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        TempVault {
            root: canonical_vault_root(&dir).unwrap(),
        }
    }

    pub fn at(dir: PathBuf) -> TempVault {
        setup();
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        TempVault {
            root: canonical_vault_root(&dir).unwrap(),
        }
    }

    pub fn files(&self) -> Vec<String> {
        walk::markdown_files(&self.root)
    }

    pub fn index_file(&self) -> PathBuf {
        index_dir(&self.root).unwrap().join("search.sqlite")
    }
}

impl Drop for TempVault {
    fn drop(&mut self) {
        let _ = vault_index::delete(Some(&self.root));
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

const EN: &[&str] = &[
    "vault",
    "graph",
    "meaning",
    "evidence",
    "review",
    "relation",
    "boundary",
    "capability",
    "agent",
    "session",
    "index",
    "render",
    "canvas",
    "release",
    "frontmatter",
    "markdown",
    "snapshot",
    "search",
    "tokenizer",
    "latency",
    "freshness",
    "watcher",
    "cache",
    "schema",
];
const KO: &[&str] = &[
    "지도",
    "문서",
    "검색",
    "관계",
    "근거",
    "경계",
    "기능",
    "요소",
    "영역",
    "세션",
    "색인",
    "분석",
    "온톨로지",
    "마크다운",
    "프런트매터",
    "에이전트",
    "스냅샷",
    "캔버스",
    "일관성",
    "감시자",
];
const JOSA: &[&str] = &[
    "", "은", "는", "이", "가", "을", "를", "의", "에", "에서", "으로", "와", "도",
];
const MIX: &[&str] = &[
    "MCP서버",
    "vault폴더",
    "Git기록",
    "SQLite색인",
    "Tauri앱",
    "slug이름",
];

pub struct Lcg(u64);

impl Lcg {
    pub fn new(seed: u64) -> Lcg {
        Lcg(seed)
    }
    pub fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    pub fn pick<'a>(&mut self, list: &[&'a str]) -> &'a str {
        list[(self.next() as usize) % list.len()]
    }
}

/// One generated page: a third English, a third Korean with particles attached, a third mixed,
/// with rare terms (one inside a compound) on a few pages.
pub fn page_text(i: usize, rng: &mut Lcg) -> String {
    let mut words = Vec::new();
    for _ in 0..(40 + rng.next() % 60) {
        let word = match (i % 3, rng.next() % 10) {
            (0, _) => rng.pick(EN).to_string(),
            (1, 0) => format!("{}{}{}", rng.pick(KO), rng.pick(KO), rng.pick(JOSA)),
            (1, _) | (2, 6..=9) => format!("{}{}", rng.pick(KO), rng.pick(JOSA)),
            (2, 0..=3) => rng.pick(EN).to_string(),
            _ => format!("{}{}", rng.pick(MIX), rng.pick(JOSA)),
        };
        words.push(word);
    }
    let rare = match i % 97 {
        0 => " 지식그래프엔진의 결과를 남긴다.",
        1 => " The zettelkasten note links here.",
        2 => " 양자얽힘을 다시 확인한다.",
        _ => "",
    };
    format!(
        "---\ntitle: Page {i}\ntags: [t{}]\n---\n\n# Page {i}\n\n{}.{rare}\n",
        i % 7,
        words.join(" ")
    )
}

pub fn write_corpus(root: &Path, count: usize, seed: u64) -> Vec<String> {
    let mut rng = Lcg::new(seed);
    for folder in ["wiki", "notes"] {
        std::fs::create_dir_all(root.join(folder)).unwrap();
    }
    (0..count)
        .map(|i| {
            let relative = format!("{}/page-{i}.md", if i % 2 == 0 { "wiki" } else { "notes" });
            std::fs::write(root.join(&relative), page_text(i, &mut rng)).unwrap();
            relative
        })
        .collect()
}

fn is_hangul(c: char) -> bool {
    matches!(c as u32, 0xAC00..=0xD7A3)
}

/// What a reader expects: a Hangul term anywhere as a substring, because particles attach to
/// nouns; any other term as a whole word. Every term of a query must match.
pub fn truth(root: &Path, files: &[String], query: &str) -> BTreeSet<String> {
    let terms: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
    files
        .iter()
        .filter(|file| {
            let text = std::fs::read_to_string(root.join(file))
                .unwrap_or_default()
                .to_lowercase();
            terms.iter().all(|term| term_matches(&text, term))
        })
        .cloned()
        .collect()
}

fn term_matches(text: &str, term: &str) -> bool {
    if term.chars().any(is_hangul) {
        return mixed_term_matches(text, term);
    }
    whole_word(text, term)
}

/// `mcp서버`: the ASCII part must start a word and the Hangul part may run on.
fn mixed_term_matches(text: &str, term: &str) -> bool {
    let starts_ascii = term
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphanumeric());
    let mut from = 0;
    while let Some(at) = text[from..].find(term) {
        let start = from + at;
        let left_ok = !starts_ascii || !text[..start].chars().next_back().is_some_and(joins_a_word);
        if left_ok {
            return true;
        }
        from = start + term.len();
    }
    false
}

/// A neighbour that continues a word; Hangul next to a Latin word starts a new one.
fn joins_a_word(c: char) -> bool {
    c.is_alphanumeric() && !is_hangul(c)
}

fn whole_word(text: &str, word: &str) -> bool {
    let mut from = 0;
    while let Some(at) = text[from..].find(word) {
        let start = from + at;
        let end = start + word.len();
        let left = text[..start].chars().next_back().is_some_and(joins_a_word);
        let right = text[end..].chars().next().is_some_and(joins_a_word);
        if !left && !right {
            return true;
        }
        from = end;
    }
    false
}

pub fn found(root: &Path, query: &str) -> BTreeSet<String> {
    let searcher = Searcher::open(root).unwrap().expect("an index exists");
    searcher
        .search(query, 100_000)
        .unwrap()
        .hits
        .into_iter()
        .map(|hit| hit.path)
        .collect()
}

pub const PROBE_QUERIES: &[&str] = &[
    "지도",
    "온톨로지",
    "vault",
    "MCP서버",
    "SQLite 색인",
    "그래프엔진",
];

/// The index passes SQLite's checks, every row's stamp equals its file's, every listed file has a
/// row, and searches return exactly what the files contain.
pub fn assert_consistent(vault: &TempVault, files: &[String]) {
    let conn = rusqlite::Connection::open(vault.index_file()).unwrap();
    let verdict: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(verdict, "ok");
    conn.execute("INSERT INTO terms(terms) VALUES ('integrity-check')", [])
        .unwrap();
    let mut statement = conn
        .prepare("SELECT path, mtime_ns, size FROM files")
        .unwrap();
    let rows: Vec<(String, i64, i64)> = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(rows.len(), files.len(), "one row per file");
    for (path, mtime_ns, size) in rows {
        let stamp = vault_index::Stamp::of(&std::fs::metadata(vault.root.join(&path)).unwrap());
        assert_eq!((stamp.mtime_ns, stamp.size), (mtime_ns, size), "{path}");
    }
    for query in PROBE_QUERIES {
        assert_eq!(
            found(&vault.root, query),
            truth(&vault.root, files, query),
            "{query}"
        );
    }
}
