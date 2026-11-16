import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./main.ts', import.meta.url));
const result = spawnSync(process.execPath, ['--experimental-strip-types', script], {
  stdio: 'inherit',
  env: { ...process.env, MAKEFUN_OUTPUT_DIR: fileURLToPath(new URL('.', import.meta.url)) },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
