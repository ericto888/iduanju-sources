// XVideos · iDuanJu idj1 video plugin
// Replaces only the built-in xvideos source. XNXX remains native and untouched.
const BASE = "https://www.xvideos.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CATEGORIES = [{ id: "new", name: "最新" }, { id: "best", name: "上月最佳", isRank: true }];
function str(v) { return v == null ? "" : String(v).trim(); }
function fail(code, message) { throw host.error(code, message); }
function decodeHTML(v) {
  return str(v).replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function absoluteURL(raw) {
  let u = decodeHTML(raw).replace(/\\\//g, "/").replace(/\\u0026/gi, "&").replace(/\\x26/gi, "&").trim();
  if (!u) return "";
  if (u.startsWith("//")) u = "https:" + u;
  if (u.startsWith("/")) u = BASE + u;
  return /^https?:\/\//i.test(u) ? u : "";
}
async function request(url, referer) {
  let r;
  try {
    r = await host.http.request({ url, headers: {
      "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": referer || BASE + "/"
    }, timeout: 25000 });
  } catch (e) { fail("E_NETWORK", "XVideos 请求失败：" + str(e && e.message || e)); }
  if (!r || r.status < 200 || r.status >= 300)
    fail(r && r.status === 404 ? "E_NOT_FOUND" : "E_HTTP", "XVideos HTTP " + (r ? r.status : 0));
  return { body: str(r.body), url: str(r.url) || url };
}
function monthKey() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0");
}
function categoryPath(id, page) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  if (id === "new") return p === 1 ? "/" : "/new/" + p;
  if (id === "best") { const m = monthKey(); return p === 1 ? "/best/" + m : "/best/" + m + "/" + p; }
  fail("E_PARSE", "XVideos 分类无效：" + id);
}
function cardImage(card) {
  const img = /<img\b[^>]*>/i.exec(card); if (!img) return "";
  for (const attr of ["data-src", "data-original", "src"]) {
    const m = new RegExp("\\b" + attr + '="([^"]+)"', "i").exec(img[0]);
    if (m && !/blank\.gif/i.test(m[1])) return absoluteURL(m[1]);
  }
  return "";
}
function parseList(html, page) {
  const parts = html.split("thumb-block"), seen = Object.create(null), items = [];
  for (const part of parts.slice(1)) {
    const card = part.slice(0, 5000), link = /href="(\/video[.-]([a-z0-9]+)\/[^"]*)"/i.exec(card);
    if (!link || seen[link[2]]) continue;
    const tm = /<p class="title">\s*<a[^>]*title="([^"]+)"/i.exec(card) ||
      /\balt="([^"]+)"/i.exec(card) ||
      /<a[^>]*href="\/video[.-][a-z0-9]+\/[^"]*"[^>]*\btitle="([^"]+)"/i.exec(card);
    const title = tm ? decodeHTML(tm[1]) : ""; if (!title) continue;
    const item = { id: link[2], title }, cover = cardImage(card);
    const duration = /class="duration">([^<]+)</i.exec(card);
    if (cover) { item.cover = cover; item.coverHeaders = { Referer: BASE + "/" }; }
    if (duration) item.remarks = decodeHTML(duration[1]);
    items.push(item); seen[link[2]] = true;
  }
  return { items, page: Math.max(1, Number(page) || 1), hasMore: items.length > 0 };
}
function playerCall(html, fn) {
  const prefix = "html5player\\s*\\.\\s*" + fn + "\\s*\\(\\s*";
  const patterns = [new RegExp(prefix + "'((?:\\\\.|[^'\\\\])*)'\\s*\\)"),
    new RegExp(prefix + '"((?:\\\\.|[^"\\\\])*)"\\s*\\)')];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return m[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&").replace(/\\x26/gi, "&")
      .replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return "";
}
function jsonFields(html, names) {
  const re = new RegExp("\\b(?:" + names.join("|") + ")\\s*:\\s*[\\x22\\x27]([^\\x22\\x27]+)[\\x22\\x27]", "gi");
  const out = []; let m; while ((m = re.exec(html)) !== null) out.push(m[1]); return out;
}
function extractStreams(html, pageURL) {
  const streams = [], seen = Object.create(null);
  function append(raw, name, format) {
    const url = absoluteURL(raw);
    if (!url || !/\.(?:m3u8|mp4|flv)(?:[?#]|$)/i.test(url)) return;
    const key = url.replace(/[?#].*$/, "").toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    streams.push({ name, url, format, headers: { Referer: pageURL, "User-Agent": UA } });
  }
  const hls = playerCall(html, "setVideoHLS"); if (hls) append(hls, "自动 · HLS", "hls");
  const high = playerCall(html, "setVideoUrlHigh"); if (high) append(high, "高清 MP4", "mp4");
  const low = playerCall(html, "setVideoUrlLow"); if (low) append(low, "标清 MP4", "mp4");
  const flvPatterns = [/(?:[?&])flv_url=([^&"'\s<>]+)/i, /flv_url\s*[:=]\s*'([^']*)'/i, /flv_url\s*[:=]\s*"([^"]*)"/i];
  for (const re of flvPatterns) {
    const m = re.exec(html);
    if (m) { let v = m[1].replace(/\+/g, "%20"); try { v = decodeURIComponent(v); } catch (e) {} append(v, "MP4 备用", "mp4"); break; }
  }
  for (const v of jsonFields(html, ["hls", "video_hls", "hls_url", "hlsUrl"])) append(v, "自动 · HLS", "hls");
  for (const v of jsonFields(html, ["flv_url", "video_url", "videoUrl", "urlHigh", "urlLow", "contentUrl"])) append(v, "MP4 备用", "mp4");
  const normalized = html.replace(/\\\//g, "/"), rawRe = /(?:https?:)?\/\/[^"'\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/gi;
  let m;
  while ((m = rawRe.exec(normalized)) !== null) {
    const isHLS = /\.m3u8(?:[?#]|$)/i.test(m[0]);
    append(m[0], isHLS ? "自动 · HLS" : "MP4 备用", isHLS ? "hls" : "mp4");
  }
  return streams;
}
async function watch(id) {
  if (!/^[a-z0-9]+$/i.test(str(id))) fail("E_PARSE", "XVideos 视频 ID 无效");
  return request(BASE + "/video." + encodeURIComponent(id) + "/", BASE + "/");
}
function durationFromHTML(html) {
  const m = /"duration"\s*:\s*"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/i.exec(html);
  if (!m) return "";
  const total = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  if (!total) return "";
  const h = Math.floor(total / 3600), min = Math.floor(total % 3600 / 60), sec = total % 60;
  return h ? [h, min, sec].map(v => String(v).padStart(2, "0")).join(":") :
    [min, sec].map(v => String(v).padStart(2, "0")).join(":");
}
async function getDetail(id) {
  const r = await watch(id), html = r.body;
  const title = decodeHTML(playerCall(html, "setVideoTitle")) ||
    decodeHTML((/<meta property="og:title" content="([^"]+)"/i.exec(html) || [])[1] || "");
  if (!title) fail("E_PARSE", "XVideos 未返回视频标题");
  const cover = absoluteURL(playerCall(html, "setThumbUrl169")) ||
    absoluteURL((/<meta property="og:image" content="([^"]+)"/i.exec(html) || [])[1] || "");
  const tags = [], re = /<a[^>]*class="[^"]*is-keyword[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let m; while ((m = re.exec(html)) !== null && tags.length < 16) tags.push(decodeHTML(m[1]));
  const out = { title, desc: "", lines: [{ name: "默认线路", episodes: [{ id: str(id), name: durationFromHTML(html) || "播放" }] }] };
  if (cover) { out.cover = cover; out.coverHeaders = { Referer: r.url }; }
  if (tags.length) out.tags = tags;
  return out;
}
export default {
  async home() { return { categories: CATEGORIES }; },
  async category({ id = "new", page = 1 }) {
    const p = Math.max(1, Math.floor(Number(page) || 1));
    const r = await request(BASE + categoryPath(str(id) || "new", p), BASE + "/");
    const result = parseList(r.body, p);
    if (!result.items.length) fail("E_PARSE", "XVideos 列表没有解析到视频，请稍后重试");
    return result;
  },
  async search({ keyword, page = 1 }) {
    const q = str(keyword); if (!q) return { items: [], page: 1, hasMore: false };
    const p = Math.max(1, Math.floor(Number(page) || 1));
    const r = await request(BASE + "/?k=" + encodeURIComponent(q) + (p > 1 ? "&p=" + p : ""), BASE + "/");
    return parseList(r.body, p);
  },
  async detail({ id }) { return getDetail(id); },
  async play({ episodeId, id }) {
    const r = await watch(str(episodeId || id)), streams = extractStreams(r.body, r.url);
    if (!streams.length) fail("E_PARSE", "XVideos 页面没有找到 HLS 或 MP4 播放地址");
    return { streams };
  }
};
