// 黄瓜短剧 AI 站（hgaihub.com）· iDuanJu idj1 短剧插件
// 首页/分类/搜索/详情均为服务端渲染 HTML；详情与播放数据在 #videoInitialData 的 JSON 里。
// 每一集有独立地址 /video/<id>/ep-<n>/，播放时现取，避免使用过期的签名地址。
const ORIGIN = 'https://hgaihub.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// 站点的封面在 CDN 上是 AES 加密的，网页端由 crypto-worker.js 解密；
// 同品牌的 hgdju.com 提供 /_img/<base64url路径>.<ext> 服务端解密代理，App 直接用该地址加载封面。
const IMAGE_PROXY = 'https://hgdju.com/_img/';
// 图片代理只接受去 padding 的标准 Base64。
const PROXY_HOST_RE = /(^|\.)mmgbaa\.cn$/i;

const CATEGORIES = [
  { id: 'newest', name: '最新上新' },
  { id: 'recommend', name: '精选推荐' },
  { id: 'yuanchuang', name: '黄瓜原创' },
  { id: 'duanju', name: 'AI短剧' },
  { id: 'manju', name: 'AI漫剧' },
  { id: 'tag:dushi', name: '都市' },
  { id: 'tag:shunv', name: '熟女' },
  { id: 'tag:luanlun', name: '乱伦' },
  { id: 'tag:lvmao', name: '绿帽' },
  { id: 'tag:nixi', name: '逆袭' }
];

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function textOf(node) {
  return node ? clean(node.text()) : '';
}

function attrOf(node, name) {
  return node ? clean(node.attr(name)) : '';
}

