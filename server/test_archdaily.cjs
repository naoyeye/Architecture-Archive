const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { buildSync } = require('esbuild');
const { parseHTML, DOMParser } = require('linkedom');
const projectUrl = 'https://www.archdaily.com/1027911/sample-house';
const ids = ['67d1c9ebc0be690189b3af4d', '67d1c5fc6fa6080189512504'];
const large = id => `https://images.adsttc.com/media/images/${id.match(/.{4}/g).join('/')}/slideshow/house.jpg?1741802004`;
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/archdaily-project.html'), 'utf8');
const bundle = buildSync({ entryPoints: [path.join(__dirname, '../tampermonkey/src/archdaily/capture.js')], bundle: true, format: 'iife', globalName: 'Archdaily', write: false }).outputFiles[0].text;

function environment() {
  const { document } = parseHTML(fixture);
  const records = ids.map((id, index) => ({ link: `${id}-sample-${index ? 'plan' : 'photo'}`, type: index ? 'MediaPlan' : 'MediaPicture', url_slideshow: large(id), caption: index ? 'Floor plan' : '© Photographer' }));
  const requests = [];
  const env = { document, records, requests, path: '/1027911/sample-house' };
  env.viewer = () => `<div id="gallery-items" data-path="${env.path}" data-id="${ids[0]}" data-images='${JSON.stringify(records)}'></div>`;
  const context = vm.createContext({ document, URL, DOMParser, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, location: new URL(projectUrl), fetch: async (url, options) => {
    requests.push(url);
    assert.equal(url, `${projectUrl}/${records[0].link}`);
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    return { ok: true, url, headers: new Headers({ 'content-type': 'text/html' }), text: async () => env.viewer() };
  } });
  vm.runInContext(bundle, context);
  env.context = context;
  env.capture = options => context.Archdaily.captureArchdailyArticle(projectUrl, options);
  return env;
}

test('ArchDaily captures photos and plans, full body, hidden specs and scoped tags', async () => {
  const env = environment();
  const result = await env.capture();
  assert.equal(result.expected_photo_count, 2);
  assert.equal(result.source, 'archdaily');
  assert.equal(result.studio, 'Sample Studio');
  assert.equal(result.photos[1].caption.value, 'Floor plan');
  assert.equal(result.photos[0].url, large(ids[0]));
  assert.equal(env.requests.length, 1);
  assert.match(result.body.value, /Last paragraph/);
  assert.match(result.body.value, /https:\/\/www.archdaily.com\/office\/sample/);
  assert.ok(result.sections.find(section => section.title === 'Credits').rows.some(row => row.value === 'Private'));
  for (const unwanted of ['FAKE_AUTH_SECRET', 'Advertisement', 'Recommended', 'Unrelated', 'thumb.jpg', 'Share this']) assert.ok(!JSON.stringify(result).includes(unwanted));
  const rendered = spawnSync(path.join(__dirname, '.venv/bin/python'), ['-c', 'import json,sys; from scraper import parse_article; data=json.load(sys.stdin); print(parse_article(data["url"],article_data=data).content_md)'], { cwd: __dirname, input: JSON.stringify(result), encoding: 'utf8' });
  assert.equal(rendered.status, 0, rendered.stderr);
  for (const expected of ['Last paragraph', '**wood**', 'Floor plan', '## Credits', '## Tags', 'images/02.jpg']) assert.ok(rendered.stdout.includes(expected), expected);
});

test('ArchDaily prefers explicit data-largesrc and confirmed DOM captions without requests', async () => {
  const env = environment();
  [...env.document.querySelectorAll('#gallery-thumbs li')].forEach((item, index) => {
    item.querySelector('img').setAttribute('data-largesrc', large(ids[index]));
    item.insertAdjacentHTML('beforeend', `<figcaption>${index ? '' : 'DOM caption'}</figcaption>`);
  });
  const result = await env.capture();
  assert.equal(env.requests.length, 0);
  assert.equal(result.photos[1].caption.status, 'empty');
  assert.equal(result.photos[0].caption.value, 'DOM caption');
});

