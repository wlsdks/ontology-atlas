//! Background workers and schedulers: a function that starts a ticker, a timer loop, a thread, a
//! file watcher or a scheduled job, named by its owner type or itself. A timer in a component
//! file, a thread that only plumbs a child process's pipes, a clock repaint, test code and a
//! `main` are not workers.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::enclosing_declarations::{brace_delta, enclosing_declarations};
use crate::js_pattern::{js_regex, js_trim_end};
use crate::operator_language::OperatorLanguage;

static GO_WORKER: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"\btime\.(?:NewTicker|Tick|AfterFunc)\(|\bcron\.New\(|\bgocron\.|\.Every\(\s*\d|\bfsnotify\.NewWatcher\(",
    )
});
static PYTHON_WORKER: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"\bthreading\.(?:Thread|Timer)\(|\b(?:asyncio\.create_task|loop\.call_later|loop\.call_at)\(|^\s*@(?:\w+\.)?(?:task|periodic_task|shared_task)\b|\bschedule\.every\(|\b(?:Background|AsyncIO|Blocking)Scheduler\(|\.add_job\(|\bmultiprocessing\.Process\(|\bObserver\(\)",
    )
});
static SCRIPT_WORKER: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"\bsetInterval\(|\bcron\.schedule\(|\bnew\s+CronJob\(|\bschedule\.scheduleJob\(|\bnew\s+Worker\(|\bchokidar\.watch\(|\bfs\.watch\(",
    )
});
static RUST_WORKER: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"\btokio::time::interval\(|\binterval\(\s*Duration::|\bthread::spawn\(|\.watcher\(\)|\bnotify::recommended_watcher\(|\bnew_debouncer\(",
    )
});
/// A test function by its name in Go, Python and scripts; Rust tests are found by attribute and
/// module.
static TEST_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(?:test|Test|bench|Benchmark)"));
static RUST_TEST_MODULE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*#\[cfg\(test\)\]"));
static ITEM_OR_BLANK: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?:#\[|//|$)"));
static MODULE_HEAD: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+\w+\s*\{"));
static CONSTANT_NUMBER: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\bconst[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*(\d[\d_]*)[ \t]*;?$"));
static CLOCK_READ: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\b(?:Date\.now|performance\.now)\(\)|\bnew Date\(\)"));
static SET_INTERVAL: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bsetInterval\("));
static TIMER_PERIOD: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r",\s*([A-Za-z_$][\w$]*|\d[\d_]*)\)\s*;?$"));
static WHOLE_NUMBER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\d[\d_]*$"));
/// What a thread beside a child process's pipes reads, writes or waits on. Each word is followed
/// by a character that is not part of a name.
static PIPE_WORK: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"\b(?:read_to_end|read_to_string|read_line|read_bounded_line|read_pipe|lines\(\)|BufReader::new|write_all|wait\(\)|stdin|stdout|stderr)(?:[^A-Za-z0-9_]|$)",
    )
});
static THREAD_SPAWN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bthread::spawn\("));
static COMMENT_LINE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?://|#)"));
static DECORATOR_LINE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*@"));
static DEF_AFTER_DECORATOR: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s*(?:async\s+)?def\s+(\w+)"));
static COMPONENT_FILE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\.[jt]sx$"));
static TESTS_FOLDER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?:^|/)tests/"));

/// A timer at a second or faster beside a clock read is a screen repainting a time, not work.
const REPAINT_MS: f64 = 1000.0;

fn pattern_of(language: OperatorLanguage) -> &'static Regex {
    match language {
        OperatorLanguage::Go => &GO_WORKER,
        OperatorLanguage::Python => &PYTHON_WORKER,
        OperatorLanguage::Script => &SCRIPT_WORKER,
        OperatorLanguage::Rust => &RUST_WORKER,
    }
}

