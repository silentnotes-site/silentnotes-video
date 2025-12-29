const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')

const app = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'silentnotes_secret_change_me'

app.use(cors())
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

const DATA = path.join(__dirname, 'data')
const UPLOADS = path.join(DATA, 'uploads')
const VIDEOS_FILE = path.join(DATA, 'videos.json')
const USERS_FILE = path.join(DATA, 'users.json')

try { if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true }) } catch (e) {}
try { if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true }) } catch (e) {}
try { if (!fs.existsSync(VIDEOS_FILE)) fs.writeFileSync(VIDEOS_FILE, '[]') } catch (e) {}
try { if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]') } catch (e) {}

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || '[]') } catch { try { fs.writeFileSync(file,'[]') } catch {} return [] }
}
function saveJson(file, data) { try { fs.writeFileSync(file, JSON.stringify(data, null, 2)) } catch {} }

let videos = loadJson(VIDEOS_FILE)
let users = loadJson(USERS_FILE)

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => {
    const n = Date.now().toString(36) + Math.random().toString(36).slice(2)
    const e = path.extname(file.originalname) || '.mp4'
    cb(null, n + e)
  }
})

const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } })

app.use(express.static(path.join(__dirname, 'public')))
app.use('/media', express.static(UPLOADS))

const rateMap = new Map()
function can(ip) {
  const t = Date.now()
  const last = rateMap.get(ip) || 0
  if (t - last < 4000) return false
  rateMap.set(ip, t)
  return true
}
setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 60
  for (const [k, v] of rateMap) if (v < cutoff) rateMap.delete(k)
}, 1000 * 60 * 30)

function normalizeTags(t) {
  if (!t) return []
  return [...new Set(
    String(t).split(/[\s,]+/)
      .map(x => x.trim())
      .filter(x => x)
      .map(x => x.startsWith('#') ? x : '#' + x)
  )].slice(0, 8)
}

const viewed = new Map()
const liked = new Map()
function touchMap(map, key) { map.set(key, Date.now()) }
function hasMap(map, key) { return map.has(key) }
setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 60 * 24
  for (const [k, v] of viewed) if (v < cutoff) viewed.delete(k)
  for (const [k, v] of liked) if (v < cutoff) liked.delete(k)
}, 1000 * 60 * 60)

function getIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (xf) return xf.split(',')[0].trim()
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress
  return 'unknown'
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'no_token' })
  const token = h.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch { return res.status(401).json({ error: 'invalid_token' }) }
}

app.post('/auth/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '')
    const displayName = String(req.body.displayName || username)
    if (!username || !password) return res.status(400).json({ error: 'missing' })
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'exists' })
    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password, salt)
    const user = { id: uuidv4(), username, displayName, passwordHash: hash, createdAt: new Date().toISOString(), banned: false }
    users.push(user)
    saveJson(USERS_FILE, users)
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ ok: true, token, user: { id: user.id, username: user.username, displayName: user.displayName } })
  } catch (e) { res.status(500).json({ error: 'server' }) }
})

app.post('/auth/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '')
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase())
    if (!user) return res.status(401).json({ error: 'invalid' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'invalid' })
    if (user.banned) return res.status(403).json({ error: 'banned' })
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ ok: true, token, user: { id: user.id, username: user.username, displayName: user.displayName } })
  } catch (e) { res.status(500).json({ error: 'server' }) }
})

app.get('/auth/ban-status/:code', (req, res) => {
  const code = String(req.params.code || '')
  const u = users.find(x => x.username === code || x.id === code)
  if (!u) return res.json({ banned: false })
  res.json({ banned: !!u.banned })
})

app.get('/auth/get-user/:username', (req, res) => {
  const username = String(req.params.username || '')
  const u = users.find(x => x.username.toLowerCase() === username.toLowerCase())
  if (!u) return res.status(404).json({ error: 'nf' })
  res.json({ id: u.id, username: u.username, displayName: u.displayName, createdAt: u.createdAt, banned: !!u.banned })
})

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
  saveJson(VIDEOS_FILE, videos)
  res.json({ ok: true, video: v })
})

app.get('/api/videos', (req, res) => {
  videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ videos, empty: !videos.length })
})

app.get('/api/video/:id', (req, res) => {
  const v = videos.find(x => x.id === req.params.id)
  if (!v) return res.status(404).json({ error: 'nf' })
  res.json(v)
})

app.post('/api/view/:id', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
  const key = ip + '_' + req.params.id + '_view'
  if (viewed.has(key)) return res.json({ ok: true })
  touchMap(viewed, key)
  const v = videos.find(x => x.id === req.params.id)
  if (v) { v.views = (v.views || 0) + 1; saveJson(VIDEOS_FILE, videos) }
  res.json({ ok: true })
})

app.post('/api/comment/:id', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
  if (!can(ip)) return res.status(429).json({ error: 'fast' })
  const v = videos.find(x => x.id === req.params.id)
  if (!v) return res.status(404).json({ error: 'nf' })
  const t = String(req.body.text || '').trim()
  if (!t) return res.status(400).json({ error: 'empty' })
  const c = { id: Date.now(), username: String(req.body.username || ''), text: t, createdAt: new Date().toISOString() }
  v.comments.push(c)
  saveJson(VIDEOS_FILE, videos)
  res.json({ ok: true, comment: c })
})

app.post('/api/like/:id', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
  const key = ip + '_' + req.params.id + '_like'
  const v = videos.find(x => x.id === req.params.id)
  if (!v) return res.status(404).json({ error: 'nf' })
  if (liked.has(key)) {
    liked.delete(key)
    v.likes = Math.max(0, (v.likes || 1) - 1)
    saveJson(VIDEOS_FILE, videos)
    return res.json({ ok: true, liked: false, likes: v.likes })
  }
  liked.add(key)
  v.likes = (v.likes || 0) + 1
  saveJson(VIDEOS_FILE, videos)
  res.json({ ok: true, liked: true, likes: v.likes })
})

app.get('/video/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => console.log('SilentNotes Videos online on port', PORT))
