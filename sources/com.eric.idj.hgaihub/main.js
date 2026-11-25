// 黄瓜短剧 AI 站（hgaihub.com）· iDuanJu idj1 短剧插件
// 首页/分类/搜索/详情均为服务端渲染 HTML；详情与播放数据在 #videoInitialData 的 JSON 里。
// 每一集有独立地址 /video/<id>/ep-<n>/，播放时现取，避免使用过期的签名地址。
const ORIGIN = 'https://hgaihub.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 开梯子优先主站；不开梯子时自动切到国内分发入口。成功入住的入口记在插件私有存储里。
const HOSTS = [
  'https://hgaihub.com',
  'https://aaa.hzeqbmes.cc',
  'https://bbb.hzeqbmes.cc',
  'https://96ac.hzeqbmes.cc',
  'https://porncz.hzeqbmes.cc',
  'https://rixgqa.hzeqbmes.cc',
  'https://mkqjue.hzeqbmes.cc',
  'https://jsjs.ycwzusvz.cc',
  'https://d21afzrkgm7yqk.cloudfront.net'
];
// 地址发布页：主站 go-home、hgdja4 导航页，以及国内镜像自带的 go-home。
const RELEASE_PAGES = [
  'https://hgaihub.com/go-home/',
  'https://hgdja4.com/',
  'https://hgdja4.com/go-home/',
  'https://aaa.hzeqbmes.cc/go-home/',
  'https://jsjs.ycwzusvz.cc/go-home/'
];
const HOST_KEY = 'host';
const DISCOVERED_KEY = 'discovered';
// 发布页里这些是跳转/统计/图床/旧站域名，不能当站点入口。
const EXCLUDED_HOST_RE = /(^|\.)(gmail\.com|x\.com|gitlab\.com|googletagmanager\.com|telegram\.org|t\.me|mmgbaa\.cn|hgdju\.com|hgdja[0-9]*\.com|0v2zng-t1t1\.icu)$/i;

const CATEGORIES = [
  { id: 'newest', name: '最新上新' },
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

// 站点的封面在 CDN 上是加密的；share 接口返回服务端解密后的普通图片，且不依赖 hgdju 是否有该剧。
function coverFor(base, id) {
  return base + '/share/video/' + id + '/cover';
}

function remarksOf(node) {
  const m = /(更新至\s*\d+\s*集|全\s*\d+\s*集)/.exec(textOf(node));
  return m ? m[1].replace(/\s+/g, '') : '';
}

function isSitePage(body) {
  // 正常页面一定有剧集卡片或详情数据；发布页/拦截页没有。
  return /hg-drama-card|videoInitialData/.test(String(body || ''));
}

/** 记住的入口 + 发布页发现的新入口 + 内置入口，去重后依次尝试。 */
function candidateHosts() {
  const out = [];
  function push(value) {
    const base = clean(value).replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(base) || out.indexOf(base) !== -1) return;
    out.push(base);
  }
  push(host.storage.get(HOST_KEY));
  const discovered = host.storage.get(DISCOVERED_KEY);
  if (Array.isArray(discovered)) for (let i = 0; i < discovered.length; i++) push(discovered[i]);
  for (let i = 0; i < HOSTS.length; i++) push(HOSTS[i]);
  return out;
}

