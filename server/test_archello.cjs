const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { buildSync } = require('esbuild');
const { parseHTML, DOMParser } = require('linkedom');
const projectUrl = 'https://archello.com/project/sample-house';
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/archello-project.html'), 'utf8');
const bundle = buildSync({ entryPoints: [path.join(__dirname, '../tampermonkey/src/archello/capture.js')], bundle: true, format: 'iife', globalName: 'Archello', write: false }).outputFiles[0].text;

function imagePath(category, position) {
  return `/images/2026/09/04/${category === 'drawings' ? 'drawing' : 'photo'}-${position}.jpg`;
}

function gallery(category, count) {
  return `<nav id="navbar-gallery"><a href="${projectUrl}">Sample House</a></nav><div id="${category}-grid">` + Array.from({ length: count }, (_, index) => {
    const position = index + 1;
    return `<div class="multimedia-grid-item"><div id="story-media-${100 + position}-socials-share"></div><a href="/story/123/attachments/${category}/${position}"><img data-src="https://archello.com/thumbs${imagePath(category, position)}?w=225"></a></div>`;
  }).join('') + '</div>';
}

function viewer(category, position, count) {
  return `<div id="attachment-story-123-grid"><div class="photoviewer" data-key="${100 + position}"><div class="image-scale"><img src="https://archello.s3.eu-central-1.amazonaws.com${imagePath(category, position)}"></div><div class="photoviewer-content-footer">${position} of ${count}</div><div class="photoviewer-sidebar-heading"><h1><a href="${projectUrl}">Sample House</a></h1><b>Story by Sample Studio</b><p>Photo: Sample Photographer</p>${category === 'drawings' ? '<p>Floor plan</p>' : ''}<div class="catalog"><p>Unrelated catalogue</p></div></div></div></div>`;
}

function environment(photoCount = 2) {
  const { document } = parseHTML(fixture);
  const requests = [];
  const pages = new Map();
  pages.set(`${projectUrl}?dp-2-per-page=7`, fixture.replace('<a href="/project/sample-house?dp-2-per-page=7">View All</a>', '<div class="ah-project-details__item"><div class="ah-project-details__item-title">Engineer</div><div class="ah-project-details__item-text">Sample Engineer</div></div>'));
  pages.set('https://archello.com/story/123/attachments/product-spec-sheet', `<nav id="navbar-gallery"><a href="${projectUrl}">Sample House</a></nav><div id="specifications-grid"><table><tbody><tr><td>Brick</td><td>Sample Brick</td><td>Facing Brick</td><td>Other project specifiers</td></tr></tbody></table></div>`);
  for (const category of ['photos-videos', 'drawings']) {
    const count = category === 'drawings' ? 1 : photoCount;
    const base = `https://archello.com/story/123/attachments/${category}`;
    pages.set(base, gallery(category, count));
    for (let position = 1; position <= count; position++) pages.set(`${base}/${position}`, viewer(category, position, count));
  }
  const context = vm.createContext({ document, URL, DOMParser, AbortController, setTimeout, clearTimeout, location: { href: projectUrl }, fetch: async (target, options) => {
    requests.push(target);
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    assert.ok(pages.has(target), `Unexpected fetch ${target}`);
    return { ok: true, url: target, text: async () => pages.get(target) };
  } });
  vm.runInContext(bundle, context);
  return { context, document, pages, requests };
}

async function capture(env) {
  return JSON.parse(JSON.stringify(await vm.runInContext(`Archello.captureArchelloArticle('${projectUrl}')`, env.context)));
}

