import { promises as fs } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_MAX_RESULTS = 1000;
const MAX_RESULTS_LIMIT = 10000;
const SERVER_VERSION = "0.2.2";
const CODEOWNERS_LOCATIONS = [
  ".github/CODEOWNERS",
  "CODEOWNERS",
  "docs/CODEOWNERS",
  ".gitlab/CODEOWNERS",
  ".gitea/CODEOWNERS",
  ".bitbucket/CODEOWNERS",
];

interface CodeOwnerRule {
  pattern: string;
  owners: string[];
}

interface CodeOwnerInfo {
  owners: string[];
  matchingPattern?: string;
}

interface ListedFile {
  uri: string;
  path: string;
  relativePath: string;
  owners: string[];
  matchingPattern?: string;
}

interface ToolOutput {
  owner?: string;
  query?: string;
  caseSensitive?: boolean;
  isRegex?: boolean;
  matchWholeWord?: boolean;
  files?: ListedFile[];
  availableOwners?: string[];
  matchedFileCount?: number;
  matchedOwnerCount?: number;
  skippedFileCount?: number;
  truncated?: boolean;
  error?: string;
}

interface CommonInput {
  workspaceRoot?: string;
  workspaceRoots?: string[];
  owner: string;
  excludeGitIgnore?: boolean;
  useVscodeExcludes?: boolean;
  maxResults?: number;
}

interface SearchInput extends CommonInput {
  query: string;
  caseSensitive?: boolean;
  isRegex?: boolean;
  matchWholeWord?: boolean;
}

interface MatchingOwnersInput {
  workspaceRoot?: string;
  workspaceRoots?: string[];
  query: string;
  maxResults?: number;
}

class PortableCodeOwnerRepository {
  private readonly rulesByRoot = new Map<string, CodeOwnerRule[]>();
  private readonly ownersByRoot = new Map<string, string[]>();
  private readonly ignoredPatternsByRoot = new Map<string, string[]>();

  public async initialize(roots: string[]): Promise<void> {
    for (const root of roots) {
      const codeOwnersPath = await this.findCodeOwnersFile(root);
      if (!codeOwnersPath) {
        this.rulesByRoot.set(root, []);
        this.ownersByRoot.set(root, []);
        continue;
      }

      const content = await fs.readFile(codeOwnersPath, "utf8");
      const rules = this.parseCodeOwners(content);
      this.rulesByRoot.set(root, rules);
      this.ownersByRoot.set(
        root,
        [...new Set(rules.flatMap((rule) => rule.owners))].sort(),
      );

      const gitIgnorePath = join(root, ".gitignore");
      try {
        const gitIgnore = await fs.readFile(gitIgnorePath, "utf8");
        this.ignoredPatternsByRoot.set(root, this.parseGitIgnore(gitIgnore));
      } catch {
        this.ignoredPatternsByRoot.set(root, []);
      }
    }
  }

  public hasCodeOwnersFile(): boolean {
    return [...this.rulesByRoot.values()].some((rules) => rules.length > 0);
  }

  public getAllOwners(): string[] {
    return [...new Set([...this.ownersByRoot.values()].flat())].sort();
  }

  public getMatchingOwners(query: string): string[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return this.getAllOwners().filter((owner) => {
      const normalizedOwner = owner.toLowerCase();
      const shortOwner = normalizedOwner.split("/").at(-1) ?? normalizedOwner;
      const withoutOrg = normalizedOwner.replace(/^@[^/]+\//, "");
      return (
        normalizedOwner.includes(normalizedQuery) ||
        shortOwner.includes(normalizedQuery) ||
        withoutOrg.includes(normalizedQuery)
      );
    });
  }

  public getOwner(root: string, filePath: string): CodeOwnerInfo {
    const relativePath = this.relativePath(root, filePath);
    const rules = this.rulesByRoot.get(root) ?? [];
    const rule = [...rules]
      .reverse()
      .find((candidate) =>
        this.matchesPattern(relativePath, candidate.pattern),
      );

    return rule
      ? { owners: rule.owners, matchingPattern: rule.pattern }
      : { owners: [] };
  }

  public isIgnored(root: string, filePath: string): boolean {
    const relativePath = this.relativePath(root, filePath);
    const patterns = this.ignoredPatternsByRoot.get(root) ?? [];
    return patterns.some((pattern) => this.matchesGlob(relativePath, pattern));
  }

  public relativePath(root: string, filePath: string): string {
    return relative(root, filePath).replaceAll(sep, "/");
  }

  private async findCodeOwnersFile(root: string): Promise<string | null> {
    for (const location of CODEOWNERS_LOCATIONS) {
      const candidate = join(root, location);
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          return candidate;
        }
      } catch {
        // Try the next supported location.
      }
    }

