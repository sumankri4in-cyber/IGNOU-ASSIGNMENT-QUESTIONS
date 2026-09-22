const express=require('express');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const multer=require('multer');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const app=express();
const PORT=process.env.PORT||3000;
const ADMIN_USERNAME=process.env.ADMIN_USERNAME||'basants1503';
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'Singh@060497';
const WHATSAPP=process.env.WHATSAPP_NUMBER||'9113799808';
const UPI_ID=process.env.UPI_ID||'';
const DATA=path.join(__dirname,'data');
const UPLOADS=path.join(__dirname,'uploads');
fs.mkdirSync(DATA,{recursive:true}); fs.mkdirSync(UPLOADS,{recursive:true});
const dbFile=path.join(DATA,'store.json');
if(!fs.existsSync(dbFile)) fs.writeFileSync(dbFile,JSON.stringify({users:[],products:[],orders:[]},null,2));
const read=()=>JSON.parse(fs.readFileSync(dbFile,'utf8'));
const write=x=>fs.writeFileSync(dbFile,JSON.stringify(x,null,2));

app.use(helmet({crossOriginResourcePolicy:false,contentSecurityPolicy:false}));
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));
app.use(rateLimit({windowMs:15*60*1000,max:300,standardHeaders:true,legacyHeaders:false}));
app.use(express.static(path.join(__dirname,'public')));

const sessions=new Map();
const newToken=()=>crypto.randomBytes(32).toString('hex');
function auth(req,res,next){const s=sessions.get(req.headers.authorization?.replace('Bearer ','')||''); if(!s)return res.status(401).json({error:'Login required'}); req.user=s; next();}
function admin(req,res,next){if(req.headers['x-admin-user']===ADMIN_USERNAME && req.headers['x-admin-pass']===ADMIN_PASSWORD)return next(); return res.status(401).json({error:'Admin login required'});}
function safeName(n){return String(n||'file.pdf').replace(/[^a-zA-Z0-9._-]/g,'_');}

app.get('/api/config',(req,res)=>res.json({whatsapp:WHATSAPP,upi:UPI_ID}));
app.post('/api/register',(req,res)=>{const {name,phone,password}=req.body||{}; if(!name||!phone||!password||password.length<6)return res.status(400).json({error:'Name, phone and password (6+ chars) required'}); const d=read(); if(d.users.some(u=>u.phone===phone))return res.status(409).json({error:'User already exists'}); const u={id:crypto.randomUUID(),name,phone,passwordHash:crypto.createHash('sha256').update(password).digest('hex')}; d.users.push(u); write(d); res.json({ok:true});});
app.post('/api/login',(req,res)=>{const {phone,password}=req.body||{}; const d=read(); const h=crypto.createHash('sha256').update(password||'').digest('hex'); const u=d.users.find(x=>x.phone===phone&&x.passwordHash===h); if(!u)return res.status(401).json({error:'Invalid login'}); const t=newToken(); sessions.set(t,{id:u.id,name:u.name,phone:u.phone}); res.json({token:t,user:{name:u.name,phone:u.phone}});});
app.post('/api/logout',auth,(req,res)=>{sessions.delete(req.headers.authorization.replace('Bearer ',''));res.json({ok:true});});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));
app.get('/api/products',(req,res)=>{const d=read();res.json(d.products.map(({filePath,...p})=>p));});
app.post('/api/orders',(req,res)=>{const {productId,txnRef,name,mobile,address,email}=req.body||{};if(!productId||!name||!mobile||!address||!email||!txnRef)return res.status(400).json({error:'Name, mobile, address, email and transaction reference are required'});const d=read();const p=d.products.find(x=>x.id===productId);if(!p)return res.status(404).json({error:'Product not found'});const authToken=req.headers.authorization?.replace('Bearer ','');const session=authToken?sessions.get(authToken):null;const o={id:crypto.randomUUID(),userId:session?.id||null,customer:{name:String(name).trim(),mobile:String(mobile).trim(),address:String(address).trim(),email:String(email).trim()},productId,txnRef:String(txnRef).trim(),downloadToken:newToken(),status:'pending',createdAt:new Date().toISOString()};d.orders.push(o);write(d);res.json({ok:true,order:{id:o.id,status:o.status},message:'Order submitted. Approval ke baad isi page par download option milega.'});});
app.get('/api/orders',auth,(req,res)=>{const d=read();res.json(d.orders.filter(o=>o.userId===req.user.id).map(o=>({...o,product:d.products.find(p=>p.id===o.productId)?.title||'Unknown'})));});
app.get('/api/public-order/:id',(req,res)=>{const d=read();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Order not found'});res.json({id:o.id,status:o.status,product:d.products.find(p=>p.id===o.productId)?.title||'Unknown',downloadUrl:o.status==='approved'?('/api/public-download/'+o.id+'?token='+encodeURIComponent(o.downloadToken)):null});});
app.get('/api/public-download/:id',(req,res)=>{const d=read();const o=d.orders.find(x=>x.id===req.params.id&&x.downloadToken===req.query.token&&x.status==='approved');if(!o)return res.status(403).json({error:'Download not available yet'});const p=d.products.find(x=>x.id===o.productId);if(!p||!p.filePath||!fs.existsSync(p.filePath))return res.status(404).json({error:'PDF not available'});res.download(p.filePath,p.title+'.pdf');});
app.get('/api/download/:id',auth,(req,res)=>{const d=read();const o=d.orders.find(x=>x.id===req.params.id&&x.userId===req.user.id&&x.status==='approved');if(!o)return res.status(403).json({error:'Order not approved'});const p=d.products.find(x=>x.id===o.productId);if(!p||!p.filePath||!fs.existsSync(p.filePath))return res.status(404).json({error:'PDF not available'});res.download(p.filePath,p.title+'.pdf');});

app.post('/api/admin/login',(req,res)=>{const {username,password}=req.body||{};if(username===ADMIN_USERNAME&&password===ADMIN_PASSWORD)res.json({ok:true});else res.status(401).json({error:'Invalid admin credentials'});});
app.get('/api/admin/products',admin,(req,res)=>{const d=read();res.json(d.products);});
app.post('/api/admin/products',admin,(req,res)=>{const {title,course,category,price}=req.body||{};if(!title||!course||price===undefined)return res.status(400).json({error:'Title, course and price required'});const d=read();const p={id:crypto.randomUUID(),title,course,category:category||'Assignment',price:Number(price),filePath:null,createdAt:new Date().toISOString()};d.products.push(p);write(d);res.json(p);});
const upload=multer({dest:UPLOADS,limits:{fileSize:25*1024*1024},fileFilter:(req,file,cb)=>cb(null,file.mimetype==='application/pdf')});
app.post('/api/admin/products/:id/pdf',admin,upload.single('pdf'),(req,res)=>{if(!req.file)return res.status(400).json({error:'PDF required'});const d=read();const p=d.products.find(x=>x.id===req.params.id);if(!p){fs.unlinkSync(req.file.path);return res.status(404).json({error:'Product not found'});}const final=path.join(UPLOADS,safeName(p.id+'-'+req.file.originalname));fs.renameSync(req.file.path,final);p.filePath=final;write(d);res.json({ok:true});});
app.get('/api/admin/orders',admin,(req,res)=>{const d=read();res.json(d.orders.map(o=>({...o,user:d.users.find(u=>u.id===o.userId)?.phone||'',product:d.products.find(p=>p.id===o.productId)?.title||''})));});
app.post('/api/admin/orders/:id/status',admin,(req,res)=>{const {status}=req.body||{};if(!['approved','rejected','pending'].includes(status))return res.status(400).json({error:'Invalid status'});const d=read();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Order not found'});o.status=status;write(d);res.json({ok:true});});

app.get('/health',(req,res)=>res.json({ok:true}));
app.use((req,res,next)=>{if(req.method==='GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(__dirname,'public','index.html')); next();});
app.listen(PORT,()=>console.log('IGNOU site running on '+PORT));
