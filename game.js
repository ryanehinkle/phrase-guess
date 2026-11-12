
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getDatabase,ref,onValue,get,push,runTransaction,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import {firebaseConfig} from './firebase-config.js';
const app=initializeApp(firebaseConfig),db=getDatabase(app),$=id=>document.getElementById(id),root=$('app');
const params=new URLSearchParams(location.search),room=(params.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6),isHost=params.has('host'),audioDevice=isHost||!room;
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
let gameLoaded=false,playersLoaded=false;
onValue(ref(db,'.info/serverTimeOffset'),s=>serverOffset=Number(s.val()||0));
const now=()=>Date.now()+serverOffset;
const route=code=>location.pathname+'?room='+code;
const hostRoute=code=>route(code)+'&host=1';
function brand(){return '<span class="brand" aria-label="JINX!">J<span class="glitch-letter" data-letter="I">I</span>NX<span class="glitch-letter bang" data-letter="!">!</span></span>'}
function shell(title,body){
 root.innerHTML='<div class="layout'+(!room?' landing-layout':'')+'"><header><a class="logo" href="?">'+brand()+'</a><div class="pill">'+title+'</div></header>'+body+'</div>';
 // Submission updates can replace the entire page while the keyboard is closing.
 // Apply the old dimensions immediately, before the next browser paint.
 if(!isHost&&room&&(keyboardFocus||keyboardClosing)){
   const layout=root.querySelector('.layout');
   if(layout){
     layout.style.zoom=frozenZoom||'1';
     if(frozenHeight){layout.style.height=frozenHeight+'px';layout.style.maxHeight='none'}
   }
 }
 queueFit();
}
function home(){shell('','<main class="welcome landing"><div class="landing-mark">'+brand()+'</div><p>Can you guess the same word?</p><div class="actions"><button id="create" class="primary">Create a room</button><button id="joinBtn">Join a room</button></div><form id="joinForm" class="joinform hidden"><input id="roomcode" maxlength="6" placeholder="ROOM CODE" required autocomplete="off"><button class="primary">Join</button></form></main>');
 $('create').onclick=()=>{unlockSound();const code=random(),secret=uid();sessionStorage.setItem(key+'host-'+code,secret);location.href=hostRoute(code)};
 $('joinBtn').onclick=()=>{$('joinForm').classList.toggle('hidden');$('roomcode').focus();queueFit()};
 $('joinForm').onsubmit=e=>{e.preventDefault();unlockSound();const code=$('roomcode').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);if(code.length===6)location.href=route(code)};
 unlockSound();
}
async function hostInit(){hostToken=sessionStorage.getItem(key+'host-'+room);if(!hostToken){shell('HOST','<main class="card"><h1>Host session not found</h1><p>Start a new game from the home page on this device.</p><a href="?">Go home</a></main>');return}startListeners();unlockSound();try{
 await runTransaction(ref(db,'rooms/'+room+'/hostSecret'),v=>v===null?hostToken:undefined,{applyLocally:false});
 await runTransaction(ref(db,'rooms/'+room+'/createdAt'),v=>v===null?Date.now():undefined,{applyLocally:false});
 await runTransaction(gameRef,v=>v===null?{phase:'lobby',round:0,roundKey:'0',sessionId:uid(),hostToken,used:{},scores:{},duration:45,winningScore:50,mode:'classic',streak:0,bestStreak:0,matches:0}:undefined,{applyLocally:false});
 }catch(e){showError(e)}}
function playerInit(){try{me=JSON.parse(localStorage.getItem(key+'player-'+room)||'null')}catch{}startListeners()}
function syncPlayerSession(){
 if(isHost||!me||!gameLoaded||!playersLoaded)return;
 const record=players[me.id];
 if(!record||record.name!==me.name||(record.sessionId||'legacy')!==(game.sessionId||'legacy')){
  me=null;localStorage.removeItem(key+'player-'+room);lastScreen='';
 }
}
function startListeners(){onValue(gameRef,s=>{game=s.val()||{};gameLoaded=true;syncPlayerSession();if(isHost)syncRoundMusic();render();if(isHost)hostCheck()},showError);onValue(playersRef,s=>{players=s.val()||{};playersLoaded=true;syncPlayerSession();render();if(isHost)hostCheck()},showError);onValue(ref(db,'rooms/'+room+'/submissions'),s=>{submissions=s.val()||{};render();if(isHost){hostCheck();updateTopAnswerPanel()}},showError);roundTimer=setInterval(()=>{updateClocks();paintReveal();if(isHost){syncRoundMusic();hostCheck();updateAutoNext();updateTopAnswerPanel()}},65)}
function showError(e){console.error(e);let box=$('error');if(box){box.textContent='Connection issue: '+(e?.message||e);box.classList.remove('hidden')}}
function playerArray(){return Object.values(players).filter(p=>p&&p.name&&p.color&&(p.sessionId||'legacy')===(game.sessionId||'legacy')).sort((a,b)=>(a.joined||0)-(b.joined||0))}