    return null;
  }

  private parseCodeOwners(content: string): CodeOwnerRule[] {
    return content.split(/\r?\n/).flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return [];
      }

      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) {
        return [];
      }

      return [
        {
          pattern: parts[0],
          owners: parts.slice(1).filter((owner) => owner.includes("@")),
        },
      ];
    });
  }

  private parseGitIgnore(content: string): string[] {
    return content.split(/\r?\n/).flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
        return [];
      }

      const normalized = trimmed.replace(/^\//, "");
      return [normalized.endsWith("/") ? `${normalized}**/*` : normalized];
    });
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (
      pattern.endsWith("/") ||
      (!pattern.includes("*") && !pattern.includes("."))
    ) {
      const directory = pattern.replace(/^\//, "").replace(/\/$/, "");
      return (
        filePath === directory ||
        filePath.startsWith(`${directory}/`) ||
        (!pattern.startsWith("/") && filePath.includes(`/${directory}/`))
      );
    }

    if (pattern.startsWith("*.")) {
      return filePath.endsWith(pattern.slice(1));
    }

    if (pattern.startsWith("/")) {
      return filePath.startsWith(pattern.slice(1));
    }

    if (pattern.includes("*") || pattern.includes("?")) {
      return this.matchesGlob(filePath, pattern);
    }

    return filePath === pattern || filePath.endsWith(`/${pattern}`);
  }

  private matchesGlob(filePath: string, pattern: string): boolean {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const expression = escaped
      .replaceAll("**", "__DOUBLE_STAR__")
      .replaceAll("*", "[^/]*")
      .replaceAll("?", "[^/]")
      .replaceAll("__DOUBLE_STAR__", ".*");
    return new RegExp(`^${expression}$`).test(filePath);
  }
}

const listInputSchema = {
  workspaceRoot: z.string().optional(),
  workspaceRoots: z.array(z.string()).optional(),
  owner: z.string(),
  excludeGitIgnore: z.boolean().optional(),
  useVscodeExcludes: z.boolean().optional(),
  maxResults: z.number().int().min(1).max(MAX_RESULTS_LIMIT).optional(),
};

const searchInputSchema = {
  ...listInputSchema,
  query: z.string(),
  caseSensitive: z.boolean().optional(),
  isRegex: z.boolean().optional(),
  matchWholeWord: z.boolean().optional(),
};

const matchingOwnersInputSchema = {
  workspaceRoot: z.string().optional(),
  workspaceRoots: z.array(z.string()).optional(),
  query: z.string(),
  maxResults: z.number().int().min(1).max(MAX_RESULTS_LIMIT).optional(),
};

const getMaxResults = (value: number | undefined): number => {
  return Math.min(
    Math.max(Math.floor(value ?? DEFAULT_MAX_RESULTS), 1),
    MAX_RESULTS_LIMIT,
  );
};

const getRoots = (input: {
  workspaceRoot?: string;
  workspaceRoots?: string[];
}): string[] => {
  const configuredRoots =
    input.workspaceRoots ?? (input.workspaceRoot ? [input.workspaceRoot] : []);
  let environmentRoots: string[] = [];
  try {
    const parsedRoots: unknown = process.env.WORKSPACE_ROOTS
      ? JSON.parse(process.env.WORKSPACE_ROOTS)
      : [];
    if (Array.isArray(parsedRoots)) {
      environmentRoots = parsedRoots.filter(
        (root): root is string => typeof root === "string",
      );
    }
  } catch {
    environmentRoots = [];
  }

  const roots =
    configuredRoots.length > 0
      ? configuredRoots
      : environmentRoots.length > 0
        ? environmentRoots
        : process.env.WORKSPACE_FOLDER
          ? [process.env.WORKSPACE_FOLDER]
          : [process.cwd()];

  return [...new Set(roots.map((root) => resolve(root)))];
};

const collectFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const pending = [root];

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) {
      continue;
    }

    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") {
        continue;
      }

      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(filePath);
      } else if (entry.isFile()) {
        files.push(filePath);
      }
    }
  }

  return files;
};

const createMatcher = (input: SearchInput): ((content: string) => boolean) => {
  const flags = input.caseSensitive ? "g" : "gi";
  const source = input.isRegex
    ? input.query
    : input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(source, flags);

  return (content: string): boolean => {
    expression.lastIndex = 0;
    if (!input.matchWholeWord) {
      return expression.test(content);
    }

    let match: RegExpExecArray | null;
    while ((match = expression.exec(content)) !== null) {
      const before = match.index === 0 ? "" : content[match.index - 1];
      const end = match.index + match[0].length;
      const after = end >= content.length ? "" : content[end];
      if (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after)) {
        return true;
      }
      if (match[0].length === 0) {
        expression.lastIndex++;
      }
    }

    return false;
  };
};

const result = (output: ToolOutput) => {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
};

