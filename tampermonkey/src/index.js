import widgetCss from './widget.css';
import { captureArchdailyArticle, cancelArchdailyCapture } from './archdaily/capture.js';
import { captureArchelloArticle, cancelArchelloCapture } from './archello/capture.js';
import { captureDwellArticle, configureDwellCapture, cancelDwellCapture } from './dwell/capture.js';

const SERVER = 'http://127.0.0.1:8765';
const isDwell = location.hostname === 'www.dwell.com';
const isArchello = location.hostname === 'archello.com';
const isArchdaily = location.hostname === 'www.archdaily.com';
document.documentElement.dataset.archiveSite = isDwell ? 'dwell' : isArchello ? 'archello' : isArchdaily ? 'archdaily' : 'dezeen';

const style = document.createElement('style');
style.textContent = widgetCss;

// -------------------- DOM --------------------
function buildWidget() {
  const root = document.createElement('div');
  root.id = 'archive-scraper';
  root.innerHTML = `
    <div id="archive-scraper-panel" role="dialog" aria-label="Architecture Archive">
      <h4>抓取并翻译<span class="archive-close" title="关闭">×</span></h4>
      <ol id="archive-scraper-stages"></ol>
      <label id="archive-options"><input id="archive-full-translate" type="checkbox" checked /> 一次性翻译全文</label>
      <button id="archive-run-btn" type="button">抓取</button>
      <button id="archive-log-toggle" type="button">展开日志</button>
      <button id="archive-cancel-btn" type="button">终止请求</button>
      <div id="archive-log-wrap"></div>
      <div class="archive-footer" id="archive-scraper-footer"></div>
    </div>
    <button id="archive-scraper-btn" type="button" title="打开抓取窗口">Boom!</button>
  `;
  document.body.appendChild(root);

  const btn = root.querySelector('#archive-scraper-btn');
  const panel = root.querySelector('#archive-scraper-panel');
  const close = root.querySelector('.archive-close');
  const runBtn = root.querySelector('#archive-run-btn');
  const logToggle = root.querySelector('#archive-log-toggle');
  const logWrap = root.querySelector('#archive-log-wrap');
  const cancelBtn = root.querySelector('#archive-cancel-btn');

  btn.addEventListener('click', () => {
    panel.classList.toggle('open');
  });
  runBtn.addEventListener('click', () => startJob());
  close.addEventListener('click', () => panel.classList.remove('open'));
  logToggle.addEventListener('click', () => {
    const opened = logWrap.classList.toggle('open');
    logToggle.textContent = opened ? '收起日志' : '展开日志';
    if (opened) logWrap.scrollTop = logWrap.scrollHeight;
  });
  cancelBtn.addEventListener('click', () => cancelCurrentJob());
  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('open')) return;
    if (!root.contains(e.target)) panel.classList.remove('open');
  });
  return { btn, panel };
}

function markScraped(dir) {
  const runBtn = document.getElementById('archive-run-btn');
  if (!runBtn) return;
  runBtn.textContent = '已抓取';
  runBtn.disabled = true;
  if (dir) runBtn.title = `已抓取\n${dir}`;
}

function currentArticleUrl() {
  if (isArchdaily) return `${location.origin}${location.pathname.replace(/\/$/, '')}`;
  return isDwell || isArchello ? `${location.origin}/${location.pathname.split('/')[1]}/${location.pathname.split('/')[2]}` : location.href;
}

function checkScraped() {
  const url = currentArticleUrl();
  GM_xmlhttpRequest({
    method: 'GET',
    url: `${SERVER}/scraped?url=${encodeURIComponent(url)}`,
    timeout: 5000,
    onload: (resp) => {
      let body = {};
      try { body = JSON.parse(resp.responseText || '{}'); } catch (_) {}
      if (body.scraped) markScraped(body.dir);
    },
    onerror: () => { /* server offline -- leave button as-is */ },
    ontimeout: () => { /* same */ },
  });
}

function appendDisqusIframeLink() {
  const thread = document.querySelector('#disqus_thread');
  if (!thread || thread.querySelector('#archive-disqus-iframe-link')) return false;

  const iframe = thread.querySelector('iframe[title="Disqus"]');
  const src = iframe?.getAttribute('src');
  if (!src) return false;

  const link = document.createElement('a');
  link.id = 'archive-disqus-iframe-link';
  link.href = src;
  link.textContent = '单独查看讨论区';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  thread.prepend(link);
  return true;
}

