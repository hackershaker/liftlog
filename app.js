const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);
const todayKey=()=>new Date().toISOString().slice(0,10);
const fmtDate=(iso)=>new Date(iso).toLocaleDateString("ko-KR",{month:"short",day:"numeric"});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

const seedExercises=[
 {id:"bench",name:"Bench Press",type:"weight_reps",primary:["가슴"],secondary:["삼두","전면어깨"]},
 {id:"incline_db",name:"Incline Dumbbell Press",type:"weight_reps",primary:["가슴"],secondary:["삼두","전면어깨"]},
 {id:"squat",name:"Barbell Squat",type:"weight_reps",primary:["대퇴사두"],secondary:["둔근","햄스트링","코어"]},
 {id:"deadlift",name:"Deadlift",type:"weight_reps",primary:["햄스트링","둔근","등"],secondary:["전완","코어"]},
 {id:"lat_pulldown",name:"Lat Pulldown",type:"weight_reps",primary:["광배"],secondary:["이두","후면어깨"]},
 {id:"row",name:"Barbell Row",type:"weight_reps",primary:["등"],secondary:["이두","후면어깨"]},
 {id:"ohp",name:"Overhead Press",type:"weight_reps",primary:["어깨"],secondary:["삼두","코어"]},
 {id:"curl",name:"Dumbbell Curl",type:"weight_reps",primary:["이두"],secondary:["전완"]},
 {id:"triceps_pd",name:"Triceps Pushdown",type:"weight_reps",primary:["삼두"],secondary:[]},
 {id:"plank",name:"Plank",type:"time",primary:["코어"],secondary:["어깨"]},
 {id:"treadmill",name:"Treadmill",type:"time_distance",primary:["유산소"],secondary:["하체"]}
];

const defaultState={
 version:1,
 settings:{setRest:45,exerciseRest:60,unit:"kg",secondaryFactor:0.5},
 exercises:seedExercises,
 routines:[],
 sessions:[],
 active:null
};

function load(){
 try{
  const s=JSON.parse(localStorage.getItem("liftlog-state"));
  if(!s) return structuredClone(defaultState);
  return {...structuredClone(defaultState),...s,settings:{...defaultState.settings,...(s.settings||{})}};
 }catch{return structuredClone(defaultState)}
}
let state=load(), currentTab="workout", timerId=null, toastTimer=null;

function save(){localStorage.setItem("liftlog-state",JSON.stringify(state))}
function toast(msg){
 let t=$(".toast"); if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t)}
 t.textContent=msg; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.remove(),1800)
}
function app(){return $("#app")}

function nav(){
 return `<nav class="tabs"><div class="tabs-inner">
 ${[["workout","운동"],["routines","루틴"],["stats","통계"],["settings","설정"]].map(([id,n])=>
 `<button class="tab ${currentTab===id?"active":""}" data-tab="${id}">${n}</button>`).join("")}
 </div></nav>`
}
function render(){
 if(currentTab==="workout") renderWorkout();
 if(currentTab==="routines") renderRoutines();
 if(currentTab==="stats") renderStats();
 if(currentTab==="settings") renderSettings();
 $$(".tab").forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;render()});
 if(state.active) syncTimer();
}
function top(title,sub=""){return `<div class="topbar"><div><h1>${title}</h1>${sub?`<div class="subtitle">${sub}</div>`:""}</div></div>`}

