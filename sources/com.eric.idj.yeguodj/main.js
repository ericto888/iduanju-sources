// 野果短剧（yeguodj.com）· iDuanJu idj1 短剧插件
// 站点使用 /drama/detail/<id>/ 详情页与 /drama/video/<id>/ 播放页。
const ORIGIN = 'https://yeguodj.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const CATEGORIES = [
  { id: 'rec-sweet-romance', name: '野果原创短剧' },
  { id: 'rec-hot-drama', name: '热门精选短剧' },
  { id: 'rec-urban-emotion', name: '都市情感剧场' },
  { id: 'rec-rebirth-rise', name: '逆袭重生佳作' },
  { id: 'rec-costume-travel', name: '古装穿越精选' },
  { id: 'rec-campus-youth', name: '校园青春故事' },
  { id: 'rec-pmv-variety', name: 'PMV综艺合集' }
];

function clean(v) { return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim(); }
function absolute(v, base) {
  let s = clean(v).replace(/&amp;/g, '&').replace(/\\\\\\//g, '/');
  if (!s) return '';
  if (s.indexOf('//') === 0) return 'https:' + s;
  if (/^https?:\\/\\//i.test(s)) return s;
  if (s.charAt(0) === '/') return (base || ORIGIN) + s;
  return '';
}
function requestUrl(url, referer) {
  return host.http.request({
    url: url,
    headers: {
      'User-Agent': UA,
      'Referer': referer || ORIGIN + '/',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    timeout: 15000
  }).then(function (res) {
    if (!res || res.status < 200 || res.status >= 300) {
      throw host.error(res && res.status === 404 ? 'E_NOT_FOUND' : 'E_HTTP',
        '野果短剧请求失败：HTTP ' + (res ? res.status : 0));
    }
    return { body: String(res.body || ''), url: res.url || url };
  });
}
function parseDoc(body, url) { return host.html.parse(body, url); }
function text(node) { return node ? clean(node.text()) : ''; }
function attr(node, key) { return node ? clean(node.attr(key)) : ''; }

function pageItems(body, base) {
  const doc = parseDoc(body, base);
  const links = doc.select('a[href*="/drama/detail/"]');
  const out = [], seen = {};
  for (let i = 0; i < links.length; i++) {
    const a = links[i];
    const href = attr(a, 'href');
    const m = /\\/drama\\/detail\\/(\\d+)\\/?/.exec(href);
    if (!m || seen[m[1]]) continue;
    const img = a.selectFirst('img');
    const title = clean(attr(img, 'alt') || attr(a, 'title') || text(a));
    if (!title) continue;
    seen[m[1]] = true;
    const cover = absolute(attr(img, 'data-src') || attr(img, 'data-original') || attr(img, 'src'), base);
    const item = { id: m[1], title: title };
    if (cover) item.cover = cover;
    out.push(item);
  }
  return out;
}
function hasNext(body, page) {
  const html = String(body || '');
  if (/rel=["']next["']|下一页|下页|Next/i.test(html)) return true;
  const re = new RegExp('/page/' + (page + 1) + '/');
  return re.test(html);
}
function categoryPath(id, page) {
  let key = clean(id);
  for (let i = 0; i < CATEGORIES.length; i++) {
    if (key === CATEGORIES[i].name) key = CATEGORIES[i].id;
  }
  if (!/^[a-z0-9-]+$/.test(key)) return '';
  return '/drama/' + key + (page > 1 ? '/page/' + page + '/' : '/');
}
function episodeIdFromHref(href) {
  const m = /\\/drama\\/video\\/(\\d+)\\/?/.exec(String(href || ''));
  return m ? m[1] : '';
}
function mediaFromHtml(html) {
  const source = String(html || '').replace(/\\\\\\//g, '/').replace(/&amp;/g, '&');
  const patterns = [
    /<source[^>]+src=["']([^"']+)["']/ig,
    /<video[^>]+src=["']([^"']+)["']/ig,
    /(?:url|src|play_url|playUrl|video_url|videoUrl)\\s*[:=]\\s*["'](https?:\\/\\/[^"'\\s]+)["']/ig
  ];
  for (let p = 0; p < patterns.length; p++) {
    let m;
    while ((m = patterns[p].exec(source)) !== null) {
      const u = absolute(m[1], ORIGIN);
      if (/\\.(m3u8|mp4)(?:[?#]|$)/i.test(u)) return u;
    }
  }
  const direct = /https?:\\/\\/[^"'\\s<>]+\\.(?:m3u8|mp4)(?:\\?[^"'\\s<>]*)?/i.exec(source);
  return direct ? direct[0].replace(/&amp;/g, '&') : '';
}
function iframeFromHtml(html, base) {
  const m = /<iframe[^>]+src=["']([^"']+)["']/i.exec(String(html || ''));
  return m ? absolute(m[1], base) : '';
}
function titleFromDoc(doc, fallback) {
  return text(doc.selectFirst('h1')) || text(doc.selectFirst('.entry-title')) ||
    text(doc.selectFirst('.video-title')) || clean(fallback);
}

export default {
  async home() {
    const res = await requestUrl(ORIGIN + '/');
    const doc = parseDoc(res.body, res.url);
    const items = pageItems(res.body, res.url).slice(0, 5);
    // 首页真实栏目来自网站的“查看更多”入口；不伪造“最新”等不存在的栏目。
    const categories = CATEGORIES.filter(function (c) { return !!doc.selectFirst('a[href*="/drama/' + c.id + '/"]'); });
    return { categories: categories.length ? categories : CATEGORIES, items: items };
  },

  async category({ id, page = 1 }) {
    const p = Math.max(1, Number(page) || 1);
    const path = categoryPath(id, p);
    if (!path) throw host.error('E_NOT_FOUND', '未知的野果短剧分类');
    const res = await requestUrl(ORIGIN + path);
    const items = pageItems(res.body, res.url);
    return { items: items, page: p, hasMore: items.length > 0 && hasNext(res.body, p) };
  },

  async search({ keyword, page = 1 }) {
    const q = clean(keyword);
    const p = Math.max(1, Number(page) || 1);
    if (!q) return { items: [], page: p, hasMore: false };
    const encoded = encodeURIComponent(q);
    const candidates = [
      ORIGIN + '/search/?q=' + encoded + (p > 1 ? '&page=' + p : ''),
      ORIGIN + '/search/?keyword=' + encoded + (p > 1 ? '&page=' + p : ''),
      ORIGIN + '/?s=' + encoded + (p > 1 ? '&paged=' + p : '')
    ];
    let lastError = null;
    for (let i = 0; i < candidates.length; i++) {
      try {
        const res = await requestUrl(candidates[i]);
        const items = pageItems(res.body, res.url);
        if (items.length) return { items: items, page: p, hasMore: hasNext(res.body, p) };
      } catch (e) { lastError = e; }
    }
    if (lastError) throw lastError;
    throw host.error('E_NOT_FOUND', '野果短剧没有找到匹配内容，或搜索地址已变化');
  },

  async detail({ id }) {
    const vid = clean(id);
    if (!/^\\d+$/.test(vid)) throw host.error('E_NOT_FOUND', '无效的野果剧集 ID');
    const res = await requestUrl(ORIGIN + '/drama/detail/' + vid + '/');
    const doc = parseDoc(res.body, res.url);
    const title = titleFromDoc(doc, '野果短剧 ' + vid);
    const desc = text(doc.selectFirst('.description')) || text(doc.selectFirst('.entry-content')) || '';
    const links = doc.select('a[href*="/drama/video/"]');
    const episodes = [], seen = {};
    for (let i = 0; i < links.length; i++) {
      const epId = episodeIdFromHref(attr(links[i], 'href'));
      if (!epId || seen[epId]) continue;
      seen[epId] = true;
      episodes.push({ id: epId, name: text(links[i]) || ('第' + (episodes.length + 1) + '集') });
    }
    if (!episodes.length) episodes.push({ id: vid, name: '正片' });
    const img = doc.selectFirst('meta[property="og:image"]');
    const cover = absolute(attr(img, 'content'), res.url);
    const result = { title: title, desc: desc, lines: [{ name: '默认线路', episodes: episodes }] };
    if (cover) result.cover = cover;
    return result;
  },

  async play({ episodeId }) {
    const ep = clean(episodeId);
    if (!/^\\d+$/.test(ep)) throw host.error('E_PARSE', '无效的野果剧集播放 ID');
    const url = ORIGIN + '/drama/video/' + ep + '/';
    const res = await requestUrl(url, ORIGIN + '/');
    let media = mediaFromHtml(res.body);
    if (!media) {
      const iframe = iframeFromHtml(res.body, res.url);
      if (iframe) {
        const embedded = await requestUrl(iframe, res.url);
        media = mediaFromHtml(embedded.body);
      }
    }
    if (!media) throw host.error('E_PARSE', '播放页未提取到 m3u8/MP4 地址；请检查站点播放器是否已改版');
    return { streams: [{ name: '默认线路', url: media, format: /\\.m3u8(?:[?#]|$)/i.test(media) ? 'hls' : 'mp4', headers: { Referer: res.url } }] };
  }
};
