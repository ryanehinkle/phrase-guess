
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getDatabase,ref,onValue,get,push,runTransaction,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import {firebaseConfig} from './firebase-config.js';
const app=initializeApp(firebaseConfig),db=getDatabase(app),$=id=>document.getElementById(id),root=$('app');
const params=new URLSearchParams(location.search),room=(params.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6),isHost=params.has('host');
const COLORS=['#f87171','#fb923c','#fbbf24','#a3e635','#4ade80','#2dd4bf','#22d3ee','#38bdf8','#60a5fa','#818cf8','#a78bfa','#c084fc','#e879f9','#f472b6','#fb7185','#84cc16','#34d399','#06b6d4','#2563eb','#7c3aed','#d946ef','#be123c','#a16207','#0d9488'];
const key='phraseguess-v3-',gameRef=ref(db,'rooms/'+room+'/game'),playersRef=ref(db,'rooms/'+room+'/players');
const random=()=>{let a=new Uint32Array(6);crypto.getRandomValues(a);return Array.from(a,n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('')};
const uid=()=>crypto.randomUUID();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const distance=(a,b)=>{let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let n=[i];for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=n}return p[b.length]};
const similar=(a,b)=>a===b || (Math.min(a.length,b.length)>=5 && Math.max(a.length,b.length)<=12 && distance(a,b)<=1);
const colorStyle=c=>COLORS.includes(c)?c:'#64748b';
let game={},players={},submissions={},me=null,hostToken=null,serverOffset=0,deck=[],playing=false,lastScreen='',lastRound=-1,roundTimer=null,hostBusy=false;
onValue(ref(db,'.info/serverTimeOffset'),s=>serverOffset=Number(s.val()||0));
const now=()=>Date.now()+serverOffset;
const route=code=>location.pathname+'?room='+code;
const hostRoute=code=>route(code)+'&host=1';
function brand(){return '<span class="brand" aria-label="JINX!">J<span class="glitch-letter" data-letter="I">I</span>NX<span class="glitch-letter bang" data-letter="!">!</span></span>'}
function shell(title,body){root.innerHTML='<div class="layout"><header><a class="logo" href="?">'+brand()+'</a><div class="pill">'+title+'</div></header>'+body+'</div>'}
function home(){shell('WORD MATCH','<main class="welcome"><div class="eyebrow">HOW IN SYNC ARE YOU?</div><h1>Same thought.<br><em>Same word.</em></h1><div class="short-rules"><span>1. Fill in the blank</span><span>2. Match someone else</span><span>3. Score points or build a streak</span></div><div class="actions"><button id="create" class="primary">Create room</button><button id="joinBtn">Join room</button></div><form id="joinForm" class="joinform hidden"><input id="roomcode" maxlength="6" placeholder="ROOM CODE" required autocomplete="off"><button class="primary">Join</button></form><p class="footnote">2 players: 10 rounds · 3+: first to 25</p></main>');
 $('create').onclick=()=>{unlockSound();const code=random(),secret=uid();sessionStorage.setItem(key+'host-'+code,secret);location.href=hostRoute(code)};
 $('joinBtn').onclick=()=>{$('joinForm').classList.toggle('hidden');$('roomcode').focus()};
 $('joinForm').onsubmit=e=>{e.preventDefault();unlockSound();const code=$('roomcode').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);if(code.length===6)location.href=route(code)};
}
async function hostInit(){hostToken=sessionStorage.getItem(key+'host-'+room);if(!hostToken){shell('HOST','<main class="card"><h1>Host session not found</h1><p>Start a new game from the home page on this device.</p><a href="?">Go home</a></main>');return}startListeners();try{
 await runTransaction(ref(db,'rooms/'+room+'/hostSecret'),v=>v===null?hostToken:undefined,{applyLocally:false});
 await runTransaction(ref(db,'rooms/'+room+'/createdAt'),v=>v===null?Date.now():undefined,{applyLocally:false});
 await runTransaction(gameRef,v=>v===null?{phase:'lobby',round:0,roundKey:'0',hostToken,used:{},scores:{},duration:45,winningScore:25,mode:'classic',streak:0,bestStreak:0,matches:0}:undefined,{applyLocally:false});
 }catch(e){showError(e)}}
