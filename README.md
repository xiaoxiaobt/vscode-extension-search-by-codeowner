# Search by Code Owner

A VSCode extension that allows you to search for files by code owner with native VSCode search. The extension extracts code owners from CODEOWNERS file. According to your selected code owner, the extension will generate filters in native search panel for you for better search experience.

![Search by Code Owner](./media/screenshot.gif)

## Public GitHub profile information

The optional `searchByCodeOwner.fetchGitHubUserInfo` setting displays a public
name next to an individual GitHub code owner. It is off by default and can be
configured at user, workspace, or workspace-folder scope.

When enabled, the extension:

- checks the remote configured for the repository's current branch, falling
  back to `origin`, and continues only when its hostname is exactly `github.com`;
- sends unauthenticated requests to GitHub's public user API without using your
  VS Code GitHub login or an authentication token;
- queries individual users only, never organizations or teams;
- stores the returned username, public name, public email, and avatar URL in
  extension-owned local storage, including successful profiles with no public
  name or email;
- reads local Git commit identities to fill in a missing name when the public
  email has one unambiguous matching commit name; and
- silently skips enrichment when Git, the network, or the API is unavailable or
  rate-limited.

Only the avatar URL is cached; avatar images are not downloaded or displayed.
Cached profile information is not shown while the setting is disabled. VS Code
removes the extension-owned storage when the extension is uninstalled.

## License

MIT License - see `LICENSE` file for details
