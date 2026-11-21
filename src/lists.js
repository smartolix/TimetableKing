/* ================= Listen ================= */
function teacherHours() {
  var m = model(), an = analysis(), out = state.teachers.map(function () { return { fixed: 0, team: 0, pool: 0, poolOpen: 0, total: 0, placed: 0 }; });
  m.cards.forEach(function (c) {
    c.t.forEach(function (t) { if (c.co.indexOf(t) >= 0) out[t].team += c.len; else out[t].fixed += c.len; if (an.placed[c.id]) out[t].placed += c.len; });
    if (c.tp.length) {
      var pi = poolIdx(c);
      if (pi >= 0 && an.placed[c.id]) { out[pi].pool += c.len; out[pi].placed += c.len; }
      else c.tp.forEach(function (t) { out[t].poolOpen += c.len; });
    }
  });
  out.forEach(function (o) { o.total = o.fixed + o.team + o.pool; });
  return out;
}
function slotsFree(unav) { var m = model(); return m.nD * m.nP - (unav || []).filter(function (k) { var a = k.split(':'); return +a[0] < m.nD && +a[1] < m.nP; }).length; }
function bar(v, max) { var pct = max ? Math.min(100, v / max * 100) : 0; return '<span class="bar' + (v > max ? ' over' : '') + '"><i style="width:' + pct + '%"></i></span>'; }
function actions(kind, id, delLabel) {
  return '<td class="actions"><button class="icon-btn" data-act="edit" data-kind="' + kind + '" data-id="' + esc(id) + '" aria-label="Bearbeiten" title="Bearbeiten">' + I.edit + '</button>' +
    '<button class="icon-btn" data-act="del" data-kind="' + kind + '" data-id="' + esc(id) + '" data-confirm="' + esc(delLabel || 'Wirklich löschen?') + '" aria-label="Löschen" title="Löschen">' + I.trash + '</button></td>';
}
function listHead(title, kind, addLabel, sub) { return '<div class="list-head"><h2>' + title + '</h2>' + (sub ? '<span class="muted">' + sub + '</span>' : '') + '<span style="flex:1"></span><button class="btn primary" data-act="add" data-kind="' + kind + '">' + I.plus + addLabel + '</button></div>'; }
function availSummary(x) { var a = []; if (x.unav && x.unav.length) a.push(x.unav.length + ' gesperrt'); if (x.pref && x.pref.length) a.push(x.pref.length + ' unerwünscht'); return a.join(', ') || '–'; }

