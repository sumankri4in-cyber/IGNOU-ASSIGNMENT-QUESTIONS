const http=require('http');
const fs=require('fs');
const path=require('path');
const {URL}=require('url');

const PORT=process.env.PORT||3000;
const ROOT=path.join(__dirname,'public');
const FEEDS={
  Bihar:[
    'https://news.google.com/rss/search?q=Bihar%20when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=Purnea%20Bihar%20when:1d&hl=en-IN&gl=IN&ceid=IN:en'
  ],
  India:[
    'https://news.google.com/rss/search?q=India%20when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=India%20government%20science%20economy%20when:1d&hl=en-IN&gl=IN&ceid=IN:en'
  ],
  World:[
    'https://news.google.com/rss/search?q=world%20when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/search?q=international%20science%20economy%20when:1d&hl=en-IN&gl=IN&ceid=IN:en'
  ]
};
let cache={time:0,data:null};

function clean(s=''){return s.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'\"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\\s+/g,' ').trim();}
function tag(xml,name){const m=xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'));return m?clean(m[1]):'';}
function parse(xml){
  return [...xml.matchAll(/<item>([\\s\\S]*?)<\\/item>/gi)].map(m=>{
    const x=m[1], title=tag(x,'title'), link=tag(x,'link'), pubDate=tag(x,'pubDate'), desc=tag(x,'description');
    const source=tag(x,'source');
    return {title,link,pubDate,description:desc,source};
  }).filter(x=>x.title&&x.link);
}
async function feed(url){
  try{const r=await fetch(url,{headers:{'User-Agent':'BharatCurrentAffairs/1.0'}});if(!r.ok)throw new Error('HTTP '+r.status);return parse(await r.text());}
  catch(e){return [];}
}
async function getData(){
  if(cache.data && Date.now()-cache.time<15*60*1000)return cache.data;
  const out={};
  for(const [cat,urls] of Object.entries(FEEDS)){
    const groups=await Promise.all(urls.map(feed));
    const seen=new Set();
    out[cat]=groups.flat().filter(x=>{const k=x.title.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).slice(0,18);
  }
  cache={time:Date.now(),data:{updatedAt:new Date().toISOString(),categories:out}};
  return cache.data;
}
function send(res,status,type,body){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(body);}
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/current-affairs'){
    const data=await getData(); return send(res,200,'application/json; charset=utf-8',JSON.stringify(data));
  }
  let file=u.pathname==='/'?'/index.html':u.pathname;
  file=path.normalize(file).replace(/^([.][.][/\\])+/, '');
  const full=path.join(ROOT,file);
  if(!full.startsWith(ROOT))return send(res,403,'text/plain','Forbidden');
  fs.readFile(full,(err,data)=>{
    if(err)return send(res,404,'text/plain','Not found');
    const ext=path.extname(full), types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json'};
    send(res,200,types[ext]||'application/octet-stream',data);
  });
});
server.listen(PORT,()=>console.log('Bharat Current Affairs running on '+PORT));