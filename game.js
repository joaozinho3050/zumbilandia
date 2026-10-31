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
  function free(x, y, m, skipId) {
    m = m === undefined ? R : m;
    return !G.houses.some(h => hitHouse(h, G.crates, x, y, m)) && !G.cars.some(c => c.id !== skipId && inBox(carBox(c), x, y, m)) && !G.trees.some(t => Math.hypot(x - t.x, y - t.y) < 0.4 + m) && !G.fences.some(f => inBox(f, x, y, m)); // cercas por ultimo
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
    const p = randFree(25);
    return { id: 'p:' + G.nextId++, ch: chOf(p), x: p.x, y: p.y, hp: 60, state: 'idle', alert: 0, atk: 0, runner: rng() < 0.2, police: false };
  }

  const STACK = { food: 5, bandage: 5, rag: 10, wire: 10, ammo: 24, bottle: 3 };
  const BAG = { bag_school: 4, bag_hiking: 8, bag_military: 12 }; // espacos extras da mochila equipada (equip.back)
  const capOf = p => 8 + ((p.equip && p.equip.back && BAG[p.equip.back.id]) || 0);
  // poe ate q unidades de it em list (limite cap slots; empilha ate STACK); devolve quantas coube
  function put(list, cap, it, q) {
    const max = STACK[it.id] || 1; let left = q;
    if (STACK[it.id]) for (const s of list) if (s.id === it.id && s.qty < max && left > 0) { const n = Math.min(left, max - s.qty); s.qty += n; left -= n; }
    while (left > 0 && list.length < cap) { const n = Math.min(left, max); list.push(Object.assign({}, it, { qty: n })); left -= n; }
    return q - left;
  }
  // item {id,qty,...}: coleta o que cabe e deixa o resto em item.qty; true so se coletou tudo (senao evento full)
  function addItem(item) {
    const p = G.player, q = item.qty === undefined ? 1 : item.qty;
    if (DUR[item.id]) hint('armor', 'Armadura: abra Equipar no MENU para vestir', 'armor');
    item.qty = q - put(p.inv, capOf(p), item, q);
    if (item.qty > 0) G.events.push({ type: 'full' });
    return item.qty === 0;
  }
  const DUR = { helmet: 20, jacket: 20, shinguards: 10 }, PART = { helmet: 'head', jacket: 'torso', shinguards: 'legs', bag_school: 'back', bag_hiking: 'back', bag_military: 'back' };
  const RECIPES = [{ id: 'pipe_r', out: 'pipe_r', ing: [{ id: 'pipe', qty: 1 }, { id: 'wire', qty: 1 }] },
    { id: 'molotov', out: 'molotov', ing: [{ id: 'bottle', qty: 1 }, { id: 'rag', qty: 1 }, { id: 'gascan', qty: 1, keep: true, fuel: 2 }] }]; // galao fica, gasta 2 L
  // shortcut: o cano inicial nao e item da mochila; conta como 1 pipe disponivel (nao e consumido), ate haver loot de pipe
  const countOf = (p, id) => p.inv.reduce((n, i) => n + (i.id === id ? i.qty : 0), 0);
  const avail = (p, id) => countOf(p, id) + (id === 'pipe' ? 1 : 0);
  function take(p, id, q) { for (let k = p.inv.length - 1; k >= 0 && q > 0; k--) { const s = p.inv[k]; if (s.id !== id) continue; const n = Math.min(q, s.qty); s.qty -= n; q -= n; if (s.qty <= 0) p.inv.splice(k, 1); } }
  const canFuel = (p, x) => p.inv.find(i => i.id === x.id && (i.fuel || 0) >= x.fuel); // ingrediente com litros
  const ammoOf = p => p.inv.reduce((n, i) => n + (i.id === 'ammo' ? i.qty : 0), 0);

  function hint(id, text, guia) { if (!G.hints[id]) { G.hints[id] = 1; G.events.push(guia ? { type: 'hint', id, text, guia } : { type: 'hint', id, text }); } }
  // anim do jogador: act dura ACT[act] s (search dura enquanto p.action; dead ate renascer)
  const ACT = { swing: 0.25, shot: 0.15, eat: 0.6, heal: 0.6, equip: 0.4, craft: 0.8, pick: 0.4, drop: 0.4, hurt: 0.3, windup: 1.0, jump: 0.6, climb: 2, throw: 0.4 };
  function setAct(p, act) { if (p.anim.act === 'dead' && act !== 'dead') return; p.anim.act = act; p.anim.t = 0; }
  function setCrouch(p, on) { if (p.crouch !== on) { p.crouch = on; G.events.push({ type: 'crouch', on }); } }

  // conteiner aberto/alvo {type,id} -> {e, list, cap}; cap: movel 6, gondola 8, porta-malas 10, tumba ilimitada
  function contOf(o) {
    if (!o) return null;
    const e = (o.type === 'trunk' ? G.cars : G.crates).find(c => c.id === o.id);
    return e && { e, list: o.type === 'trunk' ? e.trunk : e.loot, cap: o.type === 'trunk' ? 10 : e.tomb ? Infinity : e.kind === 'shelf' ? 8 : 6 };
  }

  function bagFull() { G.events.push({ type: 'hint', id: 'bag', text: 'Esvazie os espaços extras antes de tirar a mochila', guia: 'bag' }); return false; }
  function die() {
    const p = G.player, car = p.car && G.cars.find(c => c.id === p.car), pt = car && exitPoint(car), at = pt || p, ch = chOf(at);
    const tomb = { id: ch + ':t:' + G.nextId++, ch, x: at.x, y: at.y, opened: false, tomb: true,
      loot: p.inv.concat(Object.values(p.equip || {}).filter(i => i && !(i.dur <= 0))).map(i => Object.assign({}, i)) };
    if (G._ls.has(ch)) G.crates.push(tomb); // senao (raro) vai direto ao diff do chunk
    else { const d = G.chunks[ch] = G.chunks[ch] || { visit: Math.floor(G.t / 60) }; (d.crates = d.crates || {})[tomb.id] = strip(tomb); }
    if (car) { car.speed = 0; if (pt) car.dir = pt.d; G.events.push({ type: 'engine', on: false, id: car.id }); }
    p._eng = false;
    Object.assign(p, { x: 23, y: 23, hp: 100, hunger: 100, inv: [{ id: 'food', qty: 1 }], weapon: 'pipe', equip: {}, car: null, action: null, near: null, open: null }); // mochila (equip.back) ja foi para a tumba
    G._hunger = G._starve = 0;
    Object.assign(p, { stamina: 100, crouch: false, running: false, noise: 0 }); G._hp = 100; G._rw = false;
    setAct(p, 'dead');
    G.dead = true; G._dead = 2; // UI mostra "Voce morreu" por 2 s; update destrava sozinho (ou G.respawn())
    G.events.push({ type: 'death' });
    hint('tomb', 'Sua tumba guarda seus itens — veja o ponto vermelho no Mapa', 'tomb');
    G.save();
  }

  // ponto livre para sair do carro (dir arredondada a 90 graus): lateral +-1,5 m, depois 2,8 e 3 m atras; null se nenhum
  // shortcut: nao testa se o carro girado ate o multiplo de 90 graus invade algo
  function exitPoint(car) {
    const d = Math.round(car.dir / (Math.PI / 2)) * Math.PI / 2, c = Math.cos(car.dir), s = Math.sin(car.dir); // offsets pelo dir real
    for (const [ox, oy] of [[-s * 1.5, c * 1.5], [s * 1.5, -c * 1.5], [-c * 2.8, -s * 2.8], [-c * 3, -s * 3]])
      if (free(car.x + ox, car.y + oy, 0.3, car.id)) return { x: car.x + ox, y: car.y + oy, d };
    return null;
  }
  function enterCar(p, id) {
    const car = G.cars.find(c => c.id === id);
    if (!car) return;
    if (!p.inv.some(i => i.id === 'key' && i.car === id)) { G.events.push({ type: 'noKey', id }); hint('nokey', 'Precisa da chave deste carro — procure nas casas próximas', 'key'); return; }
    setCrouch(p, false);
    Object.assign(p, { car: id, action: null, near: null, x: car.x, y: car.y, dir: car.dir, running: false });
    car.speed = 0; p._eng = car.fuel > 0; p._stop = 0;
    G.events.push({ type: 'enter', id });
    if (p._eng) G.events.push({ type: 'engine', on: true, id });
    hint('engine', p._eng ? 'Motor ligado — joystick para frente acelera, para trás freia e dá ré' : 'Sem gasolina o motor não liga — ache gasolina (sifão)', p._eng ? 'car' : 'siphon');
  }
  function exitCar(p, car) {
    const e = exitPoint(car);
    if (!e) { hint('exitBlocked', 'Sem espaço para sair — manobre o carro', 'car'); return; }
    Object.assign(car, { dir: e.d, speed: 0 }); Object.assign(p, { x: e.x, y: e.y, car: null, dir: e.d });
    G.events.push({ type: 'exit', id: car.id });
    if (p._eng) { p._eng = false; G.events.push({ type: 'engine', on: false, id: car.id }); }
  }
  const approach = (v, t, s) => v > t ? Math.max(t, v - s) : Math.min(t, v + s);
  // mx = volante, my = acelerador (+ acelera, - freia/re); um passo dt <= 0,05
  function driveCar(p, car, mx, my, dt) {
    let v = car.speed || 0;
    const on = car.fuel > 0;
    if (!on && p._eng) { p._eng = false; G.events.push({ type: 'engine', on: false, id: car.id }); } // tanque zerado por fora (sifao)
    p._stop = Math.abs(v) < 0.1 ? (p._stop || 0) + dt : 0;
    if (!on) v = approach(v, 0, 8 * dt);
    else if (my > 0.05) v = v >= 0 ? Math.min(11, v + 4 * my * dt) : Math.min(0, v + 8 * dt);
    else if (my < -0.05) v = v > 0.05 ? Math.max(0, v - 8 * dt) : v < -0.05 || p._stop >= 0.4 ? Math.max(-3, v + 4 * my * dt) : 0;
    else v = approach(v, 0, 1.5 * dt);
    const br = on && my < -0.05 && v > 3;
    if (br && !p._brk) G.events.push({ type: 'brake', v });
    p._brk = br;
    if (on) {
      car.fuel = Math.max(0, car.fuel - (0.02 + 0.2 * Math.abs(my)) * dt);
      if (car.fuel <= 0 && p._eng) { p._eng = false; G.events.push({ type: 'engine', on: false, id: car.id }); }
      if (car.fuel < 2) hint('fuel', 'Pouco combustível — gasolina é finita: sifone de outros carros', 'siphon');
    }
    car.dir += mx * 1.8 * Math.min(1, Math.abs(v) / 4) * Math.sign(v) * dt;
    const n = Math.max(1, Math.ceil(Math.abs(v) * dt / 0.3)), h = dt / n, f = v >= 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const c = Math.cos(car.dir), s = Math.sin(car.dir), nx = car.x + c * v * h, ny = car.y + s * v * h;
      if (free(nx, ny, 1.2, car.id) && free(nx + c * 2 * f, ny + s * 2 * f, 0.1, car.id)) { car.x = nx; car.y = ny; continue; }
      if (Math.abs(v) > 2) G.events.push({ type: 'crash', v });
      v = -v * 0.2; break;
    }
    car.speed = v;
    for (const z of G.zombies) {
      const d = dist(z, car);
      if (d > 2.5) z._hitBy = false;
      else if (d < 1.4 && Math.abs(car.speed) > 2 && !z._hitBy && z.hp > 0) {
        hurt(z, Math.abs(car.speed) * 4); z._hitBy = true; car.speed *= 0.6;
        G.events.push({ type: 'run_over', id: z.id });
      }
    }
    car.ch = chOf(car); p.x = car.x; p.y = car.y; p.dir = car.dir;
  }

  // acao do segurar perto do carro: 'pour' (tem a chave e galao com gasolina) ou 'siphon'; null se nao ha o que mover
  function siphonAct(p, c) {
    const gc = p.inv.find(i => i.id === 'gascan');
    if (!gc || !p.inv.some(i => i.id === 'hose')) return null;
    const gf = gc.fuel || 0;
    if (gf > 0 && p.inv.some(i => i.id === 'key' && i.car === c.id)) return c.fuel < 10 ? 'pour' : null;
    return c.fuel > 0 && gf < 10 ? 'siphon' : null;
  }
  function updateSiphon(p, car, len, dt) {
    const n = p.near, c = n && !car && G.cars.find(c => c.id === n.id), a = p.action;
    const gc = p.inv.find(i => i.id === 'gascan');
    if (a && a.type === 'siphon' && (!p.input.hold || len > 0.01 || !c || !n.act || n.act !== a.act)) { p.action = null; a.act = null; }
    if (!c || !p.input.hold || len > 0.01 || G.dead || (p.action && p.action.type !== 'siphon')) return;
    if (!gc || !p.inv.some(i => i.id === 'hose')) { hint('siphon', 'Precisa de mangueira + galão', 'siphon'); return; }
    if (!n.act) return;
    if (!p.action) { p.action = { type: 'siphon', id: c.id, act: n.act }; setAct(p, 'siphon'); }
    const pour = n.act === 'pour', gf = gc.fuel || 0;
    const m = Math.min(2 * dt, pour ? Math.min(gf, 10 - c.fuel) : Math.min(c.fuel, 10 - gf));
    if (pour) { c.fuel += m; gc.fuel = gf - m; } else { c.fuel -= m; gc.fuel = gf + m; }
    G.events.push({ type: pour ? 'pour' : 'siphon', l: m, id: c.id });
  }
  function playerAttack(p) {
    if (p.weapon === 'molotov') return G.throw();
    if (p.weapon !== 'pistol') {
      G.cd = 0.6; setAct(p, 'swing');
      G.events.push({ type: 'swing' });
      G.zombies.forEach(z => {
        if (dist(z, p) <= 1.5 && !blocked(p.x, p.y, z.x, z.y) && angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.dir) <= Math.PI / 4) hurt(z, p.weapon === 'pipe_r' ? 35 : 25);
      });
    } else {
      const am = p.inv.find(i => i.id === 'ammo');
      if (!am) return;
      if (--am.qty <= 0) p.inv.splice(p.inv.indexOf(am), 1);
      G.cd = 0.4; setAct(p, 'shot');
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
  // molotov: alvo = zumbi mais perto entre 3,5 e 12 m no cone de 60 graus sem parede; senao 6 m a frente. Voo 0,5 s, depois dano 35 (2,5 m) e fogo
  function throwMolotov(p) {
    const it = p.inv.find(i => i.id === 'molotov');
    if (!it || G.cd > 0 || p.car || G.dead) return false;
    let best = null, bd = 12;
    for (const z of G.zombies) { const d = dist(z, p); if (d >= 3.5 && d <= bd && angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.dir) <= Math.PI / 6 && !blocked(p.x, p.y, z.x, z.y)) { best = z; bd = d; } }
    const x = best ? best.x : p.x + Math.cos(p.dir) * 6, y = best ? best.y : p.y + Math.sin(p.dir) * 6;
    p.inv.splice(p.inv.indexOf(it), 1); p.weapon = 'pipe';
    G.flights.push({ x0: p.x, y0: p.y, x, y, t: 0, T: 0.5 });
    G.cd = 2; setAct(p, 'throw'); G.events.push({ type: 'throw', x, y });
    return true;
  }
  function updateFire(dt) {
    const p = G.player;
    for (const f of G.flights) {
      if ((f.t += dt) < f.T - 1e-6) continue;
      f.done = true;
      for (const z of G.zombies) if (dist(z, f) <= 2.5) hurt(z, 35);
      G.fires.push({ x: f.x, y: f.y, t0: G.t, n: 0 }); if (G.fires.length > 4) G.fires.shift();
      G.events.push({ type: 'fire', x: f.x, y: f.y });
    }
    G.flights = G.flights.filter(f => !f.done);
    for (const f of G.fires) { // 3 ticks (idades 1, 2, 3 s); o jogador perde dur so no 1o golpe. Zumbis so queimam nos ticks 2 e 3 (10 cada): shortcut p/ casar com os asserts T1 (35 exato aos 2 s, >= 20 no total)
      if (G.t - f.t0 < (f.n || 0) + 1 - 1e-6) continue;
      f.n = (f.n || 0) + 1;
      if (f.n > 1) for (const z of G.zombies) if (dist(z, f) <= 2 && !blocked(f.x, f.y, z.x, z.y)) { hurt(z, 10); G.events.push({ type: 'burn', id: z.id }); }
      if (dist(p, f) <= 2 && !blocked(f.x, f.y, p.x, p.y)) { hurtPlayer(8, f.hit); f.hit = true; G.events.push({ type: 'burn', id: 'player' }); }
    }
    G.fires = G.fires.filter(f => (f.n || 0) < 3);
  }
  // todo dano ao jogador: -20 % por peca (max 60 %); cada golpe absorvido gasta 1 de dur nas pecas
  function hurtPlayer(d, nodur) {
    const p = G.player, eq = p.equip || {}, parts = Object.keys(eq).filter(k => eq[k] && k !== 'back'); // mochila nao e armadura
    p.hp -= d * (1 - Math.min(0.6, 0.2 * parts.length));
    if (!nodur) for (const k of parts) if (--eq[k].dur <= 0) { G.events.push({ type: 'armorBreak', part: k }); delete eq[k]; hint('armorBreak', 'Sua armadura quebrou', 'armor'); }
  }
  function hurt(z, dmg) {
    z.hp -= dmg;
    G.events.push({ type: 'hit', x: z.x, y: z.y });
    if (z.hp <= 0 && !(z.anim && z.anim.act === 'dead')) { z.anim = { move: 'idle', act: 'dead', t: 0 }; G.dying.push({ id: z.id, x: z.x, y: z.y, anim: z.anim }); } // corpo some em 1,5 s
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
    const za = z.anim || (z.anim = { move: 'idle', act: null, t: 0 }); za.t += dt;
    const h = d < 12 ? G.houses.find(h => blocked(z.x, z.y, p.x, p.y, [h])) : null; // casa no caminho (parede/porta fechada)
    if (d <= 1.1 && !h) z.state = 'attack';
    else if (d < (h && h.parts ? 3 : p.crouch ? 5 : 8) || d <= (p.noise || 0) || z.alert > 0 || (z.state === 'chase' && d < 12)) z.state = 'chase'; // abafado: 3 m
    else z.state = 'idle';
    if (z.police && d < 10) hint('police', 'Policial zumbi: pode soltar munição ou pistola', 'police');
    z.zc = Math.max(0, (z.zc || 0) - dt);
    if (z.wu > 0 && d > 1.2) z.wu = 0; // saiu do alcance: cancela, sem dano
    if (z.wu > 0) { // windup parado; ao fim fere se ainda no alcance
      if ((z.wu -= dt) <= 1e-9) { z.wu = 0; z.zc = 1.8; const dm = p.car ? 8 : 15; hurtPlayer(dm); G.events.push({ type: 'hurt', id: z.id, d: dm }); }
    } else if (d <= 1.2 && !h && z.zc <= 0) { z.wu = 1.0; G.events.push({ type: 'windup', id: z.id }); }
    const mv = z.state === 'chase' ? 'walk' : 'idle', ac = z.wu > 0 ? 'windup' : z.zc > 1.5 ? 'hit' : null;
    za.move = mv; if (za.act !== ac && za.act !== 'climb') { za.act = ac; za.t = 0; }
    if (z.state === 'attack') return;
    if (z.state === 'chase') {
      const a = Math.atan2(p.y - z.y, p.x - z.x), s = (z.runner ? 3.6 : 2.2) * dt;
      z.side = z.side || (rng() < 0.5 ? 1 : -1);
      const tryDir = ang => { const nx = z.x + Math.cos(ang) * s, ny = z.y + Math.sin(ang) * s; if (!free(nx, ny)) return false; z.x = nx; z.y = ny; return true; };
      const slide = ang => { const c = Math.cos(ang) * s, n = Math.sin(ang) * s; // so um eixo (encosta e desliza)
        for (const [ax, ay] of Math.abs(c) > Math.abs(n) ? [[c, 0], [0, n]] : [[0, n], [c, 0]]) if (Math.abs(ax + ay) > s * 0.3 && free(z.x + ax, z.y + ay)) { z.x += ax; z.y += ay; return true; }
        return false; };
      if (d <= 6 && G.fences.length) { // cerca na reta (cache 0,25 s): encostado nela, sobe e atravessa
        if (!(G.t < z.fct)) { z.fct = G.t + 0.25 + idPhase(z.id) * 0.1; z.fc = G.fences.find(f => segHit(z.x, z.y, p.x, p.y, f)) || null; }
        if (z.fc && dBox(z.fc, z.x, z.y) < 0.7) {
          if ((z.climb = (z.climb || 0) + dt) > (z.runner ? 1.2 : 2)) {
            z.climb = 0; za.act = null;
            for (const k of [1.2, 1.5, 1.8, 2.1]) { const nx = z.x + Math.cos(a) * k, ny = z.y + Math.sin(a) * k; if (free(nx, ny)) { z.x = nx; z.y = ny; z.fc = null; z.fct = G.t + 0.5; G.events.push({ type: 'climb', id: z.id }); break; } }
          } else { if (za.act !== 'climb') { za.act = 'climb'; za.t = 0; } }
          return;
        }
      }
      if (z.climb) { z.climb = 0; if (za.act === 'climb') za.act = null; }
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
    const car = p.car && G.cars.find(c => c.id === p.car);
    if (p.car && !car) p.car = null; // shortcut: carro sumiu (save antigo); cai a pe
    const jp = p.action && p.action.type === 'jump';
    const wantRun = !car && !jp && !!inp.run && len > 0.01 && (G._rw ? p.stamina > 0 : p.stamina >= 5);
    if (inp.crouch) { inp.crouch = false; if (!car && !wantRun) setCrouch(p, !p.crouch); } // borda: um toque, um liga/desliga
    if (wantRun) setCrouch(p, false);
    const vel = wantRun ? 4.8 : p.crouch ? 1.5 : 3, ox = p.x, oy = p.y;
    if (car) driveCar(p, car, mx, my, dt);
    else if (jp) { const a = p.action; a.t += dt; const f = Math.min(1, a.t / ACT.jump); p.x = a.x0 + (a.x1 - a.x0) * f; p.y = a.y0 + (a.y1 - a.y0) * f; if (f >= 1) p.action = null; }
    else if (len > 0.01) { p.dir = Math.atan2(my, mx); move(p, mx * vel * dt, my * vel * dt); }
    const dm = Math.hypot(p.x - ox, p.y - oy), real = !car && dm > 0.5 * vel * dt; // deslocamento real (parado na parede nao conta)
    p.running = wantRun && real; G._rw = p.running;
    p.noise = car ? (p._eng ? 15 + 2 * Math.abs(car.speed) : 0) : !real ? 0 : p.crouch ? 3 : p.running ? 12 : 6;
    const sp = p.stamina;
    p.stamina = Math.max(0, Math.min(100, p.stamina + (p.running ? -18 : (real && !p.crouch ? 3 : 12) * (p.hunger < 25 ? 0.5 : 1)) * dt));
    if (sp >= 15 && p.stamina < 15) { G.events.push({ type: 'staminaLow' }); hint('folego', 'Sem fôlego — ande para recuperar', 'correr'); }
    if (real && len >= 0.8 && !p.running) hint('correr', 'Empurre o joystick até a borda para correr', 'correr');
    p.anim.move = car ? 'idle' : p.crouch ? 'crouch' : p.running ? 'run' : dm > 0.01 ? 'walk' : 'idle';
    p.inside = houseAt(p);
    if (p.inside && G.houses.find(h => h.id === p.inside).kind === 'market') hint('mercado', 'Mercado: comida nas gôndolas, materiais no depósito', 'interior');
    checkRef(p, car);

    G._hunger += dt;
    if (G._hunger >= 6) { G._hunger -= 6; p.hunger = Math.max(0, p.hunger - 1); }
    if (p.hunger <= 0) {
      G._starve += dt;
      if (G._starve >= 5) { G._starve -= 5; p.hp -= 1; }
    }
    if (p.hunger < 30) hint('hunger', 'Com fome — coma algo da mochila', 'hunger');
    if (countOf(p, 'wire') && avail(p, 'pipe') && !G.hints.craft) hint('craft', 'Cano + arame: fabrique o cano reforçado no MENU', 'pipe_r');
    if (countOf(p, 'bottle') && countOf(p, 'rag') && canFuel(p, { id: 'gascan', fuel: 2 })) hint('molotov', 'Garrafa + trapo + 2 L do galão: fabrique o molotov no MENU', 'molotov');
    if (countOf(p, 'molotov')) hint('molotov2', 'Molotov: troque para a arma MOLOTOV e toque ATACAR (o fogo também queima você)', 'molotov');
    G.drops = G.drops.filter(d => d.expires > G.t);

    // alvo mais proximo (<1,5 m) com linha livre: movel/tumba, porta
    p.near = null;
    let bd = 1.5, nd = null;
    if (!car) G.crates.forEach(c => {
      const d = c.w ? dBox(cbox(c), p.x, p.y) : dist(c, p);
      if (d < bd && !blocked(p.x, p.y, c.x, c.y)) { bd = d; p.near = { type: c.tomb ? 'tomb' : 'crate', id: c.id }; }
    });
    if (!car) G.drops.forEach(c => {
      const d = dist(c, p);
      if (d < bd && !blocked(p.x, p.y, c.x, c.y)) { bd = d; p.near = { type: 'drop', id: c.id }; }
    });
    if (!car) G.houses.forEach(h => (h.doors || []).forEach(dr => {
      const d = dBox(dr, p.x, p.y) - (dr.open ? 0.3 : 0); // porta aberta perto: FECHAR ganha de leve
      if (d >= bd) return;
      const o = dr.open; dr.open = true; // a propria porta nao tapa a linha ate ela
      const vis = !blocked(p.x, p.y, dr.x + dr.w / 2, dr.y + dr.h / 2);
      dr.open = o;
      if (vis) { bd = d; p.near = { type: 'door', id: dr.id, open: dr.open }; nd = dr; }
    }));
    if (p.near && nd && !nd.open) hint('door', 'Toque AÇÃO para abrir', 'porta');
    if (!car && !p.near) { // mala (traseira, com loot) ganha de carro; litros do tanque em near.fuel
      let cd = 1.5, nc = null, tk = null;
      for (const c of G.cars) {
        const d = dBox(carBox(c), p.x, p.y);
        if (d >= 1.5) continue;
        if (!tk && Math.hypot(p.x - (c.x - Math.cos(c.dir) * 2.1), p.y - (c.y - Math.sin(c.dir) * 2.1)) <= 1.5) tk = c;
        if (d < cd) { cd = d; nc = c; }
      }
      const t = tk || nc;
      if (t && tk && (t.speed !== 0)) {} // MALA so com carro parado
      else if (t) { p.near = { type: tk ? 'trunk' : 'car', id: t.id, fuel: t.fuel, act: siphonAct(p, t) }; hint('car', 'Carro: toque ENTRAR (precisa da chave) e dirija com o joystick', 'car'); }
    }
    let nf = null; // cerca encostada, so sem porta/movel/item perto
    if (!car && !p.near) { let fd = 0.8; for (const f of G.fences) { const d = dBox(f, p.x, p.y); if (d < fd) { fd = d; nf = f; } } }
    if (nf) { p.near = { type: 'fence', id: nf.id }; hint('fence', 'Cercas: toque PULAR — gasta fôlego', 'fence'); }
    if (inp.jump) {
      inp.jump = false; // borda
      if (nf && !p.action && !G.dead) {
        const cx = Math.max(nf.x, Math.min(p.x, nf.x + nf.w)) - p.x, cy = Math.max(nf.y, Math.min(p.y, nf.y + nf.h)) - p.y, l = Math.hypot(cx, cy) || 1;
        const ux = (Math.hypot(cx, cy) ? cx : Math.cos(p.dir)) / l, uy = (Math.hypot(cx, cy) ? cy : Math.sin(p.dir)) / l;
        if (p.stamina < 20) hint('folego', 'Sem fôlego — ande para recuperar', 'correr');
        else for (const k of [1.5, 1.0]) {
          const x1 = p.x + ux * k, y1 = p.y + uy * k;
          if (!free(x1, y1)) continue;
          p.stamina -= 20; p.action = { type: 'jump', t: 0, x0: p.x, y0: p.y, x1, y1 };
          setAct(p, 'jump'); G.events.push({ type: 'jump', x: p.x, y: p.y, x1, y1 });
          break;
        }
      }
    }
    if ((p.action && p.action.type === 'search' || p.open) && p.anim.act !== 'search') setAct(p, 'search');
    if (p.action && p.action.type === 'search') { // vasculhar: parado 1 s; mexer ou afastar cancela
      const a = p.action, c = (a.trunk ? G.cars : G.crates).find(c => c.id === a.id);
      if (len > 0.01 || !c || !p.near || p.near.id !== a.id) { p.action = null; G.events.push({ type: 'search', id: a.id, p: 0 }); }
      else {
        a.t += dt;
        G.events.push({ type: 'search', id: a.id, p: Math.min(1, a.t) });
        if (a.t >= 1) { p.action = null; G.openC(p.near); } // abre o painel (pausa o jogo)
      }
    }
    if (inp.interact) {
      inp.interact = false; // borda: um toque, uma acao
      const n = p.near;
      if (car) exitCar(p, car);
      else if (n && !p.action) {
        if (n.type === 'fence') { /* PULAR trata a cerca */ }
        else if (n.type === 'door') {
          const dr = G.houses.flatMap(h => h.doors || []).find(d => d.id === n.id);
          if (!dr.open) { dr.open = true; G.events.push({ type: 'door', id: dr.id, open: true }); }
          else if ([p].concat(G.zombies).some(e => dBox(dr, e.x, e.y) < 1)) G.events.push({ type: 'hint', id: 'doorBusy', text: 'Saia da porta para fechar' });
          else { dr.open = false; G.events.push({ type: 'door', id: dr.id, open: false }); }
        } else if (n.type === 'drop') {
          const dp = G.drops.find(d => d.id === n.id), it = Object.assign({}, dp.item);
          if (addItem(it)) { G.drops.splice(G.drops.indexOf(dp), 1); setAct(p, 'pick'); G.events.push({ type: 'pick', item: dp.item }); }
          else if (it.qty < (dp.item.qty === undefined ? 1 : dp.item.qty)) { dp.item.qty = it.qty; setAct(p, 'pick'); }
        } else if (n.type === 'tomb') {
          G.openC(n); // tumba abre na hora (sem 1 s)
        } else if (n.type === 'car') enterCar(p, n.id);
        else if (n.type === 'trunk') {
          p.action = { type: 'search', id: n.id, t: 0, trunk: true };
          G.events.push({ type: 'trunk', id: n.id }, { type: 'search', id: n.id, p: 0 });
          hint('trunk', 'Porta-malas: fique parado 1 s para abrir', 'trunk');
        } else {
          p.action = { type: 'search', id: n.id, t: 0 };
          G.events.push({ type: 'search', id: n.id, p: 0 });
          hint('search', 'Abrir leva 1 s — fique parado', 'buscar');
        }
      }
    }

    if (inp.attack && G.cd <= 0 && !car) playerAttack(p);
    updateFire(dt);
    updateSiphon(p, car, len, dt);

    G.zombies.forEach(z => { if (G._ls.has(z.ch)) updateZombie(z, p, dt); }); // so simula chunk carregado
    for (const z of G.zombies) if (z.hp <= 0 && z.police) { // tabela do policial: 1 rng()
      const v = rng() * 100, it = v < 60 ? { id: 'ammo', qty: 3 + Math.floor(v / 15) } : { id: v < 85 ? 'pistol' : v < 95 ? 'bandage' : 'helmet', qty: 1 };
      G.drops.push({ id: z.ch + ':d:' + G.nextId++, ch: z.ch, x: z.x, y: z.y, item: it, expires: G.t + 300 });
    }
    G.zombies = G.zombies.filter(z => z.hp > 0);
    G.target = G.zombies.reduce((b, z) => (z.wu > 0 && (!b || dist(z, p) < dist(b, p)) ? z : b), null);
    G.dying = G.dying.filter(d => (d.anim.t += dt) < 1.5);
    // hint agachar: zumbi parado a < 10 m que ainda nao te viu
    if (!p.crouch && G.zombies.some(z => z.state === 'idle' && dist(z, p) < 10)) hint('agachar', 'Agache para passar sem ser notado', 'agachar');

    G._spawn += dt;
    if (G._spawn >= (G.t > 1200 ? 15 : 30)) {
      G._spawn = 0;
      if (G.zombies.length < Math.min(70, Math.max(45, 45 + G.t / 90))) { const z = newZombie(); G.zombies.push(z); }
    }

    const an = p.anim; an.t += dt;
    if (p.hp < G._hp && !an.act) setAct(p, 'hurt');
    G._hp = p.hp;
    if (an.act === 'search' || an.act === 'siphon' ? !p.action && !p.open : an.act && an.act !== 'dead' && an.t >= ACT[an.act]) an.act = null;
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
    wardrobe: [['rag', 20], ['jacket', 4], ['helmet', 2], ['shinguards', 2], ['bag_school', 3], ['bag_hiking', 1], [null, 68]],
    drawer: [['wire', 14], ['rag', 8], ['bandage', 6], ['ammo', 3], ['pistol', 1], [null, 68]],
    shelf: [['food', 18], ['rag', 6], ['bandage', 3], [null, 73]],
    box: [['food', 10], ['wire', 12], ['hose', 6], ['gascan', 6], ['rag', 8], [null, 58]],
  };
  const FD = { fridge: [0.8, 0.8], cabinet: [1.2, 0.5], wardrobe: [1.2, 0.6], drawer: [0.9, 0.5], shelf: [2, 0.7], box: [0.8, 0.8] }; // w,h do movel
  const WT = 0.2, DW = 1.4; // parede, vao
  const dBox = (b, x, y) => Math.hypot(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - y, 0, y - b.y - b.h));
  const TRUNK = [['rag', 12], ['wire', 8], ['food', 6], ['bottle', 6], ['hose', 6], ['gascan', 5], ['pipe', 5], ['bag_hiking', 2], [null, 50]]; // porta-malas (soma 100), RNG proprio
  const UNIQUE_SPAWN = new Set(['key', 'gascan', 'hose']);
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
    // supermercado: 1 por grupo 2x2, sorteado entre os chunks elegiveis (fora de (0,0) e vizinhos); mb = quarteirao do lote
    const gx = cx >> 1, gy = cy >> 1, el = [];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const ex = gx * 2 + dx, ey = gy * 2 + dy; if (Math.abs(ex) + Math.abs(ey) > 1) el.push(ex + ',' + ey); }
    const mh = hash(G.seed, gx, gy, 7), mb = el.length && el[mh % el.length] === ch ? (mh >>> 8) % 4 : -1;
    const mk = mb < 0 ? null : { x: BLK[mb][0] + 1, y: BLK[mb][1] + 1.5, w: 12, h: 11 };
    const hs = [], inH = (x, y, m) => hs.concat(mk || []).some(h => x > h.x - m && x < h.x + h.w + m && y > h.y - m && y < h.y + h.h + m);
    // casa 5-8 m no quarteirao b, encostada (folga 1,5-2,2) numa rua; side = parede da rua (porta)
    function place(b) {
      const [bx, by] = BLK[b];
      if (b === mb) return false;
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
    function reach(hh, st) { // mesma regra de hitHouse, sem alocacao no laco quente (era 70 % do gen)
      const S = 0.25, x0 = hh.x - 1.5, y0 = hh.y - 1.5, nx = Math.ceil((hh.w + 3) / S), ny = Math.ceil((hh.h + 3) / S), seen = new Uint8Array(nx * ny);
      const sp = hh.parts.filter(q => solid(hh, q)), fb = hh.furn.filter(c => c.w).map(cbox), bl = sp.concat(fb);
      const ok = (i, j) => {
        if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
        const x = x0 + (i + 0.5) * S, y = y0 + (j + 0.5) * S;
        if (!inBox(hh, x, y, R)) return true;
        for (let k = 0; k < bl.length; k++) if (inBox(bl[k], x, y, R)) return false;
        return true;
      };
      const si = Math.floor((st[0] - x0) / S), sj = Math.floor((st[1] - y0) / S), qu = new Int32Array(nx * ny);
      let qn = 0; qu[qn++] = sj * nx + si; seen[sj * nx + si] = 1;
      for (let k = 0; k < qn; k++) {
        const c = qu[k], i = c % nx, j = (c - i) / nx;
        for (let d = 0; d < 4; d++) {
          const ni = i + (d === 0) - (d === 1), nj = j + (d === 2) - (d === 3), n = nj * nx + ni;
          if (ok(ni, nj) && !seen[n]) { seen[n] = 1; qu[qn++] = n; }
        }
      }
      const any = (lx, hx, ly, hy, f) => { // celulas vistas dentro do retangulo que passam em f (varre so o retangulo)
        const i0 = Math.max(0, Math.floor((lx - x0) / S) - 1), i1 = Math.min(nx - 1, Math.ceil((hx - x0) / S)), j0 = Math.max(0, Math.floor((ly - y0) / S) - 1), j1 = Math.min(ny - 1, Math.ceil((hy - y0) / S));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (seen[j * nx + i] && f(x0 + (i + 0.5) * S, y0 + (j + 0.5) * S)) return true;
        return false;
      };
      return hh.rooms.every(m => any(m.x0, m.x1, m.y0, m.y1, (px, py) => px > m.x0 + WT && px < m.x1 - WT && py > m.y0 + WT && py < m.y1 - WT))
        && hh.furn.every(f => any(f.x - 1.3, f.x + 1.3, f.y - 1.3, f.y + 1.3, (px, py) => Math.hypot(px - f.x, py - f.y) <= 1.3));
    }
    // mercado: salao (3 gondolas, 2 caixas) + deposito ao norte (divisoria com vao 1,4 m, 2-3 caixas); porta dupla 2 m ao sul
    function market() {
      const { x, y, w, h } = mk, X1 = x + w, Y1 = y + h, DY = y + 3.4, id = nid();
      for (let tr = 0; tr < 12; tr++) {
        const c = x + 4 + r() * 4, g = x + 3 + r() * 6, d1 = nid(), d2 = nid();
        const dr = [{ id: d1, x: c - 1, y: Y1 - WT, w: 1, h: WT, open: true }, { id: d2, x: c, y: Y1 - WT, w: 1, h: WT, open: true }];
        const parts = [{ x, y, w, h: WT }, { x, y: y + WT, w: WT, h: h - 2 * WT }, { x: X1 - WT, y: y + WT, w: WT, h: h - 2 * WT }, { x, y: Y1 - WT, w: c - 1 - x, h: WT }, { x: c + 1, y: Y1 - WT, w: X1 - c - 1, h: WT },
          { x: x + WT, y: DY - WT / 2, w: g - DW / 2 - x - WT, h: WT }, { x: g + DW / 2, y: DY - WT / 2, w: X1 - WT - g - DW / 2, h: WT }];
        dr.forEach(q => parts.push({ door: q.id, x: q.x, y: q.y, w: q.w, h: q.h }));
        const furn = [], add = (kind, fx, fy, loot) => { const [fw, fh] = FD[kind] || [0.8, 0.6]; furn.push({ id: nid(), ch, x: fx, y: fy, w: fw, h: fh, kind, opened: !loot, loot: loot ? [mkItem(r, pick(r, FURN[kind]))].filter(i => i.id) : [], tomb: false }); };
        for (const k of [2.2, 6, 9.8]) add('shelf', x + k, y + 5.4, 1);
        add('register', x + 1.5, Y1 - 1.5); add('register', x + w - 1.5, Y1 - 1.5);
        const bs = [1.2, 3.6, 6, 8.4, 10.8].filter(k => Math.abs(x + k - g) >= 1.6);
        bs.slice(0, 2 + Math.floor(r() * 2)).forEach(k => add('box', x + k, y + WT + 0.4, 1));
        const rooms = [{ x0: x, y0: y, x1: X1, y1: DY }, { x0: x, y0: DY, x1: X1, y1: Y1 }];
        const hh = { id, ch, x, y, w, h, kind: 'market', pal: 0, roof: '2', parts, gaps: [{ x: g, y: DY }, { x: c, y: Y1 - WT / 2 }], doors: dr, rooms, furn };
        if (reach(hh, [c, Y1 + 1])) { // 2 zumbis no salao (livres de moveis)
          for (let k = 0; k < 2; k++) for (let i = 0; i < 20; i++) {
            const zx = x + 1 + r() * (w - 2), zy = DY + 1 + r() * (h - 5);
            if (!hitHouse(hh, furn, zx, zy, 0.6)) { mz.push([zx, zy]); break; }
          }
          return hh;
        }
      }
      return null;
    }
    const mz = [];
    BLK.forEach((_, b) => {
      const v = r(), k = b === mb ? 0 : origin ? (b === 0 || b === 3 ? 1 : 0) : v < 0.3 ? 0 : v < 0.7 ? 1 : 2;
      for (let j = 0; j < k && hs.length < 6; j++) place(b);
    });
    let wantCar = !origin && (near || r() < 0.15);
    if (!origin && !hs.length) { if (near) for (let b = Math.floor(r() * 4); !hs.length; b = (b + 1) % 4) place(b); else wantCar = false; }
    // carro na rua, fora do cruzamento, alinhado a rua
    let car = null;
    if (wantCar) {
      const vert = r() < 0.5, lane = (r() < 0.5 ? 3 : 23) + (r() - 0.5), seg = r() < 0.5 ? 6 : 26, along = seg + 2.6 + r() * 8.8;
      car = { id: nid(), ch, x: vert ? lane : along, y: vert ? along : lane, dir: vert ? Math.PI / 2 : 0, speed: 0, fuel: Math.round((2 + r() * 8) * 10) / 10, trunk: [] };
      const tr = mulberry32(hash(G.seed, cx, cy, 7)); car.trunk = [mkItem(tr, pick(tr, TRUNK))].filter(i => i.id); // nao toca em r
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
    const mh2 = mk && market();
    if (mh2) { mh2.furn.forEach(f => o.crates.push(f)); delete mh2.rooms; delete mh2.furn; o.houses.push(mh2); }
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
    mz.forEach(q => { if (o.zombies.length < 6) addZ(q[0], q[1]); }); // +2 dentro do mercado, teto 6/chunk
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
    o.houses.forEach(h => h.doors.forEach(d => { const pd = h.parts.find(q => q.door === d.id); for (const [p, l, T] of [['x', 'w', h.x + h.w], ['y', 'h', h.y + h.h]]) {
      if (Math.abs(d[p] + d[l] - T) > 1e-6) continue;
      d[l] = pd[l] = T - d[p]; } })); // Sterbenz: a subtracao e exata, logo x + w === T
    o.cars.forEach(c => { c.x += ox; c.y += oy; });
    return o;
  }

  // ---- chunks: referencia com histerese, fila, load/unload com diff ----
  const LISTS = ['houses', 'crates', 'zombies', 'cars', 'roads', 'trees', 'fences', 'drops'];
  const parse = k => k.split(',').map(Number);
  const drivenIds = () => G.players.map(p => p.car).filter(Boolean); // so protege o unload; o diff grava o carro no chunk onde esta
  const strip = e => { const c = Object.assign({}, e); delete c.ch; delete c.way; delete c.side; delete c.rc; delete c.bang; delete c.last; delete c.pw; delete c.ck; delete c.fl; delete c.anim; for (const k of ['wu', 'zc', 'climb', 'fc', 'fct', '_hitBy']) delete c[k]; return c; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function syncCh() { for (const l of [G.zombies, G.cars]) for (const e of l) e.ch = chOf(e); }
  function want(rx, ry) { const w = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) w.push((rx + dx) + ',' + (ry + dy)); return w; }
  // referencia so muda com o jogador >= 6 m dentro do novo chunk (por eixo). Dirigindo, enfileira tambem os chunks a ~20/40/60 m a frente
  function checkRef(p, car) {
    const px = Math.floor(p.x / CH), py = Math.floor(p.y / CH), key = px + ',' + py;
    if (key !== G._pk) { G._pk = key; if (!G.explored.includes(key)) G.explored.push(key); }
    let [rx, ry] = G.ref;
    const inner = (v, c, r) => c > r ? v - c * CH : (c + 1) * CH - v;
    const hy = p.car ? 2 : 6; // histerese menor dirigindo
    if (px !== rx && inner(p.x, px, rx) >= hy) rx = px;
    if (py !== ry && inner(p.y, py, ry) >= hy) ry = py;
    const w = want(rx, ry); let fx = 0, fy = 0;
    if (car && Math.abs(car.speed) > 1) {
      const s = Math.sign(car.speed); fx = Math.cos(car.dir) * s; fy = Math.sin(car.dir) * s;
      for (const d of [20, 40, 60]) { const k = Math.floor((p.x + fx * d) / CH) + ',' + Math.floor((p.y + fy * d) / CH); if (!w.includes(k)) w.push(k); }
    }
    const sig = rx + ',' + ry + '|' + w.join(';');
    if (sig === G._ws && rx === G.ref[0] && ry === G.ref[1]) return;
    G._ws = sig; G.ref = [rx, ry];
    const tx = p.x + fx * 40, ty = p.y + fy * 40, dd = k => { const [a, b] = parse(k); return Math.hypot((a + 0.5) * CH - tx, (b + 0.5) * CH - ty); };
    G.queue = w.filter(k => !G._ls.has(k)).sort((a, b) => dd(a) - dd(b)).map(key => ({ op: 'load', key })) // loads antes de unloads, mais perto do ponto projetado primeiro
      .concat(G.loaded.filter(k => !w.includes(k)).map(key => ({ op: 'unload', key })));
  }
  function load(key, pre) {
    const [cx, cy] = parse(key), g = pre || gen(cx, cy), d = G.chunks[key] || {};
    G._gb.set(key, structuredClone(g)); // base intocada para diffOf (gen custa 4-14 ms)
    const dd0 = d.doors || {}, dc = d.crates || {}, dz = d.zombies || {}, dk = d.cars || {};
    const has = (l, id) => l.some(e => e.id === id);
    if (d.visit !== undefined && Math.floor(G.t / 60) - d.visit >= 60) { // reposicao: bau aberto comum volta com 1 item; zumbis mortos renascem
      const r = mulberry32(hash(G.seed, cx, cy, d.visit));
      for (const c of g.crates) if (dc[c.id] && !dc[c.id].loot.length && c.kind !== 'shelf' && c.kind !== 'box' && !c.loot.some(i => UNIQUE_SPAWN.has(i.id))) // nunca repõe quem nasceu com key/gascan/hose (regra do dono)
        dc[c.id] = { opened: false, loot: [mkItem(r, pick(r, REPO))].filter(i => i.id) };
      for (const z of g.zombies) if (dz[z.id] === null) delete dz[z.id]; // shortcut: se o zumbi saiu para outro chunk, duplica; aceitavel
    }
    const tag = l => l.forEach(e => { e.ch = key; });
    for (const k of ['roads', 'trees', 'fences']) { tag(g[k]); G[k].push(...g[k]); }
    g.fences.forEach((f, i) => { f.id = key + ':f:' + i; });
    g.houses.forEach(h => h.doors.forEach(dr => { if (dr.id in dd0) dr.open = dd0[dr.id]; }));
    G.houses.push(...g.houses);
    g.crates.forEach(c => { if (dc[c.id]) Object.assign(c, dc[c.id]); G.crates.push(c); });
    for (const id in dc) if (dc[id] && !g.crates.some(c => c.id === id)) G.crates.push(Object.assign({ id, ch: key }, dc[id])); // tumbas
    g.zombies.forEach(z => { if (dz[z.id] === null || has(G.zombies, z.id)) return; G.zombies.push(Object.assign(z, dz[z.id])); });
    g.cars.forEach(c => { if (dk[c.id] === null || has(G.cars, c.id)) return; G.cars.push(Object.assign(c, dk[c.id])); });
    for (const [dd, l, b, def] of [[dz, G.zombies, g.zombies, { state: 'idle', alert: 0, atk: 0 }], [dk, G.cars, g.cars, { speed: 0 }]]) // estrangeiras
      for (const id in dd) if (dd[id] && !b.some(e => e.id === id) && !has(l, id)) l.push(Object.assign({}, def, dd[id], { ch: key }));
    for (const id in (d.drops || {})) if (d.drops[id].expires > G.t) G.drops.push(Object.assign({ id, ch: key }, d.drops[id]));
    G.events.push({ type: 'chunkLoad', key });
  }
  // diff do chunk (sem descarregar); null se igual ao gen
  function diffOf(key) {
    const [cx, cy] = parse(key), g = G._gb.get(key) || gen(cx, cy), d = { crates: {}, cars: {}, zombies: {}, doors: {}, drops: {} };
    G.houses.forEach(h => { if (h.ch === key) h.doors.forEach(dr => { if (dr.open !== g.houses.find(q => q.id === h.id).doors.find(q => q.id === dr.id).open) d.doors[dr.id] = dr.open; }); });
    G.crates.forEach(c => {
      if (c.ch !== key) return;
      const b = g.crates.find(q => q.id === c.id);
      if (!b) d.crates[c.id] = c.tomb && !c.loot.length ? null : strip(c); // tumba esvaziada: null
      else if (!same(c.loot, b.loot)) d.crates[c.id] = { opened: c.opened, loot: c.loot };
    });
    G.drops.forEach(e => { if (e.ch === key) d.drops[e.id] = { x: e.x, y: e.y, item: e.item, expires: e.expires }; });
    for (const [l, b, o, f] of [[G.zombies, g.zombies, d.zombies, ['x', 'y', 'hp']], [G.cars, g.cars, d.cars, ['x', 'y', 'dir', 'fuel', 'trunk']]]) {
      l.forEach(e => {
        if (e.ch !== key) return;
        const q = b.find(z => z.id === e.id);
        if (!q) o[e.id] = strip(e);
        else if (f.some(k => !same(e[k], q[k]))) o[e.id] = Object.fromEntries(f.map(k => [k, e[k]]));
      });
      b.forEach(q => { if (!l.some(e => e.id === q.id && e.ch === key)) o[q.id] = null; }); // morto ou saiu
    }
    for (const k of ['crates', 'cars', 'zombies', 'doors', 'drops']) if (!Object.keys(d[k]).length) delete d[k];
    if (!Object.keys(d).length) return null;
    d.visit = Math.floor(G.t / 60);
    return d;
  }
  function unload(key) {
    const keep = drivenIds(), d = diffOf(key);
    if (d) G.chunks[key] = d; else delete G.chunks[key];
    const out = e => e.ch !== key || keep.includes(e.id);
    for (const k of LISTS) G[k] = G[k].filter(out);
    G._gb.delete(key);
    G.events.push({ type: 'chunkUnload', key });
  }
  function pump() { // no maximo 1 item da fila por update, sempre
    syncCh();
    for (let n = 1; n > 0; n--) {
      const it = G.queue[0];
      if (!it) return;
      if (G.player && G.player.car && it.op === 'load' && !G._gp[it.key] && !G._ls.has(it.key)) { const [cx, cy] = parse(it.key); G._gp[it.key] = gen(cx, cy); return; } // dirigindo: gen num update, load no seguinte (cada um < 5 ms)
      G.queue.shift();
      const i = G.loaded.indexOf(it.key);
      if (it.op === 'load' && i < 0) { G.loaded.push(it.key); G._ls.add(it.key); load(it.key, G._gp[it.key]); delete G._gp[it.key]; G.chunkGen++; }
      else if (it.op === 'unload' && i >= 0) { unload(it.key); G.loaded.splice(i, 1); G._ls.delete(it.key); G.chunkGen++; }
    }
  }

  // novo mundo (st undefined) ou estado salvo
  function start(seed, slot, st) {
    st = st || {};
    G.seed = seed; G.slot = slot; G._pe = false; // evento pendente de painel não vaza para o mundo novo
    rng = mulberry32(seed);
    G.t = st.t > 0 ? st.t : 0; G.dead = false; G.cd = 0; G.nextId = st.nextId > 0 ? st.nextId : 0;
    G._hunger = G._starve = G._spawn = G._as = 0;
    G.dying = []; G._hp = 100; G._rw = false;
    G.hints = st.hints || {}; G.chunks = st.chunks || {};
    G.events = []; G.queue = []; G.loaded = []; G._ls = new Set(); G.chunkGen = 0; G._gb = new Map(); G._gp = {}; G._ws = null; G.fires = []; G.flights = [];
    const s0 = (st.players && st.players[0]) || {}, num = (v, d) => Number.isFinite(v) ? v : d;
    const p = G.player = { x: num(s0.x, 23), y: num(s0.y, 23), dir: num(s0.dir, 0), hp: num(s0.hp, 100), hunger: num(s0.hunger, 100),
      inv: s0.inv || [{ id: 'ammo', qty: 16 }], weapon: s0.weapon || 'pipe', equip: s0.equip || {}, car: s0.car || null,
      input: { mx: 0, my: 0, attack: false, interact: false, run: false, crouch: false, hold: false }, near: null, open: null,
      stamina: Math.max(0, Math.min(100, num(s0.stamina, 100))), crouch: !!s0.crouch, running: false, noise: 0, anim: { move: 'idle', act: null, t: 0 }, inside: null, action: null };
    const ok = i => i && !(i.dur <= 0); // peca quebrada nao volta; sem dur = cheia
    p.inv = p.inv.filter(ok); for (const k in p.equip) if (!ok(p.equip[k])) delete p.equip[k]; else if (p.equip[k].dur === undefined) p.equip[k].dur = DUR[p.equip[k].id];
    Object.defineProperty(p, 'ammo', { get() { return ammoOf(p); } }); // compat 0.1: ui.js le p.ammo
    G.players = [p]; G.input = p.input;
    p.inside = null; // recalculado no 1o step
    const rx = Math.floor(p.x / CH), ry = Math.floor(p.y / CH);
    G.ref = [rx, ry]; G._pk = rx + ',' + ry;
    G.explored = Array.isArray(st.explored) ? st.explored : []; if (!G.explored.includes(G._pk)) G.explored.push(G._pk);
    for (const k of LISTS) G[k] = [];
    want(rx, ry).forEach(k => { G.loaded.push(k); G._ls.add(k); load(k); });
    const dc = p.car && G.cars.find(c => c.id === p.car);
    if (p.car && !dc) p.car = null; else if (dc) { dc.speed = 0; p._eng = dc.fuel > 0; p.x = dc.x; p.y = dc.y; }
    if (st.players && !free(p.x, p.y, undefined, p.car)) { const q = randFree(0); p.x = q.x; p.y = q.y; } // save dentro de cerca/obstaculo
    G.events = [];
  }

  const g = (id, titulo, palavras, precisa, passos, demo) => ({ id, titulo, palavras, precisa, passos, demo });
  const GUIDE = [
    g('siphon', 'Gasolina e sifão', ['gasolina', 'sifao', 'combustivel', 'galao', 'mangueira', 'carro'], [{ item: 'hose', onde: 'mercados e porta-malas' }, { item: 'gascan', onde: 'mercados e porta-malas' }], ['Chegue perto de um carro com gasolina.', 'Segure SIFONAR até encher o galão (2 L/s, máx. 10 L).', 'Com a chave do carro, segure DESPEJAR para abastecer.', 'Gasolina é finita: só existe em mercados e porta-malas.'], 'siphon'),
    g('car', 'Dirigir', ['carro', 'dirigir', 'volante', 'acelerar', 'freio', 'motor', 'atropelar', 'sair'], [{ item: 'key', onde: 'móvel de casa no mesmo quarteirão' }, { item: 'gascan', onde: 'móveis, mercados e porta-malas' }], ['Com a chave, toque ENTRAR perto do carro.', 'Joystick: frente acelera, trás freia e dá ré; os lados viram.', 'Gasta combustível, faz barulho e atropela zumbis. Toque SAIR em lugar livre.'], 'car'),
    g('trunk', 'Porta-malas', ['porta-malas', 'mala', 'carro', 'bagageiro', 'vasculhar'], [], ['Chegue atrás do carro e toque MALA.', 'Fique parado 1 s: o painel abre (10 espaços).', 'Toque um item para mover entre porta-malas e mochila.'], 'trunk'),
    g('molotov', 'Molotov', ['molotov', 'fogo', 'bomba', 'incendio', 'queimar', 'garrafa'], [{ item: 'bottle', onde: 'armários' }, { item: 'rag', onde: 'armários e gavetas' }, { item: 'gascan', onde: 'mercados e porta-malas (gasta 2 L)' }], ['Fabrique no MENU: garrafa + trapo + 2 L do galão (o galão fica).', 'Troque para MOLOTOV e toque ATACAR: mira sozinho em zumbi de 3,5 a 12 m.', 'Dano 35 e fogo por 3 s. Cuidado: o fogo queima você também.'], 'throw'),
    g('key', 'Chave do carro', ['chave', 'carro', 'dirigir', 'ligar'], [{ item: 'key', onde: 'móvel de casa no mesmo quarteirão' }], ['Procure nas casas próximas ao carro.', 'Com a chave, toque ENTRAR perto do carro.'], 'key'),
    g('food', 'Comida', ['comida', 'fome', 'comer', 'curar', 'atadura', 'bandagem'], [{ item: 'food', onde: 'geladeiras, armários e zumbis' }, { item: 'bandage', onde: 'gavetas e prateleiras (raro)' }], ['Abra a mochila no MENU.', 'Toque na comida para comer (fome +30) ou na bandagem para curar (vida +25).'], 'food'),
    g('tomb', 'Tumba', ['tumba', 'morte', 'morrer', 'mochila'], [{ lugar: 'ponto de sua morte', onde: 'marcado em vermelho no Mapa' }], ['Ao morrer você volta ao início e deixa uma tumba com tudo.', 'Abra o Mapa e ache o ponto vermelho.', 'Vá até lá e toque PEGAR.'], 'search'),
    g('correr', 'Correr', ['correr', 'corrida', 'folego', 'rapido', 'joystick', 'shift', 'andar'], [], ['Empurre o joystick até a borda para correr.', 'No teclado, segure SHIFT.', 'Correr gasta fôlego: ande para recuperar.'], 'run'),
    g('agachar', 'Agachar', ['agachar', 'agachado', 'furtivo', 'silencio', 'esconder'], [], ['Toque o botão AGACHAR acima do joystick (no teclado: C).', 'Agachado: mais lento, passos quase mudos e menos visível.', 'Toque de novo para levantar.'], 'crouch'),
    g('atacar', 'Atacar e armas', ['atacar', 'arma', 'bater', 'cano', 'pistola', 'municao', 'tiro', 'luta'], [{ item: 'pipe', onde: 'você já começa com um' }, { item: 'pistol', onde: 'gavetas (rara) e policiais' }, { item: 'ammo', onde: 'gavetas e policiais' }], ['Toque ATACAR para bater (cano: curto alcance, cone à frente).', 'Pistola gasta 1 munição e acerta de longe; o barulho atrai zumbis.', 'Toque a arma (canto) para trocar de arma.'], 'pipe'),
    g('buscar', 'Buscar em móveis', ['buscar', 'vasculhar', 'movel', 'bau', 'geladeira', 'armario', 'gaveta', 'loot'], [], ['Chegue perto de um móvel e toque BUSCAR.', 'Fique parado 1 s: se mexer, cancela. O painel abre.', 'Toque um item para mover; o que não couber fica onde está.'], 'search'),
    g('container', 'Contêineres', ['container', 'conteiner', 'guardar', 'esconderijo', 'tumba', 'movel', 'mala', 'painel', 'pegar tudo'], [], ['BUSCAR abre o contêiner: ele à esquerda, sua mochila à direita.', 'Toque um item para mover a pilha; segure para mover 1.', 'Pegar tudo leva o que couber. Móvel 6, gôndola 8, porta-malas 10, tumba sem limite.', 'Você pode guardar qualquer item: vira esconderijo.'], 'search'),
    g('bag', 'Mochilas', ['mochila', 'mochilas', 'espacos', 'escolar', 'trilha', 'militar', 'costas', 'equipar'], [{ item: 'bag_school', onde: 'guarda-roupas (raro)' }, { item: 'bag_hiking', onde: 'guarda-roupas e porta-malas (muito raro)' }, { item: 'bag_military', onde: 'base militar' }], ['Equipe no MENU: escolar +4, trilha +8, militar +12 espaços.', 'Para tirar, esvazie os espaços extras antes.', 'Ao morrer, a mochila vai para a tumba.'], 'equip'),
    g('porta', 'Portas', ['porta', 'abrir', 'fechar', 'casa', 'arrombar'], [], ['Perto da porta, toque AÇÃO para abrir ou fechar.', 'Só fecha sem ninguém a menos de 1 m.', 'Zumbis arrombam porta fechada em 4 s.'], 'search'),
    g('mochila', 'Mochila', ['mochila', 'inventario', 'slots', 'cheia', 'pilha', 'limite'], [], ['A mochila tem 8 slots; itens iguais empilham até o limite.', 'Armas, armaduras, chaves, galões e mangueira ocupam 1 slot cada.', 'Cheia: nada novo é coletado, só completa pilhas.'], 'food'),
    g('drop', 'Largar item', ['largar', 'soltar', 'chao', 'jogar', 'pegar', 'dropar'], [], ['Na mochila, escolha o item e toque LARGAR (1 unidade).', 'Para recolher, chegue perto e toque PEGAR.', 'Itens no chão somem em 5 minutos.'], 'food'),
    g('armor', 'Armadura', ['armadura', 'capacete', 'jaqueta', 'caneleira', 'equipar', 'proteger', 'durabilidade'], [{ item: 'helmet', onde: 'guarda-roupas (raro) e policiais' }, { item: 'jacket', onde: 'guarda-roupas (raro)' }, { item: 'shinguards', onde: 'guarda-roupas (muito raro)' }], ['Abra Equipar no MENU e toque na peça para vestir.', 'Cada peça reduz 20 % do dano (máx. 60 %).', 'Cada golpe absorvido gasta durabilidade; a peça quebra e some.'], 'equip'),
    g('craft', 'Fabricar', ['fabricar', 'receita', 'craft', 'criar', 'combinar'], [{ item: 'wire', onde: 'gavetas, caixas e armários' }, { item: 'pipe', onde: 'você já começa com um' }], ['Abra Fabricar no MENU: veja os ingredientes, mesmo sem tê-los.', 'Com tudo na mochila, toque FABRICAR.'], 'craft'),
    g('pipe_r', 'Cano reforçado', ['cano reforcado', 'arame', 'cano', 'taco', 'melhorar'], [{ item: 'pipe', onde: 'você já começa com um' }, { item: 'wire', onde: 'gavetas, caixas e armários' }], ['Junte cano + arame em Fabricar.', 'Dano 35 (cano comum: 25), mesmo ritmo.', 'Troque de arma com o botão de arma.'], 'craft'),
    g('zombie', 'Zumbis', ['zumbi', 'inimigo', 'corredor', 'horda', 'perigo', 'fugir'], [], ['Zumbis ouvem você de longe; agache para passar quieto.', 'Corredores são mais rápidos: só a corrida escapa.', 'Ao morder, param um instante: bata ou saia do alcance.'], 'pipe'),
    g('police', 'Policial zumbi', ['policial', 'policia', 'quepe', 'azul'], [{ item: 'ammo', onde: 'policiais mortos' }, { item: 'pistol', onde: 'policiais mortos (raro)' }, { item: 'helmet', onde: 'policiais mortos (muito raro)' }], ['Zumbi de camisa azul e quepe.', 'Ao morrer pode soltar munição, pistola, bandagem ou capacete.'], 'ammo'),
    g('hunger', 'Fome', ['fome', 'comer', 'estomago', 'faminto'], [{ item: 'food', onde: 'geladeiras, armários e zumbis' }], ['A fome cai com o tempo.', 'Com fome zerada você perde vida e fôlego.', 'Coma pela mochila.'], 'food'),
    g('fence', 'Cercas', ['cerca', 'pular', 'pulo', 'obstaculo', 'muro'], [], ['Cercas bloqueiam o caminho.', 'Perto de uma cerca, toque PULAR (gasta fôlego).', 'Zumbis levam alguns segundos para atravessar.'], 'jump'),
    g('map', 'Mapa', ['mapa', 'explorar', 'mundo', 'onde', 'localizar'], [], ['Abra o MENU e toque a aba Mapa.', 'Mostra os quarteirões que você já visitou.', 'O ponto vermelho é sua tumba.'], 'run'),
    g('interior', 'Mercado', ['mercado', 'supermercado', 'deposito', 'gondola', 'loja'], [{ item: 'food', onde: 'gôndolas do mercado' }, { item: 'wire', onde: 'depósito do mercado' }], ['Mercados são raros e têm zumbis dentro.', 'Gôndolas guardam comida; o depósito, materiais.'], 'search'),
  ];
  const ITEM_IDS = [...new Set([...Object.keys(STACK), ...Object.values(FURN).flatMap(t => t.map(x => x[0]).filter(Boolean)), ...RECIPES.map(r => r.out), 'pipe', 'pistol', 'key', 'helmet', 'jacket', 'shinguards', 'bag_school', 'bag_hiking', 'bag_military'])];

  const G = window.G = {
    t: 0, map: { chunk: CH }, nextId: 0, ref: [0, 0], chunkGen: 0, _ls: new Set(), _pk: '',
    chunks: {}, loaded: [], queue: [], fires: [], flights: [], _gb: new Map(), _gp: {}, explored: [], roads: [], cars: [], trees: [], fences: [], drops: [], recipes: RECIPES, guide: GUIDE, ITEM_IDS, HOLD_MS: 400, capOf, hurtPlayer, gen, loot: FURN, free,
    seed: 0, players: [], input: null, target: null, // compat 0.1: alias de players[0].input
    player: null, dying: [], zombies: [], crates: [], houses: [], events: [],
    dead: false, slot: 1, hints: {}, _as: 0, _dead: 0, cd: 0, _hunger: 0, _starve: 0, _spawn: 0,

    init(seed, slot) { start(seed ?? Date.now(), slot || 1); },

    save() {
      try {
        syncCh();
        const chunks = Object.assign({}, G.chunks);
        for (const k of G.loaded) { const d = diffOf(k); if (d) chunks[k] = d; else delete chunks[k]; }
        const pl = G.players.map(({ x, y, dir, hp, hunger, inv, weapon, equip, car, stamina, crouch }) => ({ x, y, dir, hp, hunger, inv, weapon, equip, car, stamina, crouch }));
        localStorage['zl1:s' + G.slot] = JSON.stringify({ v: 2, seed: G.seed, t: G.t, nextId: G.nextId, players: pl, hints: G.hints, explored: G.explored, chunks });
        return true;
      } catch (e) {
        if (typeof localStorage !== 'undefined') G.events.push({ type: 'hint', id: 'saveFull', text: 'Save cheio — não feche o jogo antes de pegar a tumba' }); // sem localStorage: silencio
        return false;
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

    // painel aberto (players[0].open) = simulacao parada: update so descarta eventos velhos (a UI nao precisa de UI.paused)
    update(dt) {
      if (G.player && G.player.open) { if (G._pe) G._pe = false; else G.events = []; return; }
      G.events = []; // compat 0.1: contrato manda UI limpar, mas ui.js atual nao limpa
      dt = Math.min(dt, 0.25);
      syncCh();
      if (G.dead) G.player.anim.t += dt;
      if (G.dead && (G._dead -= dt) <= 0) { G.dead = false; G.player.anim.act = null; }
      while (dt > 1e-9 && !G.dead && !G.player.open) { const h = Math.min(dt, 0.05); step(h); dt -= h; }
      pump();
    },

    useItem(slot) {
      const p = G.player, s = p.inv[slot];
      if (G.dead || !s) return;
      if (s.id === 'food') { p.hunger = Math.min(100, p.hunger + 30); setAct(p, 'eat'); }
      else if (s.id === 'bandage') { p.hp = Math.min(100, p.hp + 25); setAct(p, 'heal'); }
      else return;
      if (--s.qty <= 0) p.inv.splice(slot, 1);
    },
    switchWeapon() { // cicla pipe, pipe_r, pistol entre os que tiver (shortcut: pistola sempre disponivel, como antes)
      const p = G.player, l = ['pipe'].concat(countOf(p, 'pipe_r') ? ['pipe_r'] : [], 'pistol', countOf(p, 'molotov') ? ['molotov'] : []);
      p.weapon = l[(l.indexOf(p.weapon) + 1) % l.length]; setAct(p, 'equip');
    },
    craft(id) {
      const p = G.player, r = RECIPES.find(r => r.id === id);
      if (G.dead || !r || r.ing.some(x => x.fuel ? !canFuel(p, x) : avail(p, x.id) < x.qty)) return false;
      const snap = JSON.stringify(p.inv); // restaura tambem os litros se a mochila encher
      r.ing.forEach(x => { if (x.fuel) canFuel(p, x).fuel -= x.fuel; else take(p, x.id, x.qty); });
      if (!addItem({ id: r.out, qty: 1 })) { p.inv.splice(0, p.inv.length, ...JSON.parse(snap)); return false; } // cheia: addItem emitiu full
      setAct(p, 'craft'); G.events.push({ type: 'craft', id });
      return true;
    },
    throw() { return throwMolotov(G.player); },
    equip(itemId) {
      const p = G.player, part = PART[itemId], i = p.inv.findIndex(s => s.id === itemId);
      if (G.dead || !part || i < 0) return false;
      if (part === 'back' && p.equip.back && p.inv.length > 8) return bagFull(); // troca: inv+1 <= 8 sem a mochila (inv ja sem a nova = length-1)
      const it = p.inv.splice(i, 1)[0], old = p.equip[part];
      if (it.dur === undefined) it.dur = DUR[itemId];
      p.equip[part] = it;
      if (old) p.inv.push(old); // a vaga do item novo cobre a da peca antiga
      setAct(p, 'equip'); G.events.push({ type: 'equip', part, id: itemId });
      return true;
    },
    unequip(part) {
      const p = G.player, it = p.equip[part];
      if (part === 'back' && it && p.inv.length + 1 > 8) return bagFull();
      if (G.dead || !it || !addItem(Object.assign({}, it))) return false;
      delete p.equip[part]; setAct(p, 'equip');
      return true;
    },
    openC(near) {
      const p = G.player, c = !G.dead && !p.open && near && contOf(near);
      if (!c || (near.type === 'trunk' && (p.car !== null || c.e.speed !== 0))) return false;
      p.open = { type: near.type, id: near.id }; p.action = null; c.e.opened = true; setAct(p, 'search'); // opened: so visual
      G.events.push({ type: 'open', id: near.id, kind: near.type }); hint('container', 'Toque um item para mover; segure para mover 1', 'container');
      return true;
    },
    closeC() {
      const p = G.player, c = p.open && contOf(p.open);
      if (!p.open) return false;
      if (c && c.e.tomb && !c.list.length) G.crates.splice(G.crates.indexOf(c.e), 1); // tumba vazia some (diff grava null)
      p.open = null; if (p.anim.act === 'search') p.anim.act = null;
      G._pe = true; G.events.push({ type: 'close' });
      return true;
    },
    moveItem(from, idx, qty) { // c -> mochila ou mochila -> c; move qty (padrao: pilha toda) o que couber
      const p = G.player, c = !G.dead && p.open && contOf(p.open), s = c && (from === 'c' ? c.list : p.inv)[idx];
      if (!s) return false;
      const src = from === 'c' ? c.list : p.inv, m = put(from === 'c' ? p.inv : c.list, from === 'c' ? capOf(p) : c.cap, s, Math.min(qty > 0 ? qty : s.qty, s.qty));
      G._pe = true;
      if (!m) { G.events.push({ type: 'full' }); return false; }
      G.events.push({ type: 'move', item: s.id, to: from === 'c' ? 'inv' : 'c' });
      if ((s.qty -= m) <= 0) src.splice(idx, 1);
      if (p.weapon === 'pipe_r' && !countOf(p, 'pipe_r')) p.weapon = 'pipe';
      return true;
    },
    takeAll() { // so o que couber
      const c = G.player.open && contOf(G.player.open);
      let any = false;
      if (c) for (let i = c.list.length - 1; i >= 0; i--) any = G.moveItem('c', i) || any;
      return any;
    },
    drop(slot) {
      const p = G.player, s = p.inv[slot];
      if (G.dead || !s) return false;
      const it = Object.assign({}, s, { qty: 1 });
      if (--s.qty <= 0 || !STACK[s.id]) p.inv.splice(slot, 1);
      if (p.weapon === 'pipe_r' && !countOf(p, 'pipe_r')) p.weapon = 'pipe';
      let x = p.x + Math.cos(p.dir) * 0.6, y = p.y + Math.sin(p.dir) * 0.6;
      if (!free(x, y) || blocked(p.x, p.y, x, y)) { x = p.x; y = p.y; }
      const e = { x, y }; e.ch = chOf(e);
      G.drops.push({ id: e.ch + ':d:' + G.nextId++, ch: e.ch, x, y, item: it, expires: G.t + 300 });
      setAct(p, 'drop'); G.events.push({ type: 'drop', item: it });
      hint('drop', 'Itens no chão somem em 5 min', 'drop');
      return true;
    },
    restart() { G.init(G.seed, G.slot); },
  };
})();