function renderTeachers() {
  var hrs = teacherHours(), m = model(), R = m.rules;
  var h = listHead('Lehrkräfte', 'teacher', 'Neue Lehrkraft', 'Lehrverpflichtung, Sperrzeiten und persönliche Regeln');
  if (!state.teachers.length) return h + '<div class="panel empty"><h3>Noch keine Lehrkräfte</h3><p>Legen Sie Kürzel und Namen an. Sperrzeiten, Zeitwünsche und Regeln wie „höchstens 4 Arbeitstage“ tragen Sie pro Person ein.</p></div>';
  h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kürzel</th><th>Name</th><th>Soll</th><th>Ist</th><th>davon Teamteaching</th><th>Verplant</th><th>Zeiten</th><th>Eigene Regeln</th><th></th></tr></thead><tbody>';
  state.teachers.forEach(function (t, i) {
    var o = hrs[i], n = state.lessons.filter(function (l) { return lessonParts(l).some(function (p) { return p.teachers.indexOf(t.id) >= 0; }) || l.coTeachers.indexOf(t.id) >= 0 || l.pool.indexOf(t.id) >= 0; }).length;
    var diff = t.target ? o.total - t.target : null;
    var own = [];
    if (t.maxPerDay != null && t.maxPerDay !== '') own.push('max. ' + t.maxPerDay + '/Tag');
    if (t.maxConsec != null && t.maxConsec !== '') own.push('max. ' + t.maxConsec + ' am Stück');
    if (t.maxGapsDay != null && t.maxGapsDay !== '') own.push('max. ' + t.maxGapsDay + ' Hohlst.');
    if (t.maxDays) own.push(t.maxDays + ' Tage');
    h += '<tr><td><span class="tag">' + esc(t.short) + '</span></td><td>' + esc(t.name) + '</td><td class="num">' + (t.target || '–') + '</td>' +
      '<td class="num">' + o.total + (o.poolOpen ? ' <span class="muted">(+' + o.poolOpen + ' Pool)</span>' : '') + (diff ? ' <span class="chip ' + (diff > 0 ? 'warn' : 'bad') + '">' + (diff > 0 ? '+' : '') + diff + '</span>' : '') + '</td>' +
      '<td class="num">' + (o.team || '–') + '</td><td class="num">' + bar(o.placed, o.total) + o.placed + '/' + o.total + '</td><td class="muted num">' + availSummary(t) + '</td><td class="muted">' + esc(own.join(', ') || 'Standard') + '</td>' +
      actions('teacher', t.id, n ? 'Löschen? Aus ' + n + ' Einheiten entfernt' : 'Wirklich löschen?') + '</tr>';
  });
  return h + '</tbody></table></div>';
}
function renderClasses() {
  var m = model(), an = analysis();
  var h = listHead('Klassen', 'class', 'Neue Klasse', 'Stammraum, Teilungen in Gruppen und Zeiten');
  if (!state.classes.length) return h + '<div class="panel empty"><h3>Noch keine Klassen</h3><p>Jede Klasse kann einen Stammraum und Teilungen haben, z. B. Religion (RK/EV) oder Werkgruppen (G1/G2).</p></div>';
  h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Klasse</th><th>Stammraum</th><th>Teilungen</th><th>Wochenstunden</th><th>Verplant</th><th>Mögliche Stunden</th><th></th></tr></thead><tbody>';
  state.classes.forEach(function (c, i) {
    var w = m.weekly[i], free = slotsFree(c.unav);
    var placedH = 0; m.cards.forEach(function (k) { if (an.placed[k.id] && k.classes.indexOf(i) >= 0) placedH += k.len; });
    var allH = 0; m.cards.forEach(function (k) { if (k.classes.indexOf(i) >= 0) allH += k.len; });
    var n = state.lessons.filter(function (l) { return lessonParts(l).every(function (p) { return p.classes.every(function (r) { return r.split(':')[0] === c.id; }); }) && lessonParts(l).some(function (p) { return p.classes.length; }); }).length;
    h += '<tr><td><b>' + esc(c.name) + '</b></td><td>' + esc(c.homeRoom ? roomShort(c.homeRoom) : '–') + '</td><td>' + (c.divisions.map(function (d) { return '<span class="tag">' + esc(d.name) + ': ' + esc(d.groups.map(function (g) { return g.name; }).join('/')) + '</span>'; }).join('') || '–') + '</td>' +
      '<td class="num">' + w + (w > free ? ' <span class="chip bad">zu viele</span>' : '') + '</td><td class="num">' + bar(placedH, allH) + placedH + '/' + allH + '</td><td class="num muted">' + free + '</td>' +
      actions('class', c.id, n ? 'Löschen? ' + n + ' Einheiten fallen weg' : 'Wirklich löschen?') + '</tr>';
  });
  return h + '</tbody></table></div>';
}
function renderRooms() {
  var h = listHead('Räume', 'room', 'Neuer Raum');
  if (!state.rooms.length) return h + '<div class="panel empty"><h3>Noch keine Räume</h3><p>Legen Sie Klassenräume und Fachräume wie Turnsaal oder Werkraum an.</p></div>';
  h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kürzel</th><th>Name</th><th>Stammraum von</th><th>Fachraum für</th><th>Sperrzeiten</th><th></th></tr></thead><tbody>';
  state.rooms.forEach(function (r) {
    var home = state.classes.filter(function (c) { return c.homeRoom === r.id; }).map(function (c) { return c.name; });
    var subj = {}; state.lessons.forEach(function (l) { lessonParts(l).forEach(function (p) { if (p.rooms.indexOf(r.id) >= 0) { var s = byId(state.subjects, p.subject); if (s) subj[s.short] = s; } }); });
    h += '<tr><td><span class="tag">' + esc(r.short) + '</span></td><td>' + esc(r.name) + '</td><td>' + esc(home.join(', ') || '–') + '</td><td>' + (Object.keys(subj).map(function (k) { return '<span class="tag subj-tag" style="--h:' + subj[k].hue + '">' + esc(k) + '</span>'; }).join('') || '–') + '</td><td class="num muted">' + (r.unav.length ? plural(r.unav.length, 'Stunde', 'Stunden') : '–') + '</td>' + actions('room', r.id) + '</tr>';
  });
  return h + '</tbody></table></div>';
}
function renderSubjects() {
  var h = listHead('Fächer', 'subject', 'Neues Fach', 'Farbe und erlaubte Zeiten');
  if (!state.subjects.length) return h + '<div class="panel empty"><h3>Noch keine Fächer</h3><p>Jedes Fach bekommt ein Kürzel und eine Farbe. Optional legen Sie fest, wann es (nicht) stattfinden soll, z. B. Hauptfächer am Vormittag.</p></div>';
  h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kürzel</th><th>Name</th><th>Einheiten</th><th>Wochenstunden gesamt</th><th>Zeiten</th><th></th></tr></thead><tbody>';
  state.subjects.forEach(function (s) {
    var ls = state.lessons.filter(function (l) { return lessonParts(l).some(function (p) { return p.subject === s.id; }); }), hrs = ls.reduce(function (a, l) { return a + l.perWeek; }, 0);
    h += '<tr><td><span class="tag subj-tag" style="--h:' + s.hue + '">' + esc(s.short) + '</span></td><td>' + esc(s.name) + '</td><td class="num">' + ls.length + '</td><td class="num">' + hrs + '</td><td class="muted num">' + availSummary(s) + '</td>' + actions('subject', s.id, ls.length ? 'Löschen? ' + ls.length + ' Einheiten fallen weg' : 'Wirklich löschen?') + '</tr>';
  });
  return h + '</tbody></table></div>';
}

