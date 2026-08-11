const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

let tasks = [];
let activeTab = 'inbox';
let viewDate = null;
let categoryFilter = {inbox:'all', today:'all', week:'all', recurring:'all'};
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* ---------- Auth ---------- */

async function checkSession(){
  const { data:{ session } } = await sb.auth.getSession();
  if(session){
    currentUser = session.user;
    showApp();
  }else{
    showAuth();
  }
}

sb.auth.onAuthStateChange((event)=>{
  if(event === 'SIGNED_OUT') showAuth();
});

function showAuth(){
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
}

function showApp(){
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  loadTasks();
}

async function signIn(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error){
    errEl.textContent = error.message;
    return;
  }
  currentUser = data.user;
  showApp();
}

async function signOut(){
  await sb.auth.signOut();
  currentUser = null;
  tasks = [];
  showAuth();
}

/* ---------- Date helpers ---------- */

function fmtLocalDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function todayStr(){ return fmtLocalDate(new Date()); }

/* ---------- Persistence ---------- */

function taskToRow(t){
  return {
    id: t.id,
    user_id: currentUser.id,
    title: t.title,
    urgent: !!t.urgent,
    important: !!t.important,
    bucket: t.bucket,
    category: t.category || 'work',
    due: t.due || null,
    task_date: t.taskDate || null,
    recur_days: t.recurDays || [],
    completed_dates: t.completedDates || [],
    roll_count: t.rollCount || 0,
    sort_order: t.sortOrder || 0,
    done: !!t.done,
    created_at: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString()
  };
}

function rowToTask(r){
  return {
    id: r.id,
    title: r.title,
    urgent: r.urgent,
    important: r.important,
    bucket: r.bucket,
    category: r.category || 'work',
    due: r.due,
    taskDate: r.task_date,
    recurDays: r.recur_days || [],
    completedDates: r.completed_dates || [],
    rollCount: r.roll_count || 0,
    sortOrder: r.sort_order || 0,
    done: r.done,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
  };
}

async function persistTask(t){
  try{
    const { error } = await sb.from('tasks').upsert(taskToRow(t));
    if(error) console.error('Save failed', error);
  }catch(e){
    console.error('Save failed', e);
  }
}

async function removeTaskRemote(id){
  try{
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if(error) console.error('Delete failed', error);
  }catch(e){
    console.error('Delete failed', e);
  }
}

async function loadTasks(){
  viewDate = todayStr();
  try{
    const { data, error } = await sb.from('tasks').select('*').order('created_at', { ascending:true });
    if(error) throw error;
    tasks = (data||[]).map(rowToTask);
  }catch(e){
    console.error('Load failed', e);
    tasks = [];
  }
  await rolloverTasks();
  render();
}

async function rolloverTasks(){
  const today = todayStr();
  const changed = [];
  tasks.forEach(t=>{
    if(t.bucket==='today' && !t.done && t.taskDate && t.taskDate < today){
      t.taskDate = today;
      t.rollCount = (t.rollCount||0) + 1;
      changed.push(t);
    }
  });
  for(const t of changed){ await persistTask(t); }
}

function uid(){ return 't' + Date.now() + Math.random().toString(36).slice(2,7); }

/* ---------- Celebration ---------- */

function celebrate(el){
  if(!el) return;
  const rect = el.getBoundingClientRect();
  const burst = document.createElement('div');
  burst.className = 'celebrate';
  burst.textContent = '🎉';
  burst.style.left = (rect.left + rect.width/2) + 'px';
  burst.style.top = rect.top + 'px';
  document.body.appendChild(burst);
  setTimeout(()=> burst.remove(), 850);
}

/* ---------- Quick add ---------- */

function toggleChip(kind){
  const el = document.getElementById(kind==='urgent'?'chipUrgent':'chipImportant');
  el.classList.toggle(kind==='urgent'?'on-urgent':'on-important');
}

function onBucketChange(){
  const bucket = document.getElementById('qaBucket').value;
  document.getElementById('recurDays').classList.toggle('show', bucket==='recurring');
}

document.querySelectorAll('.day-chip').forEach(el=>{
  el.addEventListener('click', ()=> el.classList.toggle('on'));
});

