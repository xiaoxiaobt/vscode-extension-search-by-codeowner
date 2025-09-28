import * as vscode from "vscode";
import type { CodeOwnerService } from "./codeOwnerService";
import type { GitIgnoreService } from "./gitIgnoreService";

export class CodeOwnerSearchProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codeOwner.searchView";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _codeOwnerService: CodeOwnerService,
    private readonly _gitIgnoreService: GitIgnoreService
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: vscode.WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "getActiveFileInfo":
          this._sendActiveFileInfo();
          break;
        case "getCodeOwners":
          this._sendCodeOwners();
          break;
        case "searchByCodeOwner":
          this._searchByCodeOwner(data.owner, data.hideGitIgnoreFiles);
          break;
        case "reloadCodeOwners":
          this._reloadCodeOwners();
          break;
      }
    });

    // Send initial data if services are already initialized
    if (this._codeOwnerService.hasCodeOwnersFile()) {
      // Small delay to ensure webview is ready
      setTimeout(() => {
        this._sendCodeOwners();
        this._sendActiveFileInfo();
      }, 100);
    }
  }

  private _getActiveFileCodeOwner(): {
    display: string;
    owners: string[];
    isUnowned: boolean;
  } | null {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return null;
    }

    if (!this._codeOwnerService.hasCodeOwnersFile()) {
      return null;
    }

    const filePath = activeEditor.document.fileName;
    const codeOwnerInfo = this._codeOwnerService.getCodeOwnerForFile(filePath);

    if (codeOwnerInfo.isUnowned || codeOwnerInfo.owners.length === 0) {
      return {
        display: "Unowned",
        owners: [],
        isUnowned: true,
      };
    }

    // Return all owners - display logic will be handled in the UI
    return {
      display: "", // Not used anymore - UI will create badges
      owners: codeOwnerInfo.owners,
      isUnowned: false,
    };
  }

  private _sendActiveFileInfo(): void {
    const codeOwnerInfo = this._getActiveFileCodeOwner();
    const activeEditor = vscode.window.activeTextEditor;

    let fileName = null;
    if (activeEditor) {
      fileName = activeEditor.document.fileName.split("/").pop();
    }

    if (this._view) {
      this._view.webview.postMessage({
        type: "activeFileInfo",
        codeOwner: codeOwnerInfo,
        fileName: fileName,
        hasCodeOwnersFile: this._codeOwnerService.hasCodeOwnersFile(),
      });
    }
  }

  public refresh(): void {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }

  public updateActiveFileInfo(): void {
    // Only send if webview is available
    if (this._view) {
      this._sendActiveFileInfo();
    }
  }

  public initializeData(): void {
    if (this._view) {
      this._sendCodeOwners();
      this._sendActiveFileInfo();
    }
  }

  private _sendCodeOwners(): void {
    if (this._view) {
      const allOwners = this._codeOwnerService.getAllOwners();
      const hasCodeOwnersFile = this._codeOwnerService.hasCodeOwnersFile();

      this._view.webview.postMessage({
        type: "codeOwners",
        owners: allOwners,
        hasCodeOwnersFile: hasCodeOwnersFile,
        codeOwnersPath: this._codeOwnerService.getCodeOwnersFilePath(),
      });
    }
  }

  private async _reloadCodeOwners(): Promise<void> {
    try {
      const [codeOwnerSuccess, gitIgnoreSuccess] = await Promise.all([
        this._codeOwnerService.initialize(),
        this._gitIgnoreService.initialize(),
      ]);

      if (codeOwnerSuccess) {
        // Send updated code owners to webview
        this._sendCodeOwners();
        // Update active file info with new ownership data
        this._sendActiveFileInfo();

        const gitIgnoreStatus = gitIgnoreSuccess ? " and .gitignore" : "";
        vscode.window.showInformationMessage(
          `CODEOWNERS${gitIgnoreStatus} file(s) reloaded successfully`
        );
      } else {
        vscode.window.showWarningMessage(
          "No CODEOWNERS file found in workspace"
        );
      }
    } catch (error) {
      console.error("Error reloading files:", error);
      vscode.window.showErrorMessage("Failed to reload CODEOWNERS file");
    }
  }

  private async _searchByCodeOwner(
    owner: string,
    hideGitIgnoreFiles = true
  ): Promise<void> {
    if (!this._codeOwnerService.hasCodeOwnersFile()) {
      vscode.window.showWarningMessage("No CODEOWNERS file found in workspace");
      return;
    }

    try {
      // First, open the native search sidebar to ensure it's available
      await vscode.commands.executeCommand("workbench.view.search");

      // Small delay to ensure the search view is ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Try to read current search state
      const currentSearchState = await this._getCurrentSearchState();

      const ownership = this._codeOwnerService.getFilePatternsForOwner(owner);

      // Generate include and exclude patterns for the selected owner
      const includePatterns = this._codeOwnerService.generateIncludePatterns(
        ownership.includePatterns
      );
      const excludePatterns = this._codeOwnerService.generateExcludePatterns(
        ownership.excludePatterns
      );

      // Add gitignore exclusions if enabled
      if (hideGitIgnoreFiles && this._gitIgnoreService.hasGitIgnoreFile()) {
        const gitIgnorePatterns = this._gitIgnoreService.getIgnorePatterns();
        excludePatterns.push(...gitIgnorePatterns);
      }

      if (includePatterns.length === 0) {
        vscode.window.showInformationMessage(
          `No files found for code owner: ${owner}`
        );
        return;
      }

      // Preserve current search query and replace text, only modify include/exclude
      const includeString = includePatterns.join(",");
      const excludeString = excludePatterns.join(",");

      try {
        // Simply set the search parameters, preserving only the query
        await vscode.commands.executeCommand("workbench.action.findInFiles", {
          query: currentSearchState.query || "",
          filesToInclude: includeString,
          filesToExclude: excludeString,
        });

        let message = `Applied "${owner}" file filters`;
        if (currentSearchState.query) {
          message += `\nPreserved query: "${currentSearchState.query}"`;
        }
        message += `\nInclude: ${includeString}`;
        if (excludeString) {
          message += `\nExclude: ${excludeString}`;
        }

        vscode.window.showInformationMessage(message);
      } catch {
        // Fallback: just focus search input and show patterns
        await vscode.commands.executeCommand(
          "search.action.focusQueryEditorWidget"
        );
        const patternInfo = excludeString
          ? `Include: ${includeString}, Exclude: ${excludeString}`
          : `Include: ${includeString}`;
        vscode.window.showInformationMessage(
          `Filters applied for "${owner}". ${patternInfo}`
        );
      }
    } catch (error) {
      console.error("Error applying code owner filters:", error);
      vscode.window.showErrorMessage(
        `Failed to apply code owner filters: ${error}`
      );
    }
  }

  /**
   * Attempt to read current search query from native search panel
   */
  private async _getCurrentSearchState(): Promise<{ query?: string }> {
    try {
      // Try to use clipboard method to read current search query
      const originalClipboard = await vscode.env.clipboard.readText();
      let currentQuery = "";

      // Focus search query field and try to read it
      await vscode.commands.executeCommand(
        "search.action.focusQueryEditorWidget"
      );
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Select all and copy to get current query
      await vscode.commands.executeCommand("editor.action.selectAll");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await vscode.commands.executeCommand("editor.action.clipboardCopyAction");
      await new Promise((resolve) => setTimeout(resolve, 50));

      const queryText = await vscode.env.clipboard.readText();
      if (queryText && queryText !== originalClipboard) {
        currentQuery = queryText;
      }

      // Restore original clipboard
      await vscode.env.clipboard.writeText(originalClipboard);

      const result = {
        query: currentQuery,
      };

      return result;
    } catch (error) {
      console.warn("Could not read current search state:", error);
      return {};
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
    );
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <title>Search by Code Owner</title>
            </head>
            <body>
                <div class="search-container">
                    <div class="active-file-info">
                        <div id="activeFileDisplay" class="file-display">
                            <div class="file-label">Active File Owner(s) </div>
                            <div id="fileCodeOwner" class="code-owner-badges"></div>
                        </div>
                    </div>
                    
                    <div class="search-inputs">
                        <div class="main-action">
                            <h3>Code Owner File Filters</h3>
                            <p>Apply include/exclude patterns to VSCode's native search based on code ownership:</p>
                            
                            <div class="code-owner-selector">
                                <label for="codeOwnerInput">Select or Type Code Owner:</label>
                                <div class="searchable-dropdown">
                                    <input type="text" id="codeOwnerInput" class="code-owner-input" placeholder="Select or type code owner..." autocomplete="off">
                                    <button id="dropdownToggle" class="dropdown-toggle" title="Show all code owners">▼</button>
                                    <div id="codeOwnerDropdown" class="code-owner-dropdown hidden">
                                        <div class="dropdown-item loading">Loading...</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="filter-options">
                                <label class="toggle-container">
                                    <input type="checkbox" id="hideGitIgnore" checked>
                                    <span class="toggle-slider"></span>
                                    <span class="toggle-label">Hide <code>.gitignore</code> ignored patterns</span>
                                </label>
                            </div>
                            
                            <button id="searchByOwnerBtn" class="search-button primary large" title="Apply code owner filters to native search (preserves your search query)">
                                Apply Owner Filters
                            </button>
                        </div>
                    </div>
                    
                    <div class="reload-section">
                        <button id="reloadCodeOwners" class="reload-button" title="Reload CODEOWNERS file">
                            Refresh CODEOWNERS
                        </button>
                    </div>

                </div>
                
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
  }

  private _getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" as const;
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
