import { readDwellState, dwellOriginalUrl, dwellText, dwellAttribute, preferredDwellText, dwellContentNode } from "./common.js";

function extractDwellStory(page, url) {
  const canonical = new URL(url);
  if (canonical.origin !== "https://www.dwell.com" || !/^\/article\/[^/]+\/?$/.test(canonical.pathname)) {
    throw new Error("仅支持 Dwell article 文章页面");
  }
  const state = readDwellState(page);
  const slug = canonical.pathname.split("/")[2];
  const reference = Object.values(state.slugs?.items || {}).find(item =>
    item.attributes?.slug === slug && item.attributes?.sluggableType === "stories");
  const storyId = reference?.attributes?.sluggableId;
  const story = state.articles?.items?.[storyId];
  if (!story || story.type !== "stories") throw new Error("无法确认当前 article 的 stories 数据，请确认登录和正文已加载");
  const attributes = story.attributes || {};
  const issues = [];
  const content = page.createElement("div");
  const inlinePhotos = [];
  const rawBody = typeof attributes.body === "string" ? attributes.body : "";
  const bodyHtml = rawBody.replace(/<dwell-photo\b([\s\S]*?)(?:\/>|>\s*<\/dwell-photo>)/gi, (tag, fields) => {
    const id = fields.match(/\bphotoId="(\d+)"/i)?.[1];
    const caption = fields.match(/\bcaption="([\s\S]*?)"(?=\s+(?:layout|credit|photoUserId)="|\s*$)/i)?.[1];
    if (!id || (/\bcaption=/.test(fields) && caption === undefined)) issues.push("文章图片标记无法完整解析");
    inlinePhotos.push({ id, caption });
    return "";
  });
  if (/<dwell-photo\b/i.test(bodyHtml)) issues.push("文章包含未解析的图片标记");
  content.innerHTML = bodyHtml;
  const photos = new Map();
  const references = story.relationships?.photos?.data;
  if (!Array.isArray(references)) issues.push("文章照片关系未加载，无法确认完整性");
  const addPhoto = (rawId, caption) => {
    const id = String(rawId);
    const photo = state.photos?.items?.[id];
    const original = dwellOriginalUrl(photo?.links?.original);
    if (!/^\d+$/.test(id) || !original || new URL(original).pathname.split("/")[3] !== id) {
      issues.push(`文章照片 ${id} 缺少匹配的原图`);
    }
    const selected = preferredDwellText(caption || dwellText(undefined, "state.story.caption"),
      dwellAttribute(photo?.attributes, "description", "state.photo.description"));
    const existing = photos.get(id);
    photos.set(id, { id, url: original || "", caption: existing ? preferredDwellText(selected, existing.caption) : selected });
  };
  const cover = story.relationships?.defaultImage?.data?.id || attributes.defaultImageId;
  if (cover) addPhoto(cover);
  for (const photo of inlinePhotos) {
    let caption = dwellText(undefined, "state.story.caption");
    if (photo.caption !== undefined) {
      const decoder = page.createElement("div");
      decoder.innerHTML = `<span data-caption="${photo.caption.replaceAll('"', '&quot;')}"></span>`;
      const raw = decoder.firstElementChild.getAttribute("data-caption");
      const container = page.createElement("div");
      container.innerHTML = raw;
      const clean = dwellContentNode(container);
      const text = clean.textContent.trim();
      caption = dwellText(!text || text === "Add a caption" ? "" : clean.innerHTML, "state.story.caption", "html");
    }
    addPhoto(photo.id, caption);
  }
  for (const reference of references || []) {
    if (reference.type !== "photos") { issues.push("文章包含无法识别的照片关系"); continue; }
    if (!photos.has(String(reference.id))) addPhoto(reference.id);
  }
  const credits = [];
  for (const reference of story.relationships?.contributors?.data || []) {
    const credit = state.contributors?.items?.[reference.id]?.attributes;
    const name = credit?.contributorAlt || state.profiles?.items?.[credit?.contributorId]?.attributes?.displayName;
    if (!credit || String(credit.contributableId) !== String(storyId) || !name || !credit.type) {
      issues.push(`文章 credit ${reference.id} 未加载或不属于当前文章`);
    } else credits.push({ label: credit.type, value: name });
  }
  const creditHeading = [...content.querySelectorAll("p")].find(node => /^Project Credits:?$/i.test(node.textContent.trim()));
  if (creditHeading) {
    let extracted = false;
    let row = creditHeading.nextElementSibling;
    while (row?.tagName === "P") {
      const match = row.textContent.trim().match(/^([^:]+):\s*(.+)$/s);
      if (!match) break;
      credits.push({ label: match[1], value: match[2] });
      extracted = true;
      const next = row.nextElementSibling;
      row.remove();
      row = next;
    }
    if (extracted) creditHeading.remove();
  }
  const information = [];
  for (const reference of story.relationships?.metadata?.data || []) {
    const metadata = state.metadata?.items?.[reference.id]?.attributes;
    if (!metadata) { issues.push(`文章 metadata ${reference.id} 未加载`); continue; }
    const label = { address: "Location", location: "Location", year: "Year", style: "Style", structure: "Structure" }[metadata.name];
    const value = label === "Location" ? metadata.title : metadata.value;
    if (label && ["string", "number"].includes(typeof value)) information.push({ label, value: String(value) });
  }
  const clean = dwellContentNode(content);
  let body = dwellAttribute(attributes, "body", "state.story.body");
  if (body.status !== "missing") {
    body = dwellText(clean.textContent.trim() ? clean.innerHTML : "", "state.story.body", "html");
    if (attributes.lead) {
      const lead = page.createElement("p");
      lead.textContent = attributes.lead;
      body = dwellText(lead.outerHTML + body.value, "state.story.body", "html");
    }
  }
  const sections = [];
  if (information.length) sections.push({ title: "Project information", rows: information });
  if (credits.length) sections.push({ title: "Credits", rows: credits });
  const title = typeof attributes.title === "string" ? attributes.title : "";
  return {
    schema_version: 1, source: "dwell", url: canonical.origin + canonical.pathname.replace(/\/$/, ""),
    title, building: title, studio: "", body, sections,
    expected_photo_count: photos.size, photos: [...photos.values()], warnings: [], issues,
  };
}

export { extractDwellStory };
