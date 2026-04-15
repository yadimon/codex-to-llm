import type { SpawnResolution } from "./types.js";
export declare function quoteCmdArg(arg: string): string;
export declare function resolveSpawnForPlatform(cliPath: string, cliArgs: string[], platform?: NodeJS.Platform): SpawnResolution;
export declare function resolveSpawn(cliPath: string, cliArgs: string[]): SpawnResolution;
//# sourceMappingURL=spawn.d.ts.map