//! The line merged work lands on. `read` runs one Git read in the repository and answers its
//! output when Git exits 0.

/// Tried after `origin/HEAD` names none.
pub(crate) const BASE_CANDIDATES: &[&str] = &["main", "master"];

/// Long-lived branches work is merged into, after the one `origin/HEAD` names: `main` or
/// `master`, or `develop` and its spellings where releases merge to `main` only now and then.
const INTEGRATION_CANDIDATES: &[&str] =
    &["main", "master", "develop", "development", "dev", "trunk"];

/// A branch and the reference it is measured at (`base_reference`).
pub(crate) struct BaseLine {
    pub branch: String,
    pub reference: String,
}

/// The base branch: the one `origin/HEAD` names, else `main`, else `master`, the first that exists.
pub(crate) fn base_line(read: &impl Fn(&[&str]) -> Option<String>) -> Option<BaseLine> {
    remote_default(read)
        .into_iter()
        .chain(BASE_CANDIDATES.iter().map(|name| name.to_string()))
        .find_map(|branch| {
            base_reference(read, &branch).map(|reference| BaseLine { branch, reference })
        })
}

/// The line the checked-out work merges into. A checkout on an integration branch reads that
/// branch; any other checkout reads the integration branch holding the most of its history,
/// the one with the fewest of HEAD's commits outside it, `origin/HEAD`'s first on a tie.
/// `Err` when a read failed, so a caller never mistakes a failed read for "no branch".
/// One `show-ref` finds every candidate, then one count per candidate when there are several.
pub(crate) fn merged_line(
    read: &impl Fn(&[&str]) -> Option<String>,
) -> Result<Option<BaseLine>, ()> {
    let mut names: Vec<String> = remote_default(read).into_iter().collect();
    for name in INTEGRATION_CANDIDATES {
        if !names.iter().any(|known| known == name) {
            names.push(name.to_string());
        }
    }
    let patterns: Vec<String> = names
        .iter()
        .flat_map(|name| {
            [
                format!("refs/heads/{name}"),
                format!("refs/remotes/origin/{name}"),
            ]
        })
        .collect();
    // `--head` always prints HEAD, so Git exits 0 and an empty answer means a failed read;
    // `show-ref` matches whole trailing components, so `dev/...` branches never list.
    let mut args = vec!["show-ref", "--head"];
    args.extend(patterns.iter().map(String::as_str));
    let listing = read(&args).ok_or(())?;
    let existing: Vec<&str> = listing
        .lines()
        .filter_map(|line| line.split_once(' ').map(|(_, name)| name.trim()))
        .collect();
    let exists = |reference: &str| existing.contains(&reference);
    let mut lines = Vec::new();
    for branch in names {
        let local = format!("refs/heads/{branch}");
        let remote = format!("refs/remotes/origin/{branch}");
        let local = exists(&local).then_some(local);
        let remote = exists(&remote).then_some(remote);
        if let Some(reference) = choose_reference(read, local, remote) {
            lines.push(BaseLine { branch, reference });
        }
    }
    let checked_out = read(&["symbolic-ref", "--quiet", "HEAD"])
        .and_then(|name| name.trim().strip_prefix("refs/heads/").map(str::to_string));
    if let Some(index) =
        checked_out.and_then(|branch| lines.iter().position(|line| line.branch == branch))
    {
        return Ok(lines.into_iter().nth(index));
    }
    if lines.len() <= 1 {
        return Ok(lines.pop());
    }
    let mut best: Option<(u64, BaseLine)> = None;
    for line in lines {
        let outside = read(&["rev-list", "--count", &format!("{}..HEAD", line.reference)])
            .and_then(|count| count.trim().parse::<u64>().ok())
            .ok_or(())?;
        if best.as_ref().is_none_or(|(fewest, _)| outside < *fewest) {
            best = Some((outside, line));
        }
    }
    Ok(best.map(|(_, line)| line))
}

/// The commit history is read from and the branch it is on: the tip of `merged_line`, so a
/// feature branch never reports its own unmerged commits as merged; HEAD, with no branch, when
/// the repository has no integration branch. `None` when that commit cannot be resolved.
pub(crate) fn merged_line_tip(
    read: &impl Fn(&[&str]) -> Option<String>,
) -> Option<(String, Option<String>)> {
    let (tip, branch) = match merged_line(read).ok()? {
        Some(line) => (format!("{}^{{commit}}", line.reference), Some(line.branch)),
        None => ("HEAD".to_string(), None),
    };
    let head = read(&["rev-parse", "--verify", &tip])?.trim().to_string();
    (!head.is_empty()).then_some((head, branch))
}

/// The reference the base branch is measured at (`choose_reference`).
pub(crate) fn base_reference(
    read: &impl Fn(&[&str]) -> Option<String>,
    branch: &str,
) -> Option<String> {
    let local = format!("refs/heads/{branch}");
    let remote = format!("refs/remotes/origin/{branch}");
    let exists = |reference: &str| {
        read(&["rev-parse", "--verify", "--quiet", reference])
            .is_some_and(|head| !head.trim().is_empty())
    };
    let local = exists(&local).then_some(local);
    let remote = exists(&remote).then_some(remote);
    choose_reference(read, local, remote)
}

/// Pull requests merge on the remote and the local branch is often left behind, so the fetched
/// `origin/<branch>` wins unless the local branch is strictly ahead of it. A local branch that
/// has gone its own way reads the remote only when it tracks it: a branch following another
/// remote (a fork's upstream) keeps its own line.
fn choose_reference(
    read: &impl Fn(&[&str]) -> Option<String>,
    local: Option<String>,
    remote: Option<String>,
) -> Option<String> {
    match (local, remote) {
        (Some(local), Some(remote)) => {
            let is_ancestor =
                |a: &str, b: &str| read(&["merge-base", "--is-ancestor", a, b]).is_some();
            if is_ancestor(&local, &remote) {
                return Some(remote);
            }
            if is_ancestor(&remote, &local) {
                return Some(local);
            }
            let branch = local.strip_prefix("refs/heads/").unwrap_or(&local);
            let upstream = format!("{branch}@{{upstream}}");
            let tracks_remote = read(&["rev-parse", "--symbolic-full-name", &upstream])
                .is_some_and(|name| name.trim() == remote);
            Some(if tracks_remote { remote } else { local })
        }
        (local, remote) => local.or(remote),
    }
}

fn remote_default(read: &impl Fn(&[&str]) -> Option<String>) -> Option<String> {
    read(&["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]).and_then(|name| {
        name.trim()
            .strip_prefix("refs/remotes/origin/")
            .map(str::to_string)
    })
}

#[cfg(test)]
mod tests;
