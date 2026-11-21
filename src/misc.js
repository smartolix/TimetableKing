/* ================= Einstellungen ================= */
function renderSettings() {
  var st = state.settings;
  var h = '<div class="list-head"><h2>Einstellungen</h2></div><div class="settings-grid">';
  h += '<section class="panel"><div class="panel-head"><h3>Schule</h3></div><div class="panel-body stack">' +
    '<div class="form-row"><label class="field">Name der Schule<input type="text" id="s-school" value="' + esc(st.school) + '"></label><label class="field">Schuljahr<input type="text" id="s-year" value="' + esc(st.year || '') + '"></label></div>' +
    '<label class="field">Unterrichtstage<select id="s-days"><option value="5"' + (st.days === 5 ? ' selected' : '') + '>Montag bis Freitag</option><option value="6"' + (st.days === 6 ? ' selected' : '') + '>Montag bis Samstag</option></select></label></div></section>';
  h += '<section class="panel"><div class="panel-head"><h3>Zeitraster</h3><div class="btn-row"><button class="btn sm" data-act="per-add">' + I.plus + 'Stunde</button><button class="btn sm" data-act="per-del"' + (st.periods.length <= 1 ? ' disabled' : '') + ' data-confirm="Letzte Stunde entfernen?">Letzte entfernen</button></div></div><div class="panel-body">' +
    '<table class="tbl periods-tbl"><thead><tr><th>Stunde</th><th>Beginn</th><th>Ende</th><th title="Keine Doppelstunde über die Pause danach">Große Pause danach</th></tr></thead><tbody>' +
    st.periods.map(function (p, i) { return '<tr><td><input type="text" data-per="' + i + '" data-f="label" value="' + esc(p.label) + '" aria-label="Bezeichnung"></td><td><input type="time" data-per="' + i + '" data-f="start" value="' + esc(p.start) + '" aria-label="Beginn"></td><td><input type="time" data-per="' + i + '" data-f="end" value="' + esc(p.end) + '" aria-label="Ende"></td><td style="text-align:center"><input type="checkbox" data-per="' + i + '" data-f="noDouble"' + (p.noDouble ? ' checked' : '') + (i === st.periods.length - 1 ? ' disabled' : '') + ' aria-label="Große Pause nach dieser Stunde"></td></tr>'; }).join('') +
    '</tbody></table><p class="hint">„Große Pause danach“: Doppelstunden dürfen nicht über diese Pause gehen, z. B. über die Mittagspause.</p></div></section>';
  h += '<section class="panel"><div class="panel-head"><h3>Daten</h3></div><div class="panel-body stack">' +
    '<p class="hint" style="margin:0">' + (store.mode === 'cloud' ? 'Ihre Daten werden automatisch in Ihrem claude.ai-Konto gespeichert. Nur Sie sehen sie.' : 'Ihre Daten werden nur in diesem Browser gespeichert. Sichern Sie sie regelmäßig als Datei.') + '</p>' +
    '<div class="btn-row"><button class="btn" data-act="export-json">' + I.down + 'Sicherung herunterladen</button><button class="btn" data-act="import-json">' + I.up + 'Sicherung laden</button><input type="file" id="import-file" accept=".json,application/json" hidden></div>' +
    '<div class="btn-row"><button class="btn" data-act="export-print">' + I.down + 'Druckversion (HTML)</button><button class="btn" data-act="export-csv">' + I.down + 'Tabelle (CSV für Excel)</button></div>' +
    '<p class="hint" style="margin:0">Die Druckversion enthält alle Klassen-, Lehrkräfte- und Raumpläne. Öffnen Sie die Datei im Browser und drucken Sie sie dort oder speichern Sie sie als PDF.</p>' +
    '<div class="btn-row"><button class="btn danger" data-act="start-empty" data-confirm="Alles löschen und leer beginnen?">Leer beginnen</button><button class="btn" data-act="load-sample" data-confirm="Daten durch Beispiel ersetzen?">Beispielschule laden</button></div></div></section>';
  return h + '</div>';
}
function mountSettings() {
  var st = state.settings;
  var on = function (sel, ev, fn) { var el = $(sel); if (el) el.addEventListener(ev, fn); };
  on('#s-school', 'change', function (e) { st.school = e.target.value; changed(['settings']); });
  on('#s-year', 'change', function (e) { st.year = e.target.value; changed(['settings']); });
  on('#s-days', 'change', function (e) { st.days = +e.target.value; changed(['settings']); });
  $$('[data-per]').forEach(function (inp) {
    inp.addEventListener('change', function () { var p = st.periods[+inp.dataset.per]; p[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value; changed(['settings']); });
  });
  on('#import-file', 'change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var data = JSON.parse(rd.result);
        if (!data || !Array.isArray(data.lessons) || !data.settings) throw new Error('format');
        openDialog({ title: 'Sicherung laden', body: '<p>Die Datei „' + esc(f.name) + '“ enthält ' + plural((data.classes || []).length, 'Klasse', 'Klassen') + ', ' + plural((data.teachers || []).length, 'Lehrkraft', 'Lehrkräfte') + ' und ' + plural(data.lessons.length, 'Unterrichtseinheit', 'Unterrichtseinheiten') + '. Ihre aktuellen Daten werden dabei ersetzt.</p>',
          foot: '<button type="button" class="btn" data-act="dlg-close">Abbrechen</button><button type="submit" class="btn primary">Ersetzen und laden</button>',
          onSave: function () { state = normalize(data); undoStack = []; ui.selected = null; changed(SECTIONS.slice()); toast('Sicherung geladen'); } });
      } catch (err) { toast('Die Datei ist keine gültige Sicherung'); }
    };
    rd.readAsText(f);
  });
}