function addTask(){
  const titleEl = document.getElementById('qaTitle');
  const title = titleEl.value.trim();
  if(!title) return;
  const urgent = document.getElementById('chipUrgent').classList.contains('on-urgent');
  const important = document.getElementById('chipImportant').classList.contains('on-important');
  const bucket = document.getElementById('qaBucket').value;
  const due = document.getElementById('qaDue').value || todayStr();
  let recurDays = [];
  if(bucket==='recurring'){
    document.querySelectorAll('#recurDays .day-chip.on').forEach(el=> recurDays.push(parseInt(el.dataset.d)));
  }
  const category = document.getElementById('qaCategory').value;
  const newTask = {
    id: uid(),
    title, urgent, important, bucket, due,
    category,
    taskDate: bucket==='today' ? todayStr() : null,
    rollCount: 0,
    recurDays,
    completedDates: [],
    sortOrder: Date.now(),
    done: false,
    createdAt: Date.now()
  };
  tasks.push(newTask);
  titleEl.value='';
  document.getElementById('chipUrgent').classList.remove('on-urgent');
  document.getElementById('chipImportant').classList.remove('on-important');
  document.getElementById('qaDue').value='';
  document.querySelectorAll('#recurDays .day-chip.on').forEach(el=>el.classList.remove('on'));
  persistTask(newTask);
  render();
}

document.getElementById('qaTitle').addEventListener('keydown', e=>{
  if(e.key==='Enter') addTask();
});

/* ---------- Complete / delete ---------- */

function toggleDone(evt, id){
  const t = tasks.find(x=>x.id===id);
  if(t){
    t.done = !t.done;
    if(t.done && evt) celebrate(evt.currentTarget);
    persistTask(t);
  }
  render();
}

function deleteTask(id){
  tasks = tasks.filter(x=>x.id!==id);
  removeTaskRemote(id);
  render();
}

/* ---------- Edit modal ---------- */

let editingId = null;
let movingId = null;

function openEditModal(id){
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  editingId = id;
  document.getElementById('editTitle').value = t.title;
  document.getElementById('editChipUrgent').classList.toggle('on-urgent', !!t.urgent);
  document.getElementById('editChipImportant').classList.toggle('on-important', !!t.important);
  document.getElementById('editBucket').value = t.bucket;
  document.getElementById('editCategory').value = t.category || 'work';
  document.getElementById('editDue').value = t.due || '';
  document.querySelectorAll('#editRecurDays .day-chip').forEach(el=>{
    el.classList.toggle('on', (t.recurDays||[]).includes(parseInt(el.dataset.d)));
  });
  onEditBucketChange();
  document.getElementById('editModal').style.display = 'flex';
}

function toggleEditChip(kind){
  const el = document.getElementById(kind==='urgent'?'editChipUrgent':'editChipImportant');
  el.classList.toggle(kind==='urgent'?'on-urgent':'on-important');
}

function onEditBucketChange(){
  const bucket = document.getElementById('editBucket').value;
  document.getElementById('editRecurDays').classList.toggle('show', bucket==='recurring');
}

function closeEditModal(){
  editingId = null;
  document.getElementById('editModal').style.display = 'none';
}

function saveEdit(){
  const t = tasks.find(x=>x.id===editingId);
  if(!t) return;
  const newTitle = document.getElementById('editTitle').value.trim();
  if(newTitle) t.title = newTitle;
  t.urgent = document.getElementById('editChipUrgent').classList.contains('on-urgent');
  t.important = document.getElementById('editChipImportant').classList.contains('on-important');
  t.category = document.getElementById('editCategory').value;
  t.due = document.getElementById('editDue').value || null;
  const newBucket = document.getElementById('editBucket').value;
  if(newBucket==='recurring'){
    t.recurDays = [];
    document.querySelectorAll('#editRecurDays .day-chip.on').forEach(el=> t.recurDays.push(parseInt(el.dataset.d)));
  }
  if(newBucket==='today' && t.bucket!=='today'){
    t.taskDate = todayStr();
    t.rollCount = 0;
  }
  t.bucket = newBucket;
  closeEditModal();
  persistTask(t);
  render();
}

/* ---------- Move modal ---------- */

function openMoveModal(id){
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  movingId = id;
  const current = t.bucket==='today' ? (t.taskDate || todayStr()) : (t.due || todayStr());
  document.getElementById('moveDateInput').value = current;
  document.getElementById('moveModal').style.display = 'flex';
}

function setMoveDate(deltaDays){
  const d = new Date();
  d.setDate(d.getDate()+deltaDays);
  document.getElementById('moveDateInput').value = fmtLocalDate(d);
}

function closeMoveModal(){
  movingId = null;
  document.getElementById('moveModal').style.display = 'none';
}

function confirmMove(){
  const t = tasks.find(x=>x.id===movingId);
  const newDate = document.getElementById('moveDateInput').value;
  if(!t || !newDate) return;
  if(t.bucket==='today'){
    t.taskDate = newDate;
    t.rollCount = 0;
  }else{
    t.due = newDate;
  }
  closeMoveModal();
  persistTask(t);
  render();
}

