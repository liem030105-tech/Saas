#!/usr/bin/env node
// PostToolUse: format the file Claude just edited with the repo's own Prettier (ADR-014).
// A no-op until Prettier is installed (FOUNDATION-001); it never fails the tool call.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FORMATTED = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css']);

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const filePath = input.tool_input?.file_path;
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const prettier = path.join(projectDir, 'node_modules', '.bin', 'prettier');

  if (filePath && FORMATTED.has(path.extname(filePath)) && existsSync(prettier) && existsSync(filePath)) {
    execFileSync(prettier, ['--write', '--ignore-unknown', '--log-level', 'warn', filePath], {
      cwd: projectDir,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
  }
} catch {
  // formatting is best effort; CI's format:check is the real gate
}
process.exit(0);
