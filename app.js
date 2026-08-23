const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

let tasks = [];
let activeTab = 'today';
let viewDate = null;
let categoryFilter = {today:'all', week:'all', recurring:'all'};
let sortMode = {today:'manual', week:'manual', recurring:'manual'};
let searchQuery = '';
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const QUOTES = [
  "Progress beats perfection on a Monday morning.",
  "Small tasks cleared today are big problems avoided tomorrow.",
  "A tidy list makes for a clear head.",
  "Done is a decision, not an accident.",
  "The work you finish first is the weight you carry least.",
  "Momentum is built one ticked box at a time.",
  "Plan the day before the day plans you.",
  "Clarity is a to-do list with the noise removed.",
  "Every deadline met is a promise kept.",
  "Start with the task you're avoiding.",
  "Good order today saves a bad scramble tomorrow.",
  "A short list, done properly, beats a long list half-finished.",
  "What gets scheduled gets shipped.",
  "The busiest days reward the clearest priorities.",
  "One task at a time still adds up fast.",
  "Discipline is choosing what matters before the day chooses for you.",
  "Finishing is a habit, not a mood.",
  "The list doesn't shrink itself — but it will, one line at a time.",
  "A well-run day starts with a well-run list.",
  "Steady work outpaces frantic work.",
  "Today's effort is tomorrow's easier morning.",
  "Nothing clears the mind like a cleared inbox.",
  "Consistency is the quiet advantage.",
  "Prioritise hard, then work easy.",
  "The task ticked off is worth more than the task planned.",
  "Order first, speed follows.",
  "Small wins compound into big weeks.",
  "Focus is choosing one thing on purpose.",
  "The best time to start was earlier. The next best time is now.",
  "A clear list is a clear conscience."
];

function dayOfYear(d){
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}

function todaysQuote(){
  const idx = dayOfYear(new Date()) % QUOTES.length;
  return QUOTES[idx];
}

