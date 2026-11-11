
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
function shell(title,body){root.innerHTML='<div class="layout"><header><a class="logo" href="?">◈ Phrase Guess</a><div class="pill">'+title+'</div></header>'+body+'</div>'}
function home(){shell('PLAY TOGETHER','<main class="welcome"><div class="eyebrow">THE WORD MATCHING PARTY GAME</div><h1>Think alike.<br><em>Score big.</em></h1><p>Complete the blank. Match another player. Watch the answers come to life.</p><div class="actions"><button id="create" class="primary">Create room →</button><button id="joinBtn">Join a room</button></div><form id="joinForm" class="joinform hidden"><input id="roomcode" maxlength="6" placeholder="ROOM CODE" required autocomplete="off"><button class="primary">Join</button></form><div class="footnote">Phones join for free. No accounts or downloads.</div></main>');
 $('create').onclick=()=>{const code=random(),secret=uid();sessionStorage.setItem(key+'host-'+code,secret);location.href=hostRoute(code)};
 $('joinBtn').onclick=()=>{$('joinForm').classList.toggle('hidden');$('roomcode').focus()};
 $('joinForm').onsubmit=e=>{e.preventDefault();const code=$('roomcode').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);if(code.length===6)location.href=route(code)};
}
async function hostInit(){hostToken=sessionStorage.getItem(key+'host-'+room);if(!hostToken){shell('HOST','<main class="card"><h1>Host session not found</h1><p>Start a new game from the home page on this device.</p><a href="?">Go home</a></main>');return}startListeners();try{
 await runTransaction(ref(db,'rooms/'+room+'/hostSecret'),v=>v===null?hostToken:undefined,{applyLocally:false});
 await runTransaction(ref(db,'rooms/'+room+'/createdAt'),v=>v===null?Date.now():undefined,{applyLocally:false});
 await runTransaction(gameRef,v=>v===null?{phase:'lobby',round:0,roundKey:'0',hostToken,used:{},scores:{},duration:45,winningScore:25}:undefined,{applyLocally:false});
 }catch(e){showError(e)}}
function playerInit(){try{me=JSON.parse(localStorage.getItem(key+'player-'+room)||'null')}catch{}startListeners()}
function startListeners(){onValue(gameRef,s=>{game=s.val()||{};render();if(isHost)hostCheck()},showError);onValue(playersRef,s=>{players=s.val()||{};if(me&&(!players[me.id]||players[me.id].name!==me.name)){me=null;localStorage.removeItem(key+'player-'+room)}render();if(isHost)hostCheck()},showError);onValue(ref(db,'rooms/'+room+'/submissions'),s=>{submissions=s.val()||{};render();if(isHost)hostCheck()},showError);roundTimer=setInterval(()=>{updateClocks();paintReveal();if(isHost)hostCheck()},65)}
function showError(e){console.error(e);let box=$('error');if(box){box.textContent='Connection issue: '+(e?.message||e);box.classList.remove('hidden')}}
function playerArray(){return Object.values(players).filter(p=>p&&p.name&&p.color).sort((a,b)=>(a.joined||0)-(b.joined||0))}
function lobbyMarkup(){let roster=playerArray();return '<section class="lobby"><div class="eyebrow">ROOM '+room+'</div><h1>Ready to get on<br><em>the same wavelength?</em></h1><p>Join on your phone, pick your color, and get ready to match.</p><div class="roster">'+(roster.map(p=>'<div class="person"><i style="background:'+colorStyle(p.color)+'"></i>'+esc(p.name)+'</div>').join('')||'<span class="muted">Waiting for players to join...</span>')+'</div><div class="muted">'+roster.length+' player'+(roster.length!==1?'s':'')+' connected</div></section>'}
function qrMarkup(){const url=new URL(route(room),location.href).href;return '<div class="qrwrap"><img id="qr" alt="Join QR code"><div><small>JOIN CODE</small><strong>'+room+'</strong><a href="'+esc(url)+'" target="_blank" rel="noopener">Open player link</a></div></div>'}
function scoreboard(){return '<div class="scores">'+playerArray().slice().sort((a,b)=>(game.scores?.[b.id]||0)-(game.scores?.[a.id]||0)).map((p,i)=>'<div class="score"><span class="rank">'+(i+1)+'</span><i style="background:'+colorStyle(p.color)+'"></i><span>'+esc(p.name)+'</span><b data-final-score="'+Number(game.scores?.[p.id]||0)+'" data-last-earned="'+Number(game.lastPoints?.[p.id]||0)+'">'+Number(game.scores?.[p.id]||0)+'</b></div>').join('')+'</div>'}