function absolute(url) {
  const u = clean(url);
  if (!u) return '';
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (/^https?:\/\//i.test(u)) return u.replace(/^http:\/\//i, 'https://');
  if (u.charAt(0) === '/') return ORIGIN + u;
  return '';
}

function base64Raw(value) {
  return host.codec.base64Encode(value, { from: 'utf8' }).replace(/=+$/, '');
}

function imageURL(raw) {
  const u = absolute(raw);
  if (!u) return '';
  const hostMatch = /^https?:\/\/([^/]+)/i.exec(u);
  const host = hostMatch ? hostMatch[1] : '';
  if (!PROXY_HOST_RE.test(host)) return u;
  let ext = (u.split(/[?#]/)[0].split('.').pop() || '').toLowerCase();
  if (!/^(jpeg|jpg|png|webp)$/.test(ext)) ext = 'jpg';
  return IMAGE_PROXY + base64Raw(u) + '.' + ext;
}

function coverOf(img) {
  if (!img) return '';
  const raw = attrOf(img, 'data-src') || attrOf(img, 'src');
  if (!raw || /cover-placeholder/.test(raw)) return '';
  return imageURL(raw);
}

function remarksOf(node) {
  const m = /(更新至\s*\d+\s*集|全\s*\d+\s*集)/.exec(textOf(node));
  return m ? m[1].replace(/\s+/g, '') : '';
}

async function get(path) {
  const url = path.indexOf('http') === 0 ? path : ORIGIN + path;
  const res = await host.http.request({
    url: url,
    headers: {
      'User-Agent': USER_AGENT,
      Referer: ORIGIN + '/',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    timeout: 20000
  });
  if (!res || res.status < 200 || res.status >= 300) {
    throw host.error(res && res.status === 404 ? 'E_NOT_FOUND' : 'E_HTTP',
      '黄瓜短剧 AI 站返回 HTTP ' + (res ? res.status : 0));
  }
  return { body: String(res.body || ''), url: res.url || url };
}

function docOf(res) {
  return host.html.parse(res.body, res.url);
}

function hasNext(body) {
  return /<link[^>]*\brel=["']next["']/i.test(body || '');
}

/** 解析剧集卡片（首页精选/最新、列表页、搜索结果）。 */
function parseDramaCards(doc, selector) {
  const items = [];
  const seen = {};
  const cards = doc.select(selector);
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const a = card.selectFirst('a.hg-drama-card__cover-link') || card.selectFirst('a[href*="/video/"]');
    if (!a) continue;
    const m = /\/video\/(\d+)/.exec(attrOf(a, 'href'));
    if (!m || seen[m[1]]) continue;
    const img = a.selectFirst('img') || card.selectFirst('img');
    const title = clean(attrOf(img, 'alt') || textOf(card.selectFirst('.hg-drama-card__title')) || textOf(card.selectFirst('h3')));
    if (!title) continue;
    seen[m[1]] = 1;
    const item = { id: m[1], title: title };
    const cover = coverOf(img);
    if (cover) item.cover = cover;
    const remarks = remarksOf(card.selectFirst('.hg-drama-card__episode'));
    if (remarks) item.remarks = remarks;
    items.push(item);
  }
  return items;
}

/** 解析首页「分类推荐」里的紧凑条目。 */
function parseCategoryTiles(doc, selector) {
  const items = [];
  const seen = {};
  const nodes = doc.select(selector);
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const m = /\/video\/(\d+)/.exec(attrOf(a, 'href'));
    if (!m || seen[m[1]]) continue;
    const img = a.selectFirst('img');
    const title = clean(attrOf(img, 'alt') || textOf(a.selectFirst('.hg-category-item__title')));
    if (!title) continue;
    seen[m[1]] = 1;
    const item = { id: m[1], title: title };
    const cover = coverOf(img);
    if (cover) item.cover = cover;
    items.push(item);
  }
  return items;
}

function categoryPath(id, page) {
  const key = clean(id);
  const suffix = page > 1 ? String(page) + '/' : '';
  if (key === 'newest') return page > 1 ? '/newest/' + page + '/' : '/newest';
  if (key === 'recommend') return page > 1 ? '' : '/recommend';
  if (key === 'yuanchuang') return '/ai-yuanchuang/' + suffix;
  if (key === 'duanju') return '/ai-duanju/' + suffix;
  if (key === 'manju') return '/ai-manju/' + suffix;
  if (key.indexOf('tag:') === 0) {
    const slug = key.slice(4);
    if (!/^[a-z0-9-]+$/.test(slug)) return '';
    return page > 1 ? '/tag/' + slug + '/page/' + page + '/' : '/tag/' + slug + '/';
  }
  return '';
}

function searchPath(keyword, page) {
  const q = encodeURIComponent(keyword);
  return page > 1 ? '/search/video/' + q + '/' + page + '/' : '/search/?q=' + q;
}

function initialData(body) {
  const m = /<script[^>]*id=["']videoInitialData["'][^>]*>([\s\S]*?)<\/script>/i.exec(body || '');
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

function episodeTotal(data, body) {
  let total = 0;
  function consider(key) {
    const n = parseInt(key, 10);
    if (n > total) total = n;
  }
  if (data && data.trackingEpisodes) for (const k in data.trackingEpisodes) consider(k);
  if (data && data.epPlaySrcs) for (const k in data.epPlaySrcs) consider(k);
  if (!total) {
    const m = /data-track-total-episode=["'](\d+)["']/i.exec(body || '');
    if (m) total = parseInt(m[1], 10) || 0;
  }
  if (!total && data) total = parseInt(data.total, 10) || 0;
  return Math.max(1, Math.min(9999, total));
}

export default {
  async home() {
    const res = await get('/');
    const doc = docOf(res);
    let items = parseDramaCards(doc, 'section.hg-section--featured div.hg-drama-card, section.hg-section--newest div.hg-drama-card');
    if (!items.length) items = parseCategoryTiles(doc, 'section.hg-section--categories a.hg-category-item');
    return { categories: CATEGORIES, items: items };
  },

  async category({ id, page }) {
    const p = Math.max(1, Number(page) || 1);
    const path = categoryPath(id, p);
    if (!path) return { items: [], page: p, hasMore: false };
    const res = await get(path);
    const doc = docOf(res);
    // 频道页有多个隐藏的 tab 网格，只取当前激活的那一个。
    let items = parseDramaCards(doc, 'section.hg-list-page div.hg-card-grid.is-active div.hg-drama-card');
    if (!items.length) items = parseDramaCards(doc, 'section.hg-list-page div.hg-card-grid div.hg-drama-card');
    return { items: items, page: p, hasMore: items.length > 0 && hasNext(res.body) };
  },

  async search({ keyword, page }) {
    const q = clean(keyword);
    const p = Math.max(1, Number(page) || 1);
    if (!q) return { items: [], page: p, hasMore: false };
    const res = await get(searchPath(q, p));
    const doc = docOf(res);
    // 只取搜索结果区，排除页面顶部的搜索联想和底部「猜你喜欢」。
    const items = parseDramaCards(doc, 'div.hg-search-results div.hg-drama-card');
    return { items: items, page: p, hasMore: items.length > 0 && hasNext(res.body) };
  },

  async detail({ id }) {
    const vid = clean(id);
    if (!/^\d+$/.test(vid)) throw host.error('E_NOT_FOUND', '无效的剧集 id');
    const res = await get('/video/' + vid + '/');
    const data = initialData(res.body);
    if (!data) throw host.error('E_PARSE', '详情页数据解析失败，站点结构可能已更新');
    const total = episodeTotal(data, res.body);
    const episodes = [];
    for (let n = 1; n <= total; n++) episodes.push({ id: vid + ':' + n, name: '第' + n + '集' });
    const tags = [];
    if (Array.isArray(data.tags)) {
      for (let i = 0; i < data.tags.length; i++) {
        const t = clean(data.tags[i]);
        if (t) tags.push(t);
      }
    }
    return {
      title: clean(data.title) || ('短剧 ' + vid),
      cover: imageURL(data.coverSrc || data.posterSrc),
      desc: clean(data.description),
      tags: tags,
      lines: [{ name: '默认线路', episodes: episodes }]
    };
  },

  async play({ episodeId }) {
    const parts = clean(episodeId).split(':');
    const vid = parts[0];
    const ep = Math.max(1, parseInt(parts[1], 10) || 1);
    if (!/^\d+$/.test(vid)) throw host.error('E_PARSE', '无效的剧集 id');
    const res = await get(ep === 1 ? '/video/' + vid + '/' : '/video/' + vid + '/ep-' + ep + '/');
    const data = initialData(res.body);
    let url = data ? absolute(data.videoSrc) : '';
    if (!url && data && data.epPlaySrcs) url = absolute(data.epPlaySrcs[String(ep)]);
    if (!url) throw host.error('E_PARSE', '没有解析到播放地址，站点结构可能已更新');
    return {
      streams: [{
        name: '高清',
        url: url,
        format: /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : 'mp4',
        headers: { Referer: ORIGIN + '/', 'User-Agent': USER_AGENT }
      }]
    };
  }
};
