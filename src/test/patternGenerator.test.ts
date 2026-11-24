import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodeOwnerService } from "../codeOwnerService";

describe("CodeOwnerService - Pattern Generation", () => {
  const service = new CodeOwnerService();

  describe("generateIncludePatterns", () => {
    it("converts global wildcard '*' to '**/*'", () => {
      assert.deepEqual(service.generateIncludePatterns(["*"]), ["**/*"]);
    });

    it("does not double-prefix patterns that already start with '**/'", () => {
      assert.deepEqual(service.generateIncludePatterns(["**/*"]), ["**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["**/*.ts"]), ["**/*.ts"]);
    });

    it("converts root-anchored directory with trailing slash", () => {
      assert.deepEqual(service.generateIncludePatterns(["/src/"]), ["src/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["/deep/nested/dir/"]), ["deep/nested/dir/**/*"]);
    });

    it("converts relative directory with trailing slash", () => {
      assert.deepEqual(service.generateIncludePatterns(["src/"]), ["src/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["components/"]), ["components/**/*"]);
    });

    it("converts root slash '/' to '**/*'", () => {
      assert.deepEqual(service.generateIncludePatterns(["/"]), ["**/*"]);
    });

    it("converts file extension patterns", () => {
      assert.deepEqual(service.generateIncludePatterns(["*.ts"]), ["**/*.ts"]);
      assert.deepEqual(service.generateIncludePatterns(["*.test.tsx"]), ["**/*.test.tsx"]);
      assert.deepEqual(service.generateIncludePatterns(["*.d.ts"]), ["**/*.d.ts"]);
    });

    it("converts root-anchored files without trailing slash", () => {
      assert.deepEqual(service.generateIncludePatterns(["/src/index.ts"]), ["src/index.ts"]);
      assert.deepEqual(service.generateIncludePatterns(["/package.json"]), ["package.json"]);
      assert.deepEqual(service.generateIncludePatterns(["/.env"]), [".env"]);
    });

    it("converts relative files without leading slash", () => {
      assert.deepEqual(service.generateIncludePatterns(["src/index.ts"]), ["**/src/index.ts"]);
      assert.deepEqual(service.generateIncludePatterns(["Makefile"]), ["**/Makefile"]);
      assert.deepEqual(service.generateIncludePatterns([".gitignore"]), ["**/.gitignore"]);
    });

    it("handles wildcard glob patterns", () => {
      assert.deepEqual(service.generateIncludePatterns(["/apps/**/test"]), ["apps/**/test"]);
      assert.deepEqual(service.generateIncludePatterns(["/docs/*"]), ["docs/*"]);
      assert.deepEqual(service.generateIncludePatterns(["docs/*"]), ["**/docs/*"]);
    });

    it("handles empty arrays", () => {
      assert.deepEqual(service.generateIncludePatterns([]), []);
    });

    it("converts multiple mixed patterns in order", () => {
      const input = ["*", "/src/", "*.ts", "Makefile", "**/*.json"];
      const expected = ["**/*", "src/**/*", "**/*.ts", "**/Makefile", "**/*.json"];
      assert.deepEqual(service.generateIncludePatterns(input), expected);
    });

    it("converts root-anchored file extensions", () => {
      assert.deepEqual(service.generateIncludePatterns(["/*.ts"]), ["*.ts"]);
      assert.deepEqual(service.generateIncludePatterns(["/*.js"]), ["*.js"]);
      assert.deepEqual(service.generateIncludePatterns(["/*.json"]), ["*.json"]);
      assert.deepEqual(service.generateIncludePatterns(["/*.md"]), ["*.md"]);
    });

    it("normalizes leading './' as root-anchored patterns", () => {
      assert.deepEqual(service.generateIncludePatterns(["./src/"]), ["src/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["./package.json"]), ["package.json"]);
      assert.deepEqual(service.generateIncludePatterns(["./*.ts"]), ["*.ts"]);
      assert.deepEqual(service.generateIncludePatterns(["./build/logs/"]), ["build/logs/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["./Makefile"]), ["Makefile"]);
    });

    it("handles trailing and leading double-star wildcards", () => {
      assert.deepEqual(service.generateIncludePatterns(["/docs/**"]), ["docs/**"]);
      assert.deepEqual(service.generateIncludePatterns(["docs/**"]), ["**/docs/**"]);
      assert.deepEqual(service.generateIncludePatterns(["/src/**/*"]), ["src/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["src/**/*"]), ["**/src/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["/**/test"]), ["**/test"]);
      assert.deepEqual(service.generateIncludePatterns(["/**/test/"]), ["**/test/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["**/docs/**"]), ["**/docs/**"]);
    });

    it("preserves escaped spaces and characters", () => {
      assert.deepEqual(service.generateIncludePatterns(["/path\\ with\\ space/"]), ["path\\ with\\ space/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["hello\\ world.txt"]), ["**/hello\\ world.txt"]);
      assert.deepEqual(service.generateIncludePatterns(["/docs/my\\ file.md"]), ["docs/my\\ file.md"]);
      assert.deepEqual(service.generateIncludePatterns(["my\\ dir/file.ts"]), ["**/my\\ dir/file.ts"]);
      assert.deepEqual(service.generateIncludePatterns(["\\#file.txt"]), ["**/\\#file.txt"]);
      assert.deepEqual(service.generateIncludePatterns(["/\\#file.txt"]), ["\\#file.txt"]);
    });

    it("handles single-character '?' wildcards", () => {
      assert.deepEqual(service.generateIncludePatterns(["file?.txt"]), ["**/file?.txt"]);
      assert.deepEqual(service.generateIncludePatterns(["/src/file?.ts"]), ["src/file?.ts"]);
      assert.deepEqual(service.generateIncludePatterns(["?/*.js"]), ["**/?/*.js"]);
      assert.deepEqual(service.generateIncludePatterns(["/?/*.js"]), ["?/*.js"]);
    });

    it("handles bracket expressions and character ranges", () => {
      assert.deepEqual(service.generateIncludePatterns(["[0-9]*.txt"]), ["**/[0-9]*.txt"]);
      assert.deepEqual(service.generateIncludePatterns(["/[a-z]*.js"]), ["[a-z]*.js"]);
      assert.deepEqual(service.generateIncludePatterns(["/test/[0-9].ts"]), ["test/[0-9].ts"]);
    });

    it("collapses duplicate consecutive slashes", () => {
      assert.deepEqual(service.generateIncludePatterns(["//src/index.ts"]), ["src/index.ts"]);
      assert.deepEqual(service.generateIncludePatterns(["/src///"]), ["src/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["///package.json"]), ["package.json"]);
      assert.deepEqual(service.generateIncludePatterns(["//deep//nested//dir//"]), ["deep/nested/dir/**/*"]);
    });

    it("handles hidden directories and dotfiles", () => {
      assert.deepEqual(service.generateIncludePatterns(["/.github/workflows/"]), [".github/workflows/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["/.vscode/*.json"]), [".vscode/*.json"]);
      assert.deepEqual(service.generateIncludePatterns([".vscode/*.json"]), ["**/.vscode/*.json"]);
      assert.deepEqual(service.generateIncludePatterns(["/.env*"]), [".env*"]);
      assert.deepEqual(service.generateIncludePatterns([".env*"]), ["**/.env*"]);
    });

    it("handles relative middle double-star paths", () => {
      assert.deepEqual(service.generateIncludePatterns(["apps/**/test"]), ["**/apps/**/test"]);
      assert.deepEqual(service.generateIncludePatterns(["apps/**/test/*"]), ["**/apps/**/test/*"]);
    });

    it("filters out empty and whitespace-only entries", () => {
      assert.deepEqual(service.generateIncludePatterns(["", "   ", "/src/"]), ["src/**/*"]);
      assert.deepEqual(service.generateIncludePatterns(["   "]), []);
    });
  });

  describe("generateExcludePatterns", () => {
    it("mirrors include pattern conversion logic for exclude lists", () => {
      const input = ["*", "/src/", "*.ts", "/build/logs/"];
      const expected = ["**/*", "src/**/*", "**/*.ts", "build/logs/**/*"];
      assert.deepEqual(service.generateExcludePatterns(input), expected);
    });

    it("does not double-prefix patterns that already start with '**/'", () => {
      assert.deepEqual(service.generateExcludePatterns(["**/*"]), ["**/*"]);
      assert.deepEqual(service.generateExcludePatterns(["**/*.min.js"]), ["**/*.min.js"]);
    });

    it("handles empty exclude array", () => {
      assert.deepEqual(service.generateExcludePatterns([]), []);
    });

    it("converts root-anchored extensions for exclude patterns", () => {
      assert.deepEqual(service.generateExcludePatterns(["/*.ts"]), ["*.ts"]);
      assert.deepEqual(service.generateExcludePatterns(["/*.min.js"]), ["*.min.js"]);
    });

    it("normalizes leading './' in exclude patterns", () => {
      assert.deepEqual(service.generateExcludePatterns(["./temp/"]), ["temp/**/*"]);
      assert.deepEqual(service.generateExcludePatterns(["./secret.key"]), ["secret.key"]);
      assert.deepEqual(service.generateExcludePatterns(["./*.log"]), ["*.log"]);
    });

    it("handles double-star and wildcard exclude patterns", () => {
      assert.deepEqual(service.generateExcludePatterns(["/node_modules/**"]), ["node_modules/**"]);
      assert.deepEqual(service.generateExcludePatterns(["vendor/**"]), ["**/vendor/**"]);
      assert.deepEqual(service.generateExcludePatterns(["/**/cache"]), ["**/cache"]);
      assert.deepEqual(service.generateExcludePatterns(["/**/cache/"]), ["**/cache/**/*"]);
    });

    it("handles escaped spaces and characters in exclude patterns", () => {
      assert.deepEqual(service.generateExcludePatterns(["/backup\\ files/"]), ["backup\\ files/**/*"]);
      assert.deepEqual(service.generateExcludePatterns(["private\\ log.txt"]), ["**/private\\ log.txt"]);
      assert.deepEqual(service.generateExcludePatterns(["\\#temp.swp"]), ["**/\\#temp.swp"]);
    });

    it("handles single-character and bracket expressions in exclude patterns", () => {
      assert.deepEqual(service.generateExcludePatterns(["temp?.log"]), ["**/temp?.log"]);
      assert.deepEqual(service.generateExcludePatterns(["/[0-9]*.bak"]), ["[0-9]*.bak"]);
    });

    it("collapses duplicate slashes and cleans whitespace in exclude patterns", () => {
      assert.deepEqual(service.generateExcludePatterns(["//dist//bundle.js"]), ["dist/bundle.js"]);
      assert.deepEqual(service.generateExcludePatterns(["", "  ", "/out/"]), ["out/**/*"]);
    });
  });
});
