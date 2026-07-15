import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createGithubShardedStagingMigration,
  parseStagingArgs,
  sanitizeMigrationError,
} from './lib/github-sharded-staging.mjs';
import { createGithubGitDataWriter } from '../src/infrastructure/github-git-data.js';

export async function run(argv = process.argv.slice(2), env = process.env, {
  fetchImpl = globalThis.fetch.bind(globalThis),
  writerFactory = ({ config, fetchImpl }) => createGithubGitDataWriter({ config, fetchImpl })
} = {}) {
  const input = parseStagingArgs(argv, env);

  const migration = createGithubShardedStagingMigration({ fetchImpl, writerFactory });
  const result = await migration.run(input);
  return result;
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entryUrl === import.meta.url) {
  run().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify(sanitizeMigrationError(error, process.env.GH_TOKEN || ''), null, 2)}\n`);
    process.exitCode = 1;
  });
}
