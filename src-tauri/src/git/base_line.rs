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
/// One `for-each-ref` finds every candidate, then one count per existing candidate.
pub(crate) fn merged_line(read: &impl Fn(&[&str]) -> Option<String>) -> Option<BaseLine> {
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
    let mut args = vec!["for-each-ref", "--format=%(refname)"];
    args.extend(patterns.iter().map(String::as_str));
    let existing = read(&args).unwrap_or_default();
    let exists = |reference: &str| existing.lines().any(|line| line.trim() == reference);
    let lines: Vec<BaseLine> = names
        .into_iter()
        .filter_map(|branch| {
            let local = format!("refs/heads/{branch}");
            let remote = format!("refs/remotes/origin/{branch}");
            choose_reference(
                read,
                exists(&local).then_some(local),
                exists(&remote).then_some(remote),
            )
            .map(|reference| BaseLine { branch, reference })
        })
        .collect();
    let checked_out =
        read(&["symbolic-ref", "--quiet", "--short", "HEAD"]).map(|name| name.trim().to_string());
    if let Some(index) =
        checked_out.and_then(|branch| lines.iter().position(|line| line.branch == branch))
    {
        return lines.into_iter().nth(index);
    }
    lines
        .into_iter()
        .enumerate()
        .filter_map(|(order, line)| {
            let outside = read(&["rev-list", "--count", &format!("{}..HEAD", line.reference)])?
                .trim()
                .parse::<u64>()
                .ok()?;
            Some((outside, order, line))
        })
        .min_by_key(|(outside, order, _)| (*outside, *order))
        .map(|(_, _, line)| line)
}

/// The commit history is read from and the branch it is on: the tip of `merged_line`, so a
/// feature branch never reports its own unmerged commits as merged; HEAD, with no branch, when
/// the repository has no integration branch. `None` when that commit cannot be resolved.
pub(crate) fn merged_line_tip(
    read: &impl Fn(&[&str]) -> Option<String>,
) -> Option<(String, Option<String>)> {
    let (tip, branch) = match merged_line(read) {
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
/// `origin/<branch>` wins unless the local branch is strictly ahead of it; a local branch that
/// has gone its own way still reads the remote, where merges land.
fn choose_reference(
    read: &impl Fn(&[&str]) -> Option<String>,
    local: Option<String>,
    remote: Option<String>,
) -> Option<String> {
    match (local, remote) {
        (Some(local), Some(remote)) => {
            let is_ancestor =
                |a: &str, b: &str| read(&["merge-base", "--is-ancestor", a, b]).is_some();
            let local_is_ahead = !is_ancestor(&local, &remote) && is_ancestor(&remote, &local);
            Some(if local_is_ahead { local } else { remote })
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
