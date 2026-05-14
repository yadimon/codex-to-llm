const PASSTHROUGH = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "SystemRoot",
  "SystemDrive",
  "ComSpec",
  "windir",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
  "NODE_EXTRA_CA_CERTS"
] as const;

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface BuildChildEnvOptions {
  codexHome: string;
  envPassthrough?: string[];
}

export function buildChildEnv(options: BuildChildEnvOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { CODEX_HOME: options.codexHome };

  for (const key of PASSTHROUGH) {
    const value = process.env[key];
    if (value != null) {
      env[key] = value;
    }
  }

  const extras = collectExtras(options.envPassthrough);
  for (const key of extras) {
    if (!ENV_NAME_PATTERN.test(key)) {
      throw new Error(`Invalid env passthrough name: ${key}`);
    }
    const value = process.env[key];
    if (value != null) {
      env[key] = value;
    }
  }

  return env;
}

function collectExtras(explicit: string[] | undefined): string[] {
  const extras: string[] = explicit ? [...explicit] : [];
  const fromEnv = process.env.CODEX_TO_LLM_ENV_PASSTHROUGH;
  if (fromEnv && fromEnv.trim()) {
    for (const raw of fromEnv.split(",")) {
      const trimmed = raw.trim();
      if (trimmed) {
        extras.push(trimmed);
      }
    }
  }
  return extras;
}
