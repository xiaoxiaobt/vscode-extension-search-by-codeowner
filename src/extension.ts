import type { ExtensionContext } from "vscode";
import { window, commands, workspace } from "vscode";
import { CodeOwnerSearchProvider } from "./searchProvider";
import { CodeOwnerService } from "./codeOwnerService";
import { GitIgnoreService } from "./gitIgnoreService";
import { CommitIdentityService } from "./profile/commitIdentityService";
import { GitHubProfileProvider } from "./profile/githubProfileProvider";
import { ProfileCache } from "./profile/profileCache";
import { ProfileEnrichmentService } from "./profile/profileEnrichmentService";
import { RepositoryService } from "./profile/repositoryService";

export function activate(context: ExtensionContext) {
  // Create the code owner service
  const codeOwnerService = new CodeOwnerService();

  // Create the gitignore service
  const gitIgnoreService = new GitIgnoreService();

  const profileEnrichmentService = new ProfileEnrichmentService(
    new ProfileCache(context.globalState),
    new RepositoryService(),
    [new GitHubProfileProvider()],
    new CommitIdentityService(),
  );

  // Create the search provider with services
  const searchProvider = new CodeOwnerSearchProvider(
    context.extensionUri,
    codeOwnerService,
    gitIgnoreService,
    profileEnrichmentService,
  );

  // Register the webview view provider
  context.subscriptions.push(
    window.registerWebviewViewProvider("codeOwner.searchView", searchProvider)
  );

  // Listen for active editor changes to update file info
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(() => {
      searchProvider.updateActiveFileInfo();
    })
  );

  // Also listen for window state changes (helps with binary files)
  context.subscriptions.push(
    window.onDidChangeWindowState(() => {
      searchProvider.updateActiveFileInfo();
    })
  );

  context.subscriptions.push(
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("searchByCodeOwner.fetchGitHubUserInfo")) {
        searchProvider.updateProfileEnrichment();
      }
    }),
  );

  // Register minimal commands
  const availableCommands = [
    commands.registerCommand("codeOwner.refresh", () => {
      searchProvider.refresh();
    }),
  ];

  context.subscriptions.push(...availableCommands);

  // Initialize services
  Promise.all([
    codeOwnerService.initialize(),
    gitIgnoreService.initialize(),
  ]).then(() => {
    searchProvider.initializeData();
  });
}

export function deactivate() {
  // Cleanup resources if needed
}
