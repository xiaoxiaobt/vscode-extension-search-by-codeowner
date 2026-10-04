import * as vscode from "vscode";
import type { ExtensionContext } from "vscode";
import { window, commands } from "vscode";
import { CodeOwnerSearchProvider } from "./searchProvider";
import { CodeOwnerService } from "./codeOwnerService";
import { GitIgnoreService } from "./gitIgnoreService";
import { CodeOwnerAgentTools } from "./agentTools";

const CURSOR_MCP_SERVER_NAME = "search-by-code-owner";
const AUTO_REGISTER_SETTING = "codeOwner.mcp.autoRegister";

interface LanguageModelApiShape {
  registerTool?: unknown;
  registerMcpServerDefinitionProvider?: unknown;
}

let registeredCursorServerName: string | undefined;

export function activate(context: ExtensionContext) {
  // Create the code owner service
  const codeOwnerService = new CodeOwnerService();

  // Create the gitignore service
  const gitIgnoreService = new GitIgnoreService();
  const initialized = Promise.all([
    codeOwnerService.initialize(),
    gitIgnoreService.initialize(),
  ]);

  // Register native tools only when the host provides the Language Model API.
  const languageModelApi = (
    vscode as unknown as {
      lm?: LanguageModelApiShape;
    }
  ).lm;
  if (typeof languageModelApi?.registerTool === "function") {
    new CodeOwnerAgentTools(
      codeOwnerService,
      gitIgnoreService,
      initialized,
    ).register(context);
  }

  if (!registerCursorMcpServer(context)) {
    registerMcpServer(context, languageModelApi);
  }

  // Create the search provider with services
  const searchProvider = new CodeOwnerSearchProvider(
    context.extensionUri,
    codeOwnerService,
    gitIgnoreService,
  );

  // Register the webview view provider
  context.subscriptions.push(
    window.registerWebviewViewProvider("codeOwner.searchView", searchProvider),
  );

  // Listen for active editor changes to update file info
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(() => {
      searchProvider.updateActiveFileInfo();
    }),
  );

  // Also listen for window state changes (helps with binary files)
  context.subscriptions.push(
    window.onDidChangeWindowState(() => {
      searchProvider.updateActiveFileInfo();
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
  initialized.then(() => {
    searchProvider.initializeData();
  });
}

export function deactivate() {
  unregisterCursorMcpServer();
}

function getWorkspaceRoots(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map(
    (folder) => folder.uri.fsPath,
  );
}

function getMcpProcessEnv(roots: string[]): Record<string, string> {
  return {
    ELECTRON_RUN_AS_NODE: "1",
    WORKSPACE_FOLDER: roots[0] ?? "",
    WORKSPACE_ROOTS: JSON.stringify(roots),
  };
}

function unregisterCursorMcpServer(): void {
  const unregister = vscode.cursor?.mcp?.unregisterServer;
  if (
    typeof unregister !== "function" ||
    registeredCursorServerName === undefined
  ) {
    return;
  }

  try {
    unregister(registeredCursorServerName);
  } catch (error) {
    console.error(
      "Search by Code Owner: Cursor MCP unregistration failed",
      error,
    );
  } finally {
    registeredCursorServerName = undefined;
  }
}

function registerCursorMcpServer(context: ExtensionContext): boolean {
  const cursorMcpApi = vscode.cursor?.mcp;
  if (typeof cursorMcpApi?.registerServer !== "function") {
    return false;
  }

  const applyRegistration = (): void => {
    unregisterCursorMcpServer();
    if (
      vscode.workspace
        .getConfiguration("codeOwner")
        .get<boolean>("mcp.autoRegister", true) !== true
    ) {
      return;
    }

    try {
      cursorMcpApi.registerServer({
        name: CURSOR_MCP_SERVER_NAME,
        server: {
          command: process.execPath,
          args: [context.asAbsolutePath("out/mcpServer.js")],
          env: getMcpProcessEnv(getWorkspaceRoots()),
        },
      });
      registeredCursorServerName = CURSOR_MCP_SERVER_NAME;
      console.info("Search by Code Owner: Cursor MCP server registered");
    } catch (error) {
      console.error(
        "Search by Code Owner: Cursor MCP registration failed",
        error,
      );
    }
  };

  applyRegistration();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      applyRegistration();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(AUTO_REGISTER_SETTING)) {
        applyRegistration();
      }
    }),
    { dispose: unregisterCursorMcpServer },
  );

  return true;
}

function registerMcpServer(
  context: ExtensionContext,
  languageModelApi: LanguageModelApiShape | undefined,
): void {
  if (!languageModelApi) {
    console.warn("Search by Code Owner: Language Model API unavailable");
    return;
  }

  if (
    typeof languageModelApi.registerMcpServerDefinitionProvider !== "function"
  ) {
    console.warn(
      "Search by Code Owner: MCP server definition provider API unavailable",
    );
    return;
  }

  const roots = getWorkspaceRoots();
  const register =
    languageModelApi.registerMcpServerDefinitionProvider as typeof vscode.lm.registerMcpServerDefinitionProvider;

  try {
    context.subscriptions.push(
      register.call(vscode.lm, "search-by-code-owner.mcp", {
        provideMcpServerDefinitions: async () => [
          new vscode.McpStdioServerDefinition(
            "Search by Code Owner",
            process.execPath,
            [context.asAbsolutePath("out/mcpServer.js")],
            getMcpProcessEnv(roots),
            "0.2.2",
          ),
        ],
        resolveMcpServerDefinition: async (server) => server,
      }),
    );
    console.info("Search by Code Owner: MCP provider registered");
  } catch (error) {
    console.error(
      "Search by Code Owner: MCP provider registration failed",
      error,
    );
  }
}
