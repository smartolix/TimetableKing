/* ================= Hilfsfunktionen ================= */
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
function byId(coll, id) { for (var i = 0; i < coll.length; i++) if (coll[i].id === id) return coll[i]; return null; }

var I = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h12"/><path d="m11 8 4 4-4 4"/><path d="M21 4v16"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17v.5"/></svg>'
};

/* ================= Zustand ================= */
var LS_KEY = 'stundenwerk.v1';
var SECTIONS = ['settings', 'subjects', 'teachers', 'classes', 'rooms', 'lessons', 'relations', 'placements', 'absences', 'subs'];

function sampleWithPlan() {
  var s = sampleState();
  Object.keys(SAMPLE_PLACEMENTS).forEach(function (id) { var a = SAMPLE_PLACEMENTS[id]; s.placements[id] = { d: a[0], p: a[1], rooms: a[2] || [], pool: a[3] || null, locked: false }; });
  return s;
}

function normalize(s) {
  var base = emptyState();
  s = s || {};
  if (s.version !== 2 && s.settings && s.settings.isSample) return sampleWithPlan();
  var arr = function (x) { return Array.isArray(x) ? x : []; };
  var out = {
    version: 2,
    settings: Object.assign({}, base.settings, s.settings || {}),
    subjects: arr(s.subjects), teachers: arr(s.teachers), classes: arr(s.classes), rooms: arr(s.rooms), lessons: arr(s.lessons),
    relations: arr(s.relations), absences: arr(s.absences),
    placements: s.placements && typeof s.placements === 'object' ? s.placements : {},
    subs: s.subs && typeof s.subs === 'object' ? s.subs : {}
  };
  var st = out.settings;
  st.weights = Object.assign(defaultWeights(), st.weights || {});
  var dr = defaultRules(); st.rules = Object.assign(dr, st.rules || {}); st.rules.imp = Object.assign(defaultRules().imp, (s.settings && s.settings.rules && s.settings.rules.imp) || {});
  if (!Array.isArray(st.periods) || !st.periods.length) st.periods = base.settings.periods;
  st.days = Math.min(6, Math.max(1, +st.days || 5));
  out.subjects.forEach(function (x) { x.unav = x.unav || []; x.pref = x.pref || []; if (x.hue == null) x.hue = 200; });
  out.teachers.forEach(function (x) { x.unav = x.unav || []; x.pref = x.pref || []; });
  out.classes.forEach(function (x) { x.unav = x.unav || []; x.pref = x.pref || []; x.divisions = x.divisions || []; });
  out.rooms.forEach(function (x) { x.unav = x.unav || []; });
  out.lessons.forEach(function (l) {
    l.teachers = l.teachers || []; l.classes = l.classes || []; l.rooms = l.rooms || []; l.coTeachers = l.coTeachers || []; l.pool = l.pool || []; l.parts = l.parts || [];
    l.perWeek = +l.perWeek || 0; l.doubles = +l.doubles || 0; l.teamHours = +l.teamHours || 0; l.maxPerDay = +l.maxPerDay || 0;
  });
  Object.keys(out.placements).forEach(function (id) {
    var p = out.placements[id];
    if (!Array.isArray(p.rooms)) p.rooms = p.room ? [p.room] : [];
    delete p.room; if (p.pool === undefined) p.pool = null;
  });
  return out;
}

function loadLocal() {
  try { var raw = localStorage.getItem(LS_KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) { /* keine lokale Kopie */ }
  return null;
}
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* Speicher nicht verfügbar */ } }

var state = loadLocal() || sampleWithPlan();
var MC = null, ANC = null;
function model() { if (!MC) MC = buildModel(state); return MC; }

var ui = { tab: 'plan', view: 'class', entity: { class: null, teacher: null, room: null }, selected: null, lessonFilter: null, bannerHidden: false, subDate: null, showAllHints: false };
try {
  var uiSaved = JSON.parse(localStorage.getItem(LS_KEY + '.ui') || '{}');
  if (uiSaved.view) ui.view = uiSaved.view; if (uiSaved.entity) ui.entity = Object.assign(ui.entity, uiSaved.entity); ui.bannerHidden = !!uiSaved.bannerHidden;
} catch (e) { /* ignorieren */ }
function saveUi() { try { localStorage.setItem(LS_KEY + '.ui', JSON.stringify({ view: ui.view, entity: ui.entity, bannerHidden: ui.bannerHidden })); } catch (e) { /* ignorieren */ } }

var undoStack = [];
function pushUndo(label) { undoStack.push({ label: label, data: JSON.stringify(state.placements) }); if (undoStack.length > 40) undoStack.shift(); }
function undo() {
  var u = undoStack.pop(); if (!u) return;
  state.placements = JSON.parse(u.data); ui.selected = null; changed(['placements']); toast('Rückgängig: ' + u.label);
}