test('Archello completes galleries and credits, preserves body, captions, drawings and tables', async () => {
  const env = environment(32);
  const result = await capture(env);
  assert.equal(result.source, 'archello');
  assert.equal(result.expected_photo_count, 33);
  assert.equal(result.title, 'Sample House');
  assert.equal(result.studio, 'Sample Studio');
  assert.match(result.body.value, /First paragraph with <strong>wood<\/strong>/);
  assert.match(result.body.value, /Last paragraph/);
  assert.match(result.photos[0].caption.value, /Garden view/);
  assert.match(result.photos[0].caption.value, /Sample Photographer/);
  assert.match(result.photos.at(-1).caption.value, /Floor plan/);
  assert.ok(result.photos.every(photo => photo.id === new URL(photo.url).pathname && !photo.url.includes('?')));
  assert.ok(env.requests.includes('https://archello.com/story/123/attachments/photos-videos/32'));
  assert.deepEqual(result.sections.map(section => section.title), ['Project information', 'Credits', 'Details']);
  assert.ok(result.sections[0].rows.some(row => row.label === 'Year' && row.value === '2024'));
  assert.ok(result.sections[0].rows.some(row => row.label === 'Location' && row.value === 'Surrey, UK'));
  assert.ok(result.sections[0].rows.some(row => row.value === 'Wood / Brick'));
  assert.ok(result.sections[1].rows.some(row => row.value === 'Sample Engineer'));
  assert.equal(result.sections[2].rows[0].value, 'Sample Brick — Facing Brick');
  for (const secret of ['FAKE_AUTH_SECRET', 'FAKE_PASSWORD', 'FAKE_EVENT_SECRET', 'Advertisement', 'Recommended project', 'Unrelated catalogue', 'Other project specifiers', 'javascript:', '/thumbs/']) assert.ok(!JSON.stringify(result).includes(secret), secret);
});

test('Archello rejects stale canonical, multiple stories, missing body and unsupported URLs', () => {
  for (const change of [
    document => document.querySelector('link').setAttribute('href', projectUrl + '-other'),
    document => document.querySelector('#stories-grid').appendChild(document.querySelector('#stories-grid > div').cloneNode(true)),
    document => document.querySelector('.mce-content-body').remove(),
    document => document.querySelector('#stories-grid > div').removeAttribute('data-key'),
  ]) {
    const env = environment();
    change(env.document);
    assert.throws(() => vm.runInContext(`Archello.extractArchelloProject(document, '${projectUrl}')`, env.context));
  }
  const env = environment();
  for (const url of ['https://evil.test/project/sample-house', 'https://user@archello.com/project/sample-house', projectUrl + '/extra', 'https://archello.com/project/']) assert.throws(() => vm.runInContext(`Archello.extractArchelloProject(document, '${url}')`, env.context));
});

test('Archello rejects incomplete, wrong-project, wrong-ID, thumbnail and redirected viewer responses', async () => {
  for (const mode of ['count', 'id', 'project', 'thumbnail', 'path', 'caption-container', 'viewer', 'missing-photo', 'http', 'redirect', 'gallery-project', 'credits', 'spec']) {
    const env = environment();
    const target = 'https://archello.com/story/123/attachments/photos-videos/1';
    const replacements = {
      count: ['1 of 2', '1 of 3'], id: ['data-key="101"', 'data-key="999"'], project: [projectUrl, projectUrl + '-other'],
      thumbnail: ['https://archello.s3.eu-central-1.amazonaws.com/images/', 'https://archello.com/thumbs/images/'],
      path: ['photo-1.jpg', 'other.jpg'], 'caption-container': ['photoviewer-sidebar-heading', 'unknown'], viewer: ['image-scale', 'unknown'],
    };
    if (replacements[mode]) env.pages.set(target, env.pages.get(target).replace(...replacements[mode]));
    if (mode === 'missing-photo') env.pages.set(target.replace(/\/1$/, ''), gallery('photos-videos', 1));
    if (mode === 'gallery-project') env.pages.set(target.replace(/\/1$/, ''), gallery('photos-videos', 2).replace(projectUrl, projectUrl + '-other'));
    if (mode === 'credits') env.pages.set(`${projectUrl}?dp-2-per-page=7`, fixture);
    if (mode === 'spec') env.pages.set('https://archello.com/story/123/attachments/product-spec-sheet', '<p>Login required</p>');
    if (mode === 'http') env.context.fetch = async () => ({ ok: false, status: 403 });
    if (mode === 'redirect') env.context.fetch = async () => ({ ok: true, url: 'https://archello.com/sign-in' });
    await assert.rejects(capture(env), undefined, mode);
  }
});

test('Archello distinguishes confirmed empty captions and body from unavailable containers', async () => {
  const env = environment();
  env.document.querySelector('.mce-content-body').innerHTML = '';
  env.document.querySelector('.ah-project-story__heading').remove();
  for (const [url, html] of env.pages) if (/\/attachments\/.*\/\d+$/.test(url)) env.pages.set(url, html.replace(/<p>.*?<\/p>/g, ''));
  const result = await capture(env);
  assert.equal(result.body.status, 'empty');
  assert.ok(result.photos.every(photo => photo.caption.status === 'empty'));
});

