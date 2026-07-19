export interface PublicProfile {
  username: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export type ProfileFetchResult =
  | { status: "found"; profile: PublicProfile }
  | { status: "notFound" }
  | { status: "rateLimited" }
  | { status: "transientFailure" };

export interface OwnerDisplayInfo {
  owner: string;
  username?: string;
  displayName?: string;
}

export interface PublicRepositoryContext {
  rootPath: string;
  host: string;
  remoteName: string;
  remoteUrl: string;
}
