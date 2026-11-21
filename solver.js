/* Stundenplan-Rechenkern v2. Läuft im Web Worker und im Hauptthread (Konfliktprüfung).
   problem = {
     nDays, nPeriods, noDouble:[bool je Stunde: keine Doppelstunde über die Pause danach],
     teachers:[{name, unav:[s], pref:[s], maxPerDay, maxHard, maxConsec, maxGapsDay, maxDays}],
     classes (= Schülergruppen-Atome):[{name, unav, pref, weekly, w, maxPerDay, maxHard, minPerDay}],
     rooms:[{name, unav}],
     cards:[{lesson, len, t:[fixe Lehrkräfte], tp:[Pool: eine davon], c:[Atome], rr:[[Raumoptionen] je Raumbedarf],
             maxPerDay, label, unav:[s], pen:[[s, Gewicht]]}],
     nLessons, rels:[{type:'diffDays'|'sameDay'|'notAdj', lessons:[li], w}],
     weights:{classGap, classStart, teacherGap, dayBalance, late, lateFrom, undesired, lunchFrom, lunchTo, lunchC, lunchT,
              tMaxDay, tConsec, tGapsDay, tDays, cMaxDay, cMinDay}
   }
   slot = Tag * nPeriods + Stunde
*/
function createSolver(P, seed) {
  var nD = P.nDays, nP = P.nPeriods, nS = nD * nP;
  var nT = P.teachers.length, nC = P.classes.length, nR = P.rooms.length;
  var cards = P.cards, nK = cards.length, nL = Math.max(1, P.nLessons);
  var W = P.weights, noDouble = P.noDouble || [];
  var rels = P.rels || [];

  var s0 = (seed >>> 0) || 1;
  function rnd() {
    s0 |= 0; s0 = (s0 + 0x6D2B79F5) | 0;
    var t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function ri(n) { return Math.floor(rnd() * n); }

  function slotArr(list, key) {
    var a = new Uint8Array(Math.max(1, list.length * nS));
    list.forEach(function (e, i) { (e[key] || []).forEach(function (s) { if (s >= 0 && s < nS) a[i * nS + s] = 1; }); });
    return a;
  }
  var unT = slotArr(P.teachers, 'unav'), unC = slotArr(P.classes, 'unav'), unR = slotArr(P.rooms, 'unav');
  var prT = slotArr(P.teachers, 'pref'), prC = slotArr(P.classes, 'pref');
  var unK = slotArr(cards, 'unav');
  var penK = cards.map(function (k) {
    if (!k.pen || !k.pen.length) return null;
    var a = new Float64Array(nS); k.pen.forEach(function (x) { if (x[0] >= 0 && x[0] < nS) a[x[0]] += x[1]; }); return a;
  });

  var occT = new Int32Array(Math.max(1, nT * nS)).fill(-1);
  var occC = new Int32Array(Math.max(1, nC * nS)).fill(-1);
  var occR = new Int32Array(Math.max(1, nR * nS)).fill(-1);
  var cntT = new Int16Array(Math.max(1, nT * nD)), cntC = new Int16Array(Math.max(1, nC * nD));
  var pos = new Int32Array(nK).fill(-1);
  var rooms = []; for (var q = 0; q < nK; q++) rooms.push(cards[q].rr.map(function () { return -1; }));
  var tsel = new Int32Array(nK).fill(-1);
  var locked = new Uint8Array(nK);
  var ldc = new Int16Array(nL * nD);

  var classCards = []; for (var i = 0; i < nC; i++) classCards.push([]);
  cards.forEach(function (k, idx) { k.c.forEach(function (c) { classCards[c].push(idx); }); });
  var lessonCards = []; for (i = 0; i < nL; i++) lessonCards.push([]);
  cards.forEach(function (k, idx) { lessonCards[k.lesson].push(idx); });
  var lessonRels = []; for (i = 0; i < nL; i++) lessonRels.push([]);
  rels.forEach(function (r, ri2) { r.lessons.forEach(function (l) { if (lessonRels[l] && lessonRels[l].indexOf(ri2) < 0) lessonRels[l].push(ri2); }); });

  var cacheC = new Float64Array(Math.max(1, nC * nD)), cacheT = new Float64Array(Math.max(1, nT * nD)), cacheTW = new Float64Array(Math.max(1, nT)), cacheRel = new Float64Array(Math.max(1, rels.length));

  /* ---------- Belegung ---------- */
  function place(k, s, rs, tp) {
    var cd = cards[k], j, x, d = Math.floor(s / nP);
    for (j = 0; j < cd.len; j++) {
      for (x = 0; x < cd.t.length; x++) occT[cd.t[x] * nS + s + j] = k;
      if (tp >= 0) occT[tp * nS + s + j] = k;
      for (x = 0; x < cd.c.length; x++) occC[cd.c[x] * nS + s + j] = k;
      for (x = 0; x < rs.length; x++) if (rs[x] >= 0) occR[rs[x] * nS + s + j] = k;
    }
    for (x = 0; x < cd.t.length; x++) cntT[cd.t[x] * nD + d] += cd.len;
    if (tp >= 0) cntT[tp * nD + d] += cd.len;
    for (x = 0; x < cd.c.length; x++) cntC[cd.c[x] * nD + d] += cd.len;
    pos[k] = s; tsel[k] = tp;
    for (x = 0; x < rs.length; x++) rooms[k][x] = rs[x];
    ldc[cd.lesson * nD + d]++;
  }
  function unplace(k) {
    var s = pos[k]; if (s < 0) return;
    var cd = cards[k], j, x, d = Math.floor(s / nP), tp = tsel[k], rs = rooms[k];
    for (j = 0; j < cd.len; j++) {
      for (x = 0; x < cd.t.length; x++) if (occT[cd.t[x] * nS + s + j] === k) occT[cd.t[x] * nS + s + j] = -1;
      if (tp >= 0 && occT[tp * nS + s + j] === k) occT[tp * nS + s + j] = -1;
      for (x = 0; x < cd.c.length; x++) if (occC[cd.c[x] * nS + s + j] === k) occC[cd.c[x] * nS + s + j] = -1;
      for (x = 0; x < rs.length; x++) if (rs[x] >= 0 && occR[rs[x] * nS + s + j] === k) occR[rs[x] * nS + s + j] = -1;
    }
    for (x = 0; x < cd.t.length; x++) cntT[cd.t[x] * nD + d] -= cd.len;
    if (tp >= 0) cntT[tp * nD + d] -= cd.len;
    for (x = 0; x < cd.c.length; x++) cntC[cd.c[x] * nD + d] -= cd.len;
    ldc[cd.lesson * nD + d]--;
    pos[k] = -1; tsel[k] = -1;
    for (x = 0; x < rs.length; x++) rs[x] = -1;
  }

  function inBounds(k, s) {
    if (s < 0 || s >= nS) return false;
    var p = s % nP, len = cards[k].len;
    if (p + len > nP) return false;
    for (var j = 0; j < len - 1; j++) if (noDouble[p + j]) return false;
    return true;
  }
  function teacherFreeHard(t, s, len) { for (var j = 0; j < len; j++) if (unT[t * nS + s + j]) return false; return true; }

  // Sperren, die durch Verschieben anderer Karten nicht lösbar sind
  function hardBlocked(k, s) {
    var cd = cards[k], j, x;
    if (!inBounds(k, s)) return true;
    for (j = 0; j < cd.len; j++) {
      if (unK[k * nS + s + j]) return true;
      for (x = 0; x < cd.t.length; x++) if (unT[cd.t[x] * nS + s + j]) return true;
      for (x = 0; x < cd.c.length; x++) if (unC[cd.c[x] * nS + s + j]) return true;
    }
    if (cd.tp.length) { var anyT = false; for (x = 0; x < cd.tp.length && !anyT; x++) if (teacherFreeHard(cd.tp[x], s, cd.len)) anyT = true; if (!anyT) return true; }
    for (var q2 = 0; q2 < cd.rr.length; q2++) {
      var opts = cd.rr[q2], any = false;
      for (x = 0; x < opts.length && !any; x++) { var ok = true; for (j = 0; j < cd.len; j++) if (unR[opts[x] * nS + s + j]) { ok = false; break; } if (ok) any = true; }
      if (!any) return true;
    }
    return false;
  }

  function roomFree(k, r, s, taken) {
    if (taken && taken.indexOf(r) >= 0) return false;
    for (var j = 0; j < cards[k].len; j++) { if (unR[r * nS + s + j]) return false; var o = occR[r * nS + s + j]; if (o >= 0 && o !== k) return false; }
    return true;
  }
  // Räume für alle Raumbedarfe finden; null wenn nicht möglich
  function findRooms(k, s, prefer) {
    var rr = cards[k].rr, out = [];
    for (var q2 = 0; q2 < rr.length; q2++) {
      var opts = rr[q2], pr = prefer ? prefer[q2] : -1, pick = -1;
      if (pr >= 0 && opts.indexOf(pr) >= 0 && roomFree(k, pr, s, out)) pick = pr;
      else { var st = ri(opts.length); for (var i2 = 0; i2 < opts.length; i2++) { var r = opts[(st + i2) % opts.length]; if (roomFree(k, r, s, out)) { pick = r; break; } } }
      if (pick < 0) return null;
      out.push(pick);
    }
    return out;
  }
  function teacherSlotFree(t, s, k, len) {
    for (var j = 0; j < len; j++) { if (unT[t * nS + s + j]) return false; var o = occT[t * nS + s + j]; if (o >= 0 && o !== k) return false; }
    var tt = P.teachers[t];
    if (tt.maxHard && tt.maxPerDay > 0 && cntT[t * nD + Math.floor(s / nP)] + len > tt.maxPerDay) return false;
    return true;
  }
  // Pool-Lehrkraft wählen: -1 kein Pool, -2 keine frei
  function findPool(k, s, prefer) {
    var tp = cards[k].tp; if (!tp.length) return -1;
    if (prefer >= 0 && tp.indexOf(prefer) >= 0 && teacherSlotFree(prefer, s, k, cards[k].len)) return prefer;
    var st = ri(tp.length);
    for (var i2 = 0; i2 < tp.length; i2++) { var t = tp[(st + i2) % tp.length]; if (teacherSlotFree(t, s, k, cards[k].len)) return t; }
    return -2;
  }

  function canPlace(k, s) {
    if (hardBlocked(k, s)) return false;
    var cd = cards[k], j, x, o, d = Math.floor(s / nP);
    if (ldc[cd.lesson * nD + d] >= cd.maxPerDay) return false;
    for (j = 0; j < cd.len; j++) {
      for (x = 0; x < cd.t.length; x++) { o = occT[cd.t[x] * nS + s + j]; if (o >= 0 && o !== k) return false; }
      for (x = 0; x < cd.c.length; x++) { o = occC[cd.c[x] * nS + s + j]; if (o >= 0 && o !== k) return false; }
    }
    for (x = 0; x < cd.t.length; x++) { var tt = P.teachers[cd.t[x]]; if (tt.maxHard && tt.maxPerDay > 0 && cntT[cd.t[x] * nD + d] + cd.len > tt.maxPerDay) return false; }
    for (x = 0; x < cd.c.length; x++) { var cc = P.classes[cd.c[x]]; if (cc.maxHard && cc.maxPerDay > 0 && cntC[cd.c[x] * nD + d] + cd.len > cc.maxPerDay) return false; }
    return true;
  }
  // vollständiger Versuch: liefert {rs, tp} oder null
  function tryResources(k, s, preferRooms, preferT) {
    if (!canPlace(k, s)) return null;
    var tp = findPool(k, s, preferT); if (tp === -2) return null;
    var rs = findRooms(k, s, preferRooms); if (!rs) return null;
    return { rs: rs, tp: tp };
  }

  // Karten, die weichen müssten; null wenn das nicht hilft (fixierte Karten, harte Sperren)
  function blockers(k, s) {
    if (hardBlocked(k, s)) return null;
    var cd = cards[k], set = [], j, x, o, d = Math.floor(s / nP);
    function add(o) { if (o >= 0 && o !== k && set.indexOf(o) < 0) set.push(o); }
    for (j = 0; j < cd.len; j++) {
      for (x = 0; x < cd.t.length; x++) add(occT[cd.t[x] * nS + s + j]);
      for (x = 0; x < cd.c.length; x++) add(occC[cd.c[x] * nS + s + j]);
    }
    function sameDayCardOf(arrOcc, ent, pred) {
      for (var p = d * nP; p < d * nP + nP; p++) { var o2 = arrOcc[ent * nS + p]; if (o2 >= 0 && o2 !== k && set.indexOf(o2) < 0 && !locked[o2] && pred(o2)) return o2; }
      return -1;
    }
    if (ldc[cd.lesson * nD + d] >= cd.maxPerDay) {
      var f = -1;
      for (x = 0; x < cd.c.length && f < 0; x++) f = sameDayCardOf(occC, cd.c[x], function (o2) { return cards[o2].lesson === cd.lesson; });
      for (x = 0; x < cd.t.length && f < 0; x++) f = sameDayCardOf(occT, cd.t[x], function (o2) { return cards[o2].lesson === cd.lesson; });
      if (f < 0) return null; add(f);
    }
    for (x = 0; x < cd.t.length; x++) {
      var tt = P.teachers[cd.t[x]];
      if (tt.maxHard && tt.maxPerDay > 0 && cntT[cd.t[x] * nD + d] + cd.len > tt.maxPerDay) { var f2 = sameDayCardOf(occT, cd.t[x], function () { return true; }); if (f2 < 0) return null; add(f2); }
    }
    for (x = 0; x < cd.c.length; x++) {
      var cc = P.classes[cd.c[x]];
      if (cc.maxHard && cc.maxPerDay > 0 && cntC[cd.c[x] * nD + d] + cd.len > cc.maxPerDay) { var f3 = sameDayCardOf(occC, cd.c[x], function () { return true; }); if (f3 < 0) return null; add(f3); }
    }
    if (cd.tp.length) {
      var bestT = null;
      for (x = 0; x < cd.tp.length; x++) {
        var t = cd.tp[x]; if (!teacherFreeHard(t, s, cd.len)) continue;
        var ts = [];
        for (j = 0; j < cd.len; j++) { o = occT[t * nS + s + j]; if (o >= 0 && o !== k && ts.indexOf(o) < 0 && set.indexOf(o) < 0) ts.push(o); }
        if (bestT === null || ts.length < bestT.length) bestT = ts;
      }
      if (bestT === null) return null;
      bestT.forEach(add);
    }
    var used = [];
    for (var q2 = 0; q2 < cd.rr.length; q2++) {
      var best = null, bestR = -1;
      for (x = 0; x < cd.rr[q2].length; x++) {
        var r = cd.rr[q2][x], bad = used.indexOf(r) >= 0, rs = [];
        for (j = 0; j < cd.len && !bad; j++) {
          if (unR[r * nS + s + j]) { bad = true; break; }
          o = occR[r * nS + s + j]; if (o >= 0 && o !== k && rs.indexOf(o) < 0 && set.indexOf(o) < 0) rs.push(o);
        }
        if (!bad && (best === null || rs.length < best.length)) { best = rs; bestR = r; }
      }
      if (best === null) return null;
      used.push(bestR); best.forEach(add);
    }
    for (x = 0; x < set.length; x++) if (locked[set[x]]) return null;
    return set;
  }

  /* ---------- Kosten ---------- */
  function dayCostClass(c, d) {
    var base = c * nS + d * nP, cnt = 0, first = -1, last = -1, late = 0, pref = 0, cl = P.classes[c];
    for (var p = 0; p < nP; p++) if (occC[base + p] >= 0) { cnt++; if (first < 0) first = p; last = p; if (p >= W.lateFrom) late++; if (prC[base + p]) pref++; }
    var avg = cl.weekly / nD, cost = W.dayBalance * (cnt - avg) * (cnt - avg);
    if (cl.minPerDay > 0 && cnt < cl.minPerDay && cl.weekly >= cl.minPerDay * nD) cost += W.cMinDay * (cl.minPerDay - cnt);
    if (cnt) {
      cost += W.classGap * (last - first + 1 - cnt) + W.classStart * first + W.late * late + W.undesired * pref;
      if (cl.maxPerDay > 0 && cnt > cl.maxPerDay) cost += W.cMaxDay * (cnt - cl.maxPerDay);
      if (W.lunchC > 0 && W.lunchTo >= W.lunchFrom && last > W.lunchTo) {
        var full = true; for (p = W.lunchFrom; p <= W.lunchTo; p++) if (occC[base + p] < 0) { full = false; break; }
        if (full) cost += W.lunchC;
      }
    }
    return cost * (cl.w || 1);
  }
  function dayCostTeacher(t, d) {
    var base = t * nS + d * nP, cnt = 0, first = -1, last = -1, run = 0, maxRun = 0, pref = 0, tt = P.teachers[t];
    for (var p = 0; p < nP; p++) {
      if (occT[base + p] >= 0) { cnt++; if (first < 0) first = p; last = p; run++; if (run > maxRun) maxRun = run; if (prT[base + p]) pref++; }
      else run = 0;
    }
    if (!cnt) return 0;
    var gaps = last - first + 1 - cnt, cost = W.teacherGap * gaps + W.undesired * pref;
    if (tt.maxGapsDay >= 0 && gaps > tt.maxGapsDay) cost += W.tGapsDay * (gaps - tt.maxGapsDay);
    if (tt.maxPerDay > 0 && cnt > tt.maxPerDay) cost += W.tMaxDay * (cnt - tt.maxPerDay);
    if (tt.maxConsec > 0 && maxRun > tt.maxConsec) cost += W.tConsec * (maxRun - tt.maxConsec);
    if (W.lunchT > 0 && W.lunchTo >= W.lunchFrom && last > W.lunchTo && first < W.lunchFrom) {
      var full = true; for (p = W.lunchFrom; p <= W.lunchTo; p++) if (occT[base + p] < 0) { full = false; break; }
      if (full) cost += W.lunchT;
    }
    return cost;
  }
  function weekCostTeacher(t) {
    var tt = P.teachers[t]; if (!(tt.maxDays > 0)) return 0;
    var days = 0; for (var d = 0; d < nD; d++) if (cntT[t * nD + d] > 0) days++;
    return days > tt.maxDays ? W.tDays * (days - tt.maxDays) : 0;
  }
  function relCost(ri2) {
    var r = rels[ri2], perDay = [], i2, l, k, j;
    for (i2 = 0; i2 < nD; i2++) perDay.push([]);
    for (i2 = 0; i2 < r.lessons.length; i2++) {
      l = r.lessons[i2]; var lc = lessonCards[l]; if (!lc) continue;
      for (j = 0; j < lc.length; j++) { k = lc[j]; if (pos[k] >= 0) perDay[Math.floor(pos[k] / nP)].push(k); }
    }
    var cost = 0, d;
    if (r.type === 'diffDays') { for (d = 0; d < nD; d++) if (perDay[d].length > 1) cost += perDay[d].length - 1; }
    else if (r.type === 'sameDay') {
      var nLs = r.lessons.length;
      for (d = 0; d < nD; d++) {
        if (!perDay[d].length) continue;
        var seen = []; perDay[d].forEach(function (k2) { if (seen.indexOf(cards[k2].lesson) < 0) seen.push(cards[k2].lesson); });
        cost += nLs - seen.length;
      }
    } else if (r.type === 'notAdj') {
      for (d = 0; d < nD; d++) {
        var a = perDay[d];
        for (i2 = 0; i2 < a.length; i2++) for (j = 0; j < a.length; j++) {
          if (i2 === j || cards[a[i2]].lesson === cards[a[j]].lesson) continue;
          if (pos[a[i2]] + cards[a[i2]].len === pos[a[j]]) cost++;
        }
      }
    }
    return cost * r.w;
  }
  function penAt(k, s) { var pk = penK[k]; if (!pk || s < 0) return 0; var v = 0; for (var j = 0; j < cards[k].len; j++) v += pk[s + j]; return v * W.undesired; }
  function totalCost() {
    var sum = 0, c, t, d, k;
    for (c = 0; c < nC; c++) for (d = 0; d < nD; d++) { cacheC[c * nD + d] = dayCostClass(c, d); sum += cacheC[c * nD + d]; }
    for (t = 0; t < nT; t++) { for (d = 0; d < nD; d++) { cacheT[t * nD + d] = dayCostTeacher(t, d); sum += cacheT[t * nD + d]; } cacheTW[t] = weekCostTeacher(t); sum += cacheTW[t]; }
    for (k = 0; k < rels.length; k++) { cacheRel[k] = relCost(k); sum += cacheRel[k]; }
    for (k = 0; k < nK; k++) if (pos[k] >= 0) sum += penAt(k, pos[k]);
    return sum;
  }

  // betroffene Teile sammeln (vor UND nach einer Änderung aufrufen)
  var affC = [], affT = [], affTW = [], affR = [];
  function resetAff() { affC.length = 0; affT.length = 0; affTW.length = 0; affR.length = 0; }
  function addU(arr, v) { if (arr.indexOf(v) < 0) arr.push(v); }
  function collect(k) {
    var s = pos[k]; if (s < 0) return;
    var cd = cards[k], d = Math.floor(s / nP), x;
    for (x = 0; x < cd.c.length; x++) addU(affC, cd.c[x] * nD + d);
    for (x = 0; x < cd.t.length; x++) { addU(affT, cd.t[x] * nD + d); addU(affTW, cd.t[x]); }
    if (tsel[k] >= 0) { addU(affT, tsel[k] * nD + d); addU(affTW, tsel[k]); }
    var lr = lessonRels[cd.lesson]; for (x = 0; x < lr.length; x++) addU(affR, lr[x]);
  }
  var nC_ = new Float64Array(256), nT_ = new Float64Array(256), nTW_ = new Float64Array(256), nR_ = new Float64Array(256);
  function grow(a, n) { return a.length >= n ? a : new Float64Array(n * 2); }
  function affDelta() {
    nC_ = grow(nC_, affC.length); nT_ = grow(nT_, affT.length); nTW_ = grow(nTW_, affTW.length); nR_ = grow(nR_, affR.length);
    var delta = 0, i2, key;
    for (i2 = 0; i2 < affC.length; i2++) { key = affC[i2]; nC_[i2] = dayCostClass(Math.floor(key / nD), key % nD); delta += nC_[i2] - cacheC[key]; }
    for (i2 = 0; i2 < affT.length; i2++) { key = affT[i2]; nT_[i2] = dayCostTeacher(Math.floor(key / nD), key % nD); delta += nT_[i2] - cacheT[key]; }
    for (i2 = 0; i2 < affTW.length; i2++) { nTW_[i2] = weekCostTeacher(affTW[i2]); delta += nTW_[i2] - cacheTW[affTW[i2]]; }
    for (i2 = 0; i2 < affR.length; i2++) { nR_[i2] = relCost(affR[i2]); delta += nR_[i2] - cacheRel[affR[i2]]; }
    return delta;
  }
  function affCommit() {
    var i2;
    for (i2 = 0; i2 < affC.length; i2++) cacheC[affC[i2]] = nC_[i2];
    for (i2 = 0; i2 < affT.length; i2++) cacheT[affT[i2]] = nT_[i2];
    for (i2 = 0; i2 < affTW.length; i2++) cacheTW[affTW[i2]] = nTW_[i2];
    for (i2 = 0; i2 < affR.length; i2++) cacheRel[affR[i2]] = nR_[i2];
  }

  /* ---------- Laden ---------- */
  function load(list, lockList) {
    // list: [{k, s, rs:[r], tp}]
    occT.fill(-1); occC.fill(-1); occR.fill(-1); cntT.fill(0); cntC.fill(0); pos.fill(-1); tsel.fill(-1); ldc.fill(0); locked.fill(0);
    rooms.forEach(function (a) { for (var x = 0; x < a.length; x++) a[x] = -1; });
    (lockList || []).forEach(function (k) { if (k >= 0 && k < nK) locked[k] = 1; });
    // fixierte zuerst
    var sorted = (list || []).slice().sort(function (a, b) { return (locked[b.k] || 0) - (locked[a.k] || 0); });
    sorted.forEach(function (e) {
      if (e.k < 0 || e.k >= nK || pos[e.k] >= 0) return;
      var res = tryResources(e.k, e.s, e.rs || [], e.tp != null ? e.tp : -1);
      if (!res) { if (locked[e.k]) locked[e.k] = 0; return; }
      place(e.k, e.s, res.rs, res.tp);
    });
  }

  /* ---------- Prüfung für die Oberfläche ---------- */
  function check(k, s) {
    var cd = cards[k], reasons = [], j, x, o, d = Math.floor(s / nP), hard = false;
    function add(r, h) { if (reasons.indexOf(r) < 0) reasons.push(r); if (h) hard = true; }
    if (!inBounds(k, s)) return { ok: false, hard: true, reasons: [s % nP + cd.len > nP ? 'Doppelstunde passt nicht mehr in den Tag' : 'Doppelstunde darf nicht über diese Pause gehen'], blockers: [] };
    var bl = [];
    function addB(o2) { if (o2 >= 0 && o2 !== k && bl.indexOf(o2) < 0) bl.push(o2); }
    for (j = 0; j < cd.len; j++) {
      if (unK[k * nS + s + j]) add('Das Fach ist zu dieser Zeit gesperrt', true);
      for (x = 0; x < cd.t.length; x++) {
        if (unT[cd.t[x] * nS + s + j]) add(P.teachers[cd.t[x]].name + ' ist nicht verfügbar', true);
        o = occT[cd.t[x] * nS + s + j]; if (o >= 0 && o !== k) { add(P.teachers[cd.t[x]].name + ' unterrichtet schon ' + cards[o].label); addB(o); }
      }
      for (x = 0; x < cd.c.length; x++) {
        if (unC[cd.c[x] * nS + s + j]) add(P.classes[cd.c[x]].name + ': kein Unterricht zu dieser Zeit', true);
        o = occC[cd.c[x] * nS + s + j]; if (o >= 0 && o !== k) { add(P.classes[cd.c[x]].name + ' hat schon ' + cards[o].label); addB(o); }
      }
    }
    for (x = 0; x < cd.t.length; x++) { var tt = P.teachers[cd.t[x]]; if (tt.maxHard && tt.maxPerDay > 0 && cntT[cd.t[x] * nD + d] - (pos[k] >= 0 && Math.floor(pos[k] / nP) === d ? cd.len : 0) + cd.len > tt.maxPerDay) add(tt.name + ' hätte mehr als ' + tt.maxPerDay + ' Stunden an dem Tag'); }
    var tp = findPool(k, s, tsel[k]);
    if (tp === -2) add('Keine Lehrkraft aus dem Pool frei');
    var rs = findRooms(k, s, rooms[k]);
    if (!rs) add('Kein passender Raum frei');
    var dayN = ldc[cd.lesson * nD + d] - (pos[k] >= 0 && Math.floor(pos[k] / nP) === d ? 1 : 0);
    var dayFull = dayN >= cd.maxPerDay;
    if (dayFull) add('Dieser Unterricht liegt an dem Tag schon ' + (cd.maxPerDay === 1 ? 'einmal' : cd.maxPerDay + '-mal'));
    var pen = penAt(k, s) > 0;
    return { ok: reasons.length === 0, hard: hard, reasons: reasons, rooms: rs, tp: tp, blockers: bl, undesired: pen,
      softOnly: reasons.length > 0 && !hard && bl.length === 0 && rs !== null && tp !== -2 && reasons.every(function (r) { return r.indexOf('liegt an dem Tag') >= 0 || r.indexOf('mehr als') >= 0; }) };
  }

  var stopFlag = false;
  function stop() { stopFlag = true; }

  function snapshot() { var list = []; for (var k = 0; k < nK; k++) if (pos[k] >= 0) list.push({ k: k, s: pos[k], rs: rooms[k].slice(), tp: tsel[k] }); return list; }
  function lockedList() { var a = []; for (var k = 0; k < nK; k++) if (locked[k]) a.push(k); return a; }
  function placeEval(k, s, res) {
    place(k, s, res.rs, res.tp);
    resetAff(); collect(k);
    var dl = affDelta() + penAt(k, s);
    return dl;
  }

  /* ---------- Phase 1: Aufbau mit Verdrängung ---------- */
  function construct(maxMs, onProgress) {
    var t0 = Date.now(), free = [], k, s;
    for (k = 0; k < nK; k++) if (pos[k] < 0) free.push(k);
    var diff = new Float64Array(nK);
    free.forEach(function (k2) {
      var n = 0; for (var s2 = 0; s2 < nS; s2++) if (!hardBlocked(k2, s2)) n++;
      var cd = cards[k2];
      diff[k2] = n / (cd.len * (1 + cd.t.length * 0.3 + cd.c.length * 0.15 + cd.rr.length * 0.2 + (cd.tp.length ? 0.2 : 0)));
    });
    var impossible = [];
    free = free.filter(function (k2) { if (diff[k2] === 0) { impossible.push(k2); return false; } return true; });
    free.sort(function (a, b) { return diff[b] - diff[a]; });
    var ejected = new Int32Array(nK), lastMoved = new Int32Array(nK).fill(-1000);
    var bestUn = free.length + 1, best = null, iter = 0;
    totalCost();
    while (free.length && !stopFlag) {
      iter++;
      if ((iter & 127) === 0) { if (Date.now() - t0 > maxMs) break; if (onProgress) onProgress(free.length + impossible.length); }
      var k2 = free.pop(), bestS = -1, bestScore = Infinity, bestRes = null;
      for (s = 0; s < nS; s++) {
        var res = tryResources(k2, s, null, -1); if (!res) continue;
        var dl = placeEval(k2, s, res);
        unplace(k2);
        var sc = dl + rnd() * 2;
        if (sc < bestScore) { bestScore = sc; bestS = s; bestRes = res; }
      }
      if (bestS >= 0) {
        place(k2, bestS, bestRes.rs, bestRes.tp); resetAff(); collect(k2); affDelta(); affCommit();
        lastMoved[k2] = iter;
      } else {
        var cand = -1, cScore = Infinity, cSet = null;
        for (s = 0; s < nS; s++) {
          var b = blockers(k2, s); if (!b || !b.length) continue;
          var score = 0;
          for (var i2 = 0; i2 < b.length; i2++) { score += 1 + ejected[b[i2]] * 0.2; if (iter - lastMoved[b[i2]] < 8) score += 5; }
          score += rnd() * 1.5;
          if (score < cScore) { cScore = score; cand = s; cSet = b; }
        }
        if (cand < 0) { impossible.push(k2); continue; }
        for (var q2 = 0; q2 < cSet.length; q2++) {
          var e = cSet[q2];
          resetAff(); collect(e); unplace(e); affDelta(); affCommit();
          ejected[e]++; lastMoved[e] = iter;
          free.splice(Math.max(0, free.length - 1 - ri(3)), 0, e);
        }
        var r2 = tryResources(k2, cand, null, -1);
        if (!r2) { free.unshift(k2); continue; }
        place(k2, cand, r2.rs, r2.tp); resetAff(); collect(k2); affDelta(); affCommit();
        lastMoved[k2] = iter;
      }
      var un = free.length + impossible.length;
      if (un < bestUn) { bestUn = un; best = snapshot(); }
    }
    if (best && free.length + impossible.length > bestUn) load(best, lockedList());
    return iter;
  }

  /* ---------- Phase 2: Optimierung (Simulated Annealing) ---------- */
  function optimize(maxMs, onProgress) {
    var t0 = Date.now(), cost = totalCost(), bestCost = cost, best = snapshot(), bestUn = countUn();
    var movable = []; for (var k = 0; k < nK; k++) if (!locked[k]) movable.push(k);
    if (!movable.length) return cost;
    var T0 = Math.max(2, W.classGap * 0.5), T1 = 0.02, T = T0, iter = 0;
    function countUn() { var n = 0; for (var z = 0; z < nK; z++) if (pos[z] < 0) n++; return n; }
    while (!stopFlag) {
      iter++;
      if ((iter & 511) === 0) {
        var el = Date.now() - t0; if (el > maxMs) break;
        T = T0 * Math.pow(T1 / T0, el / maxMs);
        if ((iter & 8191) === 0 && onProgress) onProgress(bestCost, best, bestUn);
      }
      var k1 = movable[ri(movable.length)];
      if (pos[k1] < 0) {
        var st = ri(nS);
        for (var a = 0; a < nS; a++) {
          var sa = (st + a) % nS, ra = tryResources(k1, sa, null, -1);
          if (ra) { place(k1, sa, ra.rs, ra.tp); cost = totalCost(); break; }
        }
        var u0 = countUn();
        if (u0 < bestUn) { bestUn = u0; bestCost = cost; best = snapshot(); }
        continue;
      }
      var mv = rnd(), oldS = pos[k1], oldR = rooms[k1].slice(), oldT = tsel[k1], dl;
      if (mv < 0.5) {
        var ns = ri(nS);
        if (ns === oldS || !inBounds(k1, ns)) continue;
        resetAff(); collect(k1); var p0 = penAt(k1, oldS);
        unplace(k1);
        var res = tryResources(k1, ns, oldR, oldT);
        if (!res) { place(k1, oldS, oldR, oldT); continue; }
        place(k1, ns, res.rs, res.tp); collect(k1);
        dl = affDelta() + penAt(k1, ns) - p0;
        if (dl <= 0 || rnd() < Math.exp(-dl / T)) { affCommit(); cost += dl; }
        else { unplace(k1); place(k1, oldS, oldR, oldT); }
      } else if (mv < 0.85) {
        var cl = cards[k1].c; if (!cl.length) continue;
        var lst = classCards[cl[ri(cl.length)]], k2 = lst[ri(lst.length)];
        if (k2 === k1 || locked[k2] || pos[k2] < 0 || cards[k2].len !== cards[k1].len) continue;
        var s2 = pos[k2], r2 = rooms[k2].slice(), t2 = tsel[k2];
        resetAff(); collect(k1); collect(k2);
        var pb = penAt(k1, oldS) + penAt(k2, s2);
        unplace(k1); unplace(k2);
        var ok = false, ra1 = tryResources(k1, s2, r2, t2), ra2 = null;
        if (ra1) { place(k1, s2, ra1.rs, ra1.tp); ra2 = tryResources(k2, oldS, oldR, oldT); if (ra2) ok = true; else unplace(k1); }
        if (!ok) { place(k1, oldS, oldR, oldT); place(k2, s2, r2, t2); continue; }
        place(k2, oldS, ra2.rs, ra2.tp);
        collect(k1); collect(k2);
        dl = affDelta() + penAt(k1, s2) + penAt(k2, oldS) - pb;
        if (dl <= 0 || rnd() < Math.exp(-dl / T)) { affCommit(); cost += dl; }
        else { unplace(k1); unplace(k2); place(k1, oldS, oldR, oldT); place(k2, s2, r2, t2); }
      } else {
        // Pool-Lehrkraft oder Raum neu wählen (gleiche Zeit)
        if (!cards[k1].tp.length && !cards[k1].rr.some(function (o2) { return o2.length > 1; })) continue;
        resetAff(); collect(k1);
        unplace(k1);
        var r3 = tryResources(k1, oldS, null, -1);
        if (!r3) { place(k1, oldS, oldR, oldT); continue; }
        place(k1, oldS, r3.rs, r3.tp); collect(k1);
        dl = affDelta();
        if (dl <= 0 || rnd() < Math.exp(-dl / T)) { affCommit(); cost += dl; }
        else { unplace(k1); place(k1, oldS, oldR, oldT); }
      }
      if (cost < bestCost - 1e-9) { bestCost = cost; best = snapshot(); bestUn = countUn(); }
    }
    if (countUn() >= bestUn) load(best, lockedList());
    return totalCost();
  }

  /* ---------- Auswertung ---------- */
  function stats() {
    var cg = 0, tg = 0, c, t, d, p;
    for (c = 0; c < nC; c++) for (d = 0; d < nD; d++) {
      var f = -1, l = -1, n = 0; for (p = 0; p < nP; p++) if (occC[c * nS + d * nP + p] >= 0) { n++; if (f < 0) f = p; l = p; }
      if (n) cg += l - f + 1 - n;
    }
    for (t = 0; t < nT; t++) for (d = 0; d < nD; d++) {
      var f2 = -1, l2 = -1, n2 = 0; for (p = 0; p < nP; p++) if (occT[t * nS + d * nP + p] >= 0) { n2++; if (f2 < 0) f2 = p; l2 = p; }
      if (n2) tg += l2 - f2 + 1 - n2;
    }
    var un = 0; for (var k = 0; k < nK; k++) if (pos[k] < 0) un++;
    return { classGaps: cg, teacherGaps: tg, unplaced: un, cost: totalCost() };
  }

  // Liste verletzter Bedingungen für die Oberfläche
  function report(names) {
    var out = [], t, c, d, p;
    function push(sev, text) { out.push({ sev: sev, text: text }); }
    for (t = 0; t < nT; t++) {
      var tt = P.teachers[t], days = 0;
      for (d = 0; d < nD; d++) {
        var base = t * nS + d * nP, cnt = 0, first = -1, last = -1, run = 0, mr = 0, pref = 0;
        for (p = 0; p < nP; p++) { if (occT[base + p] >= 0) { cnt++; if (first < 0) first = p; last = p; run++; mr = Math.max(mr, run); if (prT[base + p]) pref++; } else run = 0; }
        if (!cnt) continue; days++;
        var gaps = last - first + 1 - cnt, dn = names.days[d];
        if (tt.maxPerDay > 0 && cnt > tt.maxPerDay && W.tMaxDay > 0) push('t', tt.name + ': ' + cnt + ' Stunden am ' + dn + ' (höchstens ' + tt.maxPerDay + ')');
        if (tt.maxConsec > 0 && mr > tt.maxConsec && W.tConsec > 0) push('t', tt.name + ': ' + mr + ' Stunden am Stück am ' + dn + ' (höchstens ' + tt.maxConsec + ')');
        if (tt.maxGapsDay >= 0 && gaps > tt.maxGapsDay && W.tGapsDay > 0) push('t', tt.name + ': ' + gaps + ' Hohlstunden am ' + dn + ' (höchstens ' + tt.maxGapsDay + ')');
        if (pref && W.undesired > 0) push('w', tt.name + ': ' + pref + ' unerwünschte Stunde' + (pref > 1 ? 'n' : '') + ' am ' + dn);
        if (W.lunchT > 0 && last > W.lunchTo && first < W.lunchFrom) { var full = true; for (p = W.lunchFrom; p <= W.lunchTo; p++) if (occT[base + p] < 0) full = false; if (full) push('t', tt.name + ': keine Mittagspause am ' + dn); }
      }
      if (tt.maxDays > 0 && days > tt.maxDays && W.tDays > 0) push('t', tt.name + ': unterrichtet an ' + days + ' Tagen (höchstens ' + tt.maxDays + ')');
    }
    for (c = 0; c < nC; c++) {
      var cl = P.classes[c];
      for (d = 0; d < nD; d++) {
        var b2 = c * nS + d * nP, n = 0, f = -1, l = -1, pr = 0;
        for (p = 0; p < nP; p++) if (occC[b2 + p] >= 0) { n++; if (f < 0) f = p; l = p; if (prC[b2 + p]) pr++; }
        var dn2 = names.days[d];
        if (n && l - f + 1 - n > 0) push('c', cl.name + ': ' + (l - f + 1 - n) + ' Freistunde' + (l - f + 1 - n > 1 ? 'n' : '') + ' am ' + dn2);
        if (cl.maxPerDay > 0 && n > cl.maxPerDay && W.cMaxDay > 0) push('c', cl.name + ': ' + n + ' Stunden am ' + dn2 + ' (höchstens ' + cl.maxPerDay + ')');
        if (cl.minPerDay > 0 && n < cl.minPerDay && W.cMinDay > 0 && cl.weekly >= cl.minPerDay * nD) push('c', cl.name + ': nur ' + n + ' Stunden am ' + dn2 + ' (mindestens ' + cl.minPerDay + ')');
        if (pr && W.undesired > 0) push('w', cl.name + ': ' + pr + ' unerwünschte Stunde' + (pr > 1 ? 'n' : '') + ' am ' + dn2);
        if (n && W.lunchC > 0 && l > W.lunchTo) { var full2 = true; for (p = W.lunchFrom; p <= W.lunchTo; p++) if (occC[b2 + p] < 0) full2 = false; if (full2) push('c', cl.name + ': keine Mittagspause am ' + dn2); }
      }
    }
    for (var k = 0; k < nK; k++) if (pos[k] >= 0 && penAt(k, pos[k]) > 0) push('w', cards[k].label + ': ' + names.days[Math.floor(pos[k] / nP)] + ' ' + (pos[k] % nP + 1) + '. Stunde ist für das Fach unerwünscht');
    for (var r = 0; r < rels.length; r++) { var rc = relCost(r); if (rc > 0) push('r', (rels[r].name || 'Beziehung') + ' nicht eingehalten'); }
    return out;
  }

  return { load: load, construct: construct, optimize: optimize, check: check, stats: stats, report: report, snapshot: snapshot, stop: stop,
    unplace: unplace, place: place, tryResources: tryResources, pos: pos, rooms: rooms, tsel: tsel };
}

/* Worker-Ablauf */
function solverWorkerMain(self) {
  self.onmessage = function (e) {
    var m = e.data;
    if (m.type !== 'start') return;
    var solver = createSolver(m.problem, m.seed);
    solver.load(m.initial, m.locked);
    var total = m.timeMs, t0 = Date.now(), lastPost = 0, lastSnap = 0;
    function progress(phase, val, extra) {
      var now = Date.now(); if (now - lastPost < 200) return; lastPost = now;
      self.postMessage({ type: 'progress', phase: phase, value: val, elapsed: now - t0, unplaced: extra });
    }
    solver.construct(Math.max(1000, total * 0.35), function (un) { progress('construct', un); });
    var st = solver.stats();
    self.postMessage({ type: 'progress', phase: 'optimize', value: st.cost, elapsed: Date.now() - t0, unplaced: st.unplaced });
    self.postMessage({ type: 'snapshot', result: solver.snapshot(), cost: st.cost });
    solver.optimize(Math.max(300, total - (Date.now() - t0)), function (c, best, un) {
      progress('optimize', c, un);
      var now = Date.now();
      if (now - lastSnap > 1500) { lastSnap = now; self.postMessage({ type: 'snapshot', result: best, cost: c }); }
    });
    self.postMessage({ type: 'done', result: solver.snapshot(), stats: solver.stats() });
  };
}

if (typeof module !== 'undefined') module.exports = { createSolver: createSolver };
