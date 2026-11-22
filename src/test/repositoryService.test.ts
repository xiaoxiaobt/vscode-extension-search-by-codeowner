import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRemoteHost,
  RepositoryService,
} from "../profile/repositoryService";

test("parseRemoteHost accepts common public GitHub URL forms", () => {
  assert.equal(
    parseRemoteHost("https://github.com/example/project.git"),
    "github.com",
  );
  assert.equal(
    parseRemoteHost("ssh://git@github.com/example/project.git"),
    "github.com",
  );
  assert.equal(
    parseRemoteHost("git@github.com:example/project.git"),
    "github.com",
  );
});

test("parseRemoteHost preserves non-public and enterprise hosts for rejection", () => {
  assert.equal(
    parseRemoteHost("git@gitlab.com:example/project.git"),
    "gitlab.com",
  );
  assert.equal(
    parseRemoteHost("https://github.company.test/example/project.git"),
    "github.company.test",
  );
  assert.equal(parseRemoteHost("not a remote"), null);
});

test("RepositoryService uses the current branch tracking remote", async () => {
  const calls: string[][] = [];
  const service = new RepositoryService(async (_cwd, args) => {
    calls.push([...args]);
    switch (args[0]) {
      case "rev-parse":
        return "/repo\n";
      case "symbolic-ref":
        return "feature/current\n";
      case "config":
        return "upstream\n";
      case "remote":
        return "git@github.com:example/project.git\n";
      default:
        throw new Error("Unexpected command");
    }
  });

  const repository = await service.resolveForFile("/repo/.github/CODEOWNERS");
  assert.deepEqual(repository, {
    rootPath: "/repo",
    host: "github.com",
    remoteName: "upstream",
    remoteUrl: "git@github.com:example/project.git",
  });
  assert.deepEqual(calls[2], [
    "config",
    "--get",
    "branch.feature/current.remote",
  ]);
});

test("RepositoryService falls back to origin without an upstream", async () => {
  const service = new RepositoryService(async (_cwd, args) => {
    if (args[0] === "rev-parse") {
      return "/repo";
    }
    if (args[0] === "symbolic-ref") {
      return "main";
    }
    if (args[0] === "config") {
      throw new Error("No configured remote");
    }
    if (args[0] === "remote") {
      assert.deepEqual(args, ["remote", "get-url", "origin"]);
      return "git@github.com:example/project.git";
    }
    throw new Error("Unexpected command");
  });

  assert.deepEqual(
    await service.resolveForFile("/repo/.github/CODEOWNERS"),
    {
      rootPath: "/repo",
      host: "github.com",
      remoteName: "origin",
      remoteUrl: "git@github.com:example/project.git",
    },
  );
});
