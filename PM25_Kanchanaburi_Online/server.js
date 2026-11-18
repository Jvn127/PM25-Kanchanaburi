const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:"*"}});
app.use(express.static(__dirname));
app.get('/health',(req,res)=>res.json({ok:true,service:'PM2.5 Kanchanaburi'}));
const rooms=new Map(),GAME_SECONDS=1200,MEETING_THRESHOLDS=[50,100,200,300],MEETING_FEE=300,MEETING_REDUCTION=10,MEETING_CREDITS=10;
const places=[
['จุดเริ่มต้น',0],['สะพานข้ามแม่น้ำแคว',60],['กองกลาง',0],['สุสานทหารสัมพันธมิตร',60],['ค่าธรรมเนียมอุทยาน',100],['รถไฟสายมรณะ',200],['พิพิธภัณฑ์ช่องเขาขาด',100],['โอกาส',0],['น้ำตกไทรโยคน้อย',100],['น้ำตกเอราวัณ',120],['พักสถานี',0],['เขื่อนศรีนครินทร์',140],['กิจกรรมล่องแพ',150],['ถ้ำกระแซ',140],['เมืองมัลลิกา',160],['รถไฟสายมรณะ',200],['วัดถ้ำเสือ',180],['กองกลาง',0],['ต้นจามจุรียักษ์',180],['วัดเมตตาธรรมโพธิญาณ',200],['จุดชมวิว',0],['น้ำตกห้วยแม่ขมิ้น',220],['โอกาส',0],['เขื่อนวชิราลงกรณ',220],['ปิล๊อก–บ้านอีต่อง',240],['รถไฟสายมรณะ',200],['เหมืองปิล็อก',260],['ล่องแพแม่น้ำแคว',150],['สะพานมอญ',260],['เจดีย์พุทธคยา',280],['ไปสถานีพัก',0],['น้ำพุร้อนหินดาด',300],['อุทยานทองผาภูมิ',300],['กองกลาง',0],['อุทยานไทรโยค',320],['รถไฟสายมรณะ',200],['เขาช้างเผือก',350],['โอกาส',0],['อุทยานแห่งชาติเอราวัณ',400],['ภาษีท่องเที่ยว',100]];
const PAWNS=['helmet','flask','recycle','pm25'];
const PAWN_COLORS={helmet:'#8f3f55',flask:'#55a9ed',recycle:'#65cb86',pm25:'#f08a32'};
const colors=PAWNS.map(p=>PAWN_COLORS[p]);
// ทุกพื้นที่ที่ซื้อได้เพิ่ม PM2.5 ระหว่าง 5-12 หน่วย
// ช่องเหมืองปิล็อก (index 26) เป็นพื้นที่พิเศษ เพิ่ม 15 หน่วย
function pollutionFor(i){
 if(i===26)return 15;
 if(!places[i]||places[i][1]<=0||[4,39].includes(i))return 0;
 return 5+((i*7+3)%8);
}
function elapsed(r){return r.startedAt?Math.floor((Date.now()-r.startedAt)/1000):0}
function publicState(r){return {code:r.code,host:r.host,current:r.current,started:r.started,countdown:!!r.countdown,rolled:r.rolled,dice:r.dice,owners:r.owners,players:r.players.map(p=>({...p})),pm25:r.pm25,meeting:r.meeting?{number:r.meeting.number,threshold:r.meeting.threshold,forced:!!r.meeting.forced,answers:r.meeting.answers}:null,pendingOffer:(r.pending&&!r.moving&&r.pending.offerId)?{player:r.pending.player,name:r.pending.name,price:r.pending.price,basePrice:r.pending.basePrice||r.pending.price,type:r.pending.type||'new',ownerName:r.pending.ownerName||null,index:r.pending.index,pollution:r.pending.pollution,cash:r.players.find(p=>p.id===r.pending.player)?.cash??0,offerId:r.pending.offerId||null}:null,elapsedSeconds:Math.min(GAME_SECONDS,elapsed(r))}}
function pub(r){io.to(r.code).emit('state',publicState(r))}
function msg(r,s){io.to(r.code).emit('message',s)}
function current(r,s){return r.players[r.current]&&r.players[r.current].id===s.id}
function advance(r){
 if(!r.players.length||!r.started)return;
 if(r.pendingTimer){clearTimeout(r.pendingTimer);r.pendingTimer=null;}
 r.current=(r.current+1)%r.players.length;
 r.rolled=false;r.dice=null;r.pending=null;r.moving=null;
 r.turnSeq=(r.turnSeq||0)+1;
 pub(r);
 maybeMeetingOrFinish(r);
 pub(r);
}
function completeMovement(r,playerId,turnId){
 if(!r||!r.started||r.moving!==playerId)return false;
 if(turnId!==undefined&&turnId!==r.turnSeq)return false;
 r.moving=null;
 if(r.pending&&r.pending.player===playerId){
  const offer={name:r.pending.name,price:r.pending.price,basePrice:r.pending.basePrice||r.pending.price,type:r.pending.type||'new',ownerName:r.pending.ownerName||null,index:r.pending.index,pollution:r.pending.pollution,cash:r.players.find(p=>p.id===playerId)?.cash??0,offerId:`${r.code}-${playerId}-${r.pending.index}-${Date.now()}`};
  r.pending.offerId=offer.offerId;
  io.to(playerId).emit('purchaseOffer',offer);
  if(r.pendingTimer)clearTimeout(r.pendingTimer);
  const expectedTurn=r.turnSeq;
  r.pendingTimer=setTimeout(()=>{
   if(!r.started||!r.pending||r.pending.player!==playerId||r.turnSeq!==expectedTurn)return;
   msg(r,`${r.players[r.current]?.name||'ผู้เล่น'} ไม่ตอบข้อเสนอซื้อภายในเวลาที่กำหนด ระบบผ่านพื้นที่ให้อัตโนมัติ`);
   advance(r);
  },30000);
  pub(r);return true;
 }
 advance(r);return true;
}
function finishGame(r,reason,instantWinnerId=null){
 if(!r.started)return;
 r.started=false;r.meeting=null;r.moving=null;r.rolled=true;
 if(r.pendingTimer){clearTimeout(r.pendingTimer);r.pendingTimer=null;}
 r.pending=null;
 const sorted=r.players.slice().sort((a,b)=>b.cash-a.cash||b.credits-a.credits);
 let winners=[];
 if(instantWinnerId){
  const winner=r.players.find(p=>p.id===instantWinnerId);
  if(winner)winners=[winner];
 }else{
  // แสดงผู้ชนะเพียงคนเดียว: เงินมากที่สุด แล้วใช้เครดิตตัดสิน; หากเสมอสนิทใช้ลำดับผู้เล่นในห้อง
  if(sorted[0])winners=[sorted[0]];
 }
 const winnerRule=instantWinnerId?'เครดิตครบ 50 ชนะทันที':'เงินคงเหลือมากที่สุด หากเงินเท่ากันใช้เครดิตตัดสิน';
 io.to(r.code).emit('gameOver',{
  winners:winners.map(p=>p.name),
  winnerId:winners[0]?.id||null,
  winnerName:winners[0]?.name||'',
  cash:winners[0]?.cash||0,
  credits:winners[0]?.credits||0,
  reason,
  winnerRule,
  instant:!!instantWinnerId,
  standings:sorted.map(p=>({id:p.id,name:p.name,cash:p.cash,credits:p.credits,assets:p.assets.length}))
 });
 msg(r,reason||'จบเกม');pub(r);
}
function charge(r,p,n,reason){const amount=Math.min(p.cash,n);p.cash-=amount;msg(r,`${p.name} จ่าย ${amount} บาท (${reason})`)}
function credit(r,p,n,reason){p.cash+=n;msg(r,`${p.name} ได้รับ ${n} บาท (${reason})`)}
function beginMeeting(r,number,threshold){
 if(!r.started||r.meeting)return;
 r.meetingCount=(r.meetingCount||0)+1;
 const forced=threshold===60;
 r.meeting={number,threshold,forced,answers:{}};
 io.to(r.code).emit('meetingStart',{number,threshold,forced,fee:MEETING_FEE,reduction:MEETING_REDUCTION,credits:MEETING_CREDITS});
 msg(r,forced
  ? '⚠️ PM2.5 ถึง 60 หน่วยแล้ว การประชุมรอบนี้บังคับยืนยันมาตรการ'
  : `⚠️ PM2.5 ถึง ${threshold} หน่วยแล้ว จะจัดการประชุมรอบที่ ${number}`);
 pub(r);
}
function maybeMeetingOrFinish(r){
 const e=elapsed(r);
 if(e>=GAME_SECONDS){finishGame(r,'หมดเวลา 20 นาที');return}
 if(!r.meeting&&r.pm25>=(r.nextMeetingThreshold||50)){
  beginMeeting(r,(r.meetingCount||0)+1,r.nextMeetingThreshold||50);
 }
}
// คำนวณเกณฑ์ประชุมครั้งถัดไปโดยต้องมากกว่า PM2.5 ปัจจุบันเสมอ
// ป้องกันการเปิดประชุมซ้ำทันทีหลังผู้เล่นทุกคนปฏิเสธหรือไม่มีเงินยืนยัน
function calculateNextMeetingThreshold(oldThreshold,confirmations,currentPm25){
 const pm=Math.max(0,Number(currentPm25)||0);
 const threshold=Number(oldThreshold)||50;
 if(confirmations===0){
  // คงกติกาเดิม: ถ้าไม่มีใครยืนยันในรอบ 50 ให้มีรอบบังคับที่ 60
  if(threshold===50)return 60;
  // หลังรอบบังคับ 60 หรือรอบถัด ๆ ไป ต้องตั้งเกณฑ์สูงกว่า PM ปัจจุบัน
  // เพื่อไม่ให้เปิดหน้าประชุมซ้ำทันทีจนผู้เล่นไม่มีโอกาสทอยเต๋า
  return Math.max(threshold+10,pm+1,70);
 }
 // หาก PM หลังลดฝุ่นยังตั้งแต่ 50 ขึ้นไป ให้รอจนค่าเพิ่มขึ้นอีกก่อนเปิดประชุมใหม่
 return pm<50?50:pm+1;
}
function finishMeetingIfReady(r){
 const meeting=r?.meeting;
 if(!meeting||!r.started)return false;
 const activePlayers=r.players.filter(p=>p.connected!==false);
 const allAnswered=activePlayers.every(p=>Object.prototype.hasOwnProperty.call(meeting.answers,p.id));
 if(!allAnswered)return false;

 const confirmations=activePlayers.filter(p=>meeting.answers[p.id]==='confirm').length;
 const oldThreshold=meeting.threshold;
 const reduction=confirmations*MEETING_REDUCTION;
 if(reduction>0){
  r.pm25=Math.max(0,r.pm25-reduction);
  msg(r,`ผู้เล่นยืนยัน ${confirmations} คน ลดค่า PM2.5 รวม ${reduction} หน่วย`);
 }else{
  msg(r,'ไม่มีผู้เล่นยืนยันมาตรการ ค่า PM2.5 จึงคงเดิม');
 }
 r.meetingsDone.push(meeting.number);
 r.meeting=null;
 r.rolled=false;r.dice=null;r.pending=null;r.moving=null;
 if(r.pendingTimer){clearTimeout(r.pendingTimer);r.pendingTimer=null;}
 r.nextMeetingThreshold=calculateNextMeetingThreshold(oldThreshold,confirmations,r.pm25);

 if(elapsed(r)>=GAME_SECONDS){finishGame(r,'หมดเวลา 20 นาที');return true;}
 io.to(r.code).emit('meetingEnd',{number:meeting.number,confirmations,reduction,pm25:r.pm25,nextThreshold:r.nextMeetingThreshold});
 msg(r,'ผู้เล่นตอบครบแล้ว กลับเข้าสู่เกม สามารถทอยลูกเต๋าต่อได้');
 // ตรวจเกณฑ์อีกครั้งหลังตั้ง threshold ใหม่ หากยังเกิน PM ปัจจุบัน เกมจะไม่เปิดประชุมค้างซ้ำ
 maybeMeetingOrFinish(r);
 pub(r);
 return true;
}
function land(r,p){
 const i=p.pos,[name,price]=places[i];msg(r,`${p.name} มาถึง ${name}`);
 if(i===0){return}
 if([2,17,33,7,22,37].includes(i)){const n=[100,-50,150,-100,200][Math.floor(Math.random()*5)];n>0?credit(r,p,n,'กิจกรรมชุมชน'):charge(r,p,-n,'กิจกรรมชุมชน');return}
 if([4,39].includes(i)){charge(r,p,price,'ค่าธรรมเนียม');return}
 if(i===30){p.pos=10;msg(r,p.name+' ถูกส่งไปพักที่สถานี');return}
 if(!price)return;
 if(r.owners[i]===undefined){r.pending={player:p.id,index:i,name,price,pollution:pollutionFor(i)};return}
 if(r.owners[i]!==p.id){
  const owner=r.players.find(x=>x.id===r.owners[i]);
  if(owner){
   r.pending={player:p.id,index:i,name,price:Math.ceil(price*1.3),basePrice:price,pollution:pollutionFor(i),type:'buyout',ownerId:owner.id,ownerName:owner.name};
   msg(r,`${p.name} มีโอกาสซื้อแย่ง ${owner.name} ในราคาเพิ่ม 30%`);
  }
 }
}
io.on('connection',s=>{
 s.on('create',({name,pawn})=>{
  if(!PAWNS.includes(pawn))return s.emit('errorMessage','กรุณาเลือกตัวหมากก่อนสร้างห้อง');
  const code=Math.random().toString(36).slice(2,8).toUpperCase();
  const p={id:s.id,name:String(name||'Engineer').slice(0,20),pawn,color:PAWN_COLORS[pawn],cash:1500,credits:0,pos:0,assets:[],alive:true,connected:true};
  const r={code,host:s.id,players:[p],current:0,started:false,countdown:false,startedAt:null,rolled:false,dice:null,moving:null,turnSeq:0,pendingTimer:null,owners:{},pending:null,pm25:0,meeting:null,meetingsDone:[],meetingCount:0,nextMeetingThreshold:50};
  rooms.set(code,r);s.join(code);s.emit('message','สร้างห้องแล้ว! แชร์รหัสห้อง '+code+' ให้เพื่อน');pub(r);
 });
 s.on('checkRoom',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r)return s.emit('errorMessage','ไม่พบห้องนี้');
  if(r.started||r.countdown)return s.emit('errorMessage','เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้');
  s.emit('roomInfo',{code:r.code,takenPawns:r.players.map(p=>p.pawn),players:r.players.map(p=>({name:p.name,pawn:p.pawn}))});
 });
 s.on('join',({room,name,pawn})=>{
  const r=rooms.get(String(room||'').toUpperCase());if(!r)return s.emit('errorMessage','ไม่พบห้องนี้');
  if(r.started||r.countdown)return s.emit('errorMessage','เกมกำลังเริ่มหรือเริ่มแล้ว ไม่สามารถเข้าร่วมได้');
  if(r.players.length>=4)return s.emit('errorMessage','ห้องเต็มแล้ว (สูงสุด 4 คน)');
  if(!PAWNS.includes(pawn))return s.emit('errorMessage','กรุณาเลือกตัวหมาก');
  if(r.players.some(p=>p.id===s.id))return;
  if(r.players.some(p=>p.pawn===pawn))return s.emit('pawnUnavailable',{takenPawns:r.players.map(p=>p.pawn),message:'ตัวหมากนี้มีผู้เล่นเลือกแล้ว กรุณาเลือกตัวอื่น'});
  const p={id:s.id,name:String(name||'Engineer').slice(0,20),pawn,color:PAWN_COLORS[pawn],cash:1500,credits:0,pos:0,assets:[],alive:true,connected:true};
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
   r.countdown=false;r.started=true;r.startedAt=Date.now();r.current=0;r.rolled=false;r.dice=null;
   msg(r,'เริ่มเกมแล้ว! เวลาเล่น 20 นาที เริ่มต้นคนละ 1,500 บาท');pub(r);
  },3000);
 });
 s.on('roll',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());if(!r||!r.started||r.meeting||r.rolled||r.pending||r.moving||!current(r,s))return;
  maybeMeetingOrFinish(r);if(!r.started||r.meeting)return;
  const p=r.players[r.current],a=1+Math.floor(Math.random()*6),b=1+Math.floor(Math.random()*6),old=p.pos;
  const steps=a+b;
  r.dice=[['','⚀','⚁','⚂','⚃','⚄','⚅'][a],['','⚀','⚁','⚂','⚃','⚄','⚅'][b]];
  const crossedStart=(old+steps)>=40;
  p.pos=(old+steps)%40;
  if(crossedStart)credit(r,p,300,'ผ่านจุดเริ่มต้น');
  r.rolled=true;r.moving=p.id;r.turnSeq=(r.turnSeq||0)+1;const turnId=r.turnSeq;land(r,p);
  io.to(r.code).emit('playerMoved',{playerId:p.id,from:old,to:p.pos,steps:a+b,dice:r.dice,turnId});
  pub(r);
  setTimeout(()=>completeMovement(r,p.id,turnId),15000);
 });
 s.on('movementComplete',({room,turnId})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r||!current(r,s))return;
  completeMovement(r,s.id,turnId);
 });
 s.on('buy',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());if(!r||!r.started||r.meeting||!r.pending||r.moving||r.pending.player!==s.id||!current(r,s))return;
  const p=r.players.find(x=>x.id===s.id),pending=r.pending,i=pending.index,price=pending.price;
  // ป้องกันคำสั่งซื้อซ้ำระหว่างรอผู้เล่นกดยืนยันรับทราบข้อความเงินไม่เพียงพอ
  if(pending.awaitingFailureAck)return;
  if(p.cash<price){
   // ไม่หักเงิน ไม่เปลี่ยนเจ้าของ และคงข้อเสนอไว้จนกว่าจะกดรับทราบหรือหมดเวลา
   r.pending.awaitingFailureAck=true;
   s.emit('purchaseResult',{success:false,name:places[i][0],message:'เงินของท่านไม่เพียงพอ'});
   return;
  }
  p.cash-=price;
  if(pending.type==='buyout'){
   const previousOwner=r.players.find(x=>x.id===pending.ownerId);
   if(previousOwner){previousOwner.cash+=price;previousOwner.assets=previousOwner.assets.filter(x=>x!==i);}
   r.owners[i]=p.id;if(!p.assets.includes(i))p.assets.push(i);
   const addedPollution=pollutionFor(i);
   r.pm25+=addedPollution;
   msg(r,`${p.name} ซื้อแย่ง ${places[i][0]} จาก ${pending.ownerName} ในราคา ${price.toLocaleString()} บาท (เพิ่ม 30% จากราคาเดิม) และเพิ่ม PM2.5 ${addedPollution} หน่วย`);
   s.emit('purchaseResult',{success:true,name:places[i][0],buyout:true,price,pollution:addedPollution});
  }else{
   p.assets.push(i);r.owners[i]=p.id;r.pm25+=pollutionFor(i);
   msg(r,`${p.name} ซื้อ ${places[i][0]} และเพิ่ม PM2.5 ${pollutionFor(i)} หน่วย`);
   s.emit('purchaseResult',{success:true,name:places[i][0],price});
  }
  advance(r);
 });
 s.on('purchaseFailureAcknowledge',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r||!r.pending||r.pending.player!==s.id||!r.pending.awaitingFailureAck||!current(r,s))return;
  msg(r,r.players[r.current].name+' ซื้อพื้นที่ไม่สำเร็จ เนื่องจากเงินไม่เพียงพอ');
  advance(r);
 });
 s.on('pass',({room})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r||!r.started||r.meeting||!r.pending||r.moving||r.pending.player!==s.id||!current(r,s))return;
  const pending=r.pending,p=r.players[r.current];
  if(pending.type==='buyout'){
   const owner=r.players.find(x=>x.id===pending.ownerId);
   const damage=Math.ceil(pending.basePrice/2),paid=Math.min(p.cash,damage);
   p.cash-=paid;if(owner)owner.cash+=paid;
   msg(r,`${p.name} ไม่ซื้อแย่งพื้นที่ จ่ายค่าเสียหาย ${paid} บาทให้ ${owner?.name||'เจ้าของเดิม'}`);
  }else msg(r,p.name+' ผ่านการซื้อ');
  advance(r);
 });
 s.on('meetingAnswer',({room,answer})=>{
  const r=rooms.get(String(room||'').toUpperCase());
  if(!r||!r.meeting){
   s.emit('meetingAnswerResult',{ok:false,message:'ไม่พบการประชุมที่กำลังดำเนินอยู่'});
   return;
  }
  if(r.meeting.answers[s.id]){
   s.emit('meetingAnswerResult',{ok:false,message:'คุณส่งคำตอบสำหรับการประชุมนี้ไปแล้ว'});
   return;
  }
  const p=r.players.find(x=>x.id===s.id);
  if(!p){
   s.emit('meetingAnswerResult',{ok:false,message:'ไม่พบข้อมูลผู้เล่นในห้องนี้'});
   return;
  }
  const forced=!!r.meeting.forced;
  const cash=Number(p.cash)||0;
  if(answer==='confirm'){
   // ตรวจสอบเงินจากฝั่งเซิร์ฟเวอร์เสมอ ป้องกันการส่งคำสั่งยืนยันเมื่อเงินไม่ถึง 300 บาท
   if(cash<MEETING_FEE){
    s.emit('meetingAnswerResult',{ok:false,message:'เงินไม่เพียงพอ ต้องมีอย่างน้อย 300 บาทเพื่อยืนยันมาตรการ',cash,required:MEETING_FEE});
    return;
   }
   p.cash-=MEETING_FEE;p.credits+=MEETING_CREDITS;
   msg(r,`${p.name} ยืนยันมาตรการ: จ่าย 300 บาท ได้เครดิต +10`);
   if(p.credits>=50){
    finishGame(r,`${p.name} มีเครดิตครบ 50 คะแนน ชนะทันที`,p.id);
    return;
   }
  }else if(answer==='reject'&&!forced){
   msg(r,`${p.name} ปฏิเสธมาตรการ: ไม่เสียเงินและเครดิตคงเดิม`);
  }else if(answer==='unable'&&forced&&cash<MEETING_FEE){
   msg(r,`${p.name} ไม่มีเงินพอสำหรับการยืนยัน ระบบบันทึกว่าไม่สามารถร่วมจ่ายได้`);
  }else{
   s.emit('meetingAnswerResult',{ok:false,message:'คำตอบนี้ไม่สามารถใช้ได้ในการประชุมรอบนี้',cash,required:MEETING_FEE});
   return;
  }
  r.meeting.answers[s.id]=answer;
  pub(r);
  // ตอบกลับหลังเซิร์ฟเวอร์บันทึกคำตอบแล้วเท่านั้น เพื่อไม่ให้หน้าเกมแสดงว่ายืนยันสำเร็จล่วงหน้า
  s.emit('meetingAnswerResult',{ok:true,answer,cash:p.cash,credits:p.credits});
  finishMeetingIfReady(r);
 });
 s.on('disconnect',()=>{
 for(const r of rooms.values()){
  const p=r.players.find(x=>x.id===s.id);
  if(!p)continue;
  p.connected=false;msg(r,p.name+' หลุดการเชื่อมต่อ');
  if(r.meeting){
   finishMeetingIfReady(r);
   pub(r);
   continue;
  }
  if(r.started&&current(r,s)){
   if(r.pending&&r.pending.player===s.id){msg(r,p.name+' หลุดระหว่างเลือกซื้อ ระบบผ่านพื้นที่ให้อัตโนมัติ');advance(r);}
   else if(r.moving===s.id&&r.pending&&r.pending.player===s.id){r.moving=null;msg(r,p.name+' หลุดระหว่างเดิน ระบบผ่านพื้นที่ให้อัตโนมัติ');advance(r);}
   else if(r.moving===s.id){completeMovement(r,s.id,r.turnSeq);}
  }else pub(r);
 }
});
});
setInterval(()=>{for(const r of rooms.values())if(r.started){maybeMeetingOrFinish(r);io.to(r.code).emit('timerTick',{elapsedSeconds:Math.min(GAME_SECONDS,elapsed(r)),pm25:r.pm25})}},1000);
const port=process.env.PORT||3000;server.listen(port,()=>console.log('PM25 Kanchanaburi listening on '+port));