/* ================= Exporte ================= */
function exportJson() {
  var name = (state.settings.school || 'Stundenplan').replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim().replace(/\s+/g, '-') || 'Stundenplan';
  offerFile(name + '-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(state, null, 1));
}
function exportCsv() {
  var m = model(), an = analysis(), rows = [];
  m.cards.forEach(function (card) {
    if (!an.placed[card.id]) return;
    var pl = state.placements[card.id], pi = poolIdx(card);
    for (var j = 0; j < card.len; j++) {
      var per = state.settings.periods[pl.p + j] || {};
      card.parts.forEach(function (part) {
        var ts = part.teachers.map(tShort); if (part.main) { if (pi >= 0) ts.push(tShort(pi)); card.co.forEach(function (c) { ts.push(tShort(c)); }); }
        var room = partRoom(card, part);
        (part.refs.length ? part.refs : ['']).forEach(function (ref) {
          rows.push([ref ? refLabel(state, ref) : '', DAY_NAMES[pl.d], pl.p + j + 1, per.start || '', per.end || '', part.subject.short, part.subject.name, ts.join(' '), room ? roomShort(room) : '', card.team && part.main ? 'Teamteaching' : '', card.parts.length > 1 ? 'Kopplung' : '']);
        });
      });
    }
  });
  rows.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])) || DAY_NAMES.indexOf(a[1]) - DAY_NAMES.indexOf(b[1]) || a[2] - b[2]; });
  rows.unshift(['Klasse/Gruppe', 'Tag', 'Stunde', 'Beginn', 'Ende', 'Fach', 'Fachname', 'Lehrkraft', 'Raum', 'Teamteaching', 'Kopplung']);
  var csv = '﻿' + rows.map(function (r) { return r.map(function (v) { v = String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';'); }).join('\r\n');
  offerFile('Stundenplan.csv', csv);
}
function exportPrint() {
  var m = model(), an = analysis(), st = state.settings;
  function table(view, eid, keyPrefix, idx) {
    var h = '<table><thead><tr><th class="per"></th>';
    for (var d = 0; d < m.nD; d++) h += '<th>' + DAY_NAMES[d] + '</th>';
    h += '</tr></thead><tbody>';
    for (var p = 0; p < m.nP; p++) {
      h += '<tr' + (st.periods[p].noDouble ? ' class="brk"' : '') + '><th class="per">' + (p + 1) + '.<small>' + esc(st.periods[p].start || '') + '–' + esc(st.periods[p].end || '') + '</small></th>';
      for (d = 0; d < m.nD; d++) {
        var ids = an.occ[keyPrefix + idx + '_' + (d * m.nP + p)] || [];
        if (!ids.length) { h += '<td></td>'; continue; }
        h += '<td>' + ids.map(function (id) {
          var card = m.cards[m.cardIndex[id]], parts = relevantParts(card, view, eid);
          return '<div class="e" style="background:hsl(' + parts[0].subject.hue + ' 60% 92%)">' + parts.map(function (pt) {
            var ts = pt.teachers.map(tShort); if (pt.main) { var pi = poolIdx(card); if (pi >= 0) ts.push(tShort(pi)); card.co.forEach(function (c) { ts.push(tShort(c)); }); }
            var r = partRoom(card, pt);
            var sub = view === 'class' ? [pt.refs.some(function (x) { return x.indexOf(':') > 0; }) ? partGroups(pt) : '', ts.join(' '), r ? roomShort(r) : ''] : view === 'teacher' ? [partGroups(pt), r ? roomShort(r) : ''] : [partGroups(pt), ts.join(' ')];
            return '<b>' + esc(pt.subject.short) + '</b><span>' + esc(sub.filter(Boolean).join(' · ')) + '</span>';
          }).join('') + '</div>';
        }).join('') + '</td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }
  var head = function (t) { return '<header><h1>' + esc(t) + '</h1><p>' + esc(st.school) + ' · ' + esc(st.year || '') + '</p></header>'; };
  var pages = state.classes.map(function (c, i) { return '<section>' + head('Klasse ' + c.name) + table('class', c.id, 'c', i) + '</section>'; })
    .concat(state.teachers.map(function (t, i) { return '<section>' + head(t.name + ' (' + t.short + ')') + table('teacher', t.id, 't', i) + '</section>'; }))
    .concat(state.rooms.map(function (r, i) { return '<section>' + head(r.name) + table('room', r.id, 'r', i) + '</section>'; }));
  var doc = '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Stundenpläne ' + esc(st.school) + '</title><style>' +
    '@page{size:A4 landscape;margin:10mm}body{font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#15212c;margin:0}section{page-break-after:always;padding:8px}header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #15212c;margin-bottom:10px}h1{font-size:22px;margin:0 0 4px}header p{margin:0;color:#555}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #9aa7b3;padding:3px;vertical-align:middle;text-align:center;height:44px}thead th{background:#eef2f5;height:auto;padding:6px}th.per{width:66px;font-size:14px}th.per small{display:block;font-weight:400;font-size:10px;color:#555}tr.brk td,tr.brk th{border-bottom:3px solid #15212c}' +
    'td .e{display:flex;flex-direction:column;gap:1px;padding:3px;border-radius:4px;margin:1px}td b{font-size:14px}td span{font-size:10.5px;color:#333}' +
    '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>' + pages.join('') + '</body></html>';
  offerFile('Stundenplaene.html', doc);
}

/* ================= Ereignisse ================= */
function arm(btn) {
  if (btn.classList.contains('armed')) return true;
  btn.classList.add('armed', 'danger');
  btn.dataset.old = btn.innerHTML; btn.textContent = btn.dataset.confirm;
  setTimeout(function () { if (btn.isConnected && btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.innerHTML = btn.dataset.old; } }, 3500);
  return false;
}
document.addEventListener('click', function (e) {
  if (suppressClick) return;
  var tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { if ($('#dlg').open) closeDialog(); location.hash = tabBtn.dataset.tab; return; }
  var a = e.target.closest('[data-act]');
  var cardEl = e.target.closest('.card[data-card]');
  var cell = e.target.closest('.tt-cell');
  if (!a && cardEl && ui.tab === 'plan') {
    var cid = cardEl.dataset.card;
    if (ui.selected && ui.selected !== cid && cardEl.closest('#tt') && ui.targets) {
      var cur = state.placements[cid];
      if (cur) { var s0 = cur.d * model().nP + cur.p, t0 = ui.targets[s0]; if (t0 && t0.cls === 'swap' && t0.swap.other === cid) { applyTarget(ui.selected, s0, t0); return; } }
    }
    ui.selected = ui.selected === cid ? null : cid; render(); return;
  }
  if (!a && cell && ui.selected && ui.targets) {
    var s = +cell.dataset.s, t = ui.targets[s];
    if (t && applyTarget(ui.selected, s, t)) return;
    if (t && t.cls === 'no') toast((t.reasons || ['Nicht möglich']).join(' · '));
    return;
  }
  if (!a) return;
  if (a.closest('#dlg') && ['part-add', 'part-del', 'div-add', 'div-del', 'av-preset'].indexOf(a.dataset.act) >= 0) return;
  if (a.dataset.confirm && !arm(a)) return;
  var act = a.dataset.act;
  switch (act) {
    case 'view': ui.view = a.dataset.v; ui.selected = null; saveUi(); render(); break;
    case 'goto': ui.view = a.dataset.v; ui.entity[a.dataset.v] = a.dataset.id; ui.selected = null; saveUi(); render(); break;
    case 'ent-step': {
      var l = entityList(ui.view), i = l.findIndex(function (x) { return x.id === currentEntity(); });
      ui.entity[ui.view] = l[(i + (+a.dataset.dir) + l.length) % l.length].id; ui.selected = null; saveUi(); render(); break;
    }
    case 'deselect': ui.selected = null; render(); break;
    case 'lock': { var pl = state.placements[a.dataset.card]; if (pl) { pushUndo(pl.locked ? 'Fixierung gelöst' : 'Stunde fixiert'); pl.locked = !pl.locked; changed(['placements']); } break; }
    case 'unplace': unplaceCard(a.dataset.card); break;
    case 'undo': undo(); break;
    case 'toggle-hints': ui.showAllHints = !ui.showAllHints; render(); break;
    case 'gen-open': openGen(); break;
    case 'gen-start': startGen(); break;
    case 'gen-stop': finishGen(true); break;
    case 'goto-rules': closeDialog(); location.hash = 'bedingungen'; break;
    case 'dlg-close': closeDialog(); break;
    case 'copy-area': {
      var ta = $('#copy-area');
      try { navigator.clipboard.writeText(ta.value).then(function () { toast('Kopiert'); }, function () { ta.select(); toast('Text markiert, bitte mit Strg+C kopieren'); }); } catch (err) { ta.select(); }
      break;
    }
    case 'add': editEntity(a.dataset.kind, null); break;
    case 'edit': editEntity(a.dataset.kind, a.dataset.id); break;
    case 'del': deleteEntity(a.dataset.kind, a.dataset.id); break;
    case 'add-rel': editRelation(null); break;
    case 'edit-rel': editRelation(a.dataset.id); break;
    case 'lfilter': ui.lessonFilter = a.dataset.id || null; render(); break;
    case 'hide-banner': ui.bannerHidden = true; saveUi(); render(); break;
    case 'start-empty': state = emptyState(); undoStack = []; ui.selected = null; ui.bannerHidden = false; changed(SECTIONS.slice()); location.hash = 'faecher'; toast('Leere Schule angelegt'); break;
    case 'load-sample': state = sampleWithPlan(); undoStack = []; ui.selected = null; ui.bannerHidden = false; changed(SECTIONS.slice()); toast('Beispielschule geladen'); break;
    case 'per-add': { var ps = state.settings.periods, last = ps[ps.length - 1] || { end: '08:00' }; ps.push({ label: String(ps.length + 1), start: last.end, end: '', noDouble: false }); changed(['settings']); break; }
    case 'per-del': state.settings.periods.pop(); changed(['settings']); break;
    case 'w-reset': state.settings.weights = defaultWeights(); state.settings.rules = defaultRules(); changed(['settings']); toast('Standardwerte gesetzt'); break;
    case 'export-json': exportJson(); break;
    case 'import-json': $('#import-file').click(); break;
    case 'export-csv': exportCsv(); break;
    case 'export-print': exportPrint(); break;
    case 'sub-day': {
      var nd = addDays(subDate(), +a.dataset.dir), w = weekdayIdx(nd), dir = +a.dataset.dir;
      while (w >= model().nD) { nd = addDays(nd, dir); w = weekdayIdx(nd); }
      ui.subDate = nd; render(); break;
    }
    case 'sub-today': ui.subDate = null; render(); break;
    case 'sub-pick': state.subs[a.dataset.key] = { mode: 'sub', teacher: a.dataset.t }; changed(['subs']); break;
    case 'add-abs': if (!state.teachers.length) { toast('Bitte zuerst Lehrkräfte anlegen'); break; } editAbsence(null); break;
    case 'edit-abs': editAbsence(a.dataset.id); break;
    case 'export-subs': exportSubs(); break;
  }
});
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.id === 'ent-sel') { ui.entity[ui.view] = t.value; ui.selected = null; saveUi(); render(); }
  if (t.classList.contains('room-sel')) {
    var pl = state.placements[t.dataset.card]; if (!pl) return;
    pushUndo('Raum geändert'); pl.rooms[+t.dataset.req] = t.value || null; changed(['placements']);
  }
  if (t.classList.contains('pool-sel')) {
    var pl2 = state.placements[t.dataset.card]; if (!pl2) return;
    pushUndo('Lehrkraft geändert'); pl2.pool = t.value || null; changed(['placements']);
  }
});
document.addEventListener('keydown', function (e) {
  var typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && !$('#dlg').open) { e.preventDefault(); undo(); }
  if (e.key === 'Escape' && ui.selected && !$('#dlg').open) { ui.selected = null; render(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('card')) { e.preventDefault(); e.target.click(); }
});

/* ================= Navigation ================= */
function route() {
  var h = (location.hash || '').replace('#', '');
  ui.tab = TABS.some(function (t) { return t[0] === h; }) ? h : 'plan';
  if (ui.tab !== 'plan') ui.selected = null;
  render();
}
window.addEventListener('hashchange', route);
route();
setSave('loading');
initStore();
