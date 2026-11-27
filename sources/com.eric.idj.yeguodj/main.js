// 野果短剧（yeguodj.com）· iDuanJu idj1 短剧插件
// 站点使用 /drama/detail/<id>/ 详情页与 /drama/video/<id>/ 播放页。
const ORIGIN = 'https://yeguodj.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const CATEGORIES = [
  { id: 'rec-sweet-romance', name: '野果原创短剧' },
  { id: 'rec-hot-drama', name: '热门精选短剧' },
  { id: 'rec-urban-emotion', name: '都市情感剧场' },
  { id: 'rec-rebirth-rise', name: '逆袭重生佳作' },
  { id: 'rec-ancient-travel', name: '古装穿越精选' },
  { id: 'rec-campus-youth', name: '校园青春故事' },
  { id: 'rec-pmv-variety', name: 'PMV综艺合集' }
];

function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function absolute(v, base) {
  let s = clean(v).replace(/&amp;/g, '&').replace(/\\\//g, '/');
  if (!s) return '';
  if (s.indexOf('//') === 0) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.charAt(0) === '/') { const root = /^https?:\/\/[^/]+/i.exec(base || ORIGIN); return (root ? root[0] : ORIGIN) + s; }
  return '';
}
function requestUrl(url, referer, attempt) {
  const retry = Number(attempt) || 0;
  return host.http.request({
    url: url,
    headers: {
      'User-Agent': UA,
      'Referer': referer || ORIGIN + '/',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    timeout: 20000
  }).then(function (res) {
    if (!res || res.status < 200 || res.status >= 300) {
      throw host.error(res && res.status === 404 ? 'E_NOT_FOUND' : 'E_HTTP',
        '野果短剧请求失败：HTTP ' + (res ? res.status : 0));
    }
    return { body: String(res.body || ''), url: res.url || url };
  }).catch(function (err) {
    const message = clean(err && (err.message || err));
    const networkFailure = /无法连接服务器|网络错误|network|timeout|timed out|连接失败/i.test(message);
    if (networkFailure && retry < 1) {
      return requestUrl(url, referer, retry + 1);
    }
    throw err;
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
    const m = /\/drama\/detail\/(\d+)\/?/.exec(href);
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
  return new RegExp('/page/' + (page + 1) + '/').test(html);
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
  const m = /\/drama\/video\/(\d+)\/?/.exec(String(href || ''));
  return m ? m[1] : '';
}
function mediaFromHtml(html) {
  const source = String(html || '').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const patterns = [
    /<source[^>]+src=["']([^"']+)["']/ig,
    /<video[^>]+src=["']([^"']+)["']/ig,
    /(?:url|src|play_url|playUrl|video_url|videoUrl)\s*[:=]\s*["'](https?:\/\/[^"'\s]+)["']/ig
  ];
  for (let p = 0; p < patterns.length; p++) {
    let m;
    while ((m = patterns[p].exec(source)) !== null) {
      const u = absolute(m[1], ORIGIN);
      if (/\.(m3u8|mp4)(?:[?#]|$)/i.test(u)) return u;
    }
  }
  const direct = /https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/i.exec(source);
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


// 野果新版 API：详情/分集/播放均使用站点官方接口，避免 HTML 页面只暴露首集。
let yeguoAccessCache = null;
const YEGUO_CONFIG_TTL = 45 * 60 * 1000;

function apiUrl(base, path) { return base.replace(/\/+$/, '') + path; }
function apiPublicBytes(value) {
  const s = clean(value);
  if (s.indexOf('_') < 0) return { value: s, encoding: 'utf8' };
  const bytes = s.split('_').map(function (n) { return Number(n); });
  if (!bytes.length || bytes.some(function (n) { return !Number.isInteger(n) || n < 0 || n > 255; })) return null;
  return { value: bytes.map(function (n) { return String.fromCharCode(n); }).join(''), encoding: 'latin1' };
}
function yeguoApiBaseFromScript(script, origin) {
  const calls = /baseURL:([a-zA-Z_$][a-zA-Z0-9_$]*)\([a-zA-Z_$]?[a-zA-Z0-9_$]*\)/g;
  let call;
  while ((call = calls.exec(script)) !== null) {
    const name = call[1];
    const literal = new RegExp('(?:^|[^a-zA-Z0-9_$.])' + name + '=\\(\\)=>["\x60](https?://[^"\x60\\s]{1,512})["\x60]');
    const found = literal.exec(script);
    if (found) return found[1].replace(/\/+$/, '');
    const same = new RegExp('(?:^|[^a-zA-Z0-9_$.])' + name + '=\\([^()]{0,40}\\)=>\\{[\\s\\S]{0,400}?origin:([a-zA-Z_$][a-zA-Z0-9_$]*)[\\s\\S]{0,400}?\\x60\\$\\{([a-zA-Z_$][a-zA-Z0-9_$]*)\\}/api\\.php\\x60');
    const sm = same.exec(script);
    if (sm && sm[1] === sm[2]) return origin.replace(/\/+$/, '') + '/api.php';
  }
  return '';
}
function yeguoApiBaseFromNuxt(html) {
  const m = /<script[^>]+id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return '';
  try {
    const table = JSON.parse(m[1]);
    if (!Array.isArray(table) || table.length > 100000) return '';
    for (let i = 0; i < table.length; i++) {
      const row = table[i];
      if (!row || typeof row !== 'object' || row.apiBaseURL == null) continue;
      const ref = Number(row.apiBaseURL);
      if (Number.isInteger(ref) && ref >= 0 && ref < table.length && typeof table[ref] === 'string') {
        return table[ref].replace(/\/+$/, '');
      }
    }
  } catch (_) {}
  return '';
}
function yeguoPublicConfig(script) {
  const fields = {};
  const re = /\b(version|mode|padding|key|iv|sign_key)\s*:\s*(?:[a-zA-Z_$][a-zA-Z0-9_$]*\(\s*)?["'\x60]([^"'\x60\\\r\n]{1,512})["'\x60]/g;
  let m;
  while ((m = re.exec(script)) !== null) fields[m[1]] = m[2];
  if (fields.version !== 'v0' || fields.mode !== 'CBC' || fields.padding !== 'Pkcs7') return null;
  const key = apiPublicBytes(fields.key), iv = apiPublicBytes(fields.iv), sign = apiPublicBytes(fields.sign_key);
  if (!key || !iv || !sign) return null;
  const keyLength = key.encoding === 'latin1' ? key.value.length : key.value.length;
  if (![16, 24, 32].includes(keyLength) || iv.value.length !== 16 || !sign.value.length || sign.value.length > 128) return null;
  return { key: key, iv: iv, signKey: sign };
}
async function discoverYeguoAccess() {
  if (yeguoAccessCache && Date.now() - yeguoAccessCache.loadedAt < YEGUO_CONFIG_TTL) return yeguoAccessCache;
  const home = await requestUrl(ORIGIN + '/');
  const origin = ORIGIN;
  let apiBase = yeguoApiBaseFromNuxt(home.body);
  const doc = parseDoc(home.body, home.url);
  const moduleTags = doc.select('script[type="module"]');
  let entry = '';
  for (let i = 0; i < moduleTags.length; i++) {
    const candidate = absolute(attr(moduleTags[i], 'src'), home.url);
    if (candidate && candidate.indexOf(origin + '/') === 0 && /\/_nuxt\/.*\.js(?:\?|$)/.test(candidate)) {
      entry = candidate; break;
    }
  }
  if (!entry) throw host.error('E_PARSE', '野果首页未找到接口配置脚本');
  const entryRes = await requestUrl(entry, home.url);
  if (!apiBase) apiBase = yeguoApiBaseFromScript(entryRes.body, origin);
  let config = yeguoPublicConfig(entryRes.body);
  const priorityImports = [], fallbackImports = [];
  const addImport = function (reference, priority) {
    const ref = clean(reference);
    if (!ref || !/\\.m?js(?:[?#]|$)/i.test(ref)) return;
    let u = '';
    if (/^https?:\\/\\//i.test(ref)) {
      u = ref;
    } else if (ref.indexOf('//') === 0) {
      u = 'https:' + ref;
    } else if (ref.charAt(0) === '/') {
      u = origin + ref;
    } else {
      // Resolve relative chunks against the entry module directory. Do not
      // depend on a host URL helper's treatment of minified relative imports.
      const basePath = entry.slice(origin.length);
      const dir = basePath.slice(0, basePath.lastIndexOf('/') + 1);
      const parts = (dir + ref.split(/[?#]/)[0]).split('/');
      const normalized = [];
      for (let p = 0; p < parts.length; p++) {
        if (!parts[p] || parts[p] === '.') continue;
        if (parts[p] === '..') normalized.pop();
        else normalized.push(parts[p]);
      }
      u = origin + '/' + normalized.join('/');
      const suffix = /([?#].*)$/.exec(ref);
      if (suffix) u += suffix[1];
    }
    if (u.indexOf(origin + '/_nuxt/') !== 0 || !/\\.m?js(?:[?#]|$)/i.test(u)) return;
    if (u === entry || priorityImports.indexOf(u) >= 0 || fallbackImports.indexOf(u) >= 0) return;
    (priority ? priorityImports : fallbackImports).push(u);
  };
  // Read modulepreload/preload references directly from the HTML as some
  // Nuxt builds keep the dependency graph outside the entry bundle.
  const preloadTags = doc.select('link[rel*="modulepreload"][href],link[rel="preload"][as="script"][href]');
  for (let i = 0; i < preloadTags.length; i++) {
    addImport(attr(preloadTags[i], 'href'), true);
  }
  // Match named imports (same ordering as the native GuoApp provider), bare
  // side-effect imports, default imports, and dynamic import() chunks.
  const namedImportRe = /import\\s*\\{([^{};]{1,2400})\\}\\s*from\\s*["'\\x60]([^"'\\x60]+)["'\\x60]/g;
  let im;
  while ((im = namedImportRe.exec(entryRes.body)) !== null) {
    addImport(im[2], im[1].indexOf(',') >= 0);
  }
  const importPathRe = /(?:\\bfrom\\s*|\\bimport\\s*(?:\\(\\s*)?)["'\\x60]([^"'\\x60]+\\.m?js(?:[?#][^"'\\x60]*)?)["'\\x60]\\s*\\)?/g;
  while ((im = importPathRe.exec(entryRes.body)) !== null) addImport(im[1], false);
  // Nuxt/Vite preload maps may store chunk paths as plain string literals.
  const chunkRe = /["'\\x60]((?:\\.\\.?\\/|\\/_nuxt\\/)[^"'\\x60]+\\.m?js(?:[?#][^"'\\x60]*)?)["'\\x60]/g;
  while ((im = chunkRe.exec(entryRes.body)) !== null) addImport(im[1], false);
  const orderedImports = priorityImports.concat(fallbackImports);
  let scannedModules = 0;
  for (let i = 0; i < orderedImports.length && i < 40 && (!config || !apiBase); i++) {
    try {
      const chunk = await requestUrl(orderedImports[i], home.url);
      scannedModules++;
      if (!apiBase) apiBase = yeguoApiBaseFromScript(chunk.body, origin);
      if (!config) config = yeguoPublicConfig(chunk.body);
    } catch (_) {}
  }
  if (!config) throw host.error('E_PARSE', '野果接口加密配置未找到（入口依赖 ' + orderedImports.length + ' 个，已扫描 ' + scannedModules + ' 个），站点前端可能已更新');
  if (!apiBase) apiBase = origin + '/api.php';
  if (!/^https:\/\/(?:[a-z0-9-]+\.)?yeguodj\.com(?::443)?(?:\/|$)/i.test(apiBase)) throw host.error('E_PERMISSION', '野果接口地址不在已授权站点内');
  const access = {
    base: apiBase, site: origin, key: config.key, iv: config.iv, signKey: config.signKey,
    identifier: host.crypto.random({ n: 16 }), loadedAt: Date.now()
  };
  yeguoAccessCache = access;
  return access;
}
async function yeguoDecodeResponse(body, access) {
  let envelope;
  try { envelope = JSON.parse(body); } catch (_) { throw host.error('E_PARSE', '野果接口返回的不是有效 JSON'); }
  if (!envelope || typeof envelope !== 'object') throw host.error('E_PARSE', '野果接口响应格式无效');
  if (envelope.sign) {
    const keys = Object.keys(envelope).filter(function (k) { return k !== 'sign' && k !== '_ver' && envelope[k] != null; }).sort();
    const pieces = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], v = envelope[k];
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw host.error('E_PARSE', '野果响应签名字段格式无效');
      pieces.push(k + '=' + (k === 'data' ? String(v).replace(/ /g, '+') : String(v)));
    }
    const digest = host.crypto.hash({ alg: 'sha256', data: pieces.join('&') + access.signKey.value, in: access.signKey.encoding, out: 'hex' });
    const expected = host.crypto.hash({ alg: 'md5', data: digest, in: 'utf8', out: 'hex' });
    if (expected.toLowerCase() !== String(envelope.sign).toLowerCase()) throw host.error('E_PARSE', '野果接口响应签名校验失败');
  }
  if (typeof envelope.data === 'string') {
    const plain = host.crypto.aes({
      op: 'decrypt', mode: 'cbc', key: access.key.value, keyEncoding: access.key.encoding,
      iv: access.iv.value, ivEncoding: access.iv.encoding, data: envelope.data.replace(/ /g, '+'),
      in: 'base64', out: 'utf8', padding: 'pkcs7'
    });
    try { envelope = JSON.parse(plain); } catch (_) { throw host.error('E_PARSE', '野果接口数据解密失败'); }
  }
  return envelope;
}
async function yeguoApiCall(path, params, method) {
  const access = await discoverYeguoAccess();
  const values = Object.assign({
    bundleId: 'com.pwa.mater', version: '1.3.2', oauth_type: 'web',
    language: 'zh', via: 'pwa', oauth_id: access.identifier,
    trace_id: access.identifier, token: ''
  }, params || {});
  const headers = {
    'User-Agent': UA, 'Accept': 'application/json, text/plain, */*',
    'Origin': access.site, 'Referer': access.site + '/'
  };
  let url = apiUrl(access.base, path), options = { url: url, method: method || 'POST', headers: headers, timeout: 30000 };
  if (options.method === 'GET') {
    const query = Object.keys(values).sort().map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(String(values[k]));
    }).join('&');
    options.url += '?' + query;
  } else {
    options.body = values; options.bodyType = 'form';
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await host.http.request(options);
  if (!res || res.status < 200 || res.status >= 300) throw host.error('E_HTTP', '野果接口请求失败：HTTP ' + (res ? res.status : 0));
  const payload = await yeguoDecodeResponse(String(res.body || ''), access);
  if (String(payload.status) !== '1') {
    if (String(payload.status) === '-1') throw host.error('E_PERMISSION', '野果当前内容需要站源授权');
    throw host.error('E_PARSE', clean(payload.msg) || '野果接口未完成请求');
  }
  if (!payload.data || typeof payload.data !== 'object') throw host.error('E_PARSE', '野果接口缺少 data 数据');
  return payload.data;
}
function yeguoCover(value, base) {
  const cover = absolute(value, base || ORIGIN);
  return cover || '';
}
function yeguoEpisodePage(id, number) {
  return ORIGIN + '/drama/video/' + id + (number > 1 ? '/ep-' + number : '') + '/';
}

export default {
  async home() {
    const res = await requestUrl(ORIGIN + '/');
    const doc = parseDoc(res.body, res.url);
    const items = pageItems(res.body, res.url).slice(0, 5);
    const categories = CATEGORIES.filter(function (c) {
      return !!doc.selectFirst('a[href*="/drama/' + c.id + '/"]');
    });
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
    if (!/^\d+$/.test(vid)) throw host.error('E_NOT_FOUND', '无效的野果剧集 ID');
    const row = await yeguoApiCall('/api/playlet/detail', {
      video_id: vid, id: vid, episode_id: '0', related_limit: '0'
    });
    const returnedId = clean(row.video_id || row.id);
    if (returnedId !== vid) throw host.error('E_PARSE', '野果详情与请求剧集不匹配');
    const title = clean(row.title) || ('野果短剧 ' + vid);
    const episodes = Array.isArray(row.episodes) ? row.episodes : [];
    const seen = {};
    const normalized = [];
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i] || {};
      if (String(ep.is_adv) === '1' || ep.is_adv === true) continue;
      const epId = clean(ep.id), sort = Number(ep.sort);
      if (!/^\d+$/.test(epId) || !Number.isInteger(sort) || sort < 1 || seen[epId]) continue;
      seen[epId] = true;
      normalized.push({ id: epId, sort: sort, name: clean(ep.title) || ('第' + sort + '集') });
    }
    normalized.sort(function (a, b) { return a.sort - b.sort; });
    if (!normalized.length) throw host.error('E_PARSE', '野果详情接口未返回有效分集列表');
    const result = {
      title: title,
      desc: clean(row.description),
      lines: [{ name: '默认线路', episodes: normalized.map(function (ep) { return { id: ep.id, name: ep.name }; }) }]
    };
    const cover = yeguoCover(row.cover, ORIGIN);
    if (cover) result.cover = cover;
    return result;
  },

  async play({ episodeId, id }) {
    const ep = clean(episodeId);
    if (!/^\d+$/.test(ep)) throw host.error('E_PARSE', '无效的野果剧集播放 ID');
    const dramaId = clean(id);
    const row = await yeguoApiCall('/api/playlet/play', {
      playlet_id: dramaId, video_id: dramaId, episode_id: ep
    });
    if (clean(row.id) !== ep || (dramaId && clean(row.playlet_id) !== dramaId)) {
      throw host.error('E_PARSE', '野果返回的播放地址与请求分集不匹配');
    }
    if (String(row.is_adv) === '1' || row.is_adv === true) throw host.error('E_NOT_FOUND', '野果未返回该集正片');
    const referer = yeguoEpisodePage(dramaId || clean(row.playlet_id), Number(row.episode_sort) || 1);
    const streams = [], seen = {};
    ['video_url', 'video_url_h265'].forEach(function (field) {
      const raw = clean(row[field]);
      const media = absolute(raw, referer);
      if (!media || !/^https:\/\//i.test(media) || seen[media]) return;
      seen[media] = true;
      streams.push({
        name: clean(row.resolution) || (field === 'video_url_h265' ? 'H.265' : '默认线路'),
        url: media,
        format: /\.m3u8(?:[?#]|$)/i.test(media) ? 'hls' : 'mp4',
        headers: { Referer: referer }
      });
    });
    if (!streams.length) throw host.error('E_PARSE', '野果播放接口未返回有效 m3u8/MP4 地址');
    return { streams: streams };
  }};