function renderWorkout(){
 const active=state.active;
 let body=top("운동",active?"진행 중인 세션":"오늘의 운동을 시작하세요");
 if(active){
  body+=timerView();
  body+=`<div class="card row between"><div><strong>${active.name}</strong><div class="small">${fmtDate(active.startedAt)} · ${durationMin(active.startedAt)}분</div></div><button id="finishBtn">운동 종료</button></div>`;
  active.exercises.forEach((x,xi)=>body+=exerciseCard(x,xi));
  body+=`<button class="fab" id="addExBtn">+</button>`;
 }else{
  if(state.sessions.length){
   const last=state.sessions[0];
   body+=`<div class="card"><div class="row between"><div><div class="small">최근 운동</div><div class="exercise-title">${last.name}</div><div class="exercise-meta">${fmtDate(last.endedAt||last.startedAt)} · ${Math.round(sessionVolume(last)).toLocaleString()} kg Volume</div></div><button class="secondary" id="editLast">보기</button></div></div>`;
  }
  body+=`<div class="card"><h3 style="margin-top:0">빠른 시작</h3><button id="quickStart" style="width:100%">빈 운동 시작</button></div>`;
  body+=`<div class="card"><h3 style="margin-top:0">루틴에서 시작</h3>`;
  body+=state.routines.length?state.routines.map(r=>`<div class="routine-item"><div><strong>${r.name}</strong><div class="small">${r.exercises.length}개 운동</div></div><button class="secondary startRoutine" data-id="${r.id}">시작</button></div><div class="sep"></div>`).join(""):`<div class="empty">저장된 루틴이 없습니다.</div>`;
  body+=`</div>`;
 }
 app().innerHTML=`<main class="shell">${body}</main>${nav()}`;
 if(active){
  $("#finishBtn").onclick=finishWorkout; $("#addExBtn").onclick=()=>openExercisePicker("active");
  bindSetInputs();
 }else{
  $("#quickStart").onclick=()=>startWorkout(null);
  $$(".startRoutine").forEach(b=>b.onclick=()=>startWorkout(b.dataset.id));
  $("#editLast")?.addEventListener("click",()=>openSessionEditor(state.sessions[0].id));
 }
}

function timerView(){
 const t=state.active?.timer;
 if(!t || !t.end) return "";
 const left=Math.max(0,Math.ceil((t.end-Date.now())/1000));
 return `<div class="timer"><div><div class="small">휴식 타이머</div><strong id="timerText">${left}s</strong></div><div class="row"><button class="secondary" id="minus15">-15</button><button class="secondary" id="plus15">+15</button><button class="ghost" id="skipTimer">건너뜀</button></div></div>`
}
function syncTimer(){
 clearInterval(timerId);
 const t=state.active?.timer;
 if(!t?.end) return;
 const tick=()=>{
  const el=$("#timerText"); if(!state.active?.timer?.end){clearInterval(timerId);return}
  const left=Math.max(0,Math.ceil((state.active.timer.end-Date.now())/1000));
  if(el) el.textContent=left+"s";
  if(left<=0){state.active.timer=null;save();clearInterval(timerId);toast("휴식 종료");renderWorkout()}
 };
 tick(); timerId=setInterval(tick,500);
 $("#minus15")?.addEventListener("click",()=>{state.active.timer.end-=15000;save();syncTimer()});
 $("#plus15")?.addEventListener("click",()=>{state.active.timer.end+=15000;save();syncTimer()});
 $("#skipTimer")?.addEventListener("click",()=>{state.active.timer=null;save();renderWorkout()});
}
function durationMin(start){return Math.max(1,Math.round((Date.now()-new Date(start).getTime())/60000))}