function cleanPlacements() {
  var m = model(), out = {};
  Object.keys(state.placements).forEach(function (id) {
    var k = m.cardIndex[id]; if (k === undefined) return;
    var pl = state.placements[id], card = m.cards[k];
    if (pl.d >= m.nD || pl.p + card.len > m.nP) return;
    pl.rooms = card.rr.map(function (opts, i) { var r = pl.rooms[i]; return r && m.rIdx[r] !== undefined ? r : null; });
    if (pl.pool && (m.tIdx[pl.pool] === undefined || card.tp.indexOf(m.tIdx[pl.pool]) < 0)) pl.pool = null;
    out[id] = pl;
  });
  state.placements = out;
}

function changed(sections) {
  MC = null; ANC = null;
  if (sections.some(function (s) { return s !== 'placements' && s !== 'subs' && s !== 'absences'; })) { cleanPlacements(); sections = sections.concat(['placements']); }
  sections.forEach(function (s) { dirty[s] = true; });
  scheduleSave();
  render();
}

/* ================= Speichern (claude.ai-Datenbank, sonst Browser) ================= */
var store = { mode: 'loading', db: null, uid: null }, dirty = {}, saveTimer = null, saving = false;
function docRef(sec) { return store.db.doc('data/users/' + store.uid + '/sw_' + sec); }
function setSave(s, text) {
  var el = $('#save-state'); if (!el) return;
  el.dataset.s = s;
  $('#save-text').textContent = text || { loading: 'Lade gespeicherte Daten …', saved: 'Gespeichert', saving: 'Speichert …', local: 'Nur in diesem Browser gespeichert', error: 'Speichern fehlgeschlagen' }[s];
}
function scheduleSave() {
  saveLocal();
  if (store.mode !== 'cloud') { setSave(store.mode); return; }
  if (!Object.keys(dirty).length) return;
  setSave('saving');
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700);
}
async function flush() {
  if (saving) { saveTimer = setTimeout(flush, 400); return; }
  saving = true;
  var secs = Object.keys(dirty); dirty = {};
  try {
    for (var i = 0; i < secs.length; i++) {
      var json = JSON.stringify(state[secs[i]]);
      if (json.length > 240000) throw { code: 'too_big' };
      await docRef(secs[i]).set({ json: json, at: Date.now() });
    }
    setSave('saved');
  } catch (e) {
    secs.forEach(function (s) { dirty[s] = true; });
    setSave('error', e && e.code === 'too_big' ? 'Zu groß zum Speichern, bitte Sicherung herunterladen' : 'Speichern fehlgeschlagen, neuer Versuch …');
    if (!(e && e.code === 'too_big')) setTimeout(scheduleSave, 5000);
  } finally { saving = false; }
}
function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej({ code: 'timeout' }); }, ms); })]); }
async function initStore() {
  try {
    if (!window.claude || !window.claude.use) throw { code: 'none' };
    var both = await withTimeout(Promise.all([window.claude.use('db'), window.claude.use('user')]), 10000);
    if (!both[0] || !both[1]) throw { code: 'none' };
    var id = await both[1].id(); if (!id) throw { code: 'none' };
    store.db = both[0]; store.uid = id;
    var snaps = await withTimeout(Promise.all(SECTIONS.map(function (s) { return docRef(s).get(); })), 10000);
    var found = {}, any = false;
    snaps.forEach(function (sn, i) {
      var d = sn.exists ? sn.data() : null;
      if (d && typeof d.json === 'string') { try { found[SECTIONS[i]] = JSON.parse(d.json); any = true; } catch (e) { /* defekt */ } }
    });
    store.mode = 'cloud';
    if (any) { state = normalize(found); MC = null; ANC = null; undoStack = []; dirty = {}; saveLocal(); render(); setSave('saved'); }
    else if (!state.settings.isSample || Object.keys(dirty).length) { SECTIONS.forEach(function (s) { dirty[s] = true; }); scheduleSave(); }
    else setSave('saved', 'Beispieldaten, noch nicht gespeichert');
  } catch (e) {
    store.mode = 'local'; setSave('local');
  }
}

/* ================= Dateien anbieten ================= */
var dlPromise = null;
function downloads() { if (!dlPromise) dlPromise = (window.claude && window.claude.use) ? window.claude.use('downloads').catch(function () { return null; }) : Promise.resolve(null); return dlPromise; }
async function offerFile(filename, data) {
  var dl = await downloads();
  if (dl) {
    try { await dl.save({ filename: filename, data: data }); toast('Datei „' + filename + '“ gespeichert'); return; }
    catch (e) { if (e && e.code === 'declined') return; if (e && e.code === 'rate_limited') { toast('Bitte zuerst den offenen Speicherdialog beantworten'); return; } }
  }
  openDialog({
    title: filename,
    body: '<p class="hint">Das Herunterladen ist hier nicht möglich. Kopieren Sie den Inhalt und speichern Sie ihn als Datei „' + esc(filename) + '“.</p><textarea id="copy-area" rows="12" readonly style="width:100%;font-family:var(--f-mono);font-size:12px">' + esc(data) + '</textarea>',
    foot: '<button type="button" class="btn" data-act="dlg-close">Schließen</button><button type="button" class="btn primary" data-act="copy-area">Kopieren</button>'
  });
}

