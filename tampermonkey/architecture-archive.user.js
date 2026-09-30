// ==UserScript==
// @name         Architecture Archive + Chinese Translation
// @namespace    ArchitectureArchive
// @version      2026-09-28.2
// @description  Archive Dezeen, Dwell, Archello and ArchDaily projects with images and Chinese translation
// @author       Jiyun
// @match        https://www.dezeen.com/*
// @match        https://dezeen.com/*
// @exclude      https://www.dezeen.com/
// @exclude      https://www.dezeen.com
// @exclude      https://dezeen.com/
// @exclude      https://dezeen.com
// @exclude      https://www.dwell.com/
// @exclude      https://www.dwell.com
// @exclude      https://dwell.com/
// @exclude      https://dwell.com
// @match        https://www.dwell.com/home/*
// @match        https://www.dwell.com/article/*
// @match        https://archello.com/project/*
// @match        https://www.archdaily.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-start
// @updateURL    http://127.0.0.1:8765/script.user.js
// @downloadURL  http://127.0.0.1:8765/script.user.js
// ==/UserScript==
(() => {
  // src/widget.css
  var widget_default = `html[data-archive-site="dezeen"] body {
  font-family: Helvetica, Arial, sans-serif;
  line-height: 1.5;
}
html[data-archive-site="dezeen"] .main-header {
  visibility: hidden !important;
  height: 0 !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
}
html[data-archive-site="dezeen"] .right-column {
  display: none !important;
}
html[data-archive-site="dezeen"] .header-scroll .carousel-wrap,
html[data-archive-site="dezeen"] .header-scroll.single .page-columns {
  padding-top: 0 !important;
}
html[data-archive-site="dezeen"] #preload-hero.hero-image {
  max-width: none !important;
}
@media (min-width: 768px) {
  html[data-archive-site="dezeen"] .main-article-body > p {
    max-width: none !important;
  }
  html[data-archive-site="dezeen"] .page-columns {
    max-width: 70vw;
    margin: 0 auto;
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ---- scraper widget ---- */
#archive-scraper {
  position: fixed;
  right: 16px;
  top: 40%;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  color: #111;
}
#archive-scraper :where(button) {
  all: unset;
  box-sizing: border-box;
  appearance: none;
  display: inline-block;
  font-family: inherit;
  font-weight: 600;
  line-height: 1;
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
#archive-scraper button:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 3px;
}
#archive-scraper-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #111;
  color: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  transition: transform .15s ease, background .15s ease;
}
#archive-scraper-btn:hover { transform: scale(1.05); background: #222; }
#archive-scraper-btn[disabled] { opacity: .65; cursor: progress; }

#archive-scraper-panel {
  display: none;
  position: absolute;
  right: 68px;
  top: 0;
  width: 320px;
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  padding: 14px 16px 12px;
  font-size: 13px;
}
#archive-scraper-panel.open { display: block; }
#archive-scraper-panel h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .5px;
  color: #111;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
#archive-scraper-panel .archive-close {
  cursor: pointer;
  color: #888;
  font-size: 16px;
  line-height: 1;
}
#archive-scraper-panel .archive-close:hover { color: #111; }
#archive-scraper-panel ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
#archive-scraper-panel li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  color: #555;
}
#archive-scraper-panel li.done    { color: #1a7f37; }
#archive-scraper-panel li.running { color: #111; font-weight: 600; }
#archive-scraper-panel li.error   { color: #b42318; font-weight: 600; }
#archive-scraper-panel .archive-icon {
  width: 14px; height: 14px;
  display: inline-block;
  flex: 0 0 14px;
  border-radius: 50%;
  background: #d0d7de;
  position: relative;
}
#archive-scraper-panel li.done .archive-icon {
  background: #1a7f37;
}
#archive-scraper-panel li.done .archive-icon::after {
  content: '';
  position: absolute;
  left: 4px; top: 1px;
  width: 4px; height: 8px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
#archive-scraper-panel li.error .archive-icon { background: #b42318; }
#archive-scraper-panel li.error .archive-icon::after {
  content: '!';
  color: #fff;
  position: absolute;
  left: 4px; top: -2px;
  font-size: 12px;
  font-weight: 700;
}
#archive-scraper-panel li.running .archive-icon {
  background: transparent;
  border: 2px solid #d0d7de;
  border-top-color: #111;
  animation: archive-spin .8s linear infinite;
}
@keyframes archive-spin { to { transform: rotate(360deg); } }

#archive-scraper-panel .archive-detail {
  font-size: 11px;
  color: #888;
  margin-left: 22px;
  margin-top: -2px;
  margin-bottom: 4px;
  word-break: break-all;
}
#archive-scraper-panel .archive-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
  font-size: 11px;
  color: #888;
  word-break: break-all;
}
#archive-scraper-panel .archive-footer a { color: #0969da; text-decoration: none; }
#archive-run-btn {
  margin-top: 8px;
  border: 1px solid #111;
  border-radius: 6px;
  background: #111;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  padding: 7px 10px;
  cursor: pointer;
}
#archive-run-btn:hover { background: #222; }
#archive-run-btn[disabled] { opacity: .6; cursor: not-allowed; }
#archive-options {
  margin-top: 8px;
  font-size: 12px;
  color: #444;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
#archive-log-toggle {
  margin-top: 8px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #f6f8fa;
  color: #24292f;
  font-size: 12px;
  line-height: 1;
  padding: 6px 8px;
  cursor: pointer;
}
#archive-log-toggle:hover { background: #eef1f4; }
#archive-log-wrap {
  display: none;
  margin-top: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #0b1020;
  color: #d1d5db;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  max-height: 220px;
  overflow: auto;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
#archive-log-wrap.open { display: block; }
#archive-cancel-btn {
  margin-top: 8px;
  margin-left: 8px;
  border: 1px solid #ef4444;
  border-radius: 6px;
  background: #fff5f5;
  color: #b42318;
  font-size: 12px;
  line-height: 1;
  padding: 6px 8px;
  cursor: pointer;
  display: none;
}
#archive-cancel-btn.visible { display: inline-block; }
#archive-cancel-btn[disabled] { opacity: .6; cursor: wait; }
`;

  // src/archdaily/capture.js
  var ORIGIN = "https://www.archdaily.com";
  var PROMOTIONAL = ".js-publift, #related-products, .js-loading-products-widget";
  var activeCapture = null;
  var text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
  var field = (value, source, format = "text") => ({ status: value.trim() ? "present" : "empty", value, format, source });
  function bodyIsLoading(page) {
    return [...page.querySelectorAll("#single-content #content-placeholder, #single-content picture.loader")].some((node) => !node.closest(PROMOTIONAL));
  }
  function archdailyProjectUrl(raw) {
    const parsed = new URL(raw);
    if (parsed.origin !== ORIGIN || parsed.username || parsed.password || !/^\/\d+\/[^/]+\/?$/.test(parsed.pathname)) {
      throw new Error("\u4EC5\u652F\u6301 ArchDaily \u9879\u76EE\u4E3B\u9875");
    }
    return `${ORIGIN}${parsed.pathname.replace(/\/$/, "")}`;
  }
  function archdailyImage(raw, id) {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/^\/media\/images\/((?:[a-f0-9]{4}\/){6})slideshow\/[^/%\\]+\.(?:jpe?g|png|webp|avif)$/i);
    if (parsed.origin !== "https://images.adsttc.com" || parsed.username || parsed.password || parsed.hash || parsed.search && !/^\?\d+$/.test(parsed.search) || !match || match[1].replaceAll("/", "") !== id) {
      throw new Error("ArchDaily \u5927\u56FE\u57DF\u540D\u3001\u8DEF\u5F84\u6216\u56FE\u7247 ID \u4E0D\u5339\u914D");
    }
    return parsed.href;
  }
  function photoLink(raw, url) {
    const parsed = new URL(raw, `${url}/`);
    const prefix = `${new URL(url).pathname}/`;
    const suffix = parsed.pathname.slice(prefix.length);
    if (parsed.origin !== ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash || !parsed.pathname.startsWith(prefix) || !/^[a-f0-9]{24}-[^/]+$/.test(suffix)) {
      throw new Error("ArchDaily \u56FE\u5E93\u5305\u542B\u975E\u5F53\u524D\u9879\u76EE\u56FE\u7247");
    }
    return { id: suffix.slice(0, 24), href: parsed.href };
  }
  function extractArchdailyProject(page, rawUrl) {
    const url = archdailyProjectUrl(rawUrl);
    const canonical = page.querySelector('link[rel="canonical"]')?.getAttribute("href");
    const article = page.querySelector("#single-content");
    if (!canonical || archdailyProjectUrl(canonical) !== url || !article || archdailyProjectUrl(article.getAttribute("data-io-article-url")) !== url) {
      throw new Error("ArchDaily \u5F53\u524D\u9879\u76EE\u4E0E canonical \u4E0D\u5339\u914D");
    }
    if (bodyIsLoading(page)) throw new Error("ArchDaily \u6B63\u6587\u5C1A\u672A\u5B8C\u6574\u52A0\u8F7D\uFF0C\u8BF7\u7B49\u5F85\u9875\u9762\u52A0\u8F7D\u5B8C\u6210");
    const title = text(page.querySelector("h1"));
    const bodyNodes = [...article.children].filter((node) => /^(P|H2|H3|H4|UL|OL|BLOCKQUOTE)$/.test(node.tagName) && !node.classList.contains("thumbs") && !node.closest(PROMOTIONAL));
    const body = bodyNodes.map((node) => {
      const clone = node.cloneNode(true);
      clone.querySelectorAll(`script, style, iframe, figure, img, button, .article-meta, .afd-specs, [id^="ads-"], ${PROMOTIONAL}`).forEach((child) => child.remove());
      clone.querySelectorAll("a[href]").forEach((link) => {
        const target = new URL(link.getAttribute("href"), url);
        if (["https:", "http:"].includes(target.protocol)) link.setAttribute("href", target.href);
        else link.removeAttribute("href");
      });
      return text(clone) ? clone.outerHTML : "";
    }).filter(Boolean).join("\n");
    if (!title || !body) throw new Error("ArchDaily \u6807\u9898\u6216\u6B63\u6587\u7F3A\u5931");
    const gallery = page.querySelector("#gallery-thumbs");
    const entries = [...gallery?.children || []].map((item) => {
      const link = item.querySelector("a[href]");
      const image = item.querySelector("img");
      if (!link || !image) throw new Error("ArchDaily \u56FE\u5E93\u5B58\u5728\u672A\u52A0\u8F7D\u6216\u4E0D\u652F\u6301\u7684\u5A92\u4F53");
      const identity = photoLink(link.getAttribute("href"), url);
      const large = item.hasAttribute("data-largesrc") ? item : item.querySelector("[data-largesrc]");
      const caption = item.querySelector("figcaption") || article.querySelector(`figcaption[id="${identity.id}"]`);
      return {
        ...identity,
        large: large?.getAttribute("data-largesrc"),
        caption: caption ? text(caption) : void 0,
        total: image.getAttribute("alt")?.match(/\bImage \d+ of (\d+)\b/)?.[1]
      };
    });
    if (!entries.length || entries.length > 1e3 || new Set(entries.map((entry) => entry.id)).size !== entries.length || entries.some((entry) => entry.total && Number(entry.total) !== entries.length)) {
      throw new Error("ArchDaily \u56FE\u5E93\u6570\u91CF\u4E0D\u5B8C\u6574\u6216\u5B58\u5728\u91CD\u590D\u56FE\u7247");
    }
    const sections = [];
    const details = [];
    const credits = [];
    const info = [];
    for (const item of article.querySelectorAll(".afd-specs__item")) {
      if (item.closest(PROMOTIONAL) || item.querySelector(".js-loading-products-widget") && !item.querySelector(".afd-specs__key, .afd-specs__value")) continue;
      const label = text(item.querySelector(".afd-specs__key")).replace(/\s*:\s*$/, "");
      const value = text(item.querySelector(".afd-specs__value"));
      if (!label || !value) throw new Error(`ArchDaily \u9879\u76EE\u4FE1\u606F\u672A\u5B8C\u6574\u52A0\u8F7D${label ? `\uFF1A${label}` : "\uFF1A\u5B57\u6BB5\u540D\u79F0\u7F3A\u5931"}`);
      const rows2 = /architect|photograph|design|engineer|client/i.test(label) ? credits : /area|year|country|city|location|category/i.test(label) ? info : details;
      rows2.push({ label, value });
    }
    const location2 = text(article.querySelector(".afd-specs__header-location"));
    if (location2) info.unshift({ label: "Location", value: location2 });
    for (const [name, rows2] of [["Project information", info], ["Credits", credits], ["Details", details]]) {
      if (rows2.length) sections.push({ title: name, rows: rows2 });
    }
    const tags = [...new Set([...article.parentElement.querySelectorAll(".afd-tags .afd-tags__btn")].map(text).filter(Boolean))];
    if (tags.length) sections.push({ title: "Tags", rows: [{ label: "Materials and Tags", value: tags.join(", ") }] });
    return { entries, payload: {
      schema_version: 1,
      source: "archdaily",
      url,
      title,
      building: title.split(" / ")[0],
      studio: credits.find((row) => row.label === "Architects")?.value || "",
      body: field(body, "dom.single-content", "html"),
      sections,
      expected_photo_count: entries.length,
      photos: [],
      warnings: []
    } };
  }
  function parseArchdailyGallery(page, url, entries) {
    const gallery = page.querySelector("#gallery-items[data-images]");
    if (!gallery || gallery.getAttribute("data-path") !== new URL(url).pathname || gallery.getAttribute("data-id") !== entries[0].id) {
      throw new Error("ArchDaily \u67E5\u770B\u5668\u4E0D\u5C5E\u4E8E\u5F53\u524D\u9879\u76EE\u6216\u56FE\u7247");
    }
    let records;
    try {
      records = JSON.parse(gallery.getAttribute("data-images"));
    } catch (_) {
      throw new Error("ArchDaily \u67E5\u770B\u5668\u6570\u636E\u65E0\u6548");
    }
    if (!Array.isArray(records) || records.length !== entries.length) throw new Error("ArchDaily \u67E5\u770B\u5668\u76F8\u518C\u6570\u91CF\u4E0D\u5339\u914D");
    const byId = /* @__PURE__ */ new Map();
    for (const record of records) {
      if (!record || !["MediaPicture", "MediaPlan"].includes(record.type) || typeof record.caption !== "string") {
        throw new Error("ArchDaily \u56FE\u7247\u7C7B\u578B\u6216\u56FE\u6CE8\u672A\u786E\u8BA4");
      }
      const identity = photoLink(record.link, url);
      const entry = entries.find((candidate) => candidate.id === identity.id && candidate.href === identity.href);
      if (!entry || byId.has(identity.id)) throw new Error("ArchDaily \u67E5\u770B\u5668\u56FE\u7247\u8EAB\u4EFD\u4E0D\u5339\u914D\u6216\u91CD\u590D");
      byId.set(identity.id, { url: archdailyImage(record.url_slideshow, identity.id), caption: record.caption });
    }
    return byId;
  }
  function cancelArchdailyCapture() {
    activeCapture?.abort();
  }
  async function captureArchdailyArticle(rawUrl, options = {}) {
    if (activeCapture) throw new Error("ArchDaily \u6B63\u5728\u91C7\u96C6\u4E2D");
    const page = options.document || document;
    const url = archdailyProjectUrl(rawUrl);
    const currentUrl = options.currentUrl || (() => location.href);
    const controller = new AbortController();
    activeCapture = controller;
    const timeout = setTimeout(() => controller.abort(), options.overallTimeoutMs ?? 6e4);
    const check = () => {
      if (controller.signal.aborted) throw new Error("ArchDaily \u91C7\u96C6\u5DF2\u53D6\u6D88\u6216\u8D85\u65F6");
      if (archdailyProjectUrl(currentUrl()) !== url) throw new Error("ArchDaily \u9875\u9762\u5DF2\u5207\u6362\uFF0C\u505C\u6B62\u91C7\u96C6");
    };
    const navigation = setInterval(() => {
      try {
        check();
      } catch (_) {
        controller.abort();
      }
    }, 200);
    try {
      check();
      while (bodyIsLoading(page)) {
        options.progress?.("\u7B49\u5F85 ArchDaily \u6B63\u6587\u5B8C\u6574\u52A0\u8F7D");
        await new Promise((resolve) => setTimeout(resolve, 200));
        check();
      }
      const { entries, payload } = extractArchdailyProject(page, url);
      let gallery = /* @__PURE__ */ new Map();
      if (!entries.some((entry) => entry.total) || entries.some((entry) => !entry.large || entry.caption === void 0)) {
        options.progress?.(`\u6838\u5BF9 ${entries.length} \u5F20\u56FE\u5E93\u5927\u56FE\u548C\u56FE\u6CE8`);
        const requestTimeout = setTimeout(() => controller.abort(), options.requestTimeoutMs ?? 2e4);
        try {
          const response = await (options.fetch || fetch)(entries[0].href, { signal: controller.signal, credentials: "same-origin", redirect: "error" });
          check();
          if (!response.ok || response.redirected || response.url !== entries[0].href || !response.headers.get("content-type")?.includes("text/html")) {
            throw new Error("ArchDaily \u67E5\u770B\u5668\u8BF7\u6C42\u5931\u8D25\u3001\u8DF3\u8F6C\u6216\u5185\u5BB9\u683C\u5F0F\u65E0\u6548");
          }
          const html = await response.text();
          check();
          gallery = parseArchdailyGallery(new DOMParser().parseFromString(html, "text/html"), url, entries);
        } finally {
          clearTimeout(requestTimeout);
        }
      }
      payload.photos = entries.map((entry) => {
        const record = gallery.get(entry.id);
        const imageUrl = archdailyImage(entry.large || record?.url, entry.id);
        const caption = record ? [...new Set([record.caption, entry.caption].filter((value) => typeof value === "string" && value.trim()))].join("\n") : entry.caption;
        return { id: entry.id, url: imageUrl, caption: field(caption, "dom.archdaily-gallery") };
      });
      check();
      const final = extractArchdailyProject(page, url);
      if (JSON.stringify(final.entries) !== JSON.stringify(entries) || JSON.stringify(final.payload) !== JSON.stringify({ ...payload, photos: [] })) {
        throw new Error("ArchDaily \u9875\u9762\u5728\u91C7\u96C6\u671F\u95F4\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5");
      }
      options.progress?.(`\u5DF2\u786E\u8BA4 ${entries.length} \u5F20\u5927\u56FE`);
      return payload;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("ArchDaily \u91C7\u96C6\u5DF2\u53D6\u6D88\u3001\u8D85\u65F6\u6216\u9875\u9762\u5DF2\u5207\u6362");
      throw error;
    } finally {
      clearTimeout(timeout);
      clearInterval(navigation);
      controller.abort();
      activeCapture = null;
    }
  }

  // src/archello/capture.js
  var ORIGIN2 = "https://archello.com";
  var IMAGE_HOST = "archello.s3.eu-central-1.amazonaws.com";
  var activeCapture2 = null;
  function projectUrl(raw) {
    const parsed = new URL(raw);
    if (parsed.origin !== ORIGIN2 || parsed.username || parsed.password || !/^\/project\/[^/]+\/?$/.test(parsed.pathname)) throw new Error("\u4E0D\u662F Archello \u9879\u76EE\u9875\u9762");
    return ORIGIN2 + parsed.pathname.replace(/\/$/, "");
  }
  function originalImageUrl(raw) {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.host !== IMAGE_HOST || parsed.username || parsed.password || !/^\/images\/\d{4}\/\d{2}\/\d{2}\/[^/%\\]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(parsed.pathname) || parsed.search || parsed.hash) throw new Error("Archello \u67E5\u770B\u5668\u6CA1\u6709\u63D0\u4F9B\u53EF\u786E\u8BA4\u7684\u539F\u56FE");
    return parsed.href;
  }
  function text2(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    for (const br of clone.querySelectorAll("br")) br.replaceWith(" / ");
    return clone.textContent.replace(/\s+/g, " ").trim();
  }
  function field2(value, source, format = "text") {
    return {
      status: value === void 0 ? "missing" : value.trim() ? "present" : "empty",
      value: value ?? "",
      source: `dom.archello.${source}`,
      format
    };
  }
  function cleanContent(node) {
    const clone = node.cloneNode(true);
    for (const child of clone.querySelectorAll('script, style, iframe, object, embed, form, input, button, svg, img, figure, [id^="block-project-applied-products-"]')) child.remove();
    for (const child of [...clone.querySelectorAll("*")].reverse()) {
      if (!/^(P|DIV|SPAN|A|STRONG|B|EM|I|U|BR|H[1-6]|UL|OL|LI|BLOCKQUOTE|TABLE|THEAD|TBODY|TR|TH|TD|SUP|SUB)$/.test(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      const href = child.getAttribute("href");
      for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
      if (child.tagName === "A" && href) {
        const parsed = new URL(href, ORIGIN2);
        if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password) child.setAttribute("href", parsed.href);
      }
    }
    return clone;
  }
  function attachment(raw, storyId) {
    const parsed = new URL(raw, ORIGIN2);
    if (parsed.origin !== ORIGIN2 || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    const match = parsed.pathname.match(/^\/story\/(\d+)\/attachments\/(photos-videos|drawings)\/(\d+)$/);
    return match && match[1] === storyId ? { url: parsed.href, category: match[2], position: Number(match[3]) } : null;
  }
  function assertProjectLink(page, url, selector) {
    if (![...page.querySelectorAll(selector)].some((link) => {
      try {
        return projectUrl(new URL(link.getAttribute("href"), ORIGIN2).href) === url;
      } catch (_) {
        return false;
      }
    })) throw new Error("Archello \u8FD4\u56DE\u9875\u9762\u4E0D\u5C5E\u4E8E\u5F53\u524D\u9879\u76EE");
  }
  function rows(container) {
    if (!container) return [];
    const entries = [...container.querySelectorAll("dt")].map((label) => ({ label: text2(label), value: text2(label.nextElementSibling) }));
    if (entries.length) return entries;
    return [...container.querySelectorAll(".ah-project-details__item")].map((row) => ({
      label: text2(row.querySelector(".ah-project-details__item-title")),
      value: text2(row.querySelector(".ah-project-details__item-text"))
    }));
  }
  function extractArchelloProject(page, rawUrl) {
    const url = projectUrl(rawUrl);
    const canonical = page.querySelector('link[rel="canonical"]')?.getAttribute("href");
    if (!canonical || projectUrl(canonical) !== url) throw new Error("Archello \u9879\u76EE canonical \u4E0D\u5339\u914D");
    const stories = [...page.querySelectorAll("#stories-grid > [data-key]")];
    if (!stories.length || page.querySelector("#stories-grid .pagination, #stories-grid .pager")) {
      throw new Error("\u5F53\u524D Archello \u9879\u76EE\u6545\u4E8B\u672A\u5B8C\u6574\u52A0\u8F7D");
    }
    const heroLinks = [...page.querySelectorAll(".ah-project-hero__link[href]")];
    let story;
    if (heroLinks.length) {
      const matches = stories.filter((candidate) => heroLinks.every((link) => attachment(link.getAttribute("href"), candidate.getAttribute("data-key"))));
      if (matches.length !== 1) throw new Error("Archello \u9879\u76EE\u5934\u56FE\u4E0E\u4E3B\u6545\u4E8B\u5173\u8054\u4E0D\u660E\u786E");
      story = matches[0];
    } else if (stories.length === 1) {
      story = stories[0];
    } else {
      throw new Error("Archello \u591A\u6545\u4E8B\u9875\u9762\u7F3A\u5C11\u9879\u76EE\u5934\u56FE\u5173\u8054\uFF0C\u65E0\u6CD5\u786E\u8BA4\u4E3B\u6545\u4E8B");
    }
    const storyId = story.getAttribute("data-key");
    if (!/^\d+$/.test(storyId)) throw new Error("Archello story ID \u7F3A\u5931");
    const title = text2(page.querySelector(".ah-project-hero__title"));
    const studio = text2(story.querySelector(`[id="popover-brand-short-info-title-${storyId}"]`));
    const bodyNode = story.querySelector(".mce-content-body");
    if (!title || !bodyNode) throw new Error("Archello \u6807\u9898\u6216\u6B63\u6587\u672A\u52A0\u8F7D");
    const body = cleanContent(bodyNode);
    const heading = story.querySelector(".ah-project-story__heading");
    if (heading) {
      const copied = page.createElement("h2");
      copied.textContent = text2(heading);
      body.prepend(copied);
    }
    const media = /* @__PURE__ */ new Map();
    for (const link of story.querySelectorAll("a[href]")) {
      const target = attachment(link.getAttribute("href"), storyId);
      if (target && link.querySelector("img")) {
        const caption = link.querySelector("figcaption");
        media.set(target.url, { ...target, inlineCaption: caption ? text2(caption) : media.get(target.url)?.inlineCaption });
      }
    }
    if (!media.size) throw new Error("Archello \u9879\u76EE\u672A\u63D0\u4F9B\u7167\u7247");
    const sections = [];
    const information = rows(story.querySelector("#grid-product-detail-general"));
    for (const row of information) {
      if (row.label === "Project Year") row.label = "Year";
      if (row.label === "Location") row.value = row.value.replace(/\s*\|\s*View Map.*$/, "");
    }
    const credits = rows(story.querySelector("#project-credits"));
    if (information.length) sections.push({ title: "Project information", rows: information });
    if (credits.length) sections.push({ title: "Credits", rows: credits });
    const creditMore = [...story.querySelectorAll("#project-credits a[href]")].find((link) => /^View All$/i.test(text2(link)));
    const specLink = [...story.querySelectorAll("a[href]")].find((link) => new URL(link.getAttribute("href"), ORIGIN2).pathname === `/story/${storyId}/attachments/product-spec-sheet`);
    return {
      storyId,
      media: [...media.values()],
      creditMore: creditMore?.getAttribute("href"),
      specLink: specLink?.getAttribute("href"),
      article: {
        schema_version: 1,
        source: "archello",
        url,
        title,
        building: title,
        studio,
        body: field2(text2(body) ? body.innerHTML : "", "body", "html"),
        sections,
        expected_photo_count: 0,
        photos: [],
        warnings: stories.length > 1 ? [`\u4EC5\u5F52\u6863\u9879\u76EE\u5934\u56FE\u5173\u8054\u7684\u4E3B\u6545\u4E8B ${storyId}\uFF1B\u5176\u4F59 ${stories.length - 1} \u4E2A\u53C2\u4E0E\u65B9\u6545\u4E8B\u4E0D\u7EB3\u5165\u6B63\u6587\u548C\u76F8\u518C\u3002`] : []
      }
    };
  }
  function extractArchelloGallery(page, url, storyId, category) {
    assertProjectLink(page, url, "#navbar-gallery a[href]");
    const grid = page.querySelector(`#${category}-grid`);
    if (!grid || grid.querySelector('.pagination, .pager, [rel="next"]')) throw new Error("Archello \u5B8C\u6574\u76F8\u518C\u672A\u52A0\u8F7D");
    const media = /* @__PURE__ */ new Map();
    for (const link of grid.querySelectorAll("a[href]")) {
      const target = attachment(link.getAttribute("href"), storyId);
      if (!target || target.category !== category) continue;
      const image = link.querySelector("img");
      if (!image) continue;
      const raw = image.getAttribute("data-src") || image.getAttribute("src");
      const thumbnail = new URL(raw, ORIGIN2);
      if (thumbnail.origin !== ORIGIN2 || !thumbnail.pathname.startsWith("/thumbs/images/")) throw new Error("Archello \u76F8\u518C\u56FE\u7247\u6765\u6E90\u65E0\u6CD5\u786E\u8BA4");
      const item = link.closest(".multimedia-grid-item");
      const idNode = item?.querySelector('[id^="story-media-"][id$="-socials-share"]');
      const mediaId = idNode?.id.match(/^story-media-(\d+)-socials-share$/)?.[1];
      if (!mediaId) throw new Error("Archello \u76F8\u518C\u7167\u7247 ID \u7F3A\u5931");
      const value = { ...target, mediaId, imagePath: thumbnail.pathname.slice("/thumbs".length) };
      if (media.has(target.url) && media.get(target.url).mediaId !== mediaId) throw new Error("Archello \u76F8\u518C\u7167\u7247 ID \u51B2\u7A81");
      media.set(target.url, value);
    }
    const ordered = [...media.values()].sort((left, right) => left.position - right.position);
    if (!ordered.length || ordered.length > 1e3 || ordered.some((item, index) => item.position !== index + 1)) throw new Error("Archello \u76F8\u518C\u4E0D\u5B8C\u6574\u6216\u5305\u542B\u4E0D\u652F\u6301\u7684\u5A92\u4F53");
    return ordered;
  }
  function extractArchelloPhoto(page, url, storyId, photo, count) {
    const viewer = page.querySelector(`[id="attachment-story-${storyId}-grid"] .photoviewer`);
    if (!viewer || viewer.getAttribute("data-key") !== photo.mediaId) throw new Error("Archello \u67E5\u770B\u5668\u7167\u7247 ID \u4E0D\u5339\u914D");
    assertProjectLink(viewer, url, ".photoviewer-sidebar-heading h1 a[href]");
    const total = text2(viewer.querySelector(".photoviewer-content-footer")).match(/\b(\d+)\s+of\s+(\d+)\b/);
    if (!total || Number(total[1]) !== photo.position || Number(total[2]) !== count) throw new Error("Archello \u67E5\u770B\u5668\u7167\u7247\u6570\u91CF\u4E0D\u5339\u914D");
    const images = viewer.querySelectorAll(".image-scale img");
    if (images.length !== 1) throw new Error("Archello \u67E5\u770B\u5668\u672A\u63D0\u4F9B\u5355\u5F20\u539F\u56FE");
    const original = originalImageUrl(images[0].getAttribute("src"));
    if (new URL(original).pathname !== photo.imagePath) throw new Error("Archello \u539F\u56FE\u4E0E\u76F8\u518C\u56FE\u7247\u4E0D\u5339\u914D");
    const captionNode = viewer.querySelector(".photoviewer-sidebar-heading");
    const caption = [...captionNode.children].filter((node) => node.tagName === "P").map(text2).filter(Boolean).join("\n\n");
    return { id: new URL(original).pathname, url: original, caption: field2(caption, "viewer.caption") };
  }
  function cancelArchelloCapture() {
    activeCapture2?.abort();
  }
  async function captureArchelloArticle(url, options = {}) {
    if (activeCapture2) throw new Error("Archello \u9875\u9762\u6536\u96C6\u4E2D");
    const controller = new AbortController();
    activeCapture2 = controller;
    const currentUrl = options.currentUrl || (() => location.href);
    const progress = options.progress || (() => {
    });
    const canonical = projectUrl(url);
    let timedOut = false;
    const guard = () => {
      if (timedOut) throw new Error("Archello \u9875\u9762\u6536\u96C6\u8D85\u65F6\uFF085 \u5206\u949F\uFF09");
      if (controller.signal.aborted) throw new Error("Archello \u9875\u9762\u6536\u96C6\u5DF2\u53D6\u6D88");
      if (projectUrl(currentUrl()) !== canonical) throw new Error("\u6536\u96C6\u671F\u95F4\u5207\u6362\u4E86 Archello \u9879\u76EE");
    };
    const deadline = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 3e5);
    async function load(raw) {
      guard();
      const target = new URL(raw, ORIGIN2);
      if (target.origin !== ORIGIN2 || target.username || target.password) throw new Error("\u62D2\u7EDD\u8DE8\u7AD9 Archello \u8BF7\u6C42");
      const requestController = new AbortController();
      const abort = () => requestController.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 2e4);
      try {
        const response = await fetch(target.href, { credentials: "same-origin", redirect: "error", signal: requestController.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (response.url !== target.href) throw new Error("Archello \u54CD\u5E94 URL \u4E0D\u5339\u914D");
        const html = await response.text();
        guard();
        return new DOMParser().parseFromString(html, "text/html");
      } catch (error) {
        guard();
        throw new Error(requestController.signal.aborted ? "Archello \u8BF7\u6C42\u8D85\u65F6" : error.message);
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", abort);
      }
    }
    try {
      guard();
      let project = extractArchelloProject(options.page || document, canonical);
      if (project.creditMore) {
        const target = new URL(project.creditMore, ORIGIN2);
        if (projectUrl(target.href) !== canonical || !/^\?dp-\d+-per-page=\d+$/.test(target.search)) throw new Error("Archello \u7F72\u540D\u5C55\u5F00\u94FE\u63A5\u4E0D\u5339\u914D");
        const expanded = extractArchelloProject(await load(target.href), canonical);
        if (expanded.storyId !== project.storyId || expanded.creditMore) throw new Error("Archello \u7F72\u540D\u672A\u5B8C\u6574\u52A0\u8F7D");
        project.article.sections = expanded.article.sections;
      }
      if (project.specLink) {
        const specPage = await load(project.specLink);
        assertProjectLink(specPage, canonical, "#navbar-gallery a[href]");
        const table = specPage.querySelector("#specifications-grid");
        if (!table || table.querySelector(".pagination, .pager")) throw new Error("Archello \u6750\u6599\u8868\u672A\u5B8C\u6574\u52A0\u8F7D");
        const details = [...table.querySelectorAll("tbody tr")].map((row) => {
          const cells = row.querySelectorAll("td");
          if (cells.length !== 4) throw new Error("Archello \u6750\u6599\u8868\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B");
          return { label: text2(cells[0]), value: [text2(cells[1]), text2(cells[2])].filter(Boolean).join(" \u2014 ") };
        });
        if (details.length) project.article.sections.push({ title: "Details", rows: details });
      }
      const allMedia = /* @__PURE__ */ new Set();
      for (const category of new Set(project.media.map((photo) => photo.category))) {
        const seed = project.media.find((photo) => photo.category === category);
        const galleryPage = await load(seed.url.replace(/\/\d+$/, ""));
        const photos = extractArchelloGallery(galleryPage, canonical, project.storyId, category);
        for (const photo of photos) {
          allMedia.add(photo.url);
          progress(`\u6536\u96C6 Archello ${category} ${photo.position}/${photos.length}`);
          const result = extractArchelloPhoto(await load(photo.url), canonical, project.storyId, photo, photos.length);
          const inlineCaption = project.media.find((item) => item.url === photo.url)?.inlineCaption;
          if (inlineCaption && !result.caption.value.includes(inlineCaption)) {
            result.caption = field2([inlineCaption, result.caption.value].filter(Boolean).join("\n\n"), "viewer.caption");
          }
          const existing = project.article.photos.find((item) => item.id === result.id);
          if (existing) {
            if (result.caption.value && !existing.caption.value.includes(result.caption.value)) {
              existing.caption = field2([existing.caption.value, result.caption.value].filter(Boolean).join("\n\n"), "viewer.caption");
            }
          } else project.article.photos.push(result);
          if (project.article.photos.length > 1e3) throw new Error("Archello \u56FE\u7247\u8D85\u8FC7\u4E0A\u9650");
        }
      }
      if (project.media.some((photo) => !allMedia.has(photo.url))) throw new Error("Archello \u6B63\u6587\u7167\u7247\u672A\u5305\u542B\u5728\u5B8C\u6574\u76F8\u518C\u4E2D");
      guard();
      project.article.expected_photo_count = project.article.photos.length;
      return project.article;
    } finally {
      clearTimeout(deadline);
      activeCapture2 = null;
    }
  }

  // src/dwell/common.js
  function readDwellState(page = document) {
    for (const script of page.scripts || page.querySelectorAll("script")) {
      const match = script.textContent.match(/^\s*window\.INITIAL_STATE\s*=\s*/);
      if (!match) continue;
      try {
        return JSON.parse(script.textContent.slice(match[0].length).replace(/;\s*$/, ""));
      } catch (_) {
        continue;
      }
    }
    return {};
  }
  function dwellOriginalUrl(raw) {
    try {
      let parsed = new URL(raw, "https://www.dwell.com");
      if (parsed.hostname === "go.skimresources.com") parsed = new URL(parsed.searchParams.get("url"));
      if (parsed.protocol !== "https:" || !["images.dwell.com", "images2.dwell.com"].includes(parsed.host) || !/^\/photos\/\d+\/\d+\/original\.(jpg|jpeg|png|webp|avif)$/.test(parsed.pathname)) return null;
      return `${parsed.origin}${parsed.pathname}`;
    } catch (_) {
      return null;
    }
  }
  function dwellText(value, source, format = "text") {
    if (value !== null && typeof value !== "string") return { status: "missing", value: "", format, source };
    const text3 = value || "";
    return { status: text3.trim() ? "present" : "empty", value: text3, format, source };
  }
  function dwellAttribute(record, key, source) {
    return dwellText(Object.prototype.hasOwnProperty.call(record || {}, key) ? record[key] : void 0, source);
  }
  function preferredDwellText(...values) {
    return values.find((value) => value.status === "present") || values.find((value) => value.status === "empty") || values[0];
  }
  function dwellContentNode(node) {
    if (!node) return null;
    const clone = node.cloneNode(true);
    for (const child of clone.querySelectorAll("script, style, button, select, input, textarea, svg, iframe, img, nav, footer")) child.remove();
    for (const child of [clone, ...clone.querySelectorAll("*")]) {
      for (const attribute of [...child.attributes]) {
        if (!["href", "title"].includes(attribute.name)) child.removeAttribute(attribute.name);
      }
      if (child.hasAttribute("href")) {
        try {
          const href = new URL(child.getAttribute("href"), "https://www.dwell.com");
          if (!["https:", "http:"].includes(href.protocol)) child.removeAttribute("href");
          else child.setAttribute("href", href.href);
        } catch (_) {
          child.removeAttribute("href");
        }
      }
    }
    return clone;
  }
  function dwellSection(root, name) {
    const heading = [...root.querySelectorAll("h2, h3, h4")].find((node) => !node.closest("nav, footer, #archive-scraper") && (name === "Description" ? /^(From\s+.+|Description|About this home)$/i.test(node.textContent.trim()) : node.textContent.trim().toLowerCase() === name.toLowerCase()));
    if (!heading) return null;
    const container = heading.closest("section") || heading.parentElement;
    const clone = container.cloneNode(true);
    const copiedHeading = [...clone.querySelectorAll("h2, h3, h4")].find((node) => node.textContent === heading.textContent);
    copiedHeading?.remove();
    return dwellContentNode(clone);
  }
  function dwellRows(container) {
    if (!container) return [];
    const rows2 = [];
    const add = (label, value) => {
      const cleanLabel = label?.textContent.trim();
      const cleanValue = dwellContentNode(value)?.textContent.trim();
      if (label?.closest("nav, footer, aside, #archive-scraper")) return;
      if (cleanLabel && cleanValue) rows2.push({ label: cleanLabel, value: cleanValue });
    };
    for (const term of container.querySelectorAll("dt")) {
      if (term.nextElementSibling?.tagName === "DD") add(term, term.nextElementSibling);
    }
    for (const row of container.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("th, td");
      if (cells.length === 2) add(cells[0], cells[1]);
    }
    for (const row of container.querySelectorAll("div, li")) {
      const label = row.firstElementChild;
      if (label && ["DIV", "SPAN", "LABEL"].includes(label.tagName) && !label.children.length && label.textContent.trim().length <= 64 && label.nextElementSibling) add(label, label.nextElementSibling);
    }
    return rows2;
  }

  // src/dwell/home.js
  function findDwellProject(state, url) {
    const slug = new URL(url).pathname.split("/")[2];
    const record = Object.values(state.slugs?.items || {}).find((item) => item.attributes?.slug === slug && item.attributes?.sluggableType === "collections");
    const collectionId = record?.attributes?.sluggableId;
    const collection = state.collections?.items?.[collectionId];
    return collection ? { collectionId: String(collectionId), collection } : null;
  }
  function extractDwellHome(page, url) {
    const canonical = new URL(url);
    if (canonical.origin !== "https://www.dwell.com" || !/^\/home\/[^/]+\/?$/.test(canonical.pathname)) {
      throw new Error("\u4EC5\u652F\u6301 Dwell home \u9879\u76EE\u9875\u9762");
    }
    const projectPath = canonical.pathname.replace(/\/$/, "");
    const state = readDwellState(page);
    const project = findDwellProject(state, url);
    const attributes = project?.collection.attributes || {};
    const relationships = project?.collection.relationships || {};
    const heading = [...page.querySelectorAll("h1")].find((node) => !node.closest("nav, footer, #archive-scraper"));
    const root = heading?.closest("main, article") || page.body;
    const title = attributes.title || heading?.textContent.trim() || "";
    const issues = [];
    const warnings = project ? [] : ["\u5F53\u524D\u9879\u76EE\u7ED3\u6784\u5316\u6570\u636E\u4E0D\u53EF\u7528\uFF0C\u6B63\u5728\u4F7F\u7528\u8BED\u4E49 DOM \u515C\u5E95\u3002"];
    let body = dwellAttribute(attributes, "description", "state.collection.description");
    const description = dwellSection(root, "Description");
    if (description) {
      const domBody = dwellText(description.textContent.trim() ? description.innerHTML : "", "dom.description", "html");
      if (body.status === "missing" || domBody.status === "present" && description.textContent.trim().length > body.value.trim().length) body = domBody;
    }
    const sections = new Map(["Project information", "Credits", "Details", "Tags"].map((name) => [name, /* @__PURE__ */ new Map()]));
    const addRow = (section, label, value, fallback = false) => {
      if (typeof label !== "string" || !label.trim() || !["string", "number"].includes(typeof value)) return false;
      const rows2 = sections.get(section);
      const text3 = String(value).trim();
      if (!text3) return false;
      const existing = rows2.get(label);
      if (!existing) rows2.set(label, text3);
      else if (!fallback && !existing.split("; ").includes(text3)) rows2.set(label, `${existing}; ${text3}`);
      return true;
    };
    for (const reference of relationships.metadata?.data || []) {
      const metadata = state.metadata?.items?.[reference.id]?.attributes;
      if (!metadata) {
        issues.push(`metadata ${reference.id} \u672A\u52A0\u8F7D`);
        continue;
      }
      const label = { address: "Location", location: "Location", year: "Year", type: "Style", style: "Style", structure: "Structure" }[metadata.name];
      const value = label === "Location" ? metadata.title : metadata.value;
      if (!addRow(label ? "Project information" : "Details", label || metadata.title || metadata.name, value)) {
        issues.push(`\u9879\u76EE\u5B57\u6BB5 ${metadata.name || reference.id} \u65E0\u6CD5\u89E3\u6790`);
      }
    }
    const poster = state.profiles?.items?.[attributes.userId]?.attributes?.displayName;
    if (poster) addRow("Credits", "Posted by", poster);
    for (const reference of relationships.contributors?.data || []) {
      const credit = state.contributors?.items?.[reference.id]?.attributes;
      if (!credit || credit.contributableId && String(credit.contributableId) !== project.collectionId) {
        issues.push(`credit ${reference.id} \u672A\u52A0\u8F7D\u6216\u4E0D\u5C5E\u4E8E\u5F53\u524D\u9879\u76EE`);
        continue;
      }
      const name = credit.contributorAlt || state.profiles?.items?.[credit.contributorId]?.attributes?.displayName;
      if (!addRow("Credits", credit.type, name)) issues.push(`credit ${reference.id} \u7684\u540D\u79F0\u65E0\u6CD5\u89E3\u6790`);
    }
    for (const reference of relationships.tags?.data || []) {
      const tag = state.tags?.items?.[reference.id]?.attributes;
      if (!addRow("Tags", "Tags", tag?.name || tag?.title)) issues.push(`tag ${reference.id} \u672A\u52A0\u8F7D`);
    }
    for (const row of dwellRows(root)) {
      if (["Location", "Year", "Style", "Structure"].includes(row.label)) addRow("Project information", row.label, row.value, true);
    }
    for (const sectionName of ["Credits", "Details", "Tags"]) {
      const container = dwellSection(root, sectionName);
      if (!container) continue;
      const rows2 = dwellRows(container);
      if (sectionName === "Tags" && !rows2.length && container.textContent.trim()) {
        rows2.push({ label: "Tags", value: [...container.querySelectorAll("a")].map((node) => node.textContent.trim()).filter(Boolean).join("; ") || container.textContent.trim() });
      }
      for (const row of rows2) addRow(sectionName, row.label, row.value, true);
      if (!sections.get(sectionName).size && container.textContent.trim()) issues.push(`${sectionName} \u5B58\u5728\u4F46\u65E0\u6CD5\u786E\u8BA4\u5B57\u6BB5\u5173\u7CFB`);
    }
    let expected = Number(relationships.items?.meta?.count || 0);
    const relationPhotos = new Map((relationships.items?.data || []).filter((item) => item.type === "photos").map((item) => [String(item.id), item]));
    const queries = [];
    for (const [key, query] of Object.entries(state.collections?.relationQueries || {})) {
      try {
        const filter = JSON.parse(key);
        if (project && String(filter.id) === project.collectionId && !query.error && !query.inProgress) queries.push({ offset: Number(filter["page[offset]"] || 0), query });
      } catch (_) {
        continue;
      }
    }
    const ids = queries.sort((first, second) => first.offset - second.offset).flatMap(({ query }) => {
      expected = Math.max(expected, Number(query.meta?.count || 0));
      return (query.items || []).filter((key) => typeof key === "string" && key.startsWith("photos-")).map((key) => key.slice(7));
    });
    ids.push(...relationPhotos.keys());
    const photos = /* @__PURE__ */ new Map();
    for (const id of new Set(ids)) {
      const photo = state.photos?.items?.[id];
      const caption = preferredDwellText(
        dwellAttribute(relationPhotos.get(id)?.meta, "description", "state.relation.description"),
        dwellAttribute(photo?.attributes, "description", "state.photo.description")
      );
      photos.set(id, { id, url: dwellOriginalUrl(photo?.links?.original) || "", caption });
    }
    const isProjectPhoto = (link) => {
      try {
        const target = new URL(link.getAttribute("href"), canonical.origin);
        return target.origin === canonical.origin && target.pathname.startsWith(`${projectPath}/`) && /^\d+\/?$/.test(target.pathname.slice(projectPath.length + 1));
      } catch (_) {
        return false;
      }
    };
    const projectLinks = [...root.querySelectorAll("a[href]")].filter(isProjectPhoto);
    const gallery = [...page.querySelectorAll('[role="dialog"], dialog')].find((node) => [...node.querySelectorAll("a[href]")].some(isProjectPhoto));
    for (const image of page.querySelectorAll("img[data-photo-id]")) {
      const id = image.getAttribute("data-photo-id");
      const link = image.closest("a[href]");
      if (link) {
        if (!isProjectPhoto(link)) continue;
        if (new URL(link.getAttribute("href"), canonical.origin).pathname.replace(/\/$/, "").split("/").pop() !== id) {
          issues.push(`\u7167\u7247 ${id} \u4E0E\u9879\u76EE\u94FE\u63A5\u4E0D\u4E00\u81F4`);
          continue;
        }
      } else if (!photos.has(id) && !gallery?.contains(image)) continue;
      const original = dwellOriginalUrl(image.getAttribute("src"));
      if (!original) {
        if (!photos.get(id)?.url) issues.push(`\u7167\u7247 ${id} \u7F3A\u5C11\u539F\u56FE\u5730\u5740`);
        continue;
      }
      if (new URL(original).pathname.split("/")[3] !== id) {
        issues.push(`\u7167\u7247 ${id} \u7F3A\u5C11\u5339\u914D\u7684\u539F\u56FE\u5730\u5740`);
        continue;
      }
      let caption = dwellText(void 0, "dom.caption");
      const figure = image.closest("figure");
      const captionNode = figure && figure.querySelectorAll("img").length === 1 ? figure.querySelector("figcaption") : null;
      if (captionNode) caption = dwellText(captionNode.textContent.trim(), "dom.figcaption");
      const describedBy = image.getAttribute("aria-describedby")?.split(/\s+/).map((key) => page.getElementById(key));
      if (describedBy?.length && describedBy.every(Boolean)) caption = dwellText(describedBy.map((node) => node.textContent.trim()).join("\n\n"), "dom.aria-describedby");
      const existing = photos.get(id);
      photos.set(id, { id, url: existing?.url || original, caption: existing ? preferredDwellText(existing.caption, caption) : caption });
    }
    const controls = [...root.querySelectorAll('button, a, [role="button"]')].filter((node) => !node.closest("nav, footer, aside, #archive-scraper"));
    for (const control of controls) {
      const match = (control.getAttribute("aria-label") || control.textContent).trim().match(/^View\s+([\d,]+)\s+Photos$/i);
      if (match) expected = Math.max(expected, Number(match[1].replaceAll(",", "")));
    }
    if (!project && !projectLinks.length) issues.push("\u65E0\u6CD5\u786E\u8BA4\u7167\u7247\u4E0E\u5F53\u524D\u9879\u76EE\u7684\u5173\u8054");
    return {
      schema_version: 1,
      source: "dwell",
      url: `${canonical.origin}${projectPath}`,
      title,
      building: title,
      studio: sections.get("Credits").get("Architect") || "",
      body,
      sections: [...sections].filter(([, rows2]) => rows2.size).map(([name, rows2]) => ({ title: name, rows: [...rows2].map(([label, value]) => ({ label, value })) })),
      expected_photo_count: expected,
      photos: [...photos.values()],
      warnings,
      issues
    };
  }
  function validateDwellCapture(article) {
    const issues = [...article.issues];
    if (!article.title) issues.push("\u9879\u76EE\u6807\u9898\u65E0\u6CD5\u786E\u8BA4");
    if (article.body.status === "missing") issues.push("\u6B63\u6587\u65E0\u6CD5\u5B9A\u4F4D\uFF08\u4E0D\u80FD\u5224\u65AD\u4E3A\u6B63\u6587\u4E3A\u7A7A\uFF09");
    if (!Number.isInteger(article.expected_photo_count) || article.expected_photo_count <= 0) issues.push("\u65E0\u6CD5\u786E\u8BA4\u76F8\u518C\u603B\u6570");
    if (article.photos.length !== article.expected_photo_count) issues.push(`\u76F8\u518C\u672A\u5B8C\u6574\u52A0\u8F7D (${article.photos.length}/${article.expected_photo_count})`);
    for (const photo of article.photos) {
      if (!photo.url) issues.push(`\u7167\u7247 ${photo.id} \u539F\u56FE\u672A\u52A0\u8F7D`);
      if (photo.caption.status === "missing") issues.push(`\u7167\u7247 ${photo.id} \u63CF\u8FF0\u672A\u786E\u8BA4\uFF08\u4E0D\u80FD\u5224\u65AD\u4E3A\u65E0\u63CF\u8FF0\uFF09`);
    }
    if (issues.length) throw new Error(`Dwell \u6293\u53D6\u672A\u5B8C\u6210\uFF1A${issues.slice(0, 6).join("\uFF1B")}\u3002\u8BF7\u786E\u8BA4\u767B\u5F55\u548C\u5B8C\u6574\u5185\u5BB9\u5DF2\u52A0\u8F7D\u540E\u91CD\u8BD5\u3002`);
    return article;
  }

  // src/dwell/story.js
  function extractDwellStory(page, url) {
    const canonical = new URL(url);
    if (canonical.origin !== "https://www.dwell.com" || !/^\/article\/[^/]+\/?$/.test(canonical.pathname)) {
      throw new Error("\u4EC5\u652F\u6301 Dwell article \u6587\u7AE0\u9875\u9762");
    }
    const state = readDwellState(page);
    const slug = canonical.pathname.split("/")[2];
    const reference = Object.values(state.slugs?.items || {}).find((item) => item.attributes?.slug === slug && item.attributes?.sluggableType === "stories");
    const storyId = reference?.attributes?.sluggableId;
    const story = state.articles?.items?.[storyId];
    if (!story || story.type !== "stories") throw new Error("\u65E0\u6CD5\u786E\u8BA4\u5F53\u524D article \u7684 stories \u6570\u636E\uFF0C\u8BF7\u786E\u8BA4\u767B\u5F55\u548C\u6B63\u6587\u5DF2\u52A0\u8F7D");
    const attributes = story.attributes || {};
    const issues = [];
    const content = page.createElement("div");
    const inlinePhotos = [];
    const rawBody = typeof attributes.body === "string" ? attributes.body : "";
    const bodyHtml = rawBody.replace(/<dwell-photo\b([\s\S]*?)(?:\/>|>\s*<\/dwell-photo>)/gi, (tag, fields) => {
      const id = fields.match(/\bphotoId="(\d+)"/i)?.[1];
      const caption = fields.match(/\bcaption="([\s\S]*?)"(?=\s+(?:layout|credit|photoUserId)="|\s*$)/i)?.[1];
      if (!id || /\bcaption=/.test(fields) && caption === void 0) issues.push("\u6587\u7AE0\u56FE\u7247\u6807\u8BB0\u65E0\u6CD5\u5B8C\u6574\u89E3\u6790");
      inlinePhotos.push({ id, caption });
      return "";
    });
    if (/<dwell-photo\b/i.test(bodyHtml)) issues.push("\u6587\u7AE0\u5305\u542B\u672A\u89E3\u6790\u7684\u56FE\u7247\u6807\u8BB0");
    content.innerHTML = bodyHtml;
    const photos = /* @__PURE__ */ new Map();
    const references = story.relationships?.photos?.data;
    if (!Array.isArray(references)) issues.push("\u6587\u7AE0\u7167\u7247\u5173\u7CFB\u672A\u52A0\u8F7D\uFF0C\u65E0\u6CD5\u786E\u8BA4\u5B8C\u6574\u6027");
    const addPhoto = (rawId, caption) => {
      const id = String(rawId);
      const photo = state.photos?.items?.[id];
      const original = dwellOriginalUrl(photo?.links?.original);
      if (!/^\d+$/.test(id) || !original || new URL(original).pathname.split("/")[3] !== id) {
        issues.push(`\u6587\u7AE0\u7167\u7247 ${id} \u7F3A\u5C11\u5339\u914D\u7684\u539F\u56FE`);
      }
      const selected = preferredDwellText(
        caption || dwellText(void 0, "state.story.caption"),
        dwellAttribute(photo?.attributes, "description", "state.photo.description")
      );
      const existing = photos.get(id);
      photos.set(id, { id, url: original || "", caption: existing ? preferredDwellText(selected, existing.caption) : selected });
    };
    const cover = story.relationships?.defaultImage?.data?.id || attributes.defaultImageId;
    if (cover) addPhoto(cover);
    for (const photo of inlinePhotos) {
      let caption = dwellText(void 0, "state.story.caption");
      if (photo.caption !== void 0) {
        const decoder = page.createElement("div");
        decoder.innerHTML = `<span data-caption="${photo.caption.replaceAll('"', "&quot;")}"></span>`;
        const raw = decoder.firstElementChild.getAttribute("data-caption");
        const container = page.createElement("div");
        container.innerHTML = raw;
        const clean2 = dwellContentNode(container);
        const text3 = clean2.textContent.trim();
        caption = dwellText(!text3 || text3 === "Add a caption" ? "" : clean2.innerHTML, "state.story.caption", "html");
      }
      addPhoto(photo.id, caption);
    }
    for (const reference2 of references || []) {
      if (reference2.type !== "photos") {
        issues.push("\u6587\u7AE0\u5305\u542B\u65E0\u6CD5\u8BC6\u522B\u7684\u7167\u7247\u5173\u7CFB");
        continue;
      }
      if (!photos.has(String(reference2.id))) addPhoto(reference2.id);
    }
    const credits = [];
    for (const reference2 of story.relationships?.contributors?.data || []) {
      const credit = state.contributors?.items?.[reference2.id]?.attributes;
      const name = credit?.contributorAlt || state.profiles?.items?.[credit?.contributorId]?.attributes?.displayName;
      if (!credit || String(credit.contributableId) !== String(storyId) || !name || !credit.type) {
        issues.push(`\u6587\u7AE0 credit ${reference2.id} \u672A\u52A0\u8F7D\u6216\u4E0D\u5C5E\u4E8E\u5F53\u524D\u6587\u7AE0`);
      } else credits.push({ label: credit.type, value: name });
    }
    const creditHeading = [...content.querySelectorAll("p")].find((node) => /^Project Credits:?$/i.test(node.textContent.trim()));
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
    for (const reference2 of story.relationships?.metadata?.data || []) {
      const metadata = state.metadata?.items?.[reference2.id]?.attributes;
      if (!metadata) {
        issues.push(`\u6587\u7AE0 metadata ${reference2.id} \u672A\u52A0\u8F7D`);
        continue;
      }
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
      schema_version: 1,
      source: "dwell",
      url: canonical.origin + canonical.pathname.replace(/\/$/, ""),
      title,
      building: title,
      studio: "",
      body,
      sections,
      expected_photo_count: photos.size,
      photos: [...photos.values()],
      warnings: [],
      issues
    };
  }

  // src/dwell/capture.js
  var captureCancelled = false;
  var captureAbortController = null;
  var captureContext = {};
  function configureDwellCapture(context) {
    captureContext = context;
  }
  function cancelDwellCapture() {
    captureCancelled = true;
    captureAbortController?.abort();
  }
  function extractDwellArticle(page, url) {
    return new URL(url).pathname.startsWith("/article/") ? extractDwellStory(page, url) : extractDwellHome(page, url);
  }
  function dwellLoadMoreButton(page, url) {
    const project = new URL(url);
    const projectPath = project.pathname.replace(/\/$/, "");
    return [...page.querySelectorAll('button, [role="button"]')].find((button) => {
      if (button.closest("nav, footer, aside, #archive-scraper, [hidden]") || button.disabled || button.getAttribute("aria-disabled") === "true" || !/^View More$/i.test((button.getAttribute("aria-label") || button.textContent).trim())) return false;
      const section = button.closest("section");
      for (let container = section || button.parentElement; container && container !== page.body; container = section ? null : container.parentElement) {
        if ([...container.querySelectorAll("a[href]")].some((link) => {
          if (!link.querySelector("img[data-photo-id]")) return false;
          try {
            const target = new URL(link.getAttribute("href"), project.origin);
            return target.origin === project.origin && target.pathname.startsWith(`${projectPath}/`) && /^\d+\/?$/.test(target.pathname.slice(projectPath.length + 1));
          } catch (_) {
            return false;
          }
        })) return true;
      }
      return false;
    });
  }
  async function fetchDwellPhotoDetails(url, photo, signal) {
    const projectUrl2 = new URL(url);
    if (projectUrl2.origin !== "https://www.dwell.com" || !/^\/home\/[^/]+\/?$/.test(projectUrl2.pathname) || !/^\d+$/.test(photo.id)) throw new Error("\u65E0\u6CD5\u786E\u8BA4\u7167\u7247\u6240\u5C5E\u9879\u76EE");
    const target = `${projectUrl2.origin}${projectUrl2.pathname.replace(/\/$/, "")}/${photo.id}`;
    const controller = new AbortController();
    const abortRequest = () => controller.abort();
    signal.addEventListener("abort", abortRequest, { once: true });
    const timeout = setTimeout(abortRequest, 2e4);
    try {
      if (signal.aborted) throw new Error("\u5DF2\u53D6\u6D88\u9875\u9762\u6536\u96C6");
      const response = await fetch(target, { credentials: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const responseUrl = new URL(response.url);
      if (responseUrl.origin !== projectUrl2.origin || responseUrl.pathname.replace(/\/$/, "") !== new URL(target).pathname) {
        throw new Error("\u8FD4\u56DE\u7684\u4E0D\u662F\u8BF7\u6C42\u7684\u7167\u7247\u9875\u9762");
      }
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      const state = readDwellState(page);
      const project = findDwellProject(state, url);
      if (!project) throw new Error("\u7167\u7247\u9875\u9762\u7F3A\u5C11\u5F53\u524D\u9879\u76EE\u7684\u6570\u636E");
      const details = state.photos?.items?.[photo.id];
      const original = dwellOriginalUrl(details?.links?.original);
      if (!original || new URL(original).pathname.split("/")[3] !== photo.id || photo.url && new URL(original).pathname !== new URL(photo.url).pathname) {
        throw new Error("\u7167\u7247 ID \u6216\u539F\u56FE\u5730\u5740\u4E0D\u5339\u914D");
      }
      const relation = project.collection.relationships?.items?.data?.find((item) => item.type === "photos" && String(item.id) === photo.id);
      const caption = preferredDwellText(
        dwellAttribute(relation?.meta, "description", "state.relation.description"),
        dwellAttribute(details?.attributes, "description", "state.photo.description")
      );
      if (caption.status === "missing") throw new Error("\u7167\u7247\u8BE6\u60C5\u4ECD\u672A\u63D0\u4F9B\u63CF\u8FF0\u5B57\u6BB5");
      return { ...photo, url: photo.url || original, caption: preferredDwellText(photo.caption, caption) };
    } catch (error) {
      if (signal.aborted) throw new Error("\u5DF2\u53D6\u6D88\u9875\u9762\u6536\u96C6");
      throw new Error(`\u7167\u7247 ${photo.id} \u63CF\u8FF0\u8865\u9F50\u5931\u8D25\uFF1A${controller.signal.aborted ? "\u8BF7\u6C42\u8D85\u65F6" : error.message}`);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortRequest);
    }
  }
  async function captureDwellArticle(url) {
    captureCancelled = false;
    captureAbortController = new AbortController();
    const signal = captureAbortController.signal;
    if (new URL(url).pathname.startsWith("/article/")) {
      try {
        const { issues, ...payload } = validateDwellCapture(extractDwellArticle(document, url));
        return payload;
      } finally {
        captureAbortController = null;
      }
    }
    let article = extractDwellArticle(document, url);
    const knownPhotos = new Map(article.photos.map((photo) => [photo.id, photo]));
    const needsPhotos = () => article.expected_photo_count > knownPhotos.size;
    const scrollPosition = window.scrollY;
    let stalled = 0;
    let previousUrl = location.href;
    let requestedPhotoCount = -1;
    const ensureCurrentProject = () => {
      if (captureCancelled || signal.aborted) throw new Error("\u5DF2\u53D6\u6D88\u9875\u9762\u6536\u96C6");
      if (captureContext.currentArticleUrl() !== url) throw new Error("\u6536\u96C6\u8FC7\u7A0B\u4E2D\u5DF2\u5207\u6362\u5230\u5176\u4ED6\u9879\u76EE\uFF0C\u8BF7\u91CD\u65B0\u6293\u53D6");
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
          const dialog = [...document.querySelectorAll('[role="dialog"], dialog')].find((node) => [...node.querySelectorAll("a[href]")].some((link) => link.getAttribute("href")?.startsWith(new URL(url).pathname + "/")));
          for (const target of dialog ? [dialog, ...dialog.querySelectorAll("*")] : [document.scrollingElement]) {
            if (target && target.clientHeight > 0 && target.scrollHeight > target.clientHeight) target.scrollTop += target.clientHeight;
          }
          const next = dialog?.querySelector('[aria-label="Next"]')?.closest("a, button");
          if (next && stalled > 0) next.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        ensureCurrentProject();
        article = extractDwellArticle(document, url);
        for (const photo of article.photos) {
          const existing = knownPhotos.get(photo.id);
          knownPhotos.set(photo.id, existing ? { ...photo, url: photo.url || existing.url, caption: preferredDwellText(photo.caption, existing.caption) } : photo);
        }
        stalled = knownPhotos.size === before && location.href === previousUrl ? stalled + 1 : 0;
        previousUrl = location.href;
        captureContext.renderStages([{ key: "capture", label: "\u6536\u96C6 Dwell \u76F8\u518C", state: "running", current: knownPhotos.size, total: article.expected_photo_count }]);
      }
      article.photos = [...knownPhotos.values()];
      if (article.photos.length !== article.expected_photo_count) validateDwellCapture(article);
      const pending = article.photos.filter((photo) => !photo.url || photo.caption.status === "missing");
      for (const [index, photo] of pending.entries()) {
        ensureCurrentProject();
        captureContext.renderStages([{ key: "capture", label: "\u8865\u9F50 Dwell \u56FE\u7247\u63CF\u8FF0", state: "running", current: index, total: pending.length }]);
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

  // src/index.js
  var SERVER = "http://127.0.0.1:8765";
  var isDwell = location.hostname === "www.dwell.com";
  var isArchello = location.hostname === "archello.com";
  var isArchdaily = location.hostname === "www.archdaily.com";
  document.documentElement.dataset.archiveSite = isDwell ? "dwell" : isArchello ? "archello" : isArchdaily ? "archdaily" : "dezeen";
  var style = document.createElement("style");
  style.textContent = widget_default;
  function buildWidget() {
    const root = document.createElement("div");
    root.id = "archive-scraper";
    root.innerHTML = `
    <div id="archive-scraper-panel" role="dialog" aria-label="Architecture Archive">
      <h4>\u6293\u53D6\u5E76\u7FFB\u8BD1<span class="archive-close" title="\u5173\u95ED">\xD7</span></h4>
      <ol id="archive-scraper-stages"></ol>
      <label id="archive-options"><input id="archive-full-translate" type="checkbox" checked /> \u4E00\u6B21\u6027\u7FFB\u8BD1\u5168\u6587</label>
      <button id="archive-run-btn" type="button">\u6293\u53D6</button>
      <button id="archive-log-toggle" type="button">\u5C55\u5F00\u65E5\u5FD7</button>
      <button id="archive-cancel-btn" type="button">\u7EC8\u6B62\u8BF7\u6C42</button>
      <div id="archive-log-wrap"></div>
      <div class="archive-footer" id="archive-scraper-footer"></div>
    </div>
    <button id="archive-scraper-btn" type="button" title="\u6253\u5F00\u6293\u53D6\u7A97\u53E3">Boom!</button>
  `;
    document.body.appendChild(root);
    const btn = root.querySelector("#archive-scraper-btn");
    const panel = root.querySelector("#archive-scraper-panel");
    const close = root.querySelector(".archive-close");
    const runBtn = root.querySelector("#archive-run-btn");
    const logToggle = root.querySelector("#archive-log-toggle");
    const logWrap = root.querySelector("#archive-log-wrap");
    const cancelBtn = root.querySelector("#archive-cancel-btn");
    btn.addEventListener("click", () => {
      panel.classList.toggle("open");
    });
    runBtn.addEventListener("click", () => startJob());
    close.addEventListener("click", () => panel.classList.remove("open"));
    logToggle.addEventListener("click", () => {
      const opened = logWrap.classList.toggle("open");
      logToggle.textContent = opened ? "\u6536\u8D77\u65E5\u5FD7" : "\u5C55\u5F00\u65E5\u5FD7";
      if (opened) logWrap.scrollTop = logWrap.scrollHeight;
    });
    cancelBtn.addEventListener("click", () => cancelCurrentJob());
    document.addEventListener("click", (e) => {
      if (!panel.classList.contains("open")) return;
      if (!root.contains(e.target)) panel.classList.remove("open");
    });
    return { btn, panel };
  }
  function markScraped(dir) {
    const runBtn = document.getElementById("archive-run-btn");
    if (!runBtn) return;
    runBtn.textContent = "\u5DF2\u6293\u53D6";
    runBtn.disabled = true;
    if (dir) runBtn.title = `\u5DF2\u6293\u53D6
${dir}`;
  }
  function currentArticleUrl() {
    if (isArchdaily) return `${location.origin}${location.pathname.replace(/\/$/, "")}`;
    return isDwell || isArchello ? `${location.origin}/${location.pathname.split("/")[1]}/${location.pathname.split("/")[2]}` : location.href;
  }
  function checkScraped() {
    const url = currentArticleUrl();
    GM_xmlhttpRequest({
      method: "GET",
      url: `${SERVER}/scraped?url=${encodeURIComponent(url)}`,
      timeout: 5e3,
      onload: (resp) => {
        let body = {};
        try {
          body = JSON.parse(resp.responseText || "{}");
        } catch (_) {
        }
        if (body.scraped) markScraped(body.dir);
      },
      onerror: () => {
      },
      ontimeout: () => {
      }
    });
  }
  function appendDisqusIframeLink() {
    const thread = document.querySelector("#disqus_thread");
    if (!thread || thread.querySelector("#archive-disqus-iframe-link")) return false;
    const iframe = thread.querySelector('iframe[title="Disqus"]');
    const src = iframe?.getAttribute("src");
    if (!src) return false;
    const link = document.createElement("a");
    link.id = "archive-disqus-iframe-link";
    link.href = src;
    link.textContent = "\u5355\u72EC\u67E5\u770B\u8BA8\u8BBA\u533A";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
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
  function renderStages(stages, footerHtml, logs) {
    const ol = document.getElementById("archive-scraper-stages");
    if (!ol) return;
    ol.innerHTML = stages.map((s) => {
      let label = s.label;
      if (typeof s.total === "number" && s.total > 0) {
        const cur = s.current || 0;
        label += ` (${cur}/${s.total})`;
      }
      const detail = s.detail ? `<div class="archive-detail">${escapeHtml(s.detail)}</div>` : "";
      return `
      <li class="${s.state}">
        <span class="archive-icon"></span>
        <span>${escapeHtml(label)}</span>
      </li>
      ${detail}
    `;
    }).join("");
    const footer = document.getElementById("archive-scraper-footer");
    if (footer) footer.innerHTML = footerHtml || "";
    const logWrap = document.getElementById("archive-log-wrap");
    if (logWrap) {
      const lines = Array.isArray(logs) ? logs : [];
      logWrap.textContent = lines.length ? lines.join("\n") : "\u6682\u65E0\u65E5\u5FD7";
      if (logWrap.classList.contains("open")) {
        logWrap.scrollTop = logWrap.scrollHeight;
      }
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }
  var polling = null;
  var currentJobId = null;
  async function startJob() {
    if (currentJobId) return;
    const runBtn = document.getElementById("archive-run-btn");
    const fullTranslate = !!document.getElementById("archive-full-translate")?.checked;
    runBtn.disabled = true;
    setCancelVisible(true);
    const url = currentArticleUrl();
    let pageData;
    try {
      renderStages([{ key: "capture", label: "\u6536\u96C6\u9875\u9762\u5185\u5BB9", state: "running" }]);
      if (isArchello || isArchdaily) {
        const capture = isArchdaily ? captureArchdailyArticle : captureArchelloArticle;
        pageData = { article: await capture(url, {
          progress: (detail) => renderStages([{ key: "capture", label: "\u6536\u96C6\u9875\u9762\u5185\u5BB9", state: "running", detail }])
        }) };
      } else {
        pageData = isDwell ? { article: await captureDwellArticle(url) } : { html: document.documentElement.outerHTML };
      }
    } catch (error) {
      fail(error.message);
      return;
    }
    renderStages([
      { key: "upload", label: "\u4E0A\u4F20\u9875\u9762", state: "running" }
    ], "", ["\u7B49\u5F85\u4E0A\u4F20\u9875\u9762..."]);
    GM_xmlhttpRequest({
      method: "POST",
      url: `${SERVER}/jobs`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ url, ...pageData, full_translate: fullTranslate }),
      timeout: 3e4,
      onload: (resp) => {
        let body = {};
        try {
          body = JSON.parse(resp.responseText || "{}");
        } catch (_) {
        }
        if (resp.status >= 400 || !body.job_id) {
          renderStages([{
            key: "upload",
            label: "\u4E0A\u4F20\u9875\u9762",
            state: "error",
            detail: body.error || `HTTP ${resp.status}`
          }], "", [`\u4E0A\u4F20\u5931\u8D25: ${body.error || `HTTP ${resp.status}`}`]);
          runBtn.disabled = false;
          setCancelVisible(false);
          return;
        }
        currentJobId = body.job_id;
        pollJob();
      },
      onerror: () => fail("\u65E0\u6CD5\u8FDE\u63A5\u672C\u5730\u670D\u52A1\uFF0C\u8BF7\u786E\u8BA4 server/app.py \u5DF2\u542F\u52A8"),
      ontimeout: () => fail("\u8BF7\u6C42\u8D85\u65F6")
    });
  }
  function fail(msg) {
    renderStages([{ key: "upload", label: "\u4E0A\u4F20\u9875\u9762", state: "error", detail: msg }], "", [msg]);
    document.getElementById("archive-run-btn").disabled = false;
    setCancelVisible(false);
    currentJobId = null;
  }
  function setCancelVisible(visible) {
    const el = document.getElementById("archive-cancel-btn");
    if (!el) return;
    if (visible) el.classList.add("visible");
    else el.classList.remove("visible");
    el.disabled = false;
    el.textContent = "\u7EC8\u6B62\u8BF7\u6C42";
  }
  function cancelCurrentJob() {
    if (!currentJobId) {
      cancelDwellCapture();
      cancelArchelloCapture();
      cancelArchdailyCapture();
      return;
    }
    const btn = document.getElementById("archive-cancel-btn");
    btn.disabled = true;
    btn.textContent = "\u7EC8\u6B62\u4E2D...";
    GM_xmlhttpRequest({
      method: "POST",
      url: `${SERVER}/jobs/${currentJobId}/cancel`,
      timeout: 1e4,
      onload: () => {
      },
      onerror: () => {
        btn.disabled = false;
        btn.textContent = "\u7EC8\u6B62\u8BF7\u6C42";
      },
      ontimeout: () => {
        btn.disabled = false;
        btn.textContent = "\u7EC8\u6B62\u8BF7\u6C42";
      }
    });
  }
  function pollJob() {
    if (!currentJobId) return;
    const id = currentJobId;
    GM_xmlhttpRequest({
      method: "GET",
      url: `${SERVER}/jobs/${id}`,
      timeout: 1e4,
      onload: (resp) => {
        let body = {};
        try {
          body = JSON.parse(resp.responseText || "{}");
        } catch (_) {
        }
        if (resp.status >= 400) {
          fail(body.error || `HTTP ${resp.status}`);
          return;
        }
        let footer = "";
        if (body.dir) {
          footer = `\u8F93\u51FA\u76EE\u5F55\uFF1A<br><code>${escapeHtml(body.dir)}</code>`;
        }
        if (body.status === "error" && body.error) {
          footer += `<br><span style="color:#b42318">${escapeHtml(body.error)}</span>`;
        }
        renderStages(body.stages || [], footer, body.logs || []);
        if (body.status === "running" || body.status === "cancelling") {
          polling = setTimeout(pollJob, 500);
        } else {
          currentJobId = null;
          const runBtn = document.getElementById("archive-run-btn");
          runBtn.disabled = false;
          runBtn.textContent = "\u6293\u53D6";
          runBtn.title = "\u6293\u53D6\u672C\u6587\u5E76\u7FFB\u8BD1";
          setCancelVisible(false);
          if (body.status === "done") markScraped(body.dir);
        }
      },
      onerror: () => {
        polling = setTimeout(pollJob, 1e3);
      }
    });
  }
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
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
  configureDwellCapture({ currentArticleUrl, renderStages });
})();