test('ArchDaily preserves all 58 gallery entries including 17 drawings', async () => {
  const env = environment();
  env.records.splice(0, env.records.length, ...Array.from({ length: 58 }, (_, index) => {
    const id = index === 0 ? ids[0] : index.toString(16).padStart(24, '0');
    return { link: `${id}-sample-photo`, type: index < 41 ? 'MediaPicture' : 'MediaPlan', url_slideshow: large(id), caption: index < 41 ? '© Photographer' : `Drawing ${index}` };
  }));
  env.document.querySelector('#gallery-thumbs').innerHTML = env.records.map((record, index) => `<li><a href="${projectUrl}/${record.link}"><img alt="Image ${index + 1} of 58"></a></li>`).join('');
  const result = await env.capture();
  assert.equal(result.photos.length, 58);
  assert.equal(result.photos.filter(photo => photo.caption.value.startsWith('Drawing')).length, 17);
  assert.equal(env.requests.length, 1);
});

test('ArchDaily rejects unconfirmed direct large URLs instead of falling back to thumbnails', async () => {
  for (const suffix of ['/medium_jpg/', '/thumb_jpg/']) {
    const env = environment();
    env.document.querySelector('#gallery-thumbs img').setAttribute('data-largesrc', large(ids[0]).replace('/slideshow/', suffix));
    await assert.rejects(env.capture(), /大图/);
  }
});

test('ArchDaily retains distinct article captions alongside gallery credits', async () => {
  const env = environment();
  env.document.querySelector('figcaption').textContent = 'Garden view';
  const result = await env.capture();
  assert.equal(result.photos[0].caption.value, '© Photographer\nGarden view');
});

test('ArchDaily rejects stale projects, partial galleries, duplicate IDs and missing body', async () => {
  for (const change of [
    page => page.querySelector('link').setAttribute('href', projectUrl + '-other'),
    page => page.querySelector('#single-content').setAttribute('data-io-article-url', projectUrl + '-other'),
    page => page.querySelector('#gallery-thumbs li').remove(),
    page => page.querySelector('#gallery-thumbs').appendChild(page.querySelector('#gallery-thumbs li').cloneNode(true)),
    page => page.querySelector('#gallery-thumbs a').setAttribute('href', 'https://evil.test/photo'),
    page => page.querySelector('#gallery-thumbs a').setAttribute('href', '/999/other/' + ids[0] + '-photo'),
    page => page.querySelector('#single-content').remove(),
    page => page.querySelectorAll('#single-content > p').forEach(node => node.remove()),
    page => page.querySelector('.afd-specs__value').remove(),
  ]) {
    const env = environment(); change(env.document);
    await assert.rejects(env.capture());
    assert.equal(env.requests.length, 0);
  }
});

test('ArchDaily validates viewer project, exact media set, captions and CDN paths', async () => {
  for (const change of [
    env => { env.path = '/999/other'; },
    env => env.records.pop(),
    env => { env.records[1] = env.records[0]; },
    env => { env.records[1].type = 'Video'; },
    env => { delete env.records[1].caption; },
    env => { env.records[1].url_slideshow = large(ids[0]); },
    env => { env.records[1].url_slideshow = large(ids[1]).replace('/slideshow/', '/medium_jpg/'); },
    env => { env.records[1].url_slideshow += '&width=100'; },
    env => { env.records[1].url_slideshow = large(ids[1]).replace('images.adsttc.com', 'images.adsttc.com.evil.test'); },
    env => { env.records[1].url_slideshow = large(ids[1]).replace('https://', 'https://user@'); },
  ]) {
    const env = environment(); change(env); await assert.rejects(env.capture());
  }
});

test('ArchDaily waits for native body loading and captures the final paragraph', async () => {
  const env = environment();
  env.document.querySelector('#single-content').insertAdjacentHTML('beforeend', '<div id="content-placeholder"><picture class="loader"></picture></div>');
  const pending = env.capture();
  assert.equal(env.requests.length, 0);
  env.document.querySelector('#content-placeholder').remove();
  env.document.querySelector('#single-content').insertAdjacentHTML('beforeend', '<p>Loaded final text.</p>');
  assert.match((await pending).body.value, /Loaded final text/);
});

