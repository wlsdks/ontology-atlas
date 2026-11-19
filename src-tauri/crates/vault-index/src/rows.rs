//! `rows.sqlite`: per file and per producer, the value a program computed from one Markdown file,
//! so a reopen reads and derives only the files that changed. The crate never interprets a value;
//! it stores the producer's JSON beside the stamp of the file version it came from and hands it
//! back only while that stamp still matches the disk.
//!
//! A row is written only for a file version the stamp pass saw (`get` hands out that stamp as a
//! token), which is still on disk when the row is written, and which was modified more than two
//! seconds before it was seen. So a row never pairs a value with a later version of its file, and
//! the racy-stamp rule never has to fall back to a hash: a row whose file is modified within two
//! seconds of the row's `read_at_ns` is not used at all.

use crate::lifecycle::{
    create_index_dir, delete_locked, deletions, is_damage, lock_writer, open_store_reader,
    open_store_writer, set_aside_file, write_meta, Store, META_LAST_USED_MS, ROWS_FILE,
};
use crate::stamps::{is_racy, now_ns};
use crate::{canonical_vault_root, index_dir, stat_all, Error, Result, Stamp};
use miniz_oxide::deflate::compress_to_vec;
use miniz_oxide::inflate::decompress_to_vec_with_limit;
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::io;
use std::path::Path;

/// Table layout of `rows.sqlite`; a change means the file is discarded and rebuilt.
const ROWS_SCHEMA_VERSION: i32 = 1;

pub(crate) const ROWS: Store = Store {
    file: ROWS_FILE,
    schema: include_str!("../sql/rows.sql"),
    version: ROWS_SCHEMA_VERSION,
};

/// A producer's values are JSON, which compresses about four to one; stored uncompressed they took
/// as many bytes as the vault's own text.
const COMPRESSION_LEVEL: u8 = 6;
/// Far above any derived value; a stored value that inflates past it is treated as damaged.
const VALUE_MAX_BYTES: usize = 64 * 1024 * 1024;

/// A namespace names a producer and its version, `<producer>/<version>`.
const NAMESPACE_MAX_BYTES: usize = 128;

fn invalid(message: &str) -> Error {
    Error::Io(io::Error::new(io::ErrorKind::InvalidData, message))
}

/// The producer part of a namespace, after checking the namespace is one.
fn producer_of(namespace: &str) -> Result<&str> {
    let allowed = |byte: u8| byte.is_ascii_alphanumeric() || b"-_.+/".contains(&byte);
    match namespace.split_once('/') {
        Some((producer, version))
            if !producer.is_empty()
                && !version.is_empty()
                && namespace.len() <= NAMESPACE_MAX_BYTES
                && namespace.bytes().all(allowed) =>
        {
            Ok(producer)
        }
        _ => Err(invalid("a rows namespace is <producer>/<version>")),
    }
}

/// The file version a value is computed from, and when the stamp pass saw it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Seen {
    stamp: Stamp,
    at_ns: i64,
    /// How many index deletions this process had made when the version was seen; a `put` after a
    /// later Delete or switch-off writes nothing.
    deletions: i64,
}

impl Seen {
    fn token(self) -> String {
        format!(
            "{}:{}:{}:{}:{}",
            self.stamp.mtime_ns, self.stamp.size, self.stamp.ctime_ns, self.at_ns, self.deletions
        )
    }

    fn parse(token: &str) -> Option<Seen> {
        let mut parts = token.split(':').map(|part| part.parse::<i64>().ok());
        let seen = Seen {
            stamp: Stamp {
                mtime_ns: parts.next()??,
                size: parts.next()??,
                ctime_ns: parts.next()??,
            },
            at_ns: parts.next()??,
            deletions: parts.next()??,
        };
        parts.next().is_none().then_some(seen)
    }
}

fn unix_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_millis())
        .unwrap_or(0)
}

/// Milliseconds as the app's file reads report them: whole milliseconds since 1970, rounded down.
fn whole_ms(ns: i64) -> i64 {
    ns.div_euclid(1_000_000)
}

/// A stored value is the producer's JSON object on one line; anything else is never handed back.
fn is_value(value: &[u8]) -> bool {
    value.first() == Some(&b'{') && value.last() == Some(&b'}') && !value.contains(&b'\n')
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Counts {
    /// Rows the namespace holds.
    pub stored: u64,
    /// Requested paths that had a row, valid or not.
    pub found: u64,
    /// Rows of the same producer under another version, which a `put` removes.
    pub other_versions: u64,
}

/// What `lookup` found for one requested path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Found {
    /// The stored value; its file still has the stamp it was computed from.
    Hit(String),
    /// The token a `put` needs, or `""` for a file that is gone or that the index does not admit.
    Miss(String),
}