function exerciseCard(x,xi){
 const ex=state.exercises.find(e=>e.id===x.exerciseId)||{name:x.name,type:x.type,primary:[],secondary:[]};
 const isTime=ex.type==="time", isTD=ex.type==="time_distance";
 let head=isTime?["SET","시간(초)","메모","✓"]:isTD?["SET","시간(분)","거리(km)","✓"]:["SET",state.settings.unit.toUpperCase(),"REPS","✓"];
 return `<section class="card" data-ex="${xi}">
 <div class="row between"><div><div class="exercise-title">${ex.name}</div><div class="exercise-meta">${[...(ex.primary||[])].join(", ")}${ex.secondary?.length?" · 보조 "+ex.secondary.join(", "):""}</div></div><button class="ghost removeEx" data-x="${xi}">삭제</button></div>
 <div class="set-head">${head.map(h=>`<div>${h}</div>`).join("")}</div>
 ${x.sets.map((s,si)=>setRow(ex,s,xi,si)).join("")}
 <div class="row" style="margin-top:10px"><button class="secondary addSet" data-x="${xi}">+ 세트</button><div class="small">세트 휴식 ${x.setRest??state.settings.setRest}초</div></div>
 </section>`
}
function setRow(ex,s,xi,si){
 if(ex.type==="time") return `<div class="set-row"><div class="set-index">${si+1}</div><input inputmode="numeric" data-f="seconds" data-x="${xi}" data-s="${si}" value="${s.seconds??60}"><input data-f="note" data-x="${xi}" data-s="${si}" value="${s.note||""}" placeholder="메모"><button class="check ${s.done?"done":""}" data-check data-x="${xi}" data-s="${si}">✓</button></div>`;
 if(ex.type==="time_distance") return `<div class="set-row"><div class="set-index">${si+1}</div><input inputmode="decimal" data-f="minutes" data-x="${xi}" data-s="${si}" value="${s.minutes??20}"><input inputmode="decimal" data-f="distance" data-x="${xi}" data-s="${si}" value="${s.distance??0}"><button class="check ${s.done?"done":""}" data-check data-x="${xi}" data-s="${si}">✓</button></div>`;
 return `<div class="set-row"><div class="set-index">${si+1}</div><input inputmode="decimal" data-f="weight" data-x="${xi}" data-s="${si}" value="${s.weight??0}"><input inputmode="numeric" data-f="reps" data-x="${xi}" data-s="${si}" value="${s.reps??10}"><button class="check ${s.done?"done":""}" data-check data-x="${xi}" data-s="${si}">✓</button></div>`
}
function bindSetInputs(){
 $$("[data-f]").forEach(inp=>inp.onchange=()=>{
  const s=state.active.exercises[+inp.dataset.x].sets[+inp.dataset.s];
  s[inp.dataset.f]=inp.dataset.f==="note"?inp.value:Number(inp.value||0);save()
 });
 $$("[data-check]").forEach(b=>b.onclick=()=>{
  const xi=+b.dataset.x,si=+b.dataset.s,s=state.active.exercises[xi].sets[si];
  s.done=!s.done;s.completedAt=s.done?new Date().toISOString():null;
  if(s.done){
   state.active.timer={end:Date.now()+((state.active.exercises[xi].setRest??state.settings.setRest)*1000)};
  }
  save();renderWorkout()
 });
 $$(".addSet").forEach(b=>b.onclick=()=>{
  const x=state.active.exercises[+b.dataset.x],ex=state.exercises.find(e=>e.id===x.exerciseId);
  const prev=x.sets[x.sets.length-1]||{};
  x.sets.push(ex.type==="time"?{seconds:prev.seconds||60,done:false}:ex.type==="time_distance"?{minutes:prev.minutes||20,distance:prev.distance||0,done:false}:{weight:prev.weight||0,reps:prev.reps||10,done:false});
  save();renderWorkout()
 });
 $$(".removeEx").forEach(b=>b.onclick=()=>{
  state.active.exercises.splice(+b.dataset.x,1);save();renderWorkout()
 });
}
function startWorkout(routineId){
 let r=state.routines.find(x=>x.id===routineId);
 state.active={
  id:uid(),name:r?.name||"자유 운동",startedAt:new Date().toISOString(),timer:null,
  exercises:(r?.exercises||[]).map(x=>({exerciseId:x.exerciseId,setRest:x.setRest??state.settings.setRest,exerciseRest:x.exerciseRest??state.settings.exerciseRest,sets:Array.from({length:x.sets||3},()=>({weight:0,reps:x.targetReps||10,done:false}))}))
 };
 save();renderWorkout()
}
function finishWorkout(){
 if(!state.active) return;
 const s={...state.active,endedAt:new Date().toISOString()};
 state.sessions.unshift(s);state.active=null;save();toast("운동을 저장했습니다");renderWorkout()
}

