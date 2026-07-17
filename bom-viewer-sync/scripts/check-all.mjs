import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checks = [
  [npmCommand, ['run', 'test']],
  [npmCommand, ['run', 'audit:data']],
  [npmCommand, ['run', 'audit:runtime-deps']],
  [npmCommand, ['run', 'check:generated']],
  [process.execPath, ['scripts/materialize-shards.mjs', '--verify']],
  [process.execPath, ['scripts/verify-rollback.mjs']],
  [process.execPath, ['--check', 'app-admin.js']],
];

for (const [command, args] of checks) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