/* ---------- Eisenhower matrix helpers ---------- */

function quadClass(t){
  return (t.urgent?'1':'0') + (t.important?'1':'0');
}
function quadKey(t){
  if(t.urgent && t.important) return 'q1';
  if(!t.urgent && t.important) return 'q2';
  if(t.urgent && !t.important) return 'q3';
  return 'q4';
}
function quadLabel(k){
  return {q1:'Do First', q2:'Schedule', q3:'Delegate', q4:'Eliminate'}[k];
}

/* ---------- Diary (Today view) ---------- */

function fmtDateHeading(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  return d.toLocaleDateString('en-AU', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}

function weekdayOf(dateStr){
  return new Date(dateStr+'T00:00:00').getDay();
}

function shiftViewWeek(delta){
  const d = new Date(viewDate+'T00:00:00');
  d.setDate(d.getDate()+7*delta);
  viewDate = fmtLocalDate(d);
  renderTodayView();
}

function selectDay(dateStr){
  viewDate = dateStr;
  renderTodayView();
}

function weekStripHtml(viewDateStr){
  const d = new Date(viewDateStr+'T00:00:00');
  const dow = d.getDay();
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate()-dow);
  let html = '';
  for(let i=0;i<7;i++){
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate()+i);
    const dateStr = fmtLocalDate(day);
    const isSel = dateStr===viewDateStr;
    const isTod = dateStr===todayStr();
    html += `<button type="button" class="daybtn ${isSel?'sel':''} ${isTod && !isSel?'istoday':''}" onclick="selectDay('${dateStr}')">
        <span class="dbwd">${DAY_LABELS[i].slice(0,1)}</span>
        <span class="dbnum">${day.getDate()}</span>
      </button>`;
  }
  return html;
}

function jumpToday(){
  viewDate = todayStr();
  renderTodayView();
}

const CATS = ['work','personal','issues'];
const CAT_LABELS = {work:'Work', personal:'Personal', issues:'Issues'};

function sortByOrder(list){
  return [...list].sort((a,b)=> (a.sortOrder||0)-(b.sortOrder||0));
}

function contextList(context){
  if(context.startsWith('bucket:')) return listForBucket(context.slice(7));
  if(context.startsWith('diary:')) return tasksForDate(context.slice(6));
  return [];
}

function contextIsDone(t, context){
  if(context.startsWith('diary:')) return isDoneForDate(t, context.slice(6));
  return !!t.done;
}

function moveTask(id, direction, context){
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  const cat = t.category || 'work';
  const group = sortByOrder(contextList(context).filter(x=> (x.category||'work')===cat && !contextIsDone(x, context)));
  const idx = group.findIndex(x=>x.id===id);
  const swapIdx = direction==='up' ? idx-1 : idx+1;
  if(idx<0 || swapIdx<0 || swapIdx>=group.length) return;
  const other = group[swapIdx];
  const tmp = t.sortOrder || 0;
  t.sortOrder = other.sortOrder || 0;
  other.sortOrder = tmp;
  persistTask(t);
  persistTask(other);
  if(context.startsWith('bucket:')) renderBucketView(context.slice(7));
  else renderTodayView();
  renderCounts();
}

function tasksForDate(dateStr){
  const wd = weekdayOf(dateStr);
  const seen = new Set();
  const list = [];
  tasks.forEach(t=>{
    let include = false;
    if(t.bucket==='today' && t.taskDate===dateStr) include = true;
    if(t.bucket==='recurring' && t.recurDays && t.recurDays.includes(wd)) include = true;
    if(t.due === dateStr) include = true;
    if(include && !seen.has(t.id)){
      seen.add(t.id);
      list.push(t);
    }
  });
  return list;
}

function isDoneForDate(t, dateStr){
  if(t.bucket==='recurring'){
    return (t.completedDates||[]).includes(dateStr);
  }
  return !!t.done;
}

function toggleInstanceDone(evt, id, dateStr){
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  let nowDone;
  if(t.bucket==='recurring'){
    t.completedDates = t.completedDates || [];
    const idx = t.completedDates.indexOf(dateStr);
    if(idx>=0){ t.completedDates.splice(idx,1); nowDone=false; }
    else { t.completedDates.push(dateStr); nowDone=true; }
  }else{
    t.done = !t.done;
    nowDone = t.done;
  }
  if(nowDone && evt) celebrate(evt.currentTarget);
  persistTask(t);
  renderTodayView();
  renderCounts();
}

