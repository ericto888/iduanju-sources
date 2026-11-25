// 黄瓜短剧 · iDuanJu idj1 插件
// 官方唯一站点：hgdju.com。其他域名不属于黄瓜短剧，不参与发现、缓存或故障切换。
const SITE_ORIGIN = "https://hgdju.com";
const NAV_URL = SITE_ORIGIN + "/homeward";
const CATEGORIES = [{id:"browse",name:"推荐"},{id:"yuanchuang",name:"原创短剧"},{id:"aiduanju",name:"AI短剧"},{id:"mogai",name:"魔改"},{id:"manju",name:"漫剧"},{id:"zhenren",name:"真人"}];
const CATEGORY_IDS = ["browse","yuanchuang","aiduanju","mogai","manju","zhenren"];
const CARD_SPLIT = '<article data-xpch="card-drama"';
const ALIAS_RE = /href=["']\/drama\/([a-zA-Z0-9_-]+)["']/i;
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
function str(v) { return v == null ? "" : String(v).trim(); }
function htmlText(v) {
  return str(v).replace(/<[^>]*>/g," ").replace(/&#x([0-9a-f]+);/gi,(m,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/g,(m,n)=>String.fromCodePoint(parseInt(n,10))).replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"')
    .replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
}
function validDramaTitle(value) {
  const title=htmlText(value);
  if(!title||title.length>100)return "";
  const compact=title.replace(/[\s\u00a0]+/g,"");
  if(/^(?:都市|现代|古风|古装|校园|熟女|原创|魔改|AI短剧|AI漫剧|真人短剧|AI真人短剧)(?:标签)?(?:短剧|剧集|频道|作品)?$/i.test(compact))return "";
  return title;
}
function chooseDramaTitle(values) {
  for(const value of values||[]){const title=validDramaTitle(value);if(title)return title;}
  return "";
}
function fail(code,message) { throw host.error(code,message); }
function originOf(value) {
  const m=/^https?:\/\/[^/?#]+/i.exec(str(value));
  return m?m[0].replace(/^http:/i,"https:"):"";
}
async function request(url,referer,timeout) {
  const origin=originOf(url);
  if(origin!==SITE_ORIGIN)fail("E_HOST","黄瓜短剧仅允许访问官方主站 hgdju.com");
  const r=await host.http.request({url,headers:referer?{Referer:referer}:{},timeout:timeout||20000});
  if(!r||r.status<200||r.status>=300)fail(r&&r.status===404?"E_NOT_FOUND":"E_HTTP","黄瓜短剧请求失败 HTTP "+(r?r.status:0)+"："+url);
  return r;
}
async function getText(url,referer,timeout) {
  const r=await request(url,referer,timeout);
  const finalUrl=str(r.url)||url;
  if(originOf(finalUrl)!==SITE_ORIGIN)fail("E_HOST","黄瓜短剧主站响应跳转到了非官方域名，已阻止访问");
  return {body:str(r.body),url:finalUrl,headers:r.headers||{},status:Number(r.status)||0};
}
async function getHost() { return SITE_ORIGIN; }
async function pageWithRefresh(url,referer,validator) {
  const r=await getText(url,referer);
  if(validator&&!validator(r.body,r.url,r))fail("E_PARSE","黄瓜短剧官方主站页面结构不可用");
  return r.body;
}
function safeMediaAddress(value) {
  const m=/^(https?:\/\/[^/?#]+)([^?#]*)/i.exec(str(value));
  return m?m[1]+(m[2]||"/"):"";
}
function responseHeader(headers,name) {
  const target=String(name||"").toLowerCase();
  for(const key of Object.keys(headers||{})) if(String(key).toLowerCase()===target)return str(headers[key]);
  return "";
}
async function probeMedia(media,referer) {
  async function one(label,headers) {
    const info={mode:label,status:0,finalUrl:"",contentType:"",contentRange:"",acceptRanges:"",bytes:0,body:"",error:""};
    try {
      const r=await host.http.request({url:media,headers:Object.assign({Referer:referer||"",Accept:"*/*"},headers||{}),timeout:9000});
      info.status=Number(r&&r.status)||0;
      info.finalUrl=safeMediaAddress(r&&r.url||media);
      info.contentType=responseHeader(r&&r.headers,"content-type");
      info.contentRange=responseHeader(r&&r.headers,"content-range");
      info.acceptRanges=responseHeader(r&&r.headers,"accept-ranges");
      const body=r&&r.body;
      const value=typeof body==="string"?body:(body&&typeof body.toString==="function"?body.toString():"");
      info.bytes=value.length;
      info.body=value.replace(/[\\r\\n\\t]+/g," ").slice(0,160);
    } catch(e) { info.error=String(e&&e.message||e).slice(0,240); }
    try { host.log("[黄瓜媒体探测] "+JSON.stringify(info)); }
    catch(e) { host.log("[黄瓜媒体探测] "+label+" status="+info.status+" type="+info.contentType+" body="+info.body+" error="+info.error); }
    return info;
  }
  const ranged=await one("range",{"Range":"bytes=0-1"});
  if(ranged.status>=200&&ranged.status<300)return ranged;
  // 有些 CDN 不接受 m3u8 的 Range 请求；再用普通 GET 区分 Range 限制与资源本身被拒绝。
  return await one("normal-get",{});
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
  if(v.startsWith("/")&&!v.startsWith("//"))return siteHost+v;
  if(/^https?:\/\//i.test(v)&&!/\s/.test(v)){let ext=v.split(/[?#]/)[0].split(".").pop();if(!/^(jpeg|jpg|png|webp)$/i.test(ext))ext="jpeg";return siteHost+"/_img/"+base64Raw(v)+"."+ext;}
  const f=str(fallback);if(f.startsWith("/")&&!f.startsWith("//"))return siteHost+f;if(/^https?:\/\//i.test(f))return f;return "";
}
function cardImage(segment) {
  const tags=segment.match(IMG_TAG_RE)||[];
  for(const tag of tags.slice(0,16)){
    const attrs={};let m;IMG_ATTR_RE.lastIndex=0;
    while((m=IMG_ATTR_RE.exec(tag))!==null)attrs[m[1].toLowerCase()]=str(m[2]);
    for(const k of ["data-src","data-original","data-lazy-src","src","srcset"]){
      let raw=str(attrs[k]);if(k==="srcset")raw=raw.split(",")[0].trim().split(/\s+/)[0];
      if(!raw||/^data:/i.test(raw))continue;
      if(COVER_PATH_RE.test(raw))return{cover:COVER_PATH_RE.exec(raw)[1],title:attrs.alt||""};
      if(/^https?:\/\//i.test(raw)||raw.startsWith("/"))return{cover:raw,title:attrs.alt||""};
    }
  }
  return{cover:"",title:""};
}
function hasDramaCards(body) {
  const html=String(body||"");
  return /<article\b(?=[^>]*\bdata-xpch=["']card-drama["'])/i.test(html) ||
    /href=["'][^"']*\/(?:video|drama)\/[a-zA-Z0-9_-]+/i.test(html);
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
    const headings=[];
    const headingRe=/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
    let headingMatch;
    while((headingMatch=headingRe.exec(segment))!==null)headings.push(headingMatch[1]);
    const cleanAria=htmlText(aria).replace(/\s*详情\s*$/,"");
    const title=chooseDramaTitle([entry&&entry.title,...headings,cleanAria,image.title,titleAttr]);
    if(!title)continue;
    let cover=image.cover?coverAddress(siteHost,image.cover,""):"";if(!cover&&entry)cover=coverAddress(siteHost,entry.cover,entry.fallback);
    const ep=EPISODE_RE.exec(segment),heat=HEAT_RE.exec(segment),count=ep?Number(ep[1]):(entry?entry.episodes:0);
    const item={id:alias,title,remarks:count>0?"更新至"+count+"集":""};
    const views=heat?heat[1]+"热度":(entry&&entry.heat?entry.heat+"热度":"");
    if(cover)item.cover=cover;if(views)item.views=views;seen[alias]=true;items.push(item);
  }
  // 搜索页存在不同卡片模板：当 article 模板未命中时，从真实剧集链接提取卡片，
  // 标题优先取 aria-label/title/img alt，再取链接文本；不把首页普通链接当剧集。
  {
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
      const headingTexts=[];
      const headingRe=/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
      let headingMatch;
      while((headingMatch=headingRe.exec(inner))!==null)headingTexts.push(headingMatch[1]);
      const title=chooseDramaTitle([entry&&entry.title,...headingTexts,aria,alt,inner,titleAttr]);
      if(!title||title.length>100)continue;
      const context=String(body||"").slice(Math.max(0,match.index-500),Math.min(String(body||"").length,linkRe.lastIndex+700));
      const image=cardImage(context);
      let cover=image.cover?coverAddress(siteHost,image.cover,""):"";
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
    const ariaLabel=htmlText(anchor.attr("aria-label")).replace(/\s*详情\s*$/,"");
    const titleAttr=htmlText(anchor.attr("title"));
    // 搜索页的全局导航/推荐链接也可能指向 /video/<id>/。
    // 只有带封面或明确标题属性的链接才视为结果卡片，禁止用任意链接文本兜底。
    if(!img&&!ariaLabel&&!titleAttr)continue;
    const anchorText=anchor.text();
    const title=chooseDramaTitle([
      entry&&entry.title,
      img?img.attr("alt"):"",
      titleAttr,
      ariaLabel
    ]);
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
  const html=String(body||"");
  const sourceMatch = PLAY_URL_RE.exec(html);
  if (sourceMatch && /^https?:/i.test(sourceMatch[1])) return unescapePlayUrl(sourceMatch[1]);
  const escapedMatch = ESCAPED_M3U8_RE.exec(html);
  if (escapedMatch) return unescapePlayUrl(escapedMatch[0]);
  const genericMatch = M3U8_RE.exec(html);
  if(genericMatch)return unescapePlayUrl(genericMatch[0]);
  // 数字 ID 详情页可能直接把播放地址放在 video/source 标签中，而非 /play/{id}/1 页面。
  const mediaTag=/<(?:video|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(html);
  if(mediaTag&&/^https?:/i.test(mediaTag[1]))return unescapePlayUrl(mediaTag[1]);
  const mp4=/(?:https?:)?\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?/i.exec(html);
  return mp4?unescapePlayUrl(mp4[0]):"";
}
const CATEGORY_CACHE_PREFIX = "huanggua.category.v3."; // 分页路由修复后废弃旧版错误分页缓存
const CATEGORY_CACHE_TTL = 10 * 60 * 1000;
const CATEGORY_PATHS = {
  yuanchuang: ["/browse?line=yuanchuang"],
  aiduanju: ["/browse?line=aiduanju"],
  mogai: ["/browse?line=mogai"],
  manju: ["/browse?line=manju"],
  zhenren: ["/browse?line=zhenren"],
  browse: ["/browse"]
};

// 不同宿主版本传入分类参数的字段可能不同：优先使用规范 id，
// 同时兼容 categoryId/category/key/name 及直接传入分类对象的情况。
function resolveCategoryId(value) {
  let raw=value;
  if(raw&&typeof raw==="object"&&!Array.isArray(raw)) {
    raw=raw.id??raw.categoryId??raw.category_id??raw.key??raw.value??raw.category??raw.name??raw.title??"";
  }
  const input=str(raw);
  // 宿主的“推荐”入口可能以空 ID 调用 category；黄瓜的推荐列表对应 /browse。
  // 仅将空值映射为 browse，未知的非空分类仍保持严格校验。
  if(!input)return "browse";
  const normalized=input.toLowerCase().replace(/[\\s_-]+/g,"");
  const aliases={
    yuanchuang:["yuanchuang","原创短剧","原创"],
    aiduanju:["aiduanju","ai短剧","ai"],
    mogai:["mogai","魔改"],
    manju:["manju","漫剧"],
    zhenren:["zhenren","真人","真人短剧"],
    browse:["browse","recommend","recommendation","推荐","全部","全部短剧","全部分类"]
  };
  for(const id of Object.keys(aliases)) {
    if(aliases[id].some(alias=>alias.toLowerCase().replace(/[\\s_-]+/g,"")===normalized))return id;
  }
  return "";
}

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
function searchResultPage(body) {
  const title=(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(body||""))||[])[1]||"";
  const m=/(?:第|page\s*)(\d+)\s*(?:页|page)/i.exec(htmlText(title));
  return m?Number(m[1])||0:0;
}
function pagePaths(category,page,links) {
  const id=str(category),bases=CATEGORY_PATHS[id]||[];
  if(page===1)return bases.slice();
  // 已确认的站点分页路由：全部浏览不带 line，具体分类必须保留 line 参数。
  // 先请求确定的规范地址，避免首页分页锚点缺失/过期时把翻页请求卡在第一页。
  const suffix=id==="browse"?"":"?line="+encodeURIComponent(id);
  const canonical="/browse/page-"+page+suffix;
  const candidates=[canonical];
  if(links&&links[page]&&!candidates.includes(links[page]))candidates.push(links[page]);
  if(page===2&&links&&links.next&&!candidates.includes(links.next))candidates.push(links.next);
  return candidates;
}
async function fetchCategoryPage(h,category,page) {
  const bases=CATEGORY_PATHS[str(category)]||[];
  let links={};
  if(page>1) {
    // 仅作备用：从第一页提取站点自带分页链接；不再依赖该请求成功才能翻页。
    for(const base of bases) {
      try {
        const first=await getText(h+base,h+"/");
        links=paginationLinks(first.body,h);
        if(links[page]||links.next)break;
      } catch(e) {}
    }
  }
  const candidates=pagePaths(category,page,links);
  let lastError=null;
  for(const target of candidates) {
    try {
      const url=/^https?:\/\//i.test(target)?target:h+target;
      const body=await pageWithRefresh(url,h+"/",b=>parseCards(b,h).length>0);
      const items=parseCards(body,h);
      if(items.length) {
        const nextLinks=paginationLinks(body,h);
        const numberedPages=Object.keys(nextLinks).filter(k=>k!=="next"&&Number(k)>0).map(Number);
        // 首屏即使没有解析到分页锚点，也不能直接向宿主报告“没有下一页”；
        // 否则客户端不会触发 page=2。后续页仍优先按官网分页链接判断，
        // 没有分页锚点时以满页数量作为兜底，避免无休止请求空页。
        const hasMore=!!nextLinks.next||numberedPages.some(n=>n>page)||
          (page===1&&items.length>0)||(numberedPages.length===0&&items.length>=12);
        return {items,hasMore};
      }
      lastError=host.error("E_PARSE","该分页没有解析到剧集");
    } catch(e) { lastError=e; }
  }
  throw lastError||host.error("E_PARSE","黄瓜短剧分页地址不可用");
}
async function listCategory(page,categoryValue) {
  const p=Math.max(1,Math.floor(Number(page)||1));
  const category=resolveCategoryId(categoryValue);
  if(!category) {
    try { host.log("[黄瓜分类参数] invalid="+JSON.stringify(categoryValue)); } catch(e) {}
    fail("E_PARSE","黄瓜短剧分类参数无效（收到："+str(categoryValue&&typeof categoryValue==="object"?(categoryValue.id??categoryValue.categoryId??categoryValue.name??JSON.stringify(categoryValue)):categoryValue||"空值")+"）");
  }
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
function rememberSearchItemHost(items,siteHost) {
  for(const item of items||[]) {
    const id=str(item&&item.id);
    if(!/^[a-zA-Z0-9-]+$/.test(id))continue;
    try { host.storage.set(SEARCH_ITEM_HOST_PREFIX+id,siteHost); } catch(e) {}
  }
}
function rememberedSearchItemHost(id) { return SITE_ORIGIN; }
function normalizeSearchText(value) {
  return str(value).toLowerCase().replace(/[\s.,!?;:，。！？；：、·"'“”‘’（）()\[\]{}<>《》…—_-]+/g,"");
}
function filterSearchItems(items,keyword) {
  const q=normalizeSearchText(keyword);
  if(!q)return [];
  const seen={},out=[];
  for(const item of items||[]) {
    const id=str(item&&item.id),title=normalizeSearchText(item&&item.title);
    // 搜索结果标题必须实际包含完整关键词；不把页面导航、推荐卡片或宽泛前缀结果混入。
    if(!id||!title||!title.includes(q)||seen[id])continue;
    seen[id]=true;out.push(item);
  }
  return out;
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
const SEARCH_ITEM_HOST_PREFIX = "huanggua.searchItemHost."; // 仅兼容旧数据；所有详情固定走官方主站


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

function searchPathVariants(term) {
  const encoded=encodeURIComponent(term);
  return [
    "/search?q="+encoded,
    "/search?keyword="+encoded,
    "/search?query="+encoded,
    "/search/video/"+encoded+"/",
    "/search/"+encoded
  ];
}
function searchPageCandidates(path,page,links) {
  if(page===1)return [path];
  if(links&&links[page])return [links[page]];
  if(links&&links.next&&pageNumberFromHref(links.next)===page)return [links.next];
  const hash=path.includes("?")?"&":"?";
  const candidates=[path+hash+"page="+page,path+hash+"p="+page];
  if(!path.includes("?")) {
    const root=path.endsWith("/")?path:path+"/";
    candidates.push(root+page+"/",root+"page-"+page+"/");
  }
  return candidates;
}
async function searchDramas(keyword,page=1) {
  const q=str(keyword),p=Math.max(1,Math.floor(Number(page)||1));
  if(!q)return {items:[],page:p,hasMore:false};
  // 新版主站使用 /drama/<slug> 卡片；不再把已停止访问的旧数字 ID 域名作为搜索入口。
  let h=await getHost(false,true);
  const variants=searchKeywordVariants(q);
  let lastError=null;
  for(const term of variants) {
    for(const firstPath of searchPathVariants(term)) {
      try {
        let links={},target=firstPath;
        if(p>1) {
          const first=await getText(h+firstPath,h+"/",20000);
          h=originOf(first.url)||h;
          if(!hasDramaCards(first.body))continue;
          links=paginationLinks(first.body,h);
          const pageTargets=searchPageCandidates(firstPath,p,links);
          let found=false;
          for(const candidate of pageTargets) {
            try {
              const check=await getText(/^https?:\/\//i.test(candidate)?candidate:h+candidate,h+"/",20000);
              if(hasDramaCards(check.body)) { target=candidate;found=true;break; }
            } catch(e) {}
          }
          if(!found)continue;
        }
        const requestUrl=/^https?:\/\//i.test(target)?target:h+target;
        const result=await getText(requestUrl,h+"/",20000);
        h=originOf(result.url)||h;
        searchDiagnostics(result.body,result,term,p,requestUrl);
        if(!hasDramaCards(result.body))continue;
        const candidates=parseCards(result.body,h);
        const items=filterSearchItems(candidates,q);
        host.log("[黄瓜搜索解析] term="+term+" page="+p+" articleCandidates="+candidates.length+
          " matched="+items.length+" titles="+JSON.stringify(candidates.slice(0,12).map(x=>x.title)));
        if(items.length) {
          const nextLinks=paginationLinks(result.body,h);
          rememberSearchItemHost(items,h);
          const hasMore=!!nextLinks.next||Object.keys(nextLinks).some(k=>k!=="next"&&Number(k)>p);
          return {items,page:p,hasMore};
        }
        lastError=host.error("E_PARSE","新版搜索页未返回标题匹配的剧集卡片");
      } catch(e) {
        lastError=e;
        host.log("[黄瓜搜索异常] term="+term+" page="+p+" path="+firstPath+" error="+str(e&&e.message||e).slice(0,240));
      }
    }
  }
  throw lastError||host.error("E_NOT_FOUND","黄瓜短剧没有找到匹配的搜索结果");
}
function detailDiagnostics(body,response,alias,requestedUrl) {
  const html=String(body||"");
  const h1=(H1_RE.exec(html)||[])[1]||"";
  const pageTitle=(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)||[])[1]||"";
  const visible=htmlText(html);
  const playLinks=[],hrefRe=/\bhref\s*=\s*["']([^"']*\/play\/[^"']*)["']/gi;
  let m;
  while((m=hrefRe.exec(html))!==null&&playLinks.length<20) {
    const value=m[1].replace(/&amp;/g,"&").replace(/\\\//g,"/");
    if(!playLinks.includes(value))playLinks.push(value);
  }
  const routeLinks=[],routeRe=/\bhref\s*=\s*["']([^"']*\/(?:video|drama)\/[^"']*)["']/gi;
  while((m=routeRe.exec(html))!==null&&routeLinks.length<12) {
    const value=m[1].replace(/&amp;/g,"&").replace(/\\\//g,"/");
    if(!routeLinks.includes(value))routeLinks.push(value);
  }
  const blocked=/(已停止访问|停止访问|停止提供服务|页面不存在|内容不存在|已下架|无法访问)/i.test(visible);
  const info={
    id:alias,requestedUrl:requestedUrl||"",finalUrl:str(response&&response.url),
    status:Number(response&&response.status)||0,bytes:html.length,
    pageTitle:htmlText(pageTitle).slice(0,160),h1:htmlText(h1).slice(0,160),
    blockedText:blocked,blockedExcerpt:(visible.match(/.{0,35}(?:已停止访问|停止访问|停止提供服务|页面不存在|内容不存在|已下架|无法访问).{0,55}/i)||[])[0]||"",
    playLinkCount:playLinks.length,playLinks:playLinks.slice(0,12),
    embeddedMediaFound:!!parsePlayUrl(html),
    embeddedMediaHost:(function(){const media=parsePlayUrl(html);const m=/^https?:\/\/([^/]+)/i.exec(media);return m?m[1]:"";})(),
    videoTagCount:(html.match(/<video\b/gi)||[]).length,
    sourceUrlMarker:/source_url|m3u8|mp4/i.test(html),
    detailLinks:routeLinks.slice(0,8),bodyText:visible.slice(0,420)
  };
  try { host.log("[黄瓜详情诊断] "+JSON.stringify(info)); }
  catch(e) { host.log("[黄瓜详情诊断] id="+alias+" status="+info.status+" bytes="+info.bytes+" title="+info.pageTitle+" h1="+info.h1+" playLinks="+info.playLinkCount+" blocked="+blocked); }
}
async function getDetail(alias) {
  alias=str(alias);
  if(!/^[a-zA-Z0-9-]+$/.test(alias))fail("E_PARSE","黄瓜短剧剧集 ID 无效");
  const numeric=/^\d+$/.test(alias);
  // 搜索结果的数字 ID 始终来自已验证的搜索站点，不能依赖可能丢失的本地 storage 映射。
  let h=rememberedSearchItemHost(alias)||await getHost();
  const route=numeric?"/video/":"/drama/";
  const url=h+route+encodeURIComponent(alias)+"/";
  const response=await getText(url,h+"/",20000);
  h=originOf(response.url)||h;
  const body=response.body;
  detailDiagnostics(body,response,alias,url);
  const h1=(H1_RE.exec(body)||[])[1]||"";
  const pageTitle=(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)||[])[1]||"";
  const title=htmlText(h1)||htmlText(pageTitle).replace(/\s*[-|｜]\s*黄瓜短剧.*$/i,"").trim();
  if(!title)fail("E_PARSE","黄瓜短剧详情页未解析到标题，请查看详情诊断日志");
  const dm=DESC_RE.exec(body),payload=parsePayload(body)[alias];
  let cover=payload?coverAddress(h,payload.cover,payload.fallback):"";
  if(!cover){const image=cardImage(body);if(image.cover)cover=coverAddress(h,image.cover,"");}
  const chapters=chaptersFor(body,alias);
  // 被站点拦截/停止访问的页面即使残留媒体 URL，也不能伪装成可播放正片。
  if(chapters.length===0&&/(已停止访问|停止访问|停止提供服务|页面不存在|内容不存在|已下架|无法访问)/i.test(htmlText(body))) {
    fail("E_UNAVAILABLE","黄瓜短剧详情页已被站点停止访问，页面中的媒体地址不可视为有效剧集");
  }
  // 部分正常详情页不提供 /play/ 链接，而是在详情 HTML 中直接嵌入媒体地址。
  if(chapters.length===0&&parsePlayUrl(body))chapters.push({id:alias+"/1",name:"正片"});
  return{title,cover,desc:dm?htmlText(dm[1]):"",chapters};
}
export default {
  async home(){
    const categories=CATEGORIES.filter(c=>str(c.id)!=="");
    // The home carousel is explicit home data, not an inferred category feed.
    // Use the site's own 推荐/browse endpoint and return up to five real items.
    try {
      const result=await listCategory(1,"browse");
      return {categories,items:(result.items||[]).slice(0,5)};
    } catch(e) {
      host.log("[首页TOP5] 推荐数据加载失败："+str(e&&e.message||e));
      return {categories,items:[]};
    }
  },
  async category(args={}) {
    const input=args&&typeof args==="object"?args:{id:args};
    const page=input.page??1;
    const categoryValue=input.id??input.categoryId??input.category_id??input.key??input.value??input.category??input.name??input.title??"";
    const r=await listCategory(page,categoryValue);
    return {items:r.items,page:Math.max(1,Number(page)||1),hasMore:r.hasMore};
  },
  async search({keyword,page=1}){return await searchDramas(keyword,page);},
  async detail({id}){const r=await getDetail(id);return{title:r.title,cover:r.cover,desc:r.desc,lines:[{name:"默认线路",episodes:r.chapters}]};},
  async play({episodeId}){
    let stage="validate episode";
    try {
      const p=str(episodeId).split("/");
      if(p.length!==2||!/^[a-zA-Z0-9-]+$/.test(p[0])||!/^\d+$/.test(p[1]))fail("E_PARSE","黄瓜短剧集 ID 无效");
      const numeric=/^\d+$/.test(p[0]);
      if(numeric&&Number(p[1])!==1)fail("E_NOT_FOUND","该详情页只提供一个可直接播放的正片地址");
      stage="resolve host";
      let h=rememberedSearchItemHost(p[0])||await getHost();
      let url=numeric
        ? h+"/video/"+encodeURIComponent(p[0])+"/"
        : h+"/play/"+encodeURIComponent(p[0])+"/"+Number(p[1]);
      stage="fetch play page";
      let body;
      if(numeric||rememberedSearchItemHost(p[0])) {
        const playResponse=await getText(url,numeric?h+"/":url,20000);
        body=playResponse.body;
        url=playResponse.url||url;
        h=originOf(url)||h;
      } else {
        body=await pageWithRefresh(url,url,b=>!!parsePlayUrl(b));
      }
      stage="parse media URL";
      const media=parsePlayUrl(body);
      if(!media)fail("E_PARSE","黄瓜短剧详情页未提取到媒体地址；请查看详情诊断日志");
      stage="probe media response";
      await probeMedia(media,url);
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
