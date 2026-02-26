import fs from 'node:fs';
import spawn from 'cross-spawn';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_PATH = path.resolve(dirname);
const hasSrcFolder = fs.existsSync(path.resolve(ROOT_PATH, 'src'));
if (hasSrcFolder) {
  const result = spawn.sync('pnpm', ['build:esm'], { cwd: ROOT_PATH, env: process.env, stdio: 'inherit' });
  process.exit(result.status);
}
