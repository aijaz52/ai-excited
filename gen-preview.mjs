import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
// Run the TypeScript renderer with Node's type stripping and write the preview beside it.
const result = spawnSync(process.execPath, [
  '--experimental-strip-types',
  join(directory, 'main.ts'),
], {
  stdio: 'inherit',
  env: { ...process.env, MAKEFUN_OUTPUT_DIR: directory },
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
