import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodeOwnerService } from "../codeOwnerService";

describe("CodeOwnerService - End-to-End Search Pattern Resolution", () => {
  describe("Multiple Owners", () => {
    it("parses and generates search patterns for multiple owners on a single line", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        * @alice @bob @org/backend-team dev@company.com
      `);

      const owners = service.getAllOwners();
      assert.deepEqual(owners, ["@alice", "@bob", "@org/backend-team", "dev@company.com"]);

      for (const owner of owners) {
        const patterns = service.getFilePatternsForOwner(owner);
        assert.deepEqual(patterns.includePatterns, ["*"]);
        assert.deepEqual(patterns.excludePatterns, []);

        const vscodeIncludes = service.generateIncludePatterns(patterns.includePatterns);
        assert.deepEqual(vscodeIncludes, ["**/*"]);
      }
    });

    it("handles multiple owners with mixed paths and extensions", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice @bob
        *.ts @alice @charlie
        /docs/ @bob dev@company.com
      `);

      const alicePatterns = service.getFilePatternsForOwner("@alice");
      assert.deepEqual(alicePatterns.includePatterns.sort(), ["*.ts", "/src/"].sort());

      const bobPatterns = service.getFilePatternsForOwner("@bob");
      assert.deepEqual(bobPatterns.includePatterns.sort(), ["/docs/", "/src/"].sort());

      const charliePatterns = service.getFilePatternsForOwner("@charlie");
      assert.deepEqual(charliePatterns.includePatterns, ["*.ts"]);
    });

    it("deduplicates multiple mentions of the same owner on the same line", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice @alice @alice
      `);

      const patterns = service.getFilePatternsForOwner("@alice");
      assert.deepEqual(patterns.includePatterns, ["/src/"]);
      assert.deepEqual(service.getAllOwners(), ["@alice"]);
    });

    it("handles multiple spaces and tab separators between pattern and owners", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/\t\t@alice   \t  @bob
      `);

      const owners = service.getAllOwners();
      assert.deepEqual(owners, ["@alice", "@bob"]);
      assert.deepEqual(service.getFilePatternsForOwner("@alice").includePatterns, ["/src/"]);
      assert.deepEqual(service.getFilePatternsForOwner("@bob").includePatterns, ["/src/"]);
    });
  });

  describe("Rule Overwrites, Shadowing, and Precedence", () => {
    it("handles global wildcard '*' overridden by subsequent rules", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        * @global-owner
        /src/ @alice
        *.ts @bob
      `);

      const globalPatterns = service.getFilePatternsForOwner("@global-owner");
      assert.deepEqual(globalPatterns.includePatterns, ["*"]);
      // Global owner must exclude rules claimed by specific owners
      assert.ok(globalPatterns.excludePatterns.includes("/src/"), "global must exclude /src/");
      assert.ok(globalPatterns.excludePatterns.includes("*.ts"), "global must exclude *.ts");

      const alicePatterns = service.getFilePatternsForOwner("@alice");
      assert.deepEqual(alicePatterns.includePatterns, ["/src/"]);
      assert.deepEqual(alicePatterns.excludePatterns, []);
    });

    it("handles exact same pattern overwritten by a later rule for a different owner", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice
        /src/ @bob
      `);

      const bobPatterns = service.getFilePatternsForOwner("@bob");
      assert.deepEqual(bobPatterns.includePatterns, ["/src/"]);
      assert.deepEqual(bobPatterns.excludePatterns, []);

      const alicePatterns = service.getFilePatternsForOwner("@alice");
      // @alice was completely overwritten for /src/ by @bob
      assert.ok(
        alicePatterns.includePatterns.length === 0 || alicePatterns.excludePatterns.includes("/src/"),
        "@alice should not retain unexcluded ownership of /src/",
      );
    });

    it("handles subdirectory overriding a broader parent directory", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @frontend
        /src/components/ @ui-team
      `);

      const frontendPatterns = service.getFilePatternsForOwner("@frontend");
      assert.deepEqual(frontendPatterns.includePatterns, ["/src/"]);
      assert.deepEqual(frontendPatterns.excludePatterns, ["/src/components/"]);

      const uiPatterns = service.getFilePatternsForOwner("@ui-team");
      assert.deepEqual(uiPatterns.includePatterns, ["/src/components/"]);
      assert.deepEqual(uiPatterns.excludePatterns, []);
    });

    it("handles specific file overriding a directory pattern", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @backend
        /src/special.ts @security
      `);

      const backendPatterns = service.getFilePatternsForOwner("@backend");
      assert.deepEqual(backendPatterns.includePatterns, ["/src/"]);
      assert.deepEqual(backendPatterns.excludePatterns, ["/src/special.ts"]);

      const secPatterns = service.getFilePatternsForOwner("@security");
      assert.deepEqual(secPatterns.includePatterns, ["/src/special.ts"]);
      assert.deepEqual(secPatterns.excludePatterns, []);
    });

    it("handles specific file overriding a broad extension pattern", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        *.ts @all-ts
        /src/config.ts @ops
      `);

      const tsPatterns = service.getFilePatternsForOwner("@all-ts");
      assert.deepEqual(tsPatterns.includePatterns, ["*.ts"]);
      assert.deepEqual(tsPatterns.excludePatterns, ["/src/config.ts"]);

      const opsPatterns = service.getFilePatternsForOwner("@ops");
      assert.deepEqual(opsPatterns.includePatterns, ["/src/config.ts"]);
      assert.deepEqual(opsPatterns.excludePatterns, []);
    });

    it("handles path extension overriding a global extension pattern", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        *.js @frontend
        /api/*.js @backend
      `);

      const frontendPatterns = service.getFilePatternsForOwner("@frontend");
      assert.deepEqual(frontendPatterns.includePatterns, ["*.js"]);
      assert.deepEqual(frontendPatterns.excludePatterns, ["/api/*.js"]);

      const backendPatterns = service.getFilePatternsForOwner("@backend");
      assert.deepEqual(backendPatterns.includePatterns, ["/api/*.js"]);
      assert.deepEqual(backendPatterns.excludePatterns, []);
    });

    it("does not override between disjoint directories", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice
        /docs/ @bob
      `);

      const alice = service.getFilePatternsForOwner("@alice");
      assert.deepEqual(alice.includePatterns, ["/src/"]);
      assert.deepEqual(alice.excludePatterns, []);

      const bob = service.getFilePatternsForOwner("@bob");
      assert.deepEqual(bob.includePatterns, ["/docs/"]);
      assert.deepEqual(bob.excludePatterns, []);
    });

    it("prevents prefix collisions between similar folder names (e.g. /app vs /app-config)", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /app/ @team-app
        /app-config/ @team-config
      `);

      const app = service.getFilePatternsForOwner("@team-app");
      assert.deepEqual(app.includePatterns, ["/app/"]);
      // /app-config/ is a completely different folder, not a subfolder of /app/
      assert.deepEqual(app.excludePatterns, []);
    });

    it("does not self-exclude when the same owner appears in a more specific rule", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice
        /src/components/ @alice
      `);

      const alice = service.getFilePatternsForOwner("@alice");
      assert.deepEqual(alice.includePatterns.sort(), ["/src/", "/src/components/"].sort());
      assert.deepEqual(alice.excludePatterns, []);
    });

    it("does not self-exclude when the owner is retained alongside a new owner in a subrule", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice
        /src/utils/ @alice @bob
      `);

      const alice = service.getFilePatternsForOwner("@alice");
      assert.deepEqual(alice.includePatterns.sort(), ["/src/", "/src/utils/"].sort());
      assert.deepEqual(alice.excludePatterns, []);

      const bob = service.getFilePatternsForOwner("@bob");
      assert.deepEqual(bob.includePatterns, ["/src/utils/"]);
      assert.deepEqual(bob.excludePatterns, []);
    });

    it("handles multi-level cascading overrides (ping-pong ownership)", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /dir/ @alice
        /dir/sub/ @bob
        /dir/sub/file.txt @alice
      `);

      const alice = service.getFilePatternsForOwner("@alice");
      assert.deepEqual(alice.includePatterns.sort(), ["/dir/", "/dir/sub/file.txt"].sort());
      assert.deepEqual(alice.excludePatterns, ["/dir/sub/"]);

      const bob = service.getFilePatternsForOwner("@bob");
      assert.deepEqual(bob.includePatterns, ["/dir/sub/"]);
      assert.deepEqual(bob.excludePatterns, ["/dir/sub/file.txt"]);
    });
  });

  describe("Unowned Rules and Special Queries", () => {
    it("parses single-token lines as explicitly unowned rules according to GitHub spec", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        * @alice
        /docs/
      `);

      const alice = service.getFilePatternsForOwner("@alice");
      assert.deepEqual(alice.includePatterns, ["*"]);
      assert.ok(alice.excludePatterns.includes("/docs/"), "alice should exclude unowned /docs/");

      const unowned = service.getFilePatternsForOwner("Unowned");
      assert.deepEqual(unowned.includePatterns, ["/docs/"]);
      assert.deepEqual(unowned.excludePatterns, []);
    });

    it("parses pattern with non-@ token as unowned", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /secret/ unowned
      `);

      const unowned = service.getFilePatternsForOwner("Unowned");
      assert.deepEqual(unowned.includePatterns, ["/secret/"]);
    });

    it("handles 'Unowned' query when no explicit unowned rules exist", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice
        /docs/ @bob
      `);

      const unowned = service.getFilePatternsForOwner("Unowned");
      assert.deepEqual(unowned.includePatterns, ["**/*"]);
      assert.deepEqual(unowned.excludePatterns.sort(), ["/docs/", "/src/"].sort());
    });

    it("handles 'Owned by all' query", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice
        /docs/ @bob
        /unowned/
      `);

      const allOwned = service.getFilePatternsForOwner("Owned by all");
      assert.deepEqual(allOwned.includePatterns.sort(), ["/docs/", "/src/"].sort());
      assert.deepEqual(allOwned.excludePatterns, ["/unowned/"]);
    });

    it("returns empty patterns for non-existent owner", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice
      `);

      const result = service.getFilePatternsForOwner("@unknown");
      assert.deepEqual(result, { includePatterns: [], excludePatterns: [] });
    });
  });

  describe("Parser Edge Cases", () => {
    it("ignores comments, empty lines, and indented comments", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        # Full line comment
           # Indented comment

        /src/ @alice
      `);

      assert.deepEqual(service.getAllOwners(), ["@alice"]);
      assert.deepEqual(service.getFilePatternsForOwner("@alice").includePatterns, ["/src/"]);
    });

    it("ignores inline comments so @mentions in comments are not parsed as owners", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /src/ @alice # ping @fakeowner or test@fake.com for questions
      `);

      assert.deepEqual(service.getAllOwners(), ["@alice"]);
      const alice = service.getFilePatternsForOwner("@alice");
      assert.deepEqual(alice.includePatterns, ["/src/"]);
    });

    it("handles CRLF (Windows) line endings", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent("/src/ @alice\r\n/docs/ @bob\r\n");

      assert.deepEqual(service.getAllOwners(), ["@alice", "@bob"]);
    });
  });

  describe("Owner Queries & Filtering", () => {
    it("returns sorted unique owners in getAllOwners", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /z/ @zebra
        /a/ @apple
        /b/ @apple
      `);

      assert.deepEqual(service.getAllOwners(), ["@apple", "@zebra"]);
    });

    it("filters owners case-insensitively with getMatchingOwners", () => {
      const service = new CodeOwnerService();
      service.parseCodeOwnersContent(`
        /api/ @org/Core-Team
        /web/ @Frontend-Lead
      `);

      assert.deepEqual(service.getMatchingOwners("core"), ["@org/Core-Team"]);
      assert.deepEqual(service.getMatchingOwners("FRONTEND"), ["@Frontend-Lead"]);
      assert.deepEqual(service.getMatchingOwners("team"), ["@org/Core-Team"]);
      assert.deepEqual(service.getMatchingOwners(""), []);
    });
  });
});