/// Receives each path's answer in order; `get` writes JSON, `lookup` collects them.
trait Answers {
    fn hit(&mut self, index: usize, value: &[u8]);
    fn miss(&mut self, index: usize, token: &str);
}

#[derive(Default)]
struct Json {
    hits: Vec<u8>,
    misses: String,
}

impl Answers for Json {
    fn hit(&mut self, index: usize, value: &[u8]) {
        if !self.hits.is_empty() {
            self.hits.push(b',');
        }
        self.hits.extend_from_slice(format!("[{index},").as_bytes());
        self.hits.extend_from_slice(value);
        self.hits.push(b']');
    }

    /// Tokens are digits, `:` and `-`, so they need no JSON escaping.
    fn miss(&mut self, index: usize, token: &str) {
        if !self.misses.is_empty() {
            self.misses.push(',');
        }
        self.misses.push_str(&format!("[{index},\"{token}\"]"));
    }
}

impl Answers for Vec<Found> {
    fn hit(&mut self, _index: usize, value: &[u8]) {
        self.push(Found::Hit(String::from_utf8_lossy(value).into_owned()));
    }

    fn miss(&mut self, _index: usize, token: &str) {
        self.push(Found::Miss(token.to_string()));
    }
}

/// `get`'s answer as values, one per requested path, for callers inside Rust.
pub fn lookup(root: &Path, namespace: &str, paths: &[String]) -> Result<(Vec<Found>, Counts)> {
    let mut found = Vec::with_capacity(paths.len());
    let counts = look_up(root, namespace, paths, &mut found, Vec::clear)?;
    Ok((found, counts))
}

/// Looks up every path in `paths` (relative, `/`-separated, as the caller's folder walk listed
/// them) and answers with JSON:
/// `{"hits":[[i,<value>],…],"misses":[[i,"<token>"],…],"stored":n,"found":n,"otherVersions":n}`.
/// `i` indexes `paths`. A hit's value is used as it was stored; a miss carries the token `put`
/// needs, or `""` for a file that is gone or that the index does not admit. A missing, older,
/// newer or damaged file answers every path as a miss and is never created here.
pub fn get(root: &Path, namespace: &str, paths: &[String]) -> Result<Vec<u8>> {
    let mut json = Json::default();
    let counts = look_up(root, namespace, paths, &mut json, |json| {
        *json = Json::default();
    })?;
    let mut out = Vec::with_capacity(json.hits.len() + json.misses.len() + 96);
    out.extend_from_slice(b"{\"hits\":[");
    out.extend_from_slice(&json.hits);
    out.extend_from_slice(b"],\"misses\":[");
    out.extend_from_slice(json.misses.as_bytes());
    out.extend_from_slice(
        format!(
            "],\"stored\":{},\"found\":{},\"otherVersions\":{}}}",
            counts.stored, counts.found, counts.other_versions
        )
        .as_bytes(),
    );
    Ok(out)
}

/// The stamp pass and row comparison behind `get` and `lookup`. A file found damaged while being
/// read is answered as if it were missing; `restart` empties what was answered before that.
fn look_up<A: Answers>(
    root: &Path,
    namespace: &str,
    paths: &[String],
    answers: &mut A,
    restart: fn(&mut A),
) -> Result<Counts> {
    let root = canonical_vault_root(root)?;
    producer_of(namespace)?;
    let seen_at = now_ns();
    let deletions = deletions(&index_dir(&root)?);
    let stamps = stat_all(&root, paths);
    let conn = match open_store_reader(&index_dir(&root)?, &ROWS) {
        Ok(conn) => conn,
        Err(error) if is_damage(&error) => None,
        Err(error) => return Err(error.into()),
    };
    if let Some(conn) = &conn {
        match answer(
            Some(conn),
            namespace,
            paths,
            &stamps,
            (seen_at, deletions),
            answers,
        ) {
            Err(error) if is_damage(&error) => restart(answers),
            answered => return Ok(answered?),
        }
    }
    Ok(answer(
        None,
        namespace,
        paths,
        &stamps,
        (seen_at, deletions),
        answers,
    )?)
}

