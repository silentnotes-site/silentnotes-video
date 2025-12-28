<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SilentNotes Videos</title>

<style>
body{
margin:0;
font-family:Inter,Arial;
background:linear-gradient(135deg,#ff0080,#7928ca,#2afadf);
background-size:400% 400%;
animation:bg 20s infinite alternate;
color:white;
display:flex;
flex-direction:column;
align-items:center;
}
@keyframes bg{0%{background-position:0%}100%{background-position:100%}}

h1{margin:20px 0}

form{
background:rgba(255,255,255,.15);
backdrop-filter:blur(10px);
padding:20px;
border-radius:20px;
display:flex;
flex-direction:column;
gap:10px;
width:100%;
max-width:420px;
}

input,button{
padding:12px;
border-radius:12px;
border:none;
outline:none;
}

button{
font-weight:700;
cursor:pointer;
transition:.3s;
}
button:hover{transform:scale(1.05)}

#feed{
margin-top:20px;
width:100%;
max-width:420px;
height:calc(100vh - 300px);
overflow-y:auto;
scroll-snap-type:y mandatory;
}

.videoCard{
height:100%;
scroll-snap-align:start;
display:flex;
flex-direction:column;
align-items:center;
gap:8px;
}

video{
width:100%;
height:70vh;
object-fit:cover;
border-radius:20px;
}

.comment{
background:rgba(255,255,255,.2);
padding:6px 10px;
border-radius:10px;
margin:3px 0;
font-size:14px;
}

.empty{
text-align:center;
opacity:.8;
margin-top:40px;
}
</style>
</head>

<body>

<h1>SilentNotes Videos</h1>

<form id="uploadForm">
<input type="file" id="file" required>
<input type="text" id="description" placeholder="Description">
<input type="text" id="hashtags" placeholder="#hashtags">
<button>Upload</button>
</form>

<div id="feed"><div class="empty">Currently no videos</div></div>

<script>
const feed=document.getElementById('feed')

const observer=new IntersectionObserver(e=>{
e.forEach(x=>{
const v=x.target.querySelector('video')
if(!v)return
x.isIntersecting?v.play():v.pause()
})
},{threshold:.75})

async function loadVideos(){
const r=await fetch('/api/videos')
const d=await r.json()
feed.innerHTML=''
if(d.empty||!d.videos.length){
feed.innerHTML='<div class="empty">Currently no videos</div>'
return
}
d.videos.forEach(v=>{
const c=document.createElement('div')
c.className='videoCard'
c.innerHTML=`
<video src="/media/${v.filename}" playsinline loop controls></video>
<div>${v.description}</div>
<div>${v.hashtags}</div>
<div id="com-${v.id}">
${v.comments.map(x=>`<div class="comment">${x.text}</div>`).join('')}
</div>
<input id="i-${v.id}" placeholder="Anonymous comment">
<button onclick="comment('${v.id}')">Send</button>
`
feed.appendChild(c)
observer.observe(c)
})
}

async function comment(id){
const i=document.getElementById('i-'+id)
const t=i.value.trim()
if(!t)return
const r=await fetch('/api/comment/'+id,{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({text:t})
})
const d=await r.json()
if(d.success){
document.getElementById('com-'+id)
.insertAdjacentHTML('beforeend',`<div class="comment">${d.comment.text}</div>`)
i.value=''
}
}

document.getElementById('uploadForm').onsubmit=async e=>{
e.preventDefault()
const f=new FormData()
f.append('file',file.files[0])
f.append('description',description.value)
f.append('hashtags',hashtags.value)
await fetch('/api/upload',{method:'POST',body:f})
file.value=''
description.value=''
hashtags.value=''
loadVideos()
}

loadVideos()
</script>

</body>
</html>
