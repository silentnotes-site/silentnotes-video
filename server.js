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
const VIDEOS_FILE=path.join(DATA,'videos.json')

if(!fs.existsSync(DATA)) fs.mkdirSync(DATA)
if(!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS)

function readJSON(){
  if(!fs.existsSync(VIDEOS_FILE)){
    fs.writeFileSync(VIDEOS_FILE,'[]')
    return []
  }
  return JSON.parse(fs.readFileSync(VIDEOS_FILE,'utf8')||'[]')
}

function writeJSON(data){
  fs.writeFileSync(VIDEOS_FILE,JSON.stringify(data,null,2))
}

let videos=readJSON()

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
function canPost(ip){
  const now=Date.now()
  if(!rate[ip]){rate[ip]=now;return true}
  if(now-rate[ip]<4000) return false
  rate[ip]=now
  return true
}

app.post('/api/upload',upload.single('file'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'No file'})
  const v={
    id:Date.now().toString(36),
    filename:req.file.filename,
    description:String(req.body.description||''),
    hashtags:String(req.body.hashtags||''),
    comments:[],
    createdAt:new Date().toISOString()
  }
  videos.unshift(v)
  writeJSON(videos)
  res.json({success:true})
})

app.get('/api/videos',(req,res)=>{
  if(videos.length===0) return res.json({videos:[],empty:true})
  res.json({videos})
})

app.post('/api/comment/:id',(req,res)=>{
  const ip=req.headers['x-forwarded-for']||req.socket.remoteAddress
  if(!canPost(ip)) return res.status(429).json({error:'Too fast'})
  const v=videos.find(x=>x.id===req.params.id)
  if(!v) return res.status(404).json({error:'Not found'})
  const t=String(req.body.text||'').trim()
  if(!t) return res.status(400).json({error:'Empty'})
  const c={id:Date.now(),text:t,createdAt:new Date().toISOString()}
  v.comments.push(c)
  writeJSON(videos)
  res.json({success:true,comment:c})
})

app.listen(PORT,()=>console.log('SilentNotes Videos running'))