fn answer<A: Answers>(
    conn: Option<&Connection>,
    namespace: &str,
    paths: &[String],
    stamps: &[Option<Stamp>],
    (seen_at, deletions): (i64, i64),
    answers: &mut A,
) -> rusqlite::Result<Counts> {
    let mut counts = Counts::default();
    let mut lookup = match conn {
        Some(conn) => Some(conn.prepare(
            "SELECT mtime_ns, size, ctime_ns, read_at_ns, value FROM rows WHERE namespace = ?1 AND path = ?2",
        )?),
        None => None,
    };
    for (index, (path, stamp)) in paths.iter().zip(stamps).enumerate() {
        // A stamp its volume does not vouch for (FAT, exFAT, a network share, another volume
        // mounted inside the vault) could hide a same-size rewrite whose modified time was put
        // back, so that file gets no row.
        let Some(stamp) = stamp.filter(Stamp::is_vouched) else {
            answers.miss(index, "");
            continue;
        };
        if let Some(statement) = lookup.as_mut() {
            let mut rows = statement.query(params![namespace, path])?;
            if let Some(row) = rows.next()? {
                counts.found += 1;
                let stored = Stamp {
                    mtime_ns: row.get(0)?,
                    size: row.get(1)?,
                    ctime_ns: row.get(2)?,
                };
                let read_at_ns: i64 = row.get(3)?;
                if stored == stamp && !is_racy(stamp.mtime_ns, read_at_ns) {
                    let packed = row.get_ref(4)?.as_bytes()?;
                    if let Ok(value) = decompress_to_vec_with_limit(packed, VALUE_MAX_BYTES) {
                        if is_value(&value) {
                            answers.hit(index, &value);
                            continue;
                        }
                    }
                }
            }
        }
        let seen = Seen {
            stamp,
            at_ns: seen_at,
            deletions,
        };
        answers.miss(index, &seen.token());
    }
    if let Some(conn) = conn {
        counts.stored = count_namespace(conn, namespace)?;
        counts.other_versions = count_other_versions(conn, namespace)?;
    }
    Ok(counts)
}

fn count_namespace(conn: &Connection, namespace: &str) -> rusqlite::Result<u64> {
    let total: i64 = conn.query_row(
        "SELECT count(*) FROM rows WHERE namespace = ?1",
        [namespace],
        |row| row.get(0),
    )?;
    Ok(u64::try_from(total).unwrap_or(0))
}

/// `<producer>/` up to, not including, `<producer>0`: the key range of every version of one
/// producer, which the primary key answers without a scan.
fn producer_range(namespace: &str) -> Option<(String, String)> {
    let (producer, _) = namespace.split_once('/')?;
    Some((format!("{producer}/"), format!("{producer}0")))
}

fn count_other_versions(conn: &Connection, namespace: &str) -> rusqlite::Result<u64> {
    let Some((from, to)) = producer_range(namespace) else {
        return Ok(0);
    };
    let total: i64 = conn.query_row(
        "SELECT count(*) FROM rows WHERE namespace >= ?1 AND namespace < ?2 AND namespace != ?3",
        params![from, to, namespace],
        |row| row.get(0),
    )?;
    Ok(u64::try_from(total).unwrap_or(0))
}

/// One value to keep: the path and token `get` answered, the modified time the producer read the
/// file at, and the producer's JSON object on one line.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NewRow {
    pub path: String,
    pub token: String,
    pub last_modified_ms: i64,
    pub value: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PutReport {
    pub written: usize,
    /// Rows refused because their file changed, was too new to trust, or the row was malformed.
    pub skipped: usize,
    /// Rows of other versions of the producer, and of files not in `retain`.
    pub removed: usize,
}

/// Whether `row` describes the file version now on disk, seen long enough after its last write.
fn trusted(row: &NewRow, seen: Seen, now: Option<Stamp>) -> bool {
    now == Some(seen.stamp)
        && seen.stamp.is_vouched()
        && !is_racy(seen.stamp.mtime_ns, seen.at_ns)
        && row.last_modified_ms == whole_ms(seen.stamp.mtime_ns)
        && is_value(row.value.as_bytes())
}

