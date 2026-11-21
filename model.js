/* Datenmodell: Karten ableiten, Problem für den Rechenkern bauen, Beispielschule */
var DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
var DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
var IMPORTANCE = { off: 0, low: 2, normal: 8, high: 30, must: 300 };
var IMPORTANCE_LABEL = { off: 'Aus', low: 'Niedrig', normal: 'Normal', high: 'Hoch', must: 'Muss' };

function uid(prefix) { return (prefix || 'x') + Math.random().toString(36).slice(2, 9); }

function defaultWeights() { return { classGap: 30, classStart: 3, teacherGap: 2, dayBalance: 2, late: 4, lateFrom: 6 }; }
function defaultRules() {
  return {
    tMaxPerDay: 6, tMaxConsec: 4, tMaxGapsDay: 2, tMaxDays: 0, cMaxPerDay: 7, cMinPerDay: 4, lunchFrom: 4, lunchTo: 6,
    imp: { tMaxPerDay: 'high', tMaxConsec: 'normal', tMaxGapsDay: 'normal', tMaxDays: 'high', cMaxPerDay: 'high', cMinPerDay: 'low', lunchC: 'normal', lunchT: 'low', undesired: 'normal' }
  };
}

/* Unterrichtseinheit -> Karten (Doppelstunden zuerst) */
function lessonCards(lesson) {
  var out = [], dbl = Math.max(0, Math.min(lesson.doubles || 0, Math.floor((lesson.perWeek || 0) / 2)));
  var singles = Math.max(0, (lesson.perWeek || 0) - 2 * dbl), i;
  for (i = 0; i < dbl; i++) out.push({ id: lesson.id + ':d' + i, len: 2 });
  for (i = 0; i < singles; i++) out.push({ id: lesson.id + ':s' + i, len: 1 });
  // Teamteaching: welche Karten bekommen die Zweitlehrkraft?
  var co = lesson.coTeachers || [];
  if (co.length) {
    var rest = lesson.teamHours > 0 ? lesson.teamHours : (lesson.perWeek || 0);
    var order = out.filter(function (k) { return k.len === 1; }).concat(out.filter(function (k) { return k.len === 2; }));
    order.forEach(function (k) { if (rest >= k.len) { k.team = true; rest -= k.len; } });
  }
  return out;
}

/* Alle Teile einer Einheit: Hauptteil + gekoppelte Teile */
function lessonParts(l) {
  var main = { subject: l.subject, classes: l.classes || [], teachers: l.teachers || [], rooms: l.rooms || [], main: true };
  return [main].concat((l.parts || []).map(function (p) { return { subject: p.subject, classes: p.classes || [], teachers: p.teachers || [], rooms: p.rooms || [] }; }));
}

/* Schülergruppen-Atome einer Klasse: Kombination aller Teilungen */
function classAtoms(cls) {
  var divs = (cls.divisions || []).filter(function (d) { return d.groups && d.groups.length; });
  var combos = [[]];
  divs.forEach(function (dv) {
    var n = []; combos.forEach(function (c) { dv.groups.forEach(function (g) { n.push(c.concat([g.id])); }); }); combos = n;
  });
  return combos.slice(0, 64);
}
function groupName(cls, gid) {
  var r = null; (cls.divisions || []).forEach(function (d) { (d.groups || []).forEach(function (g) { if (g.id === gid) r = g.name; }); }); return r;
}
function refLabel(st, ref) {
  var a = ref.split(':'), c = st.classes.find(function (x) { return x.id === a[0]; });
  if (!c) return '?';
  return a[1] ? c.name + ' ' + (groupName(c, a[1]) || '?') : c.name;
}

function slotKey(d, p) { return d + ':' + p; }

