const ORIGIN = 'https://www.archdaily.com';
const PROMOTIONAL = '.js-publift, #related-products, .js-loading-products-widget';
let activeCapture = null;

const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const field = (value, source, format = 'text') => ({ status: value.trim() ? 'present' : 'empty', value, format, source });

function bodyIsLoading(page) {
  return [...page.querySelectorAll('#single-content #content-placeholder, #single-content picture.loader')]
    .some(node => !node.closest(PROMOTIONAL));
}

export function archdailyProjectUrl(raw) {
  const parsed = new URL(raw);
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password || !/^\/\d+\/[^/]+\/?$/.test(parsed.pathname)) {
    throw new Error('仅支持 ArchDaily 项目主页');
  }
  return `${ORIGIN}${parsed.pathname.replace(/\/$/, '')}`;
}

export function archdailyImage(raw, id) {
  const parsed = new URL(raw);
  const match = parsed.pathname.match(/^\/media\/images\/((?:[a-f0-9]{4}\/){6})slideshow\/[^/%\\]+\.(?:jpe?g|png|webp|avif)$/i);
  if (parsed.origin !== 'https://images.adsttc.com' || parsed.username || parsed.password || parsed.hash ||
      (parsed.search && !/^\?\d+$/.test(parsed.search)) || !match || match[1].replaceAll('/', '') !== id) {
    throw new Error('ArchDaily 大图域名、路径或图片 ID 不匹配');
  }
  return parsed.href;
}

function photoLink(raw, url) {
  const parsed = new URL(raw, `${url}/`);
  const prefix = `${new URL(url).pathname}/`;
  const suffix = parsed.pathname.slice(prefix.length);
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash ||
      !parsed.pathname.startsWith(prefix) || !/^[a-f0-9]{24}-[^/]+$/.test(suffix)) {
    throw new Error('ArchDaily 图库包含非当前项目图片');
  }
  return { id: suffix.slice(0, 24), href: parsed.href };
}

export function extractArchdailyProject(page, rawUrl) {
  const url = archdailyProjectUrl(rawUrl);
  const canonical = page.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const article = page.querySelector('#single-content');
  if (!canonical || archdailyProjectUrl(canonical) !== url || !article ||
      archdailyProjectUrl(article.getAttribute('data-io-article-url')) !== url) {
    throw new Error('ArchDaily 当前项目与 canonical 不匹配');
  }
  if (bodyIsLoading(page)) throw new Error('ArchDaily 正文尚未完整加载，请等待页面加载完成');
  const title = text(page.querySelector('h1'));
  const bodyNodes = [...article.children].filter(node => /^(P|H2|H3|H4|UL|OL|BLOCKQUOTE)$/.test(node.tagName) && !node.classList.contains('thumbs') && !node.closest(PROMOTIONAL));
  const body = bodyNodes.map(node => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll(`script, style, iframe, figure, img, button, .article-meta, .afd-specs, [id^="ads-"], ${PROMOTIONAL}`).forEach(child => child.remove());
    clone.querySelectorAll('a[href]').forEach(link => {
      const target = new URL(link.getAttribute('href'), url);
      if (['https:', 'http:'].includes(target.protocol)) link.setAttribute('href', target.href);
      else link.removeAttribute('href');
    });
    return text(clone) ? clone.outerHTML : '';
  }).filter(Boolean).join('\n');
  if (!title || !body) throw new Error('ArchDaily 标题或正文缺失');
  const gallery = page.querySelector('#gallery-thumbs');
  const entries = [...(gallery?.children || [])].map(item => {
    const link = item.querySelector('a[href]');
    const image = item.querySelector('img');
    if (!link || !image) throw new Error('ArchDaily 图库存在未加载或不支持的媒体');
    const identity = photoLink(link.getAttribute('href'), url);
    const large = item.hasAttribute('data-largesrc') ? item : item.querySelector('[data-largesrc]');
    const caption = item.querySelector('figcaption') || article.querySelector(`figcaption[id="${identity.id}"]`);
    return { ...identity, large: large?.getAttribute('data-largesrc'), caption: caption ? text(caption) : undefined,
      total: image.getAttribute('alt')?.match(/\bImage \d+ of (\d+)\b/)?.[1] };
  });
  if (!entries.length || entries.length > 1000 || new Set(entries.map(entry => entry.id)).size !== entries.length ||
      entries.some(entry => entry.total && Number(entry.total) !== entries.length)) {
    throw new Error('ArchDaily 图库数量不完整或存在重复图片');
  }
  const sections = [];
  const details = [];
  const credits = [];
  const info = [];
  for (const item of article.querySelectorAll('.afd-specs__item')) {
    if (item.closest(PROMOTIONAL) || (item.querySelector('.js-loading-products-widget') && !item.querySelector('.afd-specs__key, .afd-specs__value'))) continue;
    const label = text(item.querySelector('.afd-specs__key')).replace(/\s*:\s*$/, '');
    const value = text(item.querySelector('.afd-specs__value'));
    if (!label || !value) throw new Error(`ArchDaily 项目信息未完整加载${label ? `：${label}` : '：字段名称缺失'}`);
    const rows = /architect|photograph|design|engineer|client/i.test(label) ? credits : /area|year|country|city|location|category/i.test(label) ? info : details;
    rows.push({ label, value });
  }
  const location = text(article.querySelector('.afd-specs__header-location'));
  if (location) info.unshift({ label: 'Location', value: location });
  for (const [name, rows] of [['Project information', info], ['Credits', credits], ['Details', details]]) {
    if (rows.length) sections.push({ title: name, rows });
  }
  const tags = [...new Set([...article.parentElement.querySelectorAll('.afd-tags .afd-tags__btn')].map(text).filter(Boolean))];
  if (tags.length) sections.push({ title: 'Tags', rows: [{ label: 'Materials and Tags', value: tags.join(', ') }] });
  return { entries, payload: { schema_version: 1, source: 'archdaily', url, title,
    building: title.split(' / ')[0], studio: credits.find(row => row.label === 'Architects')?.value || '',
    body: field(body, 'dom.single-content', 'html'), sections, expected_photo_count: entries.length, photos: [], warnings: [] } };
}