function diaryRowHtml(t, dateStr, canUp, canDown){
  const q = quadKey(t);
  const done = isDoneForDate(t, dateStr);
  const context = `diary:${dateStr}`;
  const metaParts = [];
  if(t.bucket==='recurring') metaParts.push('Recurring');
  if(t.due && t.bucket!=='today') metaParts.push('Due ' + t.due);
  if(t.rollCount) metaParts.push(`<span class="rolled">Moved ${t.rollCount}x</span>`);
  const moveIcons = !done ? `
        ${canUp?`<span class="act" onclick="moveTask('${t.id}','up','${context}')">&#8593;</span>`:''}
        ${canDown?`<span class="act" onclick="moveTask('${t.id}','down','${context}')">&#8595;</span>`:''}` : '';
  return `
    <div class="listrow q-${quadClass(t)} cat-${t.category||'work'} ${done?'done':''}">
      <div class="chk" onclick="toggleInstanceDone(event,'${t.id}','${dateStr}')">${done?'✓':''}</div>
      <div class="body">
        <div class="title">${escapeHtml(t.title)}</div>
        <div class="meta">
          <span class="tag ${q}">${quadLabel(q)}</span>
          <span class="tag cat ${t.category||'work'}">${t.category||'work'}</span>
          ${metaParts.map(m=>`<span>${m.startsWith('<')?m:escapeHtml(m)}</span>`).join('')}
        </div>
      </div>
      <div class="actions">${moveIcons}
        ${t.bucket!=='recurring'?`<span class="act" onclick="openMoveModal('${t.id}')">&#8594;</span>`:''}
        <span class="act" onclick="openEditModal('${t.id}')">&#9998;</span>
        <span class="act del" onclick="deleteTask('${t.id}')">&times;</span>
      </div>
    </div>`;
}

function renderTodayView(){
  const el = document.getElementById('view-today');
  const isToday = viewDate === todayStr();
  const list = tasksForDate(viewDate);
  let html = `
    <div class="weekstrip">
      <button class="navbtn" onclick="shiftViewWeek(-1)">&larr;</button>
      <div class="weekdays">${weekStripHtml(viewDate)}</div>
      <button class="navbtn" onclick="shiftViewWeek(1)">&rarr;</button>
    </div>
    <div class="diarydate">${fmtDateHeading(viewDate)}${isToday?' <span class="todaybadge">Today</span>':''}</div>
    ${!isToday?'<div class="jumprow"><button class="jumpbtn" onclick="jumpToday()">Jump to today</button></div>':''}`;
  let any = false;
  CATS.forEach(cat=>{
    const groupAll = list.filter(t=> (t.category||'work')===cat);
    if(groupAll.length===0) return;
    any = true;
    const open = sortByOrder(groupAll.filter(t=>!isDoneForDate(t, viewDate)));
    const done = sortByOrder(groupAll.filter(t=>isDoneForDate(t, viewDate)));
    html += `<div class="cathead cathead-${cat}">${CAT_LABELS[cat]}</div>`;
    open.forEach((t,i)=>{ html += diaryRowHtml(t, viewDate, i>0, i<open.length-1); });
    done.forEach(t=>{ html += diaryRowHtml(t, viewDate, false, false); });
  });
  if(!any) html += `<div class="empty">Nothing on for this day.</div>`;
  el.innerHTML = html;
}

/* ---------- Bucket views ---------- */

function rowHtml(t, context, canUp, canDown){
  const q = quadKey(t);
  const metaParts = [];
  if(t.due) metaParts.push('Due ' + t.due);
  if(t.bucket==='recurring' && t.recurDays && t.recurDays.length){
    metaParts.push(t.recurDays.map(d=>DAY_LABELS[d]).join(' '));
  }
  if(t.rollCount){
    metaParts.push(`<span class="rolled">Moved ${t.rollCount}x</span>`);
  }
  const moveIcons = (context && !t.done) ? `
        ${canUp?`<span class="act" onclick="moveTask('${t.id}','up','${context}')">&#8593;</span>`:''}
        ${canDown?`<span class="act" onclick="moveTask('${t.id}','down','${context}')">&#8595;</span>`:''}` : '';
  return `
    <div class="listrow q-${quadClass(t)} cat-${t.category||'work'} ${t.done?'done':''}">
      <div class="chk" onclick="toggleDone(event,'${t.id}')">${t.done?'✓':''}</div>
      <div class="body">
        <div class="title">${escapeHtml(t.title)}</div>
        <div class="meta">
          <span class="tag ${q}">${quadLabel(q)}</span>
          <span class="tag cat ${t.category||'work'}">${t.category||'work'}</span>
          ${metaParts.map(m=>`<span>${m.startsWith('<')?m:escapeHtml(m)}</span>`).join('')}
        </div>
      </div>
      <div class="actions">${moveIcons}
        ${t.bucket!=='recurring'?`<span class="act" onclick="openMoveModal('${t.id}')">&#8594;</span>`:''}
        <span class="act" onclick="openEditModal('${t.id}')">&#9998;</span>
        <span class="act del" onclick="deleteTask('${t.id}')">&times;</span>
      </div>
    </div>`;
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function listForBucket(bucket){
  const cf = categoryFilter[bucket];
  return tasks.filter(t=> t.bucket===bucket
    && (cf==='all' || (t.category||'work')===cf));
}

function setCatFilter(bucket, c){
  categoryFilter[bucket] = c;
  renderBucketView(bucket);
}

function catFilterHtml(bucket){
  const cats = ['all','work','personal','issues'];
  return `<div class="catfilter">` + cats.map(c=>
    `<span class="catchip ${categoryFilter[bucket]===c?'on':''}" onclick="setCatFilter('${bucket}','${c}')">${c}</span>`
  ).join('') + `</div>`;
}

function renderBucketView(bucket){
  const el = document.getElementById('view-'+bucket);
  const list = listForBucket(bucket);
  const context = `bucket:${bucket}`;
  let html = catFilterHtml(bucket);
  let any = false;
  CATS.forEach(cat=>{
    const groupAll = list.filter(t=> (t.category||'work')===cat);
    if(groupAll.length===0) return;
    any = true;
    const open = sortByOrder(groupAll.filter(t=>!t.done));
    const done = sortByOrder(groupAll.filter(t=>t.done));
    html += `<div class="cathead cathead-${cat}">${CAT_LABELS[cat]}</div>`;
    open.forEach((t,i)=>{ html += rowHtml(t, context, i>0, i<open.length-1); });
    done.forEach(t=>{ html += rowHtml(t, context, false, false); });
  });
  if(!any) html += `<div class="empty">Nothing here. Add a task above.</div>`;
  el.innerHTML = html;
}

/* ---------- Matrix ---------- */

let matrixFilter = null;

function filterOpen(){
  matrixFilter = null;
  switchTab('matrix');
}

function filterDoFirst(){
  matrixFilter = 'q1';
  switchTab('matrix');
}

function clearMatrixFilter(){
  matrixFilter = null;
  renderMatrix();
}

function renderMatrix(){
  const el = document.getElementById('view-matrix');
  const open = tasks.filter(t=>!t.done);
  const groups = {q1:[], q2:[], q3:[], q4:[]};
  open.forEach(t=> groups[quadKey(t)].push(t));
  const labels = {
    q1:['Do First','Urgent + Important'],
    q2:['Schedule','Important, Not Urgent'],
    q3:['Delegate','Urgent, Not Important'],
    q4:['Eliminate','Neither']
  };
  const keys = matrixFilter ? [matrixFilter] : ['q1','q2','q3','q4'];
  let html = '';
  if(matrixFilter){
    html += `<div class="showdone" onclick="clearMatrixFilter()">&larr; Show all quadrants</div>`;
  }
  html += '<div class="matrix">';
  keys.forEach(k=>{
    html += `<div class="quad ${k}"><h3>${labels[k][0]}<span style="font-weight:400;text-transform:none;">${labels[k][1]}</span></h3>`;
    if(groups[k].length===0){
      html += `<div class="empty">Nothing here.</div>`;
    }else{
      html += sortByOrder(groups[k]).map(t=>rowHtml(t, null, false, false)).join('');
    }
    html += `</div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

/* ---------- Tabs / counts / render ---------- */

function switchTab(view){
  activeTab = view;
  document.querySelectorAll('.tab').forEach(t=> t.classList.toggle('active', t.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=> v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  render();
}

function renderCounts(){
  ['inbox','today','week','recurring'].forEach(b=>{
    const n = tasks.filter(t=>t.bucket===b && !t.done).length;
    document.getElementById('cnt-'+b).textContent = n>0 ? n : '';
  });
  document.getElementById('statOpen').textContent = tasks.filter(t=>!t.done).length;
  document.getElementById('statToday').textContent = tasksForDate(todayStr()).filter(t=>!isDoneForDate(t, todayStr())).length;
  document.getElementById('statUrgent').textContent = tasks.filter(t=>t.urgent && t.important && !t.done).length;
}

function render(){
  renderCounts();
  if(activeTab==='matrix'){
    renderMatrix();
  }else if(activeTab==='today'){
    renderTodayView();
  }else{
    renderBucketView(activeTab);
  }
}

checkSession();
