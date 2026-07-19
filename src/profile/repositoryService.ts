import { dirname } from "path";
import { runGit, type GitRunner } from "./gitClient";
import type { PublicRepositoryContext } from "./types";

export class RepositoryService {
  public constructor(private readonly git: GitRunner = runGit) {}

  public async resolveForFile(
    filePath: string,
  ): Promise<PublicRepositoryContext | null> {
    try {
      const workingDirectory = dirname(filePath);
      const rootPath = clean(
        await this.git(workingDirectory, ["rev-parse", "--show-toplevel"]),
      );
      const branch = clean(
        await this.git(rootPath, [
          "symbolic-ref",
          "--quiet",
          "--short",
          "HEAD",
        ]),
      );
      const remoteName = clean(
        await this.git(rootPath, [
          "config",
          "--get",
          `branch.${branch}.remote`,
        ]),
      );

      if (!rootPath || !branch || !remoteName || remoteName === ".") {
        return null;
      }

      const remoteUrl = clean(
        await this.git(rootPath, ["remote", "get-url", remoteName]),
      );
      const host = parseRemoteHost(remoteUrl);
      if (!remoteUrl || !host) {
        return null;
      }

      return { rootPath, host, remoteName, remoteUrl };
    } catch {
      return null;
    }
  }
}

export function parseRemoteHost(remoteUrl: string): string | null {
  const value = remoteUrl.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (!url.hostname || !["https:", "http:", "ssh:", "git:"].includes(url.protocol)) {
      return null;
    }
    return url.hostname.toLowerCase();
  } catch {
    // Git commonly uses an SCP-like URL: git@github.com:owner/repo.git
    const match = /^(?:[^@/\s]+@)?([^:/\s]+):[^\s]+$/.exec(value);
    return match?.[1]?.toLowerCase() ?? null;
  }
}

function clean(value: string): string {
  return value.trim();
}
