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
  });
});