function lessonMatchesClass(l, cid) { return lessonParts(l).some(function (p) { return p.classes.some(function (r) { return r.split(':')[0] === cid; }); }); }
function renderLessons() {
  var m = model(), an = analysis();
  var h = '<div class="list-head"><h2>Unterricht</h2><span class="muted">Lehrfächerverteilung: wer unterrichtet was, in welcher Klasse oder Gruppe</span><span style="flex:1"></span><button class="btn primary" data-act="add" data-kind="lesson">' + I.plus + 'Neuer Unterricht</button></div>';
  if (!state.subjects.length || !state.classes.length) return h + '<div class="panel empty"><h3>Zuerst Fächer und Klassen anlegen</h3><p>Danach können Sie hier den Unterricht eintragen.</p></div>';
  h += '<div class="class-sum"><button data-act="lfilter" data-id="" aria-pressed="' + (!ui.lessonFilter) + '"><b>Alle</b><span class="num">' + state.lessons.length + ' Einheiten</span></button>';
  state.classes.forEach(function (c, i) {
    var w = m.weekly[i], free = slotsFree(c.unav);
    h += '<button data-act="lfilter" data-id="' + esc(c.id) + '" aria-pressed="' + (ui.lessonFilter === c.id) + '"><b>' + esc(c.name) + '</b><span class="num"' + (w > free ? ' style="color:var(--bad)"' : '') + '>' + w + ' von ' + free + ' Std.</span></button>';
  });
  h += '</div>';
  var list = state.lessons.filter(function (l) { return !ui.lessonFilter || lessonMatchesClass(l, ui.lessonFilter); });
  if (!list.length) return h + '<div class="panel empty"><p>Für diese Auswahl ist noch kein Unterricht eingetragen.</p></div>';
  var tags = function (arr, coll, f) { return arr.map(function (id) { var x = byId(coll, id); return x ? '<span class="tag">' + esc(x[f]) + '</span>' : ''; }).join(''); };
  h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Klasse / Gruppe</th><th>Fach</th><th>Lehrkraft</th><th>Std.</th><th>DS</th><th>Raum</th><th>Verplant</th><th></th></tr></thead><tbody>';
  list.forEach(function (l) {
    var parts = lessonParts(l);
    var cs = m.cards.filter(function (c) { return c.lessonId === l.id; }), pc = cs.filter(function (c) { return an.placed[c.id]; }).reduce(function (a, c) { return a + c.len; }, 0);
    parts.forEach(function (p, pi) {
      var s = byId(state.subjects, p.subject) || { short: '?', name: '', hue: 0 };
      var teach = tags(p.teachers, state.teachers, 'short');
      if (pi === 0 && l.coTeachers.length) teach += ' <span class="tag tt" title="Teamteaching">+ ' + esc(l.coTeachers.map(function (id) { var t = byId(state.teachers, id); return t ? t.short : '?'; }).join(', ')) + (l.teamHours && l.teamHours < l.perWeek ? ' (' + l.teamHours + ' Std.)' : '') + '</span>';
      if (pi === 0 && l.pool.length) teach += ' <span class="tag pool" title="Pool: eine dieser Lehrkräfte wird eingeteilt">Pool ' + esc(l.pool.map(function (id) { var t = byId(state.teachers, id); return t ? t.short : '?'; }).join('/')) + '</span>';
      var roomTxt = p.rooms.length ? tags(p.rooms, state.rooms, 'short') : (p.classes.length === 1 && p.classes[0].indexOf(':') < 0 ? '<span class="muted">Stammraum</span>' : '<span class="muted">–</span>');
      h += '<tr class="' + (pi > 0 ? 'sub-row' : parts.length > 1 ? 'has-sub' : '') + '"><td>' + (pi > 0 ? '<span class="muted" title="gekoppelt, zur selben Zeit">↳ </span>' : '') + (p.classes.map(function (r) { return '<span class="tag">' + esc(refLabel(state, r)) + '</span>'; }).join('') || '<span class="muted">–</span>') + '</td>' +
        '<td><span class="tag subj-tag" style="--h:' + s.hue + '">' + esc(s.short) + '</span> ' + esc(s.name) + '</td><td>' + (teach || '<span class="muted">–</span>') + '</td>' +
        (pi === 0 ? '<td class="num">' + l.perWeek + '</td><td class="num">' + (l.doubles || '–') + '</td>' : '<td></td><td></td>') + '<td>' + roomTxt + '</td>' +
        (pi === 0 ? '<td class="num">' + (pc < l.perWeek ? '<span class="chip warn">' + pc + '/' + l.perWeek + '</span>' : '<span class="chip good">' + pc + '/' + l.perWeek + '</span>') + '</td>' + actions('lesson', l.id) : '<td></td><td></td>') + '</tr>';
    });
  });
  return h + '</tbody></table></div><p class="hint">DS = Doppelstunden. Eingerückte Zeilen sind gekoppelte Teile: sie finden zur selben Zeit statt (z. B. Religion RK und EV parallel).</p>';
}

