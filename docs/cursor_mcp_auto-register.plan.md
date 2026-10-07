---
name: Cursor MCP auto-register
overview: The Cursor MCP auto-registration path is available to a personal Open VSX / VS Marketplace publisher. Finish the existing stdio MCP registration in the VS Code extension so Cursor users get tools after installing the extension, without compiling or joining Cursor’s curated plugin marketplace.
todos:
  - id: cursor-types
    content: Add vscode.cursor ambient types; remove enabledApiProposals
    status: completed
  - id: register-stdio
    content: Finish Cursor stdio register/unregister with ELECTRON_RUN_AS_NODE, workspace roots, and opt-out setting
    status: completed
  - id: vscode-fallback
    content: Keep vscode.lm tools + MCP provider only when Cursor API is absent
    status: completed
  - id: docs
    content: "Update README and agent-tools-plan: personal publisher + auto-register; plugin optional"
    status: completed
isProject: false
---

# Cursor MCP auto-register (personal publisher)

## Feasibility (checked)

**This is doable without Cursor Marketplace approval.** `vscode.cursor.mcp.registerServer` is a Cursor-injected extension API for **any VS Code extension running inside Cursor**, not a partner-only or proposed-API gate.

Evidence:

- Cursor docs: [Extension API reference](https://cursor.com/docs/context/mcp-extension-api) — “Use these APIs from VS Code extensions… without editing config files.” Types are a local `declare module "vscode"`, **not** `enabledApiProposals`.
- Cursor staff ([forum](https://forum.cursor.com/t/support-for-language-model-tools/152071)): `vscode.lm.registerTool` is **not** supported; the recommended workaround is `cursor.mcp.registerServer` plus a local MCP server.
- GitLens (a normal VS Marketplace publisher) [calls `cursor.mcp.registerServer` in production](https://github.com/gitkraken/vscode-gitlens/blob/63402fad/src/env/node/gk/mcp/cursorIntegration.ts). Cursor users see the MCP appear automatically. They also expose an opt-out setting after auto-add complaints.

What you **do not** need:

- Cursor official marketplace publisher application (curated, identity review; optional later).
- Being an “approved” extension for `vscode.lm` tools (that path stays VS Code / Copilot only).
- Users compiling TypeScript. Ship bundled [`out/mcpServer.js`](src/mcpServer.ts) in the VSIX you already publish (`vscode:prepublish`).

What still does **not** work in Cursor (keep as VS Code-only fallbacks):

- Native `vscode.lm.registerTool` / `contributes.languageModelTools`
- `vscode.lm.registerMcpServerDefinitionProvider` (Cursor does not implement this; [open request](https://github.com/cursor/cursor/issues/3549))

Residual user friction (not a publisher block): Cursor may still list the server in MCP settings and require enable/trust. Enterprise MCP allowlists can block the spawned command. That is the same class of friction GitLens hits.

```mermaid
flowchart LR
  install[Install OpenVSX VSIX]
  activate[Extension activate]
  register[cursor.mcp.registerServer]
  cursorSpawn[Cursor spawns stdio]
  tools[Agent tools]
  install --> activate --> register --> cursorSpawn --> tools
```

## Implementation

Primary files: [`src/extension.ts`](src/extension.ts), [`package.json`](package.json), [`README.md`](README.md), [`docs/agent-tools-plan.md`](docs/agent-tools-plan.md).

### 1. Treat Cursor registration as the Cursor path

Keep the existing split, but make behavior explicit:

- If `vscode.cursor?.mcp?.registerServer` exists: register stdio MCP; **do not** also call `vscode.lm.registerMcpServerDefinitionProvider`.
- Else if VS Code LM MCP provider exists: keep current [`registerMcpServer`](src/extension.ts) for Copilot/VS Code.
- Keep native LM tools when `registerTool` exists (VS Code).

Remove [`enabledApiProposals: ["cursor"]`](package.json) — that is Microsoft proposed-API machinery and is the wrong way to access Cursor’s namespace. Add a small ambient types file (GitLens pattern: `src/@types/vscode.cursor.d.ts`) matching Cursor’s documented `StdioServerConfig` / `unregisterServer`.

### 2. Finish stdio launch so Cursor can actually run the bundle

Current config uses `process.execPath` + [`out/mcpServer.js`](src/extension.ts). In Cursor that binary is Electron, not Node.

Register:

- `command`: `process.execPath`
- `args`: `[context.asAbsolutePath("out/mcpServer.js")]`
- `env`: `ELECTRON_RUN_AS_NODE: "1"`, plus existing `WORKSPACE_FOLDER` / `WORKSPACE_ROOTS`

Use a stable server **name** (e.g. `search-by-code-owner`) for unregister. Cursor launches the process; the extension must not spawn stdio itself.

Ensure `out/mcpServer.js` is included in the VSIX (already produced by `compile` / `vscode:prepublish`).

### 3. Lifecycle

- Call `unregisterServer` on deactivate and before re-register.
- Re-register on `workspace.onDidChangeWorkspaceFolders` so roots stay current.
- Optional setting `codeOwner.mcp.autoRegister` (default `true`) so users can turn auto-add off without uninstalling — GitLens needed this.

### 4. Docs and plugin story

Update README / agent-tools plan:

- Cursor users: install the published extension → MCP is registered automatically.
- Native LM tools remain VS Code/Copilot.
- Keep [`cursor-plugin/`](cursor-plugin/) as an optional/manual fallback, not the required Cursor distribution. Do not write `~/.cursor/mcp.json` from the extension.

### 5. Verify locally (no marketplace needed)

Load the extension in Cursor (`extensionDevelopmentPath` or a local VSIX). Confirm `vscode.cursor.mcp.registerServer` is present, the server appears in Cursor MCP settings, and the three tools (`codeOwner_listFiles`, `codeOwner_searchFiles`, `codeOwner_findMatchingOwners`) run against a CODEOWNERS workspace. Confirm VS Code still activates without the Cursor namespace.