/// The lines of a Rust file inside a `#[cfg(test)] mod`, in one pass that carries the module's
/// brace depth.
fn rust_test_lines(lines: &[String]) -> Vec<bool> {
    let mut inside = vec![false; lines.len()];
    // A `#[cfg(test)]` waiting for the item it marks, and the depth a test module opened at.
    let mut pending = false;
    let mut floor: Option<i64> = None;
    let mut depth: i64 = 0;
    for (index, line) in lines.iter().enumerate() {
        if floor.is_none() {
            if RUST_TEST_MODULE.is_match(line) {
                pending = true;
            } else if pending && !ITEM_OR_BLANK.is_match(line) {
                pending = false;
                if MODULE_HEAD.is_match(line) {
                    floor = Some(depth);
                }
            }
        }
        depth = (depth + brace_delta(line, false)).max(0);
        if let Some(opened) = floor {
            if let Some(slot) = inside.get_mut(index) {
                *slot = true;
            }
            if depth <= opened {
                floor = None;
            }
        }
    }
    inside
}

/// Each number a file declares as a constant (`const TICK_MS = 30_000;`), the first declaration
/// of a name winning.
fn declared_numbers(lines: &[String]) -> HashMap<String, f64> {
    let mut numbers = HashMap::new();
    for line in lines {
        if !line.contains("const") {
            continue;
        }
        if let Some(declared) = CONSTANT_NUMBER.captures(js_trim_end(line)) {
            if let (Some(name), Some(value)) = (declared.get(1), declared.get(2)) {
                let digits: String = value.as_str().chars().filter(|c| *c != '_').collect();
                if let Ok(number) = digits.parse::<f64>() {
                    numbers.entry(name.as_str().to_string()).or_insert(number);
                }
            }
        }
    }
    numbers
}

/// A script `setInterval` that keeps a shown time current: its own line reads the clock, or it
/// ticks at a second or faster beside a clock read. A fast timer that calls work is a poller.
fn repaint_timer(
    numbers: &mut Option<HashMap<String, f64>>,
    lines: &[String],
    index: usize,
) -> bool {
    let Some(line) = lines.get(index) else {
        return false;
    };
    if !SET_INTERVAL.is_match(line) {
        return false;
    }
    if CLOCK_READ.is_match(line) {
        return true;
    }
    let from = index.saturating_sub(3);
    let near = lines
        .get(from..(index + 6).min(lines.len()))
        .unwrap_or_default();
    if !near.iter().any(|near_line| CLOCK_READ.is_match(near_line)) {
        return false;
    }
    for cursor in index..lines.len().min(index + 16) {
        let Some(text) = lines.get(cursor) else { break };
        let Some(every) = TIMER_PERIOD
            .captures(js_trim_end(text))
            .and_then(|found| found.get(1))
        else {
            continue;
        };
        let word = every.as_str();
        let milliseconds = if WHOLE_NUMBER.is_match(word) {
            let digits: String = word.chars().filter(|c| *c != '_').collect();
            digits.parse::<f64>().ok()
        } else {
            numbers
                .get_or_insert_with(|| declared_numbers(lines))
                .get(word)
                .copied()
        };
        return milliseconds.is_some_and(|ms| ms <= REPAINT_MS);
    }
    false
}

/// A Rust thread that reads, writes or waits on a child process's pipes is plumbing for that
/// call, not a worker.
fn pipe_thread(lines: &[String], index: usize) -> bool {
    let Some(line) = lines.get(index) else {
        return false;
    };
    if !THREAD_SPAWN.is_match(line) {
        return false;
    }
    let window = lines
        .get(index..(index + 8).min(lines.len()))
        .unwrap_or_default()
        .join("\n");
    PIPE_WORK.is_match(&window)
}