function updateClock(){
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short'});
  const timeStr = now.toLocaleTimeString('en-AU', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
  const el = document.getElementById('liveClock');
  if(el) el.innerHTML = `<span class="clock-date">${dateStr}</span>${timeStr}`;
}
updateClock();
setInterval(updateClock, 1000);

let categories = [];
const DEFAULT_CATS = [
  {key:'work', label:'Work', color:'#2B4C7E'},
  {key:'issues', label:'Issues', color:'#7A3FA0'},
  {key:'personal', label:'Personal', color:'#2F7D4F'}
];

function allCategories(){ return categories; }
function getCategory(key){ return categories.find(c=>c.key===key) || categories[0] || DEFAULT_CATS[0]; }

function lightenHex(hex, amt){
  hex = hex.replace('#','');
  const r = parseInt(hex.substring(0,2),16);
  const g = parseInt(hex.substring(2,4),16);
  const b = parseInt(hex.substring(4,6),16);
  const nr = Math.round(r + (255-r)*amt);
  const ng = Math.round(g + (255-g)*amt);
  const nb = Math.round(b + (255-b)*amt);
  return `rgb(${nr},${ng},${nb})`;
}

function rowCatAttrs(catKey){
  const c = getCategory(catKey);
  return {cls:'', style:`background:${lightenHex(c.color,0.82)};`};
}
function tagCatAttrs(catKey){
  const c = getCategory(catKey);
  return {cls:'', style:`background:${lightenHex(c.color,0.68)};color:${c.color};`};
}
function headCatAttrs(catKey){
  const c = getCategory(catKey);
  return {cls:'', style:`color:${c.color};`};
}

function refreshCategoryDropdowns(){
  const cats = allCategories();
  ['qaCategory','editCategory'].forEach(id=>{
    const sel = document.getElementById(id);
    if(!sel) return;
    const current = sel.value;
    sel.innerHTML = cats.map(c=>`<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');
    if(cats.some(c=>c.key===current)) sel.value = current;
  });
}

let editingCatKey = null;

function openCategoryModal(){
  resetCategoryForm();
  renderCategoryModalList();
  document.getElementById('categoryModal').style.display = 'flex';
}
function closeCategoryModal(){
  resetCategoryForm();
  document.getElementById('categoryModal').style.display = 'none';
}

function resetCategoryForm(){
  editingCatKey = null;
  document.getElementById('newCatName').value = '';
  document.getElementById('newCatColor').value = '#2B4C7E';
  document.getElementById('categorySaveBtn').textContent = 'Add';
  document.getElementById('categoryModalTitle').textContent = 'Categories';
}

function renderCategoryModalList(){
  const el = document.getElementById('categoryListInner');
  if(!el) return;
  el.innerHTML = categories.map(c=>`
    <div class="catmanage-row">
      <span class="catmanage-swatch" style="background:${c.color}"></span>
      <span class="catmanage-name">${escapeHtml(c.label)}</span>
      <span class="act" onclick="editCategoryStart('${c.key}')">&#9998;</span>
    </div>`).join('');
}

function editCategoryStart(key){
  const c = getCategory(key);
  editingCatKey = key;
  document.getElementById('newCatName').value = c.label;
  document.getElementById('newCatColor').value = c.color;
  document.getElementById('categorySaveBtn').textContent = 'Save changes';
  document.getElementById('categoryModalTitle').textContent = 'Edit category';
}

function saveCategory(){
  const name = document.getElementById('newCatName').value.trim();
  if(!name) return;
  const color = document.getElementById('newCatColor').value;
  let target;
  if(editingCatKey){
    target = categories.find(x=>x.key===editingCatKey);
    if(target){ target.label = name; target.color = color; }
  }else{
    const key = 'cat_' + Date.now();
    target = {key, label:name, color};
    categories.push(target);
    document.getElementById('qaCategory').value = key;
  }
  persistCategory(target);
  refreshCategoryDropdowns();
  resetCategoryForm();
  renderCategoryModalList();
  render();
}

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

async function showApp(){
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  await loadCategories();
  refreshCategoryDropdowns();
  await loadLeave();
  renderLeaveView();
  await loadShopping();
  renderShoppingView();
  shopInitHistory();
  await loadHabits();
  await loadHabitLog();
  renderHabitsView();
  await loadHealthSettings();
  await loadHealthLogs();
  renderHealthView();
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

/* ---------- Categories persistence ---------- */

async function loadCategories(){
  try{
    const { data, error } = await sb.from('categories').select('*').order('created_at', { ascending:true });
    if(error) throw error;
    categories = (data||[]).map(r=>({key:r.id, label:r.label, color:r.color}));
  }catch(e){
    console.error('Load categories failed', e);
    categories = [];
  }
  if(categories.length===0){
    categories = DEFAULT_CATS.map(c=>({...c}));
    for(const c of categories){ await persistCategory(c); }
  }
}

async function persistCategory(cat){
  try{
    const { error } = await sb.from('categories').upsert({
      id: cat.key, user_id: currentUser.id, label: cat.label, color: cat.color
    });
    if(error) console.error('Save category failed', error);
  }catch(e){
    console.error('Save category failed', e);
  }
}

/* ---------- Tasks persistence ---------- */

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
    completed_at: t.completedAt ? new Date(t.completedAt).toISOString() : null,
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
    completedAt: r.completed_at ? new Date(r.completed_at).getTime() : null,
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
  initHistory();
  document.getElementById('qaDue').value = todayStr();
  document.getElementById('dailyQuote').textContent = todaysQuote();
  render();
}

async function rolloverTasks(){
  const today = todayStr();
  const changed = [];
  tasks.forEach(t=>{
    if(t.bucket==='inbox'){
      t.bucket = 'today';
      t.taskDate = today;
      t.due = today;
      t.rollCount = 0;
      changed.push(t);
    }
  });
  tasks.forEach(t=>{
    if(t.bucket==='today' && !t.done && t.taskDate && t.taskDate < today){
      t.taskDate = today;
      t.due = today;
      t.rollCount = (t.rollCount||0) + 1;
      changed.push(t);
    }
  });
  for(const t of changed){ await persistTask(t); }
}

function uid(){ return 't' + Date.now() + Math.random().toString(36).slice(2,7); }

/* ---------- Leave ---------- */

let leaveEntries = [];

async function loadLeave(){
  try{
    const { data, error } = await sb.from('leave_entries').select('*').order('start_date', { ascending:true });
    if(error) throw error;
    leaveEntries = (data||[]).map(r=>({ id:r.id, staffName:r.staff_name, startDate:r.start_date, endDate:r.end_date }));
  }catch(e){
    console.error('Load leave failed', e);
    leaveEntries = [];
  }
}

async function persistLeave(entry){
  try{
    const { error } = await sb.from('leave_entries').upsert({
      id: entry.id, user_id: currentUser.id, staff_name: entry.staffName,
      start_date: entry.startDate, end_date: entry.endDate
    });
    if(error) console.error('Save leave failed', error);
  }catch(e){
    console.error('Save leave failed', e);
  }
}

async function removeLeaveRemote(id){
  try{
    const { error } = await sb.from('leave_entries').delete().eq('id', id);
    if(error) console.error('Delete leave failed', error);
  }catch(e){
    console.error('Delete leave failed', e);
  }
}

function fmtDateShort(dateStr){
  return new Date(dateStr+'T00:00:00').toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short'});
}

function addLeave(){
  const nameEl = document.getElementById('leaveStaffName');
  const name = nameEl.value.trim();
  const start = document.getElementById('leaveStart').value;
  const end = document.getElementById('leaveEnd').value || start;
  if(!name || !start) return;
  const entry = { id: uid(), staffName: name, startDate: start, endDate: end };
  leaveEntries.push(entry);
  persistLeave(entry);
  nameEl.value = '';
  document.getElementById('leaveStart').value = '';
  document.getElementById('leaveEnd').value = '';
  renderLeaveView();
  renderLeaveBanner();
  if(activeTab==='today') renderTodayView();
}

function deleteLeave(id){
  leaveEntries = leaveEntries.filter(l=>l.id!==id);
  removeLeaveRemote(id);
  renderLeaveView();
  renderLeaveBanner();
  if(activeTab==='today') renderTodayView();
}

function leaveOnDate(dateStr){
  return leaveEntries.filter(l=> l.startDate<=dateStr && l.endDate>=dateStr);
}

function renderLeaveView(){
  const el = document.getElementById('leaveListInner');
  if(!el) return;
  const today = todayStr();
  const upcoming = [...leaveEntries]
    .filter(l=> l.endDate>=today)
    .sort((a,b)=> a.startDate.localeCompare(b.startDate));
  if(upcoming.length===0){
    el.innerHTML = `<div class="empty">No upcoming or current leave on record.</div>`;
    return;
  }
  el.innerHTML = upcoming.map(l=>{
    const active = l.startDate<=today && l.endDate>=today;
    return `
      <div class="leaverow ${active?'active':''}">
        <div class="leaverow-body">
          <div class="leaverow-name">${escapeHtml(l.staffName)}</div>
          <div class="leaverow-dates">${fmtDateShort(l.startDate)} &rarr; ${fmtDateShort(l.endDate)} ${active?'<span class="tag q1">On leave now</span>':''}</div>
        </div>
        <span class="del" onclick="deleteLeave('${l.id}')">&times;</span>
      </div>`;
  }).join('');
}

function renderLeaveBanner(){
  const el = document.getElementById('leaveBanner');
  if(!el) return;
  const today = todayStr();
  const endD = new Date();
  endD.setDate(endD.getDate()+7);
  const end = fmtLocalDate(endD);
  const upcoming = leaveEntries
    .filter(l=> l.startDate>=today && l.startDate<=end)
    .sort((a,b)=> a.startDate.localeCompare(b.startDate));
  if(upcoming.length===0){
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'flex';
  el.innerHTML = '&#128197; Leave coming up: ' + upcoming.map(l=>
    `${escapeHtml(l.staffName)} (from ${fmtDateShort(l.startDate)})`
  ).join(', ');
}

/* ---------- Habits ---------- */

const HABIT_PALETTE = ['#2F7D4F','#2B6CB0','#B03A2E','#A9662E','#1E88A8','#B7950B','#7A3FA0','#6B7280'];
const DEFAULT_HABITS = [
  '🌙 Sleep 7-8 hrs','🏋️ Gym session','🏃 Running','🥩 On-plan eating',
  '👟 10k steps','💧 2L water','📵 Low phone use','🧘 Stretch / posture'
];

let habits = [];
let habitLog = [];
let habitWeekAnchor = null;

async function loadHabits(){
  try{
    const { data, error } = await sb.from('habits').select('*').order('created_at', { ascending:true });
    if(error) throw error;
    habits = (data||[]).map(r=>({key:r.id, label:r.label, color:r.color}));
  }catch(e){
    console.error('Load habits failed', e);
    habits = [];
  }
  if(habits.length===0){
    habits = DEFAULT_HABITS.map((label,i)=>({key:uid(), label, color:HABIT_PALETTE[i % HABIT_PALETTE.length]}));
    for(const h of habits){ await persistHabit(h); }
  }
}

async function persistHabit(h){
  try{
    const { error } = await sb.from('habits').upsert({
      id: h.key, user_id: currentUser.id, label: h.label, color: h.color
    });
    if(error) console.error('Save habit failed', error);
  }catch(e){
    console.error('Save habit failed', e);
  }
}

async function removeHabitRemote(key){
  try{
    const { error } = await sb.from('habits').delete().eq('id', key);
    if(error) console.error('Delete habit failed', error);
  }catch(e){
    console.error('Delete habit failed', e);
  }
}

async function loadHabitLog(){
  try{
    const { data, error } = await sb.from('habit_log').select('*');
    if(error) throw error;
    habitLog = (data||[]).map(r=>({id:r.id, habitId:r.habit_id, date:r.log_date}));
  }catch(e){
    console.error('Load habit log failed', e);
    habitLog = [];
  }
}

async function persistHabitLogEntry(entry){
  try{
    const { error } = await sb.from('habit_log').upsert({
      id: entry.id, user_id: currentUser.id, habit_id: entry.habitId, log_date: entry.date
    });
    if(error) console.error('Save habit log entry failed', error);
  }catch(e){
    console.error('Save habit log entry failed', e);
  }
}

async function removeHabitLogEntryRemote(id){
  try{
    const { error } = await sb.from('habit_log').delete().eq('id', id);
    if(error) console.error('Delete habit log entry failed', error);
  }catch(e){
    console.error('Delete habit log entry failed', e);
  }
}

function addHabit(){
  const el = document.getElementById('habitNameInput');
  const text = el.value.trim();
  if(!text) return;
  const color = HABIT_PALETTE[habits.length % HABIT_PALETTE.length];
  const h = {key: uid(), label: text, color};
  habits.push(h);
  el.value = '';
  persistHabit(h);
  renderHabitsView();
}

let editingHabitKey = null;

function editHabitStart(key){
  const h = habits.find(x=>x.key===key);
  if(!h) return;
  editingHabitKey = key;
  document.getElementById('habitEditName').value = h.label;
  document.getElementById('habitEditModal').style.display = 'flex';
}

function closeHabitEditModal(){
  editingHabitKey = null;
  document.getElementById('habitEditModal').style.display = 'none';
}

function saveHabitEdit(){
  const h = habits.find(x=>x.key===editingHabitKey);
  if(!h) return;
  const newName = document.getElementById('habitEditName').value.trim();
  if(newName) h.label = newName;
  closeHabitEditModal();
  persistHabit(h);
  renderHabitsView();
}

function deleteHabit(key){
  habits = habits.filter(h=>h.key!==key);
  const toRemove = habitLog.filter(e=>e.habitId===key);
  habitLog = habitLog.filter(e=>e.habitId!==key);
  removeHabitRemote(key);
  toRemove.forEach(e=> removeHabitLogEntryRemote(e.id));
  renderHabitsView();
}

function habitWeekDates(anchor){
  const d = new Date(anchor+'T00:00:00');
  const dow = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate()-dow);
  const days = [];
  for(let i=0;i<7;i++){
    const day = new Date(start);
    day.setDate(start.getDate()+i);
    days.push(fmtLocalDate(day));
  }
  return days;
}

function shiftHabitWeek(delta){
  const d = new Date(habitWeekAnchor+'T00:00:00');
  d.setDate(d.getDate()+7*delta);
  habitWeekAnchor = fmtLocalDate(d);
  renderHabitsView();
}

function jumpHabitWeekToday(){
  habitWeekAnchor = todayStr();
  renderHabitsView();
}

function habitDone(habitId, date){
  return habitLog.some(e=>e.habitId===habitId && e.date===date);
}

function toggleHabitDay(habitId, date){
  const idx = habitLog.findIndex(e=>e.habitId===habitId && e.date===date);
  if(idx>=0){
    const entry = habitLog[idx];
    habitLog.splice(idx,1);
    removeHabitLogEntryRemote(entry.id);
  }else{
    const entry = {id: habitId+'_'+date, habitId, date};
    habitLog.push(entry);
    persistHabitLogEntry(entry);
  }
  renderHabitsView();
}

function renderHabitsView(){
  const el = document.getElementById('habitTableWrap');
  if(!el) return;
  if(!habitWeekAnchor) habitWeekAnchor = todayStr();
  const weekDates = habitWeekDates(habitWeekAnchor);
  const isCurrentWeek = weekDates.includes(todayStr());
  const dayLabels = weekDates.map(d=>{
    const dt = new Date(d+'T00:00:00');
    return dt.toLocaleDateString('en-AU', {weekday:'short', day:'numeric'});
  });

  let html = `
    <div class="habitweekhead">
      <button class="navbtn" onclick="shiftHabitWeek(-1)">&larr;</button>
      <div class="habitweeklabel">${fmtDateShort(weekDates[0])} &ndash; ${fmtDateShort(weekDates[6])}${isCurrentWeek?' <span class="todaybadge">This Week</span>':''}</div>
      <button class="navbtn" onclick="shiftHabitWeek(1)">&rarr;</button>
    </div>
    ${!isCurrentWeek?'<div class="jumprow"><button class="jumpbtn" onclick="jumpHabitWeekToday()">Jump to this week</button></div>':''}`;

  if(habits.length===0){
    html += `<div class="empty">No habits yet. Add one above.</div>`;
    el.innerHTML = html;
    return;
  }

  html += `<div class="habit-table-wrap"><table class="habit-grid"><thead><tr><th></th>`;
  dayLabels.forEach(l=>{ html += `<th>${l}</th>`; });
  html += `<th>Score</th></tr></thead><tbody>`;

  const scores = [];
  habits.forEach(h=>{
    html += `<tr><td class="habit-name">
      <span class="habit-name-text">${escapeHtml(h.label)}</span>
      <span class="actions"><span class="act" onclick="editHabitStart('${h.key}')">&#9998;</span><span class="act del" onclick="deleteHabit('${h.key}')">&times;</span></span>
    </td>`;
    let score = 0;
    weekDates.forEach(d=>{
      const done = habitDone(h.key, d);
      if(done) score++;
      const future = d > todayStr();
      html += `<td><div class="habit-cell ${done?'done':''} ${future?'future':''}" ${future?'':`onclick="toggleHabitDay('${h.key}','${d}')"`} style="${done?`background:${h.color};border-color:${h.color};`:''}"></div></td>`;
    });
    html += `<td class="habit-score">${score}/7</td></tr>`;
    scores.push({h, score});
  });
  html += `</tbody></table></div>`;

  const totalPct = Math.round(scores.reduce((s,x)=>s+x.score,0) / (habits.length*7) * 100);
  const grade = totalPct>=90?'S':totalPct>=80?'A':totalPct>=65?'B':totalPct>=45?'C':'D';
  const sorted = [...scores].sort((a,b)=>a.score-b.score);
  const worst = sorted[0];
  const best = sorted[sorted.length-1];
  html += `<div class="habit-summary">
    <div class="habit-grade">${grade}<span class="habit-grade-pct">${totalPct}%</span></div>
    <div class="habit-insight">
      ${best?`<div><span class="up">&#8593; Strongest:</span> ${escapeHtml(best.h.label)} (${best.score}/7)</div>`:''}
      ${worst && best && worst.h.key!==best.h.key?`<div><span class="down">&#8595; Focus area:</span> ${escapeHtml(worst.h.label)} (${worst.score}/7)</div>`:''}
    </div>
  </div>`;

  el.innerHTML = html;
}

/* ---------- Shopping list ---------- */

const SHOP_CATS = [
  {key:'produce', label:'Produce', color:'#2F7D4F'},
  {key:'dairy', label:'Dairy & Eggs', color:'#2B6CB0'},
  {key:'meat', label:'Meat & Seafood', color:'#B03A2E'},
  {key:'bakery', label:'Bakery', color:'#A9662E'},
  {key:'frozen', label:'Frozen', color:'#1E88A8'},
  {key:'pantry', label:'Pantry', color:'#B7950B'},
  {key:'household', label:'Household', color:'#7A3FA0'},
  {key:'other', label:'Other', color:'#6B7280'}
];

let shoppingItems = [];

async function loadShopping(){
  try{
    const { data, error } = await sb.from('shopping_items').select('*').order('created_at', { ascending:true });
    if(error) throw error;
    shoppingItems = (data||[]).map(r=>({
      id: r.id, text: r.item_text, category: r.category || 'other',
      done: r.done, archived: r.archived || false,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    }));
  }catch(e){
    console.error('Load shopping failed', e);
    shoppingItems = [];
  }
}

async function persistShopItem(item){
  try{
    const { error } = await sb.from('shopping_items').upsert({
      id: item.id, user_id: currentUser.id, item_text: item.text,
      category: item.category || 'other', done: !!item.done, archived: !!item.archived,
      created_at: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString()
    });
    if(error) console.error('Save shopping item failed', error);
  }catch(e){
    console.error('Save shopping item failed', e);
  }
}

async function removeShopItemRemote(id){
  try{
    const { error } = await sb.from('shopping_items').delete().eq('id', id);
    if(error) console.error('Delete shopping item failed', error);
  }catch(e){
    console.error('Delete shopping item failed', e);
  }
}

function addShopItem(){
  const el = document.getElementById('shopItemInput');
  const text = el.value.trim();
  if(!text) return;
  const category = document.getElementById('shopCategorySelect').value;
  const item = { id: uid(), text, category, done: false, archived: false, createdAt: Date.now() };
  shoppingItems.push(item);
  persistShopItem(item);
  el.value = '';
  shopCommitHistory();
  renderShoppingView();
}

function toggleShopItem(id){
  const it = shoppingItems.find(x=>x.id===id);
  if(it){
    it.done = !it.done;
    persistShopItem(it);
  }
  shopCommitHistory();
  renderShoppingView();
}

function deleteShopItem(id){
  shoppingItems = shoppingItems.filter(x=>x.id!==id);
  removeShopItemRemote(id);
  shopCommitHistory();
  renderShoppingView();
}

function clearCompletedShopping(){
  const changed = shoppingItems.filter(i=>i.done);
  changed.forEach(i=>{ i.archived = true; persistShopItem(i); });
  shopCommitHistory();
  renderShoppingView();
}

function restoreAllShopping(){
  shoppingItems.forEach(i=>{ i.archived = false; i.done = false; persistShopItem(i); });
  shopCommitHistory();
  renderShoppingView();
}

let editingShopId = null;

function openShopEditModal(id){
  const it = shoppingItems.find(x=>x.id===id);
  if(!it) return;
  editingShopId = id;
  document.getElementById('shopEditText').value = it.text;
  document.getElementById('shopEditCategory').value = it.category || 'other';
  document.getElementById('shopEditModal').style.display = 'flex';
}

function closeShopEditModal(){
  editingShopId = null;
  document.getElementById('shopEditModal').style.display = 'none';
}

function saveShopEdit(){
  const it = shoppingItems.find(x=>x.id===editingShopId);
  if(!it) return;
  const newText = document.getElementById('shopEditText').value.trim();
  if(newText) it.text = newText;
  it.category = document.getElementById('shopEditCategory').value;
  closeShopEditModal();
  persistShopItem(it);
  shopCommitHistory();
  renderShoppingView();
}

function shopRowHtml(i, color){
  const bg = color ? ` style="background:${lightenHex(color,0.85)};"` : '';
  return `
    <div class="shoprow ${i.done?'done':''}"${bg}>
      <div class="chk" onclick="toggleShopItem('${i.id}')">${i.done?'✓':''}</div>
      <div class="shoprow-text">${escapeHtml(i.text)}</div>
      <div class="actions">
        <span class="act" onclick="openShopEditModal('${i.id}')">&#9998;</span>
        <span class="act del" onclick="deleteShopItem('${i.id}')">&times;</span>
      </div>
    </div>`;
}

function renderShoppingView(){
  const el = document.getElementById('shopListInner');
  if(!el) return;
  const visible = shoppingItems.filter(i=>!i.archived);
  let html = '<div class="shop-grid">';
  let any = false;
  SHOP_CATS.forEach(cat=>{
    const open = visible.filter(i=> (i.category||'other')===cat.key && !i.done);
    if(open.length===0) return;
    any = true;
    html += `<div class="shop-col" style="border-top-color:${cat.color};">
      <h3 style="color:${cat.color};">${escapeHtml(cat.label)}</h3>
      ${open.map(i=>shopRowHtml(i, cat.color)).join('')}
    </div>`;
  });
  const doneItems = visible.filter(i=>i.done);
  if(doneItems.length>0){
    any = true;
    html += `<div class="shop-col shop-col-done">
      <h3>Completed</h3>
      ${doneItems.map(i=>shopRowHtml(i)).join('')}
    </div>`;
  }
  html += '</div>';
  if(!any) html = `<div class="empty">Nothing on the list. Add an item above.</div>`;
  el.innerHTML = html;
}

let shopHistory = [];
let shopHistoryIndex = -1;
const SHOP_MAX_HISTORY = 50;

function shopSnapshot(){
  return JSON.parse(JSON.stringify(shoppingItems));
}

function shopInitHistory(){
  shopHistory = [shopSnapshot()];
  shopHistoryIndex = 0;
  updateShopUndoRedoButtons();
}

function shopCommitHistory(){
  shopHistory = shopHistory.slice(0, shopHistoryIndex+1);
  shopHistory.push(shopSnapshot());
  shopHistoryIndex = shopHistory.length - 1;
  if(shopHistory.length > SHOP_MAX_HISTORY){
    shopHistory.shift();
    shopHistoryIndex--;
  }
  updateShopUndoRedoButtons();
}

function updateShopUndoRedoButtons(){
  const u = document.getElementById('shopUndoBtn');
  const r = document.getElementById('shopRedoBtn');
  if(u) u.disabled = shopHistoryIndex <= 0;
  if(r) r.disabled = shopHistoryIndex >= shopHistory.length - 1;
}

async function applyShopSnapshot(snapshot){
  const oldIds = new Set(shoppingItems.map(i=>i.id));
  const newIds = new Set(snapshot.map(i=>i.id));
  const toDelete = [...oldIds].filter(id=>!newIds.has(id));
  shoppingItems = JSON.parse(JSON.stringify(snapshot));
  for(const id of toDelete){ await removeShopItemRemote(id); }
  for(const i of shoppingItems){ await persistShopItem(i); }
  renderShoppingView();
}

function shopUndo(){
  if(shopHistoryIndex <= 0) return;
  shopHistoryIndex--;
  updateShopUndoRedoButtons();
  applyShopSnapshot(shopHistory[shopHistoryIndex]);
}

function shopRedo(){
  if(shopHistoryIndex >= shopHistory.length - 1) return;
  shopHistoryIndex++;
  updateShopUndoRedoButtons();
  applyShopSnapshot(shopHistory[shopHistoryIndex]);
}

let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

function snapshotTasks(){
  return JSON.parse(JSON.stringify(tasks));
}

function initHistory(){
  history = [snapshotTasks()];
  historyIndex = 0;
  updateUndoRedoButtons();
}

function commitHistory(){
  history = history.slice(0, historyIndex+1);
  history.push(snapshotTasks());
  historyIndex = history.length - 1;
  if(history.length > MAX_HISTORY){
    history.shift();
    historyIndex--;
  }
  updateUndoRedoButtons();
}

function updateUndoRedoButtons(){
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if(u) u.disabled = historyIndex <= 0;
  if(r) r.disabled = historyIndex >= history.length - 1;
}

async function applySnapshot(snapshot){
  const oldIds = new Set(tasks.map(t=>t.id));
  const newIds = new Set(snapshot.map(t=>t.id));
  const toDelete = [...oldIds].filter(id=>!newIds.has(id));
  tasks = JSON.parse(JSON.stringify(snapshot));
  for(const id of toDelete){ await removeTaskRemote(id); }
  for(const t of tasks){ await persistTask(t); }
  render();
}

function undo(){
  if(historyIndex <= 0) return;
  historyIndex--;
  updateUndoRedoButtons();
  applySnapshot(history[historyIndex]);
}

function redo(){
  if(historyIndex >= history.length - 1) return;
  historyIndex++;
  updateUndoRedoButtons();
  applySnapshot(history[historyIndex]);
}

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
    taskDate: bucket==='today' ? due : null,
    rollCount: 0,
    recurDays,
    completedDates: [],
    sortOrder: Date.now(),
    done: false,
    completedAt: null,
    createdAt: Date.now()
  };
  tasks.push(newTask);
  titleEl.value='';
  document.getElementById('chipUrgent').classList.remove('on-urgent');
  document.getElementById('chipImportant').classList.remove('on-important');
  document.getElementById('qaDue').value = todayStr();
  document.querySelectorAll('#recurDays .day-chip.on').forEach(el=>el.classList.remove('on'));
  persistTask(newTask);
  commitHistory();
  render();
}

document.getElementById('qaTitle').addEventListener('keydown', e=>{
  if(e.key==='Enter') addTask();
});

document.getElementById('shopItemInput').addEventListener('keydown', e=>{
  if(e.key==='Enter') addShopItem();
});

document.getElementById('habitNameInput').addEventListener('keydown', e=>{
  if(e.key==='Enter') addHabit();
});

document.getElementById('foodInput').addEventListener('keydown', e=>{
  if(e.key==='Enter') logFood();
});

document.getElementById('exerciseInput').addEventListener('keydown', e=>{
  if(e.key==='Enter') logExercise();
});

document.getElementById('weightInput').addEventListener('keydown', e=>{
  if(e.key==='Enter') logWeight();
});

document.getElementById('searchInput').addEventListener('input', e=>{
  searchQuery = e.target.value.trim().toLowerCase();
  document.getElementById('searchClearBtn').style.display = searchQuery ? 'inline' : 'none';
  render();
});

function clearSearch(){
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClearBtn').style.display = 'none';
  render();
}

let recognition = null;
let listening = false;

function initSpeechRecognition(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return null;
  const r = new SR();
  r.continuous = false;
  r.interimResults = false;
  r.lang = 'en-AU';
  return r;
}

function toggleVoice(){
  if(listening){
    if(recognition) recognition.stop();
    return;
  }
  if(!recognition){
    recognition = initSpeechRecognition();
  }
  if(!recognition){
    alert("Voice input isn't supported in this browser. Try Chrome or Edge.");
    return;
  }
  const titleEl = document.getElementById('qaTitle');
  const micBtn = document.getElementById('micBtn');
  recognition.onstart = ()=>{
    listening = true;
    micBtn.classList.add('listening');
  };
  recognition.onresult = (evt)=>{
    const transcript = evt.results[0][0].transcript;
    titleEl.value = titleEl.value.trim() ? titleEl.value.trim() + ' ' + transcript : transcript;
    titleEl.focus();
  };
  recognition.onerror = (evt)=>{
    console.error('Speech recognition error', evt.error);
    listening = false;
    micBtn.classList.remove('listening');
  };
  recognition.onend = ()=>{
    listening = false;
    micBtn.classList.remove('listening');
  };
  recognition.start();
}

/* ---------- Complete / delete ---------- */

function toggleDone(evt, id){
  const t = tasks.find(x=>x.id===id);
  if(t){
    t.done = !t.done;
    t.completedAt = t.done ? Date.now() : null;
    if(t.done && evt) celebrate(evt.currentTarget);
    persistTask(t);
  }
  commitHistory();
  render();
}

function deleteTask(id){
  tasks = tasks.filter(x=>x.id!==id);
  removeTaskRemote(id);
  commitHistory();
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
  if(newBucket==='today'){
    if(t.bucket!=='today') t.rollCount = 0;
    t.taskDate = t.due || todayStr();
    if(!t.due) t.due = t.taskDate;
  }
  t.bucket = newBucket;
  closeEditModal();
  persistTask(t);
  commitHistory();
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
    t.due = newDate;
    t.rollCount = 0;
  }else{
    t.due = newDate;
  }
  closeMoveModal();
  persistTask(t);
  commitHistory();
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
    t.completedAt = t.done ? Date.now() : null;
    nowDone = t.done;
  }
  if(nowDone && evt) celebrate(evt.currentTarget);
  persistTask(t);
  commitHistory();
  renderTodayView();
  renderCounts();
}

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

let dragState = null;

function dragStart(evt, id, context){
  dragState = {id, context};
  evt.dataTransfer.effectAllowed = 'move';
  try{ evt.dataTransfer.setData('text/plain', id); }catch(e){}
}

function dragOverRow(evt){
  evt.preventDefault();
  evt.dataTransfer.dropEffect = 'move';
}

function dragEnterRow(evt){
  evt.currentTarget.classList.add('drag-over');
}

function dragLeaveRow(evt){
  evt.currentTarget.classList.remove('drag-over');
}

function dropRow(evt, targetId, context){
  evt.preventDefault();
  evt.currentTarget.classList.remove('drag-over');
  if(!dragState || dragState.context !== context || dragState.id === targetId){ dragState = null; return; }
  reorderByDrag(dragState.id, targetId, context);
  dragState = null;
}

function dragEnd(evt){
  dragState = null;
  document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
}

function reorderByDrag(draggedId, targetId, context){
  const t = tasks.find(x=>x.id===draggedId);
  if(!t) return;
  const cat = t.category || 'work';
  const group = sortByOrder(contextList(context).filter(x=> (x.category||'work')===cat && !contextIsDone(x, context)));
  const fromIdx = group.findIndex(x=>x.id===draggedId);
  const toIdx = group.findIndex(x=>x.id===targetId);
  if(fromIdx<0 || toIdx<0) return;
  const [moved] = group.splice(fromIdx,1);
  group.splice(toIdx,0,moved);
  group.forEach((item,i)=>{
    item.sortOrder = (i+1)*1000;
    persistTask(item);
  });
  commitHistory();
  if(context.startsWith('bucket:')) renderBucketView(context.slice(7));
  else renderTodayView();
  renderCounts();
}

function diaryRowHtml(t, dateStr){
  const q = quadKey(t);
  const done = isDoneForDate(t, dateStr);
  const context = `diary:${dateStr}`;
  const rc = rowCatAttrs(t.category||'work');
  const tc = tagCatAttrs(t.category||'work');
  const metaParts = [];
  if(t.bucket==='recurring') metaParts.push('Recurring');
  if(t.due && t.bucket!=='today') metaParts.push('Due ' + t.due);
  if(t.rollCount) metaParts.push(`<span class="rolled">Moved ${t.rollCount}x</span>`);
  const draggable = !done && sortMode['today']!=='alpha';
  const dragAttrs = draggable ? `ondragover="dragOverRow(event)" ondragenter="dragEnterRow(event)" ondragleave="dragLeaveRow(event)" ondrop="dropRow(event,'${t.id}','${context}')"` : '';
  const handle = draggable ? `<span class="draghandle" draggable="true" ondragstart="dragStart(event,'${t.id}','${context}')" ondragend="dragEnd(event)" title="Drag to reorder">&#8942;&#8942;</span>` : '<span class="draghandle-spacer"></span>';
  return `
    <div class="listrow q-${quadClass(t)} ${rc.cls} ${done?'done':''}" style="${rc.style}" ${dragAttrs}>
      ${handle}
      <div class="chk" onclick="toggleInstanceDone(event,'${t.id}','${dateStr}')">${done?'✓':''}</div>
      <div class="body">
        <div class="title">${escapeHtml(t.title)}</div>
        <div class="meta">
          <span class="tag ${q}">${quadLabel(q)}</span>
          <span class="tag cat ${tc.cls}" style="${tc.style}">${escapeHtml(getCategory(t.category||'work').label)}</span>
          ${metaParts.map(m=>`<span>${m.startsWith('<')?m:escapeHtml(m)}</span>`).join('')}
        </div>
      </div>
      <div class="actions">
        ${t.bucket!=='recurring'?`<span class="act" onclick="openMoveModal('${t.id}')">&#8594;</span>`:''}
        <span class="act" onclick="openEditModal('${t.id}')">&#9998;</span>
        <span class="act del" onclick="deleteTask('${t.id}')">&times;</span>
      </div>
    </div>`;
}

function sortKeyFromContext(context){
  if(!context) return null;
  if(context.startsWith('bucket:')) return context.slice(7);
  if(context.startsWith('diary:')) return 'today';
  return null;
}

function toggleSortMode(view){
  sortMode[view] = (sortMode[view]==='alpha') ? 'manual' : 'alpha';
  if(view==='today') renderTodayView(); else renderBucketView(view);
}

function matchesSearch(t){
  if(!searchQuery) return true;
  return (t.title||'').toLowerCase().includes(searchQuery);
}

function sortForView(view, list){
  return sortMode[view]==='alpha'
    ? [...list].sort((a,b)=> (a.title||'').localeCompare(b.title||''))
    : sortByOrder(list);
}

function renderTodayView(){
  const el = document.getElementById('view-today');
  const isToday = viewDate === todayStr();
  let list = tasksForDate(viewDate);
  if(searchQuery) list = list.filter(matchesSearch);
  if(categoryFilter.today && categoryFilter.today!=='all') list = list.filter(t=>(t.category||'work')===categoryFilter.today);
  let html = `
    <div class="weekstrip">
      <button class="navbtn" onclick="shiftViewWeek(-1)">&larr;</button>
      <div class="weekdays">${weekStripHtml(viewDate)}</div>
      <button class="navbtn" onclick="shiftViewWeek(1)">&rarr;</button>
    </div>
    <div class="diarydate">${fmtDateHeading(viewDate)}${isToday?' <span class="todaybadge">Today</span>':''}</div>
    ${!isToday?'<div class="jumprow"><button class="jumpbtn" onclick="jumpToday()">Jump to today</button></div>':''}`;
  const onLeave = leaveOnDate(viewDate);
  if(onLeave.length>0){
    html += `<div class="leavebanner-inline">&#127796; On leave: ${onLeave.map(l=>escapeHtml(l.staffName)).join(', ')}</div>`;
  }
  html += catFilterHtml('today');
  let any = false;
  allCategories().forEach(cat=>{
    const open = sortForView('today', list.filter(t=> (t.category||'work')===cat.key && !isDoneForDate(t, viewDate)));
    if(open.length===0) return;
    any = true;
    const hc = headCatAttrs(cat.key);
    html += `<div class="cathead ${hc.cls}" style="${hc.style}">${escapeHtml(cat.label)}</div>`;
    open.forEach((t)=>{ html += diaryRowHtml(t, viewDate); });
  });
  const doneList = sortByOrder(list.filter(t=>isDoneForDate(t, viewDate)));
  if(doneList.length>0){
    any = true;
    html += `<div class="cathead cathead-done">Completed</div>`;
    doneList.forEach(t=>{ html += diaryRowHtml(t, viewDate); });
  }
  if(!any) html += `<div class="empty">Nothing on for this day.</div>`;
  el.innerHTML = html;
}

/* ---------- Bucket views ---------- */

function rowHtml(t, context){
  const q = quadKey(t);
  const rc = rowCatAttrs(t.category||'work');
  const tc = tagCatAttrs(t.category||'work');
  const metaParts = [];
  if(t.due) metaParts.push('Due ' + t.due);
  if(t.bucket==='recurring' && t.recurDays && t.recurDays.length){
    metaParts.push(t.recurDays.map(d=>DAY_LABELS[d]).join(' '));
  }
  if(t.rollCount){
    metaParts.push(`<span class="rolled">Moved ${t.rollCount}x</span>`);
  }
  const draggable = context && !t.done && sortMode[sortKeyFromContext(context)]!=='alpha';
  const dragAttrs = draggable ? `ondragover="dragOverRow(event)" ondragenter="dragEnterRow(event)" ondragleave="dragLeaveRow(event)" ondrop="dropRow(event,'${t.id}','${context}')"` : '';
  const handle = draggable ? `<span class="draghandle" draggable="true" ondragstart="dragStart(event,'${t.id}','${context}')" ondragend="dragEnd(event)" title="Drag to reorder">&#8942;&#8942;</span>` : '<span class="draghandle-spacer"></span>';
  return `
    <div class="listrow q-${quadClass(t)} ${rc.cls} ${t.done?'done':''}" style="${rc.style}" ${dragAttrs}>
      ${handle}
      <div class="chk" onclick="toggleDone(event,'${t.id}')">${t.done?'✓':''}</div>
      <div class="body">
        <div class="title">${escapeHtml(t.title)}</div>
        <div class="meta">
          <span class="tag ${q}">${quadLabel(q)}</span>
          <span class="tag cat ${tc.cls}" style="${tc.style}">${escapeHtml(getCategory(t.category||'work').label)}</span>
          ${metaParts.map(m=>`<span>${m.startsWith('<')?m:escapeHtml(m)}</span>`).join('')}
        </div>
      </div>
      <div class="actions">
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
  if(bucket==='week'){
    const start = todayStr();
    const endD = new Date();
    endD.setDate(endD.getDate()+6);
    const end = fmtLocalDate(endD);
    return tasks.filter(t=> (t.bucket==='week' || (t.due && t.due>=start && t.due<=end))
      && (cf==='all' || (t.category||'work')===cf));
  }
  return tasks.filter(t=> t.bucket===bucket
    && (cf==='all' || (t.category||'work')===cf));
}

function weekTotalOpen(){
  const start = todayStr();
  const endD = new Date();
  endD.setDate(endD.getDate()+6);
  const end = fmtLocalDate(endD);
  return tasks.filter(t=> !t.done && (t.bucket==='week' || (t.due && t.due>=start && t.due<=end))).length;
}

function setCatFilter(bucket, c){
  categoryFilter[bucket] = c;
  if(bucket==='today') renderTodayView(); else renderBucketView(bucket);
}

function catFilterHtml(bucket){
  const opts = [{key:'all', label:'All'}, ...allCategories()];
  let html = `<div class="catfilter">` + opts.map(c=>
    `<span class="catchip ${categoryFilter[bucket]===c.key?'on':''}" onclick="setCatFilter('${bucket}','${c.key}')">${escapeHtml(c.label)}</span>`
  ).join('');
  html += `<span class="catchip sort-toggle ${sortMode[bucket]==='alpha'?'on':''}" onclick="toggleSortMode('${bucket}')" title="Sort A to Z">A&rarr;Z</span>`;
  html += `</div>`;
  return html;
}

function renderBucketView(bucket){
  const el = document.getElementById('view-'+bucket);
  let list = listForBucket(bucket);
  if(searchQuery) list = list.filter(matchesSearch);
  const context = `bucket:${bucket}`;
  let html = catFilterHtml(bucket);
  let any = false;
  allCategories().forEach(cat=>{
    const open = sortForView(bucket, list.filter(t=> (t.category||'work')===cat.key && !t.done));
    if(open.length===0) return;
    any = true;
    const hc = headCatAttrs(cat.key);
    html += `<div class="cathead ${hc.cls}" style="${hc.style}">${escapeHtml(cat.label)}</div>`;
    open.forEach((t)=>{ html += rowHtml(t, context); });
  });
  const doneList = sortByOrder(list.filter(t=>t.done));
  if(doneList.length>0){
    any = true;
    html += `<div class="cathead cathead-done">Completed</div>`;
    doneList.forEach(t=>{ html += rowHtml(t, context); });
  }
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
  let open = tasks.filter(t=>!t.done);
  if(searchQuery) open = open.filter(matchesSearch);
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
    html += `<div class="jumpbtn" style="display:inline-block;margin-bottom:12px;cursor:pointer;" onclick="clearMatrixFilter()">&larr; Show all quadrants</div>`;
  }
  html += '<div class="matrix">';
  keys.forEach(k=>{
    html += `<div class="quad ${k}"><h3>${labels[k][0]}<span style="font-weight:400;text-transform:none;">${labels[k][1]}</span></h3>`;
    if(groups[k].length===0){
      html += `<div class="empty">Nothing here.</div>`;
    }else{
      html += sortByOrder(groups[k]).map(t=>rowHtml(t, null)).join('');
    }
    html += `</div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

/* ---------- Tabs / counts / render ---------- */

function switchMode(mode){
  document.getElementById('modeTasksBtn').classList.toggle('active', mode==='tasks');
  document.getElementById('modeShoppingBtn').classList.toggle('active', mode==='shopping');
  document.getElementById('modeHabitsBtn').classList.toggle('active', mode==='habits');
  document.getElementById('modeHealthBtn').classList.toggle('active', mode==='health');
  document.getElementById('tasksMode').style.display = mode==='tasks' ? '' : 'none';
  document.getElementById('shoppingMode').style.display = mode==='shopping' ? '' : 'none';
  document.getElementById('habitsMode').style.display = mode==='habits' ? '' : 'none';
  document.getElementById('healthMode').style.display = mode==='health' ? '' : 'none';
  if(mode==='shopping') renderShoppingView();
  if(mode==='habits') renderHabitsView();
  if(mode==='health') renderHealthView();
}

function switchTab(view){
  activeTab = view;
  document.querySelectorAll('.tab').forEach(t=> t.classList.toggle('active', t.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=> v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  render();
}

function statsWeekRange(){
  const d = new Date();
  const dow = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate()-dow);
  const end = new Date(start);
  end.setDate(start.getDate()+6);
  return {start: fmtLocalDate(start), end: fmtLocalDate(end)};
}

function completedThisWeekCount(){
  const {start, end} = statsWeekRange();
  let n = 0;
  tasks.forEach(t=>{
    if(t.bucket==='recurring'){
      (t.completedDates||[]).forEach(ds=>{ if(ds>=start && ds<=end) n++; });
    }else if(t.done && t.completedAt){
      const ds = fmtLocalDate(new Date(t.completedAt));
      if(ds>=start && ds<=end) n++;
    }
  });
  return n;
}

function addedThisWeekCount(){
  const {start, end} = statsWeekRange();
  return tasks.filter(t=>{
    const ds = fmtLocalDate(new Date(t.createdAt));
    return ds>=start && ds<=end;
  }).length;
}

function renderWeekStats(){
  const completed = completedThisWeekCount();
  const added = addedThisWeekCount();
  const due = weekTotalOpen();
  const rate = (completed+due)>0 ? Math.round((completed/(completed+due))*100) : 0;
  document.getElementById('wsCompleted').textContent = completed;
  document.getElementById('wsAdded').textContent = added;
  document.getElementById('wsDue').textContent = due;
  document.getElementById('wsRate').textContent = rate + '%';
}

function renderCounts(){
  const todayN = tasksForDate(todayStr()).filter(t=>!isDoneForDate(t, todayStr())).length;
  document.getElementById('cnt-today').textContent = todayN>0 ? todayN : '';
  const weekN = weekTotalOpen();
  document.getElementById('cnt-week').textContent = weekN>0 ? weekN : '';
  const recN = tasks.filter(t=>t.bucket==='recurring' && !t.done).length;
  document.getElementById('cnt-recurring').textContent = recN>0 ? recN : '';
  document.getElementById('statOpen').textContent = tasks.filter(t=>!t.done).length;
  document.getElementById('statToday').textContent = todayN;
  document.getElementById('statUrgent').textContent = tasks.filter(t=>t.urgent && t.important && !t.done).length;
  renderWeekStats();
  renderLeaveBanner();
}

function render(){
  renderCounts();
  if(activeTab==='matrix'){
    renderMatrix();
  }else if(activeTab==='today'){
    renderTodayView();
  }else if(activeTab==='leave'){
    renderLeaveView();
  }else{
    renderBucketView(activeTab);
  }
}

/* ---------- Health Log ---------- */

let healthSettings = { calories:2100, protein:180, carbs:210, fat:60, goalWeight:null };

async function loadHealthSettings(){
  try{
    const { data, error } = await sb.from('health_settings').select('*').eq('user_id', currentUser.id).maybeSingle();
    if(error) throw error;
    if(data){
      healthSettings = {
        calories: data.calories, protein: data.protein, carbs: data.carbs, fat: data.fat,
        goalWeight: data.goal_weight != null ? parseFloat(data.goal_weight) : null
      };
    }
  }catch(e){
    console.error('Load health settings failed', e);
  }
}

async function saveHealthSettingsData(){
  try{
    const { error } = await sb.from('health_settings').upsert({
      user_id: currentUser.id,
      calories: healthSettings.calories, protein: healthSettings.protein,
      carbs: healthSettings.carbs, fat: healthSettings.fat,
      goal_weight: healthSettings.goalWeight,
      updated_at: new Date().toISOString()
    });
    if(error) console.error('Save health settings failed', error);
  }catch(e){
    console.error('Save health settings failed', e);
  }
}

function openHealthSettingsModal(){
  document.getElementById('targetCalories').value = healthSettings.calories;
  document.getElementById('targetProtein').value = healthSettings.protein;
  document.getElementById('targetCarbs').value = healthSettings.carbs;
  document.getElementById('targetFat').value = healthSettings.fat;
  document.getElementById('targetGoalWeight').value = healthSettings.goalWeight != null ? healthSettings.goalWeight : '';
  document.getElementById('healthSettingsModal').style.display = 'flex';
}

function closeHealthSettingsModal(){
  document.getElementById('healthSettingsModal').style.display = 'none';
}

function saveHealthSettingsForm(){
  healthSettings.calories = parseInt(document.getElementById('targetCalories').value) || healthSettings.calories;
  healthSettings.protein = parseInt(document.getElementById('targetProtein').value) || healthSettings.protein;
  healthSettings.carbs = parseInt(document.getElementById('targetCarbs').value) || healthSettings.carbs;
  healthSettings.fat = parseInt(document.getElementById('targetFat').value) || healthSettings.fat;
  const gw = parseFloat(document.getElementById('targetGoalWeight').value);
  healthSettings.goalWeight = isNaN(gw) ? null : gw;
  saveHealthSettingsData();
  closeHealthSettingsModal();
  renderHealthView();
}

let foodLog = [];
let exerciseLog = [];
let weightLog = [];

async function loadHealthLogs(){
  try{
    const [{data:fd,error:fe},{data:ed,error:ee},{data:wd,error:we}] = await Promise.all([
      sb.from('food_log').select('*').order('created_at',{ascending:true}),
      sb.from('exercise_log').select('*').order('created_at',{ascending:true}),
      sb.from('weight_log').select('*').order('log_date',{ascending:true})
    ]);
    if(fe) throw fe; if(ee) throw ee; if(we) throw we;
    foodLog = (fd||[]).map(r=>({id:r.id, date:r.log_date, description:r.description, calories:r.calories, protein:r.protein, carbs:r.carbs, fat:r.fat, photoUrl:r.photo_url||null, createdAt: r.created_at?new Date(r.created_at).getTime():Date.now()}));
    exerciseLog = (ed||[]).map(r=>({id:r.id, date:r.log_date, description:r.description, caloriesBurned:r.calories_burned, durationMinutes:r.duration_minutes, createdAt: r.created_at?new Date(r.created_at).getTime():Date.now()}));
    weightLog = (wd||[]).map(r=>({id:r.id, date:r.log_date, weight:parseFloat(r.weight), createdAt: r.created_at?new Date(r.created_at).getTime():Date.now()}));
  }catch(e){
    console.error('Load health logs failed', e);
    foodLog = []; exerciseLog = []; weightLog = [];
  }
}

async function persistFoodEntry(f){
  try{
    const { error } = await sb.from('food_log').upsert({
      id:f.id, user_id: currentUser.id, log_date:f.date, description:f.description,
      calories:f.calories, protein:f.protein, carbs:f.carbs, fat:f.fat, photo_url:f.photoUrl||null,
      created_at: f.createdAt ? new Date(f.createdAt).toISOString() : new Date().toISOString()
    });
    if(error) console.error('Save food entry failed', error);
  }catch(e){ console.error('Save food entry failed', e); }
}

async function removeFoodEntryRemote(id){
  try{ const { error } = await sb.from('food_log').delete().eq('id', id); if(error) console.error(error); }
  catch(e){ console.error(e); }
}

async function persistExerciseEntry(x){
  try{
    const { error } = await sb.from('exercise_log').upsert({
      id:x.id, user_id: currentUser.id, log_date:x.date, description:x.description,
      calories_burned:x.caloriesBurned, duration_minutes:x.durationMinutes||null,
      created_at: x.createdAt ? new Date(x.createdAt).toISOString() : new Date().toISOString()
    });
    if(error) console.error('Save exercise entry failed', error);
  }catch(e){ console.error('Save exercise entry failed', e); }
}

async function removeExerciseEntryRemote(id){
  try{ const { error } = await sb.from('exercise_log').delete().eq('id', id); if(error) console.error(error); }
  catch(e){ console.error(e); }
}

async function persistWeightEntry(w){
  try{
    const { error } = await sb.from('weight_log').upsert({
      id:w.id, user_id: currentUser.id, log_date:w.date, weight:w.weight,
      created_at: w.createdAt ? new Date(w.createdAt).toISOString() : new Date().toISOString()
    });
    if(error) console.error('Save weight entry failed', error);
  }catch(e){ console.error('Save weight entry failed', e); }
}

// Calls YOUR serverless function at /api/estimate — never Anthropic directly.
async function estimateFood(text){
  const res = await fetch('/api/estimate', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({type:'food', text})
  });
  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error || 'Estimate failed');
  }
  return res.json();
}

async function estimateExercise(text){
  const res = await fetch('/api/estimate', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({type:'exercise', text})
  });
  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error || 'Estimate failed');
  }
  return res.json();
}

