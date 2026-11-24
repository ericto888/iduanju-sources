// 黄瓜短剧 · iDuanJu idj1 插件（由 GuoApp 黄瓜短剧 1.0.2 适配）
const NAV_URL = "https://hgdju.com/homeward";
const LEGACY_NAV_URLS = ["https://hgdja1.com/"];
const CACHE_KEY = "huanggua.latestHost.v1";
const CACHE_TTL = 30 * 60 * 1000;
const SEED_HOSTS = ["https://hgdj17.com","https://hgdjb15.com","https://hgdj1.app","https://abc.ywwegfkd.cc","https://qwer.ywwegfkd.cc","https://xyz.ywwegfkd.cc","https://mkqjue.eyrkjyudz.cc","https://porncz.eyrkjyudz.cc","https://rixgqa.eyrkjyudz.cc","https://porncz.hzeqbmes.cc"];
const ALLOWED_SUFFIXES = ["hgdju.com","hgdja1.com","hgdj1.app","hgdj17.com","hgdjb15.com","ywwegfkd.cc","eyrkjyudz.cc","hzeqbmes.cc"];
const CATEGORIES = [{id:"aiduanju",name:"AI短剧"},{id:"manju",name:"AI漫剧"},{id:"mogai",name:"AI魔改"},{id:"zhenren",name:"真人短剧"},{id:"yuanchuang",name:"原创短剧"},{id:"browse",name:"全部"}];
const CATEGORY_IDS = ["","aiduanju","manju","mogai","zhenren","yuanchuang","browse"];
const CARD_SPLIT = '<article data-xpch="card-drama"';
const ALIAS_RE = /href=["\']\/drama\/([a-zA-Z0-9_-]+)["\']/i;
const IMG_TAG_RE = /<img\b[^>]*>/gi;
const IMG_ATTR_RE = /([a-zA-Z:_-]+)\s*=\s*"([^"]*)"/g;
const COVER_PATH_RE = /(\/_img\/[A-Za-z0-9+/=]+\.(?:jpeg|jpg|png|webp))/;
const H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
const DESC_RE = /<meta\s+name="description"\s+content="([^"]*)"/i;
const EPISODE_RE = /(?:更新至|全)\s*(\d+)\s*集/;
const HEAT_RE = /([0-9.]+万?)\s*热度/;
const PLAY_URL_RE = /"source_url"\s*:\s*"([^"]+)"/;
const ESCAPED_M3U8_RE = /https?:\\u002[Ff]\\u002[Ff][^"]+?\.m3u8[^"]*/;
const M3U8_RE = /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/;
const PAYLOAD_RE = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
let memoryHost = "", memoryHostAt = 0;

