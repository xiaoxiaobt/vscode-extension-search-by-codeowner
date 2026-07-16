import type { PublicProfile } from "./types";

const cacheKey = "publicProfileCache.v1";

interface KeyValueState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export type CachedProfileResult =
  | { status: "found"; profile: PublicProfile; cachedAt: number }
  | { status: "notFound"; cachedAt: number };

interface StoredCache {
  version: 1;
  records: Record<string, CachedProfileResult>;
}

export class ProfileCache {
  private readonly cache: StoredCache;
  private writeChain: Promise<void> = Promise.resolve();

  public constructor(private readonly state: KeyValueState) {
    const stored = state.get<StoredCache>(cacheKey);
    this.cache =
      stored?.version === 1 && stored.records
        ? stored
        : { version: 1, records: {} };
  }

  public get(
    providerId: string,
    username: string,
  ): CachedProfileResult | undefined {
    return this.cache.records[toRecordKey(providerId, username)];
  }

  public async storeFound(
    providerId: string,
    username: string,
    profile: PublicProfile,
  ): Promise<void> {
    this.cache.records[toRecordKey(providerId, username)] = {
      status: "found",
      profile,
      cachedAt: Date.now(),
    };
    await this.persist();
  }

  public async storeNotFound(
    providerId: string,
    username: string,
  ): Promise<void> {
    this.cache.records[toRecordKey(providerId, username)] = {
      status: "notFound",
      cachedAt: Date.now(),
    };
    await this.persist();
  }

  private persist(): Promise<void> {
    const snapshot: StoredCache = {
      version: 1,
      records: { ...this.cache.records },
    };
    this.writeChain = this.writeChain.then(() =>
      Promise.resolve(this.state.update(cacheKey, snapshot)),
    );
    return this.writeChain;
  }
}

function toRecordKey(providerId: string, username: string): string {
  return `${providerId}:${username.toLowerCase()}`;
}
