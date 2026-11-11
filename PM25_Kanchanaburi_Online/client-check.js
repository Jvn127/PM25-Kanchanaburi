
(()=>{
const $=id=>document.getElementById(id);
let socket=null,state=null,myId=null,room=null,audioCtx=null,musicTimer=null,musicOn=false,noteIndex=0;
const colors=['#ef5b54','#55a9ed','#65cb86','#f0cf5d'];
const sprite=['red','blue','green','yellow'];
const genderFilters=['hue-rotate(330deg) saturate(1.25)','hue-rotate(155deg) saturate(1.15)','hue-rotate(75deg) saturate(1.2)','hue-rotate(35deg) saturate(1.3)'];
let selectedGender='male',timerInterval=null;
const places=[
['จุดเริ่มต้น',0],['สะพานข้ามแม่น้ำแคว',60],['กองกลาง',0],['สุสานทหารสัมพันธมิตร',60],['ค่าธรรมเนียมอุทยาน',100],['รถไฟสายมรณะ',200],['พิพิธภัณฑ์ช่องเขาขาด',100],['โอกาส',0],['น้ำตกไทรโยคน้อย',100],['น้ำตกเอราวัณ',120],['พักสถานี',0],['เขื่อนศรีนครินทร์',140],['กิจกรรมล่องแพ',150],['ถ้ำกระแซ',140],['เมืองมัลลิกา',160],['รถไฟสายมรณะ',200],['วัดถ้ำเสือ',180],['กองกลาง',0],['ต้นจามจุรียักษ์',180],['วัดเมตตาธรรมโพธิญาณ',200],['จุดชมวิว',0],['น้ำตกห้วยแม่ขมิ้น',220],['โอกาส',0],['เขื่อนวชิราลงกรณ',220],['ปิล๊อก–บ้านอีต่อง',240],['รถไฟสายมรณะ',200],['เหมืองปิล็อก',260],['ล่องแพแม่น้ำแคว',150],['สะพานมอญ',260],['เจดีย์พุทธคยา',280],['ไปสถานีพัก',0],['น้ำพุร้อนหินดาด',300],['อุทยานทองผาภูมิ',300],['กองกลาง',0],['อุทยานไทรโยค',320],['รถไฟสายมรณะ',200],['เขาช้างเผือก',350],['โอกาส',0],['อุทยานแห่งชาติเอราวัณ',400],['ภาษีท่องเที่ยว',100]];
const pos=[];for(let i=0;i<=10;i++)pos.push([10-i,10]);for(let i=1;i<=10;i++)pos.push([0,10-i]);for(let i=1;i<=10;i++)pos.push([i,0]);for(let i=1;i<=9;i++)pos.push([10,i]);
const tileColors=['#86b77b','#77b8c5','#c99a82','#d5bd68','#8eb5a0'];
function spriteUrl(p,idx){return p.gender==='female'?'/assets/engineer-female.png':'/assets/engineer-'+sprite[idx]+'.png'}
function formatTime(sec){sec=Math.max(0,Math.min(1800,sec|0));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
function updateTimer(){if(!state||!state.started||!state.startedAt){$('timer').textContent='00:00';return}const elapsed=Math.floor((Date.now()-state.startedAt)/1000);$('timer').textContent=formatTime(elapsed)}
function startTimer(){if(timerInterval)clearInterval(timerInterval);updateTimer();timerInterval=setInterval(updateTimer,1000)}
function log(s){$('log').innerHTML=s+'<br>'+$('log').innerHTML}
function modal(title,body,buttons){$('dialog').innerHTML='<h2>'+title+'</h2><p>'+body+'</p><div id="modalButtons"></div>';buttons.forEach(b=>{let x=document.createElement('button');x.className=b.alt?'alt':'btn';x.textContent=b.text;x.onclick=b.fn;$('modalButtons').appendChild(x)});$('modal').style.display='flex'}
function close(){$('modal').style.display='none'}
function joinRoom(code){const name=$('playerName').value.trim()||'Engineer';socket.emit('join',{room:code,name,gender:selectedGender})}
function enterGame(){ $('lobby').style.display='none';$('game').style.display='block'; }
function render(){
 if(!state)return;
 enterGame();
 if(state.started)startTimer();else{if(timerInterval)clearInterval(timerInterval);$('timer').textContent='00:00'}
 $('roomLabel').textContent='ROOM '+room+' · '+(state.started?'กำลังเล่น':'รอผู้เล่น');
 const currentPlayer=state.players[state.current];
 $('players').innerHTML=Array.from({length:4},(_,i)=>{
  const p=state.players[i];
  if(!p)return `<div class="player empty" style="--player-color:${colors[i]}"><span style="font-size:25px">＋</span><div><div class="pname">รอผู้เล่น ${i+1}</div><div class="pmeta">สีประจำทีม ${['แดง','น้ำเงิน','เขียว','เหลือง'][i]}</div></div></div>`;
  return `<div class="player ${p.id===currentPlayer?.id?'active':''}" style="--player-color:${colors[i]}"><img class="avatar" src="${spriteUrl(p,i)}" style="filter:${p.gender==='female'?genderFilters[i]:'none'}" alt=""><div style="min-width:0"><div class="pname">${p.name}</div><div class="pmoney">${p.cash.toLocaleString()} ฿</div><div class="pmeta">${p.assets.length} พื้นที่ · ช่อง ${p.pos+1}</div></div></div>`;
 }).join('');
 $('status').textContent=state.started?(currentPlayer?.name||'')+' กำลังเล่น':'รอเริ่มเกม (อย่างน้อย 2 คน)';
 $('roll').disabled=!state.started||currentPlayer?.id!==myId||state.rolled;
 $('end').disabled=!state.started||currentPlayer?.id!==myId||!state.rolled;
 $('d1').textContent=state.dice?.[0]||'⚀';$('d2').textContent=state.dice?.[1]||'⚀';
 const board=$('board');
 board.querySelectorAll('.tile').forEach(n=>n.remove());
 pos.forEach(([c,r],i)=>{
  const t=document.createElement('div');t.className='tile';
  t.style.gridColumn=(c+1);t.style.gridRow=(r+1);
  const owner=state.owners[i],onTile=state.players.some(p=>p.id===myId&&p.pos===i);
  if(onTile)t.classList.add('current');
  const band=document.createElement('div');band.className='stripe';band.style.background=tileColors[Math.floor(i/8)%tileColors.length];t.appendChild(band);
  const name=document.createElement('strong');name.textContent=places[i][0];t.appendChild(name);
  const price=document.createElement('small');price.textContent=places[i][1]?places[i][1]+' ฿':'';t.appendChild(price);
  if(owner!==undefined){const o=document.createElement('div');o.className='owner';o.style.color=state.players.find(p=>p.id===owner)?.color||'#333';o.textContent=state.players.find(p=>p.id===owner)?.name||'มีเจ้าของ';t.appendChild(o)}
  const tokens=document.createElement('div');tokens.className='tokens';
  state.players.filter(p=>p.pos===i).forEach(p=>{const idx=state.players.indexOf(p);const tok=document.createElement('img');tok.className='token';tok.src=spriteUrl(p,idx);if(p.gender==='female')tok.style.filter=genderFilters[idx];tok.alt=p.name;tokens.appendChild(tok)});
  t.appendChild(tokens);board.appendChild(t);
 });
 $('startGame').style.display=!state.started&&state.host===myId&&state.players.length>=2?'inline-block':'none';
}
function connect(){
 if(typeof io==='undefined'){$('connection').textContent='● ไม่พบการเชื่อมต่อเซิร์ฟเวอร์';return}
 socket=io();
 socket.on('connect',()=>{$('connection').textContent='● ONLINE';myId=socket.id;const q=new URLSearchParams(location.search).get('room');if(q){$('lobby').style.display='flex';$('playBtn').style.display='none';$('roomOptions').style.display='block';$('joinBox').style.display='block';$('code').value=q;joinRoom(q)}});
 socket.on('disconnect',()=>{$('connection').textContent='● OFFLINE'});
 socket.on('state',s=>{state=s;room=s.code;render()});
 socket.on('message',m=>log(m));
 socket.on('errorMessage',m=>modal('แจ้งเตือน',m,[{text:'ตกลง',fn:close}]));
 socket.on('purchaseOffer',o=>modal('📍 ซื้อสถานที่?',o.name+' ราคา '+o.price+' เครดิต',[{text:'ซื้อ',fn:()=>{socket.emit('buy',{room});close()}},{text:'ผ่าน',alt:true,fn:()=>{socket.emit('pass',{room});close()}}]));
 socket.on('gameOver',w=>modal('🏆 ผู้ชนะ',w.name+' เป็นผู้ชนะเกมนี้',[{text:'ปิด',fn:close}]));
}
$('playBtn').onclick=()=>{$('playBtn').style.display='none';$('roomOptions').style.display='block';$('playerName').focus()};
$('maleChoice').onclick=()=>{selectedGender='male';$('maleChoice').classList.add('selected');$('femaleChoice').classList.remove('selected')};
$('femaleChoice').onclick=()=>{selectedGender='female';$('femaleChoice').classList.add('selected');$('maleChoice').classList.remove('selected')};
$('showJoin').onclick=()=>{$('joinBox').style.display=$('joinBox').style.display==='block'?'none':'block';$('code').focus()};
$('create').onclick=()=>{const name=$('playerName').value.trim()||'Engineer';socket.emit('create',{name,gender:selectedGender})};
$('join').onclick=()=>{const c=$('code').value.trim().toUpperCase();if(c)joinRoom(c);else modal('กรุณากรอกรหัสห้อง','ขอรหัสห้องจากเพื่อนก่อน',[{text:'ตกลง',fn:close}])};
$('startGame').onclick=()=>socket.emit('start',{room});
$('roll').onclick=()=>socket.emit('roll',{room});
$('end').onclick=()=>socket.emit('endTurn',{room});
$('assets').onclick=()=>{const p=state?.players.find(p=>p.id===myId);modal('ทรัพย์สินของฉัน',p?.assets.map(i=>places[i][0]+' · '+places[i][1]+' เครดิต').join('<br>')||'ยังไม่มีทรัพย์สิน',[{text:'ปิด',fn:close}])};
function musicStep(){
 if(!audioCtx)return;
 const notes=[261.63,329.63,392,329.63,293.66,349.23,440,392];
 const freq=notes[noteIndex++%notes.length],now=audioCtx.currentTime;
 const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
 osc.type='sine';osc.frequency.setValueAtTime(freq,now);
 gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.045,now+.06);gain.gain.exponentialRampToValueAtTime(.0001,now+1.15);
 osc.connect(gain);gain.connect(audioCtx.destination);osc.start(now);osc.stop(now+1.2);
}
$('music').onclick=async()=>{
 if(!musicOn){audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();await audioCtx.resume();musicOn=true;musicStep();musicTimer=setInterval(musicStep,1350);$('music').textContent='♫ เพลง: เปิด'}
 else{musicOn=false;clearInterval(musicTimer);musicTimer=null;if(audioCtx)await audioCtx.suspend();$('music').textContent='♫ เพลง: ปิด'}
};
connect();
})();
