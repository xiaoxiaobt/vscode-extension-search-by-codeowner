import assert from "node:assert/strict";
import test from "node:test";
import { GitHubProfileProvider } from "../profile/githubProfileProvider";

test("GitHub provider accepts people and rejects teams and invalid owners", () => {
  const provider = new GitHubProfileProvider();
  assert.equal(provider.getUsername("@example-user"), "example-user");
  assert.equal(provider.getUsername("@org/team"), null);
  assert.equal(provider.getUsername("person@example.com"), null);
  assert.equal(provider.getUsername("@-invalid"), null);
});

test("GitHub provider requests public data without authorization", async () => {
  let requestHeaders: Headers | undefined;
  const request = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    assert.equal(String(input), "https://api.github.com/users/example");
    requestHeaders = new Headers(init?.headers);
    return new Response(
      JSON.stringify({
        login: "example",
        type: "User",
        name: null,
        email: "person@example.com",
        ["avatar_url"]: "https://avatars.example/image",
      }),
      { status: 200 },
    );
  };
  const provider = new GitHubProfileProvider(request as typeof fetch);

  assert.deepEqual(await provider.fetchProfile("example"), {
    status: "found",
    profile: {
      username: "example",
      name: null,
      email: "person@example.com",
      avatarUrl: "https://avatars.example/image",
    },
  });
  assert.equal(requestHeaders?.get("Authorization"), null);
  assert.equal(requestHeaders?.get("X-GitHub-Api-Version"), "2022-11-28");
});

test("GitHub provider does not retain organization profile data", async () => {
  const provider = new GitHubProfileProvider(
    (async () =>
      new Response(
        JSON.stringify({
          login: "example-org",
          type: "Organization",
          name: "Example Organization",
          email: "public@example.com",
        }),
        { status: 200 },
      )) as typeof fetch,
  );

  assert.deepEqual(await provider.fetchProfile("example-org"), {
    status: "notFound",
  });
});

test("GitHub provider classifies terminal and retryable failures", async () => {
  const responseFor = (status: number) =>
    new GitHubProfileProvider(
      (async () => new Response(null, { status })) as typeof fetch,
    ).fetchProfile("example");

  assert.deepEqual(await responseFor(404), { status: "notFound" });
  assert.deepEqual(await responseFor(403), { status: "rateLimited" });
  assert.deepEqual(await responseFor(429), { status: "rateLimited" });
  assert.deepEqual(await responseFor(500), { status: "transientFailure" });
});
