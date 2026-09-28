#!/usr/bin/env node
// PreToolUse guard: enforces CLAUDE.md rules deterministically instead of relying on the model
// remembering them (ADR-014). Written in Node because Node 20 is already a prerequisite and it
// runs the same on macOS, Linux, and Windows.
//
// Exit 2 blocks the tool call and shows stderr to Claude.
// A JSON `permissionDecision: "ask"` on stdout escalates the call to the user instead.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = 'Trello-Clone-BE/prisma/migrations/';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // not a hook payload; nothing to guard
}

const tool = input.tool_name ?? '';
const args = input.tool_input ?? {};
const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

function block(reason) {
  process.stderr.write(`Blocked by .claude/hooks/guard.mjs: ${reason}\n`);
  process.exit(2);
}

function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function git(...gitArgs) {
  return execFileSync('git', ['-C', projectDir, ...gitArgs], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

// `.env`, `.env.local`, `.env.production`, … but never `.env.example`.
const isSecretEnvName = (name) => /^\.env(\.[\w-]+)?$/.test(name) && name !== '.env.example';

if (['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const filePath = args.file_path ?? args.notebook_path ?? '';
  if (!filePath) process.exit(0);

  if (isSecretEnvName(path.basename(filePath))) {
    block(`${filePath} may hold real secrets. Only .env.example may be read or edited (CLAUDE.md §5).`);
  }
  if (tool === 'Read') process.exit(0);

  const rel = path.relative(projectDir, path.resolve(projectDir, filePath)).split(path.sep).join('/');
  if (rel.startsWith(MIGRATIONS_DIR)) {
    let merged = false;
    try {
      git('cat-file', '-e', `origin/main:${rel}`);
      merged = true;
    } catch {
      // not on origin/main (or no remote yet): a new migration, allowed
    }
    if (merged) {
      block(`${rel} is already merged into main. Fix forward with a new migration (CLAUDE.md §4).`);
    }
  }
  process.exit(0);
}

if (tool === 'Bash') {
  const cmd = String(args.command ?? '');

  // Reading or writing real env files through the shell bypasses the Read/Edit deny rules.
  for (const m of cmd.matchAll(/(?:^|[\s/="'])(\.env(?:\.[\w-]+)?)(?=[\s"';|&)<>]|$)/g)) {
    if (isSecretEnvName(m[1])) {
      block(`the command touches ${m[1]}, which may hold real secrets (CLAUDE.md §5). Ask the user to do this.`);
    }
  }

  if (/\bgit\b[^;&|]*\bpush\b/.test(cmd)) {
    // Explicit refspecs: `origin main`, `HEAD:main`, `+main`, `refs/heads/main`, `:main` (delete).
    const pushArgs = cmd.replace(/^[\s\S]*?\bpush\b/, ' ').split(/[;&|]/)[0];
    if (/(?:^|[\s:+])(?:refs\/heads\/)?main(?=[\s)]|$)/.test(pushArgs)) {
      block('pushing to main is not allowed; open a pull request (CLAUDE.md §8).');
    }
    // A bare `git push` while main is checked out also lands on main.
    let branch = '';
    try {
      branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    } catch {
      // not a git checkout
    }
    if (branch === 'main') {
      block('main is checked out; create a feature branch and open a pull request (CLAUDE.md §8).');
    }
  }

  if (/\bprisma\s+(?:migrate\s+reset|db\s+push)\b/.test(cmd)) {
    ask('Destroys or bypasses migrations. Only ever against a local database, with explicit user approval (database skill).');
  }
}

process.exit(0);
