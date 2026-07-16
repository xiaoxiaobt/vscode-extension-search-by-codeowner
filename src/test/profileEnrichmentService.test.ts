import assert from "node:assert/strict";
import test from "node:test";
import { CommitIdentityService } from "../profile/commitIdentityService";
import { ProfileCache } from "../profile/profileCache";
import { ProfileEnrichmentService } from "../profile/profileEnrichmentService";
import type { PublicProfileProvider } from "../profile/publicProfileProvider";
import { RepositoryService } from "../profile/repositoryService";

class MemoryState {
  private readonly values = new Map<string, unknown>();

  public get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  public update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function repositoryService(): RepositoryService {
  return new RepositoryService(async (_cwd, args) => {
    if (args[0] === "rev-parse") {
      return "/repo";
    }
    if (args[0] === "symbolic-ref") {
      return "main";
    }
    if (args[0] === "config") {
      return "origin";
    }
    if (args[0] === "remote") {
      return "https://github.com/o/r.git";
    }
    throw new Error("Unexpected Git command");
  });
}

test("enrichment skips teams and reuses terminal cache entries", async () => {
  const requested: string[] = [];
  const provider: PublicProfileProvider = {
    id: "github.com",
    host: "github.com",
    getUsername: (owner) =>
      /^@[a-z]+$/i.test(owner) ? owner.slice(1) : null,
    fetchProfile: async (username) => {
      requested.push(username);
      return {
        status: "found",
        profile: {
          username,
          name: "Example Person",
          email: null,
          avatarUrl: null,
        },
      };
    },
  };
  const service = new ProfileEnrichmentService(
    new ProfileCache(new MemoryState()),
    repositoryService(),
    [provider],
    new CommitIdentityService(async () => ""),
    1,
  );
  let latest = new Map();
  const update = (profiles: ReadonlyMap<string, unknown>) => {
    latest = new Map(profiles);
  };

  await service.enrich(
    ["@example", "@org/team"],
    "/repo/CODEOWNERS",
    update,
  );
  await service.enrich(
    ["@example", "@org/team"],
    "/repo/CODEOWNERS",
    update,
  );

  assert.deepEqual(requested, ["example"]);
  assert.equal(latest.get("@example")?.name, "Example Person");
  assert.equal(latest.has("@org/team"), false);
});

test("enrichment stops scheduling requests after a rate limit", async () => {
  const requested: string[] = [];
  const provider: PublicProfileProvider = {
    id: "github.com",
    host: "github.com",
    getUsername: (owner) => owner.slice(1),
    fetchProfile: async (username) => {
      requested.push(username);
      return { status: "rateLimited" };
    },
  };
  const service = new ProfileEnrichmentService(
    new ProfileCache(new MemoryState()),
    repositoryService(),
    [provider],
    new CommitIdentityService(async () => ""),
    1,
  );

  await service.enrich(
    ["@one", "@two"],
    "/repo/CODEOWNERS",
    () => undefined,
  );
  assert.deepEqual(requested, ["one"]);
});

test("empty successful and not-found responses are terminal cache entries", async () => {
  const requested: string[] = [];
  const provider: PublicProfileProvider = {
    id: "github.com",
    host: "github.com",
    getUsername: (owner) => owner.slice(1),
    fetchProfile: async (username) => {
      requested.push(username);
      if (username === "missing") {
        return { status: "notFound" };
      }
      return {
        status: "found",
        profile: {
          username,
          name: null,
          email: null,
          avatarUrl: null,
        },
      };
    },
  };
  const service = new ProfileEnrichmentService(
    new ProfileCache(new MemoryState()),
    repositoryService(),
    [provider],
    new CommitIdentityService(async () => ""),
    1,
  );

  for (let run = 0; run < 2; run++) {
    await service.enrich(
      ["@empty", "@missing"],
      "/repo/CODEOWNERS",
      () => undefined,
    );
  }

  assert.deepEqual(requested, ["empty", "missing"]);
});
