// 黄瓜短剧 · iDuanJu idj1 插件（由 GuoApp 黄瓜短剧 1.0.2 适配）
const NAV_URL = "https://hgdju.com/homeward";
const LEGACY_NAV_URLS = ["https://hgdja1.com/"];
const CACHE_KEY = "huanggua.latestHost.v1";
const CACHE_TTL = 30 * 60 * 1000;
const SEED_HOSTS = ["https://hgdj17.com","https://hgdjb15.com","https://hgdj1.app","https://abc.ywwegfkd.cc","https://qwer.ywwegfkd.cc","https://xyz.ywwegfkd.cc","https://mkqjue.eyrkjyudz.cc","https://porncz.eyrkjyudz.cc","https://rixgqa.eyrkjyudz.cc"];
const ALLOWED_SUFFIXES = ["hgdju.com","hgdja1.com","hgdj1.app","hgdj17.com","hgdjb15.com","ywwegfkd.cc","eyrkjyudz.cc"];
const CATEGORIES = [{id:"",name:"推荐"},{id:"aiduanju",name:"AI短剧"},{id:"manju",name:"AI漫剧"},{id:"mogai",name:"AI魔改"},{id:"zhenren",name:"真人短剧"},{id:"yuanchuang",name:"原创短剧"},{id:"browse",name:"全部"}];
const CATEGORY_IDS = ["","aiduanju","manju","mogai","zhenren","yuanchuang","browse"];
const CARD_SPLIT = '<article data-xpch="card-drama"';
const ALIAS_RE = /href="\/drama\/([a-zA-Z0-9-]+)"/;
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
  return {body:str(r.body),url:str(r.url)||url,headers:r.headers||{}};
}
function readCachedHost() {
  try {
    const v=host.storage.get(CACHE_KEY),p=typeof v==="string"?JSON.parse(v):v;
    if(p&&typeof p.host==="string"&&allowedHost(p.host))return p.host;
  } catch(e) {}
  return "";
}
function writeCachedHost(v) { try{host.storage.set(CACHE_KEY,JSON.stringify({host:v,updatedAt:Date.now()}));}catch(e){} }
async function validateHost(c) {
  try { const p=await getText(c+"/aiduanju",c+"/",12000);return p.body.includes("黄瓜短剧")&&p.body.includes("/drama/"); }
  catch(e){return false;}
}
async function getHost(forceRefresh) {
  if(!forceRefresh&&memoryHost&&Date.now()-memoryHostAt<CACHE_TTL)return memoryHost;
  if(!forceRefresh){const saved=readCachedHost();if(saved){memoryHost=saved;memoryHostAt=Date.now();return saved;}}
  const candidates=[],seen={};
  for(const address of [NAV_URL].concat(LEGACY_NAV_URLS)){
    try{
      const r=await getText(address,address,15000);
      addCandidate(candidates,seen,r.url);
      addCandidate(candidates,seen,r.headers.location||r.headers.Location||"");
      for(const found of extractCandidates(r.body))addCandidate(candidates,seen,found);
    }catch(e){}
  }
  for(const seed of SEED_HOSTS)addCandidate(candidates,seen,seed);
  addCandidate(candidates,seen,memoryHost);addCandidate(candidates,seen,readCachedHost());
  for(const c of candidates){if(await validateHost(c)){memoryHost=c;memoryHostAt=Date.now();writeCachedHost(c);return c;}}
  fail("E_NETWORK","黄瓜短剧未发现可用线路。请先开启 VPN 刷新最新地址，再关闭 VPN 重试");
}
async function pageWithRefresh(url,referer,validator) {
  try{const r=await getText(url,referer);if(!validator||validator(r.body))return r.body;}catch(e){}
  const fresh=await getHost(true),m=/^https?:\/\/[^/]+(\/[^?#]*)?(?:[?#].*)?$/i.exec(url),path=m&&m[1]?m[1]:"/";
  const r=await getText(fresh+path,fresh+"/");
  if(validator&&!validator(r.body))fail("E_PARSE","黄瓜短剧最新地址已刷新，但页面结构仍不可用");
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
function parseCards(body,siteHost) {
  const segments=body.split(CARD_SPLIT);if(segments.length<2)return[];
  const payload=parsePayload(body),seen={},items=[];
  for(const segment of segments.slice(1)){
    const m=ALIAS_RE.exec(segment),alias=m?str(m[1]):"";if(!alias||seen[alias])continue;
    const image=cardImage(segment),entry=payload[alias]||null,title=str(image.title||(entry&&entry.title)||"");if(!title)continue;
    let cover=image.cover?siteHost+image.cover:"";if(!cover&&entry)cover=coverAddress(siteHost,entry.cover,entry.fallback);
    const ep=EPISODE_RE.exec(segment),heat=HEAT_RE.exec(segment),count=ep?Number(ep[1]):(entry?entry.episodes:0);
    const item={id:alias,title,remarks:count>0?"更新至"+count+"集":""};
    const views=heat?heat[1]+"热度":(entry&&entry.heat?entry.heat+"热度":"");
    if(cover)item.cover=cover;if(views)item.views=views;seen[alias]=true;items.push(item);
  }
  return items;
}
function chaptersFor(body,alias) {
  const re=new RegExp("/play/"+alias+"/(\\d+)","g"),seen={},out=[];let m;
  while((m=re.exec(body))!==null){const n=Number(m[1]);if(n>0&&n<=9999)seen[n]=true;}
  for(const n of Object.keys(seen).map(Number).sort((a,b)=>a-b))out.push({id:alias+"/"+n,name:"第"+n+"集"});
  if(!out.length)out.push({id:alias+"/1",name:"第1集"});
  return out;
}
function parsePlayUrl(body) {
  const s=PLAY_URL_RE.exec(body);
  if(s&&/^https?:/i.test(s[1]))return s[1].replace(/\\\\u002[Ff]/g,"/").replace(/\\\\u0026/g,"&").replace(/\\\\\\//g,"/");
  const e=ESCAPED_M3U8_RE.exec(body);if(e)return e[0].replace(/\\\\u002[Ff]/g,"/").replace(/\\\\\\//g,"/");
  const g=M3U8_RE.exec(body);return g?g[0]:"";
}
async function listCategory(page,category) {
  const p=Math.max(1,Math.floor(Number(page)||1));if(p>1)return{items:[],hasMore:false};
  if(!CATEGORY_IDS.includes(str(category)))fail("E_PARSE","黄瓜短剧分类无效");
  const h=await getHost(),path=category===""?"/":"/"+category;
  const body=await pageWithRefresh(h+path,h+"/",b=>b.includes("黄瓜短剧")&&b.includes(CARD_SPLIT));
  const items=parseCards(body,h);if(!items.length)fail("E_PARSE","黄瓜短剧没有返回剧集，请稍后重试");
  return{items,hasMore:false};
}
async function getDetail(alias) {
  alias=str(alias);if(!/^[a-zA-Z0-9-]+$/.test(alias))fail("E_PARSE","黄瓜短剧剧集 ID 无效");
  const h=await getHost(),url=h+"/drama/"+encodeURIComponent(alias);
  const body=await pageWithRefresh(url,h+"/",b=>/<h1\b/i.test(b)),tm=H1_RE.exec(body),title=tm?htmlText(tm[1]):"";
  if(!title)fail("E_PARSE","黄瓜短剧未返回剧集信息");
  const dm=DESC_RE.exec(body),payload=parsePayload(body)[alias];let cover=payload?coverAddress(h,payload.cover,payload.fallback):"";
  if(!cover){const image=cardImage(body);if(image.cover)cover=h+image.cover;}
  return{title,cover,desc:dm?htmlText(dm[1]):"",chapters:chaptersFor(body,alias)};
}
export default {
  async home(){return{categories:CATEGORIES};},
  async category({id="",page=1}){const r=await listCategory(page,id);return{items:r.items,page:Math.max(1,Number(page)||1),hasMore:r.hasMore};},
  async search({keyword}){if(!str(keyword))return{items:[],hasMore:false};fail("E_UNSUPPORTED","黄瓜短剧当前站点没有可用的搜索接口");},
  async detail({id}){const r=await getDetail(id);return{title:r.title,cover:r.cover,desc:r.desc,lines:[{name:"默认线路",episodes:r.chapters}]};},
  async play({episodeId}){
    const p=str(episodeId).split("/");if(p.length!==2||!/^[a-zA-Z0-9-]+$/.test(p[0])||!/^\d+$/.test(p[1]))fail("E_PARSE","黄瓜短剧集 ID 无效");
    const h=await getHost(),url=h+"/play/"+encodeURIComponent(p[0])+"/"+Number(p[1]);
    const body=await pageWithRefresh(url,url,b=>!!parsePlayUrl(b)),media=parsePlayUrl(body);
    if(!media)fail("E_PARSE","黄瓜短剧没有返回播放地址");
    return{streams:[{name:"默认",url:media,format:/\\.m3u8(?:[?#]|$)/i.test(media)?"hls":"mp4",headers:{Referer:url}}]};
  }
};
