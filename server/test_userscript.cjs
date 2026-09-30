const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { parseHTML, DOMParser } = require('linkedom');
const helpers = require('./fixtures/userscript-helpers.cjs');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/dwell-project.html'), 'utf8');
const url = 'https://www.dwell.com/home/sample-house-abcd';
const original = 'https://images2.dwell.com/photos/100/200/original.jpg';

function environment(html = fixture) {
  const { document } = parseHTML(html);
  const context = vm.createContext({ document, URL, window: { scrollY: 0, scrollTo() {} }, location: { href: url }, currentArticleUrl: () => url, setTimeout, clearTimeout, AbortController, DOMParser, renderStages() {} });
  vm.runInContext(helpers, context);
  vm.runInContext("configureDwellCapture({ currentArticleUrl: () => currentArticleUrl(), renderStages })", context);
  return { document, context };
}

function article(context) {
  return JSON.parse(JSON.stringify(vm.runInContext(`extractDwellArticle(document, '${url}')`, context)));
}

function changeState(document, change) {
  const node = document.querySelector('script');
  const state = JSON.parse(node.textContent.replace(/^window.INITIAL_STATE = /, '').replace(/;\s*$/, ''));
  change(state);
  node.textContent = `window.INITIAL_STATE = ${JSON.stringify(state)};`;
}

test('structured JSON excludes credentials, profile details and unrelated photos', async () => {
  const { context } = environment();
  const result = JSON.parse(JSON.stringify(await vm.runInContext(`captureDwellArticle('${url}')`, context)));
  assert.equal(result.schema_version, 1);
  assert.equal(result.expected_photo_count, 2);
  assert.deepEqual(result.photos.map(photo => photo.id), ['200', '201']);
  assert.equal(result.photos[0].url, original);
  assert.equal(result.photos[0].caption.value, 'Ocean view.');
  assert.equal(result.photos[1].caption.status, 'empty');
  assert.equal(result.body.value, 'A house by the sea.');
  assert.equal(result.studio, 'Example Studio');
  const serialized = JSON.stringify(result);
  for (const privateText of ['NEVER_UPLOAD_THIS_TOKEN', 'contactEmail', 'latitude', 'Wrong project', 'compiled-', 'issues']) assert.ok(!serialized.includes(privateText), privateText);
  assert.ok(!('html' in result));
});

test('renaming or removing every compiled classname leaves extraction unchanged', () => {
  const baseline = article(environment().context);
  for (const mode of ['rename', 'remove']) {
    const { document, context } = environment();
    for (const [index, node] of [...document.querySelectorAll('[class]')].entries()) {
      if (mode === 'remove') node.removeAttribute('class');
      else node.setAttribute('class', `next-build-${index}`);
    }
    assert.deepEqual(article(context), baseline);
  }
});

test('semantic DOM fallback works without INITIAL_STATE or compiled classes', () => {
  const { document, context } = environment();
  document.querySelector('script').remove();
  for (const node of document.querySelectorAll('[class]')) node.removeAttribute('class');
  const result = article(context);
  vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context);
  assert.equal(result.expected_photo_count, 2);
  assert.equal(result.body.status, 'present');
  assert.equal(result.body.source, 'dom.description');
  assert.equal(result.photos[1].caption.status, 'empty');
  assert.ok(result.sections.find(section => section.title === 'Credits').rows.some(row => row.label === 'Architect'));
  assert.ok(!JSON.stringify(result.sections).includes('Farmhouse'));
});

test('stale SPA state cannot contribute title, body or photos to another project', () => {
  const { document, context } = environment();
  changeState(document, state => { state.slugs.items['1'].attributes.slug = 'old-project'; state.collections.items['10'].attributes.title = 'STALE TITLE'; });
  const result = article(context);
  assert.equal(result.title, 'Sample House');
  assert.equal(result.body.source, 'dom.description');
  assert.ok(result.photos.every(photo => photo.caption.source.startsWith('dom.')));
  assert.ok(!JSON.stringify(result).includes('STALE TITLE'));
});

