const path = require('node:path');
const { buildSync } = require('esbuild');

const result = buildSync({
  stdin: {
    contents: ["export * from './common.js';", "export * from './home.js';", "export * from './story.js';", "export * from './capture.js';"].join('\n'),
    resolveDir: path.join(__dirname, '../../tampermonkey/src/dwell'),
  },
  bundle: true,
  format: 'iife',
  globalName: 'Dwell',
  write: false,
  target: 'es2020',
});
module.exports = result.outputFiles[0].text + '\nObject.assign(globalThis, Dwell);';
