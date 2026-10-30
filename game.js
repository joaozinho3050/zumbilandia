// Zumbilandia - logica do jogo. Define window.G (ver PLANO.md).
(function () {
  const R = 0.4, CH = 40;
  let rng = Math.random;
  // PRNG deterministico
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rnd = (a, b) => a + rng() * (b - a);
  // AABB {x,y,w,h}; movel-conteiner: x,y = centro, w,h = pegada
  const inBox = (b, x, y, m) => x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m;
  const cbox = c => ({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h });
  const solid = (h, q) => !(q.door && h.doors.find(d => d.id === q.door).open); // porta aberta nao colide
  // ponto (raio m) bate na casa? lote primeiro; so entao partes e moveis (sem cache). Casa sem parts = bloco solido.
  function hitHouse(h, cs, x, y, m) {
    if (!inBox(h, x, y, m)) return false;
    if (!h.parts) return true;
    return h.parts.some(q => solid(h, q) && inBox(q, x, y, m)) || cs.some(c => c.w && inBox(cbox(c), x, y, m));
  }
  // segmento (x0,y0)-(x1,y1) cruza o AABB b? (slab)
  function segHit(x0, y0, x1, y1, b) {
    const dx = x1 - x0, dy = y1 - y0;
    let a = 0, e = 1;
    for (const [p, d, lo, hi] of [[x0, dx, b.x, b.x + b.w], [y0, dy, b.y, b.y + b.h]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
      let t0 = (lo - p) / d, t1 = (hi - p) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      a = Math.max(a, t0); e = Math.min(e, t1);
      if (a > e) return false;
    }
    return true;
  }
  // segmento cruza alguma casa? (lote, depois partes; moveis nao bloqueiam a vista)
  function blocked(x0, y0, x1, y1, hs) {
    return (hs || G.houses).some(h => segHit(x0, y0, x1, y1, h) && (!h.parts || h.parts.some(q => solid(h, q) && segHit(x0, y0, x1, y1, q))));
  }
  const chOf = e => Math.floor(e.x / CH) + ',' + Math.floor(e.y / CH);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // diferenca angular absoluta entre dois angulos
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  // caixa (AABB) do carro: centro x,y, 4,2 m de comprimento no eixo da dir
  const carBox = c => { const v = Math.abs(Math.sin(c.dir)) > 0.5; return { x: c.x - (v ? 1 : 2.1), y: c.y - (v ? 2.1 : 1), w: v ? 2 : 4.2, h: v ? 4.2 : 2 }; };
  // ponto (com raio m) livre? dentro do mapa; fora de casas, carros (AABB) e arvores (circulo r 0,4)
  function free(x, y, m) {
    m = m === undefined ? R : m;
    return !G.houses.some(h => hitHouse(h, G.crates, x, y, m)) && !G.cars.some(c => inBox(carBox(c), x, y, m)) && !G.trees.some(t => Math.hypot(x - t.x, y - t.y) < 0.4 + m);
  }
  // move por eixo (desliza nas paredes)
  function move(o, dx, dy) {
    if (free(o.x + dx, o.y)) o.x += dx;
    if (free(o.x, o.y + dy)) o.y += dy;
  }
  const houseAt = e => { const h = G.houses.find(h => e.x >= h.x && e.x <= h.x + h.w && e.y >= h.y && e.y <= h.y + h.h); return h ? h.id : null; };
  function randFree(minFromPlayer) {
    for (let i = 0; i < 500; i++) {
      const p = { x: rnd((G.ref[0] - 1) * CH + 1, (G.ref[0] + 2) * CH - 1), y: rnd((G.ref[1] - 1) * CH + 1, (G.ref[1] + 2) * CH - 1) }; // 3x3 da referencia
      if (free(p.x, p.y, 1) && !houseAt(p) && dist(p, G.player) > minFromPlayer) return p;
    }
    return { x: 1, y: 1 }; // shortcut: fallback de canto, improvavel
  }
  function newZombie() {
    const p = randFree(10);
    return { id: 'p:' + G.nextId++, ch: chOf(p), x: p.x, y: p.y, hp: 60, state: 'idle', alert: 0, atk: 0 };
  }

  const STACK = { food: 5, bandage: 5, rag: 10, wire: 10, ammo: 24, bottle: 3 };
  // item {id,qty,...}: coleta o que cabe e deixa o resto em item.qty; true so se coletou tudo (senao evento full)
  function addItem(item) {
    const inv = G.player.inv, max = STACK[item.id];
    let q = item.qty === undefined ? 1 : item.qty;
    if (!max) {
      if (inv.length >= 8) { G.events.push({ type: 'full' }); return false; }
      inv.push(Object.assign({}, item, { qty: 1 })); item.qty = 0; return true;
    }
    for (const s of inv) if (s.id === item.id && s.qty < max && q > 0) { const n = Math.min(q, max - s.qty); s.qty += n; q -= n; }
    while (q > 0 && inv.length < 8) { const n = Math.min(q, max); inv.push({ id: item.id, qty: n }); q -= n; }
    item.qty = q;
    if (q > 0) G.events.push({ type: 'full' });
    return q === 0;
  }
  const ammoOf = p => p.inv.reduce((n, i) => n + (i.id === 'ammo' ? i.qty : 0), 0);

  function hint(id, text) { if (!G.hints[id]) { G.hints[id] = 1; G.events.push({ type: 'hint', id, text }); } }

  function die() {
    const p = G.player, ch = chOf(p);
    const tomb = { id: ch + ':t:' + G.nextId++, ch, x: p.x, y: p.y, opened: false, tomb: true,
      loot: p.inv.concat(Object.values(p.equip || {}).filter(Boolean)).map(i => Object.assign({}, i)) };
    if (G._ls.has(ch)) G.crates.push(tomb); // senao (raro) vai direto ao diff do chunk
    else { const d = G.chunks[ch] = G.chunks[ch] || { visit: Math.floor(G.t / 60) }; (d.crates = d.crates || {})[tomb.id] = strip(tomb); }
    const car = p.car && G.cars.find(c => c.id === p.car);
    if (car) car.speed = 0;
    Object.assign(p, { x: 23, y: 23, hp: 100, hunger: 100, inv: [{ id: 'food', qty: 1 }], weapon: 'pipe', equip: {}, car: null, action: null, near: null });
    G._hunger = G._starve = 0;
    G.dead = true; G._dead = 2; // UI mostra "Voce morreu" por 2 s; update destrava sozinho (ou G.respawn())
    G.events.push({ type: 'death' });
    G.save();
  }

  function playerAttack(p) {
    if (p.weapon === 'pipe') {
      G.cd = 0.6;
      G.events.push({ type: 'swing' });
      G.zombies.forEach(z => {
        if (dist(z, p) <= 1.5 && !blocked(p.x, p.y, z.x, z.y) && angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.dir) <= Math.PI / 4) hurt(z, 25);
      });
    } else {
      const am = p.inv.find(i => i.id === 'ammo');
      if (!am) return;
      if (--am.qty <= 0) p.inv.splice(p.inv.indexOf(am), 1);
      G.cd = 0.4;
      G.events.push({ type: 'shot', x: p.x, y: p.y, dir: p.dir });
      let best = null;
      G.zombies.forEach(z => {
        const d = dist(z, p);
        if (d <= 12 && angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.dir) <= 0.26 && !blocked(p.x, p.y, z.x, z.y) && (!best || d < dist(best, p))) best = z;
      });
      if (best) hurt(best, 50);
      G.zombies.forEach(z => { if (dist(z, p) <= 15) { z.alert = 6; z.state = 'chase'; } });
    }
  }
  function hurt(z, dmg) {
    z.hp -= dmg;
    G.events.push({ type: 'hit', x: z.x, y: z.y });
  }

  const idPhase = id => { let v = 0; for (const c of String(id)) v = (v * 31 + c.charCodeAt(0)) % 25; return v / 100; }; // escalona o recalculo por id
  // proximo waypoint contra a casa h (so ela): vao/porta aberta visivel mais perto do alvo; senao porta fechada; senao canto
  function navWay(z, p, h) {
    const cur = z.way, cand = [];
    (h.gaps || []).forEach((g, gi) => {
      const dr = (h.doors || []).find(d => Math.abs(d.x + d.w / 2 - g.x) < 1e-6 && Math.abs(d.y + d.h / 2 - g.y) < 1e-6), closed = dr && !dr.open;
      if (closed) dr.open = true; // a propria porta nao tapa a vista ate ela
      const vis = !blocked(z.x, z.y, g.x, g.y, [h]);
      if (closed) dr.open = false;
      if (vis && !(z.last || []).some(l => l.h === h.id && l.gi === gi && G.t - l.t < 10)) cand.push({ x: g.x, y: g.y, gi, dr: closed ? dr : null, s: Math.hypot(g.x - p.x, g.y - p.y) });
    });
    const zd = dist(z, p), open = cand.filter(c => !c.dr), shut = cand.filter(c => c.dr), fwd = l => l.filter(c => c.s < zd - 0.3); // so vaos que aproximam do alvo
    let pool = fwd(open).length ? fwd(open) : fwd(shut).length ? fwd(shut) : open.length ? open : shut;
    let best = pool.reduce((b, c) => (!b || c.s < b.s ? c : b), null);
    const keep = cur && cur.gi !== undefined && cur.h === h.id && G.t - cur.t0 < 6 && !cur.dr && cand.find(c => c.gi === cur.gi && !c.dr);
    if (keep) best = keep; // compromisso: segue o vao escolhido ate atravessar (evita vai-e-volta entre dois vaos)
    if (best) {
      let u = cur && cur.gi === best.gi && cur.h === h.id ? [cur.ux, cur.uy] : null; // direcao de travessia fixada na 1a visada
      if (!u) { // normal do vao (eixo x se a parede e vertical), voltada para o lado do alvo
        const g = best, vert = h.parts.some(q => g.x >= q.x - 0.02 && g.x <= q.x + q.w + 0.02 && (Math.abs(q.y + q.h - (g.y - 0.7)) < 0.03 || Math.abs(q.y - (g.y + 0.7)) < 0.03)); // parede vertical: o vao de 1,4 m acaba em y±0,7
        const n = vert ? [1, 0] : [0, 1], sg = (g.x - z.x) * n[0] + (g.y - z.y) * n[1] >= 0 ? 1 : -1;
        u = [n[0] * sg, n[1] * sg];
      }
      const s0 = (z.x - best.x) * u[0] + (z.y - best.y) * u[1]; // <0 antes do vao, >0 depois
      if (s0 > 0.3 && !best.dr) z.last = (z.last || []).filter(l => G.t - l.t < 10).concat({ h: h.id, gi: best.gi, t: G.t }); // vao atravessado: nao volta por ele (10 s)
      if (s0 > 0.3 && !best.dr) { z.way = null; return navWay(z, p, h); }
      const lat = Math.abs((z.x - best.x) * -u[1] + (z.y - best.y) * u[0]), k = best.dr ? 0 : s0 < -0.6 || (s0 < -0.3 && lat > 0.15) ? -0.5 : 0.6; // alinha 0,5 m antes do vao; depois atravessa 0,6 m
      return { x: best.x + u[0] * k, y: best.y + u[1] * k, gi: best.gi, h: h.id, hh: h, dr: best.dr, ux: u[0], uy: u[1], t0: cur && cur.gi === best.gi && cur.h === h.id ? cur.t0 : G.t };
    }
    // nenhum vao visivel (zumbi em volta da casa): vai ao canto (folga 0,6 m) que encurta mais o trajeto
    if (cur && cur.gi === undefined && Math.hypot(cur.x - z.x, cur.y - z.y) > 0.3 && !blocked(z.x, z.y, cur.x, cur.y, [h])) return cur;
    const m = 0.6, cs = [[h.x - m, h.y - m], [h.x + h.w + m, h.y - m], [h.x - m, h.y + h.h + m], [h.x + h.w + m, h.y + h.h + m]];
    let bw = null, bs = 1e9;
    for (const c of cs) {
      const sc = Math.hypot(c[0] - z.x, c[1] - z.y) + Math.hypot(c[0] - p.x, c[1] - p.y);
      if (sc < bs && Math.hypot(c[0] - z.x, c[1] - z.y) > 0.3 && !blocked(z.x, z.y, c[0], c[1], [h])) { bs = sc; bw = { x: c[0], y: c[1] }; }
    }
    return bw;
  }

  // BFS em grade 0,3 m com free(): ponto ~5 celulas adiante no caminho ate a celula alcancavel mais perto de (gx,gy); contorna moveis
  function pathTo(z, gx, gy) {
    const S = 0.3, x0 = Math.min(z.x, gx) - 3, y0 = Math.min(z.y, gy) - 3, nx = Math.ceil((Math.abs(z.x - gx) + 6) / S), ny = Math.ceil((Math.abs(z.y - gy) + 6) / S);
    if (nx * ny > 8000) return null; // shortcut: alvo longe demais para a grade, volta ao rumo direto
    const prev = new Int32Array(nx * ny).fill(-2), cx = i => x0 + (i % nx + 0.5) * S, cy = i => y0 + (Math.floor(i / nx) + 0.5) * S;
    const s0 = Math.floor((z.y - y0) / S) * nx + Math.floor((z.x - x0) / S), qu = [s0];
    prev[s0] = -1;
    let best = s0, bd = Math.hypot(cx(s0) - gx, cy(s0) - gy);
    for (let k = 0; k < qu.length; k++) {
      const c = qu[k], i = c % nx, j = Math.floor(c / nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj, n = b * nx + a;
        if (a < 0 || b < 0 || a >= nx || b >= ny || prev[n] !== -2 || !free(cx(n), cy(n))) continue;
        prev[n] = c; qu.push(n);
        const d = Math.hypot(cx(n) - gx, cy(n) - gy);
        if (d < bd - 1e-9) { bd = d; best = n; }
      }
    }
    const path = []; for (let c = best; c !== -1; c = prev[c]) path.push(c);
    path.reverse();
    const t = path[Math.min(5, path.length - 1)];
    return { x: cx(t), y: cy(t) };
  }

  function updateZombie(z, p, dt) {
    const d = dist(z, p);
    z.alert = Math.max(0, z.alert - dt);
    const h = d < 12 ? G.houses.find(h => blocked(z.x, z.y, p.x, p.y, [h])) : null; // casa no caminho (parede/porta fechada)
    if (d <= 1) z.state = 'attack';
    else if (d < (h && h.parts ? 3 : 8) || z.alert > 0 || (z.state === 'chase' && d < 12)) z.state = 'chase'; // abafado: 3 m
    else z.state = 'idle';
    if (z.state === 'attack') p.hp -= 10 * dt;
    else if (z.state === 'chase') {
      const a = Math.atan2(p.y - z.y, p.x - z.x), s = 1.8 * dt;
      z.side = z.side || (rng() < 0.5 ? 1 : -1);
      const tryDir = ang => { const nx = z.x + Math.cos(ang) * s, ny = z.y + Math.sin(ang) * s; if (!free(nx, ny)) return false; z.x = nx; z.y = ny; return true; };
      const slide = ang => { const c = Math.cos(ang) * s, n = Math.sin(ang) * s; // so um eixo (encosta e desliza)
        for (const [ax, ay] of Math.abs(c) > Math.abs(n) ? [[c, 0], [0, n]] : [[0, n], [c, 0]]) if (Math.abs(ax + ay) > s * 0.3 && free(z.x + ax, z.y + ay)) { z.x += ax; z.y += ay; return true; }
        return false; };
      z.fl = z.fl || 0;
      let aim = null;
      if (!h) { // reta livre; se vinha de um vao, termina a travessia (o corpo de 0,4 m nao cabe em qualquer reta livre)
        z.bang = 0;
        const cw = z.way;
        if (cw && cw.hh && G.t - cw.t0 < 4) {
          if ((z.rc -= dt) <= 0) { z.rc = 0.25; const nw = navWay(z, p, cw.hh); z.way = nw && nw.gi === cw.gi ? nw : null; }
          if (z.way) aim = Math.atan2(z.way.y - z.y, z.way.x - z.x);
        } else z.way = null;
      } else {
        z.rc = (z.rc === undefined ? idPhase(z.id) : z.rc) - dt;
        if (z.rc <= 0 || !z.way) { z.rc = 0.25; z.way = navWay(z, p, h); }
        const w = z.way;
        if (w && w.dr && dBox(w.dr, z.x, z.y) < 0.75) { // porta fechada no caminho: bate 4 s e arromba
          if ((z.bang = (z.bang || 0) + dt) >= 4) { w.dr.open = true; G.events.push({ type: 'doorBreak', id: w.dr.id }); z.bang = 0; z.way = null; }
          return;
        }
        z.bang = 0;
        if (w) aim = Math.atan2(w.y - z.y, w.x - z.x);
      }
      if (!z.ck || G.t - z.ck.t > 0.6) { // empacado (<0,25 m em 0,6 s): grade ate o alvo (vao atual ou jogador)
        if (z.ck && Math.hypot(z.x - z.ck.x, z.y - z.ck.y) < 0.25) { const g = z.way && !z.way.dr ? z.way : p, q = pathTo(z, g.x, g.y); if (q) z.pw = { x: q.x, y: q.y, t: G.t + 0.9 }; }
        z.ck = { x: z.x, y: z.y, t: G.t };
      }
      if (z.pw && z.pw.t > G.t) aim = Math.atan2(z.pw.y - z.y, z.pw.x - z.x);
      const b = aim !== null ? aim : a;
      if (tryDir(b)) { z.fl = 0; return; }
      if (++z.fl >= 4 && !(z.pw && z.pw.t > G.t)) { // 4 passos seguidos sem avancar: grade ja
        const g = z.way && !z.way.dr ? z.way : p, q = pathTo(z, g.x, g.y); z.fl = 0;
        if (q) { z.pw = { x: q.x, y: q.y, t: G.t + 0.9 }; if (tryDir(Math.atan2(q.y - z.y, q.x - z.x))) return; }
      }
      for (const o of [Math.PI / 2, 2.0, 2.6]) for (const sd of [z.side, -z.side]) // sem rota: desliza pela tangente
        if (tryDir(b + o * sd) || slide(b + o * sd)) { z.side = sd; return; }
    }
  }

  function step(dt) {
    const p = G.player, inp = p.input;
    G.t += dt;
    G.cd = Math.max(0, G.cd - dt);

    let mx = inp.mx, my = inp.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.01) { p.dir = Math.atan2(my, mx); move(p, mx * 3 * dt, my * 3 * dt); }
    p.inside = houseAt(p);
    checkRef(p);

    G._hunger += dt;
    if (G._hunger >= 6) { G._hunger -= 6; p.hunger = Math.max(0, p.hunger - 1); }
    if (p.hunger <= 0) {
      G._starve += dt;
      if (G._starve >= 5) { G._starve -= 5; p.hp -= 1; }
    }

    // alvo mais proximo (<1,5 m) com linha livre: movel/tumba, porta
    p.near = null;
    let bd = 1.5, nd = null;
    G.crates.forEach(c => {
      const d = c.w ? dBox(cbox(c), p.x, p.y) : dist(c, p);
      if (!c.opened && d < bd && !blocked(p.x, p.y, c.x, c.y)) { bd = d; p.near = { type: c.tomb ? 'tomb' : 'crate', id: c.id }; }
    });
    G.houses.forEach(h => (h.doors || []).forEach(dr => {
      const d = dBox(dr, p.x, p.y) - (dr.open ? 0.3 : 0); // porta aberta perto: FECHAR ganha de leve
      if (d >= bd) return;
      const o = dr.open; dr.open = true; // a propria porta nao tapa a linha ate ela
      const vis = !blocked(p.x, p.y, dr.x + dr.w / 2, dr.y + dr.h / 2);
      dr.open = o;
      if (vis) { bd = d; p.near = { type: 'door', id: dr.id, open: dr.open }; nd = dr; }
    }));
    if (p.near && nd && !nd.open) hint('door', 'Toque AÇÃO para abrir');
    if (p.action) { // vasculhar: parado 1 s; mexer ou afastar cancela
      const a = p.action, c = G.crates.find(c => c.id === a.id);
      if (len > 0.01 || !c || !p.near || p.near.id !== a.id) { p.action = null; G.events.push({ type: 'search', id: a.id, p: 0 }); }
      else {
        a.t += dt;
        G.events.push({ type: 'search', id: a.id, p: Math.min(1, a.t) });
        if (a.t >= 1) { // o que nao couber fica no movel; abre so quando esvazia
          p.action = null;
          const id = c.loot[0] && c.loot[0].id;
          c.loot = c.loot.filter(it => !addItem(it));
          if (!c.loot.length) { c.opened = true; G.events.push({ type: 'crateOpen', id: c.id, item: id }); }
        }
      }
    }
    if (inp.interact) {
      inp.interact = false; // borda: um toque, uma acao
      const n = p.near;
      if (n && !p.action) {
        if (n.type === 'door') {
          const dr = G.houses.flatMap(h => h.doors || []).find(d => d.id === n.id);
          if (!dr.open) { dr.open = true; G.events.push({ type: 'door', id: dr.id, open: true }); }
          else if ([p].concat(G.zombies).some(e => dBox(dr, e.x, e.y) < 1)) G.events.push({ type: 'hint', id: 'doorBusy', text: 'Saia da porta para fechar' });
          else { dr.open = false; G.events.push({ type: 'door', id: dr.id, open: false }); }
        } else if (n.type === 'tomb') {
          const c = G.crates.find(c => c.id === n.id);
          c.loot = c.loot.filter(it => !addItem(it));
          if (!c.loot.length) { c.opened = true; G.events.push({ type: 'crateOpen', id: c.id }); }
        } else {
          p.action = { type: 'search', id: n.id, t: 0 };
          G.events.push({ type: 'search', id: n.id, p: 0 });
          hint('search', 'Vasculhar leva 1 s — fique parado');
        }
      }
    }

    if (inp.attack && G.cd <= 0) playerAttack(p);

    G.zombies.forEach(z => { if (G._ls.has(z.ch)) updateZombie(z, p, dt); }); // so simula chunk carregado
    G.zombies = G.zombies.filter(z => z.hp > 0);

    G._spawn += dt;
    if (G._spawn >= 30) {
      G._spawn -= 30;
      if (G.zombies.length < 20) { const z = newZombie(); const q = randFree(15); z.x = q.x; z.y = q.y; z.ch = chOf(z); G.zombies.push(z); }
    }

    if (p.hp <= 0) die();
    if ((G._as += dt) >= 10) { G._as = 0; G.save(); }
  }

  // hash inteiro deterministico (cx,cy negativos ok)
  function hash(seed, cx, cy, extra = 0) {
    let h = seed | 0;
    for (const v of [cx, cy, extra]) { h = Math.imul(h ^ (v | 0), 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; }
    return h >>> 0;
  }
  const BLK = [[6, 6], [26, 6], [6, 26], [26, 26]]; // quarteiroes 14x14 (locais)
  // loot por movel (soma 100); gascan sai vazio (mkItem)
  const FURN = {
    fridge: [['food', 22], [null, 78]],
    cabinet: [['food', 10], ['bottle', 10], ['rag', 8], [null, 72]],
    wardrobe: [['rag', 20], ['jacket', 4], ['helmet', 2], [null, 74]],
    drawer: [['wire', 14], ['rag', 8], ['bandage', 6], ['ammo', 3], ['pistol', 1], [null, 68]],
    shelf: [['food', 18], ['rag', 6], ['bandage', 3], [null, 73]],
    box: [['food', 10], ['wire', 12], ['hose', 6], ['gascan', 6], ['rag', 8], [null, 58]],
  };
  const FD = { fridge: [0.8, 0.8], cabinet: [1.2, 0.5], wardrobe: [1.2, 0.6], drawer: [0.9, 0.5], shelf: [2, 0.7], box: [0.8, 0.8] }; // w,h do movel
  const WT = 0.2, DW = 1.4; // parede, vao
  const dBox = (b, x, y) => Math.hypot(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - y, 0, y - b.y - b.h));
  const REPO = [['rag', 30], ['food', 15], ['wire', 15], ['bottle', 10], ['bandage', 3], [null, 27]];
  const COMMON = [['rag', 55], ['food', 25], ['wire', 20]];
  function pick(r, tab) { let v = r() * 100; for (const [id, w] of tab) if ((v -= w) < 0) return id; return null; }
  function mkItem(r, id) { return id === 'gascan' ? { id, fuel: 0, qty: 1 } : id === 'ammo' ? { id, qty: 3 + Math.floor(r() * 4) } : { id, qty: 1 }; }

  // pura: so le G.seed. Tudo em coordenadas de mundo.
  function gen(cx, cy) {
    const r = mulberry32(hash(G.seed, cx, cy)), ox = cx * CH, oy = cy * CH, ch = cx + ',' + cy;
    const origin = cx === 0 && cy === 0, near = Math.abs(cx) + Math.abs(cy) === 1;
    let n = 0; const nid = () => ch + ':' + n++;
    const o = { roads: [], houses: [], crates: [], zombies: [], cars: [], trees: [], fences: [] };
    for (const k of [0, 20]) { o.roads.push({ x: ox + k, y: oy, w: 6, h: CH }, { x: ox, y: oy + k, w: CH, h: 6 }); }
    const hs = [], inH = (x, y, m) => hs.some(h => x > h.x - m && x < h.x + h.w + m && y > h.y - m && y < h.y + h.h + m);
    // casa 5-8 m no quarteirao b, encostada (folga 1,5-2,2) numa rua; side = parede da rua (porta)
    function place(b) {
      const [bx, by] = BLK[b];
      for (let i = 0; i < 30; i++) {
        const w = 5 + r() * 3, h = 5 + r() * 3, side = Math.floor(r() * 4), gap = 1.5 + r() * 0.7;
        const x = side < 2 ? (side === 0 ? bx + gap : bx + 14 - gap - w) : bx + 1.5 + r() * (11 - w);
        const y = side >= 2 ? (side === 2 ? by + gap : by + 14 - gap - h) : by + 1.5 + r() * (11 - h);
        if (!hs.every(q => x > q.x + q.w + 1.5 || x + w < q.x - 1.5 || y > q.y + q.h + 1.5 || y + h < q.y - 1.5)) continue;
        const dd = [x - bx, bx + 14 - x - w, y - by, by + 14 - y - h]; // porta na parede da rua mais proxima (bordas do quarteirao)
        hs.push({ x, y, w, h, side: dd.indexOf(Math.min(...dd)) });
        return true;
      }
      return false;
    }
    // planta (2-4 comodos) + paredes + porta + moveis de uma casa; tenta de novo se algum comodo/movel ficar inalcancavel
    function build(q) {
      let o;
      for (let tr = 0; tr < 12; tr++) { o = plan(q); if (o.ok) break; }
      return o;
    }
    function plan(q) {
      const { x, y, w, h, side } = q, X1 = x + w, Y1 = y + h, id = nid();
      const fx = x + w * (0.4 + r() * 0.2), fy = y + h * (0.4 + r() * 0.2), mode = Math.floor(r() * 4), half = r() < 0.5;
      const dv = [], rooms = [], R4 = (x0, y0, x1, y1) => rooms.push({ x0, y0, x1, y1 });
      if (mode !== 1) dv.push({ v: true, pos: fx, a: y + WT, b: Y1 - WT });
      if (mode === 1) dv.push({ v: false, pos: fy, a: x + WT, b: X1 - WT });
      if (mode >= 2 && (mode === 2 || !half)) dv.push({ v: false, pos: fy, a: x + WT, b: fx });
      if (mode >= 2 && (mode === 2 || half)) dv.push({ v: false, pos: fy, a: fx, b: X1 - WT });
      if (mode === 0) { R4(x, y, fx, Y1); R4(fx, y, X1, Y1); }
      else if (mode === 1) { R4(x, y, X1, fy); R4(x, fy, X1, Y1); }
      else if (mode === 2) { R4(x, y, fx, fy); R4(x, fy, fx, Y1); R4(fx, y, X1, fy); R4(fx, fy, X1, Y1); }
      else if (!half) { R4(x, y, fx, fy); R4(x, fy, fx, Y1); R4(fx, y, X1, Y1); }
      else { R4(x, y, fx, Y1); R4(fx, y, X1, fy); R4(fx, fy, X1, Y1); }
      const parts = [], gaps = [];
      const seg = (v, pos, a, b, t) => { if (b - a > 0.01) parts.push(v ? { x: pos - t / 2, y: a, w: t, h: b - a } : { x: a, y: pos - t / 2, w: b - a, h: t }); };
      // divisorias: 1 vao de 1,4 m, longe do encontro com outra divisoria
      for (const d of dv) {
        const js = dv.filter(e => e.v !== d.v && e.a <= d.pos && e.b >= d.pos).map(e => e.pos);
        let g = (d.a + d.b) / 2, bs = -1;
        for (let i = 0; i < 16; i++) {
          const c = d.a + DW / 2 + 0.1 + r() * Math.max(0, d.b - d.a - DW - 0.2), sc = Math.min(1.3, ...js.map(j => Math.abs(c - j)));
          if (sc > bs) { bs = sc; g = c; }
        }
        seg(d.v, d.pos, d.a, g - DW / 2, WT); seg(d.v, d.pos, g + DW / 2, d.b, WT);
        gaps.push(d.v ? { x: d.pos, y: g } : { x: g, y: d.pos });
      }
      // porta externa na parede da rua, longe das divisorias que a tocam
      const vw = side < 2, lo = vw ? y : x, len = vw ? h : w;
      const tj = dv.filter(d => d.v !== vw && (vw ? (side === 0 ? d.a <= x + WT + 1e-6 : d.b >= X1 - WT - 1e-6) : true)).map(d => d.pos);
      let c = lo + len / 2, bs = -1;
      for (let i = 0; i < 20; i++) {
        const t = lo + 0.8 + r() * (len - 1.6), sc = Math.min(1.3, ...tj.map(j => Math.abs(t - j)));
        if (sc > bs) { bs = sc; c = t; }
      }
      const did = nid(), dr = vw ? { id: did, x: side ? X1 - WT : x, y: c - DW / 2, w: WT, h: DW, open: true } : { id: did, x: c - DW / 2, y: side === 3 ? Y1 - WT : y, w: DW, h: WT, open: true };
      parts.push(Object.assign({ door: did }, { x: dr.x, y: dr.y, w: dr.w, h: dr.h }));
      gaps.push({ x: dr.x + dr.w / 2, y: dr.y + dr.h / 2 });
      const wall = (sx, sy, sw, sh) => { if (sw > 0.01 && sh > 0.01) parts.push({ x: sx, y: sy, w: sw, h: sh }); };
      // topo/base de largura cheia; esquerda/direita entre elas
      if (side === 2) { wall(x, y, c - DW / 2 - x, WT); wall(c + DW / 2, y, X1 - c - DW / 2, WT); } else wall(x, y, w, WT);
      if (side === 3) { wall(x, Y1 - WT, c - DW / 2 - x, WT); wall(c + DW / 2, Y1 - WT, X1 - c - DW / 2, WT); } else wall(x, Y1 - WT, w, WT);
      if (side === 0) { wall(x, y + WT, WT, c - DW / 2 - y - WT); wall(x, c + DW / 2, WT, Y1 - WT - c - DW / 2); } else wall(x, y + WT, WT, h - 2 * WT);
      if (side === 1) { wall(X1 - WT, y + WT, WT, c - DW / 2 - y - WT); wall(X1 - WT, c + DW / 2, WT, Y1 - WT - c - DW / 2); } else wall(X1 - WT, y + WT, WT, h - 2 * WT);
      // moveis: gaveteiro no comodo da porta, geladeira+armario no 1o outro (cozinha), guarda-roupa nos demais
      const inn = vw ? [side ? X1 - WT - 0.3 : x + WT + 0.3, c] : [c, side === 3 ? Y1 - WT - 0.3 : y + WT + 0.3];
      const dRoom = rooms.find(m => inn[0] >= m.x0 && inn[0] <= m.x1 && inn[1] >= m.y0 && inn[1] <= m.y1) || rooms[0];
      const kit = rooms.find(m => m !== dRoom);
      const want = [[dRoom, 'drawer'], [kit, 'fridge'], [kit, 'cabinet']].concat(rooms.filter(m => m !== dRoom && m !== kit).map(m => [m, 'wardrobe']));
      const furn = [];
      for (const [m, kind] of want) {
        const I = { x0: m.x0 + (m.x0 === x ? WT : WT / 2), x1: m.x1 - (m.x1 === X1 ? WT : WT / 2), y0: m.y0 + (m.y0 === y ? WT : WT / 2), y1: m.y1 - (m.y1 === Y1 ? WT : WT / 2) };
        for (let i = 0; i < 24; i++) {
          const s = Math.floor(r() * 4), hz = s < 2, [fw, fh] = FD[kind], bw = hz ? fw : fh, bh = hz ? fh : fw;
          if (bw > I.x1 - I.x0 || bh > I.y1 - I.y0) continue;
          const bx = hz ? I.x0 + r() * (I.x1 - I.x0 - bw) : s === 2 ? I.x0 : I.x1 - bw, by = hz ? (s === 0 ? I.y0 : I.y1 - bh) : I.y0 + r() * (I.y1 - I.y0 - bh);
          const b = { x: bx, y: by, w: bw, h: bh };
          if (gaps.some(g => dBox(b, g.x, g.y) < 1.2) || furn.some(f => bx < f.x + f.w && bx + bw > f.x && by < f.y + f.h && by + bh > f.y)) continue;
          furn.push({ id: nid(), ch, x: bx + bw / 2, y: by + bh / 2, w: bw, h: bh, kind, opened: false, loot: [], tomb: false, _b: b });
          break;
        }
      }
      const hh = { id, ch, x, y, w, h, kind: 'house', pal: Math.floor(r() * 3), roof: r() < 0.5 ? '4' : '2', parts, gaps, doors: [dr], rooms, furn };
      hh.ok = furn.length >= 3 && reach(hh, [vw ? (side ? X1 + 1 : x - 1) : c, vw ? c : (side === 3 ? Y1 + 1 : y - 1)]);
      return hh;
    }
    // BFS em grade 0,25 m com raio 0,4 (mesma regra de free): cada comodo e cada movel alcancaveis a partir de fora da porta
    function reach(hh, st) {
      const S = 0.25, x0 = hh.x - 1.5, y0 = hh.y - 1.5, nx = Math.ceil((hh.w + 3) / S), ny = Math.ceil((hh.h + 3) / S), seen = new Uint8Array(nx * ny);
      const ok = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !hitHouse(hh, hh.furn, x0 + (i + 0.5) * S, y0 + (j + 0.5) * S, R);
      const si = Math.floor((st[0] - x0) / S), sj = Math.floor((st[1] - y0) / S), qu = [[si, sj]];
      seen[sj * nx + si] = 1;
      for (let k = 0; k < qu.length; k++) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = qu[k][0] + di, j = qu[k][1] + dj;
        if (ok(i, j) && !seen[j * nx + i]) { seen[j * nx + i] = 1; qu.push([i, j]); }
      }
      const cells = qu.map(([i, j]) => [x0 + (i + 0.5) * S, y0 + (j + 0.5) * S]);
      return hh.rooms.every(m => cells.some(([px, py]) => px > m.x0 + WT && px < m.x1 - WT && py > m.y0 + WT && py < m.y1 - WT))
        && hh.furn.every(f => cells.some(([px, py]) => Math.hypot(px - f.x, py - f.y) <= 1.3));
    }
    BLK.forEach((_, b) => {
      const v = r(), k = origin ? (b === 0 || b === 3 ? 1 : 0) : v < 0.3 ? 0 : v < 0.7 ? 1 : 2;
      for (let j = 0; j < k && hs.length < 6; j++) place(b);
    });
    let wantCar = !origin && (near || r() < 0.15);
    if (!origin && !hs.length) { if (near) for (let b = Math.floor(r() * 4); !hs.length; b = (b + 1) % 4) place(b); else wantCar = false; }
    // carro na rua, fora do cruzamento, alinhado a rua
    let car = null;
    if (wantCar) {
      const vert = r() < 0.5, lane = (r() < 0.5 ? 3 : 23) + (r() - 0.5), seg = r() < 0.5 ? 6 : 26, along = seg + 2.6 + r() * 8.8;
      car = { id: nid(), ch, x: vert ? lane : along, y: vert ? along : lane, dir: vert ? Math.PI / 2 : 0, speed: 0, fuel: Math.round((2 + r() * 8) * 10) / 10, trunk: [] };
      o.cars.push(car);
    }
    // casas (planta, paredes, porta) e moveis-conteiner; chave e garantias de (0,0) no 1o movel da casa
    const keyAt = car ? Math.floor(r() * hs.length) : -1;
    o.houses = hs.map((q, i) => {
      const hh = build(q), c = hh.doors[0], vw = q.side < 2;
      q.cx = c.x + c.w / 2 + (vw ? (q.side ? 0.6 : -0.6) : 0); q.cy = c.y + c.h / 2 + (vw ? 0 : (q.side === 3 ? 0.6 : -0.6)); // ponto fora da porta (guarda)
      hh.furn.forEach((f, j) => {
        f.loot = [mkItem(r, pick(r, FURN[f.kind]))].filter(it => it.id);
        if (j === 0 && origin) f.loot = [mkItem(r, i === 0 ? 'gascan' : 'hose')];
        if (j === 0 && i === keyAt) f.loot = [{ id: 'key', car: car.id, qty: 1 }];
        delete f._b; o.crates.push(f);
      });
      if (r() < 0.5) for (let t = 0; t < 20; t++) { // guarda interno: ponto livre num comodo qualquer (todos alcancaveis)
        const m = hh.rooms[Math.floor(r() * hh.rooms.length)], zx = m.x0 + 0.7 + r() * (m.x1 - m.x0 - 1.4), zy = m.y0 + 0.7 + r() * (m.y1 - m.y0 - 1.4);
        if (!hitHouse(hh, hh.furn, zx, zy, 0.6)) { q.iz = [zx, zy]; break; }
      }
      delete hh.rooms; delete hh.furn; delete hh.ok;
      return hh;
    });
    // zumbis: 1 guarda a <=3 m do 1o bau + 1-3 vagantes (<=4)
    const zOk = (x, y, m) => x > 1 && x < 39 && y > 1 && y < 39 && !inH(x, y, m) && !o.cars.some(c => { const b = carBox(c); return x > b.x - 1 && x < b.x + b.w + 1 && y > b.y - 1 && y < b.y + b.h + 1; }) && (!origin || Math.hypot(x - 23, y - 23) > 10);
    const zs = [], addZ = (x, y) => {
      const police = r() < 0.05, runner = !police && r() < 0.2;
      const dropId = police ? (r() < 0.7 ? 'ammo' : 'pistol') : r() < 0.2 ? pick(r, COMMON) : null;
      o.zombies.push({ id: nid(), ch, x, y, hp: 60, state: 'idle', alert: 0, atk: 0, runner, police, drop: dropId && mkItem(r, dropId) });
      zs.push([x, y]);
    };
    if (hs.length && hs[0].iz && (!origin || Math.hypot(hs[0].iz[0] - 23, hs[0].iz[1] - 23) > 10)) addZ(hs[0].iz[0], hs[0].iz[1]);
    else if (hs.length) for (let i = 0; i < 10; i++) {
      const a = r() * 6.283, d = 1.5 + r() * 1.5, x = hs[0].cx + Math.cos(a) * d, y = hs[0].cy + Math.sin(a) * d;
      if (zOk(x, y, 0.6)) { addZ(x, y); break; }
    }
    for (let k = 1 + Math.floor(r() * 3); k > 0; k--) for (let i = 0; i < 20; i++) {
      const x = 1 + r() * 38, y = 1 + r() * 38;
      if (zOk(x, y, 1)) { addZ(x, y); break; }
    }
    // decoracao: arvores (1-2 por quarteirao) e cercas baixas
    const far = (x, y, m) => !inH(x, y, m) && hs.every(h => Math.hypot(x - h.cx, y - h.cy) > 1.2) && zs.every(z => Math.hypot(x - z[0], y - z[1]) > 1);
    const trees = [];
    BLK.forEach(([bx, by]) => {
      for (let k = 1 + (r() < 0.5 ? 1 : 0); k > 0; k--) for (let i = 0; i < 10; i++) {
        const x = bx + 1 + r() * 12, y = by + 1 + r() * 12;
        if (far(x, y, 1)) { trees.push({ x, y }); break; }
      }
      if (r() < 0.25) for (let i = 0; i < 10; i++) {
        const hz = r() < 0.5, len = 3 + r() * 2, x = bx + 1 + r() * (hz ? 12 - len : 12), y = by + 1 + r() * (hz ? 12 : 12 - len);
        const w = hz ? len : 0.2, h = hz ? 0.2 : len;
        if (far(x, y, 1) && far(x + w, y + h, 1) && far(x + w / 2, y + h / 2, 1) && trees.every(t => Math.hypot(x + w / 2 - t.x, y + h / 2 - t.y) > len / 2 + 0.6)) { o.fences.push({ x, y, w, h }); break; }
      }
    });
    o.trees = trees;
    // local -> mundo (roads ja nascem em mundo)
    const sh = e => { e.x += ox; e.y += oy; return e; };
    [o.houses, o.crates, o.zombies, o.trees, o.fences].forEach(l => l.forEach(sh));
    o.houses.forEach(h => [h.parts, h.gaps, h.doors].forEach(l => l.forEach(sh)));
    // porta encostada na parede leste/sul: soma exata em float (x+w === h.x+h.w) para testes de borda
    o.houses.forEach(h => { const d = h.doors[0], pd = h.parts.find(q => q.door); for (const [p, l, T] of [['x', 'w', h.x + h.w], ['y', 'h', h.y + h.h]]) {
      if (Math.abs(d[p] + d[l] - T) > 1e-6) continue;
      d[l] = pd[l] = T - d[p]; } }); // Sterbenz: a subtracao e exata, logo x + w === T
    o.cars.forEach(c => { c.x += ox; c.y += oy; });
    return o;
  }

  // ---- chunks: referencia com histerese, fila, load/unload com diff ----
  const LISTS = ['houses', 'crates', 'zombies', 'cars', 'roads', 'trees', 'fences'];
  const parse = k => k.split(',').map(Number);
  const drivenIds = () => G.players.map(p => p.car).filter(Boolean); // shortcut: players[i].car ainda nao existe (fase carro); undefined => nada protegido
  const strip = e => { const c = Object.assign({}, e); delete c.ch; delete c.way; delete c.side; delete c.rc; delete c.bang; delete c.last; delete c.pw; delete c.ck; delete c.fl; return c; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function syncCh() { for (const l of [G.zombies, G.cars]) for (const e of l) e.ch = chOf(e); }
  function want(rx, ry) { const w = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) w.push((rx + dx) + ',' + (ry + dy)); return w; }
  // referencia so muda com o jogador >= 6 m dentro do novo chunk (por eixo)
  function checkRef(p) {
    const px = Math.floor(p.x / CH), py = Math.floor(p.y / CH), key = px + ',' + py;
    if (key !== G._pk) { G._pk = key; if (!G.explored.includes(key)) G.explored.push(key); }
    let [rx, ry] = G.ref;
    const inner = (v, c, r) => c > r ? v - c * CH : (c + 1) * CH - v;
    if (px !== rx && inner(p.x, px, rx) >= 6) rx = px;
    if (py !== ry && inner(p.y, py, ry) >= 6) ry = py;
    if (rx === G.ref[0] && ry === G.ref[1]) return;
    G.ref = [rx, ry];
    const w = want(rx, ry); // refaz a fila inteira: loads antes de unloads
    G.queue = w.filter(k => !G._ls.has(k)).map(key => ({ op: 'load', key }))
      .concat(G.loaded.filter(k => !w.includes(k)).map(key => ({ op: 'unload', key })));
  }
  function load(key) {
    const [cx, cy] = parse(key), g = gen(cx, cy), d = G.chunks[key] || {};
    const dd0 = d.doors || {}, dc = d.crates || {}, dz = d.zombies || {}, dk = d.cars || {};
    const has = (l, id) => l.some(e => e.id === id);
    if (d.visit !== undefined && Math.floor(G.t / 60) - d.visit >= 60) { // reposicao: bau aberto comum volta com 1 item; zumbis mortos renascem
      const r = mulberry32(hash(G.seed, cx, cy, d.visit));
      for (const c of g.crates) if (dc[c.id] && dc[c.id].opened && !c.loot.some(i => ['key', 'gascan', 'hose'].includes(i.id)) && c.kind !== 'shelf' && c.kind !== 'box')
        dc[c.id] = { opened: false, loot: [mkItem(r, pick(r, REPO))].filter(i => i.id) };
      for (const z of g.zombies) if (dz[z.id] === null) delete dz[z.id]; // shortcut: se o zumbi saiu para outro chunk, duplica; aceitavel
    }
    const tag = l => l.forEach(e => { e.ch = key; });
    for (const k of ['roads', 'trees', 'fences']) { tag(g[k]); G[k].push(...g[k]); }
    g.houses.forEach(h => h.doors.forEach(dr => { if (dr.id in dd0) dr.open = dd0[dr.id]; }));
    G.houses.push(...g.houses);
    g.crates.forEach(c => { if (dc[c.id]) Object.assign(c, dc[c.id]); G.crates.push(c); });
    for (const id in dc) if (!g.crates.some(c => c.id === id)) G.crates.push(Object.assign({ id, ch: key }, dc[id])); // tumbas
    g.zombies.forEach(z => { if (dz[z.id] === null || has(G.zombies, z.id)) return; G.zombies.push(Object.assign(z, dz[z.id])); });
    g.cars.forEach(c => { if (dk[c.id] === null || has(G.cars, c.id)) return; G.cars.push(Object.assign(c, dk[c.id])); });
    for (const [dd, l, b, def] of [[dz, G.zombies, g.zombies, { state: 'idle', alert: 0, atk: 0 }], [dk, G.cars, g.cars, { speed: 0 }]]) // estrangeiras
      for (const id in dd) if (dd[id] && !b.some(e => e.id === id) && !has(l, id)) l.push(Object.assign({}, def, dd[id], { ch: key }));
    G.events.push({ type: 'chunkLoad', key });
  }
  // diff do chunk (sem descarregar); null se igual ao gen
  function diffOf(key) {
    const [cx, cy] = parse(key), g = gen(cx, cy), keep = drivenIds(), d = { crates: {}, cars: {}, zombies: {}, doors: {} };
    G.houses.forEach(h => { if (h.ch === key) h.doors.forEach(dr => { if (dr.open !== g.houses.find(q => q.id === h.id).doors.find(q => q.id === dr.id).open) d.doors[dr.id] = dr.open; }); });
    G.crates.forEach(c => {
      if (c.ch !== key) return;
      const b = g.crates.find(q => q.id === c.id);
      if (!b) d.crates[c.id] = strip(c);
      else if (c.opened !== b.opened || !same(c.loot, b.loot)) d.crates[c.id] = { opened: c.opened, loot: c.loot };
    });
    for (const [l, b, o, f] of [[G.zombies, g.zombies, d.zombies, ['x', 'y', 'hp']], [G.cars, g.cars, d.cars, ['x', 'y', 'dir', 'fuel', 'trunk']]]) {
      l.forEach(e => {
        if (e.ch !== key || keep.includes(e.id)) return;
        const q = b.find(z => z.id === e.id);
        if (!q) o[e.id] = strip(e);
        else if (f.some(k => !same(e[k], q[k]))) o[e.id] = Object.fromEntries(f.map(k => [k, e[k]]));
      });
      b.forEach(q => { if (!l.some(e => e.id === q.id && (e.ch === key || keep.includes(e.id)))) o[q.id] = null; }); // morto ou saiu
    }
    for (const k of ['crates', 'cars', 'zombies', 'doors']) if (!Object.keys(d[k]).length) delete d[k];
    if (!Object.keys(d).length) return null;
    d.visit = Math.floor(G.t / 60);
    return d;
  }
  function unload(key) {
    const keep = drivenIds(), d = diffOf(key);
    if (d) G.chunks[key] = d; else delete G.chunks[key];
    const out = e => e.ch !== key || keep.includes(e.id);
    for (const k of LISTS) G[k] = G[k].filter(out);
    G.events.push({ type: 'chunkUnload', key });
  }
  function pump() { // no maximo 1 item da fila por update
    syncCh();
    const it = G.queue.shift();
    if (!it) return;
    const i = G.loaded.indexOf(it.key);
    if (it.op === 'load' && i < 0) { G.loaded.push(it.key); G._ls.add(it.key); load(it.key); G.chunkGen++; }
    else if (it.op === 'unload' && i >= 0) { unload(it.key); G.loaded.splice(i, 1); G._ls.delete(it.key); G.chunkGen++; }
  }

  // novo mundo (st undefined) ou estado salvo
  function start(seed, slot, st) {
    st = st || {};
    G.seed = seed; G.slot = slot;
    rng = mulberry32(seed);
    G.t = st.t > 0 ? st.t : 0; G.dead = false; G.cd = 0; G.nextId = st.nextId > 0 ? st.nextId : 0;
    G._hunger = G._starve = G._spawn = G._as = 0;
    G.hints = st.hints || {}; G.chunks = st.chunks || {};
    G.events = []; G.queue = []; G.loaded = []; G._ls = new Set(); G.chunkGen = 0;
    const s0 = (st.players && st.players[0]) || {}, num = (v, d) => Number.isFinite(v) ? v : d;
    const p = G.player = { x: num(s0.x, 23), y: num(s0.y, 23), dir: num(s0.dir, 0), hp: num(s0.hp, 100), hunger: num(s0.hunger, 100),
      inv: s0.inv || [{ id: 'ammo', qty: 16 }], weapon: s0.weapon || 'pipe', equip: s0.equip || {}, car: s0.car || null,
      input: { mx: 0, my: 0, attack: false, interact: false }, near: null, inside: null, action: null };
    Object.defineProperty(p, 'ammo', { get() { return ammoOf(p); } }); // compat 0.1: ui.js le p.ammo
    G.players = [p]; G.input = p.input;
    p.inside = null; // recalculado no 1o step
    const rx = Math.floor(p.x / CH), ry = Math.floor(p.y / CH);
    G.ref = [rx, ry]; G._pk = rx + ',' + ry;
    G.explored = Array.isArray(st.explored) ? st.explored : []; if (!G.explored.includes(G._pk)) G.explored.push(G._pk);
    for (const k of LISTS) G[k] = [];
    want(rx, ry).forEach(k => { G.loaded.push(k); G._ls.add(k); load(k); });
    G.events = [];
  }

  const G = window.G = {
    t: 0, map: { chunk: CH }, nextId: 0, ref: [0, 0], chunkGen: 0, _ls: new Set(), _pk: '',
    chunks: {}, loaded: [], queue: [], explored: [], roads: [], cars: [], trees: [], fences: [], gen, loot: FURN, free,
    seed: 0, players: [], input: null, // compat 0.1: alias de players[0].input
    player: null, zombies: [], crates: [], houses: [], events: [],
    dead: false, slot: 1, hints: {}, _as: 0, _dead: 0, cd: 0, _hunger: 0, _starve: 0, _spawn: 0,

    init(seed, slot) { start(seed ?? Date.now(), slot || 1); },

    save() {
      try {
        const chunks = Object.assign({}, G.chunks);
        for (const k of G.loaded) { const d = diffOf(k); if (d) chunks[k] = d; else delete chunks[k]; }
        const pl = G.players.map(({ x, y, dir, hp, hunger, inv, weapon, equip, car }) => ({ x, y, dir, hp, hunger, inv, weapon, equip, car }));
        localStorage['zl1:s' + G.slot] = JSON.stringify({ v: 2, seed: G.seed, t: G.t, nextId: G.nextId, players: pl, hints: G.hints, explored: G.explored, chunks });
      } catch (e) {
        if (typeof localStorage !== 'undefined') G.events.push({ type: 'hint', id: 'saveFull', text: 'Save cheio' }); // sem localStorage: silencio
      }
    },
    read(slot) {
      try { const o = JSON.parse(localStorage['zl1:s' + slot]); return o && o.v === 2 && Number.isFinite(o.seed) ? o : null; } catch (e) { return null; }
    },
    load(slot) {
      const o = G.read(slot);
      if (!o) return false;
      start(o.seed, slot, o);
      return true;
    },
    slots() { return [1, 2, 3].map(slot => { const o = G.read(slot); return o && { slot, seed: o.seed, t: o.t || 0 }; }); },
    wipe(slot) { try { delete localStorage['zl1:s' + slot]; } catch (e) {} },
    respawn() { G.dead = false; },

    update(dt) {
      G.events = []; // compat 0.1: contrato manda UI limpar, mas ui.js atual nao limpa
      dt = Math.min(dt, 0.25);
      syncCh();
      if (G.dead && (G._dead -= dt) <= 0) G.dead = false;
      while (dt > 1e-9 && !G.dead) { const h = Math.min(dt, 0.05); step(h); dt -= h; }
      pump();
    },

    useItem(slot) {
      const p = G.player, s = p.inv[slot];
      if (G.dead || !s) return;
      if (s.id === 'food') p.hunger = Math.min(100, p.hunger + 30);
      else if (s.id === 'bandage') p.hp = Math.min(100, p.hp + 25);
      else return;
      if (--s.qty <= 0) p.inv.splice(slot, 1);
    },
    switchWeapon() { G.player.weapon = G.player.weapon === 'pipe' ? 'pistol' : 'pipe'; },
    restart() { G.init(G.seed, G.slot); },
  };
})();
