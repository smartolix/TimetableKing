/* ================= Vertretungen (Supplierplanung) ================= */
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function isoToday() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function isoDate(iso) { var a = iso.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
function weekdayIdx(iso) { return (isoDate(iso).getDay() + 6) % 7; }
function addDays(iso, n) { var d = isoDate(iso); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function fmtDate(iso, long) { try { return isoDate(iso).toLocaleDateString('de-AT', long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'numeric' }); } catch (e) { return iso; } }
function subDate() { if (!ui.subDate) { ui.subDate = isoToday(); var w = weekdayIdx(ui.subDate); if (w >= model().nD) ui.subDate = addDays(ui.subDate, 7 - w); } return ui.subDate; }
function periodLabel(a) { return a.pFrom == null ? 'ganztägig' : (a.pFrom + 1) + '.–' + (a.pTo + 1) + '. Stunde'; }
function absName(a) { if (a.kind === 'class') { var c = byId(state.classes, a.ref); return c ? 'Klasse ' + c.name : '?'; } var t = byId(state.teachers, a.ref); return t ? t.name : '?'; }

function subData(date) {
  var m = model(), an = analysis(), d = weekdayIdx(date);
  if (d >= m.nD) return null;
  var active = state.absences.filter(function (a) { return a.from <= date && date <= (a.to || a.from); });
  var absT = {}, absC = {};
  active.forEach(function (a) {
    var range = a.pFrom == null ? [0, m.nP - 1] : [a.pFrom, a.pTo];
    if (a.kind === 'class') { var ci = m.cIdx[a.ref]; if (ci !== undefined) (absC[ci] = absC[ci] || []).push(range); }
    else { var ti = m.tIdx[a.ref]; if (ti !== undefined) (absT[ti] = absT[ti] || []).push(range); }
  });
  function hit(ranges, periods) { return !!ranges && periods.some(function (p) { return ranges.some(function (r) { return p >= r[0] && p <= r[1]; }); }); }
  var rows = [], freed = {}, dayCards = [];
  m.cards.forEach(function (card) {
    if (!an.placed[card.id]) return;
    var pl = state.placements[card.id]; if (pl.d !== d) return;
    var periods = []; for (var j = 0; j < card.len; j++) periods.push(pl.p + j);
    var classAbsent = card.classes.length > 0 && card.classes.every(function (c) { return hit(absC[c], periods); });
    dayCards.push({ card: card, periods: periods, classAbsent: classAbsent });
    if (classAbsent) freed[card.id] = true;
    cardTeachers(card).forEach(function (t) { if (hit(absT[t], periods)) rows.push({ card: card, t: t, periods: periods, classAbsent: classAbsent, key: date + '|' + card.id + '|' + state.teachers[t].id }); });
  });
  rows.sort(function (a, b) { return a.periods[0] - b.periods[0] || a.card.label.localeCompare(b.card.label); });
  var freedTeachers = [];
  dayCards.forEach(function (x) { if (x.classAbsent) cardTeachers(x.card).forEach(function (t) { if (!hit(absT[t], x.periods)) freedTeachers.push({ t: t, card: x.card, periods: x.periods }); }); });
  return { d: d, rows: rows, absT: absT, absC: absC, hit: hit, freed: freed, active: active, freedTeachers: freedTeachers };
}

function subCounts() {
  var c = {}, month = subDate().slice(0, 7);
  Object.keys(state.subs).forEach(function (k) {
    var s = state.subs[k]; if (s.mode !== 'sub' || !s.teacher) return;
    var o = c[s.teacher] = c[s.teacher] || { all: 0, month: 0 }; o.all++; if (k.slice(0, 7) === month) o.month++;
  });
  return c;
}

function candidates(data, row, date) {
  var m = model(), an = analysis(), counts = subCounts(), out = [];
  var assigned = {};
  data.rows.forEach(function (r) {
    if (r === row) return; var s = state.subs[r.key];
    if (s && s.mode === 'sub' && s.teacher) r.periods.forEach(function (p) { if (row.periods.indexOf(p) >= 0) assigned[s.teacher] = true; });
  });
  state.teachers.forEach(function (t, i) {
    if (i === row.t || assigned[t.id]) return;
    if (data.hit(data.absT[i], row.periods)) return;
    var reasons = [], score = 0, ok = true, freedHere = false, inTeam = false;
    row.periods.forEach(function (p) {
      var s = data.d * m.nP + p;
      if (m.problem.teachers[i].unav.indexOf(s) >= 0) ok = false;
      (an.occ['t' + i + '_' + s] || []).forEach(function (cid) {
        if (cid === row.card.id) inTeam = true;
        else if (data.freed[cid]) freedHere = true;
        else ok = false;
      });
    });
    if (!ok) return;
    var day = []; for (var p = 0; p < m.nP; p++) if ((an.occ['t' + i + '_' + (data.d * m.nP + p)] || []).length) day.push(p);
    if (inTeam) { score += 5; reasons.push('ist schon im Teamteaching dabei'); }
    if (freedHere) { score += 3; reasons.push('frei, weil Klasse abwesend'); }
    if (!day.length) { score -= 4; reasons.push('hat an dem Tag frei'); }
    else if (!inTeam && day[0] < row.periods[0] && day[day.length - 1] > row.periods[row.periods.length - 1]) { score += 3; reasons.push('Hohlstunde'); }
    var knowsClass = m.cards.some(function (k) { return k.t.indexOf(i) >= 0 && k.classes.some(function (c) { return row.card.classes.indexOf(c) >= 0; }); });
    if (knowsClass && !inTeam) { score += 2; reasons.push('unterrichtet die Klasse'); }
    var subjIds = row.card.parts.map(function (pp) { return pp.subject.id; });
    var knowsSubj = m.cards.some(function (k) { return k.t.indexOf(i) >= 0 && k.parts.some(function (pp) { return subjIds.indexOf(pp.subject.id) >= 0; }); });
    if (knowsSubj) { score += 2; reasons.push('Fachlehrkraft'); }
    var cnt = counts[t.id] ? counts[t.id].month : 0;
    if (cnt) { score -= cnt * 0.7; reasons.push(cnt + ' Vertretung' + (cnt > 1 ? 'en' : '') + ' diesen Monat'); }
    out.push({ t: i, id: t.id, score: score, reasons: reasons });
  });
  return out.sort(function (a, b) { return b.score - a.score || state.teachers[a.t].name.localeCompare(state.teachers[b.t].name); });
}

function renderSubs() {
  var m = model(), date = subDate();
  var h = '<div class="list-head"><h2>Vertretungen</h2><span class="muted">Abwesenheiten eintragen, Vertretungen planen, Vertretungsplan ausgeben</span></div>';
  if (!state.teachers.length || !m.cards.length) return h + '<div class="panel empty"><p>Für die Vertretungsplanung braucht es zuerst einen Stundenplan.</p></div>';
  h += '<div class="plan-toolbar"><div class="entity-pick"><button class="icon-btn" data-act="sub-day" data-dir="-1" aria-label="Vorheriger Tag">' + I.left + '</button>' +
    '<input type="date" id="sub-date" value="' + esc(date) + '" aria-label="Datum"><button class="icon-btn" data-act="sub-day" data-dir="1" aria-label="Nächster Tag">' + I.right + '</button></div>' +
    '<button class="btn sm" data-act="sub-today">Heute</button><b class="sub-date-label">' + esc(fmtDate(date, true)) + '</b><span class="grow"></span>' +
    '<button class="btn" data-act="add-abs">' + I.plus + 'Abwesenheit</button><button class="btn" data-act="export-subs">' + I.down + 'Vertretungsplan</button></div>';
  var data = subData(date);
  h += '<div class="plan-layout"><div style="min-width:0;display:grid;gap:16px">';
  if (!data) h += '<div class="panel empty"><p>An diesem Tag ist kein Unterricht.</p></div>';
  else {
    var open = data.rows.filter(function (r) { return !r.classAbsent && !state.subs[r.key]; }).length;
    h += '<section class="panel"><div class="panel-head"><h3>Betroffene Stunden</h3><span class="chip ' + (open ? 'warn' : 'good') + '">' + (data.rows.length ? (open ? open + ' offen' : 'alle geregelt') : 'keine') + '</span></div>';
    if (!data.rows.length) h += '<div class="panel-body"><p class="muted" style="margin:0">' + (data.active.length ? 'Die Abwesenheiten betreffen an diesem Tag keinen Unterricht.' : 'Für diesen Tag ist keine Abwesenheit eingetragen.') + '</p></div>';
    else {
      h += '<div class="tbl-wrap" style="border:0;border-radius:0"><table class="tbl subs"><thead><tr><th>Std.</th><th>Klasse</th><th>Fach</th><th>Abwesend</th><th>Raum</th><th>Regelung</th></tr></thead><tbody>';
      data.rows.forEach(function (r, ri) {
        var card = r.card, pl = state.placements[card.id], s = state.subs[r.key];
        var part = card.parts.filter(function (p) { return p.teachers.indexOf(r.t) >= 0; })[0] || card.parts[0];
        var rooms = uniq(pl.rooms.filter(Boolean).map(roomShort)).join(', ');
        h += '<tr><td class="num">' + r.periods.map(function (p) { return p + 1; }).join('–') + '</td><td>' + esc(partGroups(part) || cardClassLabel(card)) + '</td><td><span class="tag subj-tag" style="--h:' + part.subject.hue + '">' + esc(part.subject.short) + '</span></td>' +
          '<td><s>' + esc(tShort(r.t)) + '</s></td><td>' + esc(rooms || '–') + '</td><td>';
        if (r.classAbsent) h += '<span class="chip">Klasse abwesend, entfällt</span>';
        else {
          var cands = candidates(data, r, date);
          var val = s ? (s.mode === 'sub' ? 'sub:' + s.teacher : s.mode) : '';
          h += '<select class="sub-sel" data-key="' + esc(r.key) + '" aria-label="Regelung"><option value="">– offen –</option><option value="cancel"' + (val === 'cancel' ? ' selected' : '') + '>Entfall</option><option value="care"' + (val === 'care' ? ' selected' : '') + '>Mitbetreuung / Aufsicht</option>' +
            '<optgroup label="Vertretung durch">' + cands.map(function (c) { return '<option value="sub:' + esc(c.id) + '"' + (val === 'sub:' + c.id ? ' selected' : '') + '>' + esc(state.teachers[c.t].short + ' · ' + state.teachers[c.t].name + (c.reasons.length ? ' (' + c.reasons.join(', ') + ')' : '')) + '</option>'; }).join('') + '</optgroup></select>';
          if (!s) h += '<div class="sugg">' + cands.slice(0, 3).map(function (c) { return '<button class="btn sm" data-act="sub-pick" data-key="' + esc(r.key) + '" data-t="' + esc(c.id) + '" title="' + esc(c.reasons.join(', ')) + '">' + esc(state.teachers[c.t].short) + '<span class="muted">' + esc(c.reasons[0] || '') + '</span></button>'; }).join('') + '</div>';
          if (s && s.mode === 'care') h += '<input type="text" class="sub-note" data-key="' + esc(r.key) + '" placeholder="Wer betreut? (Notiz)" value="' + esc(s.note || '') + '" aria-label="Notiz">';
        }
        h += '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</section>';
    if (data.freedTeachers.length) {
      h += '<section class="panel"><div class="panel-head"><h3>Frei gewordene Lehrkräfte</h3></div><div class="panel-body"><ul class="plain">' +
        data.freedTeachers.map(function (f) { return '<li>' + esc(tName(f.t)) + ': ' + f.periods.map(function (p) { return p + 1; }).join('–') + '. Stunde frei (' + esc(cardClassLabel(f.card)) + ' abwesend)</li>'; }).join('') + '</ul></div></section>';
    }
  }
  h += '</div><aside class="side">';
  var upcoming = state.absences.filter(function (a) { return (a.to || a.from) >= date; }).sort(function (a, b) { return a.from.localeCompare(b.from); });
  h += '<div class="panel"><div class="panel-head"><h3>Abwesenheiten</h3><button class="btn sm" data-act="add-abs">' + I.plus + 'Neu</button></div><div class="panel-body">';
  if (!upcoming.length) h += '<p class="muted" style="margin:0">Ab diesem Tag ist keine Abwesenheit eingetragen.</p>';
  else h += '<ul class="abs-list">' + upcoming.map(function (a) {
    var act = a.from <= date && date <= (a.to || a.from);
    return '<li class="' + (act ? 'active' : '') + '"><div style="min-width:0"><b>' + esc(absName(a)) + '</b><span class="hint">' + esc(fmtDate(a.from) + (a.to && a.to !== a.from ? ' bis ' + fmtDate(a.to) : '') + ' · ' + periodLabel(a) + (a.note ? ' · ' + a.note : '')) + '</span></div>' +
      '<button class="icon-btn" data-act="edit-abs" data-id="' + esc(a.id) + '" aria-label="Bearbeiten">' + I.edit + '</button><button class="icon-btn" data-act="del" data-kind="absence" data-id="' + esc(a.id) + '" data-confirm="Löschen?" aria-label="Löschen">' + I.trash + '</button></li>';
  }).join('') + '</ul>';
  h += '</div></div>';
  var counts = subCounts(), list = state.teachers.map(function (t) { return { t: t, c: counts[t.id] || { all: 0, month: 0 } }; }).filter(function (x) { return x.c.all; }).sort(function (a, b) { return b.c.all - a.c.all; });
  h += '<div class="panel"><div class="panel-head"><h3>Vertretungsstatistik</h3></div><div class="panel-body">' +
    (list.length ? '<table class="tbl compact"><thead><tr><th>Lehrkraft</th><th>Monat</th><th>Gesamt</th></tr></thead><tbody>' + list.map(function (x) { return '<tr><td>' + esc(x.t.name) + '</td><td class="num">' + x.c.month + '</td><td class="num">' + x.c.all + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted" style="margin:0">Noch keine Vertretungen eingetragen.</p>') +
    '</div></div></aside></div>';
  return h;
}
function mountSubs() {
  var di = $('#sub-date'); if (di) di.addEventListener('change', function () { if (di.value) { ui.subDate = di.value; render(); } });
  $$('.sub-sel').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var v = sel.value, k = sel.dataset.key;
      if (!v) delete state.subs[k];
      else if (v.indexOf('sub:') === 0) state.subs[k] = { mode: 'sub', teacher: v.slice(4) };
      else state.subs[k] = { mode: v, teacher: null, note: (state.subs[k] && state.subs[k].note) || '' };
      changed(['subs']);
    });
  });
  $$('.sub-note').forEach(function (inp) { inp.addEventListener('change', function () { var s = state.subs[inp.dataset.key]; if (s) { s.note = inp.value; changed(['subs']); } }); });
}
function editAbsence(id) {
  var a = id ? byId(state.absences, id) : null, isNew = !a, m = model();
  a = a || { id: uid('a'), kind: 'teacher', ref: state.teachers[0] ? state.teachers[0].id : '', from: subDate(), to: subDate(), pFrom: null, pTo: null, note: '' };
  var perOpts = function (sel) { return state.settings.periods.map(function (p, i) { return '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + (i + 1) + '. Stunde</option>'; }).join(''); };
  var body = '<div class="pick" role="radiogroup" aria-label="Wer"><label><input type="radio" name="a-kind" value="teacher"' + (a.kind === 'teacher' ? ' checked' : '') + '> Lehrkraft</label><label><input type="radio" name="a-kind" value="class"' + (a.kind === 'class' ? ' checked' : '') + '> Klasse (z. B. Exkursion)</label></div>' +
    '<label class="field" id="a-t-wrap"' + (a.kind === 'teacher' ? '' : ' hidden') + '>Lehrkraft<select id="a-t">' + state.teachers.map(function (t) { return '<option value="' + esc(t.id) + '"' + (a.ref === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></label>' +
    '<label class="field" id="a-c-wrap"' + (a.kind === 'class' ? '' : ' hidden') + '>Klasse<select id="a-c">' + state.classes.map(function (c) { return '<option value="' + esc(c.id) + '"' + (a.ref === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
    '<div class="form-row"><label class="field">Von<input type="date" id="a-from" value="' + esc(a.from) + '" required></label><label class="field">Bis<input type="date" id="a-to" value="' + esc(a.to || a.from) + '"></label></div>' +
    '<label class="check"><input type="checkbox" id="a-all"' + (a.pFrom == null ? ' checked' : '') + '> Ganztägig</label>' +
    '<div class="form-row" id="a-per"' + (a.pFrom == null ? ' hidden' : '') + '><label class="field">Ab<select id="a-pf">' + perOpts(a.pFrom == null ? 0 : a.pFrom) + '</select></label><label class="field">Bis<select id="a-pt">' + perOpts(a.pTo == null ? m.nP - 1 : a.pTo) + '</select></label></div>' +
    '<label class="field">Grund (optional)<input type="text" id="a-note" value="' + esc(a.note || '') + '" placeholder="z. B. krank, Fortbildung, Wandertag"></label>';
  openDialog({
    title: isNew ? 'Abwesenheit eintragen' : 'Abwesenheit bearbeiten', body: body,
    foot: '<button type="button" class="btn" data-act="dlg-close">Abbrechen</button><button type="submit" class="btn primary">Speichern</button>',
    onMount: function (dlg) {
      $$('input[name=a-kind]', dlg).forEach(function (x) { x.addEventListener('change', function () { var k = $('input[name=a-kind]:checked', dlg).value; $('#a-t-wrap', dlg).hidden = k !== 'teacher'; $('#a-c-wrap', dlg).hidden = k !== 'class'; }); });
      $('#a-all', dlg).addEventListener('change', function (e) { $('#a-per', dlg).hidden = e.target.checked; });
    },
    onSave: function (dlg) {
      a.kind = $('input[name=a-kind]:checked', dlg).value; a.ref = a.kind === 'teacher' ? $('#a-t', dlg).value : $('#a-c', dlg).value;
      a.from = $('#a-from', dlg).value; a.to = $('#a-to', dlg).value || a.from; if (a.to < a.from) a.to = a.from;
      if ($('#a-all', dlg).checked) { a.pFrom = null; a.pTo = null; } else { a.pFrom = +$('#a-pf', dlg).value; a.pTo = Math.max(a.pFrom, +$('#a-pt', dlg).value); }
      a.note = $('#a-note', dlg).value.trim();
      if (!a.from || !a.ref) { toast('Bitte Datum und Person oder Klasse wählen'); return false; }
      if (isNew) state.absences.push(a);
      changed(['absences']); toast('Abwesenheit gespeichert');
    }
  });
}
function exportSubs() {
  var date = subDate(), data = subData(date), st = state.settings;
  if (!data) { toast('An diesem Tag ist kein Unterricht'); return; }
  var rows = data.rows.map(function (r) {
    var card = r.card, pl = state.placements[card.id], s = state.subs[r.key];
    var part = card.parts.filter(function (p) { return p.teachers.indexOf(r.t) >= 0; })[0] || card.parts[0];
    var what = r.classAbsent ? 'entfällt (Klasse abwesend)' : !s ? 'offen' : s.mode === 'cancel' ? 'Entfall' : s.mode === 'care' ? 'Mitbetreuung' + (s.note ? ': ' + s.note : '') : 'Vertretung: ' + (byId(state.teachers, s.teacher) || {}).name;
    return '<tr><td>' + r.periods.map(function (p) { return p + 1; }).join('–') + '</td><td>' + esc(partGroups(part)) + '</td><td>' + esc(part.subject.short) + '</td><td>' + esc(uniq(pl.rooms.filter(Boolean).map(roomShort)).join(', ')) + '</td><td><s>' + esc(tShort(r.t)) + '</s></td><td><b>' + esc(what) + '</b></td></tr>';
  }).join('');
  var abs = data.active.map(function (a) { return esc(absName(a)) + ' (' + periodLabel(a) + ')'; }).join(', ');
  var doc = '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Vertretungsplan ' + esc(date) + '</title><style>@page{size:A4;margin:12mm}body{font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#15212c}h1{font-size:22px;margin:0}p{color:#444}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #9aa7b3;padding:7px;text-align:left}th{background:#eef2f5}</style></head><body>' +
    '<h1>Vertretungsplan ' + esc(fmtDate(date, true)) + '</h1><p>' + esc(st.school) + '</p><p><b>Abwesend:</b> ' + (abs || '–') + '</p>' +
    '<table><thead><tr><th>Stunde</th><th>Klasse</th><th>Fach</th><th>Raum</th><th>statt</th><th>Regelung</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6">Keine Änderungen</td></tr>') + '</tbody></table></body></html>';
  offerFile('Vertretungsplan-' + date + '.html', doc);
}
