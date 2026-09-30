const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const helpers = require('./userscript-helpers.cjs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const url = process.argv[3];
const { document } = parseHTML(html);
if (process.argv.includes('--strip-classes')) {
  for (const node of document.querySelectorAll('[class]')) node.removeAttribute('class');
}
const context = vm.createContext({ document, URL });
vm.runInContext(helpers, context);
const article = vm.runInContext(`validateDwellCapture(extractDwellArticle(document, ${JSON.stringify(url)}))`, context);
const { issues, ...payload } = article;
process.stdout.write(JSON.stringify(payload));
