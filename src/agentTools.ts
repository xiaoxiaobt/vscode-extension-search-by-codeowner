import * as vscode from "vscode";
import type { CodeOwnerService } from "./codeOwnerService";
import type { GitIgnoreService } from "./gitIgnoreService";
import { rewritePatternsForWorkspaceFolders } from "./workspaceSupport";

const DEFAULT_MAX_RESULTS = 1000;
const MAX_RESULTS_LIMIT = 10000;

interface CommonToolInput {
  owner: string;
  excludeGitIgnore?: boolean;
  useVscodeExcludes?: boolean;
  maxResults?: number;
}

interface SearchToolInput extends CommonToolInput {
  query: string;
  caseSensitive?: boolean;
  isRegex?: boolean;
  matchWholeWord?: boolean;
}

interface MatchOwnerToolInput {
  query: string;
  maxResults?: number;
}

interface ListedFile {
  uri: string;
  path: string;
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
  matchedFileCount?: number;
  matchedOwnerCount?: number;
  skippedFileCount?: number;
  truncated?: boolean;
  error?: string;
  availableOwners?: string[];
}

export class CodeOwnerAgentTools {
  public constructor(
    private readonly codeOwnerService: CodeOwnerService,
    private readonly gitIgnoreService: GitIgnoreService,
    private readonly initialized: Promise<unknown>,
  ) {}

