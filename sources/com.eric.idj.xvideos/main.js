// XVideos · iDuanJu idj1 video plugin
// Mirrors the app's native XVideos listing/detail/player extraction.
// Playback, safety filtering and sandboxing remain controlled by the host app.
const BASE = "https://www.xvideos.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
const CATEGORIES = [{id:"new",name:"最新"},{id:"best",name:"上月最佳"}];
const BLOCKED = ["underage","under age","minor ","minors","preteen","pre-teen","child","kid ","kids","loli","shota","schoolgirl","school girl","jailbait","rape","raped","forced","non-consensual","nonconsensual","non consent","drugged","unconscious","sleeping","passed out","hidden cam","hidden camera","spy cam","upskirt","未成年","幼女","萝莉","蘿莉","中学生","中學生","小学生","小學生","强奸","強姦","强暴","迷奸","迷姦","偷拍","下药","下藥"];
function str(v){return v==null?"":String(v).trim();}
function fail(code,message){throw host.error(code,message);}
function cleanText(v){return str(v).replace(/<[^>]*>/g," ").replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(parseInt(n,10))).replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();}
function safeTitle(title){const t=" "+str(title).toLowerCase()+" ";return !BLOCKED.some(w=>t.includes(w));}
function escRE(s){return s.replace(/[.*+?^$()|[\]\\]/g,"\\$&");}
function groups(pattern,text,flags){return new RegExp(pattern,flags||"").exec(String(text||""));}
function previousMonth(){const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0");}
function categoryPath(id,page){const p=Math.max(1,Math.floor(Number(page)||1));if(id==="new")return p===1?"/":"/new/"+(p-1);if(id==="best"){const m=previousMonth();return p===1?"/best/"+m:"/best/"+m+"/"+(p-1);}fail("E_PARSE","XVideos 分类无效");}
async function request(url,referer,timeout){const r=await host.http.request({url,headers:{"User-Agent":UA,"Referer":referer||BASE+"/"},timeout:timeout||25000});if(!r||r.status<200||r.status>=300)fail(r&&r.status===404?"E_NOT_FOUND":"E_HTTP","XVideos 请求失败 HTTP "+(r?r.status:0)+"："+url);return{body:str(r.body),url:str(r.url)||url,headers:r.headers||{}};}
function parseDuration(s){const t=cleanText(s);if(/^\d+:\d{2}(?::\d{2})?$/.test(t)){const a=t.split(":").map(Number);return a.length===3?a[0]*3600+a[1]*60+a[2]:a[0]*60+a[1];}let n=0,m;if((m=/(\d+)\s*h/i.exec(t)))n+=Number(m[1])*3600;if((m=/(\d+)\s*min/i.exec(t)))n+=Number(m[1])*60;if((m=/(\d+)\s*sec/i.exec(t)))n+=Number(m[1]);return n;}
function absURL(u){let v=str(u).replace(/&amp;/gi,"&");if(!v||/^(?:data:|blob:|javascript:)/i.test(v))return"";if(v.startsWith("//"))return"https:"+v;if(v.startsWith("/"))return BASE+v;if(/^https?:\/\//i.test(v))return v;return"";}
function attr(tag,name){const re=new RegExp("(?:^|\\s)"+name+"\\s*=\\s*([\"'])(.*?)\\1","i");const m=re.exec(tag);return m?m[2]:"";}
function parseList(html,page){
 const source=String(html||""),chunks=source.split(/thumb-block/i).slice(1),seen=Object.create(null),items=[];
 for(const raw of chunks){
  const card=raw.slice(0,9000);
  const anchors=[...card.matchAll(/<a\b[^>]*\bhref\s*=\s*(['"])(.*?)\1[^>]*>/gi)];
  let path="";
  for(const a of anchors){
   const href=str(a[2]).replace(/&amp;/gi,"&");
   const m=/^(?:https?:\/\/(?:www\.)?xvideos\.com)?(\/video[.-][a-z0-9]+(?:\/[^?#"'<>\\\s]*)?)/i.exec(href);
   if(m){path=m[1];break;}
  }
  if(!path||seen[path])continue;
  const titleCandidates=[];
  for(const a of anchors){const t=attr(a[0],"title");if(t)titleCandidates.push(t);}
  const titleMatch=/<(?:p|div|span)[^>]*class\s*=\s*["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]{0,800}?)<\/(?:p|div|span)>/i.exec(card);
  if(titleMatch){const t=/<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(titleMatch[1]);if(t)titleCandidates.unshift(t[1].replace(/<[^>]*>/g," "));}
  const imgTags=[...card.matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
  let cover="";
  for(const tag of imgTags){
   const candidates=["data-src","data-original","data-thumb","data-lazy-src","src"];
   for(const key of candidates){const v=absURL(attr(tag,key));if(v&&!/blank|placeholder|transparent|pixel/i.test(v)){cover=v;break;}}
   if(cover)break;
   const srcset=attr(tag,"data-srcset")||attr(tag,"srcset");
   if(srcset){const first=srcset.split(",")[0].trim().split(/\s+/)[0];cover=absURL(first);if(cover)break;}
  }
  const title=cleanText(titleCandidates.find(x=>cleanText(x))||"");
  if(!title||!safeTitle(title))continue;
  const dm=/<[^>]*class\s*=\s*["'][^"']*duration[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i.exec(card);
  const duration=dm?parseDuration(dm[1].replace(/<[^>]*>/g," ")):0;
  const item={id:path,title,remarks:duration>0?Math.floor(duration/60)+"分钟":""};
  if(cover){item.cover=cover;item.coverHeaders={Referer:BASE+"/", "User-Agent":UA};}
  items.push(item);seen[path]=true;
 }
 return{items,page:Math.max(1,Number(page)||1),hasMore:items.length>0};
}
function videoPath(id){
 let v=str(id);
 if(v.startsWith("[object Object]")||!v)fail("E_PARSE","XVideos 视频 ID 无效（收到空值或非字符串）");
 v=v.replace(/&amp;/gi,"&").replace(/\\\//g,"/");
 if(/^https?:\/\//i.test(v)){
  const m=/^https?:\/\/(?:www\.)?xvideos\.com(\/video[.-][a-z0-9]+(?:\/[^?#"'<>\\\s]*)?)/i.exec(v);
  if(!m)fail("E_PARSE","XVideos 视频 ID 无效："+v.slice(0,160));
  v=m[1];
 }
 v=v.split(/[?#]/,1)[0];
 if(/^video[.-]/i.test(v))v="/"+v;
 if(!v.startsWith("/"))v="/"+v;
 if(!/^\/video[.-][a-z0-9]+(?:\/[a-z0-9._~%+-]*)*\/?$/i.test(v))fail("E_PARSE","XVideos 视频 ID 无效："+v.slice(0,160));
 return v;
}
function playerString(raw){let v=cleanText(raw).trim().replace(/\\\//g,"/").replace(/\\u0026/gi,"&").replace(/\\x26/gi,"&").replace(/\\'/g,"'").replace(/\\"/g,'"').replace(/\\\\/g,"\\");return v.replace(/\\u([0-9a-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));}
function playerCall(fn,html){const p="html5player\\s*\\.\\s*"+escRE(fn)+"\\s*\\(\\s*",patterns=[p+"'((?:\\\\.|[^'\\\\])*)'\\s*\\)",p+'"((?:\\\\.|[^"\\\\])*)"\\s*\\)'];for(const re of patterns){const m=groups(re,html);if(m&&m[1])return playerString(m[1]);}return"";}
function mediaDiagnostics(html){
 const s=String(html||"");
 const count=re=>((s.match(re)||[]).length);
 const funcs=(s.match(/\bsetVideo[A-Za-z0-9_]*/gi)||[]).filter((v,i,a)=>a.indexOf(v)===i).slice(0,16);
 const keys=(s.match(/\b(?:flv_url|video_url|videoUrl|hls_url|hlsUrl|video_hls|urlHigh|urlLow|contentUrl|mediaDefinitions|sources)\b/gi)||[]).map(v=>v.toLowerCase()).filter((v,i,a)=>a.indexOf(v)===i).slice(0,20);
 function context(re){
  const m=re.exec(s);if(!m)return "无";
  return s.slice(Math.max(0,m.index-100),Math.min(s.length,m.index+260))
   .replace(/https?:\/\/[^\s"'<>\\]+/gi,"[URL]")
   .replace(/([?&](?:token|key|hash|sig|signature|expires|auth|ip)=)[^&"'\s<>]*/gi,"$1[REDACTED]")
   .replace(/[\r\n\t]+/g," ").replace(/\s{2,}/g," ").slice(0,300);
 }
 return [
  "HTML长度="+s.length,
  "html5player:"+count(/html5player/gi),
  "setVideo方法:"+ (funcs.join("/")||"无"),
  "媒体配置字段:"+ (keys.join("/")||"无"),
  "m3u8:"+count(/m3u8/gi),
  "mp4:"+count(/\.mp4/gi),
  "flv_url:"+count(/flv_url/gi),
  "setVideoURL上下文:"+context(/setVideoURL/i),
  "媒体配置上下文:"+context(/(?:video_url|videoUrl|hls_url|mediaDefinitions|sources)/i)
 ].join("；");
}
function mediaStreams(html,page){
 const source=String(html||""),out=[],seen=Object.create(null);
 function add(raw,label,format){
  let u=playerString(raw).trim().replace(/\\\//g,"/").replace(/\\u0026/gi,"&").replace(/&amp;/gi,"&");
  if(u.startsWith("//"))u="https:"+u;
  if(!/^https?:\/\//i.test(u))return;
  if(/^(?:https?:\/\/)?(?:www\.)?xvideos\.com\/video[.-]/i.test(u))return;
  // 不对完整 URL 执行 decodeURIComponent：签名参数中的 %2F/%2B 等必须原样保留。
  if(!/^https?:\/\//i.test(u)||seen[u])return;
  seen[u]=true;
  const inferred=/\.m3u8(?:[?#]|$)/i.test(u)?"hls":(/\.mp4(?:[?#]|$)/i.test(u)?"mp4":(format||"mp4"));
  out.push({name:label||qualityName("",u),url:u,format:inferred,headers:{Referer:page,"User-Agent":UA}});
 }
 function qualityName(label,url){
  const q=(String(label||"")+" "+String(url||"")).match(/\b(2160|1440|1080|720|480|360)\s*p?\b/i);
  if(q)return q[1]+"P";
  const s=String(label||"").toLowerCase();
  if(s.includes("superhigh"))return "超高清线路";
  if(s.includes("high"))return "高清线路";
  if(s.includes("low"))return "标清线路";
  return "默认清晰度";
 }
 function addCall(raw,method){
  const kind=String(method||"").toLowerCase();
  const format=kind==="hls"?"hls":"mp4";
  const label=kind==="hls"?"自动（HLS）":qualityName(method,raw);
  add(raw,label,format);
 }
 // 参考 guoapp-sources：识别全部 setVideo* 调用，不只匹配 High/Low/HLS。
 // setVideoURL('/video.xxx/...') 是页面路径，不是媒体地址，add() 会主动过滤。
 const callRe=/(?:html5player\s*\.\s*)?(setVideo([A-Za-z0-9_]+))\s*\(\s*(['"])((?:\\.|[^\\])*?)\3\s*\)/gi;
 let m;
 while((m=callRe.exec(source))!==null){
  const method=String(m[2]||"");
  const value=playerString(m[4]);
  if(/^HLS$/i.test(method))addCall(value,"hls");
  else if(/^URL/i.test(method))addCall(value,method);
 }
 // 解析 guoapp-sources 已覆盖的常见播放器配置字段。
 const keyPatterns=[
  {re:/["']?(?:hls|video_hls|hls_url|hlsUrl)["']?\s*:\s*(['"])((?:\\.|[^\\])*?)\1/ig,format:"hls",label:"自动（HLS）"},
  {re:/["']?urlHigh["']?\s*:\s*(['"])((?:\\.|[^\\])*?)\1/ig,format:"mp4",label:"高清线路"},
  {re:/["']?urlLow["']?\s*:\s*(['"])((?:\\.|[^\\])*?)\1/ig,format:"mp4",label:"标清线路"},
  {re:/["']?(?:flv_url|video_url|videoUrl|contentUrl)["']?\s*:\s*(['"])((?:\\.|[^\\])*?)\1/ig,format:"mp4",label:"默认清晰度"},
 ];
 for(const spec of keyPatterns){
  let km;
  while((km=spec.re.exec(source))!==null){
   const raw=playerString(km[2]);
   add(raw,spec.label||qualityName("",raw),spec.format);
  }
 }
 // mediaDefinitions 是部分新版页面的清晰度数组；逐项提取 videoUrl + quality。
 const md=source.search(/\bmediaDefinitions\b/i);
 if(md>=0){
  const tail=source.slice(md,Math.min(source.length,md+60000));
  const objects=tail.match(/\{[^{}]{1,8000}\}/g)||[];
  for(const obj of objects){
   const vm=/(?:["']?videoUrl["']?)\s*:\s*(['"])((?:\\.|[^\\])*?)\1/i.exec(obj);
   if(!vm)continue;
   const qm=/(?:["']?quality["']?)\s*:\s*["']?(\d{3,4}p?)["']?/i.exec(obj);
   const raw=playerString(vm[2]);
   add(raw,qm?qualityName(qm[1],raw):qualityName("",raw),"mp4");
  }
 }
 // sources 数组/对象：只在 sources 声明附近取明确的 src/file/url 字段。
 const sm=/\bsources\b\s*[:=]\s*[\[{]/ig;
 let sx;
 while((sx=sm.exec(source))!==null){
  const segment=source.slice(sx.index,Math.min(source.length,sx.index+30000));
  const objects=segment.match(/\{[^{}]{1,5000}\}/g)||[];
  for(const obj of objects){
   const um=/(?:["']?(?:src|file|url|videoUrl|video_url)["']?)\s*:\s*(['"])((?:\\.|[^\\])*?)\1/i.exec(obj);
   if(!um)continue;
   const qm=/(?:["']?(?:label|quality|res)["']?)\s*:\s*["']?([^"',}\s]{1,24})["']?/i.exec(obj);
   const raw=playerString(um[2]);
   add(raw,qm?qualityName(qm[2],raw):qualityName("",raw),"mp4");
  }
 }
 // 旧版 flv_url 兼容。支持查询参数和配置字段两种写法。
 if(!out.length){
  const fm=/(?:[?&])flv_url=([^&"'\s<>]+)/i.exec(source)||/flv_url\s*[:=]\s*(['"])([\s\S]*?)\1/i.exec(source);
  if(fm){
   let raw=fm[2]||fm[1]||"";
   raw=raw.replace(/\+/g,"%20");
   try{raw=decodeURIComponent(raw);}catch(e){}
   add(raw,"默认清晰度","mp4");
  }
 }
 // 只按 URL 去重（add() 已完成）；不同 URL 即使没有清晰度元数据也必须保留。
 // 不把 high/low 猜成固定分辨率，只有页面明确给出 1080p 等信息时才显示具体 P 值。
 const rank={"自动（HLS）":8,"2160P":7,"1440P":6,"1080P":5,"超高清线路":4,"高清线路":3,"720P":3,"标清线路":2,"480P":2,"360P":1,"默认清晰度":0};
 out.sort((a,b)=>(rank[b.name]??0)-(rank[a.name]??0));
 const nameCounts=Object.create(null);
 for(const item of out){
  const base=item.name||"默认清晰度";
  nameCounts[base]=(nameCounts[base]||0)+1;
  if(nameCounts[base]>1)item.name=base+" "+nameCounts[base];
 }
 return out;
}
async function loadDetail(id){const path=videoPath(id),r=await request(BASE+path,BASE+"/",30000),html=r.body,tm=groups(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.source,html),title=playerCall("setVideoTitle",html)||(tm?cleanText(tm[1]):"");if(!title||!safeTitle(title))fail("E_NOT_FOUND","XVideos 视频不可用或未通过内容安全筛选");const cm=groups(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.source,html),cover=playerCall("setThumbUrl169",html)||(cm?cm[1]:""),d=groups('"duration"\\s*:\\s*"PT(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?"',html);let duration=0;if(d)duration=(Number(d[1])||0)*3600+(Number(d[2])||0)*60+(Number(d[3])||0);const tags=[],re=/<a[^>]*class="[^"]*is-keyword[^"]*"[^>]*>([^<]+)<\/a>/gi;let m;while((m=re.exec(html))!==null&&tags.length<16){const t=cleanText(m[1]);if(t&&safeTitle(t))tags.push(t);}return{title,cover,duration,page:r.url||BASE+path,path};}
export default {
 async home(){return{categories:CATEGORIES};},
 async category({id="new",page=1}={}){const p=categoryPath(str(id)||"new",page),r=await request(BASE+p,BASE+"/",25000);return parseList(r.body,page);},
 async search({keyword="",page=1}={}){const q=str(keyword);if(!q)return{items:[],page:1,hasMore:false};const n=Math.max(1,Math.floor(Number(page)||1)),p="/?k="+encodeURIComponent(q)+(n>1?"&p="+(n-1):""),r=await request(BASE+p,BASE+"/",25000);return parseList(r.body,n);},
 async detail({id}={}){const d=await loadDetail(id);return{title:d.title,cover:d.cover,desc:"",lines:[{name:"默认线路",episodes:[{id:d.path,name:d.duration>0?Math.floor(d.duration/60)+"分钟":"在线播放"}]}]};},
 async play({episodeId,id}={}){const path=videoPath(episodeId||id),r=await request(BASE+path,BASE+"/",30000),streams=mediaStreams(r.body,r.url||BASE+path);if(!streams.length)fail("E_PARSE","XVideos 页面没有找到可用播放地址；诊断：HTML长度="+r.body.length+"；"+mediaDiagnostics(r.body));if(typeof host.log==="function")host.log("XVideos：解析到 "+streams.length+" 条播放线路："+streams.map(x=>x.name).join(" / "));return{streams};}
};
