const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:"*"}});
app.use(express.static(__dirname));
app.get('/health',(req,res)=>res.json({ok:true,service:'PM2.5 Kanchanaburi'}));
const rooms=new Map();
const GAME_SECONDS=30*60;
const places=[
['จุดเริ่มต้น',0],['สะพานข้ามแม่น้ำแคว',60],['กองกลาง',0],['สุสานทหารสัมพันธมิตร',60],['ค่าธรรมเนียมอุทยาน',100],['รถไฟสายมรณะ',200],['พิพิธภัณฑ์ช่องเขาขาด',100],['โอกาส',0],['น้ำตกไทรโยคน้อย',100],['น้ำตกเอราวัณ',120],['พักสถานี',0],['เขื่อนศรีนครินทร์',140],['กิจกรรมล่องแพ',150],['ถ้ำกระแซ',140],['เมืองมัลลิกา',160],['รถไฟสายมรณะ',200],['วัดถ้ำเสือ',180],['กองกลาง',0],['ต้นจามจุรียักษ์',180],['วัดเมตตาธรรมโพธิญาณ',200],['จุดชมวิว',0],['น้ำตกห้วยแม่ขมิ้น',220],['โอกาส',0],['เขื่อนวชิราลงกรณ',220],['ปิล๊อก–บ้านอีต่อง',240],['รถไฟสายมรณะ',200],['เหมืองปิล็อก',260],['ล่องแพแม่น้ำแคว',150],['สะพานมอญ',260],['เจดีย์พุทธคยา',280],['ไปสถานีพัก',0],['น้ำพุร้อนหินดาด',300],['อุทยานทองผาภูมิ',300],['กองกลาง',0],['อุทยานไทรโยค',320],['รถไฟสายมรณะ',200],['เขาช้างเผือก',350],['โอกาส',0],['อุทยานแห่งชาติเอราวัณ',400],['ภาษีท่องเที่ยว',100]];
const colors=['#ef5b54','#55a9ed','#65cb86','#f0cf5d'];
function pub(r){io.to(r.code).emit('state',{code:r.code,host:r.host,current:r.current,started:r.started,startedAt:r.startedAt,rolled:r.rolled,dice:r.dice,owners:r.owners,players:r.players.map(p=>({...p}))})}
function msg(r,s){io.to(r.code).emit('message',s)}
function current(r,s){return r.players[r.current]&&r.players[r.current].id===s.id}
function advance(r){
 if(!r.players.length)return;
 const start=r.current;let tries=0;
 do{r.current=(r.current+1)%r.players.length;tries++}
 while(!r.players[r.current].alive&&tries<r.players.length);
 r.rolled=false;r.dice=null;r.pending=null;
}
function netWorth(p,r){return p.cash+p.assets.reduce((sum,i)=>sum+(places[i]?.[1]||0),0)}
function finishGame(r,reason){
 if(!r.started)return;
 r.started=false;
 const alive=r.players.filter(p=>p.alive);
 const ranked=(alive.length?alive:r.players).slice().sort((a,b)=>netWorth(b,r)-netWorth(a,r));
 const winner=ranked[0];
 io.to(r.code).emit('gameOver',{name:winner?.name||'ไม่มีผู้ชนะ',reason,score:winner?netWorth(winner,r):0});
 msg(r,reason||'จบเกมแล้ว');
 pub(r);
}
function bankruptcy(r,p){
 p.alive=false;for(const i of p.assets)delete r.owners[i];p.assets=[];
 const alive=r.players.filter(x=>x.alive);
 if(alive.length<=1)finishGame(r,'ผู้เล่นเหลือคนเดียว');
}
function charge(r,p,n,reason){
 const amount=Math.min(p.cash,n);p.cash-=amount;
 msg(r,`${p.name} จ่าย ${amount} เครดิต (${reason})`);
 if(p.cash===0&&!p.assets.length)bankruptcy(r,p);
}
function credit(r,p,n,reason){p.cash+=n;msg(r,`${p.name} ได้รับ ${n} เครดิต (${reason})`)}
function land(r,p){
 const i=p.pos,[name,price]=places[i];msg(r,`${p.name} มาถึง ${name}`);
 if(i===0){credit(r,p,200,'จุดเริ่มต้น');return}
 if([2,17,33,7,22,37].includes(i)){const n=[100,-50,150,-100,200][Math.floor(Math.random()*5)];n>0?credit(r,p,n,'กิจกรรมชุมชน'):charge(r,p,-n,'กิจกรรมชุมชน');return}
 if([4,39].includes(i)){charge(r,p,price,'ค่าธรรมเนียม');return}
 if(i===30){p.pos=10;msg(r,p.name+' ถูกส่งไปพักที่สถานี');return}
 if(!price)return;
 if(r.owners[i]===undefined){r.pending={player:p.id,index:i};io.to(p.id).emit('purchaseOffer',{name,price,index:i});return}
 if(r.owners[i]!==p.id){
  const owner=r.players.find(x=>x.id===r.owners[i]);
  if(owner){const rent=Math.max(20,Math.round(price*.18));charge(r,p,rent,'ค่าเข้าพื้นที่ '+name);if(p.alive)credit(r,owner,rent,'ค่าเช่า')}
 }
}
io.on('connection',s=>{
 s.on('create',({name,gender})=>{
  const code=Math.random().toString(36).slice(2,8).toUpperCase();
  const p={id:s.id,name:String(name||'Engineer').slice(0,20),gender:gender==='female'?'female':'male',color:colors[0],cash:1500,pos:0,assets:[],alive:true};
  const r={code,host:s.id,players:[p],current:0,started:false,startedAt:null,rolled:false,dice:null,owners:{},pending:null};
  rooms.set(code,r);s.join(code);
  s.emit('message','สร้างห้องแล้ว! แชร์รหัสห้อง '+code+' ให้เพื่อน');
  pub(r);
 });
 s.on('join',({room,name,gender})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r)return s.emit('errorMessage','ไม่พบห้องนี้');
  if(r.started)return s.emit('errorMessage','เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้');
  if(r.players.length>=4)return s.emit('errorMessage','ห้องเต็มแล้ว (สูงสุด 4 คน)');
  if(r.players.some(p=>p.id===s.id))return;
  const idx=r.players.length;
  const p={id:s.id,name:String(name||'Engineer').slice(0,20),gender:gender==='female'?'female':'male',color:colors[idx],cash:1500,pos:0,assets:[],alive:true};
  r.players.push(p);s.join(r.code);msg(r,p.name+' เข้าร่วมห้อง');pub(r);
 });
 s.on('start',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());if(!r||r.host!==s.id)return;
  if(r.players.length<2)return s.emit('errorMessage','ต้องมีผู้เล่นอย่างน้อย 2 คน');
  if(r.started)return;
  r.started=true;r.startedAt=Date.now();r.current=0;r.rolled=false;r.dice=null;
  msg(r,'เริ่มเกมแล้ว! มีเวลา 30 นาที');pub(r);
 });
 s.on('roll',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r||!r.started||r.rolled||r.pending||!current(r,s))return;
  if(Date.now()-r.startedAt>=GAME_SECONDS*1000){finishGame(r,'หมดเวลา 30 นาที');return}
  const p=r.players[r.current],a=1+Math.floor(Math.random()*6),b=1+Math.floor(Math.random()*6),old=p.pos;
  r.dice=[['','⚀','⚁','⚂','⚃','⚄','⚅'][a],['','⚀','⚁','⚂','⚃','⚄','⚅'][b]];
  r.rolled=true;p.pos=(p.pos+a+b)%40;if(p.pos<old)credit(r,p,200,'ผ่านจุดเริ่มต้น');
  land(r,p);pub(r);
 });
 s.on('buy',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r||!r.started||!r.rolled||!r.pending||r.pending.player!==s.id||!current(r,s))return;
  const p=r.players.find(x=>x.id===s.id),i=r.pending.index,price=places[i][1];
  if(p.cash>=price){p.cash-=price;p.assets.push(i);r.owners[i]=p.id;msg(r,p.name+' ซื้อ '+places[i][0])}
  else msg(r,p.name+' เครดิตไม่เพียงพอ จึงข้ามการซื้อ');
  advance(r);pub(r);
 });
 s.on('pass',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r||!r.started||!r.pending||r.pending.player!==s.id||!current(r,s))return;
  msg(r,r.players[r.current].name+' ผ่านการซื้อ');advance(r);pub(r);
 });
 s.on('endTurn',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r||!r.started||!r.rolled||r.pending||!current(r,s))return;
  advance(r);pub(r);
 });
 s.on('disconnect',()=>{
  for(const r of rooms.values()){
   const p=r.players.find(x=>x.id===s.id);
   if(p){p.connected=false;msg(r,p.name+' หลุดการเชื่อมต่อ');pub(r)}
  }
 });
});
setInterval(()=>{
 const now=Date.now();
 for(const r of rooms.values())if(r.started&&r.startedAt&&now-r.startedAt>=GAME_SECONDS*1000)finishGame(r,'หมดเวลา 30 นาที');
},1000);
const port=process.env.PORT||3000;
server.listen(port,()=>console.log('PM25 Kanchanaburi listening on '+port));