async function logFood(){
  const el = document.getElementById('foodInput');
  const text = el.value.trim();
  if(!text) return;
  const btn = document.getElementById('foodAddBtn');
  btn.disabled = true; btn.textContent = '...';
  try{
    const result = await estimateFood(text);
    const entry = {
      id: uid(), date: todayStr(),
      description: result.description || text,
      calories: Math.round(result.calories||0),
      protein: Math.round(result.protein||0),
      carbs: Math.round(result.carbs||0),
      fat: Math.round(result.fat||0),
      photoUrl: pendingFoodPhoto,
      createdAt: Date.now()
    };
    foodLog.push(entry);
    persistFoodEntry(entry);
    el.value = '';
    clearFoodPhoto();
    renderHealthView();
  }catch(e){
    console.error(e);
    alert("Couldn't estimate that food item. Try rephrasing and log again.");
  }finally{
    btn.disabled = false; btn.textContent = 'Log';
  }
}

async function logExercise(){
  const el = document.getElementById('exerciseInput');
  const text = el.value.trim();
  if(!text) return;
  const btn = document.getElementById('exerciseAddBtn');
  btn.disabled = true; btn.textContent = '...';
  try{
    const result = await estimateExercise(text);
    const entry = {
      id: uid(), date: todayStr(),
      description: result.description || text,
      caloriesBurned: Math.round(result.caloriesBurned||0),
      durationMinutes: result.durationMinutes ? Math.round(result.durationMinutes) : null,
      createdAt: Date.now()
    };
    exerciseLog.push(entry);
    persistExerciseEntry(entry);
    el.value = '';
    renderHealthView();
  }catch(e){
    console.error(e);
    alert("Couldn't estimate that exercise entry. Try rephrasing and log again.");
  }finally{
    btn.disabled = false; btn.textContent = 'Log';
  }
}

