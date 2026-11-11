const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const path=require('path');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:"*"}});
app.use(express.static(__dirname));
app.get('/health',(req,res)=>res.json({ok:true,service:'PM2.5 Kanchanaburi'}));
const rooms=new Map();
const places=[
['จุดเริ่มต้น',0],['สะพานข้ามแม่น้ำแคว',60],['กองกลาง',0],['สุสานทหารสัมพันธมิตร',60],['ค่าธรรมเนียมอุทยาน',100],['รถไฟสายมรณะ',200],['พิพิธภัณฑ์ช่องเขาขาด',100],['โอกาส',0],['น้ำตกไทรโยคน้อย',100],['น้ำตกเอราวัณ',120],['พักสถานี',0],['เขื่อนศรีนครินทร์',140],['กิจกรรมล่องแพ',150],['ถ้ำกระแซ',140],['เมืองมัลลิกา',160],['รถไฟสายมรณะ',200],['วัดถ้ำเสือ',180],['กองกลาง',0],['ต้นจามจุรียักษ์',180],['วัดเมตตาธรรมโพธิญาณ',200],['จุดชมวิว',0],['น้ำตกห้วยแม่ขมิ้น',220],['โอกาส',0],['เขื่อนวชิราลงกรณ',220],['ปิล๊อก–บ้านอีต่อง',240],['รถไฟสายมรณะ',200],['เหมืองปิล็อก',260],['ล่องแพแม่น้ำแคว',150],['สะพานมอญ',260],['เจดีย์พุทธคยา',280],['ไปสถานีพัก',0],['น้ำพุร้อนหินดาด',300],['อุทยานทองผาภูมิ',300],['กองกลาง',0],['อุทยานไทรโยค',320],['รถไฟสายมรณะ',200],['เขาช้างเผือก',350],['โอกาส',0],['อุทยานแห่งชาติเอราวัณ',400],['ภาษีท่องเที่ยว',100]];
const colors=['#ef5b54','#55a9ed','#65cb86','#f0cf5d'];
function pub(r){io.to(r.code).emit('state',{code:r.code,host:r.host,current:r.current,started:r.started,rolled:r.rolled,dice:r.dice,owners:r.owners,players:r.players.map(p=>({...p}))})}
function msg(r,s){io.to(r.code).emit('message',s)}
function current(r,s){return r.players[r.current]&&r.players[r.current].id===s.id}
function advance(r){if(r.players.length<1)return;let start=r.current;do{r.current=(r.current+1)%r.players.length}while(!r.players[r.current].alive&&r.current!==start);r.rolled=false;r.dice=null}
function bankruptcy(r,p){p.alive=false;for(const i of p.assets)delete r.owners[i];p.assets=[];const alive=r.players.filter(x=>x.alive);if(alive.length===1){r.started=false;io.to(r.code).emit('gameOver',{name:alive[0].name})}}
function charge(r,p,n,reason){let amount=Math.min(p.cash,n);p.cash-=amount;msg(r,`${p.name} จ่าย ${amount} เครดิต (${reason})`);if(p.cash===0&&!p.assets.length)bankruptcy(r,p)}
function credit(r,p,n,reason){p.cash+=n;msg(r,`${p.name} ได้รับ ${n} เครดิต (${reason})`)}
function land(r,p){
 const i=p.pos,[name,price]=places[i];msg(r,`${p.name} มาถึง ${name}`);
 if(i===0){credit(r,p,200,'จุดเริ่มต้น');return}
 if([2,17,33,7,22,37].includes(i)){let n=[100,-50,150,-100,200][Math.floor(Math.random()*5)];n>0?credit(r,p,n,'กิจกรรมชุมชน'):charge(r,p,-n,'กิจกรรมชุมชน');return}
 if([4,39].includes(i)){charge(r,p,price,'ค่าธรรมเนียม');return}
 if(i===30){p.pos=10;msg(r,p.name+' ถูกส่งไปพักที่สถานี');return}
 if(!price)return;
 if(r.owners[i]===undefined){io.to(p.id).emit('purchaseOffer',{name,price,index:i});r.pending={player:p.id,index:i};return}
 if(r.owners[i]!==p.id){let owner=r.players.find(x=>x.id===r.owners[i]);if(owner){let rent=Math.max(20,Math.round(price*.18));charge(r,p,rent,'ค่าเข้าพื้นที่ '+name);if(p.alive)credit(r,owner,rent,'ค่าเช่า')}}
}
io.on('connection',s=>{
 s.on('create',({name})=>{let code=Math.random().toString(36).slice(2,8).toUpperCase();let p={id:s.id,name:String(name||'Engineer').slice(0,20),color:colors[0],cash:1500,pos:0,assets:[],alive:true};let r={code,host:s.id,players:[p],current:0,started:false,rolled:false,dice:null,owners:{},pending:null};rooms.set(code,r);s.join(code);s.emit('message','สร้างห้องแล้ว! แชร์ลิงก์นี้ให้เพื่อน: '+`${process.env.PUBLIC_URL||''}/?room=${code}`);pub(r)});
 s.on('join',({room,name})=>{let r=rooms.get(String(room||'').toUpperCase());if(!r)return s.emit('errorMessage','ไม่พบห้องนี้');if(r.started)return s.emit('errorMessage','เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้');if(r.players.length>=4)return s.emit('errorMessage','ห้องเต็มแล้ว (สูงสุด 4 คน)');if(r.players.some(p=>p.id===s.id))return;let p={id:s.id,name:String(name||'Engineer').slice(0,20),color:colors[r.players.length],cash:1500,pos:0,assets:[],alive:true};r.players.push(p);s.join(r.code);msg(r,p.name+' เข้าร่วมห้อง');pub(r)});
 s.on('start',({room})=>{let r=rooms.get(room);if(!r||r.host!==s.id)return;if(r.players.length<2)return s.emit('errorMessage','ต้องมีผู้เล่นอย่างน้อย 2 คน');r.started=true;r.current=0;msg(r,'เริ่มเกมแล้ว!');pub(r)});
 s.on('roll',({room})=>{let r=rooms.get(room);if(!r||!r.started||r.rolled||!current(r,s))return;let p=r.players[r.current],a=1+Math.floor(Math.random()*6),b=1+Math.floor(Math.random()*6),old=p.pos;r.dice=[['','⚀','⚁','⚂','⚃','⚄','⚅'][a],['','⚀','⚁','⚂','⚃','⚄','⚅'][b]];r.rolled=true;p.pos=(p.pos+a+b)%40;if(p.pos<old)credit(r,p,200,'ผ่านจุดเริ่มต้น');land(r,p);pub(r)});
 s.on('buy',({room})=>{let r=rooms.get(room);if(!r||!r.rolled||!r.pending||r.pending.player!==s.id)return;let p=r.players.find(x=>x.id===s.id),i=r.pending.index,price=places[i][1];if(p.cash>=price){p.cash-=price;p.assets.push(i);r.owners[i]=p.id;msg(r,p.name+' ซื้อ '+places[i][0])}else s.emit('errorMessage','เครดิตไม่เพียงพอ');r.pending=null;pub(r)});
 s.on('pass',({room})=>{let r=rooms.get(room);if(r&&r.pending?.player===s.id){r.pending=null;pub(r)}});
 s.on('endTurn',({room})=>{let r=rooms.get(room);if(!r||!r.rolled||!current(r,s))return;r.pending=null;advance(r);pub(r)});
 s.on('disconnect',()=>{for(const r of rooms.values()){const p=r.players.find(x=>x.id===s.id);if(p){p.connected=false;msg(r,p.name+' หลุดการเชื่อมต่อ');pub(r)}}});
});
const port=process.env.PORT||3000;server.listen(port,()=>console.log('PM25 Kanchanaburi listening on '+port));
