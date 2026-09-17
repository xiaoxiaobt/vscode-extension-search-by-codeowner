# GitHub profile enrichment implementation plan

## 1. Add the opt-in VS Code setting

- Add `searchByCodeOwner.fetchGitHubUserInfo` as a boolean setting with a default of `false`.
- Support user, workspace, and workspace-folder configuration.
- Explain that enabling it sends unauthenticated requests to GitHub and persistently caches public profile information.
- When disabled, do not fetch or display cached profile information.
- React to setting changes without requiring VS Code to restart.

## 2. Detect the repository using the current branch

- Find the Git repository containing the selected CODEOWNERS file.
- Read the current Git branch during initialization or manual refresh.
- Resolve that branch's configured upstream remote.
- Accept standard SSH and HTTPS remotes only when the hostname is exactly `github.com`.
- Silently stop enrichment for non-Git repositories, detached HEAD, missing upstreams/remotes, malformed remotes, GitHub Enterprise, and other hosting providers.
- Do not monitor branch changes.

## 3. Identify eligible personal owners

- Enrich only individual GitHub usernames such as `@exampleUser`.
- Never request teams, organizations, email owners, virtual owners, or malformed usernames.
- Normalize usernames for cache lookup while preserving their original spelling for display and filtering.

## 4. Add an unauthenticated GitHub profile client

- Request `GET https://api.github.com/users/{username}` without VS Code GitHub authentication or an authorization token.
- Include GitHub's recommended API headers and an extension user-agent.
- Extract the username, public name, public email, and avatar URL.
- Limit concurrency and stop issuing requests when rate-limited.
- Silence rate limits, network failures, invalid responses, and unexpected API failures.

## 5. Add persistent incremental caching

- Store the cache in extension-owned global storage without Settings Sync.
- Cache successful responses, including profiles with no public name or email.
- Store the avatar URL without downloading or displaying the image.
- Cache `404` results as terminal; do not cache transient failures.
- Fetch only usernames without terminal cache entries.
- Version the cache schema and rely on VS Code to remove extension-owned storage on uninstall.

## 6. Add local commit identity fallback

- Read local commit author names and emails from the relevant Git repository.
- Build an in-memory, normalized email-to-name mapping.
- If GitHub provides an email but no name, use an unambiguous local commit name associated with that email.
- Prefer GitHub's name, and do not persist the broader commit identity index.
- Ignore Git and history errors silently.

## 7. Integrate enrichment into extension activation

- Initialize enrichment only after the setting, CODEOWNERS file, and public-host checks pass.
- Show cached information immediately and fetch missing owners asynchronously.
- Refresh the webview as newly fetched names become available.
- Re-run enrichment during the existing manual refresh operation.

## 8. Send structured owner information to the webview

- Preserve the original owner identifier as the ownership/search value.
- Attach the GitHub username and available display name separately.
- Keep presentation changes isolated from file ownership matching.

## 9. Update active-file owner badges

- Display `@exampleUser (Jerry Jackson)` when a name is available.
- Display only the owner identifier when no name is available.
- Preserve click behavior and do not display avatars.

## 10. Update the owner dropdown

- Show an individual owner on the first line and their real name on the second line when available.
- Preserve the existing two-line team presentation.
- Match searches against username and real name while selecting the original owner identifier.
- Maintain truncation, selection, and accessibility behavior.

## 11. Add automated verification

- Test current-branch/upstream detection and supported GitHub remote forms.
- Test detached HEAD, missing upstream, GitHub Enterprise, and non-GitHub remotes.
- Test owner classification and ensure teams are never queried.
- Verify that requests never include authorization.
- Test successful, empty, missing, transient, rate-limited, cached, and incremental cases.
- Test unambiguous and ambiguous local email-to-name matching.
- Test owner display formatting and name filtering where practical.
- Run TypeScript compilation and ESLint.

## 12. Update documentation

- Document the default-off setting and privacy behavior.
- Explain the unauthenticated request, cached fields, current-branch upstream requirement, and commit fallback.
- Note that avatar URLs are cached for possible future use but are not displayed.
- Add the feature to the changelog.

## Implementation structure

Keep the public-profile provider boundary small and host-aware so another public host, such as GitLab.com, can be added later without changing the cache, enrichment orchestration, or UI model. Avoid a broad provider/plugin framework until a second host actually requires it.