test('Archello cancels, times out, and rejects navigation changes without returning partial JSON', async () => {
  for (const mode of ['cancel', 'timeout', 'navigation', 'deadline']) {
    const env = environment();
    env.context.setTimeout = (callback, delay) => setTimeout(callback, (mode === 'timeout' && delay === 20000) || (mode === 'deadline' && delay === 300000) ? 0 : delay);
    if (mode === 'navigation') {
      const fetchPage = env.context.fetch;
      env.context.fetch = async (...args) => { const response = await fetchPage(...args); env.context.location.href = projectUrl + '-other'; return response; };
    } else {
      env.context.fetch = (_, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        if (mode === 'cancel') vm.runInContext('Archello.cancelArchelloCapture()', env.context);
      });
    }
    await assert.rejects(capture(env), ['timeout', 'deadline'].includes(mode) ? /超时/ : mode === 'navigation' ? /切换/ : /取消/);
  }
});

test('Archello original URL validation never upgrades a guessed thumbnail', () => {
  const env = environment();
  for (const url of ['https://archello.com/thumbs/images/2026/09/04/a.jpg', 'https://evil.test/images/2026/09/04/a.jpg', 'https://archello.s3.eu-central-1.amazonaws.com.evil.test/images/2026/09/04/a.jpg', 'https://user@archello.s3.eu-central-1.amazonaws.com/images/2026/09/04/a.jpg', 'https://archello.s3.eu-central-1.amazonaws.com/images/2026/09/04/a.jpg?w=225']) assert.throws(() => vm.runInContext(`Archello.originalImageUrl('${url}')`, env.context));
});