test('ArchDaily ignores stalled Publift ads and Products skeletons without dropping project fields', async () => {
  for (const loaded of [false, true]) {
    const env = environment();
    const article = env.document.querySelector('#single-content');
    article.insertAdjacentHTML('afterbegin', `<div class="afd-specs" ${loaded ? 'id="related-products"' : ''}><div class="afd-specs__item"><svg><title>Products</title></svg>${loaded ? '<p>Product promotion</p>' : '<div class="js-loading-products-widget loading-animation"><picture class="loader"></picture>Product promotion</div>'}</div></div>`);
    article.insertAdjacentHTML('beforeend', '<div class="js-publift afd-sidebar-widget afd-sidebar-widget--margin loading-animation"><div class="afd-specs__item"></div><picture class="loader"></picture><p>Ad promotion</p></div><p class="js-publift">Direct ad promotion</p>');
    env.document.querySelector('aside').insertAdjacentHTML('beforeend', '<div class="js-publift afd-sidebar-widget afd-sidebar-widget--margin loading-animation"><picture class="loader"></picture></div>');
    const result = await env.capture({ overallTimeoutMs: 1000 });
    assert.equal(result.photos.length, 2);
    assert.equal(result.studio, 'Sample Studio');
    assert.match(result.body.value, /Last paragraph/);
    assert.ok(!JSON.stringify(result).includes('promotion'));
    assert.ok(result.sections.find(section => section.title === 'Project information').rows.some(row => row.label === 'Year' && row.value === '2024'));
    assert.ok(article.querySelector('.js-publift'), 'Capture must not mutate the live page');
  }
});

test('ArchDaily still rejects incomplete real fields in the presence of ads', async () => {
  const env = environment();
  env.document.querySelector('#single-content').insertAdjacentHTML('beforeend', '<div class="js-publift loading-animation"></div>');
  env.document.querySelector('.afd-specs__value').textContent = '';
  env.document.querySelector('.afd-specs__item').insertAdjacentHTML('beforeend', '<div class="js-loading-products-widget"></div>');
  await assert.rejects(env.capture(), /项目信息未完整加载：Architects/);
});

test('ArchDaily cancels body waits and times out stalled gallery requests', async () => {
  const env = environment();
  env.document.querySelector('#single-content').insertAdjacentHTML('beforeend', '<div id="content-placeholder"></div>');
  const pending = env.capture();
  env.context.Archdaily.cancelArchdailyCapture();
  await assert.rejects(pending, /取消/);
  env.document.querySelector('#content-placeholder').remove();
  env.context.fetch = (_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(env.capture({ requestTimeoutMs: 10 }), /超时/);
  await assert.rejects(env.capture({ overallTimeoutMs: 10 }), /超时/);
});

test('ArchDaily rejects HTTP failures, redirects, non-HTML and mid-capture navigation', async () => {
  for (const mode of ['403', 'redirect', 'json', 'navigation', 'changed']) {
    const env = environment();
    env.context.fetch = async url => {
      if (mode === 'navigation') env.context.location = new URL(projectUrl + '-other');
      if (mode === 'changed') env.document.querySelector('h1').textContent = 'Changed project';
      return { ok: mode !== '403', url: mode === 'redirect' ? projectUrl : url, headers: new Headers({ 'content-type': mode === 'json' ? 'application/json' : 'text/html' }), text: async () => env.viewer() };
    };
    await assert.rejects(env.capture());
  }
});

test('ArchDaily aborts an in-flight request after navigating to another project', async () => {
  const env = environment();
  env.context.fetch = (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    env.context.location = new URL(projectUrl + '-other');
  });
  await assert.rejects(env.capture(), /切换/);
});

test('ArchDaily built widget uploads JSON only and cancellation prevents submission', async () => {
  for (const cancel of [false, true]) {
    const env = environment();
    const posts = [];
    env.context.GM_xmlhttpRequest = options => { if (options.method === 'POST') posts.push(JSON.parse(options.data)); };
    if (cancel) env.context.fetch = (_, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      env.document.querySelector('#archive-cancel-btn').click();
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../tampermonkey/architecture-archive.user.js'), 'utf8'), env.context);
    env.document.querySelector('#archive-run-btn').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(posts.length, cancel ? 0 : 1);
    if (!cancel) {
      assert.equal(posts[0].article.source, 'archdaily');
      assert.equal(posts[0].html, undefined);
    } else {
      assert.match(env.document.querySelector('#archive-log-wrap').textContent, /取消/);
      assert.equal(env.document.querySelector('#archive-run-btn').disabled, false);
    }
    assert.equal(env.document.documentElement.dataset.archiveSite, 'archdaily');
  }
});