/* ================= Anzeige-Helfer für Karten ================= */
function tName(i) { return state.teachers[i] ? state.teachers[i].name : '?'; }
function tShort(i) { return state.teachers[i] ? state.teachers[i].short : '?'; }
function roomShort(id) { var r = byId(state.rooms, id); return r ? r.short || r.name : ''; }
function poolIdx(card) { var pl = state.placements[card.id]; var m = model(); return pl && pl.pool && m.tIdx[pl.pool] !== undefined ? m.tIdx[pl.pool] : -1; }
function cardTeachers(card) { var t = card.t.slice(), p = poolIdx(card); if (p >= 0 && t.indexOf(p) < 0) t.push(p); return t; }
function partRoom(card, part) { var pl = state.placements[card.id]; return pl && part.roomReq >= 0 ? pl.rooms[part.roomReq] : null; }
function partGroups(part) { return part.refs.map(function (r) { return refLabel(state, r); }).join(', '); }
function cardClassLabel(card) { return uniq(card.parts.map(partGroups).filter(Boolean)).join(' · '); }
function cardTitle(card) {
  return card.parts.map(function (p) { return p.subject.name + ' · ' + (partGroups(p) || '–') + ' · ' + p.teachers.map(tShort).join(', '); }).join(' | ') +
    (card.co.length ? ' | Teamteaching: ' + card.co.map(tShort).join(', ') : '') + (card.tp.length ? ' | Pool: ' + card.tp.map(tShort).join(', ') : '');
}

/* ================= Analyse ================= */
function analysis() {
  if (ANC) return ANC;
  var m = model(), nS = m.nD * m.nP;
  var occ = {}, conflicts = {}, placed = {};
  function push(key, id) { (occ[key] = occ[key] || []).push(id); }
  function conf(id, text) { (conflicts[id] = conflicts[id] || []); if (conflicts[id].indexOf(text) < 0) conflicts[id].push(text); }
  Object.keys(state.placements).forEach(function (id) {
    var k = m.cardIndex[id]; if (k === undefined) return;
    var pl = state.placements[id], card = m.cards[k];
    if (pl.d >= m.nD || pl.p + card.len > m.nP) return;
    placed[id] = true;
    var ts = cardTeachers(card);
    if (card.tp.length && poolIdx(card) < 0) conf(id, 'Keine Lehrkraft aus dem Pool eingeteilt');
    card.rr.forEach(function (opts, i) { if (!pl.rooms[i]) conf(id, 'Raum fehlt'); });
    for (var j = 0; j < card.len; j++) {
      var s = pl.d * m.nP + pl.p + j;
      ts.forEach(function (t) { push('t' + t + '_' + s, id); if (m.problem.teachers[t].unav.indexOf(s) >= 0) conf(id, tName(t) + ' ist da nicht verfügbar'); });
      card.c.forEach(function (a) { push('a' + a + '_' + s, id); if (m.atoms[a].unav.indexOf(s) >= 0) conf(id, 'Sperrzeit der Klasse ' + m.atoms[a].name); });
      card.classes.forEach(function (c) { var key = 'c' + c + '_' + s; if (!occ[key] || occ[key].indexOf(id) < 0) push(key, id); });
      (pl.rooms || []).forEach(function (rid) { if (!rid || m.rIdx[rid] === undefined) return; var r = m.rIdx[rid]; push('r' + r + '_' + s, id); if (m.problem.rooms[r].unav.indexOf(s) >= 0) conf(id, 'Raum ist gesperrt'); });
      if (card.unav.indexOf(s) >= 0) conf(id, 'Fach ist zu dieser Zeit gesperrt');
    }
  });
  Object.keys(occ).forEach(function (key) {
    var l = occ[key]; if (l.length < 2 || key[0] === 'c') return;
    var what = key[0] === 't' ? 'Lehrkraft doppelt verplant' : key[0] === 'a' ? 'Schülergruppe doppelt verplant' : 'Raum doppelt belegt';
    l.forEach(function (id) { conf(id, what); });
  });
  var cg = 0, tg = 0, d, p, i;
  for (i = 0; i < m.atoms.length; i++) for (d = 0; d < m.nD; d++) {
    var f = -1, l = -1, n = 0;
    for (p = 0; p < m.nP; p++) if (occ['a' + i + '_' + (d * m.nP + p)]) { n++; if (f < 0) f = p; l = p; }
    if (n) cg += l - f + 1 - n;
  }
  for (i = 0; i < state.teachers.length; i++) for (d = 0; d < m.nD; d++) {
    var f2 = -1, l2 = -1, n2 = 0;
    for (p = 0; p < m.nP; p++) if (occ['t' + i + '_' + (d * m.nP + p)]) { n2++; if (f2 < 0) f2 = p; l2 = p; }
    if (n2) tg += l2 - f2 + 1 - n2;
  }
  var unplaced = m.cards.filter(function (c) { return !placed[c.id]; });
  // Bedingungen über den Rechenkern auswerten
  var report = [];
  try {
    var pl2 = placementsToList(state, m, false), chk = createSolver(m.problem, 3);
    chk.load(pl2.list, []);
    report = chk.report({ days: DAY_SHORT });
  } catch (e) { report = []; }
  ANC = { occ: occ, conflicts: conflicts, placed: placed, unplaced: unplaced, classGaps: cg, teacherGaps: tg, nS: nS, report: report };
  return ANC;
}

