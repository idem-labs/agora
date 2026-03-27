import type { LogLevel } from "./config.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(minLevel: LogLevel): Logger {
  const threshold = LEVEL_ORDER[minLevel];

  function log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (LEVEL_ORDER[level] < threshold) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };

    // stdout is reserved for JSON-RPC — all logs go to stderr
    process.stderr.write(JSON.stringify(entry) + "\n");
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
  };
}