function playerInit(){try{me=JSON.parse(localStorage.getItem(key+'player-'+room)||'null')}catch{}startListeners()}
function startListeners(){onValue(gameRef,s=>{game=s.val()||{};render();if(isHost)hostCheck()},showError);onValue(playersRef,s=>{players=s.val()||{};if(me&&(!players[me.id]||players[me.id].name!==me.name)){me=null;localStorage.removeItem(key+'player-'+room)}render();if(isHost)hostCheck()},showError);onValue(ref(db,'rooms/'+room+'/submissions'),s=>{submissions=s.val()||{};render();if(isHost)hostCheck()},showError);roundTimer=setInterval(()=>{updateClocks();paintReveal();if(isHost)hostCheck()},65)}
function showError(e){console.error(e);let box=$('error');if(box){box.textContent='Connection issue: '+(e?.message||e);box.classList.remove('hidden')}}
function playerArray(){return Object.values(players).filter(p=>p&&p.name&&p.color).sort((a,b)=>(a.joined||0)-(b.joined||0))}
function lobbyMarkup(){let roster=playerArray();return '<section class="lobby"><div class="eyebrow">ROOM '+room+'</div><h1>Ready when<br><em>you are.</em></h1><p>Scan the code. Pick a color.</p><div class="roster">'+(roster.map(p=>'<div class="person"><i style="background:'+colorStyle(p.color)+'"></i>'+esc(p.name)+'</div>').join('')||'<span class="muted">Waiting for players…</span>')+'</div><div class="muted">'+roster.length+' player'+(roster.length!==1?'s':'')+' here</div></section>'}
function qrMarkup(){const url=new URL(route(room),location.href).href;return '<div class="qrwrap"><div class="qrframe" id="qrframe"><img id="qr" alt="Join QR code"></div><div><small>JOIN CODE</small><strong>'+room+'</strong><a href="'+esc(url)+'" target="_blank" rel="noopener">Join link</a></div></div>'}
function drawQR(){const frame=$('qrframe');if(!frame)return;const url=new URL(route(room),location.href).href;const img=$('qr');img.src='https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=6&data='+encodeURIComponent(url);if(typeof QRCodeStyling==='undefined')return;try{const q=new QRCodeStyling({width:142,height:142,type:'svg',data:url,margin:4,qrOptions:{errorCorrectionLevel:'H'},dotsOptions:{type:'rounded',color:'#192b54'},cornersSquareOptions:{type:'extra-rounded',color:'#4f83ff'},cornersDotOptions:{type:'dot',color:'#192b54'},backgroundOptions:{color:'#f5f8ff'}});q.append(frame);img.style.display='none'}catch(e){console.warn('QR fallback',e)}}
function scoreboard(){if(game.mode==='duo'&&game.phase!=='lobby')return '<div class="duo-stats"><div><b>'+Number(game.matches||0)+'</b><span>matches / 10</span></div><div><b>'+Number(game.streak||0)+'</b><span>streak</span></div><div><b>'+Number(game.bestStreak||0)+'</b><span>best streak</span></div></div>';return '<div class="scores">'+playerArray().slice().sort((a,b)=>(game.scores?.[b.id]||0)-(game.scores?.[a.id]||0)).map((p,i)=>'<div class="score"><span class="rank">'+(i+1)+'</span><i style="background:'+colorStyle(p.color)+'"></i><span>'+esc(p.name)+'</span><b data-final-score="'+Number(game.scores?.[p.id]||0)+'" data-last-earned="'+Number(game.lastPoints?.[p.id]||0)+'">'+Number(game.scores?.[p.id]||0)+'</b></div>').join('')+'</div>'}

