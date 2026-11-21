/* ================= Rahmen ================= */
var TABS = [
  ['plan', 'Stundenplan'], ['vertretung', 'Vertretungen'], ['unterricht', 'Unterricht'], ['bedingungen', 'Bedingungen'],
  ['lehrkraefte', 'Lehrkräfte'], ['klassen', 'Klassen'], ['raeume', 'Räume'], ['faecher', 'Fächer'], ['einstellungen', 'Einstellungen']
];
function renderTabs() {
  var counts = { unterricht: state.lessons.length, lehrkraefte: state.teachers.length, klassen: state.classes.length, raeume: state.rooms.length, faecher: state.subjects.length, bedingungen: (state.relations || []).length };
  $('#tabs').innerHTML = TABS.map(function (t) {
    return '<button class="tab" data-tab="' + t[0] + '"' + (ui.tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + (counts[t[0]] ? '<span class="count num">' + counts[t[0]] + '</span>' : '') + '</button>';
  }).join('');
  $('#brand-school').textContent = (state.settings.school || '') + (state.settings.year ? ' · ' + state.settings.year : '');
}

function render() {
  renderTabs();
  var html = '';
  if (state.settings.isSample && !ui.bannerHidden) {
    html += '<div class="banner"><p><b>Beispielschule zum Ausprobieren.</b> Alle Namen sind erfunden. Sie enthält Teilungen (Religion, Werkgruppen), Kopplungen, Teamteaching und einen Sport-Pool.</p>' +
      '<button class="btn primary sm" data-act="start-empty" data-confirm="Beispiel wirklich verwerfen?">Eigene Schule anlegen</button><button class="btn ghost sm" data-act="hide-banner">Ausblenden</button></div>';
  }
  var fn = { plan: renderPlan, vertretung: renderSubs, unterricht: renderLessons, bedingungen: renderRules, lehrkraefte: renderTeachers, klassen: renderClasses, raeume: renderRooms, faecher: renderSubjects, einstellungen: renderSettings }[ui.tab] || renderPlan;
  html += fn();
  var main = $('#main'), sy = window.scrollY;
  main.innerHTML = html;
  window.scrollTo(0, sy);
  if (ui.tab === 'einstellungen') mountSettings();
  if (ui.tab === 'bedingungen') mountRules();
  if (ui.tab === 'vertretung') mountSubs();
}

/* ================= Stundenplan ================= */
function entityList(view) {
  if (view === 'class') return state.classes.map(function (c) { return { id: c.id, label: c.name }; });
  if (view === 'teacher') return state.teachers.map(function (t) { return { id: t.id, label: t.name + ' (' + t.short + ')' }; });
  if (view === 'room') return state.rooms.map(function (r) { return { id: r.id, label: r.name }; });
  return [];
}
function currentEntity() {
  var list = entityList(ui.view); if (!list.length) return null;
  var id = ui.entity[ui.view];
  if (!list.some(function (e) { return e.id === id; })) { id = list[0].id; ui.entity[ui.view] = id; }
  return id;
}
function cardMatches(card, view, eid) {
  var m = model();
  if (view === 'class') return card.classes.indexOf(m.cIdx[eid]) >= 0;
  if (view === 'teacher') { var ti = m.tIdx[eid]; return card.t.indexOf(ti) >= 0 || poolIdx(card) === ti || (!analysis().placed[card.id] && card.tp.indexOf(ti) >= 0); }
  if (view === 'room') { var pl = state.placements[card.id]; if (pl && analysis().placed[card.id]) return pl.rooms.indexOf(eid) >= 0; var ri = m.rIdx[eid]; return card.rr.some(function (o) { return o.indexOf(ri) >= 0; }); }
  return true;
}
/* Welche Teile einer Karte sind in dieser Ansicht relevant? */
function relevantParts(card, view, eid) {
  var m = model();
  if (view === 'class') { var ci = m.cIdx[eid]; return card.parts.filter(function (p) { return p.classes.indexOf(ci) >= 0; }); }
  if (view === 'teacher') {
    var ti = m.tIdx[eid];
    var ps = card.parts.filter(function (p) { return p.teachers.indexOf(ti) >= 0; });
    return ps.length ? ps : [card.parts[0]];
  }
  if (view === 'room') { var ps2 = card.parts.filter(function (p) { return partRoom(card, p) === eid; }); return ps2.length ? ps2 : [card.parts[0]]; }
  return card.parts;
}

function cardHtml(card, view, eid, extraStyle, inTray) {
  var pl = state.placements[card.id], an = analysis(), m = model();
  var parts = inTray ? card.parts : relevantParts(card, view, eid);
  var subj = uniq(parts.map(function (p) { return p.subject.short; })).join(' / ');
  var lines = [], pi = poolIdx(card);
  parts.slice(0, 3).forEach(function (p) {
    var bits = [];
    var partial = p.refs.some(function (r) { return r.indexOf(':') > 0; });
    if (view === 'class' && !inTray) {
      if (partial) {
        var cls = byId(state.classes, eid);
        bits.push(uniq(p.refs.filter(function (r) { return r.split(':')[0] === eid; }).map(function (r) { var g = r.split(':')[1]; return g ? groupName(cls, g) : cls.name; })).join(','));
      }
    } else bits.push(partGroups(p));
    if (view !== 'teacher' || parts.length > 1) {
      var ts = p.teachers.map(tShort);
      if (p.main && pi >= 0) ts.push(tShort(pi));
      if (p.main && card.tp.length && pi < 0) ts.push('Pool');
      if (p.main && card.co.length) ts.push('+' + card.co.map(tShort).join('+'));
      bits.push(ts.join(' '));
    } else if (p.main && card.co.length) {
      var ti = m.tIdx[eid];
      var others = card.t.filter(function (t) { return t !== ti; }).concat(pi >= 0 && pi !== ti ? [pi] : []);
      if (others.length) bits.push('mit ' + others.map(tShort).join(', '));
    }
    if (view !== 'room' && !inTray) { var r = partRoom(card, p); if (r) bits.push(roomShort(r)); }
    lines.push(bits.filter(Boolean).join(' · '));
  });
  if (parts.length > 3) lines.push('+' + (parts.length - 3) + ' weitere');
  if (inTray) lines.push(card.len === 2 ? 'Doppelstunde' : 'Einzelstunde');
  var badges = (card.team ? '<span class="c-badge" title="Teamteaching">TT</span>' : '') + (card.parts.length > 1 ? '<span class="c-badge" title="Kopplung">K</span>' : '');
  var cls = 'card' + (ui.selected === card.id ? ' selected' : '') + (an.conflicts[card.id] && !inTray ? ' conflict' : '');
  var title = cardTitle(card) + (an.conflicts[card.id] ? ' · Konflikt: ' + an.conflicts[card.id].join(', ') : '');
  return '<div class="' + cls + '" tabindex="0" data-card="' + esc(card.id) + '" title="' + esc(title) + '" style="--h:' + (parts[0] ? parts[0].subject.hue : card.subject.hue) + ';' + (extraStyle || '') + '">' +
    '<div class="c-sub"><span class="c-name">' + esc(subj) + '</span>' + badges + (pl && pl.locked && !inTray ? '<span class="c-pin" aria-label="fixiert">' + I.lock + '</span>' : '') + '</div>' +
    lines.filter(Boolean).map(function (l) { return '<div class="c-line">' + esc(l) + '</div>'; }).join('') + '</div>';
}

function renderPlan() {
  var m = model(), an = analysis();
  if (!state.classes.length && !state.teachers.length) {
    return '<div class="panel empty"><h3>Noch keine Daten</h3><p>Legen Sie zuerst Fächer, Lehrkräfte, Klassen und den Unterricht an. Danach kann der Plan berechnet werden.</p><button class="btn primary" data-tab="faecher">Mit Fächern beginnen</button></div>';
  }
  var total = m.cards.reduce(function (a, c) { return a + c.len; }, 0), placedN = total - an.unplaced.reduce(function (a, c) { return a + c.len; }, 0), nConf = Object.keys(an.conflicts).length;
  var nHard = an.report.filter(function (r) { return r.sev !== 'w'; }).length, nWish = an.report.length - nHard;
  var h = '<div class="plan-toolbar">' +
    '<div class="seg" role="group" aria-label="Ansicht">' + [['class', 'Klasse'], ['teacher', 'Lehrkraft'], ['room', 'Raum'], ['overview', 'Übersicht']].map(function (v) {
      return '<button data-act="view" data-v="' + v[0] + '" aria-pressed="' + (ui.view === v[0]) + '">' + v[1] + '</button>';
    }).join('') + '</div>';
  var eid = currentEntity();
  if (ui.view !== 'overview') {
    h += '<div class="entity-pick"><button class="icon-btn" data-act="ent-step" data-dir="-1" aria-label="Vorherige">' + I.left + '</button>' +
      '<select id="ent-sel" aria-label="Auswahl">' + entityList(ui.view).map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === eid ? ' selected' : '') + '>' + esc(e.label) + '</option>'; }).join('') + '</select>' +
      '<button class="icon-btn" data-act="ent-step" data-dir="1" aria-label="Nächste">' + I.right + '</button></div>';
  }
  h += '<span class="grow"></span>' +
    '<button class="btn" data-act="undo"' + (undoStack.length ? '' : ' disabled') + ' title="Strg+Z">' + I.undo + 'Rückgängig</button>' +
    '<button class="btn primary" data-act="gen-open">' + I.play + 'Plan berechnen</button></div>';
  h += '<div class="stats">' +
    '<span class="chip ' + (an.unplaced.length ? 'warn' : 'good') + ' num">' + placedN + ' von ' + total + ' Stunden verplant</span>' +
    '<span class="chip ' + (an.classGaps ? 'warn' : 'good') + ' num">' + plural(an.classGaps, 'Freistunde', 'Freistunden') + ' bei Klassen</span>' +
    '<span class="chip num">' + plural(an.teacherGaps, 'Hohlstunde', 'Hohlstunden') + ' bei Lehrkräften</span>' +
    '<span class="chip ' + (nHard ? 'warn' : 'good') + ' num">' + (nHard ? plural(nHard, 'Bedingung', 'Bedingungen') + ' verletzt' : 'Alle Bedingungen erfüllt') + '</span>' +
    (nWish ? '<span class="chip num">' + plural(nWish, 'Zeitwunsch', 'Zeitwünsche') + ' nicht erfüllt</span>' : '') +
    (nConf ? '<span class="chip bad num">' + plural(nConf, 'Konflikt', 'Konflikte') + '</span>' : '') + '</div>';
  h += '<div class="plan-layout"><div style="min-width:0">';
  if (ui.view === 'overview') h += renderOverview();
  else if (eid) h += renderGrid(ui.view, eid);
  else h += '<div class="panel empty"><p>Für diese Ansicht sind noch keine Einträge angelegt.</p></div>';
  h += '</div>' + renderSide(eid) + '</div>';
  return h;
}