function logWeight(){
  const el = document.getElementById('weightInput');
  const val = parseFloat(el.value);
  if(!val || isNaN(val)) return;
  const today = todayStr();
  let entry = weightLog.find(w=>w.date===today);
  if(entry){
    entry.weight = val;
  }else{
    entry = {id: uid(), date: today, weight: val, createdAt: Date.now()};
    weightLog.push(entry);
  }
  persistWeightEntry(entry);
  el.value = '';
  renderHealthView();
}

function deleteFoodEntry(id){
  foodLog = foodLog.filter(f=>f.id!==id);
  removeFoodEntryRemote(id);
  renderHealthView();
}

function deleteExerciseEntry(id){
  exerciseLog = exerciseLog.filter(x=>x.id!==id);
  removeExerciseEntryRemote(id);
  renderHealthView();
}

function todayTotals(){
  const today = todayStr();
  const foods = foodLog.filter(f=>f.date===today);
  const exs = exerciseLog.filter(x=>x.date===today);
  const eaten = foods.reduce((s,f)=>s+f.calories,0);
  const burned = exs.reduce((s,x)=>s+x.caloriesBurned,0);
  const protein = foods.reduce((s,f)=>s+f.protein,0);
  const carbs = foods.reduce((s,f)=>s+f.carbs,0);
  const fat = foods.reduce((s,f)=>s+f.fat,0);
  return {eaten, burned, net: eaten-burned, protein, carbs, fat};
}