function lobbyMarkup(){
 const roster=playerArray();
 return '<section class="lobby jinx-lobby"><div class="bubble-field" id="bubbleField" aria-label="Players in lobby"></div><div class="lobby-status"><div class="lobby-wait">'+(roster.length?'Waiting for players…':'Waiting for players…')+'</div><div class="lobby-count">'+roster.length+' player'+(roster.length===1?'':'s')+' here</div></div></section>';
}
function qrMarkup(){
 const url=new URL(route(room),location.href).href;
 return '<div class="qrwrap"><div class="qrframe" id="qrframe"><img id="qr" alt="Join QR code"></div><strong class="qr-code">'+room+'</strong></div>';
}
function drawQR(){
 const frame=$('qrframe');if(!frame)return;
 const url=new URL(route(room),location.href).href;
 const img=$('qr');
 img.src='https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&color=9ACBFF&bgcolor=101B32&data='+encodeURIComponent(url);
 if(typeof QRCodeStyling==='undefined')return;
 try{
  const q=new QRCodeStyling({
   width:184,height:184,type:'svg',data:url,margin:11,
   qrOptions:{errorCorrectionLevel:'H'},
   dotsOptions:{type:'rounded',color:'#9acbff'},
   cornersSquareOptions:{type:'extra-rounded',color:'#9acbff'},
   cornersDotOptions:{type:'dot',color:'#9acbff'},
   backgroundOptions:{color:'rgba(0,0,0,0)'}
  });
  q.append(frame);img.style.display='none';
 }catch(e){console.warn('QR fallback',e)}
}
let bubbleAnimation=0,bubbleField=null,bubbleObjects=[],bubbleLastTime=0;
function stopLobbyBubbles(){if(bubbleAnimation){cancelAnimationFrame(bubbleAnimation);bubbleAnimation=0}bubbleField=null;bubbleObjects=[];bubbleLastTime=0}
function startLobbyBubbles(){
 const field=$('bubbleField');if(!field||bubbleField===field)return;
 stopLobbyBubbles();bubbleField=field;
 const roster=playerArray(),bounds=field.getBoundingClientRect();
 const width=Math.max(220,bounds.width),height=Math.max(160,bounds.height);
 const n=roster.length;
 const size=Math.min(138,Math.max(70,Math.min(width/(Math.ceil(Math.sqrt(Math.max(1,n))*1.6)),height/(Math.ceil(Math.sqrt(Math.max(1,n))*1.5)))));
 bubbleObjects=roster.map((p,i)=>{
  const el=document.createElement('div');el.className='player-orb';
  el.style.setProperty('--orb',colorStyle(p.color));el.textContent=p.name;
  const diameter=Math.min(size,Math.max(70,58+p.name.length*6));
  el.style.width=diameter+'px';el.style.height=diameter+'px';
  field.append(el);
  const col=i%Math.max(1,Math.floor(width/(size+12))),row=Math.floor(i/Math.max(1,Math.floor(width/(size+12))));
  return {el,x:Math.min(width-diameter-4,8+col*(size+16)),y:Math.min(height-diameter-4,8+row*(size+16)),vx:(i%2?1:-1)*(35+i%5*11),vy:(i%3?1:-1)*(30+i%4*9),d:diameter};
 });
 const tick=timestamp=>{
  if(bubbleField!==field||!field.isConnected){stopLobbyBubbles();return}
  const dt=Math.min(.04,(timestamp-(bubbleLastTime||timestamp))/1000);bubbleLastTime=timestamp;
  const w=field.clientWidth,h=field.clientHeight;
  for(const b of bubbleObjects){
   b.x+=b.vx*dt;b.y+=b.vy*dt;
   if(b.x<0){b.x=0;b.vx=Math.abs(b.vx)}
   if(b.y<0){b.y=0;b.vy=Math.abs(b.vy)}
   if(b.x+b.d>w){b.x=Math.max(0,w-b.d);b.vx=-Math.abs(b.vx)}
   if(b.y+b.d>h){b.y=Math.max(0,h-b.d);b.vy=-Math.abs(b.vy)}
  }
  // Elastic-ish collision with overlap correction, just for decoration.
  for(let i=0;i<bubbleObjects.length;i++)for(let k=i+1;k<bubbleObjects.length;k++){
   const a=bubbleObjects[i],b=bubbleObjects[k],dx=b.x+b.d/2-a.x-a.d/2,dy=b.y+b.d/2-a.y-a.d/2;
   const dist=Math.hypot(dx,dy)||.001,min=(a.d+b.d)/2+4;
   if(dist>=min)continue;
   const nx=dx/dist,ny=dy/dist,overlap=(min-dist)/2;
   a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
   const projection=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
   if(projection>0){a.vx-=projection*nx;a.vy-=projection*ny;b.vx+=projection*nx;b.vy+=projection*ny}
  }
  for(const b of bubbleObjects)b.el.style.transform='translate3d('+b.x+'px,'+b.y+'px,0)';
  bubbleAnimation=requestAnimationFrame(tick);
 };
 bubbleAnimation=requestAnimationFrame(tick);
}
// Keep totals AND rank order at the previous round until the full reveal finishes.
function visibleScore(id){
 const total=Number(game.scores?.[id]||0);
 return game.phase==='results'&&!revealFinished()?total-Number(game.lastPoints?.[id]||0):total;
}
function rankedPlayers(){
 return playerArray().slice().sort((a,b)=>(visibleScore(b.id)-visibleScore(a.id))||a.name.localeCompare(b.name));
}
function scoreboard(){
 return '<div class="round-scoreboard" aria-label="Player scores">'+rankedPlayers().map((p,i)=>
  '<div class="round-score" data-score-id="'+esc(p.id)+'"><span class="rank">'+(i+1)+'</span><i style="background:'+colorStyle(p.color)+'"></i><span>'+esc(p.name)+'</span><b data-final-score="'+Number(game.scores?.[p.id]||0)+'" data-last-earned="'+Number(game.lastPoints?.[p.id]||0)+'">'+visibleScore(p.id)+'</b></div>'
 ).join('')+'</div>';
}
function mobileScoreboard(){
 const scores=rankedPlayers().map((p,i)=>
  '<div class="mobile-score-item'+(me?.id===p.id?' mine':'')+'" data-score-id="'+esc(p.id)+'" title="'+esc(p.name)+' · '+visibleScore(p.id)+' points">'+
  '<span class="score-place">'+(i+1)+'</span><i style="background:'+colorStyle(p.color)+'"></i>'+
  '<span class="score-player">'+esc(p.name)+'</span>'+
  '<b data-final-score="'+Number(game.scores?.[p.id]||0)+'" data-last-earned="'+Number(game.lastPoints?.[p.id]||0)+'">'+visibleScore(p.id)+'</b></div>'
 ).join('');
 return '<div class="mobile-scoreboard" aria-label="Player scores"><div class="mobile-scoreboard-label">SCORES</div>'+
  '<div class="mobile-scoreboard-scroll"><div class="mobile-scoreboard-inner">'+scores+'</div></div></div>';
}
function finishScoreboardReveal(){
 if(!['results','ended'].includes(game.phase)||!revealFinished())return;
 const key=(game.sessionId||'legacy')+':'+game.round+':'+game.revealedAt;
 for(const board of document.querySelectorAll('.round-scoreboard,.mobile-scoreboard-inner')){
  if(board.dataset.rankSettled===key)continue;
  const rows=[...board.querySelectorAll(':scope > [data-score-id]')];
  rows.sort((a,b)=>{
   const get=id=>Number(game.scores?.[id]||0);
   const difference=get(b.dataset.scoreId)-get(a.dataset.scoreId);
   return difference||a.dataset.scoreId.localeCompare(b.dataset.scoreId);
  });
  rows.forEach((row,i)=>{
   const rank=row.querySelector('.rank,.score-place');
   if(rank)rank.textContent=String(i+1);
   const name=row.querySelector('.score-player');
   if(name)row.title=name.textContent+' · '+Number(game.scores?.[row.dataset.scoreId]||0)+' points';
   board.append(row);
  });
  board.dataset.rankSettled=key;
 }
}
function pointsDetail(detail){
 if(!detail)return '';
 const parts=[];
 if(Number(detail.rank)>0&&Number(detail.topPoints)>0)parts.push('Top #'+Number(detail.rank)+' +'+Number(detail.topPoints));
 if(Number(detail.matchPoints)>0)parts.push('Jinx +'+Number(detail.matchPoints));
 return parts.join(' · ');
}
function scoreBreakdownMarkup(detail){
 if(!detail)return '';
 const rows=[];
 if(Number(detail.matchPoints)>0)rows.push('<span class="reveal-breakdown-line">Jinx <span>(+'+Number(detail.matchPoints)+')</span></span>');
 if(Number(detail.rank)>0&&Number(detail.topPoints)>0)rows.push('<span class="reveal-breakdown-line">#'+Number(detail.rank)+' Answer <span>(+'+Number(detail.topPoints)+')</span></span>');
 return rows.join('');
}
// Reveal timing is derived from the shared Firebase timestamp, so every phone
// animates together, including a phone that reconnects mid-reveal.
const REVEAL_LEAD_MS=1350, REVEAL_LETTER_MS=95, REVEAL_AFTER_MS=1700;
function displayAnswer(value){
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9\s]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
}
function revealEntries(){
  const answers=submissions[game.roundKey||String(game.round)]||{};
  return playerArray().map(p=>({...p,answer:displayAnswer(answers[p.id]?.text||''),points:Number(game.lastPoints?.[p.id]||0),breakdown:game.lastBreakdown?.[p.id]||null}));
}
function phraseSegments(answer){
 const parts=String(game.prompt||'').split('_____');
 return {
   before:displayAnswer((parts[0]||'').trim()),
   answer:answer||'',
   after:displayAnswer(parts.slice(1).join('_____').trim())
 };
}
function fullPhraseLength(answer){
 const p=phraseSegments(answer);
 return p.before.length+p.answer.length+p.after.length+(p.before&&p.answer?1:0)+(p.after&&(p.before||p.answer)?1:0);
}
function revealDuration(){
 return REVEAL_LEAD_MS+Math.max(0,...revealEntries().map(p=>fullPhraseLength(p.answer)))*REVEAL_LETTER_MS+REVEAL_AFTER_MS;
}
function revealElapsed(){return game.revealedAt ? Math.max(0,now()-Number(game.revealedAt)) : Number.MAX_SAFE_INTEGER}
function revealFinished(){return !['results','ended'].includes(game.phase)||revealElapsed()>=revealDuration()}
function responseList(){
 const entries=revealEntries(),part=String(game.prompt||'').split('_____');
 const before=esc((part[0]||'').trim()),after=esc((part.slice(1).join('_____')||'').trim());
 const cards=entries.map(p=>
  '<div class="reveal reveal-line" data-reveal-answer="'+esc(p.answer)+'" data-reveal-player="'+esc(p.id)+'" style="--player:'+colorStyle(p.color)+'">'+
  '<div class="reveal-owner"><i></i><span class="rname">'+esc(p.name)+'</span></div>'+
  '<div class="completed-phrase">'+(before?'<span class="phrase-fixed">'+before+'</span> ':'')+
  '<span class="typed-slot"><span class="ranswer" aria-label="Answer"></span><span class="typing-caret" aria-hidden="true"></span></span>'+
  (after?' <span class="phrase-fixed">'+after+'</span>':'')+'</div>'+
  '<div class="reveal-score"><span class="reveal-breakdown">'+scoreBreakdownMarkup(p.breakdown)+'</span>'+
  '<b class="reveal-points '+(p.breakdown?.matchPoints?'bigpoints':p.points?'somepoints':'zeropoints')+'" data-earned="'+p.points+'">'+
  (p.points?'+'+p.points:'—')+'</b></div></div>'
 ).join('');
 return '<div class="reveal-intro" id="revealIntro">GET READY TO REVEAL</div><div class="reveals typed-reveals">'+cards+'</div><div class="match-celebration" id="matchCelebration" aria-live="polite"></div>';
}
let celebratedRound='';
function paintReveal(){
  if(!['results','ended'].includes(game.phase))return;
  const elapsed=revealElapsed(),letterCount=Math.max(0,Math.floor((elapsed-REVEAL_LEAD_MS)/REVEAL_LETTER_MS));
  const done=revealFinished();
  playRevealSoundscape(elapsed,letterCount);
  playResultCue(elapsed);
  const cards=document.querySelectorAll('[data-reveal-answer]');
  for(const card of cards){
    const answer=card.dataset.revealAnswer||'',target=card.querySelector('.ranswer');
    if(card.classList.contains('cinema-answer')){
      const p=phraseSegments(answer);
      const all=[p.before,p.answer,p.after].filter(Boolean);
      // Type the fixed phrase and the player's answer together, left to right.
      let left=elapsed>=REVEAL_LEAD_MS?letterCount:0;
      const segments=[['.cinema-before',p.before],['.ranswer',p.answer],['.cinema-after',p.after]];
      for(const [selector,part] of segments){
        const node=card.querySelector(selector);if(!node)continue;
        let output='';
        if(part){if(left>0&&selector!=='.cinema-before'&&((selector==='.ranswer'&&p.before)||(selector==='.cinema-after'&&(p.before||p.answer)))){output=' ';left--}
          const n=Math.min(left,part.length);output+=part.slice(0,n);left-=n;
        }
        if(node.textContent!==output)node.textContent=output;
      }
    }else{
      const visible=elapsed>=REVEAL_LEAD_MS?answer.slice(0,letterCount):'';
      if(target&&target.textContent!==visible)target.textContent=visible;
    }
    card.classList.toggle('typing-started',elapsed>=REVEAL_LEAD_MS);
    card.classList.toggle('typing-complete',done);
    if(elapsed>=REVEAL_LEAD_MS&&letterCount>=answer.length)card.classList.add('word-complete');
  }
  const cinema=$('revealScreen');if(cinema){const maxLetters=Math.max(0,...revealEntries().map(p=>fullPhraseLength(p.answer)));cinema.classList.toggle('show-outcome',elapsed>=REVEAL_LEAD_MS+maxLetters*REVEAL_LETTER_MS+250);cinema.classList.toggle('break-away',done);if(done&&revealElapsed()>revealDuration()+280)cinema.remove()};const intro=$('revealIntro');
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
  if(done)finishScoreboardReveal();
  const mine=$('myRoundPoints');
  if(mine)mine.classList.toggle('points-shown',done);
  const next=$('next');if(next)next.disabled=!done;
  const finish=$('finish');if(finish)finish.disabled=!done;
  const celebration=$('matchCelebration');
  const matching=revealEntries().filter(p=>Number(p.breakdown?.matchPoints||0)>0);
  const scored=revealEntries().some(p=>p.points>0);
  if(celebration){
    celebration.textContent=done?(game.mode==='duo'?(game.lastMatch?'JINX! · '+game.streak+' IN A ROW':'NO MATCH'):(matching.length?matching.length+' MATCHED':scored?'TOP ANSWER SCORED':'NO POINTS')):'';
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
 el.innerHTML='<div class="cinema-grid"><div class="cinema-kicker">ROUND '+game.round+'</div><div class="cinema-title">LET’S SEE…</div><div class="cinema-answers">'+revealEntries().map(p=>'<div class="cinema-answer" data-reveal-answer="'+esc(p.answer)+'" style="--player:'+colorStyle(p.color)+'"><small>'+esc(p.name)+'</small><div class="cinema-full-phrase"><span class="cinema-before"></span><strong class="ranswer"></strong><span class="cinema-after"></span><span class="typing-caret"></span></div></div>').join('')+'</div><div class="cinema-outcome">'+(game.mode==='duo'?(game.lastMatch?'JINX!':'NOT THIS TIME'):(game.lastMatch?'MATCH!':'NO MATCH'))+'</div></div>';
 document.body.append(el);paintReveal();
}

function spawnConfetti(){
  const stage=document.querySelector('.host-fullstage')||document.querySelector('.stage')||document.querySelector('.mobilecenter');
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
function compute(roster,answers,topAnswers){
 const ranked=validateTopAnswers(topAnswers);
 if(ranked.length!==TOP_ANSWERS_COUNT)throw Error('This round needs five ranked answers to score.');
 const rankKeys=ranked.map(normalize),clusters=[],points={},breakdown={};
 for(const p of roster){
  const n=normalize(answers[p.id]?.text||'');
  if(!n){points[p.id]=0;breakdown[p.id]={rank:0,topPoints:0,matchPoints:0};continue}
  let group=clusters.find(g=>g.keys.some(k=>similar(n,k)));
  if(!group){group={keys:[],ids:[]};clusters.push(group)}
  group.keys.push(n);group.ids.push(p.id);
  const index=rankKeys.indexOf(n);
  const topPoints=index<0?0:TOP_ANSWERS_COUNT-index;
  breakdown[p.id]={rank:index<0?0:index+1,topPoints,matchPoints:0};
  points[p.id]=topPoints;
 }
 const matchedIds=[];
 for(const group of clusters){
  if(group.ids.length<2)continue;
  for(const id of group.ids){
   breakdown[id].matchPoints=5;
   points[id]+=5;
   matchedIds.push(id);
  }
 }
 return {points,breakdown,clusters,matchedIds,hasMatch:matchedIds.length>0};
}
function answerCount(){const ans=submissions[game.roundKey||String(game.round)]||{};return playerArray().filter(p=>ans[p.id]?.text).length}

// Top Answers are curated ranked completions worth 5–1 points; matching adds 5.
// Datamuse uses Google Books Ngram collocations and dictionary/WordNet relations.
// Query when each prompt begins so the list is already available when it is revealed.
const TOP_ANSWERS_COUNT=5;
let topAnswerBank=null,topAnswerLoading=null;
const topAnswersCache=new Map();
// Every prompt in prompts.json has exactly five precomputed completions.
// There is no live dictionary lookup, and no "no strong guesses" empty state.
function validateTopAnswers(values){
 const seen=new Set(),out=[];
 for(const value of values||[]){
  const candidate=String(value||'').trim().toUpperCase().replace(/[^A-Z0-9\s'-]/g,'').replace(/\s+/g,' ');
  const key=normalize(candidate);
  if(!key||seen.has(key)||candidate.length>30||candidate.split(' ').length>3)continue;
  seen.add(key);out.push(candidate);
  if(out.length===TOP_ANSWERS_COUNT)break;
 }
 return out;
}
async function ensureTopAnswers(){
 if(!isHost)return;
 if(topAnswerBank||topAnswerLoading)return topAnswerLoading;
 topAnswerLoading=fetch('./top-answers.json?v=3',{cache:'no-store'})
  .then(r=>{if(!r.ok)throw Error('Top Answers data unavailable');return r.json()})
  .then(data=>{
   topAnswerBank=data;
   topAnswersCache.clear();
   updateTopAnswerPanel();
  })
  .catch(error=>{
   console.warn('Top Answers loading issue',error);
   topAnswerLoading=null;
   // Allow retry on a future game state transition.
  });
 return topAnswerLoading;
}
function lookupTopAnswers(prompt){
 if(!isHost||!prompt)return [];
 if(game.prompt===prompt&&Array.isArray(game.topAnswers)&&game.topAnswers.length===TOP_ANSWERS_COUNT)return game.topAnswers;
 if(!topAnswerBank){ensureTopAnswers();return []}
 if(topAnswersCache.has(prompt))return topAnswersCache.get(prompt);
 const answers=validateTopAnswers(topAnswerBank[prompt]);
 // This should never occur for the published deck. Surface an actual data
 // error rather than claiming a low-quality prompt has no possible answers.
 if(answers.length!==TOP_ANSWERS_COUNT)console.warn('Incomplete Top Answers',prompt,answers);
 topAnswersCache.set(prompt,answers);
 return answers;
}
function topAnswersMarkup(){
 return '<aside class="top-answers" id="topAnswers" aria-label="Suggested popular phrase completions" title="Ranked completions: +5 to +1 points, plus +5 for Jinx"><div class="top-answers-heading">TOP ANSWERS <span>★</span></div><div id="topAnswersList" class="top-answers-list"><span class="top-answers-loading">Finding familiar phrases…</span></div></aside>';
}
function updateTopAnswerPanel(){
 const panel=$('topAnswers'),list=$('topAnswersList');
 if(!isHost||!panel||!list)return;
 const shown=['results','ended'].includes(game.phase)&&revealElapsed()>=revealDuration()+320;
 panel.classList.toggle('visible',shown);
 if(!shown)return;
 const answers=lookupTopAnswers(game.prompt);
 if(!answers.length){
  const message='Loading Top Answers…';
  if(list.dataset.renderKey!==message){
   list.dataset.renderKey=message;
   list.innerHTML='<span class="top-answers-loading">'+message+'</span>';
  }
  return;
 }
 const current=submissions[game.roundKey||String(game.round)]||{},roster=playerArray();
 const ranks=answers.map((answer,i)=>{
  const guessed=roster.filter(p=>normalize(current[p.id]?.text||'')===normalize(answer));
  const cls=guessed.length>=2?'matched-gold':guessed.length===1?'matched-player':'';
  const color=guessed.length===1?colorStyle(guessed[0].color):'';
  return {answer,cls,color,i};
 });
 const renderKey=ranks.map(r=>r.answer+':'+r.cls+':'+r.color).join('|');
 if(list.dataset.renderKey!==renderKey){
  list.dataset.renderKey=renderKey;
  list.innerHTML=ranks.map(({answer,cls,color,i})=>
   '<div class="top-answer '+cls+'" data-top-answer="'+esc(answer)+'" data-rank="'+i+'"'+(color?' style="--top-match:'+color+'"':'')+'><span class="top-answer-rank">'+(i+1)+'</span><span class="top-answer-word"></span><span class="top-answer-caret" aria-hidden="true"></span><span class="top-answer-value">+'+(TOP_ANSWERS_COUNT-i)+'</span></div>'
  ).join('');
 }
 // The panel arrives after the cinema clears, then types in five staggered
 // entries. All timing derives from the shared revealedAt, so rerenders do not
 // restart the effect and 65ms clock updates don't recreate the DOM.
 const elapsed=Math.max(0,revealElapsed()-revealDuration()-350);
 for(const row of list.querySelectorAll('.top-answer')){
  const word=row.dataset.topAnswer||'';
  const rank=Number(row.dataset.rank||0);
  const start=rank*235,progress=elapsed-start;
  const count=Math.max(0,Math.min(word.length,Math.floor(progress/43)));
  const typed=word.slice(0,count),element=row.querySelector('.top-answer-word');
  if(element&&element.textContent!==typed)element.textContent=typed;
  row.classList.toggle('entered',progress>=0);
  row.classList.toggle('typing',progress>=0&&count<word.length);
  row.classList.toggle('done',count===word.length);
 }
}

function roundMarkup(){const phase=game.phase,answering=phase==='answering',results=phase==='results',ended=phase==='ended';return '<section class="gameview"><div class="eyebrow">ROUND '+game.round+'</div><div class="prompt">'+esc(game.prompt||'')+'</div><div class="timerwrap">'+(answering?'<div id="timer" class="timer">0:00</div><div class="progress"><div id="bar"></div></div><div class="muted" id="count">'+answerCount()+' / '+playerArray().length+' answers locked</div>':'<div class="eyebrow">'+(ended?'FINAL':'REVEALED')+'</div>')+'</div>'+(results||ended?responseList()+(ended&&game.mode==='duo'?'<div class="duo-final">'+(game.matches>=8?'MIND READERS':game.matches>=5?'ON THE SAME PAGE':game.matches>=3?'GETTING WARMER':'KEEP TRYING')+' · '+Number(game.matches||0)+' OF 10</div>':''):'<div class="waiting"><div class="pulse"></div>Waiting for everyone to answer...</div>')+scoreboard()+'</section>'}

let recapSelectedRound=0;
function recapHistory(){
 const entries=Object.values(game.history||{}).filter(x=>x&&Number(x.round)>0).sort((a,b)=>Number(a.round)-Number(b.round));
 if(!entries.length&&game.round&&game.phase==='ended'){
  const answers=submissions[game.roundKey||String(game.round)]||{};
  return [{round:game.round,prompt:game.prompt,topAnswers:game.topAnswers||[],participants:playerArray().map(p=>({id:p.id,name:p.name,color:p.color})),points:game.lastPoints||{},breakdown:game.lastBreakdown||{},answers:Object.fromEntries(Object.entries(answers).map(([id,a])=>[id,a?.text||''])),match:!!game.lastMatch}];
 }
 return entries;
}
function hasRoundMatch(entry){
 if(!entry)return false;
 if(typeof entry.match==='boolean')return entry.match;
 return Object.values(entry.breakdown||{}).some(x=>Number(x?.matchPoints||0)>0);
}
function recapDetails(entry){
 if(!entry)return '<div class="recap-empty">No round history recorded yet.</div>';
 const roster=Array.isArray(entry.participants)&&entry.participants.length?entry.participants:playerArray(),
  answers=entry.answers||{},points=entry.points||{};
 const matching=hasRoundMatch(entry);
 return '<div class="recap-detail-heading"><span class="recap-round-kicker">ROUND '+Number(entry.round)+'</span><span class="recap-round-result '+(matching?'is-match':'')+'">'+(matching?'JINX MATCH':'NO JINX')+'</span></div>'+
 '<div class="recap-prompt">'+esc(entry.prompt||'')+'</div><div class="recap-answer-grid">'+
 roster.map(p=>'<div class="recap-player-answer"><i style="background:'+colorStyle(p.color)+'"></i>'+
 '<span class="recap-player-name">'+esc(p.name)+'</span><b>'+esc(answers[p.id]||'—')+'</b>'+
 '<span class="recap-points-detail">'+esc(pointsDetail(entry.breakdown?.[p.id]))+'</span>'+
 '<strong>'+(Number(points[p.id]||0)>0?'+'+Number(points[p.id]):'—')+'</strong></div>').join('')+
 '</div>';
}
function recapMarkup(){
 const history=recapHistory(),rounds=history.length,matches=history.filter(hasRoundMatch).length;
 const rate=rounds?Math.round(matches/rounds*100):0;
 const roster=playerArray().sort((a,b)=>Number(game.scores?.[b.id]||0)-Number(game.scores?.[a.id]||0));
 const best=game.mode==='duo'?Number(game.bestStreak||0):Math.max(0,...Object.values(game.scores||{}).map(Number));
 const totals=game.mode==='duo'?[
  [rounds,'Rounds played'],[Number(game.matches||matches),'Jinxes'],[rate+'%','Match rate'],[best,'Best streak']
 ]:[
  [rounds,'Rounds played'],[matches,'Matched rounds'],[rate+'%','Match rate'],[best,'High score']
 ];
 const max=Math.max(1,...history.map(x=>Object.values(x.points||{}).reduce((a,b)=>a+Number(b||0),0)));
 const bars=history.map(x=>{
  const points=Object.values(x.points||{}).reduce((a,b)=>a+Number(b||0),0);
  const hit=hasRoundMatch(x);
  const level=Math.max(10,points/max*100);
  return '<button class="recap-bar'+(hit?' hit':'')+'" data-recap-round="'+x.round+'" title="Round '+x.round+': '+(hit?'match':'no match')+'" aria-label="View round '+x.round+'"><span class="recap-bar-track"><span class="recap-bar-fill" style="height:'+level+'%"></span></span><small>'+x.round+'</small></button>';
 }).join('');
 if(!recapSelectedRound||!history.some(x=>x.round===recapSelectedRound))recapSelectedRound=history.at(-1)?.round||0;
 return '<section class="recap-screen"><div class="recap-header"><div><div class="eyebrow">GAME RECAP</div><h1>'+(game.mode==='duo'?(game.matches>=5?'ON THE SAME WAVELENGTH':'THAT WAS A GOOD RUN'):'THAT’S A WRAP!')+'</h1></div><div class="recap-leader">'+(game.mode==='duo'?'MATCH CHALLENGE':(roster.length?'TOP PLAYER · '+esc(roster[0].name):'FINAL SCORES'))+'</div></div>'+
 '<div class="recap-metrics">'+totals.map(([v,label])=>'<div class="recap-metric"><strong>'+v+'</strong><span>'+label+'</span></div>').join('')+'</div>'+
 '<div class="recap-lower"><div class="recap-chart-panel"><div class="recap-panel-heading"><b>ROUND BY ROUND</b><span>Tap any round</span></div><div class="recap-bars">'+bars+'</div>'+
 '<div class="recap-legend">Bar height = points · Purple = Jinx</div>'+
 '</div><div class="recap-detail-panel"><div class="recap-panel-heading"><b>ROUND BREAKDOWN</b><div class="recap-nav"><button id="recapPrev" aria-label="Previous round">‹</button><button id="recapNext" aria-label="Next round">›</button></div></div><div id="recapDetail">'+recapDetails(history.find(x=>x.round===recapSelectedRound))+'</div></div></div>'+
 '<div class="recap-ranking">'+roster.slice(0,5).map((p,i)=>'<span><i style="background:'+colorStyle(p.color)+'"></i>'+esc(p.name)+' <b>'+Number(game.scores?.[p.id]||0)+' pts</b></span>').join('')+'</div>'+
 '</section>';
}
function updateRecapSelection(){
 if(game.phase!=='ended')return;
 const history=recapHistory(),selected=history.find(x=>x.round===recapSelectedRound);
 const detail=$('recapDetail');if(detail)detail.innerHTML=recapDetails(selected);
 document.querySelectorAll('[data-recap-round]').forEach(el=>{
  const active=Number(el.dataset.recapRound)===recapSelectedRound;
  el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));
 });
 const n=history.findIndex(x=>x.round===recapSelectedRound);
 if($('recapPrev'))$('recapPrev').disabled=n<=0;
 if($('recapNext'))$('recapNext').disabled=n>=history.length-1;
}
function mobileRecapMarkup(){
 const history=recapHistory(),matched=history.filter(hasRoundMatch).length;
 const rate=history.length?Math.round(matched/history.length*100):0;
 if(!recapSelectedRound||!history.some(x=>x.round===recapSelectedRound))recapSelectedRound=history.at(-1)?.round||0;
 return '<div class="mobile-recap"><div class="eyebrow">GAME RECAP</div><h1>'+ (game.mode==='duo'?'YOUR JINX! RESULTS':'FINAL SCORES')+'</h1><div class="mobile-recap-stats">'+
 '<div><strong>'+history.length+'</strong><span>Rounds</span></div><div><strong>'+(game.mode==='duo'?Number(game.matches||0):matched)+'</strong><span>Matches</span></div><div><strong>'+rate+'%</strong><span>Match rate</span></div></div>'+
 '<div class="mobile-recap-rounds">'+history.map(x=>'<button data-recap-round="'+x.round+'" class="'+(hasRoundMatch(x)?'hit':'')+'">R'+x.round+'</button>').join('')+'</div>'+
 '<div class="mobile-recap-detail"><div class="recap-panel-heading"><b>ROUND DETAILS</b><div class="recap-nav"><button id="recapPrev" aria-label="Previous round">‹</button><button id="recapNext" aria-label="Next round">›</button></div></div><div id="recapDetail">'+recapDetails(history.find(x=>x.round===recapSelectedRound))+'</div></div></div>';
}
function bindRecap(){
 if(game.phase!=='ended')return;
 const entries=recapHistory();
 document.querySelectorAll('[data-recap-round]').forEach(el=>el.onclick=()=>{recapSelectedRound=Number(el.dataset.recapRound);updateRecapSelection()});
 if($('recapPrev'))$('recapPrev').onclick=()=>{let i=entries.findIndex(x=>x.round===recapSelectedRound);if(i>0){recapSelectedRound=entries[i-1].round;updateRecapSelection()}};
 if($('recapNext'))$('recapNext').onclick=()=>{let i=entries.findIndex(x=>x.round===recapSelectedRound);if(i<entries.length-1){recapSelectedRound=entries[i+1].round;updateRecapSelection()}};
 updateRecapSelection();
}

// Host-only auto-advance: cycle Off → 5s → 10s → Off in lobby and results.
const autoNextStore='jinx:auto-next:'+room;
const savedAutoNext=sessionStorage.getItem(autoNextStore);
let autoNextDelaySeconds=isHost?(savedAutoNext==='true'?5:[5,10].includes(Number(savedAutoNext))?Number(savedAutoNext):0):0;
let autoNextTriggered='',autoNextArmedAt=now();
function updateAutoNext(){
 if(!isHost)return;
 const btn=$('autoNext');if(!btn)return;
 const delay=autoNextDelaySeconds;
 const active=game.phase==='results'&&revealFinished();
 const resultsReadyAt=Number(game.revealedAt||0)+revealDuration();
 // Switching a delay mid-reveal starts a fresh countdown at that chosen delay.
 const advanceAt=Math.max(resultsReadyAt,autoNextArmedAt)+delay*1000;
 const left=Math.max(0,Math.ceil((advanceAt-now())/1000));
 const enabled=delay>0;
 btn.setAttribute('aria-pressed',String(enabled));
 btn.dataset.delay=String(delay);
 btn.title=enabled?'Auto-advance '+delay+' seconds after results'+(active?' · '+left+'s remaining':'')+' · click to cycle':'Auto is off · click for 5 seconds';
 const symbol=$('autoNextIcon'),label=$('autoNextLabel');
 if(symbol)symbol.textContent=enabled?'↻':'▶';
 if(label)label.textContent=enabled?'Auto '+delay+'s':'Auto Off';
 btn.classList.toggle('active',enabled);
 if(!enabled||!active||now()<advanceAt||hostBusy)return;
 const id=room+':'+game.round+':'+game.revealedAt;
 if(autoNextTriggered===id)return;
 autoNextTriggered=id;
 nextRound(game.duration||45);
}
function hostRender(){
 const oldInput=$('duration')?.value;
 const needScreen=game.phase+'-'+game.round+'-'+playerArray().map(p=>p.id).join(',')+'-'+JSON.stringify(game.scores||{})+'-'+JSON.stringify(game.lastPoints||{})+'-'+game.revealedAt+'-'+Object.keys(game.history||{}).length;
 if(needScreen===lastScreen){updateClocks();paintReveal();return}
 lastScreen=needScreen;
 const lobby=game.phase==='lobby';
 const actions=lobby?'<label>Timer <select id="duration"><option value="30">30 seconds</option><option value="45">45 seconds</option><option value="60">60 seconds</option><option value="90">90 seconds</option></select></label><button id="autoNext" class="auto-next" type="button" aria-pressed="false" title="Automatically advance rounds after each reveal"><span id="autoNextIcon">▶</span><span id="autoNextLabel">Auto</span></button><button id="start" class="primary">Start game</button>':
 game.phase==='answering'?'<button id="reveal">Reveal early</button>':
 game.phase==='results'?(((game.mode==='duo'&&game.round>=10)||(game.mode!=='duo'&&Math.max(0,...Object.values(game.scores||{}))>=Number(game.winningScore||50)))?'<button id="finish" class="primary">See results</button>':'<button id="autoNext" class="auto-next" type="button" aria-pressed="false" title="Toggle automatic next rounds"><span id="autoNextIcon">▶</span><span id="autoNextLabel">Auto</span></button><button id="next" class="primary">Next round</button><button id="finish">End game</button>'):
 '<button id="restart" class="primary">Play again</button>';
 if(lobby){
   shell('HOST • '+room,'<main class="hostgrid"><div class="stage">'+lobbyMarkup()+'</div><aside class="side">'+qrMarkup()+'<div class="lobby-players"><h3>Players</h3><div class="lobby-player-list">'+playerArray().map(p=>'<div class="lobby-player"><i style="background:'+colorStyle(p.color)+'"></i><span>'+esc(p.name)+'</span></div>').join('')+'</div></div><div class="hostcontrols">'+actions+'</div></aside></main><div id="error" class="error hidden"></div>');
   drawQR();
   startLobbyBubbles();
 }else{
   stopLobbyBubbles();
   shell(game.phase==='ended'?'GAME RECAP':'ROUND '+game.round,'<main class="host-fullscreen"><div class="host-fullstage">'+(game.phase==='ended'?recapMarkup():roundMarkup()+(game.phase==='results'?topAnswersMarkup():''))+'</div><div class="host-bottom"><div class="host-bottom-status">'+(game.mode==='duo'?'<span>'+Number(game.matches||0)+'/10 matches</span><span>'+Number(game.streak||0)+' streak</span>':'<span>'+playerArray().length+' players</span>')+'</div><div class="host-bottom-controls">'+actions+'</div></div></main><div id="error" class="error hidden"></div>');
 }
 if($('start')){$('duration').value=oldInput||String(game.duration||45);$('start').onclick=()=>{unlockSound();if(playerArray().length<2)return alert('Need 2 players.');nextRound(Number($('duration').value))}}
 if($('next'))$('next').onclick=()=>{unlockSound();nextRound(game.duration||45)};
 if($('autoNext'))$('autoNext').onclick=()=>{autoNextDelaySeconds=autoNextDelaySeconds===0?5:autoNextDelaySeconds===5?10:0;autoNextArmedAt=now();sessionStorage.setItem(autoNextStore,String(autoNextDelaySeconds));unlockSound();updateAutoNext()};
 if($('reveal'))$('reveal').onclick=()=>finishRound();
 if($('finish'))$('finish').onclick=()=>{if(revealFinished())updateGame(g=>g.phase==='results'?{...g,phase:'ended'}:undefined)};
 if($('restart'))$('restart').onclick=()=>{
  recapSelectedRound=0;autoNextDelaySeconds=0;sessionStorage.removeItem(autoNextStore);
  autoNextTriggered='';lastScreen='';
  updateGame(g=>g.phase==='ended'?{...g,phase:'lobby',sessionId:uid(),round:0,roundKey:'0',prompt:null,topAnswers:null,deadline:null,revealedAt:null,used:{},scores:{},history:{},lastPoints:{},lastBreakdown:{},lastMatch:false,winningScore:50,mode:'classic',streak:0,bestStreak:0,matches:0}:undefined);
 };
 bindRecap();
 updateClocks();paintReveal();syncRevealScreen();updateAutoNext();if(game.phase==='answering'||game.phase==='results')lookupTopAnswers(game.prompt);updateTopAnswerPanel();
}
function renderPlayer(){if(!game.phase){shell('JOIN ROOM','<main class="card"><h1>Looking for room…</h1><p>Make sure the host has created it.</p></main>');return}
 if(!me){playerJoin();return}
 const answer=submissions[game.roundKey||String(game.round)]?.[me.id];
 const phase=game.phase;
 const stamp=phase+'-'+game.round+'-'+!!answer+'-'+JSON.stringify(game.scores||{})+'-'+JSON.stringify(game.lastPoints||{})+'-'+game.revealedAt+'-'+Object.keys(game.history||{}).length;
 if(lastScreen===stamp){updateClocks();paintReveal();return}lastScreen=stamp;
  let body='<main class="mobile'+(phase==='results'?' results-mode':'')+'">'+
   (phase==='lobby'?'<div class="playerbar lobby-playerbar"><span><i style="background:'+colorStyle(me.color)+'"></i>'+esc(me.name)+'</span></div>':
    phase==='ended'?'':mobileScoreboard());
 if(phase==='lobby')body+='<div class="mobilecenter"><div class="eyebrow">ROOM '+room+'</div><h1>You’re in!</h1><p>Waiting for the host to start.</p><div class="spin"></div><span class="muted">'+playerArray().length+' players in the lobby</span></div>';
 else if(phase==='answering')body+='<div class="mobilecenter"><div class="eyebrow">ROUND '+game.round+'</div><div class="prompt mobileprompt">'+esc(game.prompt)+'</div><div class="timer" id="timer">0:00</div><div class="progress"><div id="bar"></div></div>'+(answer?'<div class="submitted"><span class="check">✓</span><h2>Answer locked!</h2><p>'+esc(answer.text)+'</p><span class="muted" id="count">'+answerCount()+' of '+playerArray().length+' submitted</span></div>':'<form id="answerform"><input id="answer" maxlength="48" placeholder="Your word…" autocomplete="off" enterkeyhint="send" required><button class="primary">Lock in answer →</button><p class="muted">Your answer stays hidden until reveal.</p></form>')+'</div>';
 else if(phase==='ended')body+=mobileRecapMarkup();
  else body+='<div class="mobilecenter"><div class="eyebrow">ROUND '+game.round+'</div><div class="prompt mobileprompt">'+esc(game.prompt||'')+'</div>'+responseList()+'<p class="muted round-next-note">Next round soon…</p></div>';
 body+='</main><div id="error" class="error hidden"></div>';shell('PLAYER • '+room,body);
 if($('answerform'))$('answerform').onsubmit=async e=>{e.preventDefault();unlockSound();const v=$('answer').value.trim().replace(/\s+/g,' ');if(!v)return;const button=$('answerform').querySelector('button');button.disabled=true;try{const path=ref(db,'rooms/'+room+'/submissions/'+(game.roundKey||String(game.round))+'/'+me.id);const tx=await runTransaction(path,current=>current===null?{text:v,at:Date.now()}:undefined,{applyLocally:false});if(!tx.committed)throw Error('Already submitted');}catch(err){button.disabled=false;alert(err.message)}};
 updateClocks();paintReveal();syncRevealScreen();if(phase==='ended')bindRecap()
}
function playerJoin(){if(lastScreen==='join'&&$('joinplayer'))return;lastScreen='join';shell('JOIN • '+room,'<main class="card joincard"><div class="eyebrow">ROOM '+room+'</div><h1>Join the game</h1><p>Pick a name and a unique color.</p><form id="joinplayer"><input id="nickname" maxlength="20" placeholder="Your name" required autocomplete="nickname"><h3>Choose your color</h3><div class="colorgrid" id="colors"></div><button class="primary">Join game →</button><div id="joinerror" class="error hidden"></div></form></main>');
 let chosen=null;for(const color of COLORS){let taken=playerArray().some(p=>p.color===color),b=document.createElement('button');b.className='color'+(taken?' taken':'');b.type='button';b.style.background=color;b.disabled=taken;b.title=taken?'Taken':color;b.onclick=()=>{chosen=color;document.querySelectorAll('.color').forEach(x=>x.classList.remove('active'));b.classList.add('active')};$('colors').append(b)}
 $('joinplayer').onsubmit=async e=>{e.preventDefault();unlockSound();let name=$('nickname').value.trim().replace(/\s+/g,' ');if(!chosen){$('joinerror').textContent='Choose an available color.';$('joinerror').classList.remove('hidden');return}
 let pid=uid(),submit=$('joinplayer').querySelector('button.primary');submit.disabled=true;
 try{let response=await runTransaction(playersRef,current=>{let all=Object.fromEntries(Object.entries(current||{}).filter(([,p])=>p&&(p.sessionId||'legacy')===(game.sessionId||'legacy')));if(Object.values(all).some(p=>p.color===chosen||p.name.toLowerCase()===name.toLowerCase()))return;return {...all,[pid]:{id:pid,name,color:chosen,joined:Date.now(),sessionId:game.sessionId||'legacy'}}},{applyLocally:false});if(!response.committed)throw Error('That name or color was just taken. Pick another.');me={id:pid,name,color:chosen};localStorage.setItem(key+'player-'+room,JSON.stringify(me));render()}catch(err){$('joinerror').textContent=err.message;$('joinerror').classList.remove('hidden');submit.disabled=false}
 }
}
function render(){if(!room)return;if(isHost&&hostToken)hostRender();else if(!isHost)renderPlayer();queueFit()}

let lastTickKey='',tickAudio=null,soundReady=false;
let correctAudio=null,incorrectAudio=null,lastResultCue='';
function unlockSound(){
 // Only the landing screen and host play audio; room participants stay silent.
 if(!audioDevice)return;
 soundReady=true;
  prepareRevealAudio();
 if(!tickAudio){tickAudio=new Audio('data:audio/mpeg;base64,SUQzBAAAAAAAfVRYWFgAAAAxAAADZW5jb2RpbmdfdG9vbABCbGFja21hZ2ljIERlc2lnbiBEYVZpbmNpIFJlc29sdmUAVFhYWAAAABYAAAN0aW1lY29kZQAwMTowMzozMTo1NgBUU1NFAAAADgAAA0xhdmY2MS43LjEwMwAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAACAAABZwAPDw8PDw8PDw8PDw8WFhYWFhYWFhYWFhYdHR0dHR0dHR0dHR0dJCQkJCQkJCQkJCQkKysrKysrKysrKysrKzIyMjIyMjIyMjIyMjk5OTk5OTk5OTk////////////////AAAAAExhdmM2MS4xOQAAAAAAAAAAAAAAACQC1AAAAAAAAAWcoV0aXQAAAAAAAAAAAAAAAAD/82DEABlpulgVSSgApgmg2TtqCgEAQDBI2uRisEwTDbZAAMAYbJ9qELIScTD4uYOAGAYfPIQkjTnO+c/QhPOd9Dnf/IRpzzvQjfkIQk4cDgIaIPv+UBDLggCH//ggch8u8QBiUBB3/iQEOD8QAgUd4gDC1CKa/9YPQdJpweF+iab80L/w8uxxGSvoyBusHSNsIRAmADAGFILDo0n/82LEKSnr8oDzmEABEwRCo4Qs4PgcDo0lQ+HDhpYdMHHRSoRQj5Ww51ZDokodJfYgKxFxEwsR0cg2Zom+0Op4Gyakkj5MFSHtl1fkPUKJrm0j7KEUUdEvsfT3zvx7vawd1q9xC09ytjoGp3//cTbSekp//10zzDtOvDRP1F09z/dw5A2ukbkc5yCArUIHTEOQsJK8RllSkC6JkCkO//NixBEkXA58AZhAAfZEnaRWZJAMGgk4oKlCKHIKAgMckUJFYFBw1UJaa72jmviF/5/3v/+9uf+fjrtyCf9NhYr795kcaLmJFJN0lZsn7LzKSzDBIdHHoZ91Wt89fXZ1azozj69ODu+fqr+BijKdohY7+j3LS74uahuabuZQ4Wem+kpFLWEr6hhSn6yCKprLnbt//////05JCACEN//zYsQPIxvi9l+PaAKK1PGRDy5sSdOYcFrSJ9WOAnVYwRPPEsFYJwXC6xFNEi2g9S3PshNE6m7+/2pW0qVH3/+36hxkH6CALQQVp03TTpvTmqkWMlqSUZOZF5CtN0EGTTdAuf+3T//ZS6X//p6ajQ0W/f/RMjYyCZAqRJS6cMWMpkmk6P7FQQxk/TWJtuXXf6rQCiISWHEd9O6Z3i7/82DEEiQzftJdzzADo2oUaNAcnudN6UiwXtXQxPBud2jOTtD+y9Cz3XNL1intV7531rtD48zkz2Z2/39/Lvks9f/0cSJEZmcn5NbtVVVUzLzMzNVVVVf////u3//qqmZmZ+P///+zzMzMzNVVVVVUzMzMkSJIkDAIBBWmgEklRxIkSCgUFBQUGCgoKSvjZGGEDR2WwDATDnLiTGr/82LEECFL/oRbWCgBJYOLWf75RTSemz3MSu7uhtAYBAFcUYDklMc5ED5xxiHIwmLIogVLLZbsQnOzoS8jX1tU+y+zoh3JU8m5ntFl/VS2Lu7TlK+l13el2YutEPsejddryylVHeZ5kY6sr5nVtQkLzM8zo3R73s0hCvMllqvGmpGTKpE43JJHJJJBJHI402kgdMrcJqstmpc3SURZ//NixBola8KuX5lAAojGtz0gjj4Y3A5FxBCEIxFyRUWPYTSW1knC1uNGWsM3Yx7vGwn/+U31UIP642/icqOXqphDJvgQhZeGv41EEVuHibEA9nUFA6pGjlwvFTlSq/8r//z1HsjTS/KbP146qn+P5X+PlBj+yVykXz+sVLNK21xPSV8XJvFQV1VCKFuFyMqGhqpakOiwn26vdQn1cf/zYsQUHYP16AnPKAFrfNa1qyGNEQ65SlaYxpjOpZjMhjPUrf/+Y1DPyt//6G5SlQBgCFRIPCzlLN+hjfzGZDGf/5jUM////MbQxnqXKUrCQDAEKiQeFnUv+YxupSxIPMYSFjSh0OuUrIZREOuCikxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=');tickAudio.preload='auto';tickAudio.volume=.31}
 if(!correctAudio){correctAudio=new Audio('./assets/correct.mp3?v=2');correctAudio.preload='auto';correctAudio.volume=.9}
 if(!incorrectAudio){incorrectAudio=new Audio('./assets/incorrect.mp3');incorrectAudio.preload='auto';incorrectAudio.volume=.6}
 if(musicState==='blocked')musicState='off';
 if(idleState==='blocked')idleState='off';
 if(musicContext?.state==='suspended')musicContext.resume().catch(()=>{});
 if(isHost)prepareRoundMusic();prepareIdleMusic();syncRoundMusic();
}

/*
 * Music bed: place a licensed or original track at assets/round-music.mp3.
 * The track is intentionally optional until that asset is provided.
 * A stable round-specific seek point avoids a repetitive intro while keeping
 * rejoining devices at approximately the same point in the track.
 */
const MUSIC_PATH='./assets/round-music.mp3';
const MUSIC_LEVEL=.32,IDLE_LEVEL=.37,IDLE_PATH='./assets/idle-music.mp3';
let roundMusic=null,musicContext=null,musicGain=null,musicFilter=null;
let musicRound='',musicState='off',musicFadeTimer=null,musicVolumeRaf=0,musicMissing=false;
function prepareRoundMusic(){
 if(!audioDevice||roundMusic||musicMissing||!soundReady)return;
 const track=new Audio();
 track.preload='auto';track.loop=true;track.volume=0;track.src=MUSIC_PATH;
 track.addEventListener('error',()=>{musicMissing=true;musicState='off';track.pause();});
 roundMusic=track;
 try{
   const Ctx=window.AudioContext||window.webkitAudioContext;
   if(Ctx){
     musicContext=musicContext||new Ctx();
     const source=musicContext.createMediaElementSource(track);
     musicFilter=musicContext.createBiquadFilter();
     musicFilter.type='lowpass';musicFilter.frequency.value=18000;
     musicGain=musicContext.createGain();musicGain.gain.value=0;
     source.connect(musicFilter).connect(musicGain).connect(musicContext.destination);
     track.volume=1;
     musicContext.resume().catch(()=>{});
   }
 }catch(err){console.warn('Music filter unavailable',err);musicFilter=null;musicGain=null;track.volume=0}
 track.load();
}
function roundHash(text){
 let h=2166136261;
 for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
 return (h>>>0)/4294967296;
}
function cancelMusicFade(){
 if(musicFadeTimer){clearTimeout(musicFadeTimer);musicFadeTimer=null}
 if(musicVolumeRaf){cancelAnimationFrame(musicVolumeRaf);musicVolumeRaf=0}
}
function setMusicMix(volume,cutoff,seconds){
 if(!roundMusic)return;
 const duration=Math.max(0,seconds||0);
 if(musicGain&&musicContext){
   const t=musicContext.currentTime, gain=musicGain.gain;
   gain.cancelScheduledValues(t);gain.setValueAtTime(gain.value,t);
   gain.linearRampToValueAtTime(volume,t+duration);
   if(musicFilter){
     const f=musicFilter.frequency;
     f.cancelScheduledValues(t);f.setValueAtTime(Math.max(80,f.value),t);
     f.exponentialRampToValueAtTime(Math.max(80,cutoff),t+Math.max(.01,duration));
   }
 }else{
   const from=roundMusic.volume,started=performance.now();
   const animate=stamp=>{
     const x=Math.min(1,(stamp-started)/Math.max(1,duration*1000));
     const easing=x*x*(3-2*x);
     roundMusic.volume=Math.min(1,Math.max(0,from+(volume-from)*easing));
     if(x<1)musicVolumeRaf=requestAnimationFrame(animate);
     else musicVolumeRaf=0;
   };
   musicVolumeRaf=requestAnimationFrame(animate);
 }
}
function startRoundMusic(){
 if(!audioDevice||!soundReady||musicMissing)return;
 prepareRoundMusic();
 if(!roundMusic||musicMissing)return;
 cancelMusicFade();
 musicState='playing';
 const track=roundMusic;
 const begin=()=>{
   if(game.phase!=='answering'||musicState!=='playing')return;
   const duration=track.duration;
   if(Number.isFinite(duration)&&duration>1){
     const seed=roundHash(room+':'+game.round);
     const offset=seed*Math.max(0,duration-12);
     const startAt=(Number(game.deadline||now())-Number(game.duration||45)*1000);
     const elapsed=Math.max(0,(now()-startAt)/1000);
     try{track.currentTime=(offset+elapsed)%duration}catch{}
   }
   track.play().catch(()=>{if(musicState==='playing'){musicState='blocked';setMusicMix(0,18000,.01)}});
   if(musicContext?.state==='suspended')musicContext.resume().catch(()=>{});
   setMusicMix(MUSIC_LEVEL,18000,.85);
 };
 if(track.readyState>=1)begin();
 else track.addEventListener('loadedmetadata',begin,{once:true});
}
function endRoundMusic(){
 if(!roundMusic||musicState!=='playing')return;
 cancelMusicFade();musicState='fading';
 setMusicMix(0,350,.48);
 const track=roundMusic;
 musicFadeTimer=setTimeout(()=>{
   musicFadeTimer=null;
   if(musicState==='fading'){track.pause();musicState='off'}
 },560);
}

let idleMusic=null,idleGain=null,idleFilter=null,idleFadeTimer=null,idleVolumeRaf=0,idleState='off',idleMissing=false,idleStarted=false;
function prepareIdleMusic(){
 if(!audioDevice||!soundReady||idleMusic||idleMissing)return;
 const track=new Audio(IDLE_PATH);track.preload='auto';track.loop=true;track.volume=0;
 track.addEventListener('error',()=>{idleMissing=true;idleState='off';track.pause()});
 idleMusic=track;
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(Ctx){
   musicContext=musicContext||new Ctx();
   const source=musicContext.createMediaElementSource(track);
   idleFilter=musicContext.createBiquadFilter();idleFilter.type='lowpass';idleFilter.frequency.value=18000;
   idleGain=musicContext.createGain();idleGain.gain.value=0;
   source.connect(idleFilter).connect(idleGain).connect(musicContext.destination);
   track.volume=1;
  }
 }catch(error){console.warn('Ambient filter unavailable',error);idleFilter=null;idleGain=null;track.volume=0}
 track.load();
}
function cancelIdleFade(){
 if(idleFadeTimer){clearTimeout(idleFadeTimer);idleFadeTimer=null}
 if(idleVolumeRaf){cancelAnimationFrame(idleVolumeRaf);idleVolumeRaf=0}
}
function setIdleMix(volume,cutoff,seconds){
 if(!idleMusic)return;
 const duration=Math.max(0,seconds||0);
 if(idleGain&&musicContext){
  const t=musicContext.currentTime,g=idleGain.gain;
  g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);
  g.linearRampToValueAtTime(volume,t+duration);
  if(idleFilter){
   const f=idleFilter.frequency;
   f.cancelScheduledValues(t);f.setValueAtTime(Math.max(80,f.value),t);
   f.exponentialRampToValueAtTime(Math.max(80,cutoff),t+Math.max(.01,duration));
  }
 }else{
  const from=idleMusic.volume,started=performance.now();
  const animate=stamp=>{
   const x=Math.min(1,(stamp-started)/Math.max(1,duration*1000));
   const eased=x*x*(3-2*x);
   idleMusic.volume=Math.max(0,Math.min(1,from+(volume-from)*eased));
   if(x<1)idleVolumeRaf=requestAnimationFrame(animate);
   else idleVolumeRaf=0;
  };
  idleVolumeRaf=requestAnimationFrame(animate);
 }
}
function startIdleMusic(){
 if(!audioDevice||!soundReady||idleMissing||idleState==='playing'||idleState==='blocked')return;
 prepareIdleMusic();if(!idleMusic||idleMissing)return;
 cancelIdleFade();idleState='playing';
 const begin=()=>{
  if(idleState!=='playing'||(room&&game.phase==='answering'))return;
  if(!idleStarted&&Number.isFinite(idleMusic.duration)&&idleMusic.duration>12){
   try{idleMusic.currentTime=Math.random()*(idleMusic.duration-10)}catch{}
   idleStarted=true;
  }
  const playing=idleMusic.play();
  playing?.catch(()=>{if(idleState==='playing'){idleState='blocked';setIdleMix(0,18000,.01)}});
  if(musicContext?.state==='suspended')musicContext.resume().catch(()=>{});
  setIdleMix(IDLE_LEVEL,18000,1.15);
 };
 if(idleMusic.readyState>=1)begin();
 else idleMusic.addEventListener('loadedmetadata',begin,{once:true});
}
function endIdleMusic(){
 if(!idleMusic||idleState!=='playing')return;
 cancelIdleFade();idleState='fading';
 setIdleMix(0,1100,1.05);
 idleFadeTimer=setTimeout(()=>{
  idleFadeTimer=null;
  if(idleState==='fading'){idleMusic.pause();idleState='off'}
 },1180);
}
function currentMusicTarget(){
 if(!room)return 'idle';
 if(game.phase==='answering')return 'round';
 if(game.phase==='results'){
  const typingEnd=REVEAL_LEAD_MS+Math.max(0,...revealEntries().map(p=>fullPhraseLength(p.answer)))*REVEAL_LETTER_MS;
  return revealElapsed()>=typingEnd+350?'idle':'quiet';
 }
 return 'idle';
}
function syncRoundMusic(){
 if(!audioDevice||!soundReady)return;
 const target=currentMusicTarget();
 if(target==='round'){
  endIdleMusic();
  const id=room+':'+game.round;
  if(musicRound!==id||(musicState!=='playing'&&musicState!=='blocked')){
   musicRound=id;
   startRoundMusic();
  }
 }else{
  endRoundMusic();
  if(target==='idle')startIdleMusic();
  else endIdleMusic();
 }
}