test('Archello browser JSON is accepted by the real Python renderer', async () => {
  const result = await capture(environment());
  const output = spawnSync(path.join(__dirname, '.venv/bin/python'), ['-c', 'import json,sys; from scraper import parse_article; data=json.load(sys.stdin); article=parse_article(data["url"],article_data=data); assert len(article.images)==3; print(article.content_md)'], { cwd: __dirname, input: JSON.stringify(result), encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /First paragraph with \*\*wood\*\*/);
  assert.match(output.stdout, /Garden view/);
  assert.match(output.stdout, /Floor plan/);
  assert.match(output.stdout, /\| Engineer \| Sample Engineer \|/);
  assert.match(output.stdout, /!\[\]\(images\/03.jpg\)/);
});


test('built Archello widget sends structured JSON, not page HTML, and does not install Dezeen observers', { timeout: 5000 }, async () => {
  const env = environment();
  env.context.location = new URL(projectUrl + '?tracking=1');
  env.context.MutationObserver = class { constructor() { throw new Error('Dezeen observer on Archello'); } };
  let resolvePost;
  const posted = new Promise(resolve => { resolvePost = resolve; });
  env.context.GM_xmlhttpRequest = options => {
    if (options.method === 'POST') resolvePost(JSON.parse(options.data));
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../tampermonkey/architecture-archive.user.js'), 'utf8'), env.context);
  assert.equal(env.document.documentElement.dataset.archiveSite, 'archello');
  assert.ok(env.document.querySelector('#archive-run-btn'));
  env.document.querySelector('#archive-run-btn').click();
  const submitted = await posted;
  assert.equal(submitted.url, projectUrl);
  assert.equal(submitted.article.source, 'archello');
  assert.equal(submitted.article.expected_photo_count, 3);
  assert.equal(submitted.html, undefined);
});

test('Archello capture cancellation prevents the built widget from uploading partial data', async () => {
  const env = environment();
  env.context.location = new URL(projectUrl);
  const posts = [];
  env.context.GM_xmlhttpRequest = options => { if (options.method === 'POST') posts.push(options); };
  env.context.fetch = (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    env.document.querySelector('#archive-cancel-btn').click();
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../tampermonkey/architecture-archive.user.js'), 'utf8'), env.context);
  env.document.querySelector('#archive-run-btn').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(posts.length, 0);
  assert.match(env.document.querySelector('#archive-log-wrap').textContent, /取消/);
  assert.equal(env.document.querySelector('#archive-run-btn').disabled, false);
});


function withSupplierStories(html, loaded = false) {
  const { document } = parseHTML(html);
  const hero = document.createElement('a');
  hero.className = 'ah-project-hero__link';
  hero.setAttribute('href', '/story/123/attachments/photos-videos/1');
  document.querySelector('.ah-project-hero__title').parentElement.appendChild(hero);
  for (const id of ['456', '789']) {
    const supplier = document.createElement('div');
    supplier.setAttribute('data-key', id);
    if (loaded) supplier.innerHTML = `<div class="mce-content-body"><p>Supplier promotional text ${id}</p></div><a href="/story/${id}/attachments/photos-videos/1"><img src="https://archello.com/thumbs/images/supplier.jpg"></a>`;
    document.querySelector('#stories-grid').prepend(supplier);
  }
  return document.toString();
}

test('Archello selects the hero-linked main story with empty or loaded supplier stories', async () => {
  for (const loaded of [false, true]) {
    const env = environment();
    env.context.document = parseHTML(withSupplierStories(fixture, loaded)).document;
    const creditUrl = `${projectUrl}?dp-2-per-page=7`;
    env.pages.set(creditUrl, withSupplierStories(env.pages.get(creditUrl), loaded));
    const result = await capture(env);
    assert.equal(result.studio, 'Sample Studio');
    assert.equal(result.expected_photo_count, 3);
    assert.match(result.body.value, /First paragraph/);
    assert.match(result.warnings.join(''), /主故事 123.*其余 2/);
    assert.ok(!JSON.stringify(result).includes('Supplier promotional'));
    assert.ok(env.requests.every(target => !/\/story\/(456|789)\//.test(target)));
    assert.ok(result.sections.find(section => section.title === 'Credits').rows.some(row => row.value === 'Sample Engineer'));
    const rendered = spawnSync(path.join(__dirname, '.venv/bin/python'), ['-c', 'import json,sys; from scraper import parse_article; data=json.load(sys.stdin); print(parse_article(data["url"],article_data=data).content_md)'], { cwd: __dirname, input: JSON.stringify(result), encoding: 'utf8' });
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.match(rendered.stdout, /First paragraph/);
    assert.ok(!rendered.stdout.includes('Supplier promotional'));
  }
});

test('Archello never falls back to suppliers when the hero or main story is missing or ambiguous', () => {
  for (const mode of ['no-hero', 'foreign-hero', 'credential-hero', 'unknown-id', 'empty-main', 'duplicate-id', 'conflicting-heroes', 'pagination']) {
    const env = environment();
    env.context.document = parseHTML(withSupplierStories(fixture, true)).document;
    const document = env.context.document;
    const hero = document.querySelector('.ah-project-hero__link');
    const main = document.querySelector('#stories-grid > [data-key="123"]');
    if (mode === 'no-hero') hero.remove();
    if (mode === 'foreign-hero') hero.setAttribute('href', 'https://evil.test/story/123/attachments/photos-videos/1');
    if (mode === 'credential-hero') hero.setAttribute('href', 'https://user@archello.com/story/123/attachments/photos-videos/1');
    if (mode === 'unknown-id') hero.setAttribute('href', '/story/999/attachments/photos-videos/1');
    if (mode === 'empty-main') main.innerHTML = '';
    if (mode === 'duplicate-id') main.parentElement.appendChild(main.cloneNode(true));
    if (mode === 'conflicting-heroes') {
      const second = hero.cloneNode(true);
      second.setAttribute('href', '/story/456/attachments/photos-videos/1');
      hero.parentElement.appendChild(second);
    }
    if (mode === 'pagination') main.insertAdjacentHTML('beforeend', '<div class="pagination"><a href="?page=2">2</a></div>');
    assert.throws(() => vm.runInContext(`Archello.extractArchelloProject(document, '${projectUrl}')`, env.context), undefined, mode);
  }
});

test('Archello rejects a different main story returned by credits expansion', async () => {
  const env = environment();
  env.context.document = parseHTML(withSupplierStories(fixture)).document;
  const creditUrl = `${projectUrl}?dp-2-per-page=7`;
  env.pages.set(creditUrl, withSupplierStories(env.pages.get(creditUrl)).replaceAll('123', '999'));
  await assert.rejects(capture(env), /署名未完整加载/);
});
