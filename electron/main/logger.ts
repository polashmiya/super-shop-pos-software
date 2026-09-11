import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/**
 * Minimal file logger for troubleshooting at a shop without developer
 * tools. Logs live in <userData>/logs/main.log and rotate at 2 MB.
 */
const MAX_LOG_BYTES = 2 * 1024 * 1024;

type Level = 'INFO' | 'WARN' | 'ERROR';

let logFilePath: string | null = null;

function resolveLogFile(): string | null {
  if (logFilePath) return logFilePath;
  try {
    const directory = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(directory, { recursive: true });
    logFilePath = path.join(directory, 'main.log');
    return logFilePath;
  } catch {
    return null;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function write(level: Level, message: string, error?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${error === undefined ? '' : ` :: ${describe(error)}`}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.info(line);

  const file = resolveLogFile();
  if (!file) return;
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) {
      fs.renameSync(file, `${file}.1`);
    }
    fs.appendFileSync(file, `${line}\n`, 'utf-8');
  } catch {
    // Logging must never crash the POS.
  }
}

export const logger = {
  info: (message: string) => write('INFO', message),
  warn: (message: string, error?: unknown) => write('WARN', message, error),
  error: (message: string, error?: unknown) => write('ERROR', message, error),
};
