# Changelog

What's new in Search by Code Owner.

## Unreleased

- Add an opt-in setting to show public GitHub names beside individual code owners
- Cache unauthenticated public profile results incrementally in extension storage
- Use unambiguous local commit identities when GitHub exposes an email but no name
- Restrict profile requests to the current branch's remote, or `origin` for a
  local branch, when it points to public GitHub

## 0.1.2 — 2026-07-09

- Fix bug where button focus outline was not visible
- Add changelog to the extension

## 0.1.1 — 2026-02-16

- Bitbucket repositories are now supported

## 0.1.0 — 2025-12-29

- Fix the extension icon in the VS Code Marketplace

## 0.0.9 — 2025-12-29

- GitHub teams now show as separate org and team names in the owner list
- Clearer labels for "Unowned" and "Owned by all" files
- New extension icon and refreshed search panel layout

## 0.0.8 — 2025-12-27

- First release
- Add screenshot

## 0.0.7 — 2025-11-02 (Pre-release)

- Add extension icon

## 0.0.6 — 2025-09-28 (Pre-release)

- Faster search when filtering by code owner

## 0.0.4 — 2025-09-24 (Pre-release)

- Fix the size of the git-ignore toggle switch

## 0.0.3 — 2025-09-22 (Pre-release)

- Fix cases where CODEOWNERS data failed to load
- Fix the "hide gitignored files" toggle not working

## 0.0.2 — 2025-09-22 (Pre-release)

- Press Enter to pick an owner from the dropdown or start a search
- Gitignored files are excluded from search results by default

## 0.0.1 — 2025-08-17 (Pre-release)

- First pre-release
- Search files by code owner using your project's CODEOWNERS file (GitHub, GitLab, and Gitea)
- Filters are applied through VS Code's built-in search
- Refresh command to reload CODEOWNERS after changes