fn base_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// The worker rows of one file: the first function of each owner that starts one.
pub fn worker_rows(
    path: &str,
    text: &str,
    lines: &[String],
    language: OperatorLanguage,
) -> Vec<AbilityRow> {
    let pattern = pattern_of(language);
    // A Python decorator (`^\s*@task`) is read at the start of a line, so the whole text is asked
    // by line starts, not only by its first.
    let anywhere = if language == OperatorLanguage::Python {
        lines.iter().any(|line| pattern.is_match(line))
    } else {
        pattern.is_match(text)
    };
    if !anywhere {
        return Vec::new();
    }
    if language == OperatorLanguage::Rust
        && (base_name(path) == "tests.rs" || TESTS_FOLDER.is_match(path))
    {
        return Vec::new();
    }
    // A timer in a component file runs while that screen is shown: the screen's behaviour, not a
    // background worker.
    if language == OperatorLanguage::Script && COMPONENT_FILE.is_match(path) {
        return Vec::new();
    }
    let test_lines = (language == OperatorLanguage::Rust).then(|| rust_test_lines(lines));
    let around = enclosing_declarations(lines, language);
    let mut numbers: Option<HashMap<String, f64>> = None;
    let mut rows = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for (index, line) in lines.iter().enumerate() {
        if !pattern.is_match(line)
            || COMMENT_LINE.is_match(line)
            || test_lines
                .as_ref()
                .and_then(|inside| inside.get(index))
                .copied()
                .unwrap_or(false)
        {
            continue;
        }
        if (language == OperatorLanguage::Script && repaint_timer(&mut numbers, lines, index))
            || (language == OperatorLanguage::Rust && pipe_thread(lines, index))
        {
            continue;
        }
        let mut owner: Option<(Option<String>, String, bool)> = around
            .at(index)
            .map(|(_, held)| (held.owner.clone(), held.name.clone(), held.test));
        if language == OperatorLanguage::Python && DECORATOR_LINE.is_match(line) {
            let function = lines
                .get(index + 1..(index + 6).min(lines.len()))
                .unwrap_or_default()
                .iter()
                .find_map(|next| DEF_AFTER_DECORATOR.captures(next))
                .and_then(|found| found.get(1))
                .map(|name| name.as_str().to_string());
            if let Some(name) = function {
                owner = Some((None, name, false));
            }
        }
        let Some((class, name, test)) = owner else {
            continue;
        };
        if name == "main" || TEST_NAME.is_match(&name) || test {
            continue;
        }
        let row_name = class.clone().unwrap_or_else(|| name.clone());
        if !seen.insert(row_name.clone()) {
            continue;
        }
        let symbol = match &class {
            Some(class) => format!("{class}.{name}"),
            None => name.clone(),
        };
        rows.push(
            AbilityRow::at(AbilityKind::Worker, &row_name, path, index + 1).with_symbol(&symbol),
        );
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_lines::bounded_lines;

    fn rows(path: &str, text: &str, language: OperatorLanguage) -> Vec<(String, usize, String)> {
        let lines = bounded_lines(text);
        worker_rows(path, &lines.join("\n"), &lines, language)
            .into_iter()
            .map(|row| (row.name, row.line, row.symbol.unwrap_or_default()))
            .collect()
    }

    #[test]
    fn a_ticker_is_a_worker_named_for_its_receiver_and_a_test_or_main_is_not() {
        let found = rows(
            "pulse/ticker.go",
            "func (p *Pulse) Start() {\n\tt := time.NewTicker(time.Second)\n}\nfunc TestPulse() {\n\ttime.NewTicker(1)\n}\nfunc main() {\n\ttime.AfterFunc(1, f)\n}\n",
            OperatorLanguage::Go,
        );
        assert_eq!(found, [("Pulse".to_string(), 2, "Pulse.Start".to_string())]);
    }

    #[test]
    fn a_rust_thread_that_only_reads_a_pipe_and_a_test_module_thread_are_not_workers() {
        let found = rows(
            "src/run.rs",
            "fn capture() {\n    thread::spawn(move || {\n        stdout.read_to_end(&mut buf);\n    });\n}\nfn serve() {\n    thread::spawn(move || {\n        loop_forever();\n    });\n}\n#[cfg(test)]\nmod tests {\n    fn t() {\n        thread::spawn(|| {});\n    }\n}\n",
            OperatorLanguage::Rust,
        );
        assert_eq!(found, [("serve".to_string(), 7, "serve".to_string())]);
    }

    #[test]
    fn a_timer_that_repaints_a_clock_is_not_a_worker_and_a_poller_is() {
        let found = rows(
            "src/poll.ts",
            "const TICK_MS = 500;\nfunction clock() {\n  setInterval(() => show(Date.now()), TICK_MS);\n}\nfunction poll() {\n  setInterval(check, 30000);\n}\n",
            OperatorLanguage::Script,
        );
        assert_eq!(found, [("poll".to_string(), 6, "poll".to_string())]);
    }

    #[test]
    fn a_celery_task_below_the_first_line_is_a_worker() {
        let found = rows(
            "jobs/tasks.py",
            "import celery\n\n\n@shared_task\ndef send_digest():\n    pass\n",
            OperatorLanguage::Python,
        );
        assert_eq!(
            found,
            [("send_digest".to_string(), 4, "send_digest".to_string())]
        );
    }
}