/* Spuren für parallele Stunden (Gruppen) */
function laneLayout(items) {
  // items: [{d, p, len, id}] -> setzt lane und lanes
  var byDay = {};
  items.forEach(function (it) { (byDay[it.d] = byDay[it.d] || []).push(it); });
  Object.keys(byDay).forEach(function (d) {
    var list = byDay[d].sort(function (a, b) { return a.p - b.p || b.len - a.len; });
    var laneEnd = [];
    list.forEach(function (it) {
      var l = 0; while (laneEnd[l] != null && laneEnd[l] > it.p) l++;
      it.lane = l; laneEnd[l] = it.p + it.len;
    });
    // Cluster überlappender Stunden
    var cluster = [], end = -1;
    function close() { var mx = 0; cluster.forEach(function (x) { mx = Math.max(mx, x.lane + 1); }); cluster.forEach(function (x) { x.lanes = mx; }); cluster = []; }
    list.forEach(function (it) { if (it.p >= end && cluster.length) close(); cluster.push(it); end = Math.max(end, it.p + it.len); });
    close();
  });
}

function renderGrid(view, eid) {
  var m = model(), an = analysis(), st = state.settings, nS = m.nD * m.nP;
  var targets = ui.selected ? computeTargets(ui.selected) : null;
  ui.targets = targets;
  var title = '', sub = '', ent;
  if (view === 'class') {
    var c = byId(state.classes, eid), ci = m.cIdx[eid];
    title = 'Klasse ' + c.name; sub = m.weekly[ci] + ' Wochenstunden' + (c.homeRoom ? ' · Stammraum ' + roomShort(c.homeRoom) : '') + (c.divisions.length ? ' · Teilungen: ' + c.divisions.map(function (d) { return d.name + ' (' + d.groups.map(function (g) { return g.name; }).join('/') + ')'; }).join(', ') : '');
    ent = { unav: m.atoms[m.classAtomIdx[ci][0]] ? m.atoms[m.classAtomIdx[ci][0]].unav : [], pref: m.atoms[m.classAtomIdx[ci][0]] ? m.atoms[m.classAtomIdx[ci][0]].pref : [] };
  } else if (view === 'teacher') {
    var t = byId(state.teachers, eid), ti = m.tIdx[eid];
    var hrs = teacherHours()[ti];
    title = t.name; sub = t.short + ' · ' + hrs.total + ' Wochenstunden' + (t.target ? ' · Soll ' + t.target : '');
    ent = m.problem.teachers[ti];
  } else {
    var r = byId(state.rooms, eid);
    title = r.name; sub = r.short; ent = m.problem.rooms[m.rIdx[eid]];
  }
  var blocked = {}, pref = {};
  (ent.unav || []).forEach(function (s) { blocked[s] = true; });
  (ent.pref || []).forEach(function (s) { pref[s] = true; });
  var SUB = 12;
  var h = '<div class="plan-title"><h2>' + esc(title) + '</h2><span class="muted">' + esc(sub) + '</span></div>';
  h += '<div class="tt-wrap"><div class="tt' + (ui.selected ? ' picking' : '') + '" id="tt" style="--nd:' + m.nD + ';--np:' + m.nP + ';grid-template-columns:var(--perw) repeat(' + (m.nD * SUB) + ', minmax(0, 1fr))">';
  h += '<div class="tt-corner"></div>';
  for (var d = 0; d < m.nD; d++) h += '<div class="tt-day" style="grid-column:' + (d * SUB + 2) + ' / span ' + SUB + '">' + DAY_SHORT[d] + '</div>';
  for (var p = 0; p < m.nP; p++) {
    var per = st.periods[p];
    h += '<div class="tt-per' + (per.noDouble ? ' brk' : '') + '" style="grid-row:' + (p + 2) + '"><b>' + esc(per.label || (p + 1)) + '.</b><span>' + esc(per.start || '') + '<br>' + esc(per.end || '') + '</span></div>';
  }
  for (var s = 0; s < nS; s++) {
    var dd = Math.floor(s / m.nP), pp = s % m.nP, tc = '';
    if (targets && targets[s]) { var tg = targets[s]; tc = { ok: ' target-ok', soft: ' target-soft', swap: ' target-swap', no: ' target-no' }[tg.cls] || ''; }
    h += '<div class="tt-cell' + (blocked[s] ? ' blocked' : pref[s] ? ' undesired' : '') + (st.periods[pp].noDouble ? ' brk' : '') + tc + '" data-s="' + s + '" style="grid-row:' + (pp + 2) + ';grid-column:' + (dd * SUB + 2) + ' / span ' + SUB + '"' +
      (targets && targets[s] && targets[s].reasons && targets[s].reasons.length ? ' title="' + esc(targets[s].reasons.join(' · ')) + '"' : '') + '></div>';
  }
  var items = [];
  m.cards.forEach(function (card) {
    if (!an.placed[card.id] || !cardMatches(card, view, eid)) return;
    var pl = state.placements[card.id];
    items.push({ d: pl.d, p: pl.p, len: card.len, card: card });
  });
  laneLayout(items);
  items.forEach(function (it) {
    var span = Math.max(1, Math.floor(SUB / it.lanes)), col = it.d * SUB + 2 + it.lane * span;
    h += cardHtml(it.card, view, eid, 'grid-row:' + (it.p + 2) + ' / span ' + it.len + ';grid-column:' + col + ' / span ' + span);
  });
  h += '</div></div>';
  h += '<p class="hint" style="margin-top:8px">Stunden mit der Maus ziehen, oder antippen und dann ein grünes Feld wählen. Blau: Stunden werden getauscht. Gelb: möglich, aber unerwünscht. TT = Teamteaching, K = Kopplung.</p>';
  return h;
}

