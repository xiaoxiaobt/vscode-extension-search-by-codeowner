import * as vscode from "vscode";
import { join } from "path";

export class GitIgnoreService {
  private gitIgnorePatterns: string[] = [];
  private gitIgnoreFilePath: string | null = null;

  public async initialize(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return false;
    }

    // Look for .gitignore file in workspace root
    for (const folder of workspaceFolders) {
      const filePath = join(folder.uri.fsPath, ".gitignore");
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        this.gitIgnoreFilePath = filePath;
        await this.parseGitIgnoreFile(filePath);
        return true;
      } catch {
        // File doesn't exist, continue searching
      }
    }

    return false;
  }

  private async parseGitIgnoreFile(filePath: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(filePath)
      );
      const content = document.getText();
      this.parseGitIgnoreContent(content);
    } catch (error) {
      console.error("Error reading .gitignore file:", error);
    }
  }

  private parseGitIgnoreContent(content: string): void {
    this.gitIgnorePatterns = [];
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      // Convert gitignore patterns to search exclude patterns
      let pattern = trimmedLine;

      // Handle negation patterns (we'll skip these for now as they're complex)
      if (pattern.startsWith("!")) {
        continue;
      }

      // Convert gitignore patterns to glob patterns suitable for VSCode search
      pattern = this.convertGitIgnorePatternToGlob(pattern);

      if (pattern) {
        this.gitIgnorePatterns.push(pattern);
      }
    }
  }

  private convertGitIgnorePatternToGlob(pattern: string): string {
    // Remove leading slash if present
    if (pattern.startsWith("/")) {
      pattern = pattern.substring(1);
    }

    // If pattern doesn't contain '/', it applies to files in any directory
    if (!pattern.includes("/")) {
      return `**/${pattern}`;
    }

    // If pattern ends with '/', it's a directory
    if (pattern.endsWith("/")) {
      return `**/${pattern}**`;
    }

    // Handle patterns with wildcards
    return `**/${pattern}`;
  }

  public getIgnorePatterns(): string[] {
    return [...this.gitIgnorePatterns];
  }

  public hasGitIgnoreFile(): boolean {
    return this.gitIgnoreFilePath !== null;
  }

  public async reload(): Promise<boolean> {
    return this.initialize();
  }
}