function renderRoutines(){
 let body=top("루틴","무제한으로 만들고 수정할 수 있습니다");
 body+=state.routines.length?state.routines.map(r=>`<div class="card routine-item"><div><h3>${r.name}</h3><div class="small">${r.exercises.length}개 운동 · 세트 휴식 기본 ${state.settings.setRest}초</div></div><div class="row"><button class="secondary editRoutine" data-id="${r.id}">편집</button><button class="startRoutine" data-id="${r.id}">시작</button></div></div>`).join(""):`<div class="card empty">루틴을 하나 만들어보세요.</div>`;
 body+=`<button class="fab" id="newRoutine">+</button>`;
 app().innerHTML=`<main class="shell">${body}</main>${nav()}`;
 $("#newRoutine").onclick=()=>openRoutineEditor();
 $$(".editRoutine").forEach(b=>b.onclick=()=>openRoutineEditor(b.dataset.id));
 $$(".startRoutine").forEach(b=>b.onclick=()=>{startWorkout(b.dataset.id);currentTab="workout"});
}

function openRoutineEditor(id=null){
 let r=id?state.routines.find(x=>x.id===id):{id:uid(),name:"새 루틴",exercises:[]};
 const modal=document.createElement("div");modal.className="modal";
 modal.innerHTML=`<div class="sheet"><h2>${id?"루틴 편집":"새 루틴"}</h2>
 <label>루틴 이름</label><input id="rName" value="${r.name}">
 <div class="sep"></div><div id="rExList"></div>
 <button class="secondary" id="rAddEx" style="width:100%">+ 운동 추가</button>
 <div class="modal-actions"><button class="secondary" id="cancel">취소</button>${id?`<button class="danger" id="deleteR">삭제</button>`:""}<button id="saveR">저장</button></div></div>`;
 document.body.appendChild(modal);
 const draft=structuredClone(r);
 function draw(){
  $("#rExList",modal).innerHTML=draft.exercises.map((x,i)=>{
   const ex=state.exercises.find(e=>e.id===x.exerciseId);
   return `<div class="card"><div class="row between"><strong>${ex?.name||"운동"}</strong><button class="ghost rDel" data-i="${i}">삭제</button></div>
   <div class="grid3"><div><label>세트 수</label><input class="rField" data-i="${i}" data-f="sets" type="number" min="1" value="${x.sets||3}"></div>
   <div><label>목표 reps</label><input class="rField" data-i="${i}" data-f="targetReps" type="number" min="1" value="${x.targetReps||10}"></div>
   <div><label>세트 휴식(초)</label><input class="rField" data-i="${i}" data-f="setRest" type="number" min="0" value="${x.setRest??state.settings.setRest}"></div></div>
   <div style="margin-top:8px"><label>다음 운동 전 휴식(초)</label><input class="rField" data-i="${i}" data-f="exerciseRest" type="number" min="0" value="${x.exerciseRest??state.settings.exerciseRest}"></div></div>`
  }).join("")||`<div class="empty">운동이 없습니다.</div>`;
  $$(".rDel",modal).forEach(b=>b.onclick=()=>{draft.exercises.splice(+b.dataset.i,1);draw()});
  $$(".rField",modal).forEach(inp=>inp.onchange=()=>draft.exercises[+inp.dataset.i][inp.dataset.f]=Number(inp.value||0));
 }
 draw();
 $("#rAddEx",modal).onclick=()=>openExercisePicker("routine",(exerciseId)=>{draft.exercises.push({exerciseId,sets:3,targetReps:10,setRest:state.settings.setRest,exerciseRest:state.settings.exerciseRest});draw()});
 $("#cancel",modal).onclick=()=>modal.remove();
 $("#saveR",modal).onclick=()=>{
  draft.name=$("#rName",modal).value.trim()||"루틴";
  if(id) state.routines[state.routines.findIndex(x=>x.id===id)]=draft; else state.routines.push(draft);
  save();modal.remove();renderRoutines()
 };
 $("#deleteR",modal)?.addEventListener("click",()=>{state.routines=state.routines.filter(x=>x.id!==id);save();modal.remove();renderRoutines()});
}