function renderOverview() {
  var m = model(), an = analysis();
  var h = '<div class="plan-title"><h2>Übersicht aller Klassen</h2><span class="muted">Klick auf eine Klasse öffnet ihren Plan</span></div>';
  h += '<div class="ov-wrap"><table class="ov"><thead><tr><th class="row" rowspan="2">Klasse</th>';
  for (var d = 0; d < m.nD; d++) h += '<th colspan="' + m.nP + '" class="day-start">' + DAY_SHORT[d] + '</th>';
  h += '</tr><tr>';
  for (d = 0; d < m.nD; d++) for (var p = 0; p < m.nP; p++) h += '<th class="num' + (p === 0 ? ' day-start' : '') + '">' + (p + 1) + '</th>';
  h += '</tr></thead><tbody>';
  state.classes.forEach(function (c, ci) {
    h += '<tr><th class="row"><button data-act="goto" data-v="class" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button></th>';
    for (var s = 0; s < m.nD * m.nP; s++) {
      var ids = an.occ['c' + ci + '_' + s] || [], cell = '';
      if (ids.length) {
        var cards = ids.map(function (id) { return m.cards[m.cardIndex[id]]; });
        var label = uniq([].concat.apply([], cards.map(function (k) { return relevantParts(k, 'class', c.id).map(function (pp) { return pp.subject.short; }); }))).join('/');
        cell = '<div style="--h:' + cards[0].subject.hue + '" title="' + esc(cards.map(cardTitle).join(' || ')) + '">' + esc(label) + '</div>';
      }
      h += '<td class="' + (s % m.nP === 0 ? 'day-start' : '') + '">' + cell + '</td>';
    }
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

function renderSide(eid) {
  var m = model(), an = analysis(), h = '<aside class="side">';
  if (ui.selected && m.cardIndex[ui.selected] !== undefined) {
    var card = m.cards[m.cardIndex[ui.selected]], pl = state.placements[card.id], placed = an.placed[card.id];
    var lesson = byId(state.lessons, card.lessonId);
    var when = 'Noch nicht verplant';
    if (placed) {
      var p1 = state.settings.periods[pl.p], p2 = state.settings.periods[pl.p + card.len - 1];
      when = DAY_NAMES[pl.d] + ', ' + (card.len === 2 ? (pl.p + 1) + '.–' + (pl.p + 2) + '. Stunde' : (pl.p + 1) + '. Stunde') + (p1 && p1.start ? ' · ' + p1.start + '–' + (p2.end || '') : '');
    }
    h += '<div class="panel detail"><div class="panel-body">' +
      '<div class="detail-head"><span class="swatch" style="--h:' + card.subject.hue + '"></span><div style="min-width:0;flex:1"><h3>' + esc(uniq(card.parts.map(function (p) { return p.subject.name; })).join(' / ')) + '</h3><span class="muted">' + (card.len === 2 ? 'Doppelstunde' : 'Einzelstunde') + (card.parts.length > 1 ? ' · Kopplung aus ' + card.parts.length + ' Teilen' : '') + '</span></div><button class="icon-btn" data-act="deselect" aria-label="Auswahl schließen">' + I.x + '</button></div>' +
      '<dl><dt>Zeit</dt><dd>' + esc(when) + '</dd>';
    card.parts.forEach(function (pt, i) {
      h += '<dt>' + (card.parts.length > 1 ? 'Teil ' + (i + 1) : 'Gruppe') + '</dt><dd>' + esc(pt.subject.short + ' · ' + (partGroups(pt) || '–') + ' · ' + (pt.teachers.map(tName).join(', ') || 'ohne Lehrkraft'));
      if (placed && pt.roomReq >= 0) {
        var opts = card.rr[pt.roomReq];
        h += '<select class="room-sel" data-card="' + esc(card.id) + '" data-req="' + pt.roomReq + '" aria-label="Raum" style="width:100%;margin-top:4px">' + opts.map(function (ri) { var r = state.rooms[ri]; return '<option value="' + esc(r.id) + '"' + (pl.rooms[pt.roomReq] === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</select>';
      }
      h += '</dd>';
    });
    if (card.co.length) h += '<dt>Teamteaching</dt><dd>' + esc(card.co.map(tName).join(', ')) + '</dd>';
    if (card.tp.length) {
      h += '<dt>Aus Pool</dt><dd>' + (placed ? '<select class="pool-sel" data-card="' + esc(card.id) + '" style="width:100%" aria-label="Lehrkraft aus Pool">' + card.tp.map(function (ti) { var t = state.teachers[ti]; return '<option value="' + esc(t.id) + '"' + (pl.pool === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select>' : esc(card.tp.map(tShort).join(', '))) + '</dd>';
    }
    if (an.conflicts[card.id]) h += '<dt>Konflikt</dt><dd style="color:var(--bad)">' + esc(an.conflicts[card.id].join(', ')) + '</dd>';
    h += '</dl><div class="row-btns">' +
      (placed ? '<button class="btn sm" data-act="lock" data-card="' + esc(card.id) + '">' + (pl.locked ? I.unlock + 'Lösen' : I.lock + 'Fixieren') + '</button><button class="btn sm" data-act="unplace" data-card="' + esc(card.id) + '">' + I.out + 'Aus dem Plan nehmen</button>' : '') +
      (lesson ? '<button class="btn sm ghost" data-act="edit" data-kind="lesson" data-id="' + esc(lesson.id) + '">' + I.edit + 'Unterricht bearbeiten</button>' : '') +
      '</div><p class="hint" style="margin:10px 0 0">' + (pl && pl.locked ? 'Fixierte Stunden bleiben beim Berechnen an ihrem Platz.' : 'Wählen Sie ein grünes Feld im Plan, um die Stunde dorthin zu legen.') + '</p></div></div>';
  }
  var open = an.unplaced.filter(function (c) { return ui.view === 'overview' || !eid || cardMatches(c, ui.view, eid); });
  h += '<div class="panel"><div class="panel-head"><h3>Nicht verplant</h3><span class="chip ' + (open.length ? 'warn' : 'good') + ' num">' + open.length + '</span></div><div class="panel-body">' +
    '<div class="tray-drop" id="tray-drop">Hier ablegen, um die Stunde aus dem Plan zu nehmen</div>' +
    (open.length ? '<div class="tray">' + open.slice(0, 60).map(function (c) { return cardHtml(c, ui.view, eid, '', true); }).join('') + '</div>' + (open.length > 60 ? '<p class="hint">und ' + (open.length - 60) + ' weitere</p>' : '')
      : '<p class="tray-empty">Alle Stunden sind verplant.</p>') + '</div></div>';
  var rep = an.report;
  if (rep.length) {
    var shown = ui.showAllHints ? rep : rep.slice(0, 8);
    h += '<div class="panel"><div class="panel-head"><h3>Hinweise</h3><span class="chip num">' + rep.length + '</span></div><div class="panel-body"><ul class="hints">' +
      shown.map(function (r) { return '<li class="sev-' + r.sev + '">' + esc(r.text) + '</li>'; }).join('') + '</ul>' +
      (rep.length > 8 ? '<button class="btn sm ghost" data-act="toggle-hints">' + (ui.showAllHints ? 'Weniger anzeigen' : 'Alle ' + rep.length + ' anzeigen') + '</button>' : '') + '</div></div>';
  }
  h += '<div class="panel"><div class="panel-body legend"><span><i style="background:var(--good-soft)"></i>frei, Stunde passt hierher</span><span><i style="background:var(--accent-soft)"></i>Tausch mit einer anderen Stunde</span><span><i style="background:var(--warn-soft)"></i>möglich, aber unerwünscht</span><span><i style="background:var(--bad-soft)"></i>belegt oder gesperrt</span></div></div>';
  return h + '</aside>';
}

/* ================= Ziehen & Ablegen ================= */
var drag = null, suppressClick = false;
document.addEventListener('pointerdown', function (e) {
  var cardEl = e.target.closest('.card[data-card]');
  if (!cardEl || e.button !== 0 || e.pointerType === 'touch' || ui.tab !== 'plan' || ui.view === 'overview') return;
  drag = { id: cardEl.dataset.card, x: e.clientX, y: e.clientY, started: false, el: cardEl };
});
document.addEventListener('pointermove', function (e) {
  if (!drag) return;
  if (!drag.started) {
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 6) return;
    drag.started = true;
    ui.selected = drag.id; render();
    var src = $('.card[data-card="' + CSS.escape(drag.id) + '"]');
    drag.ghost = (src || drag.el).cloneNode(true); drag.ghost.classList.add('drag-ghost'); drag.ghost.classList.remove('selected');
    document.body.appendChild(drag.ghost);
    drag.tip = document.createElement('div'); drag.tip.className = 'drag-tip'; drag.tip.hidden = true; document.body.appendChild(drag.tip);
    var tt = $('#tt'); if (tt) tt.classList.add('dragging');
    document.body.classList.add('dragging-on');
  }
  e.preventDefault();
  drag.ghost.style.left = (e.clientX - 50) + 'px'; drag.ghost.style.top = (e.clientY - 20) + 'px';
  var under = document.elementFromPoint(e.clientX, e.clientY);
  $$('.tt-cell.hover, .tray-drop.hover').forEach(function (x) { x.classList.remove('hover'); });
  var cell = under && under.closest('.tt-cell'), tray = under && under.closest('#tray-drop');
  drag.target = null;
  if (cell) {
    cell.classList.add('hover'); var s = +cell.dataset.s, t = ui.targets && ui.targets[s];
    drag.target = { s: s, t: t };
    var txt = !t ? '' : t.cls === 'ok' ? 'Passt' : t.cls === 'cur' ? 'Aktueller Platz' : (t.reasons || []).join(' · ');
    drag.tip.textContent = txt; drag.tip.hidden = !txt;
    drag.tip.style.left = (e.clientX + 16) + 'px'; drag.tip.style.top = (e.clientY + 22) + 'px';
  } else if (tray) { tray.classList.add('hover'); drag.target = { tray: true }; drag.tip.hidden = true; }
  else drag.tip.hidden = true;
});
document.addEventListener('pointerup', function () {
  if (!drag) return;
  var d = drag; drag = null;
  if (!d.started) return;
  suppressClick = true; setTimeout(function () { suppressClick = false; }, 0);
  if (d.ghost) d.ghost.remove(); if (d.tip) d.tip.remove();
  document.body.classList.remove('dragging-on');
  if (d.target && d.target.tray) { unplaceCard(d.id); return; }
  if (d.target && d.target.t) {
    if (applyTarget(d.id, d.target.s, d.target.t)) return;
    if (d.target.t.cls === 'no') toast((d.target.t.reasons || ['Nicht möglich']).join(' · '));
  }
  render();
});

/* ================= Generator ================= */
var gen = null;
function openGen() {
  var cores = navigator.hardwareConcurrency || 4, def = Math.max(1, Math.min(4, cores - 1));
  var m = model(), lockedN = Object.keys(state.placements).filter(function (id) { return state.placements[id].locked; }).length;
  var diag = diagnose(), bad = diag.filter(function (x) { return x.sev === 'bad'; });
  openDialog({
    title: 'Stundenplan berechnen',
    body: (bad.length ? '<div class="note bad"><b>' + plural(bad.length, 'Problem', 'Probleme') + ' in den Daten.</b> Der Plan kann so nicht vollständig werden: <ul>' + bad.slice(0, 5).map(function (x) { return '<li>' + esc(x.text) + '</li>'; }).join('') + '</ul><button type="button" class="btn sm" data-act="goto-rules">Alle Prüfergebnisse ansehen</button></div>' : '<div class="note good">' + I.check + ' Die Prüfung der Daten hat keine Probleme gefunden.</div>') +
      '<p class="hint" style="margin:0">Die Berechnung läuft in diesem Browser auf mehreren Prozessorkernen. Jeder Kern sucht unabhängig, am Ende wird der beste Plan übernommen.</p>' +
      '<div class="form-row"><label class="field">Rechenzeit<select id="g-time"><option value="10000">10 Sekunden</option><option value="30000" selected>30 Sekunden</option><option value="60000">1 Minute</option><option value="180000">3 Minuten</option><option value="600000">10 Minuten</option></select></label>' +
      '<label class="field">Prozessorkerne<select id="g-workers">' + [1, 2, 3, 4, 6, 8, 12, 16].filter(function (n) { return n <= Math.max(1, cores); }).map(function (n) { return '<option' + (n === def ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select><span class="hint">Ihr Gerät hat ' + cores + ' Kerne</span></label></div>' +
      '<div class="pick" role="radiogroup" aria-label="Modus"><label><input type="radio" name="g-mode" value="new" checked> Neu berechnen</label><label><input type="radio" name="g-mode" value="improve"> Aktuellen Plan verbessern</label></div>' +
      '<p class="hint" style="margin:0">' + m.cards.length + ' Einheiten, davon ' + lockedN + ' fixiert. Fixierte Stunden bleiben an ihrem Platz. Gewichtungen stellen Sie unter „Bedingungen“ ein.</p>' +
      '<div id="g-run" hidden><div class="gen-progress"><div id="g-bar"></div></div><div class="workers" id="g-workers-info"></div></div>',
    foot: '<button type="button" class="btn" data-act="dlg-close" id="g-cancel">Abbrechen</button><button type="button" class="btn" data-act="gen-stop" id="g-stop" hidden>Beenden und besten Plan übernehmen</button><button type="button" class="btn primary" data-act="gen-start" id="g-start">' + I.play + 'Berechnung starten</button>'
  });
}
function startGen() {
  var timeMs = +$('#g-time').value, nW = +$('#g-workers').value, mode = ($('input[name=g-mode]:checked') || {}).value || 'new';
  var m = model(), lk = placementsToList(state, m, true), all = placementsToList(state, m, false);
  var lockedIds = {}; Object.keys(state.placements).forEach(function (id) { if (state.placements[id].locked) lockedIds[id] = true; });
  var src = document.getElementById('solver-src').textContent + '\nsolverWorkerMain(self);';
  var url;
  try { url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })); } catch (e) { toast('Die Berechnung kann in diesem Browser nicht gestartet werden'); return; }
  gen = { m: m, workers: [], info: [], start: Date.now(), timeMs: timeMs, lockedIds: lockedIds, done: 0, url: url };
  for (var i = 0; i < nW; i++) {
    (function (i) {
      var w;
      try { w = new Worker(url); } catch (e) { gen.info[i] = { phase: 'error' }; return; }
      gen.info[i] = { phase: 'construct', value: null, result: null, final: null };
      w.onmessage = function (ev) {
        if (!gen) return;
        var msg = ev.data, inf = gen.info[i];
        if (msg.type === 'progress') { inf.phase = msg.phase; inf.value = msg.value; if (msg.unplaced != null) inf.unplaced = msg.unplaced; }
        else if (msg.type === 'snapshot') { inf.result = msg.result; }
        else if (msg.type === 'done') { inf.phase = 'done'; inf.final = msg.result; inf.stats = msg.stats; gen.done++; if (gen.done >= gen.workers.length) finishGen(true); }
        updateGenUi();
      };
      w.onerror = function () { if (!gen) return; gen.info[i].phase = 'error'; gen.done++; if (gen.done >= gen.workers.length) finishGen(true); };
      w.postMessage({ type: 'start', problem: m.problem, seed: (Math.random() * 1e9) | 0, initial: mode === 'improve' ? all.list : lk.list, locked: lk.locked, timeMs: timeMs });
      gen.workers.push(w);
    })(i);
  }
  if (!gen.workers.length) { toast('Die Berechnung kann in diesem Browser nicht gestartet werden'); gen = null; return; }
  $('#g-run').hidden = false; $('#g-start').hidden = true; $('#g-stop').hidden = false;
  $$('#g-time, #g-workers, input[name=g-mode]').forEach(function (x) { x.disabled = true; });
  gen.timer = setInterval(updateGenUi, 250);
  updateGenUi();
}
function updateGenUi() {
  if (!gen) return;
  var el = Date.now() - gen.start, pct = Math.min(100, el / gen.timeMs * 100);
  var bar = $('#g-bar'); if (bar) bar.style.width = pct + '%';
  var box = $('#g-workers-info'); if (!box) return;
  box.innerHTML = gen.info.map(function (inf, i) {
    var txt = inf.phase === 'construct' ? 'Baut Plan auf' + (inf.value != null ? ' · noch ' + inf.value + ' offen' : '') :
      inf.phase === 'optimize' ? 'Optimiert · Bewertung ' + (inf.value != null ? inf.value.toFixed(1) : '…') + (inf.unplaced ? ' · ' + inf.unplaced + ' offen' : '') :
        inf.phase === 'done' ? 'Fertig · ' + inf.stats.unplaced + ' offen, ' + inf.stats.classGaps + ' Freistunden, Bewertung ' + inf.stats.cost.toFixed(1) :
          inf.phase === 'error' ? 'Fehler' : '';
    return '<div><span>Kern ' + (i + 1) + '</span><span class="muted num">' + esc(txt) + '</span></div>';
  }).join('') + '<div><span>Laufzeit</span><span class="num">' + Math.round(el / 1000) + ' von ' + Math.round(gen.timeMs / 1000) + ' s</span></div>';
}
function finishGen(apply) {
  if (!gen) return;
  var g = gen; gen = null;
  clearInterval(g.timer);
  g.workers.forEach(function (w) { try { w.terminate(); } catch (e) { /* schon beendet */ } });
  try { URL.revokeObjectURL(g.url); } catch (e) { /* egal */ }
  if (!apply) { closeDialog(); return; }
  var best = null;
  g.info.forEach(function (inf) {
    var list = inf.final || inf.result; if (!list) return;
    var lk = []; list.forEach(function (e) { if (g.lockedIds[g.m.cards[e.k].id]) lk.push(e.k); });
    var s = createSolver(g.m.problem, 1); s.load(list, lk); var st = s.stats();
    if (!best || st.unplaced < best.st.unplaced || (st.unplaced === best.st.unplaced && st.cost < best.st.cost)) best = { st: st, list: s.snapshot() };
  });
  closeDialog();
  if (!best) { toast('Noch kein Ergebnis vorhanden. Bitte länger rechnen lassen.'); return; }
  pushUndo('Plan berechnet');
  state.placements = listToPlacements(state, g.m, best.list, g.lockedIds);
  ui.selected = null;
  changed(['placements']);
  var an = analysis();
  toast('Plan übernommen: ' + (g.m.cards.length - an.unplaced.length) + ' von ' + g.m.cards.length + ' Einheiten verplant, ' + plural(an.classGaps, 'Freistunde', 'Freistunden') + ' bei Klassen');
}

/* ================= Dialog ================= */
function openDialog(o) {
  var dlg = $('#dlg');
  dlg.innerHTML = '<form method="dialog" class="dlg" id="dlg-form"><div class="dlg-head"><h3>' + esc(o.title) + '</h3><button type="button" class="icon-btn" data-act="dlg-close" aria-label="Schließen">' + I.x + '</button></div><div class="dlg-body">' + o.body + '</div><div class="dlg-foot">' + (o.foot || '') + '</div></form>';
  dlg.className = o.wide ? 'wide' : '';
  dlg.onSave = o.onSave || null;
  dlg.onclick = null;
  if (!dlg.open) dlg.showModal();
  if (o.onMount) o.onMount(dlg);
  var first = dlg.querySelector('.dlg-body input[type=text], .dlg-body select'); if (first) first.focus();
}
function closeDialog() { var dlg = $('#dlg'); if (gen) { finishGen(false); } if (dlg.open) dlg.close(); }
$('#dlg').addEventListener('cancel', function (e) { if (gen) e.preventDefault(); });
$('#dlg').addEventListener('submit', function (e) { e.preventDefault(); var dlg = $('#dlg'); if (dlg.onSave && dlg.onSave(dlg) !== false) dlg.close(); });

/* Zeitraster mit drei Zuständen: frei / unerwünscht / gesperrt */
function avHtml(unav, pref, allowPref, labels) {
  var m = model(), off = {}, pr = {};
  (unav || []).forEach(function (k) { off[k] = true; }); (pref || []).forEach(function (k) { pr[k] = true; });
  labels = labels || { off: 'Gesperrt', pref: 'Unerwünscht' };
  var h = '<div class="av-brush seg" role="group" aria-label="Pinsel"><button type="button" data-brush="free" aria-pressed="false">Frei</button>' +
    (allowPref ? '<button type="button" data-brush="pref" aria-pressed="true">' + labels.pref + '</button>' : '') +
    '<button type="button" data-brush="off" aria-pressed="' + (!allowPref) + '">' + labels.off + '</button></div>';
  h += '<div class="av" id="av" style="--nd:' + m.nD + '"><div></div>';
  for (var d = 0; d < m.nD; d++) h += '<div>' + DAY_SHORT[d] + '</div>';
  for (var p = 0; p < m.nP; p++) {
    h += '<div>' + (p + 1) + '.</div>';
    for (d = 0; d < m.nD; d++) { var k = d + ':' + p, c = off[k] ? 'off' : pr[k] ? 'pref' : ''; h += '<button type="button" data-k="' + k + '" class="' + c + '" aria-label="' + DAY_NAMES[d] + ' ' + (p + 1) + '. Stunde"></button>'; }
  }
  return h + '</div><p class="hint" style="margin:0">Zuerst oben den Zustand wählen, dann Felder antippen oder mit gedrückter Maustaste überstreichen. Ein Klick auf den Tag-Namen setzt den ganzen Tag.</p>';
}
function mountAv(dlg) {
  var av = $('#av', dlg); if (!av) return;
  var brushBox = $('.av-brush', dlg), brush = $('[aria-pressed="true"]', brushBox).dataset.brush, painting = false;
  brushBox.addEventListener('click', function (e) { var b = e.target.closest('[data-brush]'); if (!b) return; brush = b.dataset.brush; $$('[data-brush]', brushBox).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });
  function apply(b) { b.classList.remove('off', 'pref'); if (brush !== 'free') b.classList.add(brush); }
  av.addEventListener('pointerdown', function (e) { var b = e.target.closest('button[data-k]'); if (!b) return; e.preventDefault(); painting = true; apply(b); });
  av.addEventListener('pointerover', function (e) { if (!painting) return; var b = e.target.closest('button[data-k]'); if (b) apply(b); });
  av.addEventListener('pointermove', function (e) { if (!painting || e.pointerType !== 'touch') return; var b = document.elementFromPoint(e.clientX, e.clientY); b = b && b.closest('#av button[data-k]'); if (b) apply(b); });
  document.addEventListener('pointerup', function () { painting = false; });
  av.addEventListener('click', function (e) {
    var head = e.target.closest('#av > div'); if (!head) return;
    var idx = Array.prototype.indexOf.call(av.children, head), d = idx - 1, nD = model().nD;
    if (d >= 0 && d < nD) $$('button[data-k^="' + d + ':"]', av).forEach(apply);
  });
  av.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.k) { e.preventDefault(); apply(e.target); } });
}
function avRead(dlg) {
  var unav = [], pref = [];
  $$('#av button.off', dlg).forEach(function (b) { unav.push(b.dataset.k); });
  $$('#av button.pref', dlg).forEach(function (b) { pref.push(b.dataset.k); });
  return { unav: unav, pref: pref };
}
