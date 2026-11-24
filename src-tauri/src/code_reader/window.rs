/// At most this many lines per read.
pub(super) const WINDOW_MAX_LINES: u32 = 400;
/// At most this much text per read.
pub(super) const WINDOW_MAX_BYTES: usize = 64 * 1024;

pub(super) struct Window {
    pub lines: Vec<String>,
    pub first_line: u32,
    pub total_lines: u32,
    /// The first line, when even it passed the byte bound and is shown only up to it.
    pub cut_line: Option<u32>,
}

fn line_without_return(line: &str) -> &str {
    line.strip_suffix('\r').unwrap_or(line)
}

fn prefix_within(line: &str, budget: usize) -> &str {
    let mut end = budget.min(line.len());
    while !line.is_char_boundary(end) {
        end -= 1;
    }
    &line[..end]
}

/// Lines `first_line..` of `text`, one-based, bounded by line count and bytes. A first line past
/// the end returns no lines and the true total. O(text length).
pub(super) fn window_of(text: &str, first_line: u32, line_count: u32) -> Window {
    let body = text.strip_suffix('\n').unwrap_or(text);
    let first_line = first_line.max(1);
    let wanted = line_count.clamp(1, WINDOW_MAX_LINES) as usize;
    let mut lines = Vec::new();
    let mut used = 0usize;
    let mut cut = false;
    let mut cut_line = None;
    let mut total = 0u32;
    if !text.is_empty() {
        for (index, line) in body.split('\n').enumerate() {
            total = total.saturating_add(1);
            let number = u32::try_from(index).unwrap_or(u32::MAX).saturating_add(1);
            if number < first_line || cut || lines.len() >= wanted {
                continue;
            }
            let line = line_without_return(line);
            if used + line.len() > WINDOW_MAX_BYTES {
                if lines.is_empty() {
                    lines.push(prefix_within(line, WINDOW_MAX_BYTES).to_string());
                    cut_line = Some(number);
                }
                cut = true;
                continue;
            }
            used += line.len();
            lines.push(line.to_string());
        }
    }
    Window {
        lines,
        first_line,
        total_lines: total,
        cut_line,
    }
}