test('missing descriptions are not interpreted as intentionally empty', () => {
  const { document, context } = environment();
  changeState(document, state => { delete state.photos.items['201'].attributes.description; });
  document.querySelector('img[data-photo-id="201"]').closest('figure').querySelector('figcaption').remove();
  assert.equal(article(context).photos[1].caption.status, 'missing');
  assert.throws(() => vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context), /描述未确认/);
});

test('missing body is rejected; explicit null and empty DOM section are accepted', () => {
  const { document, context } = environment();
  changeState(document, state => { delete state.collections.items['10'].attributes.description; });
  const section = [...document.querySelectorAll('section')].find(node => node.querySelector('h2').textContent.startsWith('From '));
  section.remove();
  assert.throws(() => vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context), /正文无法定位/);
  changeState(document, state => { state.collections.items['10'].attributes.description = null; });
  assert.equal(article(context).body.status, 'empty');
  vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context);
});

test('richer loaded description replaces a truncated initial-state description', () => {
  const { document, context } = environment();
  changeState(document, state => { state.collections.items['10'].attributes.description = '...'; });
  assert.equal(article(context).body.source, 'dom.description');
});

test('missing relation targets produce explicit errors, not dropped project fields', () => {
  const { document, context } = environment();
  changeState(document, state => { delete state.metadata.items['20']; });
  assert.throws(() => vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context), /metadata 20/);
});

test('count mismatch and ambiguous DOM caption relationships are rejected', () => {
  const { document, context } = environment();
  changeState(document, state => { state.collections.items['10'].relationships.items.meta.count = 3; });
  assert.throws(() => vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context), /相册未完整加载/);
});

test('photo ID must match both the project link and original URL', () => {
  const { document, context } = environment();
  document.querySelector('img[data-photo-id="201"]').setAttribute('data-photo-id', '999');
  assert.throws(() => vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context), /项目链接不一致/);
});

test('original URL normalization rejects foreign hosts, malformed URLs and thumbnails', () => {
  const { context } = environment();
  assert.equal(vm.runInContext(`dwellOriginalUrl('${original}?q=35&w=160')`, context), original);
  for (const invalid of ['https://evil.test/photos/100/200/original.jpg', 'https://images2.dwell.com/photos/100/200/small.jpg', 'https://[invalid']) {
    assert.equal(vm.runInContext(`dwellOriginalUrl(${JSON.stringify(invalid)})`, context), null);
  }
});