/* ================= Editoren ================= */
function pickHtml(name, items, selected, labelFn, type) {
  return '<div class="pick">' + items.map(function (x) { return '<label><input type="' + (type || 'checkbox') + '" name="' + name + '" value="' + esc(x.id) + '"' + (selected.indexOf(x.id) >= 0 ? ' checked' : '') + '>' + esc(labelFn(x)) + '</label>'; }).join('') + '</div>';
}
function groupPickHtml(name, selected) {
  return '<div class="pick-groups">' + state.classes.map(function (c) {
    var items = [{ id: c.id, label: c.name + ' (ganze Klasse)' }];
    c.divisions.forEach(function (d) { d.groups.forEach(function (g) { items.push({ id: c.id + ':' + g.id, label: c.name + ' ' + g.name }); }); });
    return '<div class="pick">' + items.map(function (x) { return '<label><input type="checkbox" name="' + name + '" value="' + esc(x.id) + '"' + (selected.indexOf(x.id) >= 0 ? ' checked' : '') + '>' + esc(x.label) + '</label>'; }).join('') + '</div>';
  }).join('') + '</div>';
}
function readPick(dlg, name) { return $$('input[name="' + name + '"]:checked', dlg).map(function (x) { return x.value; }); }
var HUES = [4, 30, 50, 70, 95, 135, 175, 195, 215, 235, 255, 275, 300, 330, 350];
function optNum(v) { v = String(v == null ? '' : v).trim(); return v === '' ? null : Math.max(0, Math.round(+v || 0)); }
function numField(id, label, value, hint, placeholder) {
  return '<label class="field">' + label + '<input type="number" min="0" max="20" id="' + id + '" value="' + (value == null ? '' : esc(value)) + '" placeholder="' + esc(placeholder == null ? '' : placeholder) + '">' + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</label>';
}
function section(title, body, hint) { return '<fieldset class="fs"><legend>' + title + '</legend>' + (hint ? '<p class="hint" style="margin:0">' + hint + '</p>' : '') + body + '</fieldset>'; }

function partHtml(i, p) {
  return '<div class="part" data-part="' + i + '"><div class="part-head"><b>Gekoppelter Teil</b><button type="button" class="btn sm ghost danger" data-act="part-del">' + I.trash + 'Entfernen</button></div>' +
    '<label class="field">Fach<select data-f="subject">' + state.subjects.map(function (s) { return '<option value="' + esc(s.id) + '"' + (p.subject === s.id ? ' selected' : '') + '>' + esc(s.short + ' · ' + s.name) + '</option>'; }).join('') + '</select></label>' +
    '<div class="field"><b class="hint">Klasse / Gruppe</b>' + groupPickHtml('pc' + i, p.classes || []) + '</div>' +
    '<div class="field"><b class="hint">Lehrkraft</b>' + pickHtml('pt' + i, state.teachers, p.teachers || [], function (t) { return t.short; }) + '</div>' +
    '<div class="field"><b class="hint">Raum</b>' + pickHtml('pr' + i, state.rooms, p.rooms || [], function (r) { return r.short; }) + '</div></div>';
}

