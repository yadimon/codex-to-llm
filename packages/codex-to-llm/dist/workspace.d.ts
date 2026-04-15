export declare function resolveDefaultAuthPath(): string;
export declare function resolveAuthPath(explicitPath?: string): string;
export declare function prepareAuthCopy(options?: {
    authPath?: string;
    targetPath?: string;
    targetDir?: string;
}): string;
export declare function createCodexHome(options?: {
    authPath?: string;
    configHome?: string;
}): string;
export declare function createWorkspace(workspacePath?: string): string;
export declare function cleanupDirectory(directoryPath: string | undefined, shouldCleanup: boolean): void;
//# sourceMappingURL=workspace.d.ts.map