function foodRowHtml(f){
  const thumb = f.photoUrl ? `<img class="food-thumb" src="${f.photoUrl}" onclick="viewFoodPhoto('${f.id}')">` : '';
  return `<div class="health-row">
    ${thumb}
    <div>
      <div class="health-row-desc">${escapeHtml(f.description)}</div>
      <div class="health-row-macros">${f.calories} cal &middot; P ${f.protein}g &middot; C ${f.carbs}g &middot; F ${f.fat}g</div>
    </div>
    <span class="del" onclick="deleteFoodEntry('${f.id}')">&times;</span>
  </div>`;
}

function exerciseRowHtml(x){
  return `<div class="health-row">
    <div>
      <div class="health-row-desc">${escapeHtml(x.description)}</div>
      <div class="health-row-macros">${x.caloriesBurned} cal burned${x.durationMinutes?' &middot; '+x.durationMinutes+' min':''}</div>
    </div>
    <span class="del" onclick="deleteExerciseEntry('${x.id}')">&times;</span>
  </div>`;
}

function renderHealthSummary(){
  const el = document.getElementById('healthSummary');
  if(!el) return;
  const t = todayTotals();
  const latest = [...weightLog].sort((a,b)=> b.date.localeCompare(a.date))[0];
  const overCal = t.net > healthSettings.calories;
  el.innerHTML = `
    <div class="stat-chip"><span class="num">${t.eaten}</span><span class="lbl">Eaten</span></div>
    <div class="stat-chip"><span class="num">${t.burned}</span><span class="lbl">Burned</span></div>
    <div class="stat-chip ${overCal?'over':''}"><span class="num">${t.net}</span><span class="lbl">Net / ${healthSettings.calories}</span></div>
    <div class="stat-chip"><span class="num">${t.protein}g</span><span class="lbl">Protein / ${healthSettings.protein}g</span></div>
    <div class="stat-chip"><span class="num">${t.carbs}g</span><span class="lbl">Carbs / ${healthSettings.carbs}g</span></div>
    <div class="stat-chip"><span class="num">${t.fat}g</span><span class="lbl">Fat / ${healthSettings.fat}g</span></div>
    <div class="stat-chip"><span class="num">${latest?latest.weight:'—'}</span><span class="lbl">Weight${latest && latest.date!==todayStr() ? ' ('+fmtDateShort(latest.date)+')' : ''}</span></div>
  `;
}