// Reveal timing is derived from the shared Firebase timestamp, so every phone
// animates together, including a phone that reconnects mid-reveal.
const REVEAL_LEAD_MS=1350, REVEAL_LETTER_MS=95, REVEAL_AFTER_MS=1700;
function displayAnswer(value){
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9\s]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
}
function revealEntries(){
  const answers=submissions[game.round]||{};
  return playerArray().map(p=>({...p,answer:displayAnswer(answers[p.id]?.text||''),points:Number(game.lastPoints?.[p.id]||0)}));
}
function revealDuration(){
  return REVEAL_LEAD_MS + Math.max(0,...revealEntries().map(p=>p.answer.length))*REVEAL_LETTER_MS + REVEAL_AFTER_MS;
}
function revealElapsed(){return game.revealedAt ? Math.max(0,now()-Number(game.revealedAt)) : Number.MAX_SAFE_INTEGER}
function revealFinished(){return !['results','ended'].includes(game.phase)||revealElapsed()>=revealDuration()}
function responseList(){
  const entries=revealEntries(),part=String(game.prompt||'').split('_____');
  const before=esc((part[0]||'').trim()),after=esc((part.slice(1).join('_____')||'').trim());
  const cards=entries.map(p=>'<div class="reveal reveal-line" data-reveal-answer="'+esc(p.answer)+'" data-reveal-player="'+esc(p.id)+'" style="--player:'+colorStyle(p.color)+'"><div class="reveal-owner"><i></i><span class="rname">'+esc(p.name)+'</span></div><div class="completed-phrase">'+(before?'<span class="phrase-fixed">'+before+'</span> ':'')+'<span class="typed-slot"><span class="ranswer" aria-label="Answer"></span><span class="typing-caret" aria-hidden="true"></span></span>'+(after?' <span class="phrase-fixed">'+after+'</span>':'')+'</div><b class="reveal-points '+(p.points===3?'bigpoints':p.points?'somepoints':'zeropoints')+'" data-earned="'+p.points+'">'+(p.points?'+'+p.points:'—')+'</b></div>').join('');
  return '<div class="reveal-intro" id="revealIntro">GET READY TO REVEAL</div><div class="reveals typed-reveals">'+cards+'</div><div class="match-celebration" id="matchCelebration" aria-live="polite"></div>';
}
let celebratedRound='';
function paintReveal(){
  if(!['results','ended'].includes(game.phase))return;
  const elapsed=revealElapsed(),letterCount=Math.max(0,Math.floor((elapsed-REVEAL_LEAD_MS)/REVEAL_LETTER_MS));
  const done=revealFinished();
  const cards=document.querySelectorAll('[data-reveal-answer]');
  for(const card of cards){
    const answer=card.dataset.revealAnswer||'',target=card.querySelector('.ranswer');
    const visible=elapsed>=REVEAL_LEAD_MS?answer.slice(0,letterCount):'';
    if(target&&target.textContent!==visible)target.textContent=visible;
    card.classList.toggle('typing-started',elapsed>=REVEAL_LEAD_MS);
    card.classList.toggle('typing-complete',done);
    if(elapsed>=REVEAL_LEAD_MS&&letterCount>=answer.length)card.classList.add('word-complete');
  }
  const cinema=$('revealScreen');if(cinema){cinema.classList.toggle('break-away',done);if(done&&revealElapsed()>revealDuration()+280)cinema.remove()};const intro=$('revealIntro');
  if(intro)intro.textContent=elapsed<REVEAL_LEAD_MS?'GET READY TO REVEAL':done?'ANSWERS REVEALED':'EVERYONE IS REVEALING…';
  for(const points of document.querySelectorAll('.reveal-points')){
    points.classList.toggle('points-shown',done);
  }
  for(const score of document.querySelectorAll('[data-final-score]')){
    const value=Number(score.dataset.finalScore||0),earned=Number(score.dataset.lastEarned||0);
    const shown=done?value:value-earned;
    if(score.textContent!==String(shown))score.textContent=String(shown);
    score.classList.toggle('score-gained',done&&earned>0);
  }
  const mine=$('myRoundPoints');
  if(mine)mine.classList.toggle('points-shown',done);
  const next=$('next');if(next)next.disabled=!done;
  const finish=$('finish');if(finish)finish.disabled=!done;
  const celebration=$('matchCelebration');
  const matching=revealEntries().filter(p=>p.points>0);
  if(celebration){
    celebration.textContent=done?(game.mode==='duo'?(game.lastMatch?'JINX! · '+game.streak+' IN A ROW':'NO MATCH'):(matching.length?matching.length+' MATCHED':'NO MATCHES')):'';
    celebration.classList.toggle('visible',done);
  }
  const id=game.round+'-'+game.revealedAt;
  if(done&&matching.length&&celebratedRound!==id&&elapsed<revealDuration()+2200){
    celebratedRound=id;
    spawnConfetti();
  }
}

