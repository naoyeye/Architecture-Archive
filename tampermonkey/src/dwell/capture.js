import { readDwellState, dwellOriginalUrl, dwellAttribute, preferredDwellText } from './common.js';
import { findDwellProject, extractDwellHome, validateDwellCapture } from './home.js';
import { extractDwellStory } from './story.js';

let captureCancelled = false;
let captureAbortController = null;
let captureContext = {};

function configureDwellCapture(context) {
  captureContext = context;
}

function cancelDwellCapture() {
  captureCancelled = true;
  captureAbortController?.abort();
}

function extractDwellArticle(page, url) {
  return new URL(url).pathname.startsWith('/article/') ? extractDwellStory(page, url) : extractDwellHome(page, url);
}

function dwellLoadMoreButton(page, url) {
  const project = new URL(url);
  const projectPath = project.pathname.replace(/\/$/, '');
  return [...page.querySelectorAll('button, [role="button"]')].find(button => {
    if (button.closest('nav, footer, aside, #archive-scraper, [hidden]') || button.disabled
      || button.getAttribute('aria-disabled') === 'true'
      || !/^View More$/i.test((button.getAttribute('aria-label') || button.textContent).trim())) return false;
    const section = button.closest('section');
    for (let container = section || button.parentElement; container && container !== page.body; container = section ? null : container.parentElement) {
      if ([...container.querySelectorAll('a[href]')].some(link => {
        if (!link.querySelector('img[data-photo-id]')) return false;
        try {
          const target = new URL(link.getAttribute('href'), project.origin);
          return target.origin === project.origin && target.pathname.startsWith(`${projectPath}/`)
            && /^\d+\/?$/.test(target.pathname.slice(projectPath.length + 1));
        } catch (_) { return false; }
      })) return true;
    }
    return false;
  });
}

async function fetchDwellPhotoDetails(url, photo, signal) {
  const projectUrl = new URL(url);
  if (projectUrl.origin !== 'https://www.dwell.com' || !/^\/home\/[^/]+\/?$/.test(projectUrl.pathname)
    || !/^\d+$/.test(photo.id)) throw new Error('无法确认照片所属项目');
  const target = `${projectUrl.origin}${projectUrl.pathname.replace(/\/$/, '')}/${photo.id}`;
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  signal.addEventListener('abort', abortRequest, { once: true });
  const timeout = setTimeout(abortRequest, 20000);
  try {
    if (signal.aborted) throw new Error('已取消页面收集');
    const response = await fetch(target, { credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const responseUrl = new URL(response.url);
    if (responseUrl.origin !== projectUrl.origin || responseUrl.pathname.replace(/\/$/, '') !== new URL(target).pathname) {
      throw new Error('返回的不是请求的照片页面');
    }
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const state = readDwellState(page);
    const project = findDwellProject(state, url);
    if (!project) throw new Error('照片页面缺少当前项目的数据');
    const details = state.photos?.items?.[photo.id];
    const original = dwellOriginalUrl(details?.links?.original);
    if (!original || new URL(original).pathname.split('/')[3] !== photo.id
      || (photo.url && new URL(original).pathname !== new URL(photo.url).pathname)) {
      throw new Error('照片 ID 或原图地址不匹配');
    }
    const relation = project.collection.relationships?.items?.data?.find(item => item.type === 'photos' && String(item.id) === photo.id);
    const caption = preferredDwellText(
      dwellAttribute(relation?.meta, 'description', 'state.relation.description'),
      dwellAttribute(details?.attributes, 'description', 'state.photo.description'),
    );
    if (caption.status === 'missing') throw new Error('照片详情仍未提供描述字段');
    return { ...photo, url: photo.url || original, caption: preferredDwellText(photo.caption, caption) };
  } catch (error) {
    if (signal.aborted) throw new Error('已取消页面收集');
    throw new Error(`照片 ${photo.id} 描述补齐失败：${controller.signal.aborted ? '请求超时' : error.message}`);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abortRequest);
  }
}

async function captureDwellArticle(url) {
  captureCancelled = false;
  captureAbortController = new AbortController();
  const signal = captureAbortController.signal;
  if (new URL(url).pathname.startsWith('/article/')) {
    try {
      const { issues, ...payload } = validateDwellCapture(extractDwellArticle(document, url));
      return payload;
    } finally {
      captureAbortController = null;
    }
  }
  let article = extractDwellArticle(document, url);
  const knownPhotos = new Map(article.photos.map(photo => [photo.id, photo]));
  const needsPhotos = () => article.expected_photo_count > knownPhotos.size;
  const scrollPosition = window.scrollY;
  let stalled = 0;
  let previousUrl = location.href;
  let requestedPhotoCount = -1;
  const ensureCurrentProject = () => {
    if (captureCancelled || signal.aborted) throw new Error('已取消页面收集');
    if (captureContext.currentArticleUrl() !== url) throw new Error('收集过程中已切换到其他项目，请重新抓取');
  };
  try {
    ensureCurrentProject();
    for (let attempt = 0; needsPhotos() && attempt < 120 && stalled < 20; attempt += 1) {
      ensureCurrentProject();
      const before = knownPhotos.size;
      const more = dwellLoadMoreButton(document, url);
      if (more && requestedPhotoCount !== before) {
        more.click();
        requestedPhotoCount = before;
      } else if (!more) {
        const dialog = [...document.querySelectorAll('[role="dialog"], dialog')].find(node =>
          [...node.querySelectorAll('a[href]')].some(link => link.getAttribute('href')?.startsWith(new URL(url).pathname + '/')));
        for (const target of dialog ? [dialog, ...dialog.querySelectorAll('*')] : [document.scrollingElement]) {
          if (target && target.clientHeight > 0 && target.scrollHeight > target.clientHeight) target.scrollTop += target.clientHeight;
        }
        const next = dialog?.querySelector('[aria-label="Next"]')?.closest('a, button');
        if (next && stalled > 0) next.click();
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      ensureCurrentProject();
      article = extractDwellArticle(document, url);
      for (const photo of article.photos) {
        const existing = knownPhotos.get(photo.id);
        knownPhotos.set(photo.id, existing ? { ...photo, url: photo.url || existing.url, caption: preferredDwellText(photo.caption, existing.caption) } : photo);
      }
      stalled = knownPhotos.size === before && location.href === previousUrl ? stalled + 1 : 0;
      previousUrl = location.href;
      captureContext.renderStages([{ key: 'capture', label: '收集 Dwell 相册', state: 'running', current: knownPhotos.size, total: article.expected_photo_count }]);
    }
    article.photos = [...knownPhotos.values()];
    if (article.photos.length !== article.expected_photo_count) validateDwellCapture(article);
    const pending = article.photos.filter(photo => !photo.url || photo.caption.status === 'missing');
    for (const [index, photo] of pending.entries()) {
      ensureCurrentProject();
      captureContext.renderStages([{ key: 'capture', label: '补齐 Dwell 图片描述', state: 'running', current: index, total: pending.length }]);
      const resolved = await fetchDwellPhotoDetails(url, photo, signal);
      ensureCurrentProject();
      knownPhotos.set(photo.id, resolved);
    }
    ensureCurrentProject();
    article.photos = [...knownPhotos.values()];
    validateDwellCapture(article);
    const { issues, ...payload } = article;
    return payload;
  } finally {
    captureAbortController = null;
    window.scrollTo(0, scrollPosition);
  }
}

export { captureDwellArticle, configureDwellCapture, cancelDwellCapture, extractDwellArticle, dwellLoadMoreButton, fetchDwellPhotoDetails };