function renderWeightGoalCard(){
  const el = document.getElementById('weightGoalCard');
  if(!el) return;
  const sorted = [...weightLog].sort((a,b)=> a.date.localeCompare(b.date));
  if(sorted.length===0 || healthSettings.goalWeight==null){
    el.innerHTML = `<div class="weight-goal-empty">Log a weight and set a goal weight (&#9881; above) to see your progress here.</div>`;
    return;
  }
  const start = sorted[0].weight;
  const current = sorted[sorted.length-1].weight;
  const goal = healthSettings.goalWeight;
  const totalDelta = start - goal;
  const progressDelta = start - current;
  let pct = totalDelta !== 0 ? (progressDelta/totalDelta)*100 : 0;
  pct = Math.max(0, Math.min(100, pct));
  const remaining = Math.abs(current - goal);
  const direction = goal < start ? 'lose' : 'gain';
  const reached = (direction==='lose' && current<=goal) || (direction==='gain' && current>=goal);
  const emoji = reached ? '🎉' : pct>=75 ? '🎯' : pct>=40 ? '💪' : '🚀';
  el.innerHTML = `
    <div class="weight-goal-top">
      <div class="weight-goal-emoji">${emoji}</div>
      <div class="weight-goal-stats">
        <div class="wg-stat"><span class="wg-num">${start}</span><span class="wg-lbl">Start</span></div>
        <div class="wg-stat current"><span class="wg-num">${current}</span><span class="wg-lbl">Current</span></div>
        <div class="wg-stat"><span class="wg-num">${goal}</span><span class="wg-lbl">Goal</span></div>
      </div>
    </div>
    <div class="weight-goal-bar"><div class="weight-goal-fill" style="width:${pct}%;"></div></div>
    <div class="weight-goal-caption">${reached ? 'Goal reached! &#127881;' : `${remaining}kg to go &middot; ${Math.round(pct)}% of the way there`}</div>
  `;
}

