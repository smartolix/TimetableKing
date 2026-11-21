/* ================= Prüfung der Daten (vor dem Berechnen) ================= */
function diagnose() {
  var m = model(), out = [], nS = m.nD * m.nP, R = m.rules;
  function add(sev, text) { out.push({ sev: sev, text: text }); }
  // Klassen / Gruppen
  m.atoms.forEach(function (a) {
    var free = nS - a.unav.length;
    if (a.weekly > free) add('bad', a.name + ': ' + a.weekly + ' Wochenstunden, aber nur ' + free + ' mögliche Stunden');
    else if (a.maxHard && a.maxPerDay > 0 && a.weekly > a.maxPerDay * m.nD) add('bad', a.name + ': ' + a.weekly + ' Stunden passen nicht in ' + m.nD + ' Tage zu je höchstens ' + a.maxPerDay);
  });
  // Lehrkräfte
  var th = teacherHours();
  state.teachers.forEach(function (t, i) {
    var pt = m.problem.teachers[i], free = nS - pt.unav.length, need = th[i].fixed + th[i].team;
    if (need > free) add('bad', t.name + ': ' + need + ' Stunden, aber nur ' + free + ' verfügbare Stunden');
    if (pt.maxHard && pt.maxPerDay > 0) {
      var days = 0; for (var d = 0; d < m.nD; d++) { var any = false; for (var p = 0; p < m.nP; p++) if (pt.unav.indexOf(d * m.nP + p) < 0) any = true; if (any) days++; }
      if (need > pt.maxPerDay * days) add('bad', t.name + ': ' + need + ' Stunden passen nicht in ' + days + ' Tage zu je höchstens ' + pt.maxPerDay);
    }
    if (pt.maxDays > 0 && pt.maxPerDay > 0 && need > pt.maxDays * pt.maxPerDay) add('warn', t.name + ': ' + need + ' Stunden bei höchstens ' + pt.maxDays + ' Tagen zu ' + pt.maxPerDay + ' Stunden kaum möglich');
    if (t.target) { var diff = th[i].fixed + th[i].team + th[i].pool + th[i].poolOpen - t.target; if (diff < 0) add('info', t.name + ': ' + plural(-diff, 'Stunde', 'Stunden') + ' unter dem Soll (' + t.target + ')'); else if (th[i].fixed + th[i].team - t.target > 0) add('info', t.name + ': ' + plural(th[i].fixed + th[i].team - t.target, 'Stunde', 'Stunden') + ' über dem Soll (' + t.target + ')'); }
  });
  // Räume mit nur einer Option
  state.rooms.forEach(function (r, ri) {
    var need = 0; m.cards.forEach(function (c) { c.rr.forEach(function (o) { if (o.length === 1 && o[0] === ri) need += c.len; }); });
    var free = nS - m.problem.rooms[ri].unav.length;
    if (need > free) add('bad', r.name + ': wird ' + need + ' Stunden gebraucht, ist aber nur ' + free + ' Stunden verfügbar');
    else if (need > free * 0.9 && need > 0) add('warn', r.name + ': sehr stark ausgelastet (' + need + ' von ' + free + ' Stunden)');
  });
  // Unterricht
  state.lessons.forEach(function (l) {
    var parts = lessonParts(l), s = byId(state.subjects, l.subject), nm = (s ? s.short : '?') + ' ' + l.classes.map(function (r) { return refLabel(state, r); }).join(', ');
    if (!parts.some(function (p) { return p.teachers.length; }) && !l.pool.length) add('warn', nm + ': keine Lehrkraft eingetragen');
    if (!parts.some(function (p) { return p.classes.length; })) add('warn', nm + ': keine Klasse eingetragen');
    parts.forEach(function (p) { p.classes.forEach(function (r) { var a = r.split(':'), c = byId(state.classes, a[0]); if (!c || (a[1] && !groupName(c, a[1]))) add('bad', nm + ': Gruppe „' + r + '“ gibt es nicht mehr'); }); });
    var blocks = lessonCards(l).length, mx = l.maxPerDay > 0 ? l.maxPerDay : Math.ceil(blocks / m.nD);
    if (blocks > mx * m.nD) add('bad', nm + ': ' + blocks + ' Blöcke passen nicht in ' + m.nD + ' Tage bei höchstens ' + mx + ' pro Tag');
    if (l.coTeachers.length && l.teamHours > l.perWeek) add('warn', nm + ': mehr Teamteaching-Stunden als Wochenstunden');
  });
  // Karten ohne möglichen Platz
  try {
    var chk = createSolver(m.problem, 1); chk.load([], []);
    m.cards.forEach(function (c, k) {
      var any = false; for (var s2 = 0; s2 < nS && !any; s2++) { var r = chk.check(k, s2); if (!r.hard && r.rooms && r.tp !== -2) any = true; }
      if (!any) add('bad', c.label + (c.len === 2 ? ' (Doppelstunde)' : '') + ': passt zu keiner Zeit, weil Sperrzeiten von Lehrkraft, Klasse, Fach oder Raum alles blockieren');
    });
  } catch (e) { /* ignorieren */ }
  var order = { bad: 0, warn: 1, info: 2 };
  return out.sort(function (a, b) { return order[a.sev] - order[b.sev]; });
}