function str(v) { return v == null ? "" : String(v).trim(); }
function htmlText(v) {
  return str(v).replace(/<[^>]*>/g," ").replace(/&#x([0-9a-f]+);/gi,(m,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/g,(m,n)=>String.fromCodePoint(parseInt(n,10))).replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"')
    .replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
}
function fail(code,message) { throw host.error(code,message); }
function allowedHost(value) {
  const m=/^https:\/\/([^/:?#]+)$/i.exec(str(value).replace(/\/+$/,""));
  if(!m)return false;
  const h=m[1].toLowerCase();
  return ALLOWED_SUFFIXES.some(s=>h===s||h.endsWith("."+s));
}
function addCandidate(list,seen,value) {
  let c=str(value).replace(/[),.;]$/,"");
  const m=/^https?:\/\/[^/]+/i.exec(c);
  if(!m)return;
  c=m[0].replace(/\/+$/,"").replace(/^http:/i,"https:");
  if(!allowedHost(c)||seen[c])return;
  seen[c]=true;list.push(c);
}
function extractCandidates(body) {
  const s=String(body||"").replace(/&amp;/g,"&").replace(/\\\//g,"/");
  return s.match(/https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s"'<>]*)?/gi)||[];
}
async function request(url,referer,timeout) {
  const r=await host.http.request({url,headers:referer?{Referer:referer}:{},timeout:timeout||20000});
  if(!r||r.status<200||r.status>=300)fail(r&&r.status===404?"E_NOT_FOUND":"E_HTTP","黄瓜短剧请求失败 HTTP "+(r?r.status:0)+"："+url);
  return r;
}
async function getText(url,referer,timeout) {
  const r=await request(url,referer,timeout);
  return {body:str(r.body),url:str(r.url)||url,headers:r.headers||{},status:Number(r.status)||0};
}
function readCachedHost() {
  try {
    const v=host.storage.get(CACHE_KEY),p=typeof v==="string"?JSON.parse(v):v;
    const savedAt=Number(p&&p.updatedAt)||0;
    if(p&&typeof p.host==="string"&&allowedHost(p.host)&&savedAt>0&&Date.now()-savedAt<CACHE_TTL)return p.host;
  } catch(e) {}
  return "";
}
function writeCachedHost(v) { try{host.storage.set(CACHE_KEY,JSON.stringify({host:v,updatedAt:Date.now()}));}catch(e){} }
async function validateHost(c,requireSearch) {
  const paths=requireSearch
    ? ["/search/video/%E4%B8%8D%E6%93%8D%E4%BB%99/"]
    : ["/","/ai-duanju/","/aiduanju","/browse/"];
  for(const path of paths) {
    try {
      const p=await getText(c+path,c+"/",12000);
      if(requireSearch ? parseSearchCardsDOM(p.body,c).length>0 : (p.body.includes("黄瓜短剧")&&p.body.includes("/drama/")))return true;
    } catch(e) {}
  }
  return false;
}
async function getHost(forceRefresh,requireSearch) {
  if(!forceRefresh&&memoryHost&&Date.now()-memoryHostAt<CACHE_TTL) {
    if(!requireSearch||await validateHost(memoryHost,true))return memoryHost;
    memoryHost="";memoryHostAt=0;
  }
  if(!forceRefresh) {
    const saved=readCachedHost();
    if(saved&&(!requireSearch||await validateHost(saved,true))) {
      memoryHost=saved;memoryHostAt=Date.now();return saved;
    }
  }
  const candidates=[],seen={};
  for(const address of [NAV_URL].concat(LEGACY_NAV_URLS)) {
    try {
      const r=await getText(address,address,15000);
      addCandidate(candidates,seen,r.url);
      addCandidate(candidates,seen,r.headers.location||r.headers.Location||"");
      for(const found of extractCandidates(r.body))addCandidate(candidates,seen,found);
    } catch(e) {}
  }
  // 优先保留最近成功的线路，其次检查站点导航页发现的地址和内置候选域名。
  addCandidate(candidates,seen,memoryHost);
  addCandidate(candidates,seen,readCachedHost());
  for(const seed of SEED_HOSTS)addCandidate(candidates,seen,seed);
  for(const c of candidates) {
    if(await validateHost(c,!!requireSearch)) {
      memoryHost=c;memoryHostAt=Date.now();writeCachedHost(c);return c;
    }
  }
  fail("E_NETWORK",requireSearch
    ? "黄瓜短剧未发现支持搜索的可用线路，请刷新最新地址后重试"
    : "黄瓜短剧未发现可用线路。请先开启 VPN 刷新最新地址，再关闭 VPN 重试");
}
async function pageWithRefresh(url,referer,validator) {
  try {
    const r=await getText(url,referer);
    if(!validator||validator(r.body,r.url,r))return r.body;
  } catch(e) {
    // 404 表示该集在当前线路确实不存在，不应刷新线路后重复请求同一个失效集数。
    if(e&&e.code==="E_NOT_FOUND")throw e;
    if(/HTTP 404/.test(String(e&&e.message||e)))throw e;
  }
  // 刷新线路时必须保留原请求的完整路径和查询参数，不能把 /search?q=剧名
  // 丢成 /search，否则站点可能返回首页推荐列表并被误认为搜索结果。
  const fresh=await getHost(true);
  const m=/^https?:\/\/[^/]+(\/[^?#]*)?(\?[^#]*)?/i.exec(url);
  const target=(m&&m[1]?m[1]:"/")+(m&&m[2]?m[2]:"");
  const r=await getText(fresh+target,fresh+"/");
  if(validator&&!validator(r.body,r.url,r))fail("E_PARSE","黄瓜短剧最新地址已刷新，但页面结构仍不可用");
  return r.body;
}

function base64Raw(value) {
  const a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",b=[];
  for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c<128)b.push(c);else if(c<2048)b.push(192|(c>>6),128|(c&63));else b.push(224|(c>>12),128|((c>>6)&63),128|(c&63));}
  let o="";
  for(let i=0;i<b.length;i+=3){const x=b[i],y=i+1<b.length?b[i+1]:0,z=i+2<b.length?b[i+2]:0;o+=a[x>>2]+a[((x&3)<<4)|(y>>4)];if(i+1<b.length)o+=a[((y&15)<<2)|(z>>6)];if(i+2<b.length)o+=a[z&63];}
  return o;
}
function payloadValue(values,value){if(typeof value!=="number"||!Number.isFinite(value))return value;const i=Math.trunc(value);return i>=0&&i<values.length?values[i]:undefined;}
function payloadString(values,value){const v=payloadValue(values,value);return typeof v==="string"||typeof v==="number"?String(v).trim():"";}
function parsePayload(body) {
  const m=PAYLOAD_RE.exec(body);if(!m)return{};
  let values;try{values=JSON.parse(m[1]);}catch(e){return{};}if(!Array.isArray(values))return{};
  const out={};
  for(const row of values){
    if(!row||typeof row!=="object"||Array.isArray(row)||!Object.prototype.hasOwnProperty.call(row,"cover"))continue;
    const slug=payloadString(values,row.slug),v=payloadValue(values,row.cover);
    const cover=v&&typeof v==="object"?{url:payloadString(values,v.url),fallback:payloadString(values,v.fallback_url)}:{url:payloadString(values,row.cover),fallback:""};
    if(!slug||(!cover.url&&!cover.fallback)||out[slug])continue;
    out[slug]={title:payloadString(values,row.title),cover:cover.url,fallback:cover.fallback,episodes:parseInt(payloadString(values,row.total_episode_count),10)||0,heat:payloadString(values,row.heat_7d)};
  }
  return out;
}
function coverAddress(siteHost,raw,fallback) {
  const v=str(raw);
  if(v.startsWith("/_img/"))return siteHost+v;
  if(/^https?:\/\//i.test(v)&&!/\s/.test(v)){let ext=v.split(/[?#]/)[0].split(".").pop();if(!/^(jpeg|jpg|png|webp)$/i.test(ext))ext="jpeg";return siteHost+"/_img/"+base64Raw(v)+"."+ext;}
  const f=str(fallback);if(f.startsWith("/")&&!f.startsWith("//"))return siteHost+f;if(/^https?:\/\//i.test(f))return f;return "";
}
function cardImage(segment) {
  const tags=segment.match(IMG_TAG_RE)||[];
  for(const tag of tags.slice(0,16)){const attrs={};let m;IMG_ATTR_RE.lastIndex=0;while((m=IMG_ATTR_RE.exec(tag))!==null)attrs[m[1].toLowerCase()]=str(m[2]);
    for(const k of ["data-src","data-original","data-lazy-src","src","srcset"]){const found=COVER_PATH_RE.exec(attrs[k]||"");if(found)return{cover:found[1],title:attrs.alt||""};}}
  return{cover:"",title:""};
}
function hasDramaCards(body) {
  return /<article\b(?=[^>]*\bdata-xpch=["']card-drama["'])/i.test(String(body||""));
}
function isSearchResponse(body,responseUrl) {
  // 部分线路会把搜索页重定向到规范 URL，HTTP 客户端返回的 finalUrl 不稳定。
  // 搜索请求地址由 searchDramas 固定生成，因此这里以响应是否为完整 HTML 页面判断，
  // 不再因 finalUrl 或卡片模板差异提前拒绝解析。
  const html=String(body||"");
  return html.length>2000 && /<(?:!doctype\s+html|html|head|body)\b/i.test(html);
}
function parseCards(body,siteHost) {
  // 黄瓜新版卡片的剧名优先位于 aria-label；兼容 img alt、Nuxt payload 和标题属性。
  const blocks=String(body||"").match(/<article\b(?=[^>]*\bdata-xpch=["']card-drama["'])[^>]*>[\s\S]*?(?=<article\b(?=[^>]*\bdata-xpch=["']card-drama["'])|$)/gi)||[];
  const payload=parsePayload(body),seen={},items=[];
  for(const segment of blocks){
    const m=/(?:href=["\'][^"\']*\/(?:video|drama)\/([a-zA-Z0-9_-]+)(?:[/?#][^"\']*)?["\'])/i.exec(segment),alias=m?str(m[1]):"";if(!alias||seen[alias])continue;
    const image=cardImage(segment),entry=payload[alias]||null;
    const aria=(/aria-label=["']([^"']+)["']/i.exec(segment)||[])[1]||"";
    const titleAttr=(/(?:data-title|title)=["']([^"']+)["']/i.exec(segment)||[])[1]||"";
    const heading=(/<(?:h[1-6]|span|div)\b[^>]*>([\s\S]*?)<\/(?:h[1-6]|span|div)>/i.exec(segment)||[])[1]||"";
    const title=str(htmlText(aria).replace(/\s*详情\s*$/,"")||image.title||(entry&&entry.title)||htmlText(titleAttr)||htmlText(heading));
    if(!title)continue;
    let cover=image.cover?siteHost+image.cover:"";if(!cover&&entry)cover=coverAddress(siteHost,entry.cover,entry.fallback);
    const ep=EPISODE_RE.exec(segment),heat=HEAT_RE.exec(segment),count=ep?Number(ep[1]):(entry?entry.episodes:0);
    const item={id:alias,title,remarks:count>0?"更新至"+count+"集":""};
    const views=heat?heat[1]+"热度":(entry&&entry.heat?entry.heat+"热度":"");
    if(cover)item.cover=cover;if(views)item.views=views;seen[alias]=true;items.push(item);
  }
  // 搜索页存在不同卡片模板：当 article 模板未命中时，从真实剧集链接提取卡片，
  // 标题优先取 aria-label/title/img alt，再取链接文本；不把首页普通链接当剧集。
  if(items.length===0) {
    const linkRe=/<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while((match=linkRe.exec(String(body||"")))!==null) {
      const attrs=match[1],inner=match[2];
      const href=(/\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)||[])[1]||"";
      const decodedHref=href.replace(/\\\//g,"/");
      const idMatch=/\/(?:video|drama)\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/i.exec(decodedHref);
      const alias=idMatch?str(idMatch[1]):"";
      if(!alias||seen[alias])continue;
      const img=(/<img\b[^>]*>/i.exec(inner)||[])[0]||"";
      const alt=(/\balt=["']([^"']+)["']/i.exec(img)||[])[1]||"";
      const aria=(/\baria-label=["']([^"']+)["']/i.exec(attrs)||[])[1]||"";
      const titleAttr=(/\btitle=["']([^"']+)["']/i.exec(attrs)||[])[1]||"";
      const entry=payload[alias]||null;
      const title=str(htmlText(aria)||htmlText(titleAttr)||htmlText(alt)||(entry&&entry.title)||htmlText(inner));
      if(!title||title.length>100)continue;
      const context=String(body||"").slice(Math.max(0,match.index-500),Math.min(String(body||"").length,linkRe.lastIndex+700));
      const image=cardImage(context);
      let cover=image.cover?siteHost+image.cover:"";
      if(!cover&&entry)cover=coverAddress(siteHost,entry.cover,entry.fallback);
      const ep=EPISODE_RE.exec(context),heat=HEAT_RE.exec(context),count=ep?Number(ep[1]):(entry?entry.episodes:0);
      const item={id:alias,title,remarks:count>0?"更新至"+count+"集":""};
      const views=heat?heat[1]+"热度":(entry&&entry.heat?entry.heat+"热度":"");
      if(cover)item.cover=cover;if(views)item.views=views;
      seen[alias]=true;items.push(item);
    }
  }
  return items;
}

function parseSearchCardsDOM(body,siteHost) {
  // 黄瓜搜索结果实际使用 /video/<数字ID>/，旧版 /drama/ 仅作为兼容路径保留。
  let root;
  try { root=host.html.parse(String(body||"")); } catch(e) { return []; }
  let anchors;
  try { anchors=root.select("a"); } catch(e) { return []; }
  const payload=parsePayload(body),seen={},items=[];
  for(const anchor of anchors) {
    const href=htmlText(anchor.attr("href")).replace(/\\\//g,"/");
    const idMatch=/\/(?:video|drama)\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/i.exec(href);
    const alias=idMatch?str(idMatch[1]):"";
    if(!alias||seen[alias])continue;
    let img=null;
    try { img=anchor.selectFirst("img"); } catch(e) {}
    const entry=payload[alias]||null;
    const anchorText=anchor.text();
    const title=str(
      htmlText(anchor.attr("aria-label")).replace(/\s*详情\s*$/,"") ||
      htmlText(anchor.attr("title")) ||
      (img?htmlText(img.attr("alt")):"") ||
      (entry&&entry.title) ||
      anchorText
    );
    if(!title||title.length>100)continue;
    let rawCover="";
    if(img) rawCover=img.attr("data-src")||img.attr("data-original")||img.attr("data-lazy-src")||img.attr("src")||"";
    let cover=rawCover?coverAddress(siteHost,rawCover,entry&&entry.fallback):"";
    if(!cover&&entry)cover=coverAddress(siteHost,entry.cover,entry.fallback);
    const ep=EPISODE_RE.exec(anchorText),heat=HEAT_RE.exec(anchorText);
    const count=ep?Number(ep[1]):(entry?entry.episodes:0);
    const item={id:alias,title:title,remarks:count>0?"更新至"+count+"集":""};
    const views=heat?heat[1]+"热度":(entry&&entry.heat?entry.heat+"热度":"");
    if(cover)item.cover=cover;
    if(views)item.views=views;
    seen[alias]=true;items.push(item);
  }
  return items;
}

function extractTotalEpisodes(body,payloadEpisodes) {
  const text=String(body||"");
  const patterns=[
    /共\s*(\d+)\s*集/i,
    /全\s*(\d+)\s*集/i,
    /更新至\s*(\d+)\s*集/i,
    /(\d+)\s*集全/i
  ];
  let total=Math.max(0,Math.min(9999,Math.floor(Number(payloadEpisodes)||0)));
  for(const re of patterns){const m=re.exec(text);if(m)total=Math.max(total,Math.min(9999,Number(m[1])||0));}
  return total;
}
function chaptersFor(body,alias) {
  // 与上游 GuoApp 保持一致：只采用详情页实际提供的播放链接。
  // total_episode_count / 文案中的总集数可能滞后或错误，不能据此虚构可播放集数。
  const re=new RegExp("/play/"+alias+"/(\\d+)","g"),seen={},out=[];let m;
  while((m=re.exec(body))!==null){const n=Number(m[1]);if(n>0&&n<=9999)seen[n]=true;}
  for(const n of Object.keys(seen).map(Number).sort((a,b)=>a-b))out.push({id:alias+"/"+n,name:String(n)});
  return out;
}
function unescapePlayUrl(raw) {
  let value = String(raw)
    .replace(/\\\\u002[Ff]/g, "/")
    .replace(/\\\\u0026/g, "&")
    .split("\\/").join("/");
  try {
    value = JSON.parse('"' + value.replace(/"/g, '\\\\"') + '"');
  } catch (e) {}
  return value;
}
function parsePlayUrl(body) {
  const sourceMatch = PLAY_URL_RE.exec(body);
  if (sourceMatch && /^https?:/i.test(sourceMatch[1])) return unescapePlayUrl(sourceMatch[1]);
  const escapedMatch = ESCAPED_M3U8_RE.exec(body);
  if (escapedMatch) return unescapePlayUrl(escapedMatch[0]);
  const genericMatch = M3U8_RE.exec(body);
  return genericMatch ? unescapePlayUrl(genericMatch[0]) : "";
}
const CATEGORY_CACHE_PREFIX = "huanggua.category.v2.";
const CATEGORY_CACHE_TTL = 10 * 60 * 1000;
const CATEGORY_PATHS = {
  "": ["/browse/", "/browse", "/"],
  aiduanju: ["/ai-duanju/", "/aiduanju/", "/aiduanju"],
  manju: ["/ai-manju/", "/manju/", "/manju"],
  mogai: ["/ai-mogai/", "/mogai/", "/mogai"],
  zhenren: ["/zhenren/", "/zhenren"],
  yuanchuang: ["/yuanchuang/", "/yuanchuang"],
  browse: ["/browse/", "/browse", "/"]
};

function cacheHostKey(h) {
  return str(h).replace(/^https?:\/\//i,"").replace(/[^a-zA-Z0-9.-]/g,"_").toLowerCase();
}
function readCategoryCache(h,category,page) {
  try {
    const raw=host.storage.get(CATEGORY_CACHE_PREFIX+cacheHostKey(h)+"."+category+"."+page);
    const value=typeof raw==="string"?JSON.parse(raw):raw;
    if(value&&Array.isArray(value.items)&&value.items.length&&Number(value.savedAt)>0) {
      return {items:value.items,hasMore:!!value.hasMore,savedAt:Number(value.savedAt)};
    }
  } catch(e) {}
  return null;
}
function writeCategoryCache(h,category,page,result) {
  try {
    host.storage.set(CATEGORY_CACHE_PREFIX+cacheHostKey(h)+"."+category+"."+page,JSON.stringify({
      items:result.items,hasMore:!!result.hasMore,savedAt:Date.now()
    }));
  } catch(e) {}
}
function pageNumberFromHref(href) {
  const path=str(href).split(/[?#]/)[0].replace(/\/+$/,"");
  let m=path.match(/\/page-(\d+)$/i);
  if(m)return Number(m[1]);
  m=path.match(/\/(\d+)$/);
  if(m)return Number(m[1]);
  const query=str(href).split("?")[1]||"";
  m=query.match(/(?:^|&)(?:page|p)=(\d+)/i);
  return m?Number(m[1]):0;
}
function absolutePageHref(h,href) {
  const value=str(href).replace(/&amp;/g,"&");
  if(/^https?:\/\//i.test(value))return value;
  if(value.startsWith("//"))return "https:"+value;
  if(value.startsWith("/"))return h+value;
  return h+"/"+value;
}
function paginationLinks(body,h) {
  const found={},html=String(body||"");
  const re=/<a\b([^>]*href=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))!==null) {
    const href=str(m[2]);if(!href)continue;
    const absolute=absolutePageHref(h,href);
    if(!absolute.startsWith(h+"/"))continue;
    const n=pageNumberFromHref(absolute);
    const label=htmlText(m[3]+" "+m[1]);
    if(n>0)found[n]=absolute;
    if(/rel=["']next["']|下一页|下页|next/i.test(m[1]+" "+label))found.next=absolute;
  }
  return found;
}
function pagePaths(category,page,links) {
  const bases=CATEGORY_PATHS[str(category)]||[];
  if(links&&links[page])return [links[page]];
  if(page===2&&links&&links.next)return [links.next];
  const out=[];
  for(const base of bases) {
    if(page===1){out.push(base);continue;}
    const root=base.endsWith("/")?base:base+"/";
    // 兼容当前站点的 /ai-duanju/41/ 与旧版 /aiduanju/page-2 两类路由。
    out.push(root+page+"/",root+"page-"+page,root+"page-"+page+"/");
  }
  return Array.from(new Set(out));
}
async function fetchCategoryPage(h,category,page) {
  const bases=CATEGORY_PATHS[str(category)]||[];
  let links={};
  if(page>1) {
    // 优先读取站点页面给出的真实分页链接；没有分页锚点时再尝试已知路由格式。
    for(const base of bases) {
      try {
        const first=await pageWithRefresh(h+base,h+"/",b=>hasDramaCards(b));
        links=paginationLinks(first,h);
        if(links[page]||links.next)break;
      } catch(e) {}
    }
  }
  const candidates=pagePaths(category,page,links);
  let lastError=null;
  for(const target of candidates) {
    try {
      const url=/^https?:\/\//i.test(target)?target:h+target;
      const body=await pageWithRefresh(url,h+"/",b=>hasDramaCards(b));
      const items=parseCards(body,h);
      if(items.length) {
        const nextLinks=paginationLinks(body,h);
        const hasMore=!!nextLinks.next||Object.keys(nextLinks).some(k=>k!=="next"&&Number(k)>page)||items.length>=12;
        return {items,hasMore};
      }
      lastError=host.error("E_PARSE","该分页没有解析到剧集");
    } catch(e) { lastError=e; }
  }
  throw lastError||host.error("E_PARSE","黄瓜短剧分页地址不可用");
}
async function listCategory(page,category) {
  const p=Math.max(1,Math.floor(Number(page)||1));
  if(!CATEGORY_IDS.includes(str(category)))fail("E_PARSE","黄瓜短剧分类无效");
  const h=await getHost(),cached=readCategoryCache(h,category,p);
  if(cached&&Date.now()-cached.savedAt<CATEGORY_CACHE_TTL) {
    return {items:cached.items,hasMore:cached.hasMore};
  }
  try {
    const result=await fetchCategoryPage(h,category,p);
    writeCategoryCache(h,category,p,result);
    return result;
  } catch(e) {
    if(cached&&cached.items.length)return {items:cached.items,hasMore:cached.hasMore};
    throw e;
  }
}
function searchKeywordVariants(keyword) {
  const q=str(keyword).replace(/\s+/g," ").trim();
  const out=[];
  const add=v=>{v=str(v);if(v&& !out.includes(v))out.push(v);};
  add(q);
  // 黄瓜搜索路由对完整长标题偶尔返回 404；依次尝试标题前缀，兼容站点短词索引。
  const chars=Array.from(q);
  if(chars.length>4)add(chars.slice(0,4).join(""));
  if(chars.length>3)add(chars.slice(0,3).join(""));
  return out;
}
const SEARCH_HOST = "https://porncz.hzeqbmes.cc";


function searchDiagnostics(body, response, term, page, requestedUrl) {
  const html=String(body||"");
  const title=(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)||[])[1]||"";
  const hrefs=[],hrefRe=/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while((m=hrefRe.exec(html))!==null&&hrefs.length<18)hrefs.push(m[1].replace(/&amp;/g,"&"));
  const drama=hrefs.filter(v=>/drama|detail|video|play/i.test(v));
  const cardClasses=[];
  const classRe=/\bclass\s*=\s*["']([^"']+)["']/gi;
  while((m=classRe.exec(html))!==null&&cardClasses.length<30) {
    const c=m[1];
    if(/card|drama|video|item|result|search/i.test(c)&&!cardClasses.includes(c))cardClasses.push(c);
  }
  const scripts=[];
  const scriptRe=/<script\b([^>]*)>/gi;
  while((m=scriptRe.exec(html))!==null&&scripts.length<12) {
    const attrs=m[1];
    const id=(/\bid=["']([^"']+)/i.exec(attrs)||[])[1]||"";
    const type=(/\btype=["']([^"']+)/i.exec(attrs)||[])[1]||"";
    scripts.push((id?"id="+id:"")+(type?" type="+type:"")||"script");
  }
  const bodyText=htmlText(html).slice(0,360);
  let dom="dom=unavailable";
  try {
    const root=host.html.parse(html);
    const all=root.select("a");
    const matching=root.select("a[href*='/drama/']");
    dom="domAnchors="+(all&&typeof all.length==="number"?all.length:"?")+
      " domDrama="+(matching&&typeof matching.length==="number"?matching.length:"?");
  } catch(e) { dom="domError="+str(e&&e.message||e).slice(0,120); }
  const detail={
    term:term,page:page,requested:requestedUrl,
    finalUrl:str(response&&response.url),status:Number(response&&response.status)||0,
    bytes:html.length,title:htmlText(title).slice(0,100),
    htmlMarkers:{doctype:/<!doctype/i.test(html),nuxt:/__NUXT/i.test(html),next:/__NEXT_DATA__/i.test(html),jsonLd:/application\/ld\+json/i.test(html)},
    anchors:hrefs.length,dramaHrefs:drama.slice(0,10),
    hrefSamples:hrefs.slice(0,8),cardClasses:cardClasses.slice(0,18),
    scripts:scripts,dom:dom,text:bodyText
  };
  try { host.log("[黄瓜搜索诊断] "+JSON.stringify(detail)); } catch(e) {
    host.log("[黄瓜搜索诊断] term="+term+" status="+detail.status+" bytes="+detail.bytes+" title="+detail.title+" hrefs="+JSON.stringify(detail.hrefSamples)+" dom="+dom);
  }
}

async function searchDramas(keyword,page=1) {
  const q=str(keyword),p=Math.max(1,Math.floor(Number(page)||1));
  if(!q)return {items:[],page:p,hasMore:false};
  // 搜索固定使用用户已确认可直接搜索的线路；诊断只记录页面结构摘要，不输出整页 HTML。
  const h=SEARCH_HOST;
  const variants=searchKeywordVariants(q);
  let lastError=null;
  for(const term of variants) {
    const encoded=encodeURIComponent(term),firstPath="/search/video/"+encoded+"/";
    try {
      let target=firstPath;
      if(p>1) {
        const first=await getText(h+firstPath,h+"/",20000);
        searchDiagnostics(first.body,first,term,p,h+firstPath);
        const links=paginationLinks(first.body,h);
        if(links[p])target=links[p];
        else if(links.next)target=links.next;
        else {
          lastError=host.error("E_PARSE","搜索结果页面未提供有效的下一页链接");
          continue;
        }
      }
      const result=await getText(/^https?:\/\//i.test(target)?target:h+target,h+"/",20000);
      searchDiagnostics(result.body,result,term,p,/^https?:\/\//i.test(target)?target:h+target);
      let items=parseSearchCardsDOM(result.body,h);
      const domCount=items.length;
      if(items.length===0) items=parseCards(result.body,h);
      host.log("[黄瓜搜索解析] term="+term+" page="+p+" domItems="+domCount+" htmlItems="+items.length+
        " hasArticleCards="+hasDramaCards(result.body)+" payload="+!!PAYLOAD_RE.test(result.body));
      if(items.length) {
        const nextLinks=paginationLinks(result.body,h);
        const hasMore=!!nextLinks.next||Object.keys(nextLinks).some(k=>k!=="next"&&Number(k)>p)||items.length>=10;
        return {items,page:p,hasMore};
      }
      lastError=host.error("E_PARSE","搜索结果页面未解析到剧集");
    } catch(e) {
      lastError=e;
      host.log("[黄瓜搜索异常] term="+term+" page="+p+" error="+str(e&&e.message||e).slice(0,300));
    }
  }
  throw lastError||host.error("E_NOT_FOUND","黄瓜短剧没有找到匹配的搜索结果");
}
async function getDetail(alias) {
  alias=str(alias);if(!/^[a-zA-Z0-9-]+$/.test(alias))fail("E_PARSE","黄瓜短剧剧集 ID 无效");
  const h=await getHost(),url=h+"/video/"+encodeURIComponent(alias)+"/";
  const body=await pageWithRefresh(url,h+"/",b=>/<h1\b/i.test(b)),tm=H1_RE.exec(body),title=tm?htmlText(tm[1]):"";
  if(!title)fail("E_PARSE","黄瓜短剧未返回剧集信息");
  const dm=DESC_RE.exec(body),payload=parsePayload(body)[alias];let cover=payload?coverAddress(h,payload.cover,payload.fallback):"";
  if(!cover){const image=cardImage(body);if(image.cover)cover=h+image.cover;}
  const chapters=chaptersFor(body,alias);
  return{title,cover,desc:dm?htmlText(dm[1]):"",chapters};
}
export default {
  async home(){return{categories:CATEGORIES.filter(c=>str(c.id)!==""&&str(c.name)!=="推荐")};},
  async category({id="",page=1}){const r=await listCategory(page,id);return{items:r.items,page:Math.max(1,Number(page)||1),hasMore:r.hasMore};},
  async search({keyword,page=1}){return await searchDramas(keyword,page);},
  async detail({id}){const r=await getDetail(id);return{title:r.title,cover:r.cover,desc:r.desc,lines:[{name:"默认线路",episodes:r.chapters}]};},
  async play({episodeId}){
    let stage="validate episode";
    try {
      const p=str(episodeId).split("/");
      if(p.length!==2||!/^[a-zA-Z0-9-]+$/.test(p[0])||!/^\d+$/.test(p[1]))fail("E_PARSE","黄瓜短剧集 ID 无效");
      stage="resolve host";
      const h=await getHost(),url=h+"/play/"+encodeURIComponent(p[0])+"/"+Number(p[1]);
      stage="fetch play page";
      const body=await pageWithRefresh(url,url,b=>!!parsePlayUrl(b));
      stage="parse media URL";
      const media=parsePlayUrl(body);
      if(!media)fail("E_PARSE","黄瓜短剧没有返回播放地址");
      stage="build stream";
      return{streams:[{name:"默认",url:media,format:/\.m3u8(?:[?#]|$)/i.test(media)?"hls":"mp4",headers:{Referer:url}}]};
    } catch(e) {
      const message=String(e&&e.message||e);
      const stack=String(e&&e.stack||"").slice(0,1800);
      host.log("[黄瓜播放诊断] stage="+stage+" error="+message+" stack="+stack);
      throw e;
    }
  }
};
