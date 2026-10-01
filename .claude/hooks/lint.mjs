// PostToolUse hook: lint the file Claude just edited, strictly.
// Warnings count (--max-warnings 0): the project rules in eslint.config.mjs
// start as warnings so legacy code still passes `npm run lint`, but any file
// Claude touches must come out clean. Exit 2 shows stderr to Claude.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input.tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

if (!file || !/\.(ts|tsx|mjs)$/.test(file)) process.exit(0);
const rel = relative(root, file).replaceAll("\\", "/");
if (rel.startsWith("..") || !/^(app|components|lib)\//.test(rel)) process.exit(0);

const r = spawnSync(
  process.execPath,
  [join(root, "node_modules", "eslint", "bin", "eslint.js"), "--no-warn-ignored", "--max-warnings", "0", rel],
  { cwd: root, encoding: "utf8" },
);

if (r.status !== 0) {
  process.stderr.write(
    `ESLint found problems in ${rel}. Fix them before moving on (rules: .claude/rules/engineering.md):\n` +
      r.stdout +
      r.stderr,
  );
  process.exit(2);
}
