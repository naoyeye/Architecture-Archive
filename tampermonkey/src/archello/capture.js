const ORIGIN = 'https://archello.com';
const IMAGE_HOST = 'archello.s3.eu-central-1.amazonaws.com';
let activeCapture = null;

function projectUrl(raw) {
  const parsed = new URL(raw);
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password
    || !/^\/project\/[^/]+\/?$/.test(parsed.pathname)) throw new Error('不是 Archello 项目页面');
  return ORIGIN + parsed.pathname.replace(/\/$/, '');
}

function originalImageUrl(raw) {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' || parsed.host !== IMAGE_HOST || parsed.username || parsed.password
    || !/^\/images\/\d{4}\/\d{2}\/\d{2}\/[^/%\\]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(parsed.pathname)
    || parsed.search || parsed.hash) throw new Error('Archello 查看器没有提供可确认的原图');
  return parsed.href;
}

function text(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  for (const br of clone.querySelectorAll('br')) br.replaceWith(' / ');
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function field(value, source, format = 'text') {
  return { status: value === undefined ? 'missing' : value.trim() ? 'present' : 'empty',
    value: value ?? '', source: `dom.archello.${source}`, format };
}

function cleanContent(node) {
  const clone = node.cloneNode(true);
  for (const child of clone.querySelectorAll('script, style, iframe, object, embed, form, input, button, svg, img, figure, [id^="block-project-applied-products-"]')) child.remove();
  for (const child of [...clone.querySelectorAll('*')].reverse()) {
    if (!/^(P|DIV|SPAN|A|STRONG|B|EM|I|U|BR|H[1-6]|UL|OL|LI|BLOCKQUOTE|TABLE|THEAD|TBODY|TR|TH|TD|SUP|SUB)$/.test(child.tagName)) {
      child.replaceWith(...child.childNodes);
      continue;
    }
    const href = child.getAttribute('href');
    for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
    if (child.tagName === 'A' && href) {
      const parsed = new URL(href, ORIGIN);
      if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) child.setAttribute('href', parsed.href);
    }
  }
  return clone;
}

function attachment(raw, storyId) {
  const parsed = new URL(raw, ORIGIN);
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  const match = parsed.pathname.match(/^\/story\/(\d+)\/attachments\/(photos-videos|drawings)\/(\d+)$/);
  return match && match[1] === storyId ? { url: parsed.href, category: match[2], position: Number(match[3]) } : null;
}

function assertProjectLink(page, url, selector) {
  if (![...page.querySelectorAll(selector)].some(link => {
    try { return projectUrl(new URL(link.getAttribute('href'), ORIGIN).href) === url; } catch (_) { return false; }
  })) throw new Error('Archello 返回页面不属于当前项目');
}

function rows(container) {
  if (!container) return [];
  const entries = [...container.querySelectorAll('dt')].map(label => ({ label: text(label), value: text(label.nextElementSibling) }));
  if (entries.length) return entries;
  return [...container.querySelectorAll('.ah-project-details__item')].map(row => ({
    label: text(row.querySelector('.ah-project-details__item-title')),
    value: text(row.querySelector('.ah-project-details__item-text')),
  }));
}