// Reveal timing is derived from the shared Firebase timestamp, so every phone
// animates together, including a phone that reconnects mid-reveal.
const REVEAL_LEAD_MS=650, REVEAL_LETTER_MS=95, REVEAL_AFTER_MS=650;
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
  const cards=document.querySelectorAll('.reveal-line');
  for(const card of cards){
    const answer=card.dataset.revealAnswer||'',target=card.querySelector('.ranswer');
    const visible=elapsed>=REVEAL_LEAD_MS?answer.slice(0,letterCount):'';
    if(target&&target.textContent!==visible)target.textContent=visible;
    card.classList.toggle('typing-started',elapsed>=REVEAL_LEAD_MS);
    card.classList.toggle('typing-complete',done);
    if(elapsed>=REVEAL_LEAD_MS&&letterCount>=answer.length)card.classList.add('word-complete');
  }
  const intro=$('revealIntro');
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
    celebration.textContent=done?(matching.length?'✨ '+matching.length+' players matched!':'No matches this round — next one!'):'';
    celebration.classList.toggle('visible',done);
  }
  const id=game.round+'-'+game.revealedAt;
  if(done&&matching.length&&celebratedRound!==id&&elapsed<revealDuration()+2200){
    celebratedRound=id;
    spawnConfetti();
  }
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
function roundMarkup(){const phase=game.phase,answering=phase==='answering',results=phase==='results',ended=phase==='ended';return '<section class="gameview"><div class="eyebrow">ROUND '+game.round+'</div><div class="prompt">'+esc(game.prompt||'')+'</div><div class="timerwrap">'+(answering?'<div id="timer" class="timer">0:00</div><div class="progress"><div id="bar"></div></div><div class="muted" id="count">'+answerCount()+' / '+playerArray().length+' answers locked</div>':'<div class="eyebrow">'+(ended?'🏆 FINAL STANDINGS':'THE ANSWERS ARE IN')+'</div>')+'</div>'+(results||ended?responseList():'<div class="waiting"><div class="pulse"></div>Waiting for everyone to answer...</div>')+'</section>'}
function hostRender(){const oldInput=$('duration')?.value;const needScreen=game.phase+'-'+game.round+'-'+playerArray().length+'-'+answerCount()+'-'+JSON.stringify(game.scores||{})+'-'+JSON.stringify(game.lastPoints||{});
 if(needScreen===lastScreen){updateClocks();paintReveal();return}lastScreen=needScreen;
 shell('HOST • '+room,'<main class="hostgrid"><div class="stage">'+(game.phase==='lobby'?lobbyMarkup():roundMarkup())+'</div><aside class="side">'+qrMarkup()+'<h3>Leaderboard</h3>'+scoreboard()+'<div class="hostcontrols">'+(game.phase==='lobby'?'<label>Round timer <select id="duration"><option value="30">30 seconds</option><option value="45">45 seconds</option><option value="60">60 seconds</option><option value="90">90 seconds</option></select></label><button id="start" class="primary">Start game →</button>':game.phase==='answering'?'<button id="reveal">Reveal early</button>':game.phase==='results'?(Math.max(0,...Object.values(game.scores||{}))>=Number(game.winningScore||25)?'<button id="finish" class="primary">Show final standings 🏆</button>':'<button id="next" class="primary">Next round →</button><button id="finish">End game</button>'):'<button id="restart" class="primary">Play again</button>')+'</div></aside></main><div id="error" class="error hidden"></div>');
 const qr=$('qr');qr.src='https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data='+encodeURIComponent(new URL(route(room),location.href).href);
 if($('start')){$('duration').value=oldInput||String(game.duration||45);$('start').onclick=()=>{if(playerArray().length<2)return alert('At least two players needed.');nextRound(Number($('duration').value))}}
 if($('next'))$('next').onclick=()=>nextRound(game.duration||45);
 if($('reveal'))$('reveal').onclick=()=>finishRound();
 if($('finish'))$('finish').onclick=()=>{if(revealFinished())updateGame(g=>g.phase==='results'?{...g,phase:'ended'}:undefined)};
 if($('restart'))$('restart').onclick=()=>updateGame(g=>({...g,phase:'lobby',round:0,roundKey:'0',used:{},scores:{}}));
 updateClocks();paintReveal()
}
function renderPlayer(){if(!game.phase){shell('JOIN ROOM','<main class="card"><h1>Looking for room…</h1><p>Make sure the host has created it.</p></main>');return}
 if(!me){playerJoin();return}
 const answer=submissions[game.round]?.[me.id];
 const phase=game.phase;
 const stamp=phase+'-'+game.round+'-'+!!answer+'-'+answerCount()+'-'+JSON.stringify(game.scores||{})+'-'+JSON.stringify(game.lastPoints||{});
 if(lastScreen===stamp){updateClocks();paintReveal();return}lastScreen=stamp;
 let body='<main class="mobile"><div class="playerbar"><span><i style="background:'+colorStyle(me.color)+'"></i>'+esc(me.name)+'</span><b><span data-final-score="'+Number(game.scores?.[me.id]||0)+'" data-last-earned="'+Number(game.lastPoints?.[me.id]||0)+'">'+Number(game.scores?.[me.id]||0)+'</span> pts</b></div>';
 if(phase==='lobby')body+='<div class="mobilecenter"><div class="eyebrow">ROOM '+room+'</div><h1>You’re in!</h1><p>Waiting for the host to start.</p><div class="spin"></div><span class="muted">'+playerArray().length+' players in the lobby</span></div>';
 else if(phase==='answering')body+='<div class="mobilecenter"><div class="eyebrow">ROUND '+game.round+'</div><div class="prompt mobileprompt">'+esc(game.prompt)+'</div><div class="timer" id="timer">0:00</div><div class="progress"><div id="bar"></div></div>'+(answer?'<div class="submitted"><span class="check">✓</span><h2>Answer locked!</h2><p>'+esc(answer.text)+'</p><span class="muted" id="count">'+answerCount()+' of '+playerArray().length+' submitted</span></div>':'<form id="answerform"><input id="answer" maxlength="48" placeholder="Your word…" autocomplete="off" enterkeyhint="send" required><button class="primary">Lock in answer →</button><p class="muted">Your answer stays hidden until reveal.</p></form>')+'</div>';
 else body+='<div class="mobilecenter"><div class="eyebrow">'+(phase==='ended'?'GAME OVER':'ROUND '+game.round+' RESULTS')+'</div><div class="prompt mobileprompt">'+esc(game.prompt||'')+'</div><div class="yourpoints">+'+Number(game.lastPoints?.[me.id]||0)+'</div><p>points this round</p>'+responseList()+'<p class="muted">'+(phase==='ended'?'Thanks for playing!':'Waiting for the next round…')+'</p></div>';
 body+='</main><div id="error" class="error hidden"></div>';shell('PLAYER • '+room,body);
 if($('answerform'))$('answerform').onsubmit=async e=>{e.preventDefault();const v=$('answer').value.trim().replace(/\s+/g,' ');if(!v)return;const button=$('answerform').querySelector('button');button.disabled=true;try{const path=ref(db,'rooms/'+room+'/submissions/'+game.round+'/'+me.id);const tx=await runTransaction(path,current=>current===null?{text:v,at:Date.now()}:undefined,{applyLocally:false});if(!tx.committed)throw Error('Already submitted');}catch(err){button.disabled=false;alert(err.message)}};
 updateClocks();paintReveal()
}
function playerJoin(){if(lastScreen==='join'&&$('joinplayer'))return;lastScreen='join';shell('JOIN • '+room,'<main class="card joincard"><div class="eyebrow">ROOM '+room+'</div><h1>Join the game</h1><p>Pick a name and a unique color.</p><form id="joinplayer"><input id="nickname" maxlength="20" placeholder="Your name" required autocomplete="nickname"><h3>Choose your color</h3><div class="colorgrid" id="colors"></div><button class="primary">Join game →</button><div id="joinerror" class="error hidden"></div></form></main>');
 let chosen=null;for(const color of COLORS){let taken=playerArray().some(p=>p.color===color),b=document.createElement('button');b.className='color'+(taken?' taken':'');b.type='button';b.style.background=color;b.disabled=taken;b.title=taken?'Taken':color;b.onclick=()=>{chosen=color;document.querySelectorAll('.color').forEach(x=>x.classList.remove('active'));b.classList.add('active')};$('colors').append(b)}
 $('joinplayer').onsubmit=async e=>{e.preventDefault();let name=$('nickname').value.trim().replace(/\s+/g,' ');if(!chosen){$('joinerror').textContent='Choose an available color.';$('joinerror').classList.remove('hidden');return}
 let pid=uid(),submit=$('joinplayer').querySelector('button.primary');submit.disabled=true;
 try{let response=await runTransaction(playersRef,current=>{let all=current||{};if(Object.values(all).some(p=>p.color===chosen||p.name.toLowerCase()===name.toLowerCase()))return;return {...all,[pid]:{id:pid,name,color:chosen,joined:Date.now()}}},{applyLocally:false});if(!response.committed)throw Error('That name or color was just taken. Pick another.');me={id:pid,name,color:chosen};localStorage.setItem(key+'player-'+room,JSON.stringify(me));render()}catch(err){$('joinerror').textContent=err.message;$('joinerror').classList.remove('hidden');submit.disabled=false}
 }
}
function render(){if(!room)return;if(isHost&&hostToken)hostRender();else if(!isHost)renderPlayer()}
function updateClocks(){if(game.phase!=='answering')return;let remain=Math.max(0,Math.ceil((game.deadline-now())/1000));if($('timer')){$('timer').textContent=Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0');$('timer').classList.toggle('danger',remain<=10)}if($('bar'))$('bar').style.width=Math.min(100,Math.max(0,(game.deadline-now())/((game.duration||45)*1000)*100))+'%';if($('count'))$('count').textContent=answerCount()+' of '+playerArray().length+' answered'}
async function updateGame(fn){if(!hostToken)return;try{await runTransaction(gameRef,g=>{if(!g||g.hostToken!==hostToken)return;return fn(g)},{applyLocally:false})}catch(e){showError(e)}}
async function nextRound(duration){if(hostBusy||(game.phase==='results'&&!revealFinished()))return;hostBusy=true;try{if(!deck.length){let res=await fetch('./prompts.json');if(!res.ok)throw Error('Prompt deck unavailable');deck=await res.json()}
 await updateGame(g=>{if(!['lobby','results'].includes(g.phase))return;let used=g.used||{};let choices=deck.map((_,i)=>i).filter(i=>!used[i]);if(!choices.length){used={};choices=deck.map((_,i)=>i)}let index=choices[Math.floor(Math.random()*choices.length)];return {...g,phase:'answering',round:(g.round||0)+1,roundKey:String((g.round||0)+1),prompt:deck[index],duration,deadline:now()+duration*1000,used:{...used,[index]:true},lastPoints:{}}})}catch(e){alert(e.message)}finally{hostBusy=false}}
async function finishRound(){if(hostBusy)return;hostBusy=true;try{const snap=await get(ref(db,'rooms/'+room+'/submissions/'+game.round));const answerMap=snap.val()||{};const results=compute(playerArray(),answerMap);await updateGame(g=>{if(g.phase!=='answering')return;let scores={...(g.scores||{})};for(const [pid,pts] of Object.entries(results.points))scores[pid]=(scores[pid]||0)+pts;return {...g,phase:'results',revealedAt:now(),scores,lastPoints:results.points}})}finally{hostBusy=false}}
function hostCheck(){if(!isHost||game.phase!=='answering'||hostBusy)return;const total=playerArray().length;if(now()>=game.deadline || (total>=2&&answerCount()>=total))finishRound()}
if(!room)home();else if(isHost)hostInit();else playerInit();
