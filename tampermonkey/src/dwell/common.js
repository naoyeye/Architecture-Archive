function readDwellState(page = document) {
  for (const script of page.scripts || page.querySelectorAll('script')) {
    const match = script.textContent.match(/^\s*window\.INITIAL_STATE\s*=\s*/);
    if (!match) continue;
    try {
      return JSON.parse(script.textContent.slice(match[0].length).replace(/;\s*$/, ''));
    } catch (_) { continue; }
  }
  return {};
}

function dwellOriginalUrl(raw) {
  try {
    let parsed = new URL(raw, 'https://www.dwell.com');
    if (parsed.hostname === 'go.skimresources.com') parsed = new URL(parsed.searchParams.get('url'));
    if (parsed.protocol !== 'https:' || !['images.dwell.com', 'images2.dwell.com'].includes(parsed.host)
      || !/^\/photos\/\d+\/\d+\/original\.(jpg|jpeg|png|webp|avif)$/.test(parsed.pathname)) return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch (_) { return null; }
}

function dwellText(value, source, format = 'text') {
  if (value !== null && typeof value !== 'string') return { status: 'missing', value: '', format, source };
  const text = value || '';
  return { status: text.trim() ? 'present' : 'empty', value: text, format, source };
}

function dwellAttribute(record, key, source) {
  return dwellText(Object.prototype.hasOwnProperty.call(record || {}, key) ? record[key] : undefined, source);
}

function preferredDwellText(...values) {
  return values.find(value => value.status === 'present')
    || values.find(value => value.status === 'empty') || values[0];
}

function dwellContentNode(node) {
  if (!node) return null;
  const clone = node.cloneNode(true);
  for (const child of clone.querySelectorAll('script, style, button, select, input, textarea, svg, iframe, img, nav, footer')) child.remove();
  for (const child of [clone, ...clone.querySelectorAll('*')]) {
    for (const attribute of [...child.attributes]) {
      if (!['href', 'title'].includes(attribute.name)) child.removeAttribute(attribute.name);
    }
    if (child.hasAttribute('href')) {
      try {
        const href = new URL(child.getAttribute('href'), 'https://www.dwell.com');
        if (!['https:', 'http:'].includes(href.protocol)) child.removeAttribute('href');
        else child.setAttribute('href', href.href);
      } catch (_) { child.removeAttribute('href'); }
    }
  }
  return clone;
}

function dwellSection(root, name) {
  const heading = [...root.querySelectorAll('h2, h3, h4')].find(node =>
    !node.closest('nav, footer, #archive-scraper') && (name === 'Description'
      ? /^(From\s+.+|Description|About this home)$/i.test(node.textContent.trim())
      : node.textContent.trim().toLowerCase() === name.toLowerCase()));
  if (!heading) return null;
  const container = heading.closest('section') || heading.parentElement;
  const clone = container.cloneNode(true);
  const copiedHeading = [...clone.querySelectorAll('h2, h3, h4')].find(node => node.textContent === heading.textContent);
  copiedHeading?.remove();
  return dwellContentNode(clone);
}

function dwellRows(container) {
  if (!container) return [];
  const rows = [];
  const add = (label, value) => {
    const cleanLabel = label?.textContent.trim();
    const cleanValue = dwellContentNode(value)?.textContent.trim();
    if (label?.closest('nav, footer, aside, #archive-scraper')) return;
    if (cleanLabel && cleanValue) rows.push({ label: cleanLabel, value: cleanValue });
  };
  for (const term of container.querySelectorAll('dt')) {
    if (term.nextElementSibling?.tagName === 'DD') add(term, term.nextElementSibling);
  }
  for (const row of container.querySelectorAll('tr')) {
    const cells = row.querySelectorAll('th, td');
    if (cells.length === 2) add(cells[0], cells[1]);
  }
  for (const row of container.querySelectorAll('div, li')) {
    const label = row.firstElementChild;
    if (label && ['DIV', 'SPAN', 'LABEL'].includes(label.tagName) && !label.children.length
      && label.textContent.trim().length <= 64 && label.nextElementSibling) add(label, label.nextElementSibling);
  }
  return rows;
}

export { readDwellState, dwellOriginalUrl, dwellText, dwellAttribute, preferredDwellText, dwellContentNode, dwellSection, dwellRows };