/// Writes `rows` in one transaction, after checking each against the disk again, and removes
/// the producer's rows of every other version. With `retain` (every Markdown path of a complete
/// walk) it also removes the namespace's rows of files no longer listed. Creates the index folder
/// and file when needed; an older, newer or damaged file is replaced.
pub fn put(
    root: &Path,
    namespace: &str,
    rows: &[NewRow],
    retain: Option<&[String]>,
) -> Result<PutReport> {
    let root = canonical_vault_root(root)?;
    producer_of(namespace)?;
    let paths: Vec<String> = rows.iter().map(|row| row.path.clone()).collect();
    let now = stat_all(&root, &paths);
    let accepted: Vec<(&NewRow, Seen)> = rows
        .iter()
        .zip(now)
        .filter_map(|(row, now)| {
            let seen = Seen::parse(&row.token)?;
            trusted(row, seen, now).then_some((row, seen))
        })
        .collect();
    let mut report = PutReport {
        skipped: rows.len() - accepted.len(),
        ..PutReport::default()
    };
    if accepted.is_empty() && retain.is_none() {
        return Ok(report);
    }
    // Every version was seen by one lookup; a Delete or switch-off since then refuses the batch.
    let dir = index_dir(&root)?;
    let current = deletions(&dir);
    let seen_before_a_delete =
        |accepted: &[(&NewRow, Seen)]| accepted.iter().any(|(_, seen)| seen.deletions != current);
    let refused = PutReport {
        skipped: rows.len(),
        ..PutReport::default()
    };
    if seen_before_a_delete(&accepted) {
        return Ok(refused);
    }
    create_index_dir(&dir)?;
    // The writer lock the search build and Delete take, so a batch is never between a delete's
    // file removals; a folder deleted while this waited is not recreated.
    let lock = match lock_writer(&dir) {
        Ok(lock) => lock,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(refused),
        Err(error) => return Err(error.into()),
    };
    if deletions(&dir) != current {
        // A delete ran between the check above and the lock, and this put made the folder again:
        // leave it as the delete left it.
        delete_locked(&dir, lock)?;
        return Ok(refused);
    }
    let vault_path = root.to_string_lossy();
    let written = match write(&dir, &vault_path, namespace, &accepted, retain) {
        Err(Error::Sql(error)) if is_damage(&error) => {
            set_aside_file(&dir, ROWS_FILE)?;
            write(&dir, &vault_path, namespace, &accepted, retain)?
        }
        written => written?,
    };
    drop(lock);
    report.written = written.0;
    report.removed = written.1;
    Ok(report)
}

fn write(
    dir: &Path,
    vault_path: &str,
    namespace: &str,
    accepted: &[(&NewRow, Seen)],
    retain: Option<&[String]>,
) -> Result<(usize, usize)> {
    let (mut conn, _) = open_store_writer(dir, &ROWS, vault_path)?;
    let tx = conn.transaction()?;
    let mut removed = 0;
    if let Some((from, to)) = producer_range(namespace) {
        removed += tx.execute(
            "DELETE FROM rows WHERE namespace >= ?1 AND namespace < ?2 AND namespace != ?3",
            params![from, to, namespace],
        )?;
    }
    if let Some(retain) = retain {
        let keep: HashSet<&str> = retain.iter().map(String::as_str).collect();
        let listed: Vec<String> = {
            let mut statement = tx.prepare("SELECT path FROM rows WHERE namespace = ?1")?;
            let paths = statement
                .query_map([namespace], |row| row.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            paths
        };
        let mut delete =
            tx.prepare_cached("DELETE FROM rows WHERE namespace = ?1 AND path = ?2")?;
        for path in listed.iter().filter(|path| !keep.contains(path.as_str())) {
            removed += delete.execute(params![namespace, path])?;
        }
    }
    {
        let mut upsert = tx.prepare_cached(
            "INSERT INTO rows(namespace, path, mtime_ns, size, ctime_ns, read_at_ns, value) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT(namespace, path) DO UPDATE SET mtime_ns = excluded.mtime_ns, \
             size = excluded.size, ctime_ns = excluded.ctime_ns, \
             read_at_ns = excluded.read_at_ns, value = excluded.value",
        )?;
        for (row, seen) in accepted {
            upsert.execute(params![
                namespace,
                row.path,
                seen.stamp.mtime_ns,
                seen.stamp.size,
                seen.stamp.ctime_ns,
                seen.at_ns,
                compress_to_vec(row.value.as_bytes(), COMPRESSION_LEVEL)
            ])?;
        }
    }
    // A folder whose vault is not opened for two weeks is swept on this, as on the search file's.
    write_meta(&tx, META_LAST_USED_MS, &unix_ms().to_string())?;
    tx.commit()?;
    Ok((accepted.len(), removed))
}

/// `rows.sqlite` and its WAL files, in bytes; 0 when the vault has none.
pub fn rows_bytes(root: &Path) -> Result<u64> {
    let dir = index_dir(&canonical_vault_root(root).unwrap_or_else(|_| root.to_path_buf()))?;
    Ok(["", "-wal", "-shm"]
        .iter()
        .filter_map(|suffix| std::fs::metadata(dir.join(format!("{ROWS_FILE}{suffix}"))).ok())
        .map(|meta| meta.len())
        .sum())
}

/// A `get` as one UTF-8 body: the vault root, the namespace, then one path per line.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GetRequest {
    pub root: String,
    pub namespace: String,
    pub paths: Vec<String>,
}