  public register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.lm.registerTool<CommonToolInput>("codeOwner_listFiles", {
        invoke: (options, token) => this.invokeListFiles(options.input, token),
      }),
      vscode.lm.registerTool<SearchToolInput>("codeOwner_searchFiles", {
        invoke: (options, token) =>
          this.invokeSearchFiles(options.input, token),
      }),
      vscode.lm.registerTool<MatchOwnerToolInput>(
        "codeOwner_findMatchingOwners",
        {
          invoke: (options, token) =>
            this.invokeFindMatchingOwners(options.input, token),
        },
      ),
    );
  }

  private async invokeListFiles(
    input: CommonToolInput,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      await this.initialized;
      const result = await this.listFiles(input, token);
      return this.jsonResult(result);
    } catch (error) {
      return this.jsonResult({ error: this.getErrorMessage(error) });
    }
  }

  private async invokeSearchFiles(
    input: SearchToolInput,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      await this.initialized;
      const result = await this.searchFiles(input, token);
      return this.jsonResult(result);
    } catch (error) {
      return this.jsonResult({ error: this.getErrorMessage(error) });
    }
  }

  private async invokeFindMatchingOwners(
    input: MatchOwnerToolInput,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      await this.initialized;
      const result = await this.findMatchingOwners(input, token);
      return this.jsonResult(result);
    } catch (error) {
      return this.jsonResult({ error: this.getErrorMessage(error) });
    }
  }

  private async listFiles(
    input: CommonToolInput,
    token: vscode.CancellationToken,
  ): Promise<ToolOutput> {
    const ownerError = this.validateOwner(input.owner);
    if (ownerError) {
      return { error: ownerError };
    }

    const maxResults = this.getMaxResults(input.maxResults);
    const files = await this.findOwnedFiles(input, maxResults, token);

    return {
      owner: input.owner,
      files: files.map((uri) => this.toListedFile(uri)),
      matchedFileCount: files.length,
      truncated: files.length >= maxResults,
    };
  }

  private async searchFiles(
    input: SearchToolInput,
    token: vscode.CancellationToken,
  ): Promise<ToolOutput> {
    const ownerError = this.validateOwner(input.owner);
    if (ownerError) {
      return { error: ownerError };
    }

    if (!input.query) {
      return { error: "The search query must not be empty." };
    }

    const maxResults = this.getMaxResults(input.maxResults);
    const candidates = await this.findOwnedFiles(
      input,
      Number.MAX_SAFE_INTEGER,
      token,
    );
    const matcher = this.createMatcher(input);
    const files: ListedFile[] = [];
    let skippedFileCount = 0;

    for (const uri of candidates) {
      if (token.isCancellationRequested) {
        break;
      }

      try {
        const content = await this.readTextFile(uri);
        if (content !== null && matcher(content)) {
          files.push(this.toListedFile(uri));
          if (files.length >= maxResults) {
            break;
          }
        } else if (content === null) {
          skippedFileCount++;
        }
      } catch {
        skippedFileCount++;
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
      truncated: files.length >= maxResults,
    };
  }

  private async findMatchingOwners(
    input: MatchOwnerToolInput,
    token: vscode.CancellationToken,
  ): Promise<ToolOutput> {
    const query = input.query.trim();
    if (!query) {
      return { error: "The owner query must not be empty." };
    }

    if (token.isCancellationRequested) {
      return { query, availableOwners: [], matchedOwnerCount: 0 };
    }

    if (!this.codeOwnerService.hasCodeOwnersFile()) {
      return {
        query,
        availableOwners: [],
        matchedOwnerCount: 0,
      };
    }

    const maxResults = this.getMaxResults(input.maxResults);
    const owners = this.codeOwnerService.getMatchingOwners(query);
    const availableOwners = owners.slice(0, maxResults);

    return {
      query,
      availableOwners,
      matchedOwnerCount: owners.length,
      truncated: owners.length > availableOwners.length,
    };
  }

  private async findOwnedFiles(
    input: CommonToolInput,
    maxResults: number,
    token: vscode.CancellationToken,
  ): Promise<vscode.Uri[]> {
    if (!this.codeOwnerService.hasCodeOwnersFile()) {
      return [];
    }

    const ownership = this.codeOwnerService.getFilePatternsForOwner(
      input.owner,
    );
    const includePatterns = rewritePatternsForWorkspaceFolders(
      this.codeOwnerService.generateIncludePatterns(
        ownership.includePatterns.length > 0
          ? ownership.includePatterns
          : ["**/*"],
      ),
    );
    const excludePatterns = rewritePatternsForWorkspaceFolders(
      this.codeOwnerService.generateExcludePatterns(ownership.excludePatterns),
    );

    if (
      input.excludeGitIgnore !== false &&
      this.gitIgnoreService.hasGitIgnoreFile()
    ) {
      excludePatterns.push(
        ...rewritePatternsForWorkspaceFolders(
          this.gitIgnoreService.getIgnorePatterns(),
        ),
      );
    }

    if (input.useVscodeExcludes !== false) {
      excludePatterns.push(...this.getVscodeExcludePatterns());
    }

    const exclude = this.toExcludeGlob(excludePatterns);
    const files = new Map<string, vscode.Uri>();

    for (const includePattern of includePatterns) {
      if (token.isCancellationRequested || files.size >= maxResults) {
        break;
      }

      const remaining = Math.max(maxResults - files.size, 1);
      const matches = await vscode.workspace.findFiles(
        includePattern,
        exclude,
        remaining,
        token,
      );

      for (const uri of matches) {
        const key = uri.toString();
        if (
          !files.has(key) &&
          this.codeOwnerService
            .getCodeOwnerForFile(uri.fsPath)
            .owners.includes(input.owner)
        ) {
          files.set(key, uri);
          if (files.size >= maxResults) {
            break;
          }
        }
      }
    }

    return [...files.values()];
  }

  private getVscodeExcludePatterns(): string[] {
    const settings = [
      vscode.workspace
        .getConfiguration("files")
        .get<Record<string, unknown>>("exclude", {}),
      vscode.workspace
        .getConfiguration("search")
        .get<Record<string, unknown>>("exclude", {}),
    ];

    return settings.flatMap((excludeSettings) =>
      Object.entries(excludeSettings)
        .filter(([, value]) => value === true)
        .map(([pattern]) => pattern),
    );
  }

  private createMatcher(input: SearchToolInput): (content: string) => boolean {
    const flags = input.caseSensitive ? "g" : "gi";
    let expression: RegExp;

    if (input.isRegex) {
      expression = new RegExp(input.query, flags);
    } else {
      const escapedQuery = input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expression = new RegExp(escapedQuery, flags);
    }

    return (content: string): boolean => {
      if (!input.matchWholeWord) {
        expression.lastIndex = 0;
        return expression.test(content);
      }

      expression.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = expression.exec(content)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const before = start === 0 ? "" : content[start - 1];
        const after = end >= content.length ? "" : content[end];
        if (!this.isWordCharacter(before) && !this.isWordCharacter(after)) {
          return true;
        }
        if (match[0].length === 0) {
          expression.lastIndex++;
        }
      }

      return false;
    };
  }

  private async readTextFile(uri: vscode.Uri): Promise<string | null> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.includes(0)) {
      return null;
    }

    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  private validateOwner(owner: string): string | undefined {
    if (!this.codeOwnerService.hasCodeOwnersFile()) {
      return "No CODEOWNERS file found in the workspace.";
    }

    if (!this.codeOwnerService.getAllOwners().includes(owner)) {
      return `Unknown CODEOWNER: ${owner}. Available CODEOWNERS: ${this.codeOwnerService
        .getAllOwners()
        .join(", ")}`;
    }

    return undefined;
  }

  private getMaxResults(value: number | undefined): number {
    if (!Number.isFinite(value) || value === undefined) {
      return DEFAULT_MAX_RESULTS;
    }

    return Math.min(Math.max(Math.floor(value), 1), MAX_RESULTS_LIMIT);
  }

  private toExcludeGlob(patterns: string[]): string | null | undefined {
    const uniquePatterns = [...new Set(patterns)];
    if (uniquePatterns.length === 0) {
      return undefined;
    }

    if (uniquePatterns.length === 1) {
      return uniquePatterns[0];
    }

    return `{${uniquePatterns.join(",")}}`;
  }

  private isWordCharacter(value: string): boolean {
    return value !== "" && /[\p{L}\p{N}_]/u.test(value);
  }

  private toListedFile(uri: vscode.Uri): ListedFile {
    const ownership = this.codeOwnerService.getCodeOwnerForFile(uri.fsPath);
    return {
      uri: uri.toString(),
      path: uri.fsPath,
      owners: ownership.owners,
      matchingPattern: ownership.matchingPattern,
    };
  }

  private jsonResult(output: ToolOutput): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
      vscode.LanguageModelDataPart.json(output),
    ]);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
