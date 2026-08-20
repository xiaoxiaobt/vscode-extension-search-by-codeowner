# Experimental multi-root `.code-workspace` support

## Problem

The extension treats `vscode.workspace.workspaceFolders` as independent roots. In a recursive multi-root workspace (parent `.` plus nested folders, often renamed and hidden via `files.exclude`), that breaks two things:

- **Ownership lookup** uses the innermost folder, so `/repo/123/foo.ts` becomes `foo.ts` instead of `123/foo.ts` and misses CODEOWNERS rules.
- **Search globs** are emitted relative to the repo (`123/**/*.ts`). Native search then looks for a nested `123/` inside the renamed root, or hits `files.exclude` on the parent root. The correct glob uses the folder **name** and the **longest matching path**.

Opening a folder that merely *contains* a `*.code-workspace` file must not trigger this. Detection is `vscode.workspace.workspaceFile` (file/remote URI), not disk presence.

## When the feature runs

All of the following must be true:

1. Setting `codeOwner.experimental.multiRootWorkspace` is `true` (default `false`).
2. The user actually opened a workspace file: `workspace.workspaceFile` exists and scheme is `file` or `vscode-remote` (not `untitled`).
3. Path-rewrite **evidence**:
   - two or more workspace folders, **or**
   - a single folder whose `path` is not the workspace-file directory (for example `./subFolder` or `123`).

If any check fails, keep the current single-root behavior.

**Not evidence:** a single folder `{ "name": "✨ root", "path": "." }`. VS Code Search only treats `./FolderName/` as a root prefix when there are multiple folders (`folderResources.length > 1`). With one folder, globs are already relative to that folder’s URI. Prefixing the display name would look for a nested directory with that name and miss files. A custom `name` on `.` is explorer-only in the single-folder case.

**Project root:** directory of the workspace file. CODEOWNERS and `.gitignore` are found there first (same location list as today). File ownership uses a path relative to that directory.

VS Code already applies `files.exclude`. This extension does not copy those keys into search excludes. In the canonical example, `files.exclude` is why nested roots exist (hide duplicates under `.`), not extra patterns we emit.

## Glob rewrite

After existing `generateIncludePatterns` / `generateExcludePatterns` (and gitignore excludes), map each **path-scoped** glob onto the longest workspace folder whose `path` (relative to the workspace file) is a prefix of that glob.

- **2+ folders:** VS Code Search only binds a segment to a workspace root if it starts with `./` (see `parseSearchPaths` in VS Code). Emit `./FolderName/remainder`, where `FolderName` is `WorkspaceFolder.name` (JSON `name` if set). A bare `FolderName/remainder` is treated as a glob *inside* every root and will not match.
- **1 shifted folder** (`path` is `./subFolder`, not `.`): search is already rooted at that directory. Strip the disk-path prefix and **do not** add the display name. `subFolder/src/*.ts` → `src/*.ts`.

Unscoped globs (`*`, `*.ts`, `**/*`, `**/*.ts`, and other `**/…` patterns that do not start with a nested folder path) stay unprefixed so every root is searched.

A leading `**/` is ignored only when matching a **nested** folder path (so gitignore `/123/dist` → `**/123/dist` still rewrites to `./new name for 123/dist` when there are 2+ folders). A leading `**/` must not be assigned to the `.` root.

## Canonical example

This is a **recursive multi-root** workspace: the real repo is added as `.`, and selected subdirectories are added again as their own roots. Native Search `filesToInclude` / `filesToExclude` are matched against **folder names**, not disk paths. Some entries rename the folder; some do not.

```json
{
  "folders": [
    { "name": "new name for 123", "path": "123" },
    { "name": "new name for 456", "path": "456" },
    { "name": "789", "path": "789" },
    { "name": "✨ root", "path": "." }
  ],
  "settings": {
    "files.exclude": {
      "123": true,
      "456": true,
      "789": true
    }
  }
}
```

What each field means:

- `path` is the real directory on disk, relative to the `.code-workspace` file. CODEOWNERS patterns still use these paths (`123/...`, `789/...`, `docs/...`).
- `name` is what VS Code Search uses as the multi-root prefix. It is optional in general; here it is always set.
  - **Renamed:** `123` → `new name for 123`; `456` → `new name for 456`; `.` → `✨ root`.
  - **Not renamed:** `789` → `789` (`name` equals `path`). The glob still must be scoped to that workspace folder (`789/...`), not to `✨ root/789/...`.
- `files.exclude` hides `123`, `456`, and `789` **inside the `.` folder** so they do not appear twice in the explorer. Search under `✨ root` will not see those trees. A glob like `✨ root/123/*.ts` is therefore wrong even though `123` is a child of `.` on disk. The dedicated root is the only searchable copy.
- **Most detailed path:** when a glob sits under both `.` and a nested folder, pick the nested folder (longest `path` prefix). `123/foo.ts` matches folder `123`, not `.`.

Name map used by the rewriter (longest path first):

- disk `123/` → search prefix `new name for 123`
- disk `456/` → search prefix `new name for 456`
- disk `789/` → search prefix `789`
- disk `.` (everything else that is path-scoped) → search prefix `✨ root`

Rewrite of CODEOWNERS-derived globs (after today's `generateIncludePatterns` / `generateExcludePatterns`) against this workspace:

- `123/*.ts` → `./new name for 123/*.ts` (renamed nested root; do not use `✨ root/123/*.ts`)
- `456/src/**` → `./new name for 456/src/**` (renamed; strip the `456/` path prefix, keep the rest)
- `789/src/**` → `./789/src/**` (not renamed, but still the nested folder, not `./✨ root/789/src/**`)
- `123` or `123/` (whole tree, after expansion often `123/**/*`) → `./new name for 123/**/*`
- `docs/*.md` → `./✨ root/docs/*.md` (no nested root for `docs`; only `.` matches; `docs` is not excluded)
- `**/*.ts` or `*.ts` → leave as `**/*.ts` / `*.ts` (unscoped: all four roots; do not pin to `✨ root` or excluded children are missed)

Same rewrite applies to exclude globs and to path-scoped `.gitignore` patterns (for example `/123/dist` → `./new name for 123/dist`).

## Single-folder workspace file

CODEOWNERS is still resolved from the workspace-file directory when the setting is on and evidence exists.

**Shifted path (valid evidence)** — search is rooted at `subFolder`, so repo-relative globs that still include `subFolder/` would look one level too deep:

```json
{
  "folders": [{ "path": "./subFolder" }]
}
```

- `subFolder/src/*.ts` → `src/*.ts` (strip path; do not prefix a name)
- `{ "name": "new name for 123", "path": "123" }` → same stripping: `123/*.ts` → `*.ts`. The display name is **not** used.

**Rename only, path `.` (not evidence)** — no rewrite:

```json
{
  "folders": [{ "name": "✨ root", "path": "." }]
}
```

- `docs/*.md` stays `docs/*.md`. `✨ root/docs/*.md` would miss.

## Out of scope

- Untitled (unsaved) workspaces.
- Treating a `*.code-workspace` file on disk as “in a workspace.”
- Duplicating `files.exclude` into search excludes.
- Nested CODEOWNERS files inside named sub-roots.
