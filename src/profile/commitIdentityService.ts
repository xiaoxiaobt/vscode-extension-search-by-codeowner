import { runGit, type GitRunner } from "./gitClient";

export interface CommitIdentityLookup {
  getName(email: string): string | null;
}

class EmailNameIndex implements CommitIdentityLookup {
  public constructor(
    private readonly namesByEmail: ReadonlyMap<
      string,
      ReadonlyMap<string, string>
    >,
  ) {}

  public getName(email: string): string | null {
    const names = this.namesByEmail.get(normalizeEmail(email));
    if (!names || names.size !== 1) {
      return null;
    }
    return names.values().next().value ?? null;
  }
}

export class CommitIdentityService {
  public constructor(private readonly git: GitRunner = runGit) {}

  public async load(repositoryRoot: string): Promise<CommitIdentityLookup> {
    try {
      const output = await this.git(repositoryRoot, [
        "log",
        "--format=%aN%x00%aE",
      ]);
      return parseCommitIdentities(output);
    } catch {
      return new EmailNameIndex(new Map());
    }
  }
}

export function parseCommitIdentities(output: string): CommitIdentityLookup {
  const namesByEmail = new Map<string, Map<string, string>>();
  for (const line of output.split("\n")) {
    const separatorIndex = line.indexOf("\0");
    if (separatorIndex < 0) {
      continue;
    }

    const name = line.slice(0, separatorIndex).trim();
    const email = normalizeEmail(line.slice(separatorIndex + 1));
    if (!name || !email) {
      continue;
    }

    const names = namesByEmail.get(email) ?? new Map<string, string>();
    names.set(name.toLowerCase(), name);
    namesByEmail.set(email, names);
  }
  return new EmailNameIndex(namesByEmail);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
