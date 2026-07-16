import type { PublicProfileProvider } from "./publicProfileProvider";
import type { ProfileFetchResult, PublicProfile } from "./types";

type FetchFunction = typeof fetch;

export class GitHubProfileProvider implements PublicProfileProvider {
  public readonly id = "github.com";
  public readonly host = "github.com";

  public constructor(private readonly request: FetchFunction = fetch) {}

  public getUsername(owner: string): string | null {
    if (!owner.startsWith("@") || owner.includes("/")) {
      return null;
    }

    const username = owner.slice(1);
    if (
      username.length < 1 ||
      username.length > 39 ||
      !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(username)
    ) {
      return null;
    }

    return username;
  }

  public async fetchProfile(username: string): Promise<ProfileFetchResult> {
    try {
      const headers = new Headers();
      headers.set("Accept", "application/vnd.github+json");
      headers.set("X-GitHub-Api-Version", "2022-11-28");
      headers.set("User-Agent", "search-by-code-owner-vscode-extension");
      const response = await this.request(
        `https://api.github.com/users/${encodeURIComponent(username)}`,
        { headers },
      );

      if (response.status === 404) {
        return { status: "notFound" };
      }
      if (response.status === 403 || response.status === 429) {
        return { status: "rateLimited" };
      }
      if (!response.ok) {
        return { status: "transientFailure" };
      }

      const value = (await response.json()) as Record<string, unknown>;
      const profile: PublicProfile = {
        username: stringValue(value.login) ?? username,
        name: stringValue(value.name),
        email: stringValue(value.email),
        avatarUrl: stringValue(value["avatar_url"]),
      };
      return { status: "found", profile };
    } catch {
      return { status: "transientFailure" };
    }
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