impl GetRequest {
    pub fn decode(body: &[u8]) -> Result<GetRequest> {
        let text = std::str::from_utf8(body).map_err(|_| invalid("a rows request is UTF-8"))?;
        let mut lines = text.split('\n');
        let root = lines.next().unwrap_or_default().to_string();
        let namespace = lines
            .next()
            .ok_or_else(|| invalid("a rows request names its namespace"))?
            .to_string();
        Ok(GetRequest {
            root,
            namespace,
            paths: lines.map(str::to_string).collect(),
        })
    }
}

/// A `put` as one UTF-8 body: the vault root, the namespace, the count of retained paths (or `-`
/// for none) and those paths, then four lines per row: path, token, modified time in
/// milliseconds, value. A value is JSON, which never holds a raw line break.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PutRequest {
    pub root: String,
    pub namespace: String,
    pub retain: Option<Vec<String>>,
    pub rows: Vec<NewRow>,
}

impl PutRequest {
    pub fn decode(body: &[u8]) -> Result<PutRequest> {
        let text = std::str::from_utf8(body).map_err(|_| invalid("a rows request is UTF-8"))?;
        let mut lines = text.split('\n');
        let mut next = |what: &str| {
            lines
                .next()
                .map(str::to_string)
                .ok_or_else(|| invalid(what))
        };
        let root = next("a rows request names its vault")?;
        let namespace = next("a rows request names its namespace")?;
        let retained = next("a rows put says what it retains")?;
        let retain = match retained.as_str() {
            "-" => None,
            count => {
                let count: usize = count
                    .parse()
                    .map_err(|_| invalid("a rows put's retain count is a number"))?;
                Some(
                    (0..count)
                        .map(|_| next("a rows put lists every retained path"))
                        .collect::<Result<Vec<_>>>()?,
                )
            }
        };
        let mut rows = Vec::new();
        while let Ok(path) = next("") {
            let token = next("a row has a token")?;
            let last_modified_ms = next("a row has a modified time")?
                .parse()
                .map_err(|_| invalid("a row's modified time is a number"))?;
            let value = next("a row has a value")?;
            rows.push(NewRow {
                path,
                token,
                last_modified_ms,
                value,
            });
        }
        Ok(PutRequest {
            root,
            namespace,
            retain,
            rows,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_token_round_trips_and_nothing_else_parses() {
        let seen = Seen {
            stamp: Stamp {
                mtime_ns: 1_795_081_842_640_123_456,
                size: 2048,
                ctime_ns: -5,
            },
            at_ns: 1_795_081_900_000_000_000,
            deletions: 2,
        };
        assert_eq!(Seen::parse(&seen.token()), Some(seen));
        for broken in ["", "1:2:3:4", "1:2:3:4:5:6", "a:2:3:4:5", "1:2:3:4:"] {
            assert_eq!(Seen::parse(broken), None, "{broken}");
        }
    }

    #[test]
    fn a_namespace_is_a_producer_and_a_version() {
        assert_eq!(producer_of("app-entry/3+2.3.0").unwrap(), "app-entry");
        for refused in ["", "app-entry", "/1", "app-entry/", "app entry/1", "a/1\n"] {
            assert!(producer_of(refused).is_err(), "{refused:?}");
        }
    }

    #[test]
    fn a_put_body_decodes_retained_paths_and_rows() {
        let body = "/vault\napp-entry/1\n2\na.md\nb.md\na.md\n1:2:3:4\n5\n{\"x\":1}";
        let request = PutRequest::decode(body.as_bytes()).unwrap();
        assert_eq!(request.retain, Some(vec!["a.md".into(), "b.md".into()]));
        assert_eq!(
            request.rows,
            vec![NewRow {
                path: "a.md".into(),
                token: "1:2:3:4".into(),
                last_modified_ms: 5,
                value: "{\"x\":1}".into(),
            }]
        );
        assert!(PutRequest::decode(b"/vault\napp-entry/1\n-\na.md\n1:2:3:4").is_err());
        assert_eq!(
            GetRequest::decode(b"/vault\napp-entry/1").unwrap().paths,
            Vec::<String>::new()
        );
    }

    #[test]
    fn whole_milliseconds_round_down_like_the_app_reads() {
        assert_eq!(whole_ms(1_795_081_842_640_999_999), 1_795_081_842_640);
        assert_eq!(whole_ms(-1), -1);
    }
}