/* ================= Bedingungen ================= */
function impSel(key) {
  var cur = model().rules.imp[key];
  return '<select class="imp" data-imp="' + key + '" aria-label="Wichtigkeit">' + Object.keys(IMPORTANCE_LABEL).map(function (k) { return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + IMPORTANCE_LABEL[k] + '</option>'; }).join('') + '</select>';
}
function ruleRow(label, input, key, hint) {
  return '<div class="rule"><div class="rule-l"><span>' + label + '</span>' + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div><div class="rule-v">' + (input || '') + '</div><div class="rule-i">' + (key ? impSel(key) : '') + '</div></div>';
}
function rnum(key, min, max) { var R = model().rules; return '<input type="number" class="rnum" data-rule="' + key + '" min="' + min + '" max="' + max + '" value="' + esc(R[key]) + '" aria-label="Wert">'; }
function wslider(key, max, label, hint) {
  var w = state.settings.weights;
  return '<label class="weight"><span>' + label + '</span><output id="o-' + key + '" class="num">' + w[key] + '</output><input type="range" min="0" max="' + max + '" step="1" data-w="' + key + '" value="' + w[key] + '"><span class="hint">' + hint + '</span></label>';
}
function renderRules() {
  var st = state.settings, m = model(), R = m.rules;
  var diag = diagnose(), bad = diag.filter(function (x) { return x.sev === 'bad'; }).length, warn = diag.filter(function (x) { return x.sev === 'warn'; }).length;
  var h = '<div class="list-head"><h2>Bedingungen</h2><span class="muted">Was beim Berechnen gelten soll und wie wichtig es ist</span></div>';
  h += '<section class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>Prüfung der Daten</h3><span class="chip ' + (bad ? 'bad' : warn ? 'warn' : 'good') + '">' + (bad ? plural(bad, 'Problem', 'Probleme') : warn ? plural(warn, 'Warnung', 'Warnungen') : 'Alles in Ordnung') + '</span></div><div class="panel-body">' +
    (diag.length ? '<ul class="hints">' + diag.map(function (x) { return '<li class="sev-' + x.sev + '">' + esc(x.text) + '</li>'; }).join('') + '</ul>' : '<p class="muted" style="margin:0">Keine Probleme gefunden. Die Daten passen grundsätzlich in den Stundenplan.</p>') + '</div></section>';
  h += '<p class="hint" style="margin:0 0 12px">Wichtigkeit: <b>Muss</b> wird nie verletzt (wenn möglich als harte Regel), <b>Hoch</b> fast nie, <b>Normal</b> und <b>Niedrig</b> werden gegeneinander abgewogen, <b>Aus</b> wird ignoriert. Werte bei einzelnen Lehrkräften und Klassen überschreiben die Standardwerte.</p>';
  h += '<div class="settings-grid">';
  var periodsOpts = function (key) { return '<select data-rule="' + key + '" aria-label="Stunde">' + st.periods.map(function (p, i) { return '<option value="' + i + '"' + (R[key] === i ? ' selected' : '') + '>' + (i + 1) + '. Stunde</option>'; }).join('') + '</select>'; };
  h += '<section class="panel"><div class="panel-head"><h3>Lehrkräfte</h3></div><div class="panel-body rules">' +
    ruleRow('Höchstens Stunden pro Tag', rnum('tMaxPerDay', 1, 16), 'tMaxPerDay') +
    ruleRow('Höchstens Stunden am Stück', rnum('tMaxConsec', 1, 16), 'tMaxConsec') +
    ruleRow('Höchstens Hohlstunden pro Tag', rnum('tMaxGapsDay', 0, 10), 'tMaxGapsDay') +
    ruleRow('Höchstens Arbeitstage', rnum('tMaxDays', 0, 6), 'tMaxDays', '0 = keine Grenze; meist pro Lehrkraft gesetzt (Teilzeit)') +
    wslider('teacherGap', 30, 'Hohlstunden allgemein vermeiden', 'Jede Hohlstunde zählt, auch unter der Höchstgrenze') + '</div></section>';
  h += '<section class="panel"><div class="panel-head"><h3>Klassen</h3></div><div class="panel-body rules">' +
    ruleRow('Höchstens Stunden pro Tag', rnum('cMaxPerDay', 1, 16), 'cMaxPerDay') +
    ruleRow('Mindestens Stunden pro Tag', rnum('cMinPerDay', 0, 16), 'cMinPerDay') +
    wslider('classGap', 100, 'Freistunden vermeiden', 'Lücken im Tagesplan einer Klasse oder Gruppe') +
    wslider('classStart', 30, 'Unterricht beginnt in der 1. Stunde', 'Späterer Beginn wird pro Stunde bewertet') +
    wslider('dayBalance', 10, 'Gleichmäßige Tage', 'Jeder Tag ähnlich viele Stunden') +
    wslider('late', 30, 'Nachmittagsunterricht vermeiden', 'Gilt ab der eingestellten Stunde') +
    '<label class="field">Nachmittag beginnt ab<select id="s-latefrom">' + st.periods.map(function (p, i) { return '<option value="' + i + '"' + (st.weights.lateFrom === i ? ' selected' : '') + '>' + (i + 1) + '. Stunde</option>'; }).join('') + '</select></label></div></section>';
  h += '<section class="panel"><div class="panel-head"><h3>Mittagspause und Zeitwünsche</h3></div><div class="panel-body rules">' +
    ruleRow('Mittagspause im Zeitraum', periodsOpts('lunchFrom') + ' bis ' + periodsOpts('lunchTo'), null, 'Wer vor und nach diesem Zeitraum Unterricht hat, braucht darin eine freie Stunde') +
    ruleRow('Mittagspause für Klassen', '', 'lunchC') + ruleRow('Mittagspause für Lehrkräfte', '', 'lunchT') +
    ruleRow('Unerwünschte Zeiten freihalten', '', 'undesired', 'Gilt für Zeitwünsche bei Lehrkräften, Klassen und Fächern') +
    '<p class="hint" style="margin:0">Doppelstunden über eine große Pause verhindern Sie im Zeitraster unter „Einstellungen“.</p></div></section>';
  // Beziehungen
  h += '<section class="panel"><div class="panel-head"><h3>Beziehungen zwischen Unterricht</h3><button class="btn sm primary" data-act="add-rel">' + I.plus + 'Neue Beziehung</button></div><div class="panel-body">';
  if (!state.relations.length) h += '<p class="muted" style="margin:0">Noch keine Beziehungen. Beispiel: „Mathematik und Physik nicht am selben Tag“ oder „Sport höchstens einmal pro Tag“.</p>';
  else h += '<div class="rel-list">' + state.relations.map(function (r) {
    return '<div class="rel"><div style="min-width:0"><b>' + esc(relationName(state, r)) + '</b><span class="hint">' + esc(RELATION_TYPES[r.type] || '') + (r.mode === 'subjects' ? ' · gilt in jeder Klasse' : '') + '</span></div><span class="chip">' + IMPORTANCE_LABEL[r.importance] + '</span>' +
      '<button class="icon-btn" data-act="edit-rel" data-id="' + esc(r.id) + '" aria-label="Bearbeiten">' + I.edit + '</button><button class="icon-btn" data-act="del" data-kind="relation" data-id="' + esc(r.id) + '" data-confirm="Löschen?" aria-label="Löschen">' + I.trash + '</button></div>';
  }).join('') + '</div>';
  h += '</div></section>';
  h += '<section class="panel"><div class="panel-head"><h3>Weitere Bedingungen</h3></div><div class="panel-body"><ul class="plain">' +
    '<li><b>Sperrzeiten und Zeitwünsche</b> bei Lehrkräften, Klassen, Fächern und Räumen</li>' +
    '<li><b>Höchstens pro Tag</b> und <b>Doppelstunden</b> bei jedem Unterricht</li>' +
    '<li><b>Fixierte Stunden</b> im Stundenplan bleiben beim Berechnen an ihrem Platz</li>' +
    '<li><b>Teilungen und Kopplungen</b>: Gruppen einer Teilung dürfen parallel Unterricht haben</li></ul>' +
    '<button class="btn sm" data-act="w-reset">Alle Gewichtungen auf Standard</button></div></section>';
  return h + '</div>';
}
function mountRules() {
  var st = state.settings;
  $$('[data-imp]').forEach(function (sel) { sel.addEventListener('change', function () { st.rules.imp[sel.dataset.imp] = sel.value; changed(['settings']); }); });
  $$('[data-rule]').forEach(function (inp) { inp.addEventListener('change', function () { st.rules[inp.dataset.rule] = Math.max(0, +inp.value || 0); changed(['settings']); }); });
  $$('[data-w]').forEach(function (inp) {
    inp.addEventListener('input', function () { $('#o-' + inp.dataset.w).textContent = inp.value; });
    inp.addEventListener('change', function () { st.weights[inp.dataset.w] = +inp.value; changed(['settings']); });
  });
  var lf = $('#s-latefrom'); if (lf) lf.addEventListener('change', function () { st.weights.lateFrom = +lf.value; changed(['settings']); });
}
function lessonLabel(l) {
  var s = byId(state.subjects, l.subject), ts = l.teachers.map(function (id) { var t = byId(state.teachers, id); return t ? t.short : ''; }).join(',');
  return (s ? s.short : '?') + ' · ' + (l.classes.map(function (r) { return refLabel(state, r); }).join(', ') || '–') + (ts ? ' · ' + ts : '');
}
function editRelation(id) {
  var r = id ? byId(state.relations, id) : null, isNew = !r;
  r = r || { id: uid('rel'), type: 'diffDays', mode: 'subjects', subjects: [], lessons: [], importance: 'normal' };
  var body = '<label class="field">Art der Beziehung<select id="r-type">' + Object.keys(RELATION_TYPES).map(function (k) { return '<option value="' + k + '"' + (r.type === k ? ' selected' : '') + '>' + RELATION_TYPES[k] + '</option>'; }).join('') + '</select></label>' +
    '<div class="pick" role="radiogroup" aria-label="Gilt für"><label><input type="radio" name="r-mode" value="subjects"' + (r.mode === 'subjects' ? ' checked' : '') + '> Fächer, in jeder Klasse</label><label><input type="radio" name="r-mode" value="lessons"' + (r.mode === 'lessons' ? ' checked' : '') + '> Bestimmte Unterrichte</label></div>' +
    '<div id="r-subj" class="field"' + (r.mode === 'subjects' ? '' : ' hidden') + '><b class="hint">Fächer</b>' + pickHtml('r-subjects', state.subjects, r.subjects || [], function (s) { return s.short + ' · ' + s.name; }) + '</div>' +
    '<div id="r-less" class="field"' + (r.mode === 'lessons' ? '' : ' hidden') + '><b class="hint">Unterrichte</b><div class="pick pick-scroll">' + state.lessons.map(function (l) { return '<label><input type="checkbox" name="r-lessons" value="' + esc(l.id) + '"' + ((r.lessons || []).indexOf(l.id) >= 0 ? ' checked' : '') + '>' + esc(lessonLabel(l)) + '</label>'; }).join('') + '</div></div>' +
    '<label class="field" style="max-width:240px">Wichtigkeit<select id="r-imp">' + Object.keys(IMPORTANCE_LABEL).filter(function (k) { return k !== 'off'; }).map(function (k) { return '<option value="' + k + '"' + (r.importance === k ? ' selected' : '') + '>' + IMPORTANCE_LABEL[k] + '</option>'; }).join('') + '</select></label>' +
    '<p class="hint" style="margin:0">„Höchstens eine Stunde pro Tag aus dieser Gruppe“ mit einem einzigen Fach heißt: dieses Fach höchstens einmal pro Tag. Mit zwei Fächern: nie beide am selben Tag.</p>';
  openDialog({
    title: isNew ? 'Neue Beziehung' : 'Beziehung bearbeiten', body: body,
    foot: '<button type="button" class="btn" data-act="dlg-close">Abbrechen</button><button type="submit" class="btn primary">Speichern</button>',
    onMount: function (dlg) {
      $$('input[name=r-mode]', dlg).forEach(function (x) { x.addEventListener('change', function () { var md = $('input[name=r-mode]:checked', dlg).value; $('#r-subj', dlg).hidden = md !== 'subjects'; $('#r-less', dlg).hidden = md !== 'lessons'; }); });
    },
    onSave: function (dlg) {
      r.type = $('#r-type', dlg).value; r.mode = $('input[name=r-mode]:checked', dlg).value; r.importance = $('#r-imp', dlg).value;
      r.subjects = readPick(dlg, 'r-subjects'); r.lessons = readPick(dlg, 'r-lessons');
      if ((r.mode === 'subjects' ? r.subjects : r.lessons).length < 1) { toast('Bitte mindestens ein Fach oder einen Unterricht wählen'); return false; }
      if (isNew) state.relations.push(r);
      changed(['relations']); toast('Gespeichert');
    }
  });
}