function progressBarRow(label, value, target, color){
  const pct = target>0 ? Math.min(100, Math.round((value/target)*100)) : 0;
  const over = value > target;
  return `
    <div class="progress-row">
      <div class="progress-label"><span>${label}</span><span>${value} / ${target}${over?' &#9888;':''}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${over?'var(--q1)':color};"></div></div>
    </div>`;
}

function renderDailyProgress(){
  const el = document.getElementById('dailyProgressCard');
  if(!el) return;
  const t = todayTotals();
  el.innerHTML = `
    <h3>Today's Progress</h3>
    ${progressBarRow('Net Calories', t.net, healthSettings.calories, 'var(--accent)')}
    ${progressBarRow('Protein', t.protein, healthSettings.protein, 'var(--catwork)')}
    ${progressBarRow('Carbs', t.carbs, healthSettings.carbs, 'var(--q3)')}
    ${progressBarRow('Fat', t.fat, healthSettings.fat, 'var(--catissues)')}
  `;
}

let pendingFoodPhoto = null;

function resizeImageFile(file, maxWidth, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxWidth){
          h = Math.round(h * (maxWidth/w));
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById('foodPhotoInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    pendingFoodPhoto = await resizeImageFile(file, 500, 0.65);
    const preview = document.getElementById('foodPhotoPreview');
    preview.innerHTML = `<img src="${pendingFoodPhoto}"><span class="act del" onclick="clearFoodPhoto()">&times;</span>`;
    preview.style.display = 'flex';
  }catch(err){
    console.error(err);
  }
});

