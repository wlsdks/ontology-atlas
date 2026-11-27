//! The line merged work lands on, read the same way by Changes and Work status. `read` runs one
//! Git read in the repository and answers its output when Git exits 0.

/// Tried after `origin/HEAD` names none.
pub(crate) const BASE_CANDIDATES: &[&str] = &["main", "master"];

/// The base branch and the reference it is measured at (`base_reference`).
pub(crate) struct BaseLine {
    pub branch: String,
    pub reference: String,
}

/// The base branch: the one `origin/HEAD` names, else `main`, else `master`, the first that exists.
pub(crate) fn base_line(read: &impl Fn(&[&str]) -> Option<String>) -> Option<BaseLine> {
    let from_remote =
        read(&["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]).and_then(|name| {
            name.trim()
                .strip_prefix("refs/remotes/origin/")
                .map(str::to_string)
        });
    from_remote
        .into_iter()
        .chain(BASE_CANDIDATES.iter().map(|name| name.to_string()))
        .find_map(|branch| {
            base_reference(read, &branch).map(|reference| BaseLine { branch, reference })
        })
}

/// The reference the base branch is measured at. Pull requests merge on the remote and the
/// local branch is often left behind, so a fetched `origin/<branch>` that contains the local one
/// wins; a local branch holding commits the remote lacks stays the base.
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
    match (exists(&local), exists(&remote)) {
        (true, true) => {
            let local_is_behind = read(&["merge-base", "--is-ancestor", &local, &remote]).is_some();
            Some(if local_is_behind { remote } else { local })
        }
        (true, false) => Some(local),
        (false, true) => Some(remote),
        (false, false) => None,
    }
}