/* Ziele für eine Karte berechnen (wohin darf sie?) */
function computeTargets(id) {
  var m = model(), k = m.cardIndex[id]; if (k === undefined) return null;
  var pl = placementsToList(state, m, false);
  var chk = createSolver(m.problem, 5);
  chk.load(pl.list.filter(function (e) { return e.k !== k; }), pl.locked.filter(function (x) { return x !== k; }));
  var cur = state.placements[id], curS = cur && analysis().placed[id] ? cur.d * m.nP + cur.p : -1;
  var out = {};
  for (var s = 0; s < m.nD * m.nP; s++) {
    var res = chk.check(k, s), cls = 'no';
    if (res.ok) cls = res.undesired ? 'soft' : 'ok';
    else if (res.softOnly) cls = 'soft';
    else if (!res.hard && res.blockers.length === 1 && curS >= 0 && res.rooms && res.tp !== -2) {
      var b = res.blockers[0], bc = m.cards[b], bid = bc.id;
      if (!(state.placements[bid] && state.placements[bid].locked) && bc.len === m.cards[k].len) {
        var bs = chk.pos[b], br = chk.rooms[b].slice(), bt = chk.tsel[b];
        chk.unplace(b);
        var r1 = chk.tryResources(k, s, null, -1);
        if (r1) {
          chk.place(k, s, r1.rs, r1.tp);
          var r2 = chk.tryResources(b, curS, br, bt);
          chk.unplace(k);
          if (r2) { cls = 'swap'; res.swap = { other: bid, r1: r1, r2: r2, otherS: curS }; res.reasons = ['Tauschen mit ' + bc.label]; }
        }
        chk.place(b, bs, br, bt);
      }
    }
    if (s === curS) cls = 'cur';
    if (cls === 'soft' && res.undesired && res.ok) res.reasons = ['Zeit ist für das Fach unerwünscht'];
    res.cls = cls; out[s] = res;
  }
  return out;
}

function roomIdsOf(rs) { return (rs || []).map(function (r) { return r >= 0 ? state.rooms[r].id : null; }); }
function applyTarget(id, s, t) {
  var m = model(), d = Math.floor(s / m.nP), p = s % m.nP, prev = state.placements[id];
  if (t.cls === 'ok' || t.cls === 'soft') {
    pushUndo('Stunde verschoben');
    state.placements[id] = { d: d, p: p, rooms: roomIdsOf(t.rooms), pool: t.tp >= 0 ? state.teachers[t.tp].id : null, locked: !!(prev && prev.locked) };
    changed(['placements']);
    if (t.cls === 'soft' && t.reasons.length) toast('Verschoben. Hinweis: ' + t.reasons.join(', '));
    return true;
  }
  if (t.cls === 'swap') {
    pushUndo('Stunden getauscht');
    var other = t.swap.other, op = state.placements[other];
    state.placements[id] = { d: d, p: p, rooms: roomIdsOf(t.swap.r1.rs), pool: t.swap.r1.tp >= 0 ? state.teachers[t.swap.r1.tp].id : null, locked: !!(prev && prev.locked) };
    state.placements[other] = { d: Math.floor(t.swap.otherS / m.nP), p: t.swap.otherS % m.nP, rooms: roomIdsOf(t.swap.r2.rs), pool: t.swap.r2.tp >= 0 ? state.teachers[t.swap.r2.tp].id : null, locked: !!(op && op.locked) };
    changed(['placements']);
    toast('Stunden getauscht');
    return true;
  }
  return false;
}
function unplaceCard(id) {
  if (!state.placements[id]) { render(); return; }
  pushUndo('Stunde aus dem Plan genommen');
  delete state.placements[id]; changed(['placements']);
}

var toastTimer = null;
function toast(msg) {
  var t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
}