function clearFoodPhoto(){
  pendingFoodPhoto = null;
  document.getElementById('foodPhotoInput').value = '';
  document.getElementById('foodPhotoPreview').style.display = 'none';
  document.getElementById('foodPhotoPreview').innerHTML = '';
}

function viewFoodPhoto(id){
  const f = foodLog.find(x=>x.id===id);
  if(!f || !f.photoUrl) return;
  document.getElementById('lightboxImg').src = f.photoUrl;
  document.getElementById('photoLightbox').style.display = 'flex';
}

function closePhotoLightbox(){
  document.getElementById('photoLightbox').style.display = 'none';
}

function renderHealthView(){
  renderHealthSummary();
  renderWeightGoalCard();
  renderDailyProgress();
  const today = todayStr();

  const foodEl = document.getElementById('foodListInner');
  if(foodEl){
    const foods = foodLog.filter(f=>f.date===today);
    foodEl.innerHTML = foods.length ? foods.map(foodRowHtml).join('') : '<div class="empty">No food logged today.</div>';
  }

  const exEl = document.getElementById('exerciseListInner');
  if(exEl){
    const exs = exerciseLog.filter(x=>x.date===today);
    exEl.innerHTML = exs.length ? exs.map(exerciseRowHtml).join('') : '<div class="empty">No exercise logged today.</div>';
  }

  const weightNote = document.getElementById('weightNote');
  if(weightNote){
    const todayWeight = weightLog.find(w=>w.date===today);
    weightNote.textContent = todayWeight ? `Logged today: ${todayWeight.weight}` : 'Not logged today';
  }
}

checkSession();