function extractArchelloProject(page, rawUrl) {
  const url = projectUrl(rawUrl);
  const canonical = page.querySelector('link[rel="canonical"]')?.getAttribute('href');
  if (!canonical || projectUrl(canonical) !== url) throw new Error('Archello 项目 canonical 不匹配');
  const stories = [...page.querySelectorAll('#stories-grid > [data-key]')];
  if (!stories.length || page.querySelector('#stories-grid .pagination, #stories-grid .pager')) {
    throw new Error('当前 Archello 项目故事未完整加载');
  }
  const heroLinks = [...page.querySelectorAll('.ah-project-hero__link[href]')];
  let story;
  if (heroLinks.length) {
    const matches = stories.filter(candidate => heroLinks.every(link =>
      attachment(link.getAttribute('href'), candidate.getAttribute('data-key'))));
    if (matches.length !== 1) throw new Error('Archello 项目头图与主故事关联不明确');
    story = matches[0];
  } else if (stories.length === 1) {
    story = stories[0];
  } else {
    throw new Error('Archello 多故事页面缺少项目头图关联，无法确认主故事');
  }
  const storyId = story.getAttribute('data-key');
  if (!/^\d+$/.test(storyId)) throw new Error('Archello story ID 缺失');
  const title = text(page.querySelector('.ah-project-hero__title'));
  const studio = text(story.querySelector(`[id="popover-brand-short-info-title-${storyId}"]`));
  const bodyNode = story.querySelector('.mce-content-body');
  if (!title || !bodyNode) throw new Error('Archello 标题或正文未加载');
  const body = cleanContent(bodyNode);
  const heading = story.querySelector('.ah-project-story__heading');
  if (heading) {
    const copied = page.createElement('h2');
    copied.textContent = text(heading);
    body.prepend(copied);
  }
  const media = new Map();
  for (const link of story.querySelectorAll('a[href]')) {
    const target = attachment(link.getAttribute('href'), storyId);
    if (target && link.querySelector('img')) {
      const caption = link.querySelector('figcaption');
      media.set(target.url, { ...target, inlineCaption: caption ? text(caption) : media.get(target.url)?.inlineCaption });
    }
  }
  if (!media.size) throw new Error('Archello 项目未提供照片');
  const sections = [];
  const information = rows(story.querySelector('#grid-product-detail-general'));
  for (const row of information) {
    if (row.label === 'Project Year') row.label = 'Year';
    if (row.label === 'Location') row.value = row.value.replace(/\s*\|\s*View Map.*$/, '');
  }
  const credits = rows(story.querySelector('#project-credits'));
  if (information.length) sections.push({ title: 'Project information', rows: information });
  if (credits.length) sections.push({ title: 'Credits', rows: credits });
  const creditMore = [...story.querySelectorAll('#project-credits a[href]')].find(link => /^View All$/i.test(text(link)));
  const specLink = [...story.querySelectorAll('a[href]')].find(link => new URL(link.getAttribute('href'), ORIGIN).pathname === `/story/${storyId}/attachments/product-spec-sheet`);
  return { storyId, media: [...media.values()], creditMore: creditMore?.getAttribute('href'), specLink: specLink?.getAttribute('href'),
    article: { schema_version: 1, source: 'archello', url, title, building: title, studio,
      body: field(text(body) ? body.innerHTML : '', 'body', 'html'), sections, expected_photo_count: 0, photos: [],
      warnings: stories.length > 1 ? [`仅归档项目头图关联的主故事 ${storyId}；其余 ${stories.length - 1} 个参与方故事不纳入正文和相册。`] : [] } };
}

function extractArchelloGallery(page, url, storyId, category) {
  assertProjectLink(page, url, '#navbar-gallery a[href]');
  const grid = page.querySelector(`#${category}-grid`);
  if (!grid || grid.querySelector('.pagination, .pager, [rel="next"]')) throw new Error('Archello 完整相册未加载');
  const media = new Map();
  for (const link of grid.querySelectorAll('a[href]')) {
    const target = attachment(link.getAttribute('href'), storyId);
    if (!target || target.category !== category) continue;
    const image = link.querySelector('img');
    if (!image) continue;
    const raw = image.getAttribute('data-src') || image.getAttribute('src');
    const thumbnail = new URL(raw, ORIGIN);
    if (thumbnail.origin !== ORIGIN || !thumbnail.pathname.startsWith('/thumbs/images/')) throw new Error('Archello 相册图片来源无法确认');
    const item = link.closest('.multimedia-grid-item');
    const idNode = item?.querySelector('[id^="story-media-"][id$="-socials-share"]');
    const mediaId = idNode?.id.match(/^story-media-(\d+)-socials-share$/)?.[1];
    if (!mediaId) throw new Error('Archello 相册照片 ID 缺失');
    const value = { ...target, mediaId, imagePath: thumbnail.pathname.slice('/thumbs'.length) };
    if (media.has(target.url) && media.get(target.url).mediaId !== mediaId) throw new Error('Archello 相册照片 ID 冲突');
    media.set(target.url, value);
  }
  const ordered = [...media.values()].sort((left, right) => left.position - right.position);
  if (!ordered.length || ordered.length > 1000 || ordered.some((item, index) => item.position !== index + 1)) throw new Error('Archello 相册不完整或包含不支持的媒体');
  return ordered;
}

function extractArchelloPhoto(page, url, storyId, photo, count) {
  const viewer = page.querySelector(`[id="attachment-story-${storyId}-grid"] .photoviewer`);
  if (!viewer || viewer.getAttribute('data-key') !== photo.mediaId) throw new Error('Archello 查看器照片 ID 不匹配');
  assertProjectLink(viewer, url, '.photoviewer-sidebar-heading h1 a[href]');
  const total = text(viewer.querySelector('.photoviewer-content-footer')).match(/\b(\d+)\s+of\s+(\d+)\b/);
  if (!total || Number(total[1]) !== photo.position || Number(total[2]) !== count) throw new Error('Archello 查看器照片数量不匹配');
  const images = viewer.querySelectorAll('.image-scale img');
  if (images.length !== 1) throw new Error('Archello 查看器未提供单张原图');
  const original = originalImageUrl(images[0].getAttribute('src'));
  if (new URL(original).pathname !== photo.imagePath) throw new Error('Archello 原图与相册图片不匹配');
  const captionNode = viewer.querySelector('.photoviewer-sidebar-heading');
  const caption = [...captionNode.children].filter(node => node.tagName === 'P').map(text).filter(Boolean).join('\n\n');
  return { id: new URL(original).pathname, url: original, caption: field(caption, 'viewer.caption') };
}