export function parseArchdailyGallery(page, url, entries) {
  const gallery = page.querySelector('#gallery-items[data-images]');
  if (!gallery || gallery.getAttribute('data-path') !== new URL(url).pathname || gallery.getAttribute('data-id') !== entries[0].id) {
    throw new Error('ArchDaily 查看器不属于当前项目或图片');
  }
  let records;
  try { records = JSON.parse(gallery.getAttribute('data-images')); } catch (_) { throw new Error('ArchDaily 查看器数据无效'); }
  if (!Array.isArray(records) || records.length !== entries.length) throw new Error('ArchDaily 查看器相册数量不匹配');
  const byId = new Map();
  for (const record of records) {
    if (!record || !['MediaPicture', 'MediaPlan'].includes(record.type) || typeof record.caption !== 'string') {
      throw new Error('ArchDaily 图片类型或图注未确认');
    }
    const identity = photoLink(record.link, url);
    const entry = entries.find(candidate => candidate.id === identity.id && candidate.href === identity.href);
    if (!entry || byId.has(identity.id)) throw new Error('ArchDaily 查看器图片身份不匹配或重复');
    byId.set(identity.id, { url: archdailyImage(record.url_slideshow, identity.id), caption: record.caption });
  }
  return byId;
}

export function cancelArchdailyCapture() {
  activeCapture?.abort();
}

export async function captureArchdailyArticle(rawUrl, options = {}) {
  if (activeCapture) throw new Error('ArchDaily 正在采集中');
  const page = options.document || document;
  const url = archdailyProjectUrl(rawUrl);
  const currentUrl = options.currentUrl || (() => location.href);
  const controller = new AbortController();
  activeCapture = controller;
  const timeout = setTimeout(() => controller.abort(), options.overallTimeoutMs ?? 60000);
  const check = () => {
    if (controller.signal.aborted) throw new Error('ArchDaily 采集已取消或超时');
    if (archdailyProjectUrl(currentUrl()) !== url) throw new Error('ArchDaily 页面已切换，停止采集');
  };
  const navigation = setInterval(() => {
    try { check(); } catch (_) { controller.abort(); }
  }, 200);
  try {
    check();
    while (bodyIsLoading(page)) {
      options.progress?.('等待 ArchDaily 正文完整加载');
      await new Promise(resolve => setTimeout(resolve, 200));
      check();
    }
    const { entries, payload } = extractArchdailyProject(page, url);
    let gallery = new Map();
    if (!entries.some(entry => entry.total) || entries.some(entry => !entry.large || entry.caption === undefined)) {
      options.progress?.(`核对 ${entries.length} 张图库大图和图注`);
      const requestTimeout = setTimeout(() => controller.abort(), options.requestTimeoutMs ?? 20000);
      try {
        const response = await (options.fetch || fetch)(entries[0].href, { signal: controller.signal, credentials: 'same-origin', redirect: 'error' });
        check();
        if (!response.ok || response.redirected || response.url !== entries[0].href || !response.headers.get('content-type')?.includes('text/html')) {
          throw new Error('ArchDaily 查看器请求失败、跳转或内容格式无效');
        }
        const html = await response.text();
        check();
        gallery = parseArchdailyGallery(new DOMParser().parseFromString(html, 'text/html'), url, entries);
      } finally { clearTimeout(requestTimeout); }
    }
    payload.photos = entries.map(entry => {
      const record = gallery.get(entry.id);
      const imageUrl = archdailyImage(entry.large || record?.url, entry.id);
      const caption = record ? [...new Set([record.caption, entry.caption].filter(value => typeof value === 'string' && value.trim()))].join('\n') : entry.caption;
      return { id: entry.id, url: imageUrl, caption: field(caption, 'dom.archdaily-gallery') };
    });
    check();
    const final = extractArchdailyProject(page, url);
    if (JSON.stringify(final.entries) !== JSON.stringify(entries) || JSON.stringify(final.payload) !== JSON.stringify({ ...payload, photos: [] })) {
      throw new Error('ArchDaily 页面在采集期间变化，请重试');
    }
    options.progress?.(`已确认 ${entries.length} 张大图`);
    return payload;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('ArchDaily 采集已取消、超时或页面已切换');
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(navigation);
    controller.abort();
    activeCapture = null;
  }
}
