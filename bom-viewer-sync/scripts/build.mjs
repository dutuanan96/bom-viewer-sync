import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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

async function writeAtomic(outDir, name, content) {
  const tempDir = path.join(outDir, '.build-tmp');
  await mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${name}.tmp`);
  const finalPath = path.join(outDir, name);
  await writeFile(tempPath, content, 'utf8');
  await rm(finalPath, { force: true });
  await rename(tempPath, finalPath);
}

export async function generateArtifacts(outDir = repoRoot) {
  const [shell, cssSource, adminBundle, viewerBundle] = await Promise.all([
    readFile(path.join(repoRoot, 'src', 'shell.html'), 'utf8'),
    readFile(path.join(repoRoot, 'src', 'styles', 'app.css'), 'utf8'),
    bundle('src/admin-entry.js'),
    bundle('src/viewer-entry.js'),
  ]);
  const css = (await transform(cssSource, { loader: 'css', minify: true })).code.trim();
  const buildId = createHash('sha256')
    .update(shell)
    .update(css)
    .update(adminBundle)
    .update(viewerBundle)
    .digest('hex')
    .slice(0, 12);

  const shared = { BUILD_ID: buildId };
  const adminHtml = replaceTokens(shell, {
    ...shared,
    TITLE: 'BOM Admin',
    MODE_LABEL: 'Admin',
    SYNC_CLASS: 'admin',
    ADMIN_HIDDEN: '',
    STYLE_TAG: `<link rel="stylesheet" href="styles.css?v=${buildId}">`,
    DATA_SCRIPT: `<script src="data.js?v=22"></script>`,
    APP_SCRIPT: `<script src="app-admin.js?v=${buildId}"></script>`,
  });
  const viewerHtml = replaceTokens(shell, {
    ...shared,
    TITLE: 'BOM Viewer',
    MODE_LABEL: 'Viewer',
    SYNC_CLASS: 'viewer',
    ADMIN_HIDDEN: ' hidden',
    STYLE_TAG: `<style>\n${css}\n</style>`,
    DATA_SCRIPT: '<!-- data.js loaded from GitHub via loadCloud() -->',
    APP_SCRIPT: `<script>\n${viewerBundle.replaceAll('</script', '<\\/script')}\n</script>`,
  });

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeAtomic(outDir, 'styles.css', `${css}\n`),
    writeAtomic(outDir, 'app-admin.js', `${adminBundle}\n`),
    writeAtomic(outDir, 'admin.html', adminHtml),
    writeAtomic(outDir, 'viewer.html', viewerHtml),
  ]);
  await rm(path.join(outDir, '.build-tmp'), { recursive: true, force: true });
  return { buildId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await generateArtifacts(outputDirectory(process.argv.slice(2)));
}
