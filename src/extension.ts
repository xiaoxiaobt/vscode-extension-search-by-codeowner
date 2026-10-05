import * as vscode from "vscode";
import type { ExtensionContext } from "vscode";
import { window, commands } from "vscode";
import { CodeOwnerSearchProvider } from "./searchProvider";
import { CodeOwnerService } from "./codeOwnerService";
import { GitIgnoreService } from "./gitIgnoreService";
import { CodeOwnerAgentTools } from "./agentTools";

const CURSOR_MCP_SERVER_NAME = "search-by-code-owner";
const AUTO_REGISTER_SETTING = "codeOwner.mcp.autoRegister";

let registeredCursorServerName: string | undefined;

export const activate = (context: ExtensionContext) => {
  const codeOwnerService = new CodeOwnerService();
  const gitIgnoreService = new GitIgnoreService();
  const initialized = Promise.all([
    codeOwnerService.initialize(),
    gitIgnoreService.initialize(),
  ]);

  if (typeof vscode.lm?.registerTool === "function") {
    new CodeOwnerAgentTools(
      codeOwnerService,
      gitIgnoreService,
      initialized,
    ).register(context);
  }

  if (!registerCursorMcpServer(context)) {
    registerMcpServer(context);
  }

  const searchProvider = new CodeOwnerSearchProvider(
    context.extensionUri,
    codeOwnerService,
    gitIgnoreService,
  );

  context.subscriptions.push(
    window.registerWebviewViewProvider("codeOwner.searchView", searchProvider),
    window.onDidChangeActiveTextEditor(() => {
      searchProvider.updateActiveFileInfo();
    }),
    window.onDidChangeWindowState(() => {
      searchProvider.updateActiveFileInfo();
    }),
    commands.registerCommand("codeOwner.refresh", () => {
      searchProvider.refresh();
    }),
  );

  initialized.then(() => {
    searchProvider.initializeData();
  });
};

export const deactivate = () => {
  unregisterCursorMcpServer();
};

const getWorkspaceRoots = (): string[] =>
  (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);

const getMcpProcessEnv = (roots: string[]): Record<string, string> => ({
  ELECTRON_RUN_AS_NODE: "1",
  WORKSPACE_FOLDER: roots[0] ?? "",
  WORKSPACE_ROOTS: JSON.stringify(roots),
});

const unregisterCursorMcpServer = (): void => {
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
};

const registerCursorMcpServer = (context: ExtensionContext): boolean => {
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
    vscode.workspace.onDidChangeWorkspaceFolders(applyRegistration),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(AUTO_REGISTER_SETTING)) {
        applyRegistration();
      }
    }),
    { dispose: unregisterCursorMcpServer },
  );

  return true;
};

const registerMcpServer = (context: ExtensionContext): void => {
  if (typeof vscode.lm?.registerMcpServerDefinitionProvider !== "function") {
    console.warn(
      "Search by Code Owner: MCP server definition provider API unavailable",
    );
    return;
  }

  try {
    context.subscriptions.push(
      vscode.lm.registerMcpServerDefinitionProvider(
        "search-by-code-owner.mcp",
        {
          provideMcpServerDefinitions: async () => [
            new vscode.McpStdioServerDefinition(
              "Search by Code Owner",
              process.execPath,
              [context.asAbsolutePath("out/mcpServer.js")],
              getMcpProcessEnv(getWorkspaceRoots()),
              "0.2.2",
            ),
          ],
          resolveMcpServerDefinition: async (server) => server,
        },
      ),
    );
    console.info("Search by Code Owner: MCP provider registered");
  } catch (error) {
    console.error(
      "Search by Code Owner: MCP provider registration failed",
      error,
    );
  }
};