function watchDisqusIframe() {
  if (appendDisqusIframeLink()) return;

  const observer = new MutationObserver(() => {
    if (appendDisqusIframeLink()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

// -------------------- rendering --------------------
function renderStages(stages, footerHtml, logs) {
  const ol = document.getElementById('archive-scraper-stages');
  if (!ol) return;
  ol.innerHTML = stages.map(s => {
    let label = s.label;
    if (typeof s.total === 'number' && s.total > 0) {
      const cur = s.current || 0;
      label += ` (${cur}/${s.total})`;
    }
    const detail = s.detail
      ? `<div class="archive-detail">${escapeHtml(s.detail)}</div>`
      : '';
    return `
      <li class="${s.state}">
        <span class="archive-icon"></span>
        <span>${escapeHtml(label)}</span>
      </li>
      ${detail}
    `;
  }).join('');

  const footer = document.getElementById('archive-scraper-footer');
  if (footer) footer.innerHTML = footerHtml || '';
  const logWrap = document.getElementById('archive-log-wrap');
  if (logWrap) {
    const lines = Array.isArray(logs) ? logs : [];
    logWrap.textContent = lines.length ? lines.join('\n') : '暂无日志';
    if (logWrap.classList.contains('open')) {
      logWrap.scrollTop = logWrap.scrollHeight;
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// -------------------- job lifecycle --------------------
let polling = null;
let currentJobId = null;

async function startJob() {
  if (currentJobId) return; // already running
  const runBtn = document.getElementById('archive-run-btn');
  const fullTranslate = !!document.getElementById('archive-full-translate')?.checked;
  runBtn.disabled = true;
  setCancelVisible(true);

  const url = currentArticleUrl();
  let pageData;
  try {
    renderStages([{ key: 'capture', label: '收集页面内容', state: 'running' }]);
    if (isArchello || isArchdaily) {
      const capture = isArchdaily ? captureArchdailyArticle : captureArchelloArticle;
      pageData = { article: await capture(url, {
        progress: detail => renderStages([{ key: 'capture', label: '收集页面内容', state: 'running', detail }]),
      }) };
    } else {
      pageData = isDwell ? { article: await captureDwellArticle(url) } : { html: document.documentElement.outerHTML };
    }
  } catch (error) {
    fail(error.message);
    return;
  }

  renderStages([
    { key: 'upload', label: '上传页面', state: 'running' },
  ], '', ['等待上传页面...']);

  GM_xmlhttpRequest({
    method: 'POST',
    url: `${SERVER}/jobs`,
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ url, ...pageData, full_translate: fullTranslate }),
    timeout: 30000,
    onload: (resp) => {
      let body = {};
      try { body = JSON.parse(resp.responseText || '{}'); } catch (_) {}
      if (resp.status >= 400 || !body.job_id) {
        renderStages([{
          key: 'upload',
          label: '上传页面',
          state: 'error',
          detail: body.error || `HTTP ${resp.status}`,
        }], '', [`上传失败: ${body.error || `HTTP ${resp.status}`}`]);
        runBtn.disabled = false;
        setCancelVisible(false);
        return;
      }
      currentJobId = body.job_id;
      pollJob();
    },
    onerror: () => fail('无法连接本地服务，请确认 server/app.py 已启动'),
    ontimeout: () => fail('请求超时'),
  });
}

function fail(msg) {
  renderStages([{ key: 'upload', label: '上传页面', state: 'error', detail: msg }], '', [msg]);
  document.getElementById('archive-run-btn').disabled = false;
  setCancelVisible(false);
  currentJobId = null;
}

function setCancelVisible(visible) {
  const el = document.getElementById('archive-cancel-btn');
  if (!el) return;
  if (visible) el.classList.add('visible');
  else el.classList.remove('visible');
  el.disabled = false;
  el.textContent = '终止请求';
}

function cancelCurrentJob() {
  if (!currentJobId) { cancelDwellCapture(); cancelArchelloCapture(); cancelArchdailyCapture(); return; }
  const btn = document.getElementById('archive-cancel-btn');
  btn.disabled = true;
  btn.textContent = '终止中...';
  GM_xmlhttpRequest({
    method: 'POST',
    url: `${SERVER}/jobs/${currentJobId}/cancel`,
    timeout: 10000,
    onload: () => {},
    onerror: () => {
      btn.disabled = false;
      btn.textContent = '终止请求';
    },
    ontimeout: () => {
      btn.disabled = false;
      btn.textContent = '终止请求';
    },
  });
}

function pollJob() {
  if (!currentJobId) return;
  const id = currentJobId;
  GM_xmlhttpRequest({
    method: 'GET',
    url: `${SERVER}/jobs/${id}`,
    timeout: 10000,
    onload: (resp) => {
      let body = {};
      try { body = JSON.parse(resp.responseText || '{}'); } catch (_) {}
      if (resp.status >= 400) {
        fail(body.error || `HTTP ${resp.status}`);
        return;
      }
      let footer = '';
      if (body.dir) {
        footer = `输出目录：<br><code>${escapeHtml(body.dir)}</code>`;
      }
      if (body.status === 'error' && body.error) {
        footer += `<br><span style="color:#b42318">${escapeHtml(body.error)}</span>`;
      }
      renderStages(body.stages || [], footer, body.logs || []);

      if (body.status === 'running' || body.status === 'cancelling') {
        polling = setTimeout(pollJob, 500);
      } else {
        currentJobId = null;
        const runBtn = document.getElementById('archive-run-btn');
        runBtn.disabled = false;
        runBtn.textContent = '抓取';
        runBtn.title = '抓取本文并翻译';
        setCancelVisible(false);
        if (body.status === 'done') markScraped(body.dir);
      }
    },
    onerror: () => {
      polling = setTimeout(pollJob, 1000);
    },
  });
}

// -------------------- bootstrap --------------------
document.documentElement.appendChild(style);

function init() {
  if (isArchdaily && !/^\/\d+\/[^/]+\/?$/.test(location.pathname)) return;
  if (!document.body) {
    requestAnimationFrame(init);
    return;
  }
  buildWidget();
  checkScraped();
  if (!isDwell && !isArchello && !isArchdaily) watchDisqusIframe();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

configureDwellCapture({ currentArticleUrl, renderStages });