// Host-only procedural effects; a shared compressor keeps the two cues balanced.
let revealBus=null,lastRevealSoundId='',lastRevealLetter=0;
function prepareRevealAudio(){
 if(!isHost||!soundReady)return null;
 try{
  if(!musicContext){
   const Ctx=window.AudioContext||window.webkitAudioContext;
   if(!Ctx)return null;
   musicContext=new Ctx();
  }
  const ctx=musicContext;
  if(!revealBus){
   const compressor=ctx.createDynamicsCompressor();
   compressor.threshold.value=-22;compressor.knee.value=12;
   compressor.ratio.value=3;compressor.attack.value=.005;compressor.release.value=.16;
   revealBus=ctx.createGain();revealBus.gain.value=.88;
   revealBus.connect(compressor).connect(ctx.destination);
  }
  if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  return ctx.state==='running'?ctx:null;
 }catch(e){console.warn('Reveal audio unavailable',e);return null}
}
function playSuspenseDrone(ctx,elapsed){
 // The Firebase render can arrive after the reveal starts; use remaining intro time.
 const remaining=(REVEAL_LEAD_MS-elapsed)/1000;
 if(remaining<=.12)return;
 const duration=Math.min(1.25,remaining-.04);
 const t=ctx.currentTime,filter=ctx.createBiquadFilter(),envelope=ctx.createGain();
 filter.type='lowpass';
 filter.frequency.setValueAtTime(570,t);
 filter.frequency.exponentialRampToValueAtTime(270,t+duration);
 envelope.gain.setValueAtTime(.0001,t);
 envelope.gain.exponentialRampToValueAtTime(.105,t+Math.min(.18,duration*.4));
 envelope.gain.exponentialRampToValueAtTime(.0001,t+duration);
 filter.connect(envelope).connect(revealBus);
 // Low-mid frequencies remain audible on laptop and TV speakers.
 for(const [frequency,wave,level] of [[164,'sine',1],[246,'triangle',.4]]){
  const osc=ctx.createOscillator(),voice=ctx.createGain();
  osc.type=wave;voice.gain.value=level;
  osc.frequency.setValueAtTime(frequency,t);
  osc.frequency.exponentialRampToValueAtTime(frequency*.9,t+duration);
  osc.connect(voice).connect(filter);
  osc.start(t);osc.stop(t+duration+.01);
 }
}
function playTypingPulse(ctx,letterCount){
 const t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();
 const variation=[0,40,-30,65,-18][letterCount%5];
 osc.type='triangle';
 osc.frequency.setValueAtTime(770+variation,t);
 osc.frequency.exponentialRampToValueAtTime(560+variation,t+.095);
 gain.gain.setValueAtTime(.0001,t);
 gain.gain.exponentialRampToValueAtTime(.065,t+.012);
 gain.gain.exponentialRampToValueAtTime(.0001,t+.105);
 osc.connect(gain).connect(revealBus);
 osc.start(t);osc.stop(t+.11);
}
function playRevealSoundscape(elapsed,letterCount){
 if(!isHost||!soundReady)return;
 const id=room+':'+(game.sessionId||'legacy')+':'+game.round+':'+game.revealedAt;
 const ctx=prepareRevealAudio();if(!ctx)return;
 if(lastRevealSoundId!==id){
  lastRevealSoundId=id;lastRevealLetter=0;
  if(elapsed<REVEAL_LEAD_MS)playSuspenseDrone(ctx,elapsed);
 }
 const max=Math.max(0,...revealEntries().map(p=>fullPhraseLength(p.answer)));
 const typing=elapsed>=REVEAL_LEAD_MS&&elapsed<REVEAL_LEAD_MS+max*REVEAL_LETTER_MS;
 if(!typing||letterCount<=lastRevealLetter)return;
 const skipped=letterCount-lastRevealLetter;
 lastRevealLetter=letterCount;
 // Light electronic pulse at the first character, then about every 190ms.
 // Skip catch-up bursts when returning from a background tab.
 if(skipped>3||(letterCount!==1&&letterCount%2===0))return;
 playTypingPulse(ctx,letterCount);
}
function playResultCue(elapsed){
 if(!isHost)return;
 const id=room+':'+game.round+':'+game.revealedAt;
 const endOfTyping=REVEAL_LEAD_MS+Math.max(0,...revealEntries().map(p=>fullPhraseLength(p.answer)))*REVEAL_LETTER_MS;
 if(lastResultCue===id||elapsed<endOfTyping)return;
 lastResultCue=id;
 // Ignore stale/rejoined screens; sound should happen on the last typed letter, not late.
 if(!soundReady||elapsed-endOfTyping>350)return;
 const matched=!!game.lastMatch;
 const effect=matched?correctAudio:incorrectAudio;
 if(!effect)return;
 try{effect.pause();effect.currentTime=0;effect.play().catch(()=>{})}catch{}
}
function countdownTick(remaining){
 if(!isHost||!soundReady||remaining<=0||game.phase!=='answering')return;
 const id=game.round+':'+remaining;if(id===lastTickKey)return;lastTickKey=id;
 try{tickAudio.pause();tickAudio.currentTime=0;tickAudio.play().catch(()=>{});}catch{}
}

