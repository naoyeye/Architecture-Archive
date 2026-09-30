import { readDwellState, dwellOriginalUrl, dwellText, dwellAttribute, preferredDwellText, dwellContentNode, dwellSection, dwellRows } from './common.js';

function findDwellProject(state, url) {
  const slug = new URL(url).pathname.split('/')[2];
  const record = Object.values(state.slugs?.items || {}).find(item =>
    item.attributes?.slug === slug && item.attributes?.sluggableType === 'collections');
  const collectionId = record?.attributes?.sluggableId;
  const collection = state.collections?.items?.[collectionId];
  return collection ? { collectionId: String(collectionId), collection } : null;
}

function extractDwellHome(page, url) {
  const canonical = new URL(url);
  if (canonical.origin !== 'https://www.dwell.com' || !/^\/home\/[^/]+\/?$/.test(canonical.pathname)) {
    throw new Error('仅支持 Dwell home 项目页面');
  }
  const projectPath = canonical.pathname.replace(/\/$/, '');
  const state = readDwellState(page);
  const project = findDwellProject(state, url);
  const attributes = project?.collection.attributes || {};
  const relationships = project?.collection.relationships || {};
  const heading = [...page.querySelectorAll('h1')].find(node => !node.closest('nav, footer, #archive-scraper'));
  const root = heading?.closest('main, article') || page.body;
  const title = attributes.title || heading?.textContent.trim() || '';
  const issues = [];
  const warnings = project ? [] : ['当前项目结构化数据不可用，正在使用语义 DOM 兜底。'];
  let body = dwellAttribute(attributes, 'description', 'state.collection.description');
  const description = dwellSection(root, 'Description');
  if (description) {
    const domBody = dwellText(description.textContent.trim() ? description.innerHTML : '', 'dom.description', 'html');
    if (body.status === 'missing' || (domBody.status === 'present' && description.textContent.trim().length > body.value.trim().length)) body = domBody;
  }
  const sections = new Map(['Project information', 'Credits', 'Details', 'Tags'].map(name => [name, new Map()]));
  const addRow = (section, label, value, fallback = false) => {
    if (typeof label !== 'string' || !label.trim() || !['string', 'number'].includes(typeof value)) return false;
    const rows = sections.get(section);
    const text = String(value).trim();
    if (!text) return false;
    const existing = rows.get(label);
    if (!existing) rows.set(label, text);
    else if (!fallback && !existing.split('; ').includes(text)) rows.set(label, `${existing}; ${text}`);
    return true;
  };
  for (const reference of relationships.metadata?.data || []) {
    const metadata = state.metadata?.items?.[reference.id]?.attributes;
    if (!metadata) { issues.push(`metadata ${reference.id} 未加载`); continue; }
    const label = { address: 'Location', location: 'Location', year: 'Year', type: 'Style', style: 'Style', structure: 'Structure' }[metadata.name];
    const value = label === 'Location' ? metadata.title : metadata.value;
    if (!addRow(label ? 'Project information' : 'Details', label || metadata.title || metadata.name, value)) {
      issues.push(`项目字段 ${metadata.name || reference.id} 无法解析`);
    }
  }
  const poster = state.profiles?.items?.[attributes.userId]?.attributes?.displayName;
  if (poster) addRow('Credits', 'Posted by', poster);
  for (const reference of relationships.contributors?.data || []) {
    const credit = state.contributors?.items?.[reference.id]?.attributes;
    if (!credit || (credit.contributableId && String(credit.contributableId) !== project.collectionId)) {
      issues.push(`credit ${reference.id} 未加载或不属于当前项目`); continue;
    }
    const name = credit.contributorAlt || state.profiles?.items?.[credit.contributorId]?.attributes?.displayName;
    if (!addRow('Credits', credit.type, name)) issues.push(`credit ${reference.id} 的名称无法解析`);
  }
  for (const reference of relationships.tags?.data || []) {
    const tag = state.tags?.items?.[reference.id]?.attributes;
    if (!addRow('Tags', 'Tags', tag?.name || tag?.title)) issues.push(`tag ${reference.id} 未加载`);
  }
  for (const row of dwellRows(root)) {
    if (['Location', 'Year', 'Style', 'Structure'].includes(row.label)) addRow('Project information', row.label, row.value, true);
  }
  for (const sectionName of ['Credits', 'Details', 'Tags']) {
    const container = dwellSection(root, sectionName);
    if (!container) continue;
    const rows = dwellRows(container);
    if (sectionName === 'Tags' && !rows.length && container.textContent.trim()) {
      rows.push({ label: 'Tags', value: [...container.querySelectorAll('a')].map(node => node.textContent.trim()).filter(Boolean).join('; ') || container.textContent.trim() });
    }
    for (const row of rows) addRow(sectionName, row.label, row.value, true);
    if (!sections.get(sectionName).size && container.textContent.trim()) issues.push(`${sectionName} 存在但无法确认字段关系`);
  }
  let expected = Number(relationships.items?.meta?.count || 0);
  const relationPhotos = new Map((relationships.items?.data || []).filter(item => item.type === 'photos').map(item => [String(item.id), item]));
  const queries = [];
  for (const [key, query] of Object.entries(state.collections?.relationQueries || {})) {
    try {
      const filter = JSON.parse(key);
      if (project && String(filter.id) === project.collectionId && !query.error && !query.inProgress) queries.push({ offset: Number(filter['page[offset]'] || 0), query });
    } catch (_) { continue; }
  }
  const ids = queries.sort((first, second) => first.offset - second.offset).flatMap(({ query }) => {
    expected = Math.max(expected, Number(query.meta?.count || 0));
    return (query.items || []).filter(key => typeof key === 'string' && key.startsWith('photos-')).map(key => key.slice(7));
  });
  ids.push(...relationPhotos.keys());
  const photos = new Map();
  for (const id of new Set(ids)) {
    const photo = state.photos?.items?.[id];
    const caption = preferredDwellText(
      dwellAttribute(relationPhotos.get(id)?.meta, 'description', 'state.relation.description'),
      dwellAttribute(photo?.attributes, 'description', 'state.photo.description'),
    );
    photos.set(id, { id, url: dwellOriginalUrl(photo?.links?.original) || '', caption });
  }
  const isProjectPhoto = link => {
    try {
      const target = new URL(link.getAttribute('href'), canonical.origin);
      return target.origin === canonical.origin && target.pathname.startsWith(`${projectPath}/`)
        && /^\d+\/?$/.test(target.pathname.slice(projectPath.length + 1));
    } catch (_) { return false; }
  };
  const projectLinks = [...root.querySelectorAll('a[href]')].filter(isProjectPhoto);
  const gallery = [...page.querySelectorAll('[role="dialog"], dialog')].find(node =>
    [...node.querySelectorAll('a[href]')].some(isProjectPhoto));
  for (const image of page.querySelectorAll('img[data-photo-id]')) {
    const id = image.getAttribute('data-photo-id');
    const link = image.closest('a[href]');
    if (link) {
      if (!isProjectPhoto(link)) continue;
      if (new URL(link.getAttribute('href'), canonical.origin).pathname.replace(/\/$/, '').split('/').pop() !== id) {
        issues.push(`照片 ${id} 与项目链接不一致`); continue;
      }
    } else if (!photos.has(id) && !(gallery?.contains(image))) continue;
    const original = dwellOriginalUrl(image.getAttribute('src'));
    if (!original) {
      if (!photos.get(id)?.url) issues.push(`照片 ${id} 缺少原图地址`);
      continue;
    }
    if (new URL(original).pathname.split('/')[3] !== id) { issues.push(`照片 ${id} 缺少匹配的原图地址`); continue; }
    let caption = dwellText(undefined, 'dom.caption');
    const figure = image.closest('figure');
    const captionNode = figure && figure.querySelectorAll('img').length === 1 ? figure.querySelector('figcaption') : null;
    if (captionNode) caption = dwellText(captionNode.textContent.trim(), 'dom.figcaption');
    const describedBy = image.getAttribute('aria-describedby')?.split(/\s+/).map(key => page.getElementById(key));
    if (describedBy?.length && describedBy.every(Boolean)) caption = dwellText(describedBy.map(node => node.textContent.trim()).join('\n\n'), 'dom.aria-describedby');
    const existing = photos.get(id);
    photos.set(id, { id, url: existing?.url || original, caption: existing ? preferredDwellText(existing.caption, caption) : caption });
  }
  const controls = [...root.querySelectorAll('button, a, [role="button"]')].filter(node => !node.closest('nav, footer, aside, #archive-scraper'));
  for (const control of controls) {
    const match = (control.getAttribute('aria-label') || control.textContent).trim().match(/^View\s+([\d,]+)\s+Photos$/i);
    if (match) expected = Math.max(expected, Number(match[1].replaceAll(',', '')));
  }
  if (!project && !projectLinks.length) issues.push('无法确认照片与当前项目的关联');
  return {
    schema_version: 1, source: 'dwell', url: `${canonical.origin}${projectPath}`,
    title, building: title, studio: sections.get('Credits').get('Architect') || '', body,
    sections: [...sections].filter(([, rows]) => rows.size).map(([name, rows]) => ({ title: name, rows: [...rows].map(([label, value]) => ({ label, value })) })),
    expected_photo_count: expected, photos: [...photos.values()], warnings, issues,
  };
}

function validateDwellCapture(article) {
  const issues = [...article.issues];
  if (!article.title) issues.push('项目标题无法确认');
  if (article.body.status === 'missing') issues.push('正文无法定位（不能判断为正文为空）');
  if (!Number.isInteger(article.expected_photo_count) || article.expected_photo_count <= 0) issues.push('无法确认相册总数');
  if (article.photos.length !== article.expected_photo_count) issues.push(`相册未完整加载 (${article.photos.length}/${article.expected_photo_count})`);
  for (const photo of article.photos) {
    if (!photo.url) issues.push(`照片 ${photo.id} 原图未加载`);
    if (photo.caption.status === 'missing') issues.push(`照片 ${photo.id} 描述未确认（不能判断为无描述）`);
  }
  if (issues.length) throw new Error(`Dwell 抓取未完成：${issues.slice(0, 6).join('；')}。请确认登录和完整内容已加载后重试。`);
  return article;
}

export { findDwellProject, extractDwellHome, validateDwellCapture };
