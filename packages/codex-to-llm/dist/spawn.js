import * as path from "node:path";
export function quoteCmdArg(arg) {
    if (arg.length === 0) {
        return "\"\"";
    }
    if (!/[\s"]/g.test(arg)) {
        return arg;
    }
    return `"${arg.replace(/"/g, "\"\"")}"`;
}
export function resolveSpawnForPlatform(cliPath, cliArgs, platform = process.platform) {
    const ext = path.extname(cliPath).toLowerCase();
    const isCmdShim = platform === "win32" && [".cmd", ".bat"].includes(ext);
    const useCmdWrapper = platform === "win32" && (isCmdShim || !ext);
    if (!useCmdWrapper) {
        return { command: cliPath, args: cliArgs };
    }
    return {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", [cliPath, ...cliArgs].map(quoteCmdArg).join(" ")]
    };
}
export function resolveSpawn(cliPath, cliArgs) {
    return resolveSpawnForPlatform(cliPath, cliArgs, process.platform);
}
//# sourceMappingURL=spawn.js.map