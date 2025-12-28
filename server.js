const express=require('express')
const fs=require('fs')
const path=require('path')
const multer=require('multer')
const cors=require('cors')

const app=express()
const PORT=process.env.PORT||3000

app.use(cors())
app.use(express.json({limit:'100mb'}))
app.use(express.urlencoded({extended:true,limit:'100mb'}))

const DATA=path.join(__dirname,'data')
const UPLOADS=path.join(DATA,'uploads')
const FILE=path.join(DATA,'videos.json')

if(!fs.existsSync(DATA)) fs.mkdirSync(DATA)
if(!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS)
if(!fs.existsSync(FILE)) fs.writeFileSync(FILE,'[]')

function load(){return JSON.parse(fs.readFileSync(FILE,'utf8')||'[]')}
function save(d){fs.writeFileSync(FILE,JSON.stringify(d,null,2))}

let videos=load()

const storage=multer.diskStorage({
destination:(r,f,c)=>c(null,UPLOADS),
filename:(r,f,c)=>{
const n=Date.now().toString(36)+Math.random().toString(36).slice(2)
const e=path.extname(f.originalname)||'.mp4'
c(null,n+e)
}
})

const upload=multer({storage,limits:{fileSize:1024*1024*1024}})

app.use(express.static(path.join(__dirname,'public')))
app.use('/media',express.static(UPLOADS))

const rate={}
function can(ip){
const t=Date.now()
if(!rate[ip]){rate[ip]=t;return true}
if(t-rate[ip]<4000) return false
rate[ip]=t
return true
}

function normalizeTags(t){
if(!t) return []
return [...new Set(
t.split(/[\s,]+/)
.map(x=>x.trim())
.filter(x=>x)
.map(x=>x.startsWith('#')?x:'#'+x)
)].slice(0,8)
}

const viewed=new Set()

app.post('/api/upload',upload.single('file'),(req,res)=>{
if(!req.file) return res.status(400).json({error:'nofile'})
const v={
id:Date.now().toString(36),
filename:req.file.filename,
description:String(req.body.description||''),
hashtags:normalizeTags(req.body.hashtags),
comments:[],
views:0,
createdAt:new Date().toISOString()
}
videos.unshift(v)
save(videos)
res.json({ok:true})
})

app.get('/api/videos',(req,res)=>{
videos.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
res.json({videos,empty:!videos.length})
})

app.get('/api/video/:id',(req,res)=>{
const v=videos.find(x=>x.id===req.params.id)
if(!v) return res.status(404).json({error:'nf'})
res.json(v)
})

app.post('/api/view/:id',(req,res)=>{
const ip=req.headers['x-forwarded-for']||req.socket.remoteAddress
const key=ip+'_'+req.params.id
if(viewed.has(key)) return res.json({ok:true})
viewed.add(key)
const v=videos.find(x=>x.id===req.params.id)
if(v){
v.views++
save(videos)
}
res.json({ok:true})
})

app.post('/api/comment/:id',(req,res)=>{
const ip=req.headers['x-forwarded-for']||req.socket.remoteAddress
if(!can(ip)) return res.status(429).json({error:'fast'})
const v=videos.find(x=>x.id===req.params.id)
if(!v) return res.status(404).json({error:'nf'})
const t=String(req.body.text||'').trim()
if(!t) return res.status(400).json({error:'empty'})
const c={id:Date.now(),text:t,createdAt:new Date().toISOString()}
v.comments.push(c)
save(videos)
res.json({ok:true,comment:c})
})

app.get('/video/:id',(req,res)=>{
res.sendFile(path.join(__dirname,'public','index.html'))
})

app.listen(PORT,()=>console.log('SilentNotes Videos online'))

