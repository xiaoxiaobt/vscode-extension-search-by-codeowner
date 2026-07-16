import type {
  CommitIdentityLookup,
  CommitIdentityService,
} from "./commitIdentityService";
import type { ProfileCache } from "./profileCache";
import type { PublicProfileProvider } from "./publicProfileProvider";
import type { RepositoryService } from "./repositoryService";
import type { PublicProfile } from "./types";

export type ProfileUpdateHandler = (
  profiles: ReadonlyMap<string, PublicProfile>,
) => void;

interface EligibleOwner {
  username: string;
  normalizedUsername: string;
}

export class ProfileEnrichmentService {
  public constructor(
    private readonly cache: ProfileCache,
    private readonly repositoryService: RepositoryService,
    private readonly providers: readonly PublicProfileProvider[],
    private readonly commitIdentityService: CommitIdentityService,
    private readonly concurrency = 3,
  ) {}

  public async enrich(
    owners: readonly string[],
    codeOwnersFilePath: string,
    onUpdate: ProfileUpdateHandler,
  ): Promise<void> {
    const repository =
      await this.repositoryService.resolveForFile(codeOwnersFilePath);
    if (!repository) {
      onUpdate(new Map());
      return;
    }

    const provider = this.providers.find(
      (candidate) => candidate.host === repository.host,
    );
    if (!provider) {
      onUpdate(new Map());
      return;
    }

    const eligibleOwners = uniqueEligibleOwners(owners, provider);
    if (eligibleOwners.length === 0) {
      onUpdate(new Map());
      return;
    }
    const commitIdentities = await this.commitIdentityService.load(
      repository.rootPath,
    );
    const profiles = new Map<string, PublicProfile>();
    const missing: EligibleOwner[] = [];

    for (const owner of eligibleOwners) {
      const cached = this.cache.get(provider.id, owner.username);
      if (!cached) {
        missing.push(owner);
      } else if (cached.status === "found") {
        profiles.set(owner.normalizedUsername, cached.profile);
      }
    }

    publishProfiles(profiles, commitIdentities, onUpdate);

    let nextIndex = 0;
    let rateLimited = false;
    const worker = async (): Promise<void> => {
      while (!rateLimited) {
        const owner = missing[nextIndex++];
        if (!owner) {
          return;
        }

        const result = await provider.fetchProfile(owner.username);
        if (result.status === "rateLimited") {
          rateLimited = true;
          return;
        }
        if (result.status === "notFound") {
          await this.cache.storeNotFound(provider.id, owner.username);
          continue;
        }
        if (result.status === "transientFailure") {
          continue;
        }

        await this.cache.storeFound(
          provider.id,
          owner.username,
          result.profile,
        );
        profiles.set(owner.normalizedUsername, result.profile);
        publishProfiles(profiles, commitIdentities, onUpdate);
      }
    };

    const workerCount = Math.min(this.concurrency, missing.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }
}

function publishProfiles(
  profiles: ReadonlyMap<string, PublicProfile>,
  commitIdentities: CommitIdentityLookup,
  onUpdate: ProfileUpdateHandler,
): void {
  const displayProfiles = new Map<string, PublicProfile>();
  for (const [username, profile] of profiles) {
    const commitName =
      !profile.name && profile.email
        ? commitIdentities.getName(profile.email)
        : null;
    displayProfiles.set(
      username,
      commitName ? { ...profile, name: commitName } : profile,
    );
  }
  onUpdate(displayProfiles);
}

function uniqueEligibleOwners(
  owners: readonly string[],
  provider: PublicProfileProvider,
): EligibleOwner[] {
  const unique = new Map<string, EligibleOwner>();
  for (const owner of owners) {
    const username = provider.getUsername(owner);
    if (!username) {
      continue;
    }

    const normalizedUsername = username.toLowerCase();
    if (!unique.has(normalizedUsername)) {
      unique.set(normalizedUsername, { username, normalizedUsername });
    }
  }
  return [...unique.values()];
}
