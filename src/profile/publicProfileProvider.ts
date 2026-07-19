import type { ProfileFetchResult } from "./types";

/**
 * Host-specific public profile lookup. Cache and UI code depend only on this
 * small contract so another public forge can be added without a broad plugin
 * framework.
 */
export interface PublicProfileProvider {
  readonly id: string;
  readonly host: string;

  getUsername(owner: string): string | null;
  fetchProfile(username: string): Promise<ProfileFetchResult>;
}