function updateClocks(){if(game.phase!=='answering')return;let remain=Math.max(0,Math.ceil((game.deadline-now())/1000));countdownTick(remain);if($('timer')){$('timer').textContent=Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0');$('timer').classList.toggle('danger',remain<=10)}if($('bar'))$('bar').style.width=Math.min(100,Math.max(0,(game.deadline-now())/((game.duration||45)*1000)*100))+'%';if($('count'))$('count').textContent=answerCount()+' / '+playerArray().length+' locked'}
async function updateGame(fn){if(!hostToken)return;try{await runTransaction(gameRef,g=>{if(!g||g.hostToken!==hostToken)return;return fn(g)},{applyLocally:false})}catch(e){showError(e)}}
async function nextRound(duration){if(hostBusy||(game.phase==='results'&&!revealFinished()))return;hostBusy=true;try{if(!deck.length){await ensureTopAnswers();if(!topAnswerBank)throw Error('Top Answers file could not load. Refresh and retry.');let res=await fetch('./prompts.json',{cache:'no-store'});if(!res.ok)throw Error('Prompt deck unavailable');const all=await res.json();deck=all.filter(prompt=>validateTopAnswers(topAnswerBank[prompt]).length===TOP_ANSWERS_COUNT);if(!deck.length)throw Error('No validated prompts found.');}
 await updateGame(g=>{if(!['lobby','results'].includes(g.phase)||(g.mode==='duo'&&g.round>=10))return;let used=g.used||{};let choices=deck.map((_,i)=>i).filter(i=>!used[i]);if(!choices.length){used={};choices=deck.map((_,i)=>i)}let index=choices[Math.floor(Math.random()*choices.length)];return {...g,phase:'answering',round:(g.round||0)+1,roundKey:(g.sessionId?g.sessionId+'-'+((g.round||0)+1):String((g.round||0)+1)),prompt:deck[index],topAnswers:validateTopAnswers(topAnswerBank[deck[index]]),duration,deadline:now()+duration*1000,used:{...used,[index]:true},lastPoints:{},lastBreakdown:{},winningScore:50,mode:g.phase==='lobby'?(playerArray().length===2?'duo':'classic'):(g.mode||'classic')}})}catch(e){alert(e.message)}finally{hostBusy=false}}
async function finishRound(){
 if(hostBusy)return;
 hostBusy=true;
 try{
  if(!Array.isArray(game.topAnswers)&&!topAnswerBank)await ensureTopAnswers();
  const roundKey=game.roundKey||String(game.round);
  const ranked=validateTopAnswers(game.topAnswers||topAnswerBank?.[game.prompt]);
  if(ranked.length!==TOP_ANSWERS_COUNT)throw Error('Ranked answers could not load. Please retry the reveal.');
  const snap=await get(ref(db,'rooms/'+room+'/submissions/'+roundKey));
  const answerMap=snap.val()||{},roster=playerArray();
  const results=compute(roster,answerMap,ranked);
  await updateGame(g=>{
   if(g.phase!=='answering'||(g.roundKey||String(g.round))!==roundKey)return;
   const scores={...(g.scores||{})};
   for(const [pid,pts] of Object.entries(results.points))scores[pid]=(scores[pid]||0)+pts;
   const duo=g.mode==='duo',match=duo&&roster.length===2&&results.hasMatch;
   const streak=duo?(match?(g.streak||0)+1:0):0;
   return {...g,phase:'results',revealedAt:now(),scores,lastPoints:results.points,
    lastBreakdown:results.breakdown,lastMatch:results.hasMatch,topAnswers:ranked,
    streak,bestStreak:duo?Math.max(g.bestStreak||0,streak):0,
    matches:duo?(g.matches||0)+(match?1:0):0,
    history:{...(g.history||{}),[String(g.round)]:{
     round:g.round,prompt:g.prompt,topAnswers:ranked,
     answers:Object.fromEntries(Object.entries(answerMap).map(([id,a])=>[id,displayAnswer(a?.text||'')])),
     points:results.points,breakdown:results.breakdown,
     participants:roster.map(p=>({id:p.id,name:p.name,color:p.color})),
     match:results.hasMatch,at:now()
    }}
   };
  });
 }catch(error){showError(error)}finally{hostBusy=false}
}
function hostCheck(){if(!isHost||game.phase!=='answering'||hostBusy)return;const total=playerArray().length;if(now()>=game.deadline || (total>=2&&answerCount()>=total))finishRound()}

let fitQueued=false;
let keyboardFocus=false,keyboardClosing=false,frozenZoom='',frozenHeight=0;
let keyboardOpenHeight=0,keyboardReleaseTimer=0,keyboardReleaseStart=0;
function isTextField(target){
 return target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]');
}
function queueFit(){
 if(fitQueued)return;
 fitQueued=true;
 requestAnimationFrame(()=>{fitQueued=false;fitScreen()});
}
function keyboardLayoutLocked(){
 return !isHost&&!!room&&(keyboardFocus||keyboardClosing);
}
function fitScreen(){
 const layout=root.querySelector('.layout');
 if(!layout)return;
 // Keep the same physical dimensions through keyboard opening, Enter/submission,
 // the entire iOS keyboard-closing animation, and any Firebase rerender.
 if(keyboardLayoutLocked()){
   layout.style.zoom=frozenZoom||'1';
   if(frozenHeight){layout.style.height=frozenHeight+'px';layout.style.maxHeight='none'}
   if(keyboardFocus)positionFocusedField();
   return;
 }
 layout.style.height='';
 layout.style.maxHeight='';
 layout.style.zoom='1';
 const vw=document.documentElement.clientWidth;
 const vh=window.visualViewport?.height||window.innerHeight;
 const height=layout.scrollHeight;
 const width=layout.scrollWidth;
 const ratio=Math.min(1,vh/Math.max(1,height),vw/Math.max(1,width));
 if(ratio<.995)layout.style.zoom=String(Math.max(.45,ratio*.985));
}
function positionFocusedField(){
 const center=root.querySelector('.mobilecenter');
 if(!center||!keyboardFocus)return;
 const input=document.activeElement;
 if(!isTextField(input))return;
 const vv=window.visualViewport;
 const visibleBottom=vv?vv.offsetTop+vv.height:window.innerHeight;
 const form=input.closest('form');
 const target=form?.querySelector('button[type="submit"], button.primary')||input;
 const targetBottom=target.getBoundingClientRect().bottom;
 const needed=Math.max(0,targetBottom-visibleBottom+16);
 // Only move the content; never scale the interface.
 const available=Math.max(0,center.getBoundingClientRect().top-8);
 const shift=needed>0?-Math.min(needed,available+Math.max(0,visibleBottom*.12)):0;
 center.style.setProperty('--keyboard-shift',shift+'px');
}
function viewportHeight(){
 return window.visualViewport?.height||window.innerHeight;
}
function releaseKeyboardLayout(){
 if(keyboardFocus)return;
 // Safari's visual viewport bounces through intermediate heights on dismissal.
 // Wait for it to recover and settle before changing the page dimensions.
 const recovered=viewportHeight()>=keyboardOpenHeight*.92;
 const elapsed=performance.now()-keyboardReleaseStart;
 if((recovered&&elapsed>=480)||elapsed>=1800){
   keyboardClosing=false;
   keyboardReleaseTimer=0;
   frozenZoom='';frozenHeight=0;keyboardOpenHeight=0;
   root.querySelector('.mobilecenter')?.style.removeProperty('--keyboard-shift');
   queueFit();
   return;
 }
 keyboardReleaseTimer=setTimeout(releaseKeyboardLayout,75);
}
document.addEventListener('focusin',event=>{
 if(!isTextField(event.target)||isHost||!room)return;
 clearTimeout(keyboardReleaseTimer);keyboardReleaseTimer=0;
 if(!keyboardFocus&&!keyboardClosing){
   const layout=root.querySelector('.layout');
   if(layout){
     frozenZoom=layout.style.zoom||'1';
     frozenHeight=layout.offsetHeight;
   }
   keyboardOpenHeight=viewportHeight();
 }
 keyboardFocus=true;keyboardClosing=false;
 queueFit();
},true);
document.addEventListener('focusout',event=>{
 if(!isTextField(event.target)||isHost||!room)return;
 // Don't unfreeze when Enter removes the input but the keyboard is still up.
 keyboardFocus=false;keyboardClosing=true;
 keyboardReleaseStart=performance.now();
 clearTimeout(keyboardReleaseTimer);
 keyboardReleaseTimer=setTimeout(releaseKeyboardLayout,75);
},true);
window.addEventListener('resize',queueFit,{passive:true});
window.visualViewport?.addEventListener('resize',queueFit,{passive:true});
window.visualViewport?.addEventListener('scroll',()=>{
 if(keyboardFocus)positionFocusedField();
},{passive:true});

document.addEventListener('pointerdown',()=>{if(audioDevice&&(!soundReady||musicState==='blocked'||idleState==='blocked'))unlockSound()},{passive:true});
if(!room)home();else if(isHost)hostInit();else playerInit();