test('Dezeen layout overrides drop paragraph and hero max-width and center page columns', () => {
  const styles = fs.readFileSync(path.join(__dirname, '../tampermonkey/src/widget.css'), 'utf8');
  assert.match(styles, /#preload-hero\.hero-image \{[^}]*max-width:\s*none\s*!important/);
  const mediaIndex = styles.indexOf('@media (min-width: 768px)');
  assert.ok(mediaIndex >= 0, 'expected 768px layout media query');
  const desktop = styles.slice(mediaIndex);
  assert.match(desktop, /\.main-article-body\s*>\s*p \{[^}]*max-width:\s*none\s*!important/);
  assert.match(desktop, /\.page-columns \{[^}]*max-width:\s*70vw/);
  assert.match(desktop, /\.page-columns \{[^}]*margin:\s*0 auto/);
  assert.match(desktop, /\.page-columns \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('widget buttons reset host styles before applying their own styles', () => {
  const styles = fs.readFileSync(path.join(__dirname, '../tampermonkey/src/widget.css'), 'utf8');
  const reset = styles.match(/#archive-scraper :where\(button\) \{([^}]+)\}/)[1];
  assert.match(reset, /all: unset;/);
  assert.match(reset, /box-sizing: border-box;/);
  assert.match(reset, /font-family: inherit;/);
  assert.ok(styles.indexOf('#archive-scraper :where(button)') < styles.indexOf('#archive-scraper-btn {'));
  const button = styles.match(/#archive-scraper-btn \{([^}]+)\}/)[1];
  for (const declaration of ['display: inline-flex;', 'align-items: center;', 'justify-content: center;', 'padding: 0;', 'width: 56px;', 'height: 56px;']) assert.ok(button.includes(declaration), declaration);
  assert.match(styles, /#archive-scraper button:focus-visible \{[^}]*outline: 2px solid/);
});

test('header and footer controls are excluded even without a main element', () => {
  const { document, context } = environment();
  const main = document.querySelector('main');
  main.replaceWith(...main.childNodes);
  assert.equal(article(context).expected_photo_count, 2);
});

test('explicit empty description section remains empty in DOM-only fallback', () => {
  const { document, context } = environment();
  document.querySelector('script').remove();
  const section = [...document.querySelectorAll('section')].find(node => node.querySelector('h2').textContent.startsWith('From '));
  section.querySelector('div').innerHTML = '';
  assert.equal(article(context).body.status, 'empty');
  vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context);
});

test('multiple images sharing one figure cannot share an inferred caption', () => {
  const { document, context } = environment();
  document.querySelector('script').remove();
  const first = document.querySelector('figure');
  first.appendChild(document.querySelectorAll('figure')[1].querySelector('a'));
  assert.throws(() => vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context), /描述未确认/);
});

test('aria-describedby provides an explicit class-independent photo caption', () => {
  const { document, context } = environment();
  document.querySelector('script').remove();
  const image = document.querySelector('img[data-photo-id="200"]');
  const caption = image.closest('figure').querySelector('figcaption');
  caption.id = 'photo-caption';
  image.setAttribute('aria-describedby', 'photo-caption');
  assert.equal(article(context).photos[0].caption.source, 'dom.aria-describedby');
});

test('lazy DOM placeholders do not invalidate a structured original URL', () => {
  const { document, context } = environment();
  document.querySelector('img[data-photo-id="200"]').setAttribute('src', 'data:image/gif;base64,AAAA');
  vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${url}'))`, context);
});

test('same photo in another project cannot supply the current project caption', () => {
  const { document, context } = environment();
  changeState(document, state => { delete state.photos.items['201'].attributes.description; });
  const figure = document.querySelector('img[data-photo-id="201"]').closest('figure');
  figure.querySelector('a').setAttribute('href', '/home/other-project/201');
  figure.querySelector('figcaption').textContent = 'Wrong context';
  assert.equal(article(context).photos[1].caption.status, 'missing');
});

test('incrementally loaded project photos merge without relying on classnames', async () => {
  const { document, context } = environment();
  changeState(document, state => { state.collections.items['10'].relationships.items.meta.count = 3; });
  context.setTimeout = resolve => {
    const figure = document.createElement('figure');
    figure.innerHTML = '<a href="/home/sample-house-abcd/202"><img data-photo-id="202" src="https://images2.dwell.com/photos/100/202/original.jpg?w=160"></a><figcaption>New photo</figcaption>';
    document.querySelector('main').appendChild(figure);
    resolve();
  };
  const result = await vm.runInContext(`captureDwellArticle('${url}')`, context);
  assert.deepEqual(Array.from(result.photos, photo => photo.id), ['200', '201', '202']);
  assert.equal(result.photos[2].caption.value, 'New photo');
});

test('changing project while collecting aborts instead of mixing snapshots', async () => {
  const { document, context } = environment();
  changeState(document, state => { state.collections.items['10'].relationships.items.meta.count = 3; });
  context.setTimeout = resolve => { context.currentArticleUrl = () => 'https://www.dwell.com/home/another'; resolve(); };
  await assert.rejects(vm.runInContext(`captureDwellArticle('${url}')`, context), /切换到其他项目/);
});

test('browser JSON renders through the actual Python contract after removing all classes', async () => {
  const { spawnSync } = require('node:child_process');
  const { document, context } = environment();
  for (const node of document.querySelectorAll('[class]')) node.removeAttribute('class');
  const payload = await vm.runInContext(`captureDwellArticle('${url}')`, context);
  const result = spawnSync(path.join(__dirname, '.venv/bin/python'), ['-c',
    'import json,sys; from scraper import parse_article; data=json.load(sys.stdin); article=parse_article(data["url"],article_data=data); print(article.content_md)'],
  { cwd: __dirname, input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('![](images/01.jpg)\n\nOcean view.'));
  assert.ok(result.stdout.includes('## Details'));
  assert.ok(result.stdout.includes('Québec \\| Canada'));
});

function paginatedEnvironment(manuallyLoaded = false) {
  const { document, context } = environment();
  changeState(document, state => {
    state.collections.items['10'].relationships.items.meta.count = 36;
    state.collections.relationQueries = {
      '{"id":"10","page[offset]":0,"page[limit]":20}': { items: Array.from({ length: 20 }, (_, index) => `photos-${200 + index}`), meta: { count: 36 } },
      '{"id":"10"}': { items: [...Array.from({ length: 20 }, (_, index) => `photos-${200 + index}`), ...Array(16).fill(null)], meta: { count: 36 } },
    };
    state.photos.items = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [String(200 + index), {
      links: { original: `https://images2.dwell.com/photos/100/${200 + index}/original.jpg` }, attributes: { description: null },
    }]));
  });
  const main = document.querySelector('main');
  for (const figure of main.querySelectorAll('figure')) figure.remove();
  const gallery = document.createElement('section');
  const addPhoto = id => {
    const card = document.createElement('div');
    card.innerHTML = `<a href="/home/sample-house-abcd/${id}"><img data-photo-id="${id}" src="https://images2.dwell.com/photos/100/${id}/original.jpg?w=160"></a><div class="arbitrary-hash"></div>`;
    gallery.appendChild(card);
  };
  for (let id = 200; id < 220; id += 1) addPhoto(id);
  const more = document.createElement('button');
  more.textContent = 'View More';
  gallery.appendChild(more);
  main.appendChild(gallery);
  let clicks = 0;
  const load = () => {
    for (let id = 220; id < 236; id += 1) addPhoto(id);
    more.remove();
  };
  more.addEventListener('click', () => { clicks += 1; load(); });
  if (manuallyLoaded) load();
  for (const node of document.querySelectorAll('[class]')) node.removeAttribute('class');
  const requests = [];
  context.setTimeout = (resolve, delay) => delay === 500 ? resolve() : setTimeout(resolve, delay);
  context.fetch = async (target, options) => {
    requests.push({ target, options });
    const id = target.split('/').pop();
    const state = JSON.parse(document.querySelector('script').textContent.replace(/^window.INITIAL_STATE = /, '').replace(/;\s*$/, ''));
    state.photos.items[id] = { links: { original: `https://images2.dwell.com/photos/100/${id}/original.jpg` }, attributes: { description: id === '220' ? null : `Description ${id}` } };
    return { ok: true, url: target, text: async () => `<script>window.INITIAL_STATE = ${JSON.stringify(state)};</script>` };
  };
  return { document, context, requests, clicks: () => clicks };
}

test('View More loads 20 + 16 photos and supplements descriptions from fresh photo pages', async () => {
  const { context, requests, clicks } = paginatedEnvironment();
  const result = await vm.runInContext(`captureDwellArticle('${url}')`, context);
  assert.equal(clicks(), 1);
  assert.equal(result.photos.length, 36);
  assert.equal(requests.length, 16);
  assert.deepEqual(Array.from(result.photos, photo => photo.id), Array.from({ length: 36 }, (_, index) => String(200 + index)));
  assert.equal(result.photos[20].caption.status, 'empty');
  assert.equal(result.photos[21].caption.value, 'Description 221');
  assert.ok(!JSON.stringify(result).includes('NEVER_UPLOAD_THIS_TOKEN'));
  for (const request of requests) {
    assert.ok(request.target.startsWith(`${url}/`));
    assert.equal(request.options.credentials, 'same-origin');
    assert.equal(request.options.redirect, 'error');
    assert.ok(!request.options.headers);
  }
});

test('manually loaded photos still supplement descriptions when INITIAL_STATE remains at 20', async () => {
  const { context, requests, clicks } = paginatedEnvironment(true);
  const before = article(context);
  assert.equal(before.photos.length, 36);
  assert.equal(before.photos.filter(photo => photo.caption.status === 'missing').length, 16);
  const result = await vm.runInContext(`captureDwellArticle('${url}')`, context);
  assert.equal(clicks(), 0);
  assert.equal(requests.length, 16);
  assert.equal(result.photos.filter(photo => photo.caption.status === 'missing').length, 0);
});

test('View More in unrelated sections is not clicked', () => {
  const { document, context } = paginatedEnvironment();
  const unrelated = document.createElement('section');
  unrelated.innerHTML = '<a href="/home/other-house/999"><img data-photo-id="999"></a><button>View More</button>';
  document.querySelector('main').prepend(unrelated);
  const selected = vm.runInContext(`dwellLoadMoreButton(document, '${url}')`, context);
  assert.notEqual(selected, unrelated.querySelector('button'));
  assert.equal(selected.textContent, 'View More');
});

test('HTTP errors and missing detail descriptions are never converted to empty captions', async () => {
  for (const mode of ['http', 'missing', 'wrong-project', 'wrong-photo', 'redirect']) {
    const { document, context } = paginatedEnvironment(true);
    context.fetch = async target => {
      if (mode === 'http') return { ok: false, status: 403 };
      const state = JSON.parse(document.querySelector('script').textContent.replace(/^window.INITIAL_STATE = /, '').replace(/;\s*$/, ''));
      const id = target.split('/').pop();
      state.photos.items[id] = { links: { original: `https://images2.dwell.com/photos/100/${id}/original.jpg` }, attributes: mode === 'missing' ? {} : { description: null } };
      if (mode === 'wrong-project') state.slugs.items['1'].attributes.slug = 'another-project';
      if (mode === 'wrong-photo') state.photos.items[id].links.original = 'https://images2.dwell.com/photos/100/999/original.jpg';
      return { ok: true, url: mode === 'redirect' ? 'https://www.dwell.com/signin' : target, text: async () => `<script>window.INITIAL_STATE = ${JSON.stringify(state)};</script>` };
    };
    await assert.rejects(vm.runInContext(`captureDwellArticle('${url}')`, context), /描述补齐失败/);
  }
});

test('cancel aborts an in-flight photo request immediately', async () => {
  const { context } = paginatedEnvironment(true);
  let aborted = false;
  context.fetch = (target, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    vm.runInContext('cancelDwellCapture();', context);
  });
  await assert.rejects(vm.runInContext(`captureDwellArticle('${url}')`, context), /已取消页面收集/);
  assert.equal(aborted, true);
});

test('photo detail requests have a bounded timeout', async () => {
  const { context } = paginatedEnvironment(true);
  context.setTimeout = (callback, delay) => setTimeout(callback, delay === 20000 ? 0 : delay);
  context.fetch = (target, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  await assert.rejects(vm.runInContext(`captureDwellArticle('${url}')`, context), /请求超时/);
});

const storyUrl = 'https://www.dwell.com/article/sample-cabin-abcd';
function storyEnvironment() {
  const { document, context } = environment();
  changeState(document, state => {
    state.slugs.items.story = { attributes: { slug: 'sample-cabin-abcd', sluggableType: 'stories', sluggableId: '20' } };
    state.articles = { items: { '20': { type: 'stories', attributes: {
      title: 'A Cabin', lead: 'An introduction.', defaultImageId: '200',
      body: '<p>First paragraph.</p><dwell-photo photoId="201" caption="A &lt;b&gt;wooden&lt;/b&gt; room."/><p>Last paragraph.</p><dwell-photo photoId="200" caption="Add a caption"/><p><b>Project Credits:</b></p><p>Designer: Cabin Studio</p>',
    }, relationships: { photos: { data: [{ type: 'photos', id: '201' }, { type: 'photos', id: '200' }] } } } } };
    state.photos.items['200'].attributes.description = null;
  });
  context.currentArticleUrl = () => storyUrl;
  vm.runInContext('configureDwellCapture({ currentArticleUrl: () => currentArticleUrl(), renderStages })', context);
  return { document, context };
}

test('article captures story body, inline captions, originals and credits without home pagination', async () => {
  const { context } = storyEnvironment();
  context.fetch = () => { throw new Error('article must not fetch home photo pages'); };
  const result = JSON.parse(JSON.stringify(await vm.runInContext(`captureDwellArticle('${storyUrl}')`, context)));
  assert.equal(result.title, 'A Cabin');
  assert.equal(result.url, storyUrl);
  assert.equal(result.expected_photo_count, 2);
  assert.deepEqual(result.photos.map(photo => photo.id), ['200', '201']);
  assert.equal(result.photos[0].caption.status, 'empty');
  assert.equal(result.photos[1].caption.value, 'A <b>wooden</b> room.');
  assert.match(result.body.value, /An introduction/);
  assert.match(result.body.value, /First paragraph/);
  assert.match(result.body.value, /Last paragraph/);
  assert.doesNotMatch(result.body.value, /dwell-photo|Project Credits|Cabin Studio/);
  assert.deepEqual(result.sections, [{ title: 'Credits', rows: [{ label: 'Designer', value: 'Cabin Studio' }] }]);
  const { spawnSync } = require('node:child_process');
  const output = spawnSync(path.join(__dirname, '.venv/bin/python'), ['-c',
    'import json,sys; from scraper import parse_article; data=json.load(sys.stdin); print(parse_article(data["url"], article_data=data).content_md)'],
    { cwd: __dirname, input: JSON.stringify(result), encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /A \*\*wooden\*\* room/);
  assert.match(output.stdout, /images\/02.jpg/);
});

test('article ignores hashed classes and other stories and never uploads state secrets', () => {
  const { document, context } = storyEnvironment();
  const read = () => JSON.parse(JSON.stringify(vm.runInContext(`extractDwellArticle(document, '${storyUrl}')`, context)));
  const before = read();
  for (const node of document.querySelectorAll('[class]')) node.removeAttribute('class');
  changeState(document, state => { state.articles.items.other = { type: 'stories', attributes: { title: 'WRONG STORY' } }; });
  assert.deepEqual(read(), before);
  assert.doesNotMatch(JSON.stringify(before), /NEVER_UPLOAD_THIS_TOKEN|WRONG STORY|contactEmail/);
});

test('article rejects missing body, photos, captions, relationships or stale story identity', () => {
  const mutations = [
    state => { delete state.articles.items['20'].attributes.body; },
    state => { delete state.photos.items['201']; },
    state => { state.articles.items['20'].attributes.body = '<p>Text</p>'; delete state.photos.items['201'].attributes.description; },
    state => { delete state.articles.items['20'].relationships.photos; },
    state => { delete state.slugs.items.story; },
  ];
  for (const mutate of mutations) {
    const { document, context } = storyEnvironment();
    changeState(document, mutate);
    assert.throws(() => vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${storyUrl}'))`, context));
  }
});

test('built userscript preserves metadata and bootstraps the article widget', () => {
  const script = fs.readFileSync(path.join(__dirname, '../tampermonkey/architecture-archive.user.js'), 'utf8');
  assert.ok(script.startsWith('// ==UserScript=='));
  assert.match(script, /@match +https:\/\/www\.dwell\.com\/article\/\*/);
  assert.match(script, /@grant +GM_xmlhttpRequest/);
  const { document } = parseHTML('<html><head></head><body></body></html>');
  const requests = [];
  vm.runInNewContext(script, { document, location: new URL(storyUrl), GM_xmlhttpRequest: request => requests.push(request), URL });
  assert.ok(document.querySelector('#archive-scraper'));
  assert.ok(document.querySelector('style').textContent.includes('#archive-scraper'));
  assert.equal(new URL(requests[0].url).searchParams.get('url'), storyUrl);
});

test('article handles unescaped HTML quotes inside Dwell photo caption attributes', () => {
  const { document, context } = storyEnvironment();
  changeState(document, state => {
    state.articles.items['20'].attributes.body = '<p>Before.</p><dwell-photo photoId="201" caption="<span style="color:red">A <a href="https://example.com/">room &amp; view</a>.</span>" layout="" credit="Add credit" photoUserId=""/><p>After.</p>';
  });
  const result = vm.runInContext(`validateDwellCapture(extractDwellArticle(document, '${storyUrl}'))`, context);
  assert.match(result.photos[1].caption.value, /room &amp; view/);
  assert.match(result.photos[1].caption.value, /href="https:\/\/example.com\/"/);
  assert.doesNotMatch(result.photos[1].caption.value, /style=/);
  assert.match(result.body.value, /After/);
  assert.doesNotMatch(result.body.value, /room &amp; view|photoUserId/);
});
