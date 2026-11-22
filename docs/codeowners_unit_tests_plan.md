# CODEOWNERS Include/Exclude Pattern Unit Tests & Edge Cases Implementation Plan

## Goal Description
The `CodeOwnerService` (`src/codeOwnerService.ts:L449-L503`) converts CODEOWNERS rules into VS Code search `files to include` and `files to exclude` patterns. This allows developers to search files owned by specific teams, unowned files, or all owned files.

Currently, this component lacks unit tests, and research into the pattern generation logic uncovered multiple critical edge cases and bugs (such as `*` global wildcards not being overridden by subsequent rules, exact-match rule overwrites deleting excludes, lines without owners being dropped during parsing, and double-prefixing glob patterns like `**/*` into `**/**/*`).

Following GitHub's official CODEOWNERS specification, this plan:
1. Sets up a fast, lightweight unit test runner using Node.js built-in `node:test` and `node:assert/strict` with a mock for VS Code.
2. Builds comprehensive unit tests covering pattern conversion, multiple owners, rule overwrites/precedence, unowned files, and parser edge cases.
3. Fixes any issues and fragile edge cases in `src/codeOwnerService.ts` so all tests pass cleanly.

---

## GitHub Rules & Edge Cases Alignment

1. **Unowned Lines**:
   In GitHub CODEOWNERS, a pattern on its own with no owners marks that path as explicitly unowned:
   ```text
   # Nobody owns docs/
   /docs/
   ```
   `parseCodeOwnersContent` will parse lines with 1 token as unowned rules (`owners: []`).

2. **Comments & Inline Comments**:
   In GitHub CODEOWNERS, `#` starts a comment. Any line starting with `#` is ignored, and inline comments (e.g. `/src/ @alice # comment`) ignore `#` and subsequent tokens on the line so `@mentions` in comments are never parsed as owners.

3. **Rule Precedence ("Last Match Wins")**:
   If multiple rules match a path, the last matching rule takes precedence. When querying a specific owner's include/exclude patterns:
   - Specific paths (directories or files) override broader patterns (`*`, extensions, parent directories).
   - Global `*` is overridden by any subsequent rule not owned by the same owner.
   - Exact-pattern overwrites (e.g. `/src/ @alice` then `/src/ @bob`) shadow earlier rules; `@alice` must not retain ownership of `/src/`.

4. **Glob Patterns in VS Code Search**:
   - `*` -> `**/*`
   - `/src/` -> `src/**/*`
   - `src/` -> `src/**/*`
   - `*.ts` -> `**/*.ts`
   - `**/*` or `**/*.ts` must NOT become `**/**/*` or `**/**/*.ts` (prevent duplicate `**/` prefix).

---

## Proposed Changes

```
src/
├── codeOwnerService.ts           # [MODIFY] Fix override detection, exact match shadowing, glob prefixing, unowned parsing
└── test/
    ├── mocks/
    │   └── vscode.ts             # [NEW] Minimal mock for VS Code workspace & Uri APIs
    ├── patternGenerator.test.ts  # [NEW] Tests for generateIncludePatterns and generateExcludePatterns
    └── codeOwnerService.test.ts  # [NEW] Comprehensive tests for rule resolution, multiple owners, overwrites, edge cases
package.json                      # [MODIFY] Add "test" script
```

---

### Step 1: Build Test Harness & Mocks
- Create `src/test/mocks/vscode.ts`:
  - `workspace.fs.stat`, `workspace.workspaceFolders`, `workspace.openTextDocument`, `workspace.getWorkspaceFolder`, `workspace.getConfiguration`
  - `Uri.file(path)`
- Add test script to `package.json`:
  - `"test": "NODE_PATH=out/test/mocks node --test out/test/**/*.test.js"`

---

### Step 2: Build Comprehensive Unit Tests
1. **`src/test/patternGenerator.test.ts`**:
   - Wildcards: `*`, `**/*`, `**/*.ts`
   - Directories: `/src/`, `src/`, `/`, deep nested paths
   - File extensions: `*.ts`, `*.test.tsx`, `*.d.ts`
   - Files: `/src/index.ts`, `src/index.ts`, `/.env`, `.gitignore`
   - Glob paths: `/apps/**/test`, `docs/*`, `/docs/*`
   - Edge cases: empty array `[]`, duplicates

2. **`src/test/codeOwnerService.test.ts`**:
   - Multiple owners on one line (`* @alice @bob @org/team user@example.com`)
   - Precedence & overwrites:
     - Exact match overwrite (`/src/ @alice` then `/src/ @bob`)
     - Global wildcard override (`* @all` then `/src/ @alice`)
     - Subdirectory overrides parent directory (`/src/ @alice` then `/src/components/ @bob`)
     - File overrides extension / directory (`*.ts @alice` then `/src/index.ts @bob`)
     - Disjoint paths (no false overrides)
     - Prefix collision safety (`/app/` vs `/app-config/`)
     - Same owner retention across multiple rules (no self-exclusions)
     - Multi-level cascading overrides
   - Unowned rules & special queries (`Unowned`, `Owned by all`)
   - Parser edge cases: inline comments, indented comments, CRLF, multi-space/tab delimiters, unowned single-token lines

---

### Step 3: Run Tests & Fix Discovered Issues
1. Run `pnpm test` to observe any failures in the newly built tests.
2. Update `src/codeOwnerService.ts`:
   - Fix `generateIncludePatterns` and `generateExcludePatterns` to prevent duplicate `**/`.
   - Fix `wouldOverride` to properly handle `*` earlier patterns and path boundaries.
   - Fix `getPatternsForSpecificOwner` to properly handle exact-pattern overwrites.
   - Fix `parseCodeOwnersContent` to support single-token unowned lines and inline comments.
   - Expose `parseCodeOwnersContent` as public (or `parseCodeOwners`) for clean testing.
3. Re-run `pnpm test` and `pnpm run lint` until 100% tests pass.