function openExercisePicker(mode,onPick){
 const modal=document.createElement("div");modal.className="modal";
 modal.innerHTML=`<div class="sheet"><h2>운동 선택</h2><input id="exSearch" placeholder="운동 검색"><div id="exResults" style="margin-top:10px"></div><div class="modal-actions"><button class="secondary" id="close">닫기</button><button id="customEx">커스텀 운동</button></div></div>`;
 document.body.appendChild(modal);
 function draw(q=""){
  const xs=state.exercises.filter(e=>e.name.toLowerCase().includes(q.toLowerCase()));
  $("#exResults",modal).innerHTML=xs.map(e=>`<button class="secondary pickEx" data-id="${e.id}" style="width:100%;text-align:left;margin:4px 0">${e.name}<div class="small">${e.primary.join(", ")}</div></button>`).join("");
  $$(".pickEx",modal).forEach(b=>b.onclick=()=>{
   const id=b.dataset.id; modal.remove();
   if(onPick) onPick(id); else {state.active.exercises.push({exerciseId:id,setRest:state.settings.setRest,exerciseRest:state.settings.exerciseRest,sets:[{weight:0,reps:10,done:false},{weight:0,reps:10,done:false},{weight:0,reps:10,done:false}]});save();renderWorkout()}
  });
 }
 draw(); $("#exSearch",modal).oninput=e=>draw(e.target.value); $("#close",modal).onclick=()=>modal.remove();
 $("#customEx",modal).onclick=()=>{modal.remove();openCustomExercise(mode,onPick)}
}
function openCustomExercise(mode,onPick){
 const modal=document.createElement("div");modal.className="modal";
 modal.innerHTML=`<div class="sheet"><h2>커스텀 운동</h2>
 <label>운동명</label><input id="cName">
 <label style="margin-top:10px">기록 방식</label><select id="cType"><option value="weight_reps">중량 + reps</option><option value="time">시간</option><option value="time_distance">시간 + 거리</option></select>
 <label style="margin-top:10px">주동근 (쉼표 구분)</label><input id="cPrimary" placeholder="예: 가슴">
 <label style="margin-top:10px">보조근 (쉼표 구분)</label><input id="cSecondary" placeholder="예: 삼두, 전면어깨">
 <div class="modal-actions"><button class="secondary" id="cancel">취소</button><button id="saveC">저장</button></div></div>`;
 document.body.appendChild(modal); $("#cancel",modal).onclick=()=>modal.remove();
 $("#saveC",modal).onclick=()=>{
  const ex={id:uid(),name:$("#cName",modal).value.trim()||"커스텀 운동",type:$("#cType",modal).value,primary:$("#cPrimary",modal).value.split(",").map(s=>s.trim()).filter(Boolean),secondary:$("#cSecondary",modal).value.split(",").map(s=>s.trim()).filter(Boolean)};
  state.exercises.push(ex);save();modal.remove();
  if(onPick) onPick(ex.id); else {state.active.exercises.push({exerciseId:ex.id,setRest:state.settings.setRest,exerciseRest:state.settings.exerciseRest,sets:[{weight:0,reps:10,done:false}]});save();renderWorkout()}
 }
}