function editEntity(kind, id) {
  var coll = { teacher: state.teachers, class: state.classes, room: state.rooms, subject: state.subjects, lesson: state.lessons }[kind];
  var item = id ? byId(coll, id) : null, isNew = !item;
  var body = '', title = '', R = model().rules;
  if (kind === 'teacher') {
    item = item || { id: uid('t'), short: '', name: '', unav: [], pref: [] }; title = isNew ? 'Neue Lehrkraft' : 'Lehrkraft bearbeiten';
    body = '<div class="form-row"><label class="field">Kürzel<input type="text" id="f-short" maxlength="6" required value="' + esc(item.short) + '"></label><label class="field">Name<input type="text" id="f-name" required value="' + esc(item.name) + '"></label>' +
      numField('f-target', 'Soll-Stunden', item.target, 'Lehrverpflichtung pro Woche') + '</div>' +
      section('Persönliche Regeln', '<div class="form-row">' + numField('f-maxday', 'Höchstens Std./Tag', item.maxPerDay, null, R.tMaxPerDay) + numField('f-consec', 'Höchstens am Stück', item.maxConsec, null, R.tMaxConsec) + numField('f-gaps', 'Höchstens Hohlstunden/Tag', item.maxGapsDay, null, R.tMaxGapsDay) + numField('f-days', 'Höchstens Arbeitstage', item.maxDays, '0 = keine Grenze', R.tMaxDays || '') + '</div>', 'Leer lassen für die Standardwerte unter „Bedingungen“. Wie streng sie gelten, stellen Sie dort ein.') +
      section('Zeiten', avHtml(item.unav, item.pref, true), 'Gesperrt: Lehrkraft ist nicht da. Unerwünscht: möglichst frei halten, z. B. ein gewünschter freier Tag.');
  } else if (kind === 'class') {
    item = item || { id: uid('c'), name: '', homeRoom: null, unav: [], pref: [], divisions: [] }; title = isNew ? 'Neue Klasse' : 'Klasse bearbeiten';
    body = '<div class="form-row"><label class="field">Name<input type="text" id="f-name" required maxlength="12" value="' + esc(item.name) + '"></label><label class="field">Stammraum<select id="f-home"><option value="">– keiner –</option>' + state.rooms.map(function (r) { return '<option value="' + esc(r.id) + '"' + (item.homeRoom === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</select></label></div>' +
      section('Teilungen', '<div id="divs">' + item.divisions.map(function (d) { return divRow(d); }).join('') + '</div><button type="button" class="btn sm" data-act="div-add" style="justify-self:start">' + I.plus + 'Teilung hinzufügen</button>',
        'Eine Teilung zerlegt die Klasse in Gruppen, die gleichzeitig verschiedenen Unterricht haben können. Beispiele: Religion (RK, EV, oB), Werkgruppen (G1, G2), Sprachen (F, I).') +
      section('Regeln', '<div class="form-row">' + numField('f-maxday', 'Höchstens Std./Tag', item.maxPerDay, null, R.cMaxPerDay) + numField('f-minday', 'Mindestens Std./Tag', item.minPerDay, null, R.cMinPerDay) + '</div>', 'Leer lassen für die Standardwerte unter „Bedingungen“.') +
      section('Zeiten', avHtml(item.unav, item.pref, true, { off: 'Kein Unterricht', pref: 'Unerwünscht' }));
  } else if (kind === 'room') {
    item = item || { id: uid('r'), short: '', name: '', unav: [] }; title = isNew ? 'Neuer Raum' : 'Raum bearbeiten';
    body = '<div class="form-row"><label class="field">Kürzel<input type="text" id="f-short" required maxlength="8" value="' + esc(item.short) + '"></label><label class="field">Name<input type="text" id="f-name" required value="' + esc(item.name) + '"></label></div>' + section('Sperrzeiten', avHtml(item.unav, [], false));
  } else if (kind === 'subject') {
    item = item || { id: uid('s'), short: '', name: '', hue: HUES[state.subjects.length % HUES.length], unav: [], pref: [] }; title = isNew ? 'Neues Fach' : 'Fach bearbeiten';
    body = '<div class="form-row"><label class="field">Kürzel<input type="text" id="f-short" required maxlength="6" value="' + esc(item.short) + '"></label><label class="field">Name<input type="text" id="f-name" required value="' + esc(item.name) + '"></label></div>' +
      '<div class="field"><b class="hint">Farbe im Plan</b><div class="hues" id="f-hues">' + HUES.map(function (hh) { return '<button type="button" data-hue="' + hh + '" style="--h:' + hh + '" aria-pressed="' + (item.hue === hh) + '" aria-label="Farbe ' + hh + '"></button>'; }).join('') + '</div></div>' +
      section('Wann darf das Fach stattfinden?', '<div class="btn-row"><button type="button" class="btn sm" data-act="av-preset" data-preset="morning">Nachmittag unerwünscht</button><button type="button" class="btn sm" data-act="av-preset" data-preset="nofirst">1. Stunde unerwünscht</button><button type="button" class="btn sm" data-act="av-preset" data-preset="clear">Alles frei</button></div>' + avHtml(item.unav, item.pref, true),
        'Gilt in allen Klassen. Beispiele: Hauptfächer bevorzugt vormittags, Sport nicht in der 1. Stunde.');
  } else if (kind === 'lesson') {
    if (!state.subjects.length) { toast('Bitte zuerst ein Fach anlegen'); return; }
    item = item || { id: uid('l'), subject: state.subjects[0].id, teachers: [], classes: ui.lessonFilter ? [ui.lessonFilter] : [], rooms: [], perWeek: 2, doubles: 0, maxPerDay: 0, coTeachers: [], teamHours: 0, pool: [], parts: [] };
    title = isNew ? 'Neuer Unterricht' : 'Unterricht bearbeiten';
    body = '<label class="field">Fach<select id="f-subj">' + state.subjects.map(function (s) { return '<option value="' + esc(s.id) + '"' + (item.subject === s.id ? ' selected' : '') + '>' + esc(s.short + ' · ' + s.name) + '</option>'; }).join('') + '</select></label>' +
      '<div class="field"><b class="hint">Klasse / Gruppe</b>' + groupPickHtml('f-cls', item.classes) + '<span class="hint">Mehrere Klassen oder Gruppen bedeutet: gemeinsamer Unterricht, z. B. Religion RK aus 1a und 1b.</span></div>' +
      '<div class="field"><b class="hint">Lehrkraft</b>' + pickHtml('f-tea', state.teachers, item.teachers, function (t) { return t.short + ' · ' + t.name; }) + '</div>' +
      '<div class="form-row"><label class="field">Stunden pro Woche<input type="number" id="f-per" min="1" max="30" required value="' + item.perWeek + '"></label><label class="field">davon Doppelstunden<input type="number" id="f-dbl" min="0" max="15" value="' + (item.doubles || 0) + '"><span class="hint">Anzahl der Blöcke à 2 Stunden</span></label>' +
      '<label class="field">Höchstens pro Tag<select id="f-max"><option value="0">automatisch</option>' + [1, 2, 3, 4].map(function (n) { return '<option value="' + n + '"' + (item.maxPerDay === n ? ' selected' : '') + '>' + plural(n, 'Block', 'Blöcke') + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="field"><b class="hint">Raum</b>' + pickHtml('f-rooms', state.rooms, item.rooms, function (r) { return r.short + (r.name && r.name !== r.short ? ' · ' + r.name : ''); }) + '<span class="hint">Nichts gewählt: Stammraum der Klasse. Mehrere gewählt: einer davon, der frei ist.</span></div>' +
      section('Teamteaching', '<div class="field"><b class="hint">Zweitlehrkraft</b>' + pickHtml('f-co', state.teachers, item.coTeachers, function (t) { return t.short; }) + '</div>' +
        '<label class="field" style="max-width:260px">In wie vielen Stunden?<input type="number" id="f-teamh" min="0" max="30" value="' + (item.teamHours || '') + '" placeholder="alle"><span class="hint">Leer = in allen Stunden</span></label>',
        'Zwei Lehrkräfte unterrichten gemeinsam in derselben Klasse, z. B. Deutsch mit Zweitlehrkraft in 2 von 4 Stunden. Beide müssen dann frei sein.') +
      section('Lehrkraft aus Pool', pickHtml('f-pool', state.teachers, item.pool, function (t) { return t.short; }),
        'Pro Stunde wird automatisch eine freie Lehrkraft aus dieser Auswahl eingeteilt, z. B. Sport-Team, Förder- oder Springerlehrkräfte.') +
      section('Kopplung (gleichzeitig)', '<div id="parts">' + (item.parts || []).map(function (p, i) { return partHtml(i, p); }).join('') + '</div><button type="button" class="btn sm" data-act="part-add" style="justify-self:start">' + I.plus + 'Gekoppelten Teil hinzufügen</button>',
        'Gekoppelte Teile finden immer zur selben Zeit statt, mit eigener Gruppe, Lehrkraft und eigenem Raum. Beispiele: Religion RK und EV parallel, Werkgruppen G1 und G2 parallel, Sprachen in Niveaugruppen.');
  }
  var hueSel = item.hue;
  openDialog({
    title: title, body: body, wide: kind !== 'room',
    foot: '<button type="button" class="btn" data-act="dlg-close">Abbrechen</button><button type="submit" class="btn primary">Speichern</button>',
    onMount: function (dlg) {
      mountAv(dlg);
      var hs = $('#f-hues', dlg);
      if (hs) hs.addEventListener('click', function (e) { var b = e.target.closest('[data-hue]'); if (!b) return; hueSel = +b.dataset.hue; $$('[data-hue]', hs).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });
      var partN = (item.parts || []).length;
      dlg.onclick = function (e) {
        var a = e.target.closest('[data-act]'); if (!a) return;
        if (a.dataset.act === 'part-add') { $('#parts', dlg).insertAdjacentHTML('beforeend', partHtml(partN++, { subject: state.subjects[0].id })); }
        if (a.dataset.act === 'part-del') a.closest('.part').remove();
        if (a.dataset.act === 'div-add') $('#divs', dlg).insertAdjacentHTML('beforeend', divRow({ id: uid('d'), name: '', groups: [] }));
        if (a.dataset.act === 'div-del') a.closest('.div-row').remove();
        if (a.dataset.act === 'av-preset') {
          var nP = model().nP, lf = model().problem.weights.lateFrom;
          $$('#av button[data-k]', dlg).forEach(function (b) {
            var p = +b.dataset.k.split(':')[1];
            if (a.dataset.preset === 'clear') b.classList.remove('off', 'pref');
            if (a.dataset.preset === 'morning' && p >= lf && !b.classList.contains('off')) b.classList.add('pref');
            if (a.dataset.preset === 'nofirst' && p === 0 && !b.classList.contains('off')) b.classList.add('pref');
          });
        }
      };
    },
    onSave: function (dlg) {
      var v = function (sel) { var el = $(sel, dlg); return el ? el.value.trim() : ''; };
      var av = $('#av', dlg) ? avRead(dlg) : null;
      if (kind === 'teacher') {
        item.short = v('#f-short'); item.name = v('#f-name'); item.unav = av.unav; item.pref = av.pref; item.target = optNum(v('#f-target'));
        item.maxPerDay = optNum(v('#f-maxday')); item.maxConsec = optNum(v('#f-consec')); item.maxGapsDay = optNum(v('#f-gaps')); item.maxDays = optNum(v('#f-days'));
      }
      if (kind === 'class') {
        item.name = v('#f-name'); item.homeRoom = v('#f-home') || null; item.unav = av.unav; item.pref = av.pref;
        item.maxPerDay = optNum(v('#f-maxday')); item.minPerDay = optNum(v('#f-minday'));
        var old = item.divisions || [];
        item.divisions = $$('.div-row', dlg).map(function (row) {
          var did = row.dataset.id, prev = byId(old, did) || { groups: [] }, name = $('[data-f=name]', row).value.trim();
          var groups = $('[data-f=groups]', row).value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
          return { id: did, name: name || 'Teilung', groups: uniq(groups).map(function (gn) { var g = prev.groups.find(function (x) { return x.name === gn; }); return g || { id: uid('g'), name: gn }; }) };
        }).filter(function (d) { return d.groups.length >= 2; });
        var atoms = classAtoms(item).length;
        if (atoms > 64) { toast('Zu viele Gruppenkombinationen. Bitte weniger Teilungen anlegen.'); return false; }
      }
      if (kind === 'room') { item.short = v('#f-short'); item.name = v('#f-name'); item.unav = av.unav; }
      if (kind === 'subject') { item.short = v('#f-short'); item.name = v('#f-name'); item.hue = hueSel; item.unav = av.unav; item.pref = av.pref; }
      if (kind === 'lesson') {
        item.subject = v('#f-subj'); item.classes = readPick(dlg, 'f-cls'); item.teachers = readPick(dlg, 'f-tea'); item.rooms = readPick(dlg, 'f-rooms');
        item.perWeek = Math.max(1, Math.min(30, +v('#f-per') || 1)); item.doubles = Math.max(0, Math.min(Math.floor(item.perWeek / 2), +v('#f-dbl') || 0)); item.maxPerDay = +v('#f-max') || 0;
        item.coTeachers = readPick(dlg, 'f-co').filter(function (t) { return item.teachers.indexOf(t) < 0; }); item.teamHours = Math.min(item.perWeek, optNum(v('#f-teamh')) || 0);
        item.pool = readPick(dlg, 'f-pool').filter(function (t) { return item.teachers.indexOf(t) < 0; });
        item.parts = $$('.part', dlg).map(function (el) {
          var i = el.dataset.part;
          return { subject: $('[data-f=subject]', el).value, classes: readPick(el, 'pc' + i), teachers: readPick(el, 'pt' + i), rooms: readPick(el, 'pr' + i) };
        });
        if (!item.classes.length && !item.teachers.length && !item.pool.length) { toast('Bitte mindestens eine Klasse oder Lehrkraft wählen'); return false; }
      }
      if (isNew) coll.push(item);
      changed([{ teacher: 'teachers', class: 'classes', room: 'rooms', subject: 'subjects', lesson: 'lessons' }[kind]]);
      toast(isNew ? 'Angelegt' : 'Gespeichert');
    }
  });
}
function divRow(d) {
  return '<div class="div-row" data-id="' + esc(d.id) + '"><label class="field">Name<input type="text" data-f="name" value="' + esc(d.name) + '" placeholder="z. B. Religion"></label>' +
    '<label class="field">Gruppen, mit Komma getrennt<input type="text" data-f="groups" value="' + esc(d.groups.map(function (g) { return g.name; }).join(', ')) + '" placeholder="z. B. RK, EV, oB"></label>' +
    '<button type="button" class="icon-btn" data-act="div-del" aria-label="Teilung entfernen">' + I.trash + '</button></div>';
}

function deleteEntity(kind, id) {
  var strip = function (arr, x) { return arr.filter(function (y) { return y !== x; }); };
  if (kind === 'teacher') {
    state.teachers = state.teachers.filter(function (x) { return x.id !== id; });
    state.lessons.forEach(function (l) { l.teachers = strip(l.teachers, id); l.coTeachers = strip(l.coTeachers, id); l.pool = strip(l.pool, id); l.parts.forEach(function (p) { p.teachers = strip(p.teachers, id); }); });
    changed(['teachers', 'lessons']);
  }
  if (kind === 'class') {
    state.classes = state.classes.filter(function (x) { return x.id !== id; });
    var keep = function (r) { return r.split(':')[0] !== id; };
    var hadClasses = function (l) { return lessonParts(l).some(function (p) { return p.classes.length; }); };
    state.lessons = state.lessons.filter(function (l) {
      var had = hadClasses(l);
      l.classes = l.classes.filter(keep); l.parts.forEach(function (p) { p.classes = p.classes.filter(keep); });
      return !had || hadClasses(l);
    });
    if (ui.lessonFilter === id) ui.lessonFilter = null;
    changed(['classes', 'lessons']);
  }
  if (kind === 'room') {
    state.rooms = state.rooms.filter(function (x) { return x.id !== id; });
    state.lessons.forEach(function (l) { l.rooms = strip(l.rooms, id); l.parts.forEach(function (p) { p.rooms = strip(p.rooms, id); }); });
    state.classes.forEach(function (c) { if (c.homeRoom === id) c.homeRoom = null; });
    changed(['rooms', 'lessons', 'classes']);
  }
  if (kind === 'subject') { state.subjects = state.subjects.filter(function (x) { return x.id !== id; }); state.lessons = state.lessons.filter(function (l) { return l.subject !== id; }); state.lessons.forEach(function (l) { l.parts = l.parts.filter(function (p) { return p.subject !== id; }); }); changed(['subjects', 'lessons']); }
  if (kind === 'lesson') { state.lessons = state.lessons.filter(function (x) { return x.id !== id; }); state.relations.forEach(function (r) { r.lessons = strip(r.lessons || [], id); }); changed(['lessons', 'relations']); }
  if (kind === 'relation') { state.relations = state.relations.filter(function (x) { return x.id !== id; }); changed(['relations']); }
  if (kind === 'absence') { state.absences = state.absences.filter(function (x) { return x.id !== id; }); changed(['absences']); }
  toast('Gelöscht');
}
