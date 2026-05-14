import {
  runPrompt as defaultRunPrompt,
  streamPrompt as defaultStreamPrompt
} from "@yadimon/codex-to-llm";
import { defaultRunnerOptions } from "../config.js";
import type { Runner, ServerOptions } from "../types.js";

export function createDefaultRunner(options: ServerOptions): Runner {
  return {
    runPrompt(prompt, requestOptions = {}) {
      return defaultRunPrompt(prompt, {
        ...defaultRunnerOptions(options),
        ...requestOptions
      });
    },
    streamPrompt(prompt, requestOptions = {}) {
      return defaultStreamPrompt(prompt, {
        ...defaultRunnerOptions(options),
        ...requestOptions
      });
    }
  };
}
