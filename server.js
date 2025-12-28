const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const cors = require('cors')
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

const PERSISTENT = path.join(__dirname, 'data')
if (!fs.existsSync(PERSISTENT)) fs.mkdirSync(PERSISTENT, { recursive: true })

const UPLOADS = path.join(PERSISTENT, 'uploads')
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true })

const VIDEOS_FILE = path.join(PERSISTENT, 'videos.json')

function atomicWrite(file, content){
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, file)
}
function readJSON(file, def){
  try{
    if(!fs.existsSync(file)){
      atomicWrite(file, JSON.stringify(def, null, 2))
      return def
    }
    const raw = fs.readFileSync(file, 'utf8')
    if(!raw) return def
    return JSON.parse(raw)
  }catch(e){
    try{ atomicWrite(file, JSON.stringify(def, null, 2)) }catch(e){}
    return def
  }
}
function writeJSON(file, data){
  try{ atomicWrite(file, JSON.stringify(data, null, 2)) }catch(e){ fs.writeFileSync(file, JSON.stringify(data, null, 2)) }
}

let videos = readJSON(VIDEOS_FILE, [])

const storage = multer.diskStorage({
  destination: (req,file,cb) => cb(null, UPLOADS),
  filename: (req,file,cb) => {
    const ext = path.extname(file.originalname) || (file.mimetype.includes('video') ? '.mp4' : '.jpg')
    const name = Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)+ext
    cb(null,name)
  }
})
const upload = multer({ storage, limits: { fileSize: 1024*1024*1024 } })

app.use(express.static(path.join(__dirname,'public')))

app.post('/api/upload', upload.single('file'), (req,res)=>{
  const file = req.file
  const description = String(req.body.description||'')
  const hashtags = String(req.body.hashtags||'')
  if(!file) return res.status(400).json({error:'No file uploaded'})
  const id = Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6)
  const v = { id, filename:path.basename(file.path), description, hashtags, comments:[], createdAt:new Date().toISOString() }
  videos.unshift(v)
  writeJSON(VIDEOS_FILE,videos)
  res.json({success:true, video:v})
})

app.get('/api/videos',(req,res)=>{
  if(videos.length===0) return res.json({message:'No videos yet', videos:[]})
  res.json({videos})
})

app.post('/api/comment/:videoId',(req,res)=>{
  const id = req.params.videoId
  const text = String(req.body.text||'').trim()
  const v = videos.find(x=>x.id===id)
  if(!v) return res.status(404).json({error:'Video not found'})
  if(!text) return res.status(400).json({error:'Empty comment'})
  v.comments.push({ id:Date.now(), text, createdAt:new Date().toISOString() })
  writeJSON(VIDEOS_FILE,videos)
  res.json({success:true, comment:v.comments[v.comments.length-1]})
})

app.listen(PORT,()=>console.log(`SilentNotes Videos server running on port ${PORT}`))
