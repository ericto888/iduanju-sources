// 红果短剧 · iDuanJu idj1
// Based on the user's hongguo-1.3.0 source package. This port uses the public web
// catalog/detail/play fallback so it does not depend on GuoApp's synchronous host API.
const SITE = "https://hongguoduanju.com";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const APP_ID = "8662";
const CATEGORIES = [
  {id:"short_play",name:"真人剧"},
  {id:"comic_series",name:"漫剧"},
  {id:"ai_series",name:"AI剧"}
];
const CATEGORY_ROUTES = {short_play:"real-drama",comic_series:"comic-drama",ai_series:"ai-drama"};
function str(v){return v==null?"":String(v).trim();}
function fail(code,message){throw host.error(code,message);}
function clean(v){return str(v).replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim();}
function numeric(v){return /^\d{1,32}$/.test(str(v));}
function absolute(v){let s=str(v).replace(/&amp;/g,"&");if(!s)return "";if(s.startsWith("//"))return "https:"+s;if(s.startsWith("/"))return SITE+s;return /^https?:\/\//i.test(s)?s:"";}
async function request(url,options){
  const o=options||{};
  const headers=Object.assign({"User-Agent":o.desktop?DESKTOP_UA:UA,"Referer":SITE+"/","Accept":"text/html,application/json;q=0.9,*/*;q=0.8"},o.headers||{});
  const r=await host.http.request({url,method:o.method||"GET",headers,body:o.body,timeout:o.timeout||22000});
  if(!r||r.status<200||r.status>=300)fail(r&&r.status===404?"E_NOT_FOUND":"E_HTTP","红果请求失败 HTTP "+(r?r.status:0));
  return {body:str(r.body),url:str(r.url)||url,status:Number(r.status)||0,headers:r.headers||{}};
}
function extractAssignedJSON(html,marker){
  const s=String(html||""),at=s.indexOf(marker);if(at<0)return null;
  let i=at+marker.length;while(i<s.length&&/\s/.test(s[i]))i++;
  if(s[i]==="="){i++;while(i<s.length&&/\s/.test(s[i]))i++;}
  const start=i;let depth=0,quoted=false,escape=false;
  for(;i<s.length;i++){
    const c=s[i];
    if(quoted){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}
    if(c==="{"||c==="[")depth++;
    else if(c==="}"||c==="]"){depth--;if(depth===0){try{return JSON.parse(s.slice(start,i+1));}catch(e){return null;}}}
  }
  return null;
}
function routerData(html){return extractAssignedJSON(html,"_ROUTER_DATA");}
function loaderPage(data,names){
  const loader=data&&data.loaderData||{};
  for(const n of names){if(loader[n]&&typeof loader[n]==="object")return loader[n];}
  for(const k of Object.keys(loader)){for(const n of names){if(k.startsWith(n.replace(/\$$/,""))&&loader[k]&&typeof loader[k]==="object")return loader[k];}}
  return null;
}
function rows(v){return Array.isArray(v)?v:[];}
function drama(row,category){
  const r=row&&row.video_data&&typeof row.video_data==="object"?row.video_data:(row||{});
  const id=str(r.series_id_str||r.series_id||row.series_id_str||row.series_id);
  if(!numeric(id))return null;
  const title=str(r.series_title||r.series_name||r.title||row.series_name||row.name||id);
  const cover=absolute(r.series_cover||r.cover||row.series_cover);
  const desc=str(r.series_intro||r.video_desc||row.series_intro);
  const count=str(r.episode_cnt||row.episode_cnt);
  const remark=str(r.episode_right_text||row.episode_right_text)||(count?"共"+count+"集":"");
  const item={id,title,desc,remark,category:category||"红果"};
  if(cover)item.cover=cover;
  const score=str(r.score);if(score)item.score=score;
  return item;
}
function pageItems(page,category){
  const data=page&&page.recommendList;
  return rows(data).map(x=>drama(x,category)).filter(Boolean);
}
async function categoryPage(id,page){
  const route=CATEGORY_ROUTES[id];if(!route)fail("E_UNSUPPORTED","该红果分类暂不支持网页目录浏览");
  const p=Math.max(1,Math.floor(Number(page)||1));
  const url=SITE+"/category/"+route+"?page="+p;
  const r=await request(url);
  const pageData=loaderPage(routerData(r.body),["category_page","category_$"]);
  if(!pageData||pageData.isSuccess===false)fail("E_PARSE","红果分类页暂不可用");
  const items=pageItems(pageData,CATEGORIES.find(x=>x.id===id)?.name||"红果");
  const total=Number(pageData.pagination&&pageData.pagination.totalPages)||0;
  return {items,page:p,hasMore:total? p<total : items.length>0};
}
async function searchSuggestions(keyword){
  const url=SITE+"/incent_resource/suggestion?app_id="+APP_ID+"&query="+encodeURIComponent(keyword)+"&count=50";
  const r=await request(url,{headers:{"Accept":"application/json","Referer":SITE+"/"}});
  let data;try{data=JSON.parse(r.body);}catch(e){fail("E_PARSE","红果搜索返回格式异常");}
  const list=rows(data&&data.suggest_list||data&&data.data&&data.data.suggest_list);
  const out=[],seen=new Set();
  for(const item of list){
    if(item.word_type!=="short_play_name")continue;
    const d=drama({video_data:item.video_data,name:item.name,series_id:item.video_data&&item.video_data.series_id_str},"短剧");
    if(!d||seen.has(d.id))continue;
    seen.add(d.id);out.push(d);
  }
  return out;
}
async function detailPage(id){
  if(!numeric(id))fail("E_PARSE","红果剧集 ID 无效");
  const r=await request(SITE+"/detail?series_id="+encodeURIComponent(id));
  const page=loaderPage(routerData(r.body),["detail_page","detail_"]);
  const row=page&&page.seriesDetail;
  if(!row||str(row.series_id||row.series_id_str)!==id)fail("E_PARSE","红果详情页未返回对应剧集");
  const title=str(row.series_name||row.series_title||id);
  const cover=absolute(row.series_cover||row.cover);
  const desc=str(row.series_intro||row.video_desc);
  const episodes=rows(row.vid_list).map((v,i)=>({id:id+"/"+str(v),name:"第"+(i+1)+"集"})).filter(x=>numeric(x.id.split("/")[1]));
  if(!episodes.length)fail("E_PARSE","红果详情没有返回可播放剧集");
  return {title,cover,desc,episodes};
}
async function playEpisode(episodeId){
  const p=str(episodeId).split("/");
  if(p.length!==2||!numeric(p[0])||!numeric(p[1]))fail("E_PARSE","红果剧集编号无效");
  const detail=await detailPage(p[0]);
  if(!detail.episodes.some(x=>x.id===episodeId))fail("E_NOT_FOUND","红果详情中不存在该集");
  const endpoint=SITE+"/api/video/protected/fallback-play-info?aid="+APP_ID;
  const r=await request(endpoint,{method:"POST",desktop:true,headers:{"Content-Type":"application/json","X-Xs-From-Web":"1","Accept":"application/json, text/plain, */*"},body:JSON.stringify({item_id:p[1]})});
  let data;try{data=JSON.parse(r.body);}catch(e){fail("E_PARSE","红果播放接口返回格式异常");}
  const candidates=[];
  function walk(v){
    if(!v||typeof v!=="object")return;
    if(Array.isArray(v)){for(const x of v)walk(x);return;}
    for(const [k,x] of Object.entries(v)){
      if(typeof x==="string"&&/^https?:\/\//i.test(x)&&/\.(?:m3u8|mp4)(?:[?#]|$)/i.test(x))candidates.push(x);
      else if(x&&typeof x==="object")walk(x);
    }
  }
  walk(data);
  const urls=[...new Set(candidates)];
  if(!urls.length)fail("E_UNSUPPORTED","红果该集未提供可直接播放的网页流，当前版本暂不支持此加密播放线路");
  return {streams:urls.map((url,i)=>({name:i===0?"默认线路":"备用线路 "+(i+1),url,format:/\.m3u8(?:[?#]|$)/i.test(url)?"hls":"mp4",headers:{Referer:SITE+"/"}}))};
}
export default {
  async home(){return {categories:CATEGORIES};},
  async category({id="short_play",page=1}){return await categoryPage(id,page);},
  async search({keyword,page=1}){
    const q=str(keyword);if(!q)return {items:[],page:1,hasMore:false};
    if(Number(page)>1)return {items:[],page:Number(page),hasMore:false};
    const items=await searchSuggestions(q);
    return {items,page:1,hasMore:false};
  },
  async detail({id}){
    const d=await detailPage(str(id));
    return {title:d.title,cover:d.cover,desc:d.desc,lines:[{name:"红果线路",episodes:d.episodes}]};
  },
  async play({episodeId}){return await playEpisode(episodeId);}
};
