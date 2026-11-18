//! Ranked lookup, and the check that every hit still describes the file on disk.

use crate::segment::match_expression;
use crate::stamps::{is_racy, sha256, Sha, Stamp};
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::Path;

/// One matching file. Hits carry no text; the caller reads the file to show matching lines.
#[derive(Clone, Debug, PartialEq)]
pub struct Hit {
    /// Relative to the vault root, `/`-separated.
    pub path: String,
    /// bm25 with the path words weighted four to one; lower is better.
    pub rank: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Found {
    pub hits: Vec<Hit>,
    /// Hits dropped because their file changed or vanished since it was indexed; a stamp pass is due.
    pub stale: usize,
}

/// Hits beyond the limit are fetched so that dropping stale ones still fills the page.
const STALE_ALLOWANCE: usize = 10;

struct Candidate {
    hit: Hit,
    stamp: Stamp,
    read_at_ns: i64,
    sha: Vec<u8>,
}

/// Top `limit` files for `query`, best first: each term must match, as a phrase of its tokens.
pub(crate) fn search(
    conn: &Connection,
    root: &Path,
    query: &str,
    limit: usize,
) -> rusqlite::Result<Found> {
    let Some(expression) = match_expression(query) else {
        return Ok(Found::default());
    };
    let mut statement = conn.prepare_cached(
        "SELECT f.path, t.rank, f.mtime_ns, f.size, f.ctime_ns, f.read_at_ns, f.sha256
           FROM (SELECT rowid, rank FROM terms WHERE terms MATCH ?1 ORDER BY rank LIMIT ?2) AS t
           JOIN files AS f ON f.id = t.rowid
          ORDER BY t.rank",
    )?;
    let fetch = i64::try_from(limit.saturating_add(STALE_ALLOWANCE)).unwrap_or(i64::MAX);
    let candidates = statement
        .query_map(params![expression, fetch], |row| {
            Ok(Candidate {
                hit: Hit {
                    path: row.get(0)?,
                    rank: row.get(1)?,
                },
                stamp: Stamp {
                    mtime_ns: row.get(2)?,
                    size: row.get(3)?,
                    ctime_ns: row.get(4)?,
                },
                read_at_ns: row.get(5)?,
                sha: row.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut found = Found::default();
    for candidate in candidates {
        if found.hits.len() == limit {
            break;
        }
        if still_describes_disk(root, &candidate) {
            found.hits.push(candidate.hit);
        } else {
            found.stale += 1;
        }
    }
    Ok(found)
}

/// A row is used only while its stamp equals the file's, and a racy one only while its hash does.
fn still_describes_disk(root: &Path, candidate: &Candidate) -> bool {
    let path = root.join(&candidate.hit.path);
    let Ok(metadata) = std::fs::metadata(&path) else {
        return false;
    };
    let stamp = Stamp::of(&metadata);
    if stamp != candidate.stamp {
        return false;
    }
    !is_racy(stamp.mtime_ns, candidate.read_at_ns)
        || file_sha(&path).is_some_and(|sha| sha.as_slice() == candidate.sha.as_slice())
}

pub(crate) fn file_sha(path: &Path) -> Option<Sha> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => return Some(sha256(hasher)),
            Ok(read) => hasher.update(&buffer[..read]),
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => return None,
        }
    }
}