function sessionVolume(s){
 let v=0;(s.exercises||[]).forEach(x=>{const ex=state.exercises.find(e=>e.id===x.exerciseId); if(ex?.type!=="weight_reps") return;(x.sets||[]).forEach(a=>{if(a.done!==false)v+=(+a.weight||0)*(+a.reps||0)})});return v
}
function muscleLoad(sessions){
 const m={}; sessions.forEach(s=>(s.exercises||[]).forEach(x=>{
  const ex=state.exercises.find(e=>e.id===x.exerciseId); if(!ex) return;
  const done=(x.sets||[]).filter(a=>a.done!==false).length;
  (ex.primary||[]).forEach(k=>m[k]=(m[k]||0)+done);
  (ex.secondary||[]).forEach(k=>m[k]=(m[k]||0)+done*state.settings.secondaryFactor);
 })); return m
}
function weekStart(d=new Date()){const x=new Date(d);const day=(x.getDay()+6)%7;x.setHours(0,0,0,0);x.setDate(x.getDate()-day);return x}
function sessionsInRange(from,to){return state.sessions.filter(s=>{const d=new Date(s.startedAt);return d>=from&&d<to})}

function renderStats(){
 const now=new Date(),ws=weekStart(now),we=new Date(ws);we.setDate(we.getDate()+7);
 const ms=new Date(now.getFullYear(),now.getMonth(),1),me=new Date(now.getFullYear(),now.getMonth()+1,1);
 const week=sessionsInRange(ws,we),month=sessionsInRange(ms,me);
 const totalVol=state.sessions.reduce((a,s)=>a+sessionVolume(s),0);
 let body=top("통계","운동 기록을 기반으로 자동 계산");
 body+=`<div class="grid3"><div class="metric"><div class="v">${Math.round(totalVol).toLocaleString()}</div><div class="k">총 Volume (kg)</div></div>
 <div class="metric"><div class="v">${week.length}</div><div class="k">이번 주 운동</div></div>
 <div class="metric"><div class="v">${month.length}</div><div class="k">이번 달 운동</div></div></div>`;
 body+=`<div class="card" style="margin-top:12px"><h3 style="margin-top:0">최근 8주 운동 횟수</h3>${weeklyChart()}</div>`;
 body+=`<div class="card"><h3 style="margin-top:0">근육 부위별 운동량</h3><div class="small">주동근 100%, 보조근 ${Math.round(state.settings.secondaryFactor*100)}% 반영</div>${muscleChart(month)}</div>`;
 body+=`<div class="card"><h3 style="margin-top:0">최근 운동</h3>${state.sessions.slice(0,8).map(s=>`<div class="routine-item"><div><strong>${s.name}</strong><div class="small">${fmtDate(s.startedAt)} · ${Math.round(sessionVolume(s)).toLocaleString()} kg</div></div><button class="secondary editSession" data-id="${s.id}">편집</button></div><div class="sep"></div>`).join("")||`<div class="empty">아직 운동 기록이 없습니다.</div>`}</div>`;
 app().innerHTML=`<main class="shell">${body}</main>${nav()}`;
 $$(".editSession").forEach(b=>b.onclick=()=>openSessionEditor(b.dataset.id));
}
function weeklyChart(){
 const points=[];let max=1;
 for(let i=7;i>=0;i--){const a=weekStart(new Date());a.setDate(a.getDate()-7*i);const b=new Date(a);b.setDate(b.getDate()+7);const n=sessionsInRange(a,b).length;max=Math.max(max,n);points.push({label:`${a.getMonth()+1}/${a.getDate()}`,n})}
 return `<div class="chart">${points.map(p=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(3,p.n/max*130)}px"></div><div class="bar-label">${p.label}</div></div>`).join("")}</div>`
}
function muscleChart(sessions){
 const m=muscleLoad(sessions),arr=Object.entries(m).sort((a,b)=>b[1]-a[1]),max=arr[0]?.[1]||1;
 if(!arr.length)return `<div class="empty">이번 달 기록이 없습니다.</div>`;
 return arr.map(([k,v])=>`<div class="muscle-row"><div>${k}</div><div class="track"><div class="fill" style="width:${v/max*100}%"></div></div><div>${v.toFixed(v%1?1:0)}</div></div>`).join("")
}

function openSessionEditor(id){
 const s=state.sessions.find(x=>x.id===id); if(!s)return;
 const modal=document.createElement("div");modal.className="modal";
 modal.innerHTML=`<div class="sheet"><h2>운동 기록 편집</h2><label>운동 이름</label><input id="sName" value="${s.name}"><div id="sEditList"></div>
 <div class="modal-actions"><button class="secondary" id="cancel">취소</button><button class="danger" id="deleteS">삭제</button><button id="saveS">저장</button></div></div>`;
 document.body.appendChild(modal);const draft=structuredClone(s);
 function draw(){
  $("#sEditList",modal).innerHTML=draft.exercises.map((x,xi)=>{
   const ex=state.exercises.find(e=>e.id===x.exerciseId)||{};
   return `<div class="card"><strong>${ex.name||"운동"}</strong>${x.sets.map((a,si)=> ex.type==="weight_reps"?`<div class="grid2" style="margin-top:8px"><input class="ss" data-x="${xi}" data-s="${si}" data-f="weight" value="${a.weight||0}"><input class="ss" data-x="${xi}" data-s="${si}" data-f="reps" value="${a.reps||0}"></div>`:`<div class="small" style="margin-top:8px">비중량 운동 기록</div>`).join("")}</div>`
  }).join("")
  $$(".ss",modal).forEach(i=>i.onchange=()=>draft.exercises[+i.dataset.x].sets[+i.dataset.s][i.dataset.f]=Number(i.value||0))
 } draw();
 $("#cancel",modal).onclick=()=>modal.remove();
 $("#saveS",modal).onclick=()=>{draft.name=$("#sName",modal).value.trim()||draft.name;state.sessions[state.sessions.findIndex(x=>x.id===id)]=draft;save();modal.remove();render();toast("수정했습니다")};
 $("#deleteS",modal).onclick=()=>{state.sessions=state.sessions.filter(x=>x.id!==id);save();modal.remove();render();toast("삭제했습니다")}
}

function renderSettings(){
 let body=top("설정","기본값과 데이터 관리");
 body+=`<div class="card"><h3 style="margin-top:0">기본 휴식시간</h3>
 <div class="grid2"><div><label>세트 사이 (초)</label><input id="setRest" type="number" min="0" value="${state.settings.setRest}"></div>
 <div><label>운동 사이 (초)</label><input id="exerciseRest" type="number" min="0" value="${state.settings.exerciseRest}"></div></div>
 <div style="margin-top:10px"><label>보조근 반영 비율</label><select id="secondaryFactor"><option value=".25">25%</option><option value=".5">50%</option><option value=".75">75%</option><option value="1">100%</option></select></div>
 <button id="saveSettings" style="width:100%;margin-top:12px">설정 저장</button></div>`;
 body+=`<div class="card"><h3 style="margin-top:0">데이터</h3><div class="stack">
 <button class="secondary" id="exportBtn">JSON 백업 내보내기</button>
 <label class="btn secondary" style="text-align:center">JSON 백업 가져오기<input id="importFile" type="file" accept=".json,application/json" hidden></label>
 <label class="btn secondary" style="text-align:center">Hevy CSV 가져오기 (베타)<input id="hevyCsv" type="file" accept=".csv,text/csv" hidden></label>
 </div><div class="small" style="margin-top:10px">Hevy CSV 형식은 계정/내보내기 버전에 따라 열 이름이 달라질 수 있어 현재는 일반적인 workout/title/exercise/set/weight/reps/date 열을 자동 탐색합니다.</div></div>`;
 body+=`<div class="card"><h3 style="margin-top:0">앱 정보</h3><div class="small">LiftLog PWA · 데이터는 이 브라우저의 로컬 저장소에 보관됩니다. 중요한 기록은 JSON 백업을 권장합니다.</div></div>`;
 app().innerHTML=`<main class="shell">${body}</main>${nav()}`;
 $("#secondaryFactor").value=String(state.settings.secondaryFactor);
 $("#saveSettings").onclick=()=>{state.settings.setRest=Number($("#setRest").value||45);state.settings.exerciseRest=Number($("#exerciseRest").value||60);state.settings.secondaryFactor=Number($("#secondaryFactor").value||.5);save();toast("설정을 저장했습니다")};
 $("#exportBtn").onclick=exportData; $("#importFile").onchange=importData; $("#hevyCsv").onchange=importHevyCsv;
}
function exportData(){
 const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`liftlog-backup-${todayKey()}.json`;a.click();URL.revokeObjectURL(a.href)
}
function importData(e){
 const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const s=JSON.parse(r.result);state={...structuredClone(defaultState),...s,settings:{...defaultState.settings,...(s.settings||{})}};save();render();toast("백업을 가져왔습니다")}catch{alert("올바른 JSON 파일이 아닙니다.")}};r.readAsText(f)
}
function csvParse(text){
 const rows=[];let row=[],cell="",q=false;
 for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];
  if(c=='"'&&q&&n=='"'){cell+='"';i++}
  else if(c=='"')q=!q;
  else if(c==","&&!q){row.push(cell);cell=""}
  else if((c=="\n"||c=="\r")&&!q){if(c=="\r"&&n=="\n")i++;row.push(cell);cell="";if(row.some(x=>x!==""))rows.push(row);row=[]}
  else cell+=c;
 } if(cell||row.length){row.push(cell);rows.push(row)} return rows
}
function importHevyCsv(e){
 const f=e.target.files[0]; if(!f)return; const r=new FileReader();
 r.onload=()=>{
  const rows=csvParse(r.result); if(rows.length<2)return alert("CSV에 데이터가 없습니다.");
  const H=rows[0].map(x=>x.trim().toLowerCase()), idx=(names)=>{for(const n of names){const i=H.indexOf(n);if(i>=0)return i}return -1};
  const iDate=idx(["date","start_time","start time","workout_date"]),iTitle=idx(["title","workout_title","workout","routine"]),iEx=idx(["exercise_title","exercise","exercise name"]),iSet=idx(["set_index","set","set number"]),iW=idx(["weight_kg","weight","kg"]),iR=idx(["reps","rep"]);
  if(iDate<0||iEx<0) return alert("CSV 열을 자동 인식하지 못했습니다. 파일을 보내주면 형식에 맞게 수정할 수 있습니다.");
  const groups={};
  rows.slice(1).forEach(rw=>{
   const date=rw[iDate]||new Date().toISOString(),title=iTitle>=0?(rw[iTitle]||"Hevy Import"):"Hevy Import",key=date+"|"+title;
   if(!groups[key])groups[key]={id:uid(),name:title,startedAt:new Date(date).toISOString(),endedAt:new Date(date).toISOString(),exercises:[]};
   const exName=rw[iEx]?.trim()||"Imported Exercise"; let ex=state.exercises.find(e=>e.name.toLowerCase()===exName.toLowerCase());
   if(!ex){ex={id:uid(),name:exName,type:"weight_reps",primary:["미분류"],secondary:[]};state.exercises.push(ex)}
   let gx=groups[key].exercises.find(x=>x.exerciseId===ex.id); if(!gx){gx={exerciseId:ex.id,sets:[]};groups[key].exercises.push(gx)}
   gx.sets.push({weight:iW>=0?Number(rw[iW]||0):0,reps:iR>=0?Number(rw[iR]||0):0,done:true})
  });
  state.sessions=[...Object.values(groups),...state.sessions].sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));save();render();toast(`${Object.keys(groups).length}개 운동을 가져왔습니다`)
 }; r.readAsText(f)
}

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}))}
render();
