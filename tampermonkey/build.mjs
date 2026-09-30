import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const directory = fileURLToPath(new URL('.', import.meta.url));
const options = {
  absWorkingDir: directory,
  entryPoints: ['src/index.js'],
  outfile: 'architecture-archive.user.js',
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  loader: { '.css': 'text' },
  banner: { js: (await readFile(new URL('metadata.txt', import.meta.url), 'utf8')).trimEnd() },
  legalComments: 'none',
  logLevel: 'info',
};
if (process.argv.includes('--watch')) {
  const builder = await context(options);
  await builder.watch();
} else {
  await build(options);
}
