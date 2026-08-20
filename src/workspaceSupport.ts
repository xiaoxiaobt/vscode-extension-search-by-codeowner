import { relative } from "path";
import * as vscode from "vscode";

export const MULTI_ROOT_WORKSPACE_SETTING =
  "codeOwner.experimental.multiRootWorkspace" as const;

export interface NamedWorkspaceRoot {
  name: string;
  /** POSIX path relative to the workspace-file directory; empty string for `.` */
  relativePath: string;
}

export interface RewriteGlobOptions {
  /**
   * When `true` (multi-root workspace or workspace with shifted root), prefix with `./FolderName/` so VS Code
   * Search treats it as a root, not a glob inside every folder.
   */
  prefixFolderName: boolean;
}

export const isOpenedFromWorkspaceFile = (): boolean => {
  const workspaceFile = vscode.workspace.workspaceFile;
  return (
    workspaceFile !== undefined &&
    (workspaceFile.scheme === "file" ||
      workspaceFile.scheme === "vscode-remote")
  );
};

export const isMultiRootWorkspaceSupportEnabled = (): boolean => {
  const settingEnabled = vscode.workspace
    .getConfiguration()
    .get<boolean>(MULTI_ROOT_WORKSPACE_SETTING, false);

  return (
    settingEnabled &&
    isOpenedFromWorkspaceFile() &&
    hasWorkspacePathRewriteEvidence()
  );
};

/**
 * Whether the workspace is a multi-root workspace or a workspace with shifted root
 */
export const hasWorkspacePathRewriteEvidence = (): boolean => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return false;
  }

  if (folders.length >= 2) {
    return true;
  }

  const projectRoot = getWorkspaceFileDirectoryUri();
  if (!projectRoot) {
    return false;
  }

  return toPosixRelative(projectRoot.fsPath, folders[0].uri.fsPath) !== "";
};

export const getWorkspaceFileDirectoryUri = (): vscode.Uri | undefined => {
  const workspaceFile = vscode.workspace.workspaceFile;
  if (!workspaceFile) {
    return undefined;
  }

  return vscode.Uri.joinPath(workspaceFile, "..");
};

export const getProjectRootUri = (): vscode.Uri | undefined => {
  if (!isMultiRootWorkspaceSupportEnabled()) {
    return undefined;
  }

  return getWorkspaceFileDirectoryUri();
};

export const getNamedWorkspaceRoots = (): NamedWorkspaceRoot[] => {
  const projectRoot = getProjectRootUri();
  const folders = vscode.workspace.workspaceFolders;
  if (!projectRoot || !folders) {
    return [];
  }

  return folders.map((folder) => ({
    name: folder.name,
    relativePath: toPosixRelative(projectRoot.fsPath, folder.uri.fsPath),
  }));
};

export const rewritePatternsForWorkspaceFolders = (
  patterns: string[],
): string[] => {
  if (!isMultiRootWorkspaceSupportEnabled()) {
    return patterns;
  }

  const roots = getNamedWorkspaceRoots();
  if (roots.length === 0) {
    return patterns;
  }

  const options: RewriteGlobOptions = {
    prefixFolderName: (vscode.workspace.workspaceFolders?.length ?? 0) >= 2,
  };

  return patterns.map((pattern) =>
    rewriteGlobForNamedRoots(pattern, roots, options),
  );
};

/**
 * Map a repo-root glob onto the most specific workspace folder.
 * Exported for the canonical rewrite rules in docs/workspace-support-plan.md.
 */
export const rewriteGlobForNamedRoots = (
  pattern: string,
  roots: readonly NamedWorkspaceRoot[],
  options: RewriteGlobOptions = { prefixFolderName: true },
): string => {
  const posix = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!posix) {
    return pattern;
  }

  const nestedRoots = [...roots]
    .filter((root) => root.relativePath !== "")
    .sort((a, b) => b.relativePath.length - a.relativePath.length);

  for (const root of nestedRoots) {
    const rest = remainderAfterRoot(posix, root.relativePath);
    if (rest === undefined) {
      continue;
    }
    return formatRootGlob(root.name, rest, options.prefixFolderName);
  }

  if (isUnscopedGlob(posix)) {
    return posix;
  }

  const baseRoot = roots.find((root) => root.relativePath === "");
  if (baseRoot && options.prefixFolderName) {
    return formatRootGlob(baseRoot.name, posix, true);
  }

  return posix;
};

const formatRootGlob = (
  folderName: string,
  rest: string,
  prefixFolderName: boolean,
): string => {
  const pathInsideRoot = rest === "" ? "**/*" : rest;
  if (!prefixFolderName) {
    return pathInsideRoot;
  }
  return `./${folderName}/${pathInsideRoot}`;
};

const toPosixRelative = (fromFsPath: string, toFsPath: string): string => {
  const rel = relative(fromFsPath, toFsPath).replace(/\\/g, "/");
  if (rel === "" || rel === ".") {
    return "";
  }
  return rel;
};

const remainderAfterRoot = (
  pattern: string,
  relativePath: string,
): string | undefined => {
  const prefixes = [relativePath, `**/${relativePath}`];

  for (const prefix of prefixes) {
    if (pattern === prefix) {
      return "";
    }
    if (pattern.startsWith(`${prefix}/`)) {
      return pattern.slice(prefix.length + 1);
    }
  }

  return undefined;
};

const isUnscopedGlob = (pattern: string): boolean => {
  if (pattern === "**" || pattern === "**/*" || pattern === "*") {
    return true;
  }

  if (pattern.startsWith("**/")) {
    return true;
  }

  if (pattern.startsWith("*.")) {
    return true;
  }

  return !pattern.includes("/") && pattern.includes("*");
};