const listFiles = async (input: CommonInput): Promise<ToolOutput> => {
  const roots = getRoots(input);
  const repository = new PortableCodeOwnerRepository();
  await repository.initialize(roots);
  const owners = repository.getAllOwners();

  if (!owners.includes(input.owner)) {
    return {
      error: repository.hasCodeOwnersFile()
        ? `Unknown CODEOWNER: ${input.owner}. Available CODEOWNERS: ${owners.join(", ")}`
        : "No CODEOWNERS file found in the workspace.",
    };
  }

  const maxResults = getMaxResults(input.maxResults);
  const files: ListedFile[] = [];
  let hasMore = false;

  for (const root of roots) {
    for (const filePath of await collectFiles(root)) {
      if (
        input.excludeGitIgnore !== false &&
        repository.isIgnored(root, filePath)
      ) {
        continue;
      }

      const ownership = repository.getOwner(root, filePath);
      if (!ownership.owners.includes(input.owner)) {
        continue;
      }

      if (files.length >= maxResults) {
        hasMore = true;
        break;
      }

      files.push(toListedFile(repository, root, filePath, ownership));
    }
    if (hasMore) {
      break;
    }
  }

  return {
    owner: input.owner,
    files,
    matchedFileCount: files.length,
    truncated: hasMore,
  };
};

const searchFiles = async (input: SearchInput): Promise<ToolOutput> => {
  if (!input.query) {
    return { error: "The search query must not be empty." };
  }

  const roots = getRoots(input);
  const repository = new PortableCodeOwnerRepository();
  await repository.initialize(roots);
  const owners = repository.getAllOwners();
  if (!owners.includes(input.owner)) {
    return {
      error: `Unknown CODEOWNER: ${input.owner}. Available CODEOWNERS: ${owners.join(", ")}`,
    };
  }

  const matcher = createMatcher(input);
  const maxResults = getMaxResults(input.maxResults);
  const files: ListedFile[] = [];
  let skippedFileCount = 0;
  let hasMore = false;

  for (const root of roots) {
    for (const filePath of await collectFiles(root)) {
      if (
        input.excludeGitIgnore !== false &&
        repository.isIgnored(root, filePath)
      ) {
        continue;
      }

      const ownership = repository.getOwner(root, filePath);
      if (!ownership.owners.includes(input.owner)) {
        continue;
      }

      try {
        const content = await fs.readFile(filePath);
        if (content.includes(0)) {
          skippedFileCount++;
          continue;
        }

        if (
          !matcher(new TextDecoder("utf-8", { fatal: false }).decode(content))
        ) {
          continue;
        }

        if (files.length >= maxResults) {
          hasMore = true;
          break;
        }
        files.push(toListedFile(repository, root, filePath, ownership));
      } catch {
        skippedFileCount++;
      }
    }
    if (hasMore) {
      break;
    }
  }

  return {
    owner: input.owner,
    query: input.query,
    caseSensitive: input.caseSensitive ?? false,
    isRegex: input.isRegex ?? false,
    matchWholeWord: input.matchWholeWord ?? false,
    files,
    matchedFileCount: files.length,
    skippedFileCount,
    truncated: hasMore,
  };
};

const toListedFile = (
  repository: PortableCodeOwnerRepository,
  root: string,
  filePath: string,
  ownership: CodeOwnerInfo,
): ListedFile => {
  return {
    uri: pathToFileURL(filePath).toString(),
    path: filePath,
    relativePath: repository.relativePath(root, filePath),
    owners: ownership.owners,
    matchingPattern: ownership.matchingPattern,
  };
};

const findMatchingOwners = async (
  input: MatchingOwnersInput,
): Promise<ToolOutput> => {
  const query = input.query.trim();
  if (!query) {
    return { error: "The owner query must not be empty." };
  }

  const repository = new PortableCodeOwnerRepository();
  await repository.initialize(getRoots(input));
  const owners = repository.getMatchingOwners(query);
  const maxResults = getMaxResults(input.maxResults);

  return {
    query,
    availableOwners: owners.slice(0, maxResults),
    matchedOwnerCount: owners.length,
    truncated: owners.length > maxResults,
  };
};

const server = new McpServer({
  name: "search-by-code-owner",
  version: SERVER_VERSION,
});

server.registerTool(
  "codeOwner_listFiles",
  {
    title: "List files by code owner",
    description:
      "List workspace files assigned to an exact CODEOWNER according to CODEOWNERS.",
    inputSchema: listInputSchema,
  },
  async (input) => result(await listFiles(input)),
);

server.registerTool(
  "codeOwner_searchFiles",
  {
    title: "Search files by code owner",
    description: "Search the contents of files assigned to an exact CODEOWNER.",
    inputSchema: searchInputSchema,
  },
  async (input) => result(await searchFiles(input)),
);

server.registerTool(
  "codeOwner_findMatchingOwners",
  {
    title: "Find matching code owners",
    description:
      "Find canonical CODEOWNERS owners matching a partial owner name.",
    inputSchema: matchingOwnersInputSchema,
  },
  async (input) => result(await findMatchingOwners(input)),
);

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
