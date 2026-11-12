const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:"*"}});
app.use(express.static(__dirname));
app.get('/health',(req,res)=>res.json({ok:true,service:'PM2.5 Kanchanaburi'}));
const rooms=new Map(),GAME_SECONDS=1800,MEETING_AT=[600,1200],MEETING_FEE=300,MEETING_REDUCTION=10,MEETING_CREDITS=10;
const places=[
['จุดเริ่มต้น',0],['สะพานข้ามแม่น้ำแคว',60],['กองกลาง',0],['สุสานทหารสัมพันธมิตร',60],['ค่าธรรมเนียมอุทยาน',100],['รถไฟสายมรณะ',200],['พิพิธภัณฑ์ช่องเขาขาด',100],['โอกาส',0],['น้ำตกไทรโยคน้อย',100],['น้ำตกเอราวัณ',120],['พักสถานี',0],['เขื่อนศรีนครินทร์',140],['กิจกรรมล่องแพ',150],['ถ้ำกระแซ',140],['เมืองมัลลิกา',160],['รถไฟสายมรณะ',200],['วัดถ้ำเสือ',180],['กองกลาง',0],['ต้นจามจุรียักษ์',180],['วัดเมตตาธรรมโพธิญาณ',200],['จุดชมวิว',0],['น้ำตกห้วยแม่ขมิ้น',220],['โอกาส',0],['เขื่อนวชิราลงกรณ',220],['ปิล๊อก–บ้านอีต่อง',240],['รถไฟสายมรณะ',200],['เหมืองปิล็อก',260],['ล่องแพแม่น้ำแคว',150],['สะพานมอญ',260],['เจดีย์พุทธคยา',280],['ไปสถานีพัก',0],['น้ำพุร้อนหินดาด',300],['อุทยานทองผาภูมิ',300],['กองกลาง',0],['อุทยานไทรโยค',320],['รถไฟสายมรณะ',200],['เขาช้างเผือก',350],['โอกาส',0],['อุทยานแห่งชาติเอราวัณ',400],['ภาษีท่องเที่ยว',100]];
const colors=['#8f3f55','#55a9ed','#65cb86','#f08a32'];
// ค่ามลพิษเริ่มต้นที่ใช้เป็นค่าแก้ไขได้: ธรรมชาติ/ท่องเที่ยว +2, เขื่อน +3,
// ล่องแพ +1, รถไฟ/ขนส่ง +10, เหมือง +12, โรงงาน +15, บ้าน +3
function pollutionFor(i){
 if([5,15,25,35].includes(i))return 10;
 if(i===26)return 12;
 if([12,27].includes(i))return 1;
 if([11,23].includes(i))return 3;
 return places[i]?.[1]>0?2:0;
}
function elapsed(r){return r.elapsedBeforePause+(r.started&&!r.meeting&&r.activeSince?Math.floor((Date.now()-r.activeSince)/1000):0)}
function publicState(r){return {code:r.code,host:r.host,current:r.current,started:r.started,rolled:r.rolled,dice:r.dice,owners:r.owners,players:r.players.map(p=>({...p})),pm25:r.pm25,meeting:r.meeting?{number:r.meeting.number,answers:r.meeting.answers}:null,elapsedSeconds:Math.min(GAME_SECONDS,elapsed(r))}}
function pub(r){io.to(r.code).emit('state',publicState(r))}
function msg(r,s){io.to(r.code).emit('message',s)}
function current(r,s){return r.players[r.current]&&r.players[r.current].id===s.id}
function advance(r){if(!r.players.length)return;r.current=(r.current+1)%r.players.length;r.rolled=false;r.dice=null;r.pending=null;pub(r)}
function finishGame(r,reason){
 if(!r.started)return;r.elapsedBeforePause=GAME_SECONDS;r.started=false;r.meeting=null;
 const max=Math.max(...r.players.map(p=>p.cash)),winners=r.players.filter(p=>p.cash===max);
 io.to(r.code).emit('gameOver',{winners:winners.map(p=>p.name),cash:max,reason,standings:r.players.slice().sort((a,b)=>b.cash-a.cash).map(p=>({name:p.name,cash:p.cash,credits:p.credits,assets:p.assets.length}))});
 msg(r,reason||'ครบเวลา 30 นาที');pub(r);
}
function charge(r,p,n,reason){const amount=Math.min(p.cash,n);p.cash-=amount;msg(r,`${p.name} จ่าย ${amount} บาท (${reason})`)}
function credit(r,p,n,reason){p.cash+=n;msg(r,`${p.name} ได้รับ ${n} บาท (${reason})`)}
function beginMeeting(r,number){
 if(!r.started||r.meeting||r.meetingsDone.includes(number))return;
 r.elapsedBeforePause=Math.min(GAME_SECONDS,elapsed(r));r.activeSince=null;
 r.meeting={number,answers:{}};
 io.to(r.code).emit('meetingStart',{number,fee:MEETING_FEE,reduction:MEETING_REDUCTION,credits:MEETING_CREDITS});
 msg(r,`เริ่มประชุมรอบที่ ${number} — เลือกยืนยันหรือปฏิเสธ`);pub(r);
}
function maybeMeetingOrFinish(r){
 const e=elapsed(r);
 if(e>=GAME_SECONDS){finishGame(r,'หมดเวลา 30 นาที');return}
 if(!r.meeting&&MEETING_AT.includes(e))beginMeeting(r,MEETING_AT.indexOf(e)+1);
}
function land(r,p){
 const i=p.pos,[name,price]=places[i];msg(r,`${p.name} มาถึง ${name}`);
 if(i===0){credit(r,p,200,'ผ่านจุดเริ่มต้น');return}
 if([2,17,33,7,22,37].includes(i)){const n=[100,-50,150,-100,200][Math.floor(Math.random()*5)];n>0?credit(r,p,n,'กิจกรรมชุมชน'):charge(r,p,-n,'กิจกรรมชุมชน');return}
 if([4,39].includes(i)){charge(r,p,price,'ค่าธรรมเนียม');return}
 if(i===30){p.pos=10;msg(r,p.name+' ถูกส่งไปพักที่สถานี');return}
 if(!price)return;
 if(r.owners[i]===undefined){r.pending={player:p.id,index:i};io.to(p.id).emit('purchaseOffer',{name,price,index:i,pollution:pollutionFor(i)});return}
 if(r.owners[i]!==p.id){const owner=r.players.find(x=>x.id===r.owners[i]);if(owner){const damage=Math.ceil(price/2);charge(r,p,damage,'ค่าเสียหาย 50% ของราคาพื้นที่ '+name);if(p.cash>0)credit(r,owner,damage,'ค่าชดเชยพื้นที่')}}
}
io.on('connection',s=>{
 s.on('create',({name,gender})=>{
  const code=Math.random().toString(36).slice(2,8).toUpperCase(),p={id:s.id,name:String(name||'Engineer').slice(0,20),gender:gender==='female'?'female':'male',color:colors[0],cash:1000,credits:0,pos:0,assets:[],alive:true};
  const r={code,host:s.id,players:[p],current:0,started:false,countdown:false,activeSince:null,elapsedBeforePause:0,rolled:false,dice:null,owners:{},pending:null,pm25:0,meeting:null,meetingsDone:[]};
  rooms.set(code,r);s.join(code);s.emit('message','สร้างห้องแล้ว! แชร์รหัสห้อง '+code+' ให้เพื่อน');pub(r);
 });
 s.on('join',({room,name,gender})=>{
  const r=rooms.get(String(room||'').toUpperCase());if(!r)return s.emit('errorMessage','ไม่พบห้องนี้');
  if(r.started||r.countdown)return s.emit('errorMessage','เกมกำลังเริ่มหรือเริ่มแล้ว ไม่สามารถเข้าร่วมได้');
  if(r.players.length>=4)return s.emit('errorMessage','ห้องเต็มแล้ว (สูงสุด 4 คน)');
  if(r.players.some(p=>p.id===s.id))return;
  const idx=r.players.length,p={id:s.id,name:String(name||'Engineer').slice(0,20),gender:gender==='female'?'female':'male',color:colors[idx],cash:1000,credits:0,pos:0,assets:[],alive:true};
  r.players.push(p);s.join(r.code);msg(r,p.name+' เข้าร่วมห้อง');pub(r);
 });
 s.on('start',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r||r.host!==s.id)return;
  if(r.players.length<2)return s.emit('errorMessage','ต้องมีผู้เล่นอย่างน้อย 2 คน');
  if(r.started||r.countdown)return;
  r.countdown=true;io.to(r.code).emit('gameCountdown',{seconds:3});msg(r,'เตรียมเริ่มเกม!');
  setTimeout(()=>{
   if(!rooms.has(r.code)||!r.countdown)return;
   r.countdown=false;r.started=true;r.activeSince=Date.now();r.elapsedBeforePause=0;r.current=0;r.rolled=false;r.dice=null;
   msg(r,'เริ่มเกมแล้ว! เวลาเล่น 30 นาที เริ่มต้นคนละ 1,000 บาท');pub(r);
  },3000);
 });
 s.on('roll',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());if(!r||!r.started||r.meeting||r.rolled||r.pending||!current(r,s))return;
  maybeMeetingOrFinish(r);if(!r.started||r.meeting)return;
  const p=r.players[r.current],a=1+Math.floor(Math.random()*6),b=1+Math.floor(Math.random()*6),old=p.pos;
  r.dice=[['','⚀','⚁','⚂','⚃','⚄','⚅'][a],['','⚀','⚁','⚂','⚃','⚄','⚅'][b]];
  p.pos=(p.pos+a+b)%40;if(p.pos<old)credit(r,p,200,'ผ่านจุดเริ่มต้น');
  r.rolled=true;land(r,p);
  io.to(r.code).emit('playerMoved',{playerId:p.id,from:old,to:p.pos,steps:a+b,dice:r.dice});
  if(!r.pending)advance(r);else pub(r);
 });
 s.on('buy',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());if(!r||!r.started||r.meeting||!r.pending||r.pending.player!==s.id||!current(r,s))return;
  const p=r.players.find(x=>x.id===s.id),i=r.pending.index,price=places[i][1];
  if(p.cash>=price){p.cash-=price;p.assets.push(i);r.owners[i]=p.id;r.pm25+=pollutionFor(i);msg(r,`${p.name} ซื้อ ${places[i][0]} และเพิ่ม PM2.5 ${pollutionFor(i)} หน่วย`)}
  else msg(r,p.name+' เงินไม่เพียงพอ จึงข้ามการซื้อ');
  advance(r);
 });
 s.on('pass',({room})=>{const r=rooms.get(String(room||'').toUpperCase());if(!r||!r.started||r.meeting||!r.pending||r.pending.player!==s.id||!current(r,s))return;msg(r,r.players[r.current].name+' ผ่านการซื้อ');advance(r)});
 s.on('meetingAnswer',({room,answer})=>{
  const r=rooms.get(String(room||'').toUpperCase());if(!r||!r.meeting||r.meeting.answers[s.id])return;
  const p=r.players.find(x=>x.id===s.id);if(!p)return;
  if(answer==='confirm'){
   if(p.cash<MEETING_FEE)return s.emit('errorMessage','เงินไม่เพียงพอ ต้องมีอย่างน้อย 300 บาทเพื่อยืนยัน');
   p.cash-=MEETING_FEE;p.credits+=MEETING_CREDITS;r.pm25=Math.max(0,r.pm25-MEETING_REDUCTION);
   msg(r,`${p.name} ยืนยันมาตรการ: จ่าย 300 บาท ได้ชื่อเสียง +10 และลด PM2.5 10 หน่วย`);
  }else if(answer==='reject'){msg(r,`${p.name} ปฏิเสธมาตรการ: ไม่เสียเงินและชื่อเสียงคงเดิม`)}else return;
  r.meeting.answers[s.id]=answer;pub(r);
  if(r.players.every(x=>r.meeting.answers[x.id])){
   const n=r.meeting.number;r.meetingsDone.push(n);r.meeting=null;
   if(elapsed(r)>=GAME_SECONDS){finishGame(r,'หมดเวลา 30 นาที');return}
   r.activeSince=Date.now();io.to(r.code).emit('meetingEnd',{number:n});msg(r,'ผู้เล่นตอบครบแล้ว กลับเข้าสู่เกม');pub(r);
  }
 });
 s.on('disconnect',()=>{for(const r of rooms.values()){const p=r.players.find(x=>x.id===s.id);if(p){p.connected=false;msg(r,p.name+' หลุดการเชื่อมต่อ');pub(r)}}});
});
setInterval(()=>{for(const r of rooms.values())if(r.started){maybeMeetingOrFinish(r);io.to(r.code).emit('timerTick',{elapsedSeconds:Math.min(GAME_SECONDS,elapsed(r)),pm25:r.pm25})}},1000);
const port=process.env.PORT||3000;server.listen(port,()=>console.log('PM25 Kanchanaburi listening on '+port));
