const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

const DATA = path.join(__dirname, 'data')
const UPLOADS = path.join(DATA, 'uploads')
const FILE = path.join(DATA, 'videos.json')

if (!fs.existsSync(DATA)) fs.mkdirSync(DATA)
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS)
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]')

function load() { return JSON.parse(fs.readFileSync(FILE, 'utf8') || '[]') }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)) }

let videos = load()

const storage = multer.diskStorage({
  destination: (r, f, c) => c(null, UPLOADS),
  filename: (r, f, c) => {
    const n = Date.now().toString(36) + Math.random().toString(36).slice(2)
    const e = path.extname(f.originalname) || '.mp4'
    c(null, n + e)
  }
})

const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } })

app.use(express.static(path.join(__dirname, 'public')))
app.use('/media', express.static(UPLOADS))

const rate = {}
function can(ip) {
  const t = Date.now()
  if (!rate[ip]) { rate[ip] = t; return true }
  if (t - rate[ip] < 4000) return false
  rate[ip] = t
  return true
}

function normalizeTags(t) {
  if (!t) return []
  return [...new Set(
    t.split(/[\s,]+/)
      .map(x => x.trim())
      .filter(x => x)
      .map(x => x.startsWith('#') ? x : '#' + x)
  )].slice(0, 8)
}

const viewed = new Set()
const liked = new Set()

const fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))

app.post('/auth/login', async (req, res) => {
  try {
    const r = await fetchFn('https://silentnotes.cleverapps.io/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': req.headers['user-agent'] || ''
      },
      body: JSON.stringify(req.body)
    })
    const text = await r.text()
    try {
      const json = JSON.parse(text)
      res.status(r.status).json(json)
    } catch {
      res.status(r.status).send(text)
    }
  } catch (e) {
    res.status(500).json({ error: 'login_proxy_failed' })
  }
})

app.get('/auth/ban-status/:code', async (req, res) => {
  try {
    const r = await fetchFn(`https://silentnotes.cleverapps.io/ban-status/${encodeURIComponent(req.params.code)}`)
    const json = await r.json()
    res.json(json)
  } catch (e) {
    res.json({ banned: false })
  }
})

app.get('/auth/get-user/:username', async (req, res) => {
  try {
    const headers = {}
    if (req.headers.authorization) headers.Authorization = req.headers.authorization
    const r = await fetchFn(`https://silentnotes.cleverapps.io/get-user/${encodeURIComponent(req.params.username)}`, { headers })
    const json = await r.json()
    res.json(json)
  } catch (e) {
    res.status(500).json({ error: 'user_proxy_failed' })
  }
})

// Upload video
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nofile' })
  const v = {
    id: Date.now().toString(36),
    filename: req.file.filename,
    author: String(req.body.author || ''),
    description: String(req.body.description || ''),
    hashtags: normalizeTags(req.body.hashtags),
    comments: [],
    views: 0,
    likes: 0,
    createdAt: new Date().toISOString()
  }
  videos.unshift(v)
  save(videos)
  res.json({ ok: true, video: v })
})

// Get all videos
app.get('/api/videos', (req, res) => {
  videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ videos, empty: !videos.length })
})

// Get single video
app.get('/api/video/:id', (req, res) => {
  const v = videos.find(x => x.id === req.params.id)
  if (!v) return res.status(404).json({ error: 'nf' })
  res.json(v)
})

// Increment views
app.post('/api/view/:id', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
  const key = ip + '_' + req.params.id + '_view'
  if (viewed.has(key)) return res.json({ ok: true })
  viewed.add(key)
  const v = videos.find(x => x.id === req.params.id)
  if (v) { v.views = (v.views || 0) + 1; save(videos) }
  res.json({ ok: true })
})

// Comment
app.post('/api/comment/:id', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
  if (!can(ip)) return res.status(429).json({ error: 'fast' })
  const v = videos.find(x => x.id === req.params.id)
  if (!v) return res.status(404).json({ error: 'nf' })
  const t = String(req.body.text || '').trim()
  if (!t) return res.status(400).json({ error: 'empty' })
  const c = { id: Date.now(), username: String(req.body.username || ''), text: t, createdAt: new Date().toISOString() }
  v.comments.push(c)
  save(videos)
  res.json({ ok: true, comment: c })
})

// Like toggle (per IP + video)
app.post('/api/like/:id', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
  const key = ip + '_' + req.params.id + '_like'
  const v = videos.find(x => x.id === req.params.id)
  if (!v) return res.status(404).json({ error: 'nf' })
  if (liked.has(key)) {
    liked.delete(key)
    v.likes = Math.max(0, (v.likes || 1) - 1)
    save(videos)
    return res.json({ ok: true, liked: false, likes: v.likes })
  }
  liked.add(key)
  v.likes = (v.likes || 0) + 1
  save(videos)
  res.json({ ok: true, liked: true, likes: v.likes })
})

// Serve frontend single video route
app.get('/video/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => console.log('SilentNotes Videos online on port', PORT))