function cancelArchelloCapture() {
  activeCapture?.abort();
}

async function captureArchelloArticle(url, options = {}) {
  if (activeCapture) throw new Error('Archello 页面收集中');
  const controller = new AbortController();
  activeCapture = controller;
  const currentUrl = options.currentUrl || (() => location.href);
  const progress = options.progress || (() => {});
  const canonical = projectUrl(url);
  let timedOut = false;
  const guard = () => {
    if (timedOut) throw new Error('Archello 页面收集超时（5 分钟）');
    if (controller.signal.aborted) throw new Error('Archello 页面收集已取消');
    if (projectUrl(currentUrl()) !== canonical) throw new Error('收集期间切换了 Archello 项目');
  };
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 300000);
  async function load(raw) {
    guard();
    const target = new URL(raw, ORIGIN);
    if (target.origin !== ORIGIN || target.username || target.password) throw new Error('拒绝跨站 Archello 请求');
    const requestController = new AbortController();
    const abort = () => requestController.abort();
    controller.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    try {
      const response = await fetch(target.href, { credentials: 'same-origin', redirect: 'error', signal: requestController.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.url !== target.href) throw new Error('Archello 响应 URL 不匹配');
      const html = await response.text();
      guard();
      return new DOMParser().parseFromString(html, 'text/html');
    } catch (error) {
      guard();
      throw new Error(requestController.signal.aborted ? 'Archello 请求超时' : error.message);
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', abort);
    }
  }
  try {
    guard();
    let project = extractArchelloProject(options.page || document, canonical);
    if (project.creditMore) {
      const target = new URL(project.creditMore, ORIGIN);
      if (projectUrl(target.href) !== canonical || !/^\?dp-\d+-per-page=\d+$/.test(target.search)) throw new Error('Archello 署名展开链接不匹配');
      const expanded = extractArchelloProject(await load(target.href), canonical);
      if (expanded.storyId !== project.storyId || expanded.creditMore) throw new Error('Archello 署名未完整加载');
      project.article.sections = expanded.article.sections;
    }
    if (project.specLink) {
      const specPage = await load(project.specLink);
      assertProjectLink(specPage, canonical, '#navbar-gallery a[href]');
      const table = specPage.querySelector('#specifications-grid');
      if (!table || table.querySelector('.pagination, .pager')) throw new Error('Archello 材料表未完整加载');
      const details = [...table.querySelectorAll('tbody tr')].map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length !== 4) throw new Error('Archello 材料表结构无法识别');
        return { label: text(cells[0]), value: [text(cells[1]), text(cells[2])].filter(Boolean).join(' — ') };
      });
      if (details.length) project.article.sections.push({ title: 'Details', rows: details });
    }
    const allMedia = new Set();
    for (const category of new Set(project.media.map(photo => photo.category))) {
      const seed = project.media.find(photo => photo.category === category);
      const galleryPage = await load(seed.url.replace(/\/\d+$/, ''));
      const photos = extractArchelloGallery(galleryPage, canonical, project.storyId, category);
      for (const photo of photos) {
        allMedia.add(photo.url);
        progress(`收集 Archello ${category} ${photo.position}/${photos.length}`);
        const result = extractArchelloPhoto(await load(photo.url), canonical, project.storyId, photo, photos.length);
        const inlineCaption = project.media.find(item => item.url === photo.url)?.inlineCaption;
        if (inlineCaption && !result.caption.value.includes(inlineCaption)) {
          result.caption = field([inlineCaption, result.caption.value].filter(Boolean).join('\n\n'), 'viewer.caption');
        }
        const existing = project.article.photos.find(item => item.id === result.id);
        if (existing) {
          if (result.caption.value && !existing.caption.value.includes(result.caption.value)) {
            existing.caption = field([existing.caption.value, result.caption.value].filter(Boolean).join('\n\n'), 'viewer.caption');
          }
        } else project.article.photos.push(result);
        if (project.article.photos.length > 1000) throw new Error('Archello 图片超过上限');
      }
    }
    if (project.media.some(photo => !allMedia.has(photo.url))) throw new Error('Archello 正文照片未包含在完整相册中');
    guard();
    project.article.expected_photo_count = project.article.photos.length;
    return project.article;
  } finally {
    clearTimeout(deadline);
    activeCapture = null;
  }
}

export { extractArchelloProject, extractArchelloGallery, extractArchelloPhoto, originalImageUrl, captureArchelloArticle, cancelArchelloCapture };
