/* ═══════════════════════════════════════
   NeuralStudy — Frontend Script
   Backend: Flask at http://127.0.0.1:5000
═══════════════════════════════════════ */

const API_BASE = 'http://127.0.0.1:5000/api';

let notesText    = '';
let chatHistory  = [];
let isProcessing = false;

/* ── Particle Canvas ─────────────────── */
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx    = canvas.getContext('2d');
  let particles = [];

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

  function mkParticle() {
    return { x:Math.random()*canvas.width, y:Math.random()*canvas.height, vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3, r:Math.random()*1.5+0.5, alpha:Math.random()*0.4+0.1 };
  }

  function init() { resize(); particles = Array.from({length:80}, mkParticle); }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p => {
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0) p.x=canvas.width; if(p.x>canvas.width) p.x=0;
      if(p.y<0) p.y=canvas.height; if(p.y>canvas.height) p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(0,212,255,${p.alpha})`; ctx.fill();
    });
    for(let i=0;i<particles.length;i++) for(let j=i+1;j<particles.length;j++) {
      const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y, d=Math.sqrt(dx*dx+dy*dy);
      if(d<120) { ctx.beginPath(); ctx.strokeStyle=`rgba(0,212,255,${0.04*(1-d/120)})`; ctx.lineWidth=0.5; ctx.moveTo(particles[i].x,particles[i].y); ctx.lineTo(particles[j].x,particles[j].y); ctx.stroke(); }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init(); draw();
})();

/* ── Navigation ──────────────────────── */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => { if(!btn.disabled) goToSection(btn.dataset.section); });
});

function goToSection(name) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const nb = document.querySelector(`[data-section="${name}"]`);
  if(nb) nb.classList.add('active');
  const sc = document.getElementById(`section-${name}`);
  if(sc) sc.classList.add('active');
}

/* ── Upload ──────────────────────────── */
const uploadArea = document.getElementById('uploadArea');
const fileInput  = document.getElementById('fileInput');

uploadArea.addEventListener('click', e => {
  if(e.target.closest('.btn-icon') || e.target.closest('#uploadProgress') || e.target.closest('#uploadSuccess')) return;
  fileInput.click();
});
uploadArea.addEventListener('dragover',  e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', ()  => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault(); uploadArea.classList.remove('drag-over');
  if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if(e.target.files[0]) processFile(e.target.files[0]); fileInput.value=''; });

async function processFile(file) {
  if(!/\.(txt|pdf|md)$/i.test(file.name)) { showToast('Unsupported file. Use .txt .pdf .md','error'); return; }
  showProgress(file.name);
  animateBar();

  const form = new FormData();
  form.append('file', file);

  try {
    const res  = await fetch(`${API_BASE}/upload`, { method:'POST', body:form });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Upload failed');

    notesText = data.text;
    showSuccess(file.name, notesText);
    document.getElementById('notesContent').textContent = notesText;
    document.getElementById('notesSubtitle').textContent = `Extracted from ${file.name}`;
    enableApp();
  } catch(err) {
    showInner();
    showToast(err.message, 'error');
    setStatus('error','Upload failed');
  }
}

function showProgress(name) {
  document.getElementById('uploadInner').style.display    = 'none';
  document.getElementById('uploadSuccess').style.display  = 'none';
  document.getElementById('uploadProgress').style.display = 'flex';
  document.getElementById('progressFilename').textContent = name;
  document.getElementById('progressBar').style.width      = '0%';
}

function animateBar() {
  const bar = document.getElementById('progressBar');
  let w = 0;
  const iv = setInterval(() => { w += Math.random()*15; if(w>=85){clearInterval(iv); w=85;} bar.style.width=w+'%'; }, 200);
  window._barIv = iv;
}

function showSuccess(name, text) {
  clearInterval(window._barIv);
  document.getElementById('progressBar').style.width = '100%';
  setTimeout(() => {
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadSuccess').style.display  = 'flex';
    document.getElementById('successFilename').textContent  = name;
    const w = text.split(/\s+/).filter(Boolean).length;
    document.getElementById('successMeta').textContent = `${text.length.toLocaleString()} chars · ${w.toLocaleString()} words`;
  }, 400);
}

function showInner() {
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('uploadSuccess').style.display  = 'none';
  document.getElementById('uploadInner').style.display    = 'flex';
}

function resetUpload() {
  showInner(); notesText=''; chatHistory=[];
  document.getElementById('sidebarStats').style.display   = 'none';
  document.getElementById('actionCards').style.display    = 'none';
  ['navNotes','navSummary','navQuestions','navChat'].forEach(id => document.getElementById(id).disabled=true);
  document.getElementById('chatInput').disabled = true;
  document.getElementById('sendBtn').disabled   = true;
  goToSection('upload');
}

function enableApp() {
  ['navNotes','navSummary','navQuestions','navChat'].forEach(id => document.getElementById(id).disabled=false);
  document.getElementById('chatInput').disabled = false;
  document.getElementById('sendBtn').disabled   = false;
  document.getElementById('actionCards').style.display  = 'grid';
  document.getElementById('sidebarStats').style.display = 'block';
  document.getElementById('statChars').textContent = notesText.length.toLocaleString();
  document.getElementById('statWords').textContent = notesText.split(/\s+/).filter(Boolean).length.toLocaleString();
  setStatus('ready','Notes loaded');
}

/* ── Summarize ───────────────────────── */
async function triggerSummarize() {
  if(!notesText || isProcessing) return;
  goToSection('summary');
  isProcessing = true;
  setStatus('busy','Summarizing…');

  show('summaryEmpty',false); show('summaryContent',false); show('summaryLoading',true);

  try {
    const res = await fetch(`${API_BASE}/summarize`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text: notesText})
    });
    if(!res.ok) { const d=await res.json(); throw new Error(d.error||'Failed'); }

    show('summaryLoading',false); show('summaryContent',true);
    document.getElementById('copySummaryBtn').style.display  = 'inline-flex';
    document.getElementById('regenSummaryBtn').style.display = 'inline-flex';

    const el = document.getElementById('summaryContent');
    el.innerHTML = '';
    await streamSSE(res, el, 'p');
    setStatus('ready','Summary done');
  } catch(err) {
    show('summaryLoading',false); show('summaryEmpty',true);
    showToast(err.message,'error'); setStatus('error','Error');
  } finally { isProcessing=false; }
}

/* ── Exam Questions ──────────────────── */
async function triggerQuestions() {
  if(!notesText || isProcessing) return;
  goToSection('questions');
  isProcessing = true;
  setStatus('busy','Generating questions…');

  show('questionsEmpty',false); show('questionsContent',false); show('questionsLoading',true);

  try {
    const res  = await fetch(`${API_BASE}/questions`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text: notesText})
    });
    if(!res.ok) { const d=await res.json(); throw new Error(d.error||'Failed'); }

    const data = await res.json();
    show('questionsLoading',false); show('questionsContent',true);
    document.getElementById('copyQBtn').style.display  = 'inline-flex';
    document.getElementById('regenQBtn').style.display = 'inline-flex';

    const list = document.getElementById('questionsContent');
    list.innerHTML = '';
    data.questions.forEach((q,i) => {
      const div = document.createElement('div');
      div.className = 'question-item';
      div.style.animationDelay = `${i*0.08}s`;
      div.innerHTML = `<span class="question-num">Q${i+1}</span><span class="question-text">${esc(q)}</span>`;
      list.appendChild(div);
    });
    setStatus('ready','Questions ready');
  } catch(err) {
    show('questionsLoading',false); show('questionsEmpty',true);
    showToast(err.message,'error'); setStatus('error','Error');
  } finally { isProcessing=false; }
}

/* ── Chat ────────────────────────────── */
const chatInput = document.getElementById('chatInput');
const sendBtn   = document.getElementById('sendBtn');

chatInput.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendChat();} });
chatInput.addEventListener('input', () => { chatInput.style.height='auto'; chatInput.style.height=Math.min(chatInput.scrollHeight,120)+'px'; });

function sendQuickQ(btn) { chatInput.value=btn.textContent; sendChat(); }

async function sendChat() {
  const text = chatInput.value.trim();
  if(!text || isProcessing || !notesText) return;
  isProcessing=true; chatInput.value=''; chatInput.style.height='auto';
  sendBtn.disabled=true;
  setStatus('busy','Thinking…');

  const welcome = document.getElementById('chatWelcome');
  if(welcome) welcome.style.display='none';

  chatHistory.push({role:'user', content:text});
  appendMsg('user', text);

  const aiEl     = appendMsg('ai','');
  const aiBubble = aiEl.querySelector('.msg-bubble');
  aiBubble.classList.add('typing-cursor');

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text:notesText, history:chatHistory.slice(-10), question:text})
    });
    if(!res.ok) { const d=await res.json(); throw new Error(d.error||'Chat failed'); }

    let full='';
    await streamSSE(res, aiBubble, null, chunk => { full+=chunk; });
    aiBubble.classList.remove('typing-cursor');
    chatHistory.push({role:'assistant', content:full});
    setStatus('ready','Ready');
  } catch(err) {
    aiBubble.classList.remove('typing-cursor');
    aiBubble.innerHTML=`<span style="color:#e74c3c">Error: ${esc(err.message)}</span>`;
    chatHistory.pop();
    setStatus('error','Error');
  } finally {
    isProcessing=false; sendBtn.disabled=false; chatInput.focus();
  }
}

function appendMsg(role, text) {
  const wrap = document.getElementById('chatMessages');
  const div  = document.createElement('div');
  div.className = `chat-msg${role==='user'?' user-msg':''}`;
  div.innerHTML = `
    <div class="msg-avatar ${role==='ai'?'ai-avatar':'usr-avatar'}">${role==='ai'?'AI':'ME'}</div>
    <div class="msg-bubble ${role==='ai'?'ai-bubble':'usr-bubble'}">${esc(text)}</div>`;
  wrap.appendChild(div);
  const ca=document.getElementById('chatArea');
  ca.scrollTop=ca.scrollHeight;
  return div;
}

function clearChat() {
  chatHistory=[]; document.getElementById('chatMessages').innerHTML='';
  const w=document.getElementById('chatWelcome'); if(w) w.style.display='flex';
}

/* ── SSE Stream Helper ───────────────── */
async function streamSSE(res, targetEl, wrapTag=null, onChunk=null) {
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer='', current='';

  if(wrapTag) { const p=document.createElement(wrapTag); targetEl.appendChild(p); targetEl=p; }

  while(true) {
    const {done, value} = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, {stream:true});
    const lines = buffer.split('\n'); buffer=lines.pop();
    for(const line of lines) {
      if(line.startsWith('data: ')) {
        const payload=line.slice(6).trim();
        if(payload==='[DONE]') return;
        try {
          const json=JSON.parse(payload);
          if(json.text!==undefined) {
            current+=json.text;
            if(onChunk) onChunk(json.text);
            targetEl.textContent=current;
            const ca=document.getElementById('chatArea');
            if(ca) ca.scrollTop=ca.scrollHeight;
          }
        } catch {}
      }
    }
  }
}

/* ── Utilities ───────────────────────── */
function show(id, visible) {
  const el=document.getElementById(id);
  if(!el) return;
  el.style.display = visible ? (id.includes('Content')||id.includes('Loading')||id.includes('Empty') ? (id.includes('questions')&&id.includes('Content')?'flex':'block') : 'flex') : 'none';
}

function setStatus(state, text) {
  const dot=document.getElementById('statusDot');
  const lbl=document.getElementById('apiStatusText');
  dot.className='status-dot'+(state==='busy'?' busy':state==='error'?' error':'');
  lbl.textContent=text;
}

function copyText(elId) {
  const el=document.getElementById(elId);
  navigator.clipboard.writeText(el.innerText||el.textContent).then(()=>showToast('Copied!','success'));
}

function copyQuestionsText() {
  const items=[...document.querySelectorAll('.question-text')].map((el,i)=>`${i+1}. ${el.textContent}`).join('\n');
  navigator.clipboard.writeText(items).then(()=>showToast('Copied!','success'));
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type='info') {
  document.querySelector('.toast')?.remove();
  const colors={success:'#2dce89',error:'#e74c3c',info:'#00d4ff'};
  const t=document.createElement('div');
  t.className='toast'; t.textContent=msg;
  Object.assign(t.style,{position:'fixed',bottom:'1.5rem',right:'1.5rem',padding:'0.65rem 1.1rem',background:'#161b24',border:`1px solid ${colors[type]}`,borderRadius:'8px',color:colors[type],fontSize:'0.8rem',zIndex:'9999',boxShadow:'0 0 20px rgba(0,0,0,0.4)',fontFamily:'IBM Plex Sans,sans-serif'});
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 3000);
}
