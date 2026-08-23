# Issue Tracker: GitHub

Use GitHub Issues for work that will not be completed immediately, needs discussion or reproduction evidence, or spans multiple implementation slices. Small, well-defined changes may proceed directly from a branch to a pull request without creating an issue.

Do not create an issue merely because a branch exists. When an issue already exists, link the pull request to it.

## Commands

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Apply or remove a label: `gh issue edit <number> --add-label "..."` or `gh issue edit <number> --remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

Run `gh` inside this clone so it resolves the repository from the configured Git remote.

When an engineering skill says to publish work to the issue tracker, create a GitHub issue. When it says to fetch a ticket, read the referenced issue and its comments.