function syncRevealScreen(){
 if(!['results','ended'].includes(game.phase)){document.getElementById('revealScreen')?.remove();return}
 if(revealElapsed()>=revealDuration()+280){document.getElementById('revealScreen')?.remove();return}
 const id=room+'-'+game.round+'-'+game.revealedAt;
 if(document.getElementById('revealScreen')?.dataset.key===id)return;
 document.getElementById('revealScreen')?.remove();
 const el=document.createElement('div');el.id='revealScreen';el.dataset.key=id;el.className='cinema';
 el.innerHTML='<div class="cinema-grid"><div class="cinema-kicker">ROUND '+game.round+'</div><div class="cinema-prompt">'+esc(game.prompt||'')+'</div><div class="cinema-title">LET’S SEE…</div><div class="cinema-answers">'+revealEntries().map(p=>'<div class="cinema-answer" data-reveal-answer="'+esc(p.answer)+'" style="--player:'+colorStyle(p.color)+'"><small>'+esc(p.name)+'</small><strong class="ranswer"></strong><span class="typing-caret"></span></div>').join('')+'</div><div class="cinema-outcome">'+(game.mode==='duo'?(game.lastMatch?'JINX!':'NOT THIS TIME'):(revealEntries().some(p=>p.points>0)?'MATCH!':'NO MATCH'))+'</div></div>';
 document.body.append(el);paintReveal();
}