async function requestPage(base, path, timeout) {
  const url = path.indexOf('http') === 0 ? path : base + path;
  const res = await host.http.request({
    url: url,
    headers: {
      'User-Agent': USER_AGENT,
      Referer: base + '/',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    timeout: timeout || 12000
  });
  if (!res || res.status < 200 || res.status >= 300) {
    throw host.error(res && res.status === 404 ? 'E_NOT_FOUND' : 'E_HTTP',
      '入口 ' + base + ' 返回 HTTP ' + (res ? res.status : 0));
  }
  const body = String(res.body || '');
  if (!isSitePage(body)) throw host.error('E_PARSE', base + ' 不是可用的站点页面');
  return { body: body, url: res.url || url, base: base };
}

/** 从发布页 HTML 里收集声明过权限的站点域名。 */
function collectHosts(body, found) {
  const re = /https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#][^\s"'<>\\]*)?/gi;
  let m;
  while ((m = re.exec(String(body || ''))) !== null) {
    const dm = /^https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i.exec(m[0].replace(/\\\//g, '/'));
    if (!dm) continue;
    const name = dm[1].toLowerCase();
    const base = 'https://' + name;
    if (EXCLUDED_HOST_RE.test(name) || found.indexOf(base) !== -1) continue;
    if (!host.http.allowed(base + '/')) continue;
    found.push(base);
  }
  return found;
}

async function discoverHosts() {
  const found = [];
  for (let i = 0; i < RELEASE_PAGES.length; i++) {
    try {
      const res = await host.http.request({
        url: RELEASE_PAGES[i],
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        timeout: 8000
      });
      if (res && res.status >= 200 && res.status < 300) collectHosts(res.body, found);
    } catch (e) {
      host.log('发布页不可用：' + RELEASE_PAGES[i]);
    }
  }
  const prior = host.storage.get(DISCOVERED_KEY);
  if (Array.isArray(prior)) {
    for (let i = 0; i < prior.length; i++) {
      const base = clean(prior[i]).replace(/\/+$/, '');
      if (/^https:\/\//i.test(base) && found.indexOf(base) === -1 && host.http.allowed(base + '/')) found.push(base);
    }
  }
  if (found.length) host.storage.set(DISCOVERED_KEY, found);
  return found;
}

/** 依次尝试各入口；全部失败时重新读发布页，再试一轮。 */
async function fetchPage(path) {
  let lastErr = null;
  const tried = {};
  async function tryHosts(list, timeout) {
    for (let i = 0; i < list.length; i++) {
      const base = list[i];
      if (tried[base]) continue;
      tried[base] = 1;
      try {
        const r = await requestPage(base, path, timeout);
        host.storage.set(HOST_KEY, base);
        return r;
      } catch (e) {
        if (e && e.code === 'E_NOT_FOUND') throw e;
        lastErr = e;
        host.log('入口不可用：' + base + ' ' + (e && e.code ? e.code : ''));
      }
    }
    return null;
  }
  const hasStored = !!clean(host.storage.get(HOST_KEY));
  let r = await tryHosts(candidateHosts(), hasStored ? 8000 : 6000);
  if (!r) r = await tryHosts(await discoverHosts(), 12000);
  if (r) return r;
  throw lastErr || host.error('E_NETWORK', '黄瓜短剧 AI 站所有入口都不可用');
}

function docOf(res) {
  return host.html.parse(res.body, res.url);
}

function hasNext(body) {
  return /<link[^>]*\brel=["']next["']/i.test(body || '');
}

/** 解析剧集卡片（首页精选/最新、列表页、搜索结果）。 */
function parseDramaCards(doc, selector, base) {
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
    const item = { id: m[1], title: title, cover: coverFor(base, m[1]) };
    const remarks = remarksOf(card.selectFirst('.hg-drama-card__episode'));
    if (remarks) item.remarks = remarks;
    items.push(item);
  }
  return items;
}

/** 解析首页「分类推荐」里的紧凑条目。 */
function parseCategoryTiles(doc, selector, base) {
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
    items.push({ id: m[1], title: title, cover: coverFor(base, m[1]) });
  }
  return items;
}

function categoryPath(id, page) {
  const key = clean(id);
  const suffix = page > 1 ? String(page) + '/' : '';
  if (key === 'newest') return page > 1 ? '/newest/' + page + '/' : '/newest';
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

/** 详情页「上线日期 / 出品 / 更新状态 / 播放次数 / 单集片长 / 题材类型」信息条。 */
function parseFacts(doc) {
  const out = [];
  const nodes = doc.select('.hg-web-play__fact');
  for (let i = 0; i < nodes.length && out.length < 8; i++) {
    const label = textOf(nodes[i].selectFirst('b'));
    // 出品一栏的 span 里还带着「+关注」按钮文案，去掉。
    const value = textOf(nodes[i].selectFirst('span')).replace(/\s*\+?\s*关注\s*$/, '').trim();
    if (!label || !value) continue;
    out.push({ label: label, value: value });
  }
  return out;
}

function epochOf(text) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
  if (!m) return 0;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000);
}

/** 把信息条压成 3 行放在简介开头（App 详情页直接展示 desc，不需要改主程序）。 */
function withFacts(facts, desc) {
  if (!facts.length) return desc;
  const parts = [];
  for (let i = 0; i < facts.length && parts.length < 6; i++) parts.push(facts[i].label + '：' + facts[i].value);
  const lines = [];
  for (let i = 0; i < parts.length; i += 2) lines.push(parts.slice(i, i + 2).join(' ｜ '));
  return lines.join('\n') + (desc ? '\n\n' + desc : '');
}

export default {
  async home() {
    const res = await fetchPage('/');
    const doc = docOf(res);
    let items = parseDramaCards(doc, 'section.hg-section--featured div.hg-drama-card, section.hg-section--newest div.hg-drama-card', res.base);
    if (!items.length) items = parseCategoryTiles(doc, 'section.hg-section--categories a.hg-category-item', res.base);
    return { categories: CATEGORIES, items: items };
  },

  async category({ id, page }) {
    const p = Math.max(1, Number(page) || 1);
    const path = categoryPath(id, p);
    if (!path) return { items: [], page: p, hasMore: false };
    const res = await fetchPage(path);
    const doc = docOf(res);
    // 频道页有多个隐藏的 tab 网格，只取当前激活的那一个。
    let items = parseDramaCards(doc, 'section.hg-list-page div.hg-card-grid.is-active div.hg-drama-card', res.base);
    if (!items.length) items = parseDramaCards(doc, 'section.hg-list-page div.hg-card-grid div.hg-drama-card', res.base);
    return { items: items, page: p, hasMore: items.length > 0 && hasNext(res.body) };
  },

  async search({ keyword, page }) {
    const q = clean(keyword);
    const p = Math.max(1, Number(page) || 1);
    if (!q) return { items: [], page: p, hasMore: false };
    const res = await fetchPage(searchPath(q, p));
    const doc = docOf(res);
    // 只取搜索结果区，排除页面顶部的搜索联想和底部「猜你喜欢」。
    const items = parseDramaCards(doc, 'div.hg-search-results div.hg-drama-card', res.base);
    return { items: items, page: p, hasMore: items.length > 0 && hasNext(res.body) };
  },

  async detail({ id }) {
    const vid = clean(id);
    if (!/^\d+$/.test(vid)) throw host.error('E_NOT_FOUND', '无效的剧集 id');
    const res = await fetchPage('/video/' + vid + '/');
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
    const facts = parseFacts(docOf(res));
    let onlineTime = 0;
    for (let i = 0; i < facts.length; i++) {
      if (facts[i].label === '上线日期') onlineTime = epochOf(facts[i].value);
    }
    return {
      title: clean(data.title) || ('短剧 ' + vid),
      cover: coverFor(res.base, vid),
      desc: withFacts(facts, clean(data.description)),
      tags: tags,
      onlineTime: onlineTime,
      facts: facts,
      lines: [{ name: '默认线路', episodes: episodes }]
    };
  },

  async play({ episodeId }) {
    const parts = clean(episodeId).split(':');
    const vid = parts[0];
    const ep = Math.max(1, parseInt(parts[1], 10) || 1);
    if (!/^\d+$/.test(vid)) throw host.error('E_PARSE', '无效的剧集 id');
    const res = await fetchPage(ep === 1 ? '/video/' + vid + '/' : '/video/' + vid + '/ep-' + ep + '/');
    const data = initialData(res.body);
    let url = data ? absolute(data.videoSrc) : '';
    if (!url && data && data.epPlaySrcs) url = absolute(data.epPlaySrcs[String(ep)]);
    if (!url) throw host.error('E_PARSE', '没有解析到播放地址，站点结构可能已更新');
    return {
      streams: [{
        name: '高清',
        url: url,
        format: /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : 'mp4',
        headers: { Referer: res.base + '/', 'User-Agent': USER_AGENT }
      }]
    };
  }
};