/* Baut alles, was Oberfläche und Rechenkern brauchen */
function buildModel(st) {
  var nD = st.settings.days, nP = st.settings.periods.length;
  var rules = Object.assign(defaultRules(), st.settings.rules || {}); rules.imp = Object.assign(defaultRules().imp, (st.settings.rules || {}).imp || {});
  var imp = function (k) { return IMPORTANCE[rules.imp[k]] || 0; };
  var tIdx = {}, cIdx = {}, rIdx = {}, sMap = {};
  st.teachers.forEach(function (t, i) { tIdx[t.id] = i; });
  st.classes.forEach(function (c, i) { cIdx[c.id] = i; });
  st.rooms.forEach(function (r, i) { rIdx[r.id] = i; });
  st.subjects.forEach(function (s) { sMap[s.id] = s; });
  function slots(list) {
    var out = [];
    (list || []).forEach(function (k) { var a = k.split(':'), d = +a[0], p = +a[1]; if (d < nD && p < nP) out.push(d * nP + p); });
    return out;
  }
  // Atome
  var atoms = [], classAtomIdx = [], atomClass = [];
  st.classes.forEach(function (c, ci) {
    var combos = classAtoms(c), idx = [], w = 1 / Math.sqrt(combos.length);
    combos.forEach(function (combo) {
      idx.push(atoms.length); atomClass.push(ci);
      var nm = c.name + (combo.length ? ' (' + combo.map(function (g) { return groupName(c, g); }).join(', ') + ')' : '');
      atoms.push({ name: nm, combo: combo, unav: slots(c.unav), pref: slots(c.pref), weekly: 0, w: w,
        maxPerDay: c.maxPerDay != null && c.maxPerDay !== '' ? +c.maxPerDay : rules.cMaxPerDay, maxHard: rules.imp.cMaxPerDay === 'must',
        minPerDay: c.minPerDay != null && c.minPerDay !== '' ? +c.minPerDay : rules.cMinPerDay });
    });
    classAtomIdx.push(idx);
  });
  function refAtoms(ref) {
    var a = ref.split(':'), ci = cIdx[a[0]]; if (ci === undefined) return [];
    if (!a[1]) return classAtomIdx[ci].slice();
    return classAtomIdx[ci].filter(function (ai) { return atoms[ai].combo.indexOf(a[1]) >= 0; });
  }
  function refsClasses(refs) { var out = []; refs.forEach(function (r) { var ci = cIdx[r.split(':')[0]]; if (ci !== undefined && out.indexOf(ci) < 0) out.push(ci); }); return out; }
  function addU(arr, v) { if (arr.indexOf(v) < 0) arr.push(v); }

  var cards = [], cardIndex = {}, lessonIdx = {};
  st.lessons.forEach(function (l, li) {
    lessonIdx[l.id] = li;
    var parts = lessonParts(l), allAtoms = [], fixedT = [], rr = [], unav = [], pen = [], partInfo = [], classesAll = [];
    parts.forEach(function (pt) {
      var at = []; pt.classes.forEach(function (ref) { refAtoms(ref).forEach(function (a) { addU(at, a); addU(allAtoms, a); }); });
      var ts = pt.teachers.map(function (id) { return tIdx[id]; }).filter(function (x) { return x !== undefined; });
      ts.forEach(function (t) { addU(fixedT, t); });
      var ro = pt.rooms.map(function (id) { return rIdx[id]; }).filter(function (x) { return x !== undefined; });
      var cls = refsClasses(pt.classes); cls.forEach(function (c) { addU(classesAll, c); });
      if (!ro.length && cls.length === 1 && pt.classes.length) { var hr = st.classes[cls[0]].homeRoom; if (hr && rIdx[hr] !== undefined) ro = [rIdx[hr]]; }
      var reqIdx = -1; if (ro.length) { reqIdx = rr.length; rr.push(ro); }
      var subj = sMap[pt.subject] || { short: '?', name: 'Unbekannt', hue: 0 };
      slots(subj.unav).forEach(function (s) { addU(unav, s); });
      slots(subj.pref).forEach(function (s) { pen.push([s, 1]); });
      partInfo.push({ subject: subj, teachers: ts, atoms: at, refs: pt.classes.slice(), roomReq: reqIdx, classes: cls, main: !!pt.main });
    });
    var co = (l.coTeachers || []).map(function (id) { return tIdx[id]; }).filter(function (x) { return x !== undefined; });
    var pool = (l.pool || []).map(function (id) { return tIdx[id]; }).filter(function (x) { return x !== undefined && fixedT.indexOf(x) < 0; });
    var lc = lessonCards(l), blocks = lc.length;
    var maxPerDay = l.maxPerDay > 0 ? l.maxPerDay : Math.max(1, Math.ceil(blocks / Math.max(1, nD)));
    var mainSubj = partInfo[0].subject;
    var label = partInfo.map(function (p) { return p.subject.short; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('/') +
      (l.classes && l.classes.length ? ' (' + l.classes.map(function (r) { return refLabel(st, r); }).join(', ') + (l.parts && l.parts.length ? ' …' : '') + ')' : '');
    lc.forEach(function (k) {
      var t = fixedT.slice(); if (k.team) co.forEach(function (x) { addU(t, x); });
      allAtoms.forEach(function (a) { atoms[a].weekly += k.len; });
      cardIndex[k.id] = cards.length;
      cards.push({ id: k.id, lessonId: l.id, lesson: li, len: k.len, t: t, tp: pool, c: allAtoms, rr: rr, maxPerDay: maxPerDay, label: label,
        subject: mainSubj, parts: partInfo, co: k.team ? co : [], team: !!k.team, classes: classesAll, unav: unav, pen: pen });
    });
  });

  // Beziehungen
  var rels = [];
  (st.relations || []).forEach(function (r) {
    var w = IMPORTANCE[r.importance] || 0; if (!w) return;
    if (r.mode === 'lessons') {
      var ls = (r.lessons || []).map(function (id) { return lessonIdx[id]; }).filter(function (x) { return x !== undefined; });
      if (ls.length) rels.push({ type: r.type, lessons: ls, w: w, name: relationName(st, r) });
    } else {
      var subs = r.subjects || [];
      st.classes.forEach(function (c, ci) {
        var ls2 = [];
        st.lessons.forEach(function (l, li) {
          var parts = lessonParts(l);
          if (parts.some(function (pt) { return subs.indexOf(pt.subject) >= 0 && refsClasses(pt.classes).indexOf(ci) >= 0; })) ls2.push(li);
        });
        if (ls2.length && (r.type !== 'sameDay' || ls2.length > 1)) rels.push({ type: r.type, lessons: ls2, w: w, name: relationName(st, r) + ' – ' + c.name });
      });
    }
  });

  var problem = {
    nDays: nD, nPeriods: nP,
    noDouble: st.settings.periods.map(function (p) { return !!p.noDouble; }),
    teachers: st.teachers.map(function (t) {
      var v = function (x, d) { return x != null && x !== '' ? +x : d; };
      return { name: t.name || t.short, unav: slots(t.unav), pref: slots(t.pref),
        maxPerDay: v(t.maxPerDay, rules.tMaxPerDay), maxHard: rules.imp.tMaxPerDay === 'must',
        maxConsec: v(t.maxConsec, rules.tMaxConsec), maxGapsDay: v(t.maxGapsDay, rules.tMaxGapsDay), maxDays: v(t.maxDays, rules.tMaxDays) };
    }),
    classes: atoms,
    rooms: st.rooms.map(function (r) { return { name: r.name || r.short, unav: slots(r.unav) }; }),
    cards: cards.map(function (k) { return { lesson: k.lesson, len: k.len, t: k.t, tp: k.tp, c: k.c, rr: k.rr, maxPerDay: k.maxPerDay, label: k.label, unav: k.unav, pen: k.pen }; }),
    nLessons: st.lessons.length,
    rels: rels,
    weights: Object.assign(defaultWeights(), st.settings.weights || {}, {
      undesired: imp('undesired'), lunchFrom: rules.lunchFrom, lunchTo: rules.lunchTo, lunchC: imp('lunchC'), lunchT: imp('lunchT'),
      tMaxDay: imp('tMaxPerDay'), tConsec: imp('tMaxConsec'), tGapsDay: imp('tMaxGapsDay'), tDays: imp('tMaxDays'), cMaxDay: imp('cMaxPerDay'), cMinDay: imp('cMinPerDay')
    })
  };
  var weeklyClass = st.classes.map(function (c, ci) { return Math.max.apply(null, classAtomIdx[ci].map(function (a) { return atoms[a].weekly; }).concat([0])); });
  return { problem: problem, cards: cards, cardIndex: cardIndex, lessonIdx: lessonIdx, tIdx: tIdx, cIdx: cIdx, rIdx: rIdx, sMap: sMap,
    atoms: atoms, classAtomIdx: classAtomIdx, atomClass: atomClass, weekly: weeklyClass, nD: nD, nP: nP, rules: rules };
}

var RELATION_TYPES = {
  diffDays: 'Höchstens eine Stunde pro Tag aus dieser Gruppe',
  sameDay: 'Am selben Tag',
  notAdj: 'Nicht direkt hintereinander'
};
function relationName(st, r) {
  var names = r.mode === 'lessons'
    ? (r.lessons || []).map(function (id) { var l = st.lessons.find(function (x) { return x.id === id; }); if (!l) return '?'; var s = st.subjects.find(function (x) { return x.id === l.subject; }); return (s ? s.short : '?') + ' ' + (l.classes || []).map(function (c) { return refLabel(st, c); }).join(','); })
    : (r.subjects || []).map(function (id) { var s = st.subjects.find(function (x) { return x.id === id; }); return s ? s.short : '?'; });
  var t = { diffDays: 'verschiedene Tage', sameDay: 'selber Tag', notAdj: 'nicht hintereinander' }[r.type] || r.type;
  return names.join(' + ') + ': ' + t;
}

/* Platzierungen (Objekt) <-> Liste für den Rechenkern */
function placementsToList(st, M, onlyLocked) {
  var list = [], lockedList = [];
  Object.keys(st.placements || {}).forEach(function (id) {
    var k = M.cardIndex[id]; if (k === undefined) return;
    var pl = st.placements[id];
    if (onlyLocked && !pl.locked) return;
    if (pl.d >= M.nD || pl.p >= M.nP) return;
    var rs = (pl.rooms || []).map(function (r) { return r && M.rIdx[r] !== undefined ? M.rIdx[r] : -1; });
    list.push({ k: k, s: pl.d * M.nP + pl.p, rs: rs, tp: pl.pool && M.tIdx[pl.pool] !== undefined ? M.tIdx[pl.pool] : -1 });
    if (pl.locked) lockedList.push(k);
  });
  return { list: list, locked: lockedList };
}
function listToPlacements(st, M, list, lockedSet) {
  var out = {};
  list.forEach(function (e) {
    var card = M.cards[e.k];
    out[card.id] = { d: Math.floor(e.s / M.nP), p: e.s % M.nP, rooms: (e.rs || []).map(function (r) { return r >= 0 ? st.rooms[r].id : null; }),
      pool: e.tp >= 0 ? st.teachers[e.tp].id : null, locked: !!(lockedSet && lockedSet[card.id]) };
  });
  return out;
}

/* ---------- Beispielschule (Mittelschule, fiktive Namen) ---------- */
function sampleState() {
  var S = function (id, short, name, hue) { return { id: id, short: short, name: name, hue: hue, unav: [], pref: [] }; };
  var subjects = [
    S('sD', 'D', 'Deutsch', 4), S('sM', 'M', 'Mathematik', 215), S('sE', 'E', 'Englisch', 350),
    S('sGW', 'GW', 'Geographie und wirtschaftliche Bildung', 95), S('sGS', 'GS', 'Geschichte und Politische Bildung', 30),
    S('sBIO', 'BU', 'Biologie und Umweltbildung', 135), S('sPH', 'PH', 'Physik', 255), S('sBE', 'BE', 'Kunst und Gestaltung', 300),
    S('sME', 'ME', 'Musik', 275), S('sBSP', 'BSP', 'Bewegung und Sport', 175), S('sREL', 'RK', 'Religion röm.-kath.', 50),
    S('sREV', 'EV', 'Religion evangelisch', 70), S('sTEC', 'TEC', 'Technik und Design', 195), S('sDGB', 'DGB', 'Digitale Grundbildung', 235)
  ];
  var sub = {}; subjects.forEach(function (s) { sub[s.id] = s; });
  var p;
  // Hauptfächer am Nachmittag unerwünscht, Sport nicht in der 1. Stunde
  ['sD', 'sM', 'sE'].forEach(function (id) { for (var d = 0; d < 5; d++) for (p = 6; p < 8; p++) sub[id].pref.push(d + ':' + p); });
  for (var d0 = 0; d0 < 5; d0++) sub.sBSP.pref.push(d0 + ':0');
  var T = function (id, short, name, target) { return { id: id, short: short, name: name, unav: [], pref: [], target: target }; };
  var teachers = [
    T('tHU', 'HU', 'Huber Anna', 20), T('tGR', 'GR', 'Gruber Markus', 20), T('tWA', 'WA', 'Wagner Lisa', 20), T('tBA', 'BA', 'Bauer Stefan', 20),
    T('tPI', 'PI', 'Pichler Julia', 20), T('tST', 'ST', 'Steiner Florian', 20), T('tMO', 'MO', 'Moser Katharina', 20), T('tMA', 'MA', 'Mayer Johannes', 20),
    T('tHO', 'HO', 'Hofer Maria', 10), T('tLE', 'LE', 'Leitner Thomas', 20), T('tBE', 'BE', 'Berger Eva', 12),
    T('tKO', 'KO', 'Koller Ruth', 4), T('tFU', 'FU', 'Fuchs Daniel', 10)
  ];
  var t = {}; teachers.forEach(function (x) { t[x.id] = x; });
  for (p = 0; p < 8; p++) {
    t.tHO.unav.push('3:' + p, '4:' + p);          // Hofer: Do/Fr an anderer Schule
    t.tBE.unav.push('4:' + p);                    // Berger: Freitag frei
    t.tKO.unav.push('2:' + p, '3:' + p, '4:' + p); // Koller: nur Mo/Di
    t.tMA.pref.push('2:' + p);                    // Mayer: Mittwoch frei gewünscht
  }
  t.tBE.maxDays = 4; t.tFU.maxDays = 3;
  var R = function (id, short, name) { return { id: id, short: short, name: name, unav: [] }; };
  var rooms = [
    R('r101', '101', 'Klassenraum 101'), R('r102', '102', 'Klassenraum 102'), R('r103', '103', 'Klassenraum 103'), R('r104', '104', 'Klassenraum 104'),
    R('rTS', 'TS', 'Turnsaal'), R('rWE', 'WE', 'Werkraum'), R('rTX', 'TX', 'Textilwerkraum'), R('rZS', 'ZS', 'Zeichensaal'), R('rMS', 'MS', 'Musiksaal'),
    R('rIT', 'IT', 'EDV-Raum'), R('rGR', 'GR', 'Gruppenraum')
  ];
  var relDiv = function (pre) { return { id: pre + 'dRel', name: 'Religion', groups: [{ id: pre + 'gRK', name: 'RK' }, { id: pre + 'gEV', name: 'EV' }] }; };
  var grpDiv = function (pre) { return { id: pre + 'dGr', name: 'Werkgruppen', groups: [{ id: pre + 'gG1', name: 'G1' }, { id: pre + 'gG2', name: 'G2' }] }; };
  var C = function (id, name, room) { return { id: id, name: name, homeRoom: room, unav: ['4:6', '4:7'], pref: [], divisions: [relDiv(id), grpDiv(id)] }; };
  var classes = [C('c1a', '1a', 'r101'), C('c1b', '1b', 'r102'), C('c2a', '2a', 'r103'), C('c2b', '2b', 'r104')];
  var lessons = [];
  function L(o) {
    var l = Object.assign({ id: 'l' + (lessons.length + 1), teachers: [], coTeachers: [], teamHours: 0, pool: [], rooms: [], perWeek: 1, doubles: 0, maxPerDay: 0, parts: [] }, o);
    lessons.push(l); return l;
  }
  function std(cls, subj, teacher, per, dbl, rooms, extra) { return L(Object.assign({ subject: subj, teachers: teacher ? [teacher] : [], classes: [cls], rooms: rooms || [], perWeek: per, doubles: dbl || 0 }, extra || {})); }
  var gym = ['rTS'], zs = ['rZS'], ms = ['rMS'], it = ['rIT'];
  // Religion: RK für beide Klassen eines Jahrgangs gekoppelt mit EV
  function religion(c1, c2) {
    L({ subject: 'sREL', teachers: ['tHO'], classes: [c1 + ':' + c1 + 'gRK', c2 + ':' + c2 + 'gRK'], rooms: [], perWeek: 2,
      parts: [{ subject: 'sREV', teachers: ['tKO'], classes: [c1 + ':' + c1 + 'gEV', c2 + ':' + c2 + 'gEV'], rooms: ['rGR'] }] });
  }
  // Technik und Design: Klasse in zwei Werkgruppen geteilt, gleichzeitig
  function werken(c) {
    L({ subject: 'sTEC', teachers: ['tMO'], classes: [c + ':' + c + 'gG1'], rooms: ['rWE'], perWeek: 2, doubles: 1,
      parts: [{ subject: 'sTEC', teachers: ['tFU'], classes: [c + ':' + c + 'gG2'], rooms: ['rTX'] }] });
  }
  // 1a
  std('c1a', 'sD', 'tHU', 4, 0, null, { coTeachers: ['tBE'], teamHours: 2 }); std('c1a', 'sE', 'tWA', 4); std('c1a', 'sM', 'tGR', 4, 0, null, { coTeachers: ['tLE'], teamHours: 2 });
  std('c1a', 'sGW', 'tBA', 2); std('c1a', 'sBIO', 'tBA', 2); std('c1a', 'sBE', 'tMO', 2, 1, zs); std('c1a', 'sME', 'tMA', 2, 0, ms);
  std('c1a', 'sBSP', 'tPI', 4, 2, gym); werken('c1a'); std('c1a', 'sDGB', 'tLE', 1, 0, it);
  // 1b
  std('c1b', 'sD', 'tMA', 4); std('c1b', 'sE', 'tBE', 4); std('c1b', 'sM', 'tLE', 4); std('c1b', 'sGW', 'tST', 2); std('c1b', 'sBIO', 'tBA', 2);
  std('c1b', 'sBE', 'tMO', 2, 1, zs); std('c1b', 'sME', 'tMA', 2, 0, ms); std('c1b', 'sBSP', 'tST', 4, 2, gym); werken('c1b'); std('c1b', 'sDGB', 'tLE', 1, 0, it);
  religion('c1a', 'c1b');
  // 2a
  std('c2a', 'sD', 'tHU', 4); std('c2a', 'sE', 'tWA', 4, 0, null, { coTeachers: ['tBE'], teamHours: 2 }); std('c2a', 'sM', 'tGR', 4); std('c2a', 'sGW', 'tST', 2); std('c2a', 'sGS', 'tHU', 2);
  std('c2a', 'sBIO', 'tBA', 2); std('c2a', 'sPH', 'tGR', 1); std('c2a', 'sBE', 'tMO', 2, 1, zs); std('c2a', 'sME', 'tMA', 2, 0, ms);
  std('c2a', 'sBSP', 'tPI', 3, 1, gym); werken('c2a');
  // 2b
  std('c2b', 'sD', 'tBE', 4); std('c2b', 'sE', 'tWA', 4); std('c2b', 'sM', 'tLE', 4); std('c2b', 'sGW', 'tBA', 2); std('c2b', 'sGS', 'tHU', 2);
  std('c2b', 'sBIO', 'tBA', 2); std('c2b', 'sPH', 'tGR', 1); std('c2b', 'sBE', 'tMO', 2, 1, zs); std('c2b', 'sME', 'tMA', 2, 0, ms);
  L({ subject: 'sBSP', teachers: [], pool: ['tPI', 'tST'], classes: ['c2b'], rooms: gym, perWeek: 3, doubles: 1 }); werken('c2b');
  religion('c2a', 'c2b');
  // Soll-Stunden: tatsächliche Stunden, Pool-Stunden anteilig; Huber zwei Stunden unter dem Soll (zur Veranschaulichung)
  var hrs = {}; teachers.forEach(function (x) { hrs[x.id] = 0; });
  lessons.forEach(function (l) {
    lessonParts(l).forEach(function (pt) { pt.teachers.forEach(function (id) { hrs[id] += l.perWeek; }); });
    l.coTeachers.forEach(function (id) { hrs[id] += l.teamHours || l.perWeek; });
    l.pool.forEach(function (id, i) { hrs[id] += i === 0 ? Math.ceil(l.perWeek / 2) : Math.floor(l.perWeek / 2); });
  });
  teachers.forEach(function (x) { x.target = hrs[x.id] + (x.id === 'tHU' ? 2 : 0); });
  var periods = [
    ['1', '07:50', '08:40'], ['2', '08:45', '09:35'], ['3', '09:50', '10:40'], ['4', '10:45', '11:35'],
    ['5', '11:40', '12:30'], ['6', '12:35', '13:25', true], ['7', '14:00', '14:50'], ['8', '14:55', '15:45']
  ].map(function (a) { return { label: a[0], start: a[1], end: a[2], noDouble: !!a[3] }; });
  var relations = [
    { id: 'rel1', type: 'diffDays', mode: 'subjects', subjects: ['sM', 'sPH'], lessons: [], importance: 'normal' },
    { id: 'rel2', type: 'diffDays', mode: 'subjects', subjects: ['sBSP'], lessons: [], importance: 'high' }
  ];
  return {
    version: 2,
    settings: { school: 'Mittelschule Beispielhausen', year: '2026/27', days: 5, periods: periods, weights: defaultWeights(), rules: defaultRules(), isSample: true },
    subjects: subjects, teachers: teachers, classes: classes, rooms: rooms, lessons: lessons, relations: relations, placements: {}, absences: [], subs: {}
  };
}

function emptyState() {
  var s = sampleState();
  s.settings.periods.forEach(function (p) { p.noDouble = false; });
  return { version: 2, settings: { school: 'Meine Schule', year: '2026/27', days: 5, periods: s.settings.periods, weights: defaultWeights(), rules: defaultRules(), isSample: false },
    subjects: [], teachers: [], classes: [], rooms: [], lessons: [], relations: [], placements: {}, absences: [], subs: {} };
}

if (typeof module !== 'undefined') module.exports = { sampleState: sampleState, buildModel: buildModel, placementsToList: placementsToList, listToPlacements: listToPlacements, lessonCards: lessonCards };