function spawnConfetti(){
  const stage=document.querySelector('.stage')||document.querySelector('.mobilecenter');
  if(!stage||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const layer=document.createElement('div');layer.className='confetti-layer';layer.setAttribute('aria-hidden','true');
  const choices=['#ffd36f','#76a9ff','#7bf0ba','#f9a0d2','#bd9eff','#ffffff'];
  for(let i=0;i<48;i++){
    const piece=document.createElement('span');piece.className='confetti-bit';
    piece.style.setProperty('--x',(Math.random()*100).toFixed(2)+'%');
    piece.style.setProperty('--drift',((Math.random()-.5)*230).toFixed(1)+'px');
    piece.style.setProperty('--delay',(Math.random()*.5).toFixed(2)+'s');
    piece.style.setProperty('--duration',(2.1+Math.random()*1.6).toFixed(2)+'s');
    piece.style.background=choices[i%choices.length];layer.append(piece);
  }
  stage.append(layer);
  setTimeout(()=>layer.remove(),4300);
}
function compute(roster,answers){const clusters=[];const points={};for(const p of roster){const text=answers[p.id]?.text;if(!text)continue;const n=normalize(text);if(!n)continue;let group=clusters.find(g=>g.keys.some(k=>similar(n,k)));if(!group){group={keys:[],ids:[]};clusters.push(group)}group.keys.push(n);group.ids.push(p.id)}for(const g of clusters)for(const id of g.ids)points[id]=g.ids.length===2?3:g.ids.length>=3?1:0;return {points,clusters}}
function answerCount(){const ans=submissions[game.round]||{};return playerArray().filter(p=>ans[p.id]?.text).length}
function roundMarkup(){const phase=game.phase,answering=phase==='answering',results=phase==='results',ended=phase==='ended';return '<section class="gameview"><div class="eyebrow">ROUND '+game.round+'</div><div class="prompt">'+esc(game.prompt||'')+'</div><div class="timerwrap">'+(answering?'<div id="timer" class="timer">0:00</div><div class="progress"><div id="bar"></div></div><div class="muted" id="count">'+answerCount()+' / '+playerArray().length+' answers locked</div>':'<div class="eyebrow">'+(ended?'FINAL':'REVEALED')+'</div>')+'</div>'+(results||ended?responseList():'<div class="waiting"><div class="pulse"></div>Waiting for everyone to answer...</div>')+'</section>'}
function hostRender(){const oldInput=$('duration')?.value;const needScreen=game.phase+'-'+game.round+'-'+playerArray().map(p=>p.id).join(',')+'-'+JSON.stringify(game.scores||{})+'-'+JSON.stringify(game.lastPoints||{})+'-'+game.revealedAt;
 if(needScreen===lastScreen){updateClocks();paintReveal();return}lastScreen=needScreen;
 shell('HOST • '+room,'<main class="hostgrid"><div class="stage">'+(game.phase==='lobby'?lobbyMarkup():roundMarkup())+'</div><aside class="side">'+qrMarkup()+'<h3>'+(game.mode==='duo'&&game.phase!=='lobby'?'Duo challenge':'Scores')+'</h3>'+scoreboard()+'<div class="hostcontrols">'+(game.phase==='lobby'?'<label>Round timer <select id="duration"><option value="30">30 seconds</option><option value="45">45 seconds</option><option value="60">60 seconds</option><option value="90">90 seconds</option></select></label><button id="start" class="primary">Start game →</button>':game.phase==='answering'?'<button id="reveal">Reveal early</button>':game.phase==='results'?(((game.mode==='duo'&&game.round>=10)||(game.mode!=='duo'&&Math.max(0,...Object.values(game.scores||{}))>=Number(game.winningScore||25)))?'<button id="finish" class="primary">Final results</button>':'<button id="next" class="primary">Next round</button><button id="finish">End game</button>'):'<button id="restart" class="primary">Play again</button>')+'</div></aside></main><div id="error" class="error hidden"></div>');
 drawQR();
 if($('start')){$('duration').value=oldInput||String(game.duration||45);$('start').onclick=()=>{unlockSound();if(playerArray().length<2)return alert('Need 2 players.');nextRound(Number($('duration').value))}}
 if($('next'))$('next').onclick=()=>{unlockSound();nextRound(game.duration||45)};
 if($('reveal'))$('reveal').onclick=()=>finishRound();
 if($('finish'))$('finish').onclick=()=>{if(revealFinished())updateGame(g=>g.phase==='results'?{...g,phase:'ended'}:undefined)};
 if($('restart'))$('restart').onclick=()=>updateGame(g=>({...g,phase:'lobby',round:0,roundKey:'0',used:{},scores:{},streak:0,bestStreak:0,matches:0}));
 updateClocks();paintReveal();syncRevealScreen()
}
function renderPlayer(){if(!game.phase){shell('JOIN ROOM','<main class="card"><h1>Looking for room…</h1><p>Make sure the host has created it.</p></main>');return}
 if(!me){playerJoin();return}
 const answer=submissions[game.round]?.[me.id];
 const phase=game.phase;
 const stamp=phase+'-'+game.round+'-'+!!answer+'-'+JSON.stringify(game.scores||{})+'-'+JSON.stringify(game.lastPoints||{})+'-'+game.revealedAt;
 if(lastScreen===stamp){updateClocks();paintReveal();return}lastScreen=stamp;
 let body='<main class="mobile"><div class="playerbar"><span><i style="background:'+colorStyle(me.color)+'"></i>'+esc(me.name)+'</span><b><span data-final-score="'+Number(game.scores?.[me.id]||0)+'" data-last-earned="'+Number(game.lastPoints?.[me.id]||0)+'">'+Number(game.scores?.[me.id]||0)+'</span> pts</b></div>';
 if(phase==='lobby')body+='<div class="mobilecenter"><div class="eyebrow">ROOM '+room+'</div><h1>You’re in!</h1><p>Waiting for the host to start.</p><div class="spin"></div><span class="muted">'+playerArray().length+' players in the lobby</span></div>';
 else if(phase==='answering')body+='<div class="mobilecenter"><div class="eyebrow">ROUND '+game.round+'</div><div class="prompt mobileprompt">'+esc(game.prompt)+'</div><div class="timer" id="timer">0:00</div><div class="progress"><div id="bar"></div></div>'+(answer?'<div class="submitted"><span class="check">✓</span><h2>Answer locked!</h2><p>'+esc(answer.text)+'</p><span class="muted" id="count">'+answerCount()+' of '+playerArray().length+' submitted</span></div>':'<form id="answerform"><input id="answer" maxlength="48" placeholder="Your word…" autocomplete="off" enterkeyhint="send" required><button class="primary">Lock in answer →</button><p class="muted">Your answer stays hidden until reveal.</p></form>')+'</div>';
 else body+='<div class="mobilecenter"><div class="eyebrow">'+(phase==='ended'?'FINAL':'ROUND '+game.round)+'</div><div class="prompt mobileprompt">'+esc(game.prompt||'')+'</div>'+(game.mode==='duo'?'<div class="duo-score-mobile">'+Number(game.matches||0)+' / 10 MATCHES · '+Number(game.streak||0)+' STREAK</div>':'<div class="yourpoints" id="myRoundPoints">+'+Number(game.lastPoints?.[me.id]||0)+'</div>')+responseList()+'<p class="muted">'+(phase==='ended'?'Game over':'Next round soon…')+'</p></div>';
 body+='</main><div id="error" class="error hidden"></div>';shell('PLAYER • '+room,body);
 if($('answerform'))$('answerform').onsubmit=async e=>{e.preventDefault();unlockSound();const v=$('answer').value.trim().replace(/\s+/g,' ');if(!v)return;const button=$('answerform').querySelector('button');button.disabled=true;try{const path=ref(db,'rooms/'+room+'/submissions/'+game.round+'/'+me.id);const tx=await runTransaction(path,current=>current===null?{text:v,at:Date.now()}:undefined,{applyLocally:false});if(!tx.committed)throw Error('Already submitted');}catch(err){button.disabled=false;alert(err.message)}};
 updateClocks();paintReveal();syncRevealScreen()
}
function playerJoin(){if(lastScreen==='join'&&$('joinplayer'))return;lastScreen='join';shell('JOIN • '+room,'<main class="card joincard"><div class="eyebrow">ROOM '+room+'</div><h1>Join the game</h1><p>Pick a name and a unique color.</p><form id="joinplayer"><input id="nickname" maxlength="20" placeholder="Your name" required autocomplete="nickname"><h3>Choose your color</h3><div class="colorgrid" id="colors"></div><button class="primary">Join game →</button><div id="joinerror" class="error hidden"></div></form></main>');
 let chosen=null;for(const color of COLORS){let taken=playerArray().some(p=>p.color===color),b=document.createElement('button');b.className='color'+(taken?' taken':'');b.type='button';b.style.background=color;b.disabled=taken;b.title=taken?'Taken':color;b.onclick=()=>{chosen=color;document.querySelectorAll('.color').forEach(x=>x.classList.remove('active'));b.classList.add('active')};$('colors').append(b)}
 $('joinplayer').onsubmit=async e=>{e.preventDefault();let name=$('nickname').value.trim().replace(/\s+/g,' ');if(!chosen){$('joinerror').textContent='Choose an available color.';$('joinerror').classList.remove('hidden');return}
 let pid=uid(),submit=$('joinplayer').querySelector('button.primary');submit.disabled=true;
 try{let response=await runTransaction(playersRef,current=>{let all=current||{};if(Object.values(all).some(p=>p.color===chosen||p.name.toLowerCase()===name.toLowerCase()))return;return {...all,[pid]:{id:pid,name,color:chosen,joined:Date.now()}}},{applyLocally:false});if(!response.committed)throw Error('That name or color was just taken. Pick another.');me={id:pid,name,color:chosen};localStorage.setItem(key+'player-'+room,JSON.stringify(me));render()}catch(err){$('joinerror').textContent=err.message;$('joinerror').classList.remove('hidden');submit.disabled=false}
 }
}
function render(){if(!room)return;if(isHost&&hostToken)hostRender();else if(!isHost)renderPlayer()}

let lastTickKey='',tickAudio=null,soundReady=false;
function unlockSound(){soundReady=true;if(!tickAudio){tickAudio=new Audio('data:audio/mpeg;base64,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');tickAudio.preload='auto';tickAudio.volume=.45;}}
function countdownTick(remaining){
 if(!soundReady||remaining<=0||remaining>10||game.phase!=='answering')return;
 const id=game.round+':'+remaining;if(id===lastTickKey)return;lastTickKey=id;
 try{tickAudio.pause();tickAudio.currentTime=0;tickAudio.play().catch(()=>{});}catch{}
}

function updateClocks(){if(game.phase!=='answering')return;let remain=Math.max(0,Math.ceil((game.deadline-now())/1000));countdownTick(remain);if($('timer')){$('timer').textContent=Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0');$('timer').classList.toggle('danger',remain<=10)}if($('bar'))$('bar').style.width=Math.min(100,Math.max(0,(game.deadline-now())/((game.duration||45)*1000)*100))+'%';if($('count'))$('count').textContent=answerCount()+' / '+playerArray().length+' locked'}
async function updateGame(fn){if(!hostToken)return;try{await runTransaction(gameRef,g=>{if(!g||g.hostToken!==hostToken)return;return fn(g)},{applyLocally:false})}catch(e){showError(e)}}
async function nextRound(duration){if(hostBusy||(game.phase==='results'&&!revealFinished()))return;hostBusy=true;try{if(!deck.length){let res=await fetch('./prompts.json');if(!res.ok)throw Error('Prompt deck unavailable');deck=await res.json()}
 await updateGame(g=>{if(!['lobby','results'].includes(g.phase)||(g.mode==='duo'&&g.round>=10))return;let used=g.used||{};let choices=deck.map((_,i)=>i).filter(i=>!used[i]);if(!choices.length){used={};choices=deck.map((_,i)=>i)}let index=choices[Math.floor(Math.random()*choices.length)];return {...g,phase:'answering',round:(g.round||0)+1,roundKey:String((g.round||0)+1),prompt:deck[index],duration,deadline:now()+duration*1000,used:{...used,[index]:true},lastPoints:{},mode:g.phase==='lobby'?(playerArray().length===2?'duo':'classic'):(g.mode||'classic')}})}catch(e){alert(e.message)}finally{hostBusy=false}}
async function finishRound(){if(hostBusy)return;hostBusy=true;try{const snap=await get(ref(db,'rooms/'+room+'/submissions/'+game.round));const answerMap=snap.val()||{};const results=compute(playerArray(),answerMap);await updateGame(g=>{if(g.phase!=='answering')return;let scores={...(g.scores||{})};for(const [pid,pts] of Object.entries(results.points))scores[pid]=(scores[pid]||0)+pts;const duo=g.mode==='duo',match=duo&&playerArray().length===2&&Object.values(results.points).filter(x=>x===3).length===2;const streak=duo?(match?(g.streak||0)+1:0):0;return {...g,phase:'results',revealedAt:now(),scores,lastPoints:results.points,lastMatch:match,streak,bestStreak:duo?Math.max(g.bestStreak||0,streak):0,matches:duo?(g.matches||0)+(match?1:0):0}})}finally{hostBusy=false}}
function hostCheck(){if(!isHost||game.phase!=='answering'||hostBusy)return;const total=playerArray().length;if(now()>=game.deadline || (total>=2&&answerCount()>=total))finishRound()}
if(!room)home();else if(isHost)hostInit();else playerInit();
