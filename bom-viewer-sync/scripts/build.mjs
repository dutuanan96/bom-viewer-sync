import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, transform } from 'esbuild';

const repoRoot = path.resolve(import.meta.dirname, '..');

function outputDirectory(argv) {
  const index = argv.indexOf('--outdir');
  return index >= 0 ? path.resolve(argv[index + 1]) : repoRoot;
}

async function bundle(entryPoint) {
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: [entryPoint],
    bundle: true,
    charset: 'utf8',
    format: 'iife',
    legalComments: 'none',
    minify: true,
    platform: 'browser',
    target: ['es2020'],
    write: false,
  });
  return result.outputFiles[0].text.trim();
}

function replaceTokens(template, values) {
  const result = Object.entries(values).reduce(
    (html, [name, value]) => html.replaceAll(`{{${name}}}`, () => value),
    template,
  );
  const unresolved = result.match(/\{\{[A-Z_]+\}\}/g);
  if (unresolved) throw new Error(`Unresolved shell tokens: ${unresolved.join(', ')}`);
  return result;
}

export function normalizeNewlines(value) {
  return value.replace(/\r\n?/g, '\n');
}

export function renderHtmlArtifact(template, values) {
  return replaceTokens(normalizeNewlines(template), values);
}

export function computeBuildId({ shell, css, adminBundle, viewerBundle }) {
  const hash = createHash('sha256');
  for (const value of [shell, css, adminBundle, viewerBundle]) {
    hash.update(normalizeNewlines(value));
  }
  return hash.digest('hex').slice(0, 12);
}

async function replaceFile(stagedPath, finalPath) {
  await rm(finalPath, { force: true });
  await rename(stagedPath, finalPath);
}

export async function commitStagedArtifacts(
  outDir,
  names,
  { commitFile = replaceFile } = {},
) {
  const tempDir = path.join(outDir, '.build-tmp');
  const stagedDir = path.join(tempDir, 'staged');
  const backupDir = path.join(tempDir, 'backup');
  const originals = new Map();

  await rm(backupDir, { recursive: true, force: true });
  await mkdir(backupDir, { recursive: true });
  try {
    for (const name of names) {
      try {
        await copyFile(path.join(outDir, name), path.join(backupDir, name));
        originals.set(name, true);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        originals.set(name, false);
      }
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  try {
    for (const name of names) {
      await commitFile(path.join(stagedDir, name), path.join(outDir, name), name);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const name of names) {
      try {
        const finalPath = path.join(outDir, name);
        if (originals.get(name)) {
          await copyFile(path.join(backupDir, name), finalPath);
        } else {
          await rm(finalPath, { force: true });
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      rollbackErrors.push(cleanupError);
    }
    if (rollbackErrors.length) {
      throw new AggregateError(
        rollbackErrors,
        'Artifact commit failed and rollback was incomplete',
        { cause: error },
      );
    }
    throw error;
  }

  await rm(tempDir, { recursive: true, force: true });
}

export async function generateArtifacts(outDir = repoRoot) {
  const [shell, cssSource, adminBundle, viewerBundle] = await Promise.all([
    readFile(path.join(repoRoot, 'src', 'shell.html'), 'utf8'),
    readFile(path.join(repoRoot, 'src', 'styles', 'app.css'), 'utf8'),
    bundle('src/admin-entry.js'),
    bundle('src/viewer-entry.js'),
  ]);
  const css = (await transform(cssSource, { loader: 'css', minify: true })).code.trim();
  const buildId = computeBuildId({ shell, css, adminBundle, viewerBundle });

  const shared = { BUILD_ID: buildId };
  const adminHtml = renderHtmlArtifact(shell, {
    ...shared,
    TITLE: 'BOM Admin',
    MODE_LABEL: 'Admin',
    SYNC_CLASS: 'admin',
    ADMIN_HIDDEN: '',
    STYLE_TAG: `<link rel="stylesheet" href="styles.css?v=${buildId}">`,
    DATA_SCRIPT: '<!-- Runtime data is loaded from immutable GitHub shards. -->',
    APP_SCRIPT: `<script src="app-admin.js?v=${buildId}"></script>`,
  });
  const viewerHtml = renderHtmlArtifact(shell, {
    ...shared,
    TITLE: 'BOM Viewer',
    MODE_LABEL: 'Viewer',
    SYNC_CLASS: 'viewer',
    ADMIN_HIDDEN: ' hidden',
    STYLE_TAG: `<style>\n${css}\n</style>`,
    DATA_SCRIPT: '<!-- Runtime data is loaded from immutable GitHub shards. -->',
    APP_SCRIPT: `<script>\n${viewerBundle.replaceAll('</script', '<\\/script')}\n</script>`,
  });

  await mkdir(outDir, { recursive: true });
  const tempDir = path.join(outDir, '.build-tmp');
  const stagedDir = path.join(tempDir, 'staged');
  const artifacts = [
    ['styles.css', `${css}\n`],
    ['app-admin.js', `${adminBundle}\n`],
    ['admin.html', adminHtml],
    ['viewer.html', viewerHtml],
  ];
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(stagedDir, { recursive: true });
  try {
    for (const [name, content] of artifacts) {
      await writeFile(path.join(stagedDir, name), content, 'utf8');
    }
    await commitStagedArtifacts(outDir, artifacts.map(([name]) => name));
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
  return { buildId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await generateArtifacts(outputDirectory(process.argv.slice(2)));
}
