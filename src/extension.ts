import * as vscode from "vscode";
import { CodeOwnerSearchProvider } from "./searchProvider";
import { CodeOwnerService } from "./codeOwnerService";
import { GitIgnoreService } from "./gitIgnoreService";

export function activate(context: vscode.ExtensionContext) {
  // Create the code owner service
  const codeOwnerService = new CodeOwnerService();

  // Create the gitignore service
  const gitIgnoreService = new GitIgnoreService();

  // Create the search provider with services
  const searchProvider = new CodeOwnerSearchProvider(
    context.extensionUri,
    codeOwnerService,
    gitIgnoreService
  );

  // Register the webview view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "codeOwner.searchView",
      searchProvider
    )
  );

  // Listen for active editor changes to update file info
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      searchProvider.updateActiveFileInfo();
    })
  );

  // Also listen for window state changes (helps with binary files)
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(() => {
      searchProvider.updateActiveFileInfo();
    })
  );

  // Register minimal commands
  const commands = [
    vscode.commands.registerCommand("codeOwner.refresh", () => {
      searchProvider.refresh();
    }),
  ];

  context.subscriptions.push(...commands);

  // Initialize services
  Promise.all([
    codeOwnerService.initialize(),
    gitIgnoreService.initialize(),
  ]).then(() => {
    searchProvider.updateActiveFileInfo();
  });
}

export function deactivate() {
  // Cleanup resources if needed
}
