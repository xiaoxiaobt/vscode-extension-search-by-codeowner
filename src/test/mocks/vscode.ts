export interface MockWorkspaceFolder {
  uri: { fsPath: string };
  name: string;
  index: number;
}

export const workspace = {
  workspaceFile: undefined as { scheme: string; fsPath: string } | undefined,
  workspaceFolders: [] as MockWorkspaceFolder[],
  getConfiguration: () => ({
    get: (_key: string, defaultValue?: unknown) => defaultValue,
  }),
  fs: {
    stat: async () => ({ type: 1 }),
    readFile: async () => new Uint8Array(),
  },
  openTextDocument: async (uri: { fsPath: string }) => ({
    getText: () => "",
    uri,
  }),
  getWorkspaceFolder: (_uri: { fsPath: string }) => undefined as MockWorkspaceFolder | undefined,
};

export const Uri = {
  file: (fsPath: string) => ({
    fsPath,
    scheme: "file",
    path: fsPath,
  }),
  joinPath: (base: { fsPath: string }, ...segments: string[]) => {
    const parts = [base.fsPath, ...segments].filter(Boolean);
    return {
      fsPath: parts.join("/"),
      scheme: "file",
      path: parts.join("/"),
    };
  },
};
