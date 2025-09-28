import * as vscode from "vscode";
import { relative, join } from "path";

interface CodeOwnerRule {
  pattern: string;
  owners: string[];
}

interface CodeOwnerInfo {
  owners: string[];
  isUnowned: boolean;
  matchingPattern?: string;
}

export class CodeOwnerService {
  private codeOwnerRules: CodeOwnerRule[] = [];
  private allOwners: Set<string> = new Set();
  private codeOwnersFilePath: string | null = null;

  // CODEOWNERS file locations in order of precedence
  private readonly codeownersLocations = [
    // GitHub/GitLab standard locations
    ".github/CODEOWNERS",
    "CODEOWNERS",
    "docs/CODEOWNERS",
    // GitLab specific location
    ".gitlab/CODEOWNERS",
    // Gitea specific location
    ".gitea/CODEOWNERS",
  ];

  public async initialize(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return false;
    }

    // Find CODEOWNERS file
    for (const location of this.codeownersLocations) {
      for (const folder of workspaceFolders) {
        const filePath = join(folder.uri.fsPath, location);
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
          this.codeOwnersFilePath = filePath;

          await this.parseCodeOwnersFile(filePath);
          return true;
        } catch {
          // File doesn't exist, continue searching
        }
      }
    }

    return false;
  }

  private async parseCodeOwnersFile(filePath: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(filePath)
      );
      const content = document.getText();
      this.parseCodeOwnersContent(content);
    } catch (error) {
      console.error("Error reading CODEOWNERS file:", error);
    }
  }

  private parseCodeOwnersContent(content: string): void {
    this.codeOwnerRules = [];
    this.allOwners.clear();

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and comments
      if (!line || line.startsWith("#")) {
        continue;
      }

      // Parse the line: pattern followed by owners
      const parts = line.split(/\s+/);
      if (parts.length < 2) {
        continue; // Invalid line
      }

      const pattern = parts[0];
      const owners = parts
        .slice(1)
        .filter((owner) => owner.includes("@"))
        .map((owner) => owner.trim());

      if (owners.length === 0) {
        // Pattern with no owners means "unowned"
        this.codeOwnerRules.push({ pattern, owners: [] });
      } else {
        this.codeOwnerRules.push({ pattern, owners });

        // Add owners to the set of all owners
        owners.forEach((owner) => this.allOwners.add(owner));
      }
    }
  }

  public getCodeOwnerForFile(filePath: string): CodeOwnerInfo {
    if (!this.codeOwnersFilePath || this.codeOwnerRules.length === 0) {
      return { owners: [], isUnowned: true };
    }

    // Convert absolute path to relative path from workspace root
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(filePath)
    );
    if (!workspaceFolder) {
      return { owners: [], isUnowned: true };
    }

    const relativePath = relative(workspaceFolder.uri.fsPath, filePath);
    const normalizedPath = relativePath.replace(/\\/g, "/"); // Normalize to forward slashes

    // Find the last matching rule (highest precedence)
    const matchingRule: CodeOwnerRule | undefined =
      this.codeOwnerRules.findLast((rule) =>
        this.matchesPattern(normalizedPath, rule.pattern)
      );

    if (!matchingRule) {
      return { owners: [], isUnowned: true };
    }

    return {
      owners: matchingRule.owners,
      isUnowned: matchingRule.owners.length === 0,
      matchingPattern: matchingRule.pattern,
    };
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert glob patterns to regex
    // Handle CODEOWNERS pattern matching according to gitignore-style rules

    // Handle global pattern
    if (pattern === "*") {
      return true; // Matches everything
    }

    // Handle directory patterns (both with and without trailing slash)
    if (
      pattern.endsWith("/") ||
      (!pattern.includes("*") && !pattern.includes("."))
    ) {
      // Directory pattern - should match files within the directory
      const dirPattern = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;

      // Handle absolute paths (starting with /)
      if (dirPattern.startsWith("/")) {
        const absoluteDir = dirPattern.slice(1);
        const matches =
          filePath.startsWith(absoluteDir + "/") || filePath === absoluteDir;

        return matches;
      } else {
        // Relative directory pattern - can match anywhere in the path
        const matches =
          filePath.startsWith(dirPattern + "/") ||
          filePath.includes("/" + dirPattern + "/") ||
          filePath === dirPattern;

        return matches;
      }
    }

    // Handle file extension patterns
    if (pattern.startsWith("*.")) {
      const extension = pattern.slice(1);
      const matches = filePath.endsWith(extension);

      return matches;
    }

    // Handle absolute paths from root
    if (pattern.startsWith("/")) {
      const rootPattern = pattern.slice(1);
      const matches = filePath.startsWith(rootPattern);

      return matches;
    }

    // Handle wildcard patterns
    if (pattern.includes("*")) {
      const regexPattern = pattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");

      try {
        const regex = new RegExp("^" + regexPattern + "$");
        const matches = regex.test(filePath);

        return matches;
      } catch (error) {
        console.warn("Invalid pattern:", pattern, error);
        return false;
      }
    }

    // Exact match or file name match
    const matches = filePath === pattern || filePath.endsWith("/" + pattern);

    return matches;
  }

  public getAllOwners(): string[] {
    return Array.from(this.allOwners).sort();
  }

  public getFilePatternsForOwner(owner: string): {
    includePatterns: string[];
    excludePatterns: string[];
  } {
    if (owner === "unowned") {
      return this.getPatternsForUnowned();
    }

    if (owner === "owned-by-all") {
      return this.getPatternsForAllOwned();
    }

    return this.getPatternsForSpecificOwner(owner);
  }

  /**
   * Get patterns for unowned files
   */
  private getPatternsForUnowned(): {
    includePatterns: string[];
    excludePatterns: string[];
  } {
    const unownedPatterns = this.getUnownedPatterns();

    return {
      includePatterns: unownedPatterns.length > 0 ? unownedPatterns : ["**/*"],
      excludePatterns:
        unownedPatterns.length > 0 ? [] : this.getAllOwnedPatterns(),
    };
  }

  /**
   * Get patterns for all owned files
   */
  private getPatternsForAllOwned(): {
    includePatterns: string[];
    excludePatterns: string[];
  } {
    const ownedPatterns = this.getAllOwnedPatterns();

    return {
      includePatterns: ownedPatterns.length > 0 ? ownedPatterns : ["**/*"],
      excludePatterns: this.getUnownedPatterns(),
    };
  }

  /**
   * Get patterns for a specific owner using include/exclude logic
   */
  private getPatternsForSpecificOwner(owner: string): {
    includePatterns: string[];
    excludePatterns: string[];
  } {
    const ownerRules = this.codeOwnerRules.filter((rule) =>
      rule.owners.includes(owner)
    );

    // Find all patterns that mention this owner
    const ownerPatterns = new Set(ownerRules.map((rule) => rule.pattern));

    if (ownerPatterns.size === 0) {
      return { includePatterns: [], excludePatterns: [] };
    }

    // Find patterns that override this owner's patterns
    // Only consider a pattern as overriding if it would match the same files
    // but assigns ownership to different owners (excluding the current owner)
    const excludePatterns = new Set<string>();

    for (const ownerRule of ownerRules) {
      const overridingPatterns = this.findOverridingPatterns(ownerRule, owner);
      overridingPatterns.forEach((overridingPattern) =>
        excludePatterns.add(overridingPattern)
      );
    }

    // Remove any exclude patterns that are also include patterns
    // This handles the case where the same pattern appears multiple times with the same owner
    const deduplicatedExcludes = excludePatterns.difference(ownerPatterns);

    return {
      includePatterns: [...ownerPatterns],
      excludePatterns: [...deduplicatedExcludes],
    };
  }

  /**
   * Find patterns that override a specific owner's pattern
   */
  private findOverridingPatterns(
    ownerRule: CodeOwnerRule,
    owner: string
  ): string[] {
    const overrides: string[] = [];
    const ownerRuleIndex = this.codeOwnerRules.indexOf(ownerRule);

    // Look for later rules that would override this owner's rule
    for (let i = ownerRuleIndex + 1; i < this.codeOwnerRules.length; i++) {
      const laterRule = this.codeOwnerRules[i];

      // If the later rule would match files that this owner's rule would match,
      // and the later rule doesn't include this owner, then it's an override
      // BUT: Don't consider it an override if it's an exact pattern match and the later rule also includes this owner
      if (
        this.wouldOverride(ownerRule.pattern, laterRule.pattern) &&
        !laterRule.owners.includes(owner)
      ) {
        overrides.push(laterRule.pattern);
      }
    }

    return overrides;
  }

  /**
   * Check if laterPattern would override files matched by earlierPattern
   */
  private wouldOverride(earlierPattern: string, laterPattern: string): boolean {
    // Exact match
    if (earlierPattern === laterPattern) {
      return true;
    }

    // More specific directory path overrides broader pattern
    // e.g., "/api/*.js" overrides "*.js"
    if (
      earlierPattern.startsWith("*.") &&
      laterPattern.includes("/") &&
      laterPattern.endsWith(earlierPattern.substring(1))
    ) {
      return true;
    }

    // Specific file overrides pattern
    // e.g., "/src/extension.ts" overrides "*.ts"
    if (
      earlierPattern.startsWith("*.") &&
      laterPattern.includes("/") &&
      !laterPattern.includes("*")
    ) {
      const extension = earlierPattern.substring(1);
      return laterPattern.endsWith(extension);
    }

    // Directory pattern is overridden by more specific directory pattern
    // e.g., "/src/components/*.ts" overrides "/src/*.ts"
    if (earlierPattern.includes("/") && laterPattern.includes("/")) {
      const earlierBase = earlierPattern.replace(/\/?\*.*$/, "");
      const laterBase = laterPattern.replace(/\/?\*.*$/, "");

      if (
        laterBase.startsWith(earlierBase) &&
        laterBase.length > earlierBase.length
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all patterns that assign ownership (not unowned)
   */
  private getAllOwnedPatterns(): string[] {
    return this.codeOwnerRules
      .filter((rule) => rule.owners.length > 0)
      .map((rule) => rule.pattern);
  }

  /**
   * Get all patterns that are explicitly unowned
   */
  private getUnownedPatterns(): string[] {
    return this.codeOwnerRules
      .filter((rule) => rule.owners.length === 0)
      .map((rule) => rule.pattern);
  }

  /**
   * Convert CODEOWNERS patterns to VSCode include patterns
   */
  public generateIncludePatterns(includePatterns: string[]): string[] {
    return includePatterns.map((pattern) => {
      if (pattern === "*") {
        return "**/*";
      }

      if (pattern.startsWith("/")) {
        return pattern.slice(1);
      }

      if (pattern.endsWith("/")) {
        return pattern + "**/*";
      }

      if (pattern.startsWith("*.")) {
        return "**/" + pattern;
      }

      return "**/" + pattern;
    });
  }

  /**
   * Convert CODEOWNERS patterns to VSCode exclude patterns
   */
  public generateExcludePatterns(excludePatterns: string[]): string[] {
    return excludePatterns.map((pattern) => {
      if (pattern === "*") {
        return "**/*";
      }

      if (pattern.startsWith("/")) {
        return pattern.slice(1);
      }

      if (pattern.endsWith("/")) {
        return pattern + "**/*";
      }

      if (pattern.startsWith("*.")) {
        return "**/" + pattern;
      }

      return "**/" + pattern;
    });
  }

  public hasCodeOwnersFile(): boolean {
    return this.codeOwnersFilePath !== null;
  }

  public getCodeOwnersFilePath(): string | null {
    return this.codeOwnersFilePath;
  }

  public async refresh(): Promise<boolean> {
    return await this.initialize();
  }
}
