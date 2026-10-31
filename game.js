// Zumbilandia - logica do jogo. Define window.G (ver PLANO.md).
(function () {
  const R = 0.4, CH = 40;
  const nearD = (l, v) => { let m = 1.3; for (let i = 0; i < l.length; i++) { const d = Math.abs(v - l[i]); if (d < m) m = d; } return m; }; // menor distancia (teto 1,3) de v a uma lista
  const hypot2 = (a, b) => Math.sqrt(a * a + b * b); // Math.hypot e lento no V8 (era o maior custo do free e do gen)
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
  const solid = (h, q) => { if (!q.door) return true; const d = h.doors.find(d => d.id === q.door); return !d.open || !!d.locked; }; // porta aberta nao colide; trancada e sempre solida
  // ponto (raio m) bate na casa? lote primeiro; so entao partes e moveis (sem cache). Casa sem parts = bloco solido.
  function hitHouse(h, cs, x, y, m, fl) { // fl: andar (0 padrao); a escada vale nos dois
    if (!inBox(h, x, y, m)) return false;
    if (!h.parts) return true;
    fl = fl | 0;
    return h.parts.some(q => (q.floor | 0) === fl && inBox(q, x, y, m) && solid(h, q)) || cs.some(c => c.w && (c.floor | 0) === fl && inBox(cbox(c), x, y, m)) || (!!h.stairs && inBox(h.stairs, x, y, m));
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
  function blocked(x0, y0, x1, y1, hs, fl = 0) {
    return (hs || G.houses).some(h => segHit(x0, y0, x1, y1, h) && (!h.parts || h.parts.some(q => (q.floor || 0) === fl && solid(h, q) && segHit(x0, y0, x1, y1, q))));
  }
  const chOf = e => Math.floor(e.x / CH) + ',' + Math.floor(e.y / CH);
  const dist = (a, b) => hypot2(a.x - b.x, a.y - b.y);
  // diferenca angular absoluta entre dois angulos
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  // caixa (AABB) do carro: centro x,y, 4,2 m de comprimento no eixo da dir
  const carBox = c => { const v = Math.abs(Math.sin(c.dir)) > 0.5; return { x: c.x - (v ? 1 : 2.1), y: c.y - (v ? 2.1 : 1), w: v ? 2 : 4.2, h: v ? 4.2 : 2 }; };
  // ponto (com raio m) livre? dentro do mapa; fora de casas, carros (AABB) e arvores (circulo r 0,4)
  // props que colidem (poste, hidrante), em cache enquanto G.props nao muda
  function pcol() { if (G._pcs !== G.props || G._pcn !== G.props.length) { G._pcs = G.props; G._pcn = G.props.length; G._pc = G.props.filter(p => p.r); } return G._pc; }
  function free(x, y, m, skipId, fl = 0) {
    m = m === undefined ? R : m;
    if (fl) return !G.houses.some(h => hitHouse(h, G.crates, x, y, m, fl)); // andar de cima: so casa (paredes externas fecham o andar)
    return !G.houses.some(h => hitHouse(h, G.crates, x, y, m)) && !G.cars.some(c => c.id !== skipId && inBox(carBox(c), x, y, m)) && !G.trees.some(t => { const dx = x - t.x, dy = y - t.y, r = 0.4 + m; return dx * dx + dy * dy < r * r; }) && !G.fences.some(f => inBox(f, x, y, m)) && !pcol().some(p => { const dx = x - p.x, dy = y - p.y, r = p.r + m; return dx * dx + dy * dy < r * r; }); // cercas e postes por ultimo
  }
  // move por eixo (desliza nas paredes)
  function move(o, dx, dy) {
    if (o === G.player && G.dev.noclip && !o.car) { o.x += dx; o.y += dy; return; } // dev: atravessa tudo (so o jogador a pe)
    const fl = o.floor || 0, zl = o !== G.player; // zumbi empurrado nao entra em chunk fora de _ls (J5.1)
    if (free(o.x + dx, o.y, undefined, undefined, fl) && !(zl && !lsAt(o.x + dx, o.y))) o.x += dx;
    if (free(o.x, o.y + dy, undefined, undefined, fl) && !(zl && !lsAt(o.x, o.y + dy))) o.y += dy;
  }
  const lsAt = (x, y) => G._ls.has(Math.floor(x / CH) + ',' + Math.floor(y / CH)); // ponto em chunk carregado?
  const hz = z => typeof z.id === 'string' && z.id.charCodeAt(0) === 104 && z.id.charCodeAt(1) === 58; // id 'h:' = membro de horda (nunca vai ao diff)
  const houseAt = e => { const h = G.houses.find(h => e.x >= h.x && e.x <= h.x + h.w && e.y >= h.y && e.y <= h.y + h.h); return h ? h.id : null; };
  function randFree(minFromPlayer) {
    for (let i = 0; i < 500; i++) {
      const p = { x: rnd((G.ref[0] - 1) * CH + 1, (G.ref[0] + 2) * CH - 1), y: rnd((G.ref[1] - 1) * CH + 1, (G.ref[1] + 2) * CH - 1) }; // 3x3 da referencia
      if (free(p.x, p.y, 1) && !houseAt(p) && dist(p, G.player) > minFromPlayer) return p;
    }
    return { x: 1, y: 1 }; // shortcut: fallback de canto, improvavel
  }
  // ponto livre mais perto de (x,y): aneis de 0,5 a 6 m (12 angulos); senao um ponto livre qualquer
  function nearFree(x, y) {
    if (free(x, y)) return { x, y };
    for (let r = 0.5; r <= 6; r += 0.5) for (let k = 0; k < 12; k++) { const q = { x: x + Math.cos(k * Math.PI / 6) * r, y: y + Math.sin(k * Math.PI / 6) * r }; if (free(q.x, q.y)) return q; }
    return randFree(0);
  }
  function newZombie() {
    const p = randFree(25);
    if (!lsAt(p.x, p.y)) return null; // J5.1: so nasce em chunk carregado (senao congelava e sumia do save)
    const zid = 'p:' + G.nextId++, runner = rng() < 0.05, z = { id: zid, ch: chOf(p), x: p.x, y: p.y, hp: 60, state: 'idle', alert: 0, atk: 0, runner, police: false, ...zv(zid) };
    if (!runner && rng() < 0.1) z.crawl = true; // rastejante ~10 %
    return z;
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
  const ACT = { swing: 0.25, shot: 0.15, eat: 0.6, heal: 0.6, equip: 0.4, craft: 0.8, pick: 0.4, drop: 0.4, hurt: 0.3, windup: 1.0, jump: 0.6, climb: 2, throw: 0.4, cut: 1.5, stairs: 0.8 };
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
    if (p.floor && !pt) tomb.floor = 1; // morreu no andar de cima: a tumba fica la
    if (G._ls.has(ch)) G.crates.push(tomb); // senao (raro) vai direto ao diff do chunk
    else { const d = G.chunks[ch] = G.chunks[ch] || { visit: Math.floor(G.t / 60) }; (d.crates = d.crates || {})[tomb.id] = strip(tomb); }
    if (car) { car.speed = 0; if (pt) car.dir = pt.d; G.events.push({ type: 'engine', on: false, id: car.id }); }
    p._eng = false;
    Object.assign(p, { x: 23, y: 23, hp: 100, hunger: 100, inv: [{ id: 'food', qty: 1 }], weapon: 'pipe', equip: {}, car: null, action: null, near: null, open: null, floor: 0 }); // mochila (equip.back) ja foi para a tumba
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
    if (car.burnt) { hint('burnt', 'Carcaça queimada — não anda mais', 'carDmg'); return; }
    if (car.hp <= 0) { hint('carDead', 'Motor destruído — este carro não anda mais', 'carDmg'); return; }
    if (!p.inv.some(i => i.id === 'key' && i.car === id)) { G.events.push({ type: 'noKey', id }); hint('nokey', 'Precisa da chave deste carro — procure nas casas próximas', 'key'); return; }
    setCrouch(p, false);
    Object.assign(p, { car: id, action: null, near: null, x: car.x, y: car.y, dir: car.dir, running: false });
    car.speed = 0; p._eng = car.fuel > 0; p._stop = 0;
    G.events.push({ type: 'enter', id });
    if (p._eng) G.events.push({ type: 'engine', on: true, id });
    hint('engine', p._eng ? 'Motor ligado — joystick para frente acelera, para trás freia e dá ré' : 'Sem gasolina o motor não liga — ache gasolina (sifão)', p._eng ? 'car' : 'siphon');
  }
  function exitCar(p, car, force) { // force (incendio): sempre sai, no ponto livre mais perto
    const e = exitPoint(car) || (force && Object.assign(nearFree(car.x, car.y), { d: car.dir }));
    if (!e) { hint('exitBlocked', 'Sem espaço para sair — manobre o carro', 'car'); return; }
    Object.assign(car, { dir: e.d, speed: 0 }); Object.assign(p, { x: e.x, y: e.y, car: null, dir: e.d });
    G.events.push({ type: 'exit', id: car.id });
    if (p._eng) { p._eng = false; G.events.push({ type: 'engine', on: false, id: car.id }); }
  }
  // ---- dano de carro: bater acima de CAR_HIT m/s estraga; hp 0 + batida forte (dano >= 10) com gasolina => vazamento ou incendio (50/50) ----
  const CAR_HIT = 5, CAR_BURN = 5;
  const carAt = (x, y, m, skipId) => G.cars.find(c => c.id !== skipId && inBox(carBox(c), x, y, m));
  function damageCar(car, d) {
    if (car.burnt || !(d > 0)) return;
    const was = car.hp; car.hp = Math.max(0, was - d);
    G.events.push({ type: 'carDmg', id: car.id, d, hp: car.hp });
    hint('carDmg', 'Bater rápido estraga o carro — acima de 18 km/h', 'carDmg');
    if (car.hp > 0) return;
    if (was > 0) { G.events.push({ type: 'carDead', id: car.id }); hint('carDead', 'Motor destruído — este carro não anda mais', 'carDmg'); }
    else if (d >= 10 && car.fuel > 0 && !(car.burn > 0)) {
      if (rng() < 0.5) { car.fuel = 0; addSpill(car.x, car.y); }
      else { car.burn = CAR_BURN; G.events.push({ type: 'carFire', id: car.id }); hint('carFire', 'Saia do carro!', 'car'); }
    }
  }
  function addSpill(x, y) {
    const e = { x, y }; e.ch = chOf(e);
    G.spills.push({ id: e.ch + ':s:' + G.nextId++, ch: e.ch, x, y, r: 2.5, expires: G.t + 300 });
    const l = G.spills.filter(s => s.ch === e.ch); if (l.length > 4) G.spills.splice(G.spills.indexOf(l[0]), 1);
    G.events.push({ type: 'spill', x, y });
    hint('spill', 'Gasolina vazando — fogo aqui acende a poça', 'carDmg');
  }
  // dano em area. boom: explosao (cai com a distancia, empurra 2 m, ruido 40 m, fere o jogador); senao fogo (dano chapado so em zumbis). Ambos acendem pocas no raio
  function blast(x, y, r, dmg, boom) {
    const p = G.player, o = { x, y };
    for (const z of G.zombies) {
      const d = dist(z, o);
      if (boom && z.hp <= 0) continue;
      if (d <= r && !(boom && blocked(x, y, z.x, z.y))) { hurt(z, boom ? dmg * (1 - d / r) : dmg); if (boom && d > 0.01) move(z, (z.x - x) / d * 2, (z.y - y) / d * 2); }
      if (boom && d <= 40 && dist(z, p) <= G.viewR && z.hp > 0) { z.alert = 6; z.state = 'chase'; }
    }
    if (boom) {
      const d = dist(p, o);
      if (d <= r && !blocked(x, y, p.x, p.y)) { hurtPlayer(dmg * (1 - d / r)); if (d > 0.01) move(p, (p.x - x) / d * 2, (p.y - y) / d * 2); }
      G.events.push({ type: 'blast', x, y, r });
    }
    for (const s of G.spills.filter(s => dist(s, o) <= r + s.r)) {
      G.spills.splice(G.spills.indexOf(s), 1);
      G.fires.push({ x: s.x, y: s.y, t0: G.t, n: 0, r: 2.5, max: 6 }); if (G.fires.length > 4) G.fires.shift();
      G.events.push({ type: 'fire', x: s.x, y: s.y });
    }
  }
  // incendio de carro: CAR_BURN s e explode (dano 60 ate 5 m), vira carcaca; pocas expiram
  function tickCars(dt) {
    for (const c of G.cars) {
      if (!(c.burn > 0) || (c.burn -= dt) > 0) continue;
      const p = G.player; if (p.car === c.id) exitCar(p, c, true);
      c.burn = 0; c.burnt = true; c.fuel = 0; c.trunk = [];
      blast(c.x, c.y, 5, 60, true);
    }
    G.spills = G.spills.filter(s => s.expires > G.t);
  }
  const approach = (v, t, s) => v > t ? Math.max(t, v - s) : Math.min(t, v + s);
  // mx = volante, my = acelerador (+ acelera, - freia/re); um passo dt <= 0,05
  function driveCar(p, car, mx, my, dt) {
    let v = car.speed || 0;
    const on = car.fuel > 0 && car.hp > 0 && !car.burnt, vm = 11 * (0.4 + 0.6 * Math.max(0, car.hp) / 100); // vida baixa = mais lento; hp 0 = motor morto
    if (!on && p._eng) { p._eng = false; G.events.push({ type: 'engine', on: false, id: car.id }); } // tanque zerado por fora (sifao)
    p._stop = Math.abs(v) < 0.1 ? (p._stop || 0) + dt : 0;
    if (!on) v = approach(v, 0, 8 * dt);
    else if (my > 0.05) v = v >= 0 ? Math.min(vm, v + 4 * my * dt) : Math.min(0, v + 8 * dt);
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
      if (Math.abs(v) > CAR_HIT) { const d = (Math.abs(v) - CAR_HIT) * 7, o = carAt(nx + c * 2 * f, ny + s * 2 * f, 0.1, car.id) || carAt(nx, ny, 1.2, car.id); damageCar(car, d); if (o) damageCar(o, d); } // carro parado atingido leva o mesmo
      v = -v * 0.2; break;
    }
    car.speed = v;
    for (const z of G.zombies) {
      const d = dist(z, car);
      if (d > 2.5) z._hitBy = false;
      else if (d < 1.4 && Math.abs(car.speed) > 2 && !z._hitBy && z.hp > 0) {
        hurt(z, Math.abs(car.speed) * 4); z._hitBy = true;
        if (Math.abs(car.speed) > CAR_HIT) damageCar(car, 2 + (Math.abs(car.speed) - CAR_HIT) * 1.5);
        car.speed *= 0.6;
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
  const tankAct = (p, t) => { const gc = p.inv.find(i => i.id === 'gascan'); return gc && p.inv.some(i => i.id === 'hose') && t.fuel > 0 && (gc.fuel || 0) < 10 ? 'siphon' : null; }; // tanque so se esvazia
  function updateSiphon(p, car, len, dt) {
    const n = p.near, c = n && !car && (G.cars.find(c => c.id === n.id) || G.tanks.find(t => t.id === n.id)), a = p.action;
    const gc = p.inv.find(i => i.id === 'gascan');
    if (a && a.type === 'siphon' && (!p.input.hold || len > 0.01 || !c || !n.act || n.act !== a.act)) { p.action = null; a.act = null; }
    if (!c || !p.input.hold || len > 0.01 || G.dead || (p.action && p.action.type !== 'siphon')) return;
    if (!gc || !p.inv.some(i => i.id === 'hose')) { hint('siphon', 'Precisa de mangueira + galão', 'siphon'); return; }
    if (!n.act) return;
    if (!p.action) { p.action = { type: 'siphon', id: c.id, act: n.act }; setAct(p, 'siphon'); if (n.type === 'tank') G.events.push({ type: 'tank', id: c.id }); }
    const pour = n.act === 'pour', gf = gc.fuel || 0;
    const m = Math.min(2 * dt, pour ? Math.min(gf, 10 - c.fuel) : Math.min(c.fuel, 10 - gf));
    if (pour) { c.fuel += m; gc.fuel = gf - m; } else { c.fuel -= m; gc.fuel = gf + m; }
    G.events.push({ type: pour ? 'pour' : 'siphon', l: m, id: c.id });
  }
  // alvo tocado -> {near, dr?} se valido (<= 2,5 m e sem parede no meio; a propria porta nao tapa a linha); senao null
  function pickTarget(p, t) {
    const sees = (x, y, dr) => { const o = dr && [dr.open, dr.locked]; if (dr) { dr.open = true; dr.locked = false; } const b = blocked(p.x, p.y, x, y, undefined, p.floor || 0); if (dr) { dr.open = o[0]; dr.locked = o[1]; } return !b; };
    if (t.type === 'door') {
      const dr = G.houses.flatMap(h => h.doors || []).find(d => d.id === t.id);
      return dr && dBox(dr, p.x, p.y) <= 2.5 && sees(dr.x + dr.w / 2, dr.y + dr.h / 2, dr) ? { near: { type: 'door', id: dr.id, open: dr.open, locked: !!dr.locked }, dr } : null;
    }
    const l = t.type === 'drop' ? G.drops : t.type === 'crate' || t.type === 'tomb' ? G.crates : null, e = l && l.find(c => c.id === t.id);
    if (!e || e.scenery || (t.type === 'tomb') !== !!e.tomb) return null;
    return (e.w ? dBox(cbox(e), p.x, p.y) : dist(e, p)) <= 2.5 && sees(e.x, e.y) ? { near: e.locked ? { type: 'crate', id: e.id, locked: true } : { type: t.type, id: e.id } } : null;
  }
  // CORTAR: segurar AÇÃO 1,5 s perto de porta trancada com alicate; joystick > 0,3 ou soltar cancela
  function updateCut(p, car, len, dt) {
    const n = p.near, a = p.action, dr = n && n.locked && (n.type === 'door' ? G.houses.flatMap(h => h.doors || []).find(d => d.id === n.id) : n.type === 'crate' ? G.crates.find(c => c.id === n.id) : null), cu = p.inv.find(i => i.id === 'cutter'); // porta ou armario com cadeado
    if (a && a.type === 'cut' && (!p.input.hold || len > 0.3 || !dr || !cu || a.id !== n.id || G.dead)) { p.action = null; return; }
    if (!a && dr && cu && p.input.hold && !car && !G.dead) { p.action = { type: 'cut', id: dr.id, t: 0 }; setAct(p, 'cut'); }
    if (!p.action || p.action.type !== 'cut') return;
    p.noise = 6;
    if ((p.action.t += dt) < 1.5) return;
    p.action = null; dr.locked = false; p.input.hold = false;
    G.events.push({ type: 'cut', id: dr.id });
    if (n.type === 'door') { dr.open = true; dr.hp = Math.min(dr.hp, 100); G.events.push({ type: 'door', id: dr.id, open: true }); }
    if (--cu.dur <= 0) { p.inv.splice(p.inv.indexOf(cu), 1); G.events.push({ type: 'toolBreak' }); hint('toolBreak', 'O alicate quebrou — procure outro em caixas de ferramentas', 'cutter'); }
  }
  // mira assistida (dono): corpo a corpo = mais perto a <= 2,2 m no cone de 100 graus p/ cada lado; pistola = <= 12 m, 35 graus, linha livre. G.aim so e lido pelo render
  function aimOf(p) {
    const gun = p.weapon === 'pistol', R = gun ? 12 : 1.7, A = gun ? Math.PI * 35 / 180 : Math.PI * 100 / 180;
    if (p.weapon === 'molotov' || p.car || G.dead) return null;
    let b = null, bd = R + 1;
    for (const z of G.zombies) {
      const d = dist(z, p);
      if (z.hp > 0 && d <= R && d < bd && (z.floor || 0) === (p.floor || 0) && angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.dir) <= A && !blocked(p.x, p.y, z.x, z.y, undefined, p.floor || 0)) { b = z; bd = d; }
    }
    return b;
  }
  // golpe nas costas (dono): jogador fora do cone da frente do zumbi = dano x2 e chance de matar na hora (50 % se nao tinha notado, 25 % se ja perseguia)
  function strike(z, dmg, p) {
    if (z.hp <= 0) return;
    if (front(z, p)) { hurt(z, dmg); z.alert = Math.max(z.alert, 6); return; } // atingido de frente: passa a perseguir
    const kill = rng() < (z.state === 'idle' && !(z.alert > 0) ? 0.5 : 0.25);
    G.events.push({ type: 'backstab', id: z.id, kill });
    if (kill) { hurt(z, z.hp); G.events.push({ type: 'stealthKill', id: z.id }); } else { hurt(z, dmg * 2); z.alert = Math.max(z.alert, 6); }
    hint('furtivo2', 'Golpe pelas costas: dano dobrado e chance de derrubar na hora', 'furtivo');
  }
  // tiro que acertou: 1 rng() => cabeca (10 %, +10 % se <= 4 m e parado) mata; senao dano 50 e perna (25 %): 1o ⇒ manco, 2o (ou ja manco) ⇒ rastejante
  // erro do tiro (dono): base 20 %, +15 % andando, +30 % correndo, +2 %/m alem de 4 m, -10 % agachado ou parado; 5-70 %. 1 rng(): v < miss erra; senao v renormalizado decide cabeca/perna
  const missOf = (p, d) => { const mv = hypot2(p.input.mx, p.input.my) > 0.01; return Math.max(0.05, Math.min(0.7, 0.2 + (p.running ? 0.3 : mv ? 0.15 : 0) + 0.02 * Math.max(0, d - 4) - (p.crouch || !mv ? 0.1 : 0))); };
  function shotFx(z, p) {
    const hs = 0.1 + (dist(z, p) <= 4 && hypot2(p.input.mx, p.input.my) <= 0.01 ? 0.1 : 0), ms = G.dev.noMiss ? 0 : missOf(p, dist(z, p)), r = rng();
    if (r < ms) { // errou: a bala passa e levanta poeira atras do alvo
      const a = Math.atan2(z.y - p.y, z.x - p.x), d = dist(z, p) + 2;
      G.events.push({ type: 'miss', x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d });
      hint('errou', 'Tiro de longe ou andando erra mais — pare e agache para mirar melhor', 'tiro');
      return;
    }
    const v = ms ? (r - ms) / (1 - ms) : r;
    if (v < hs) {
      hurt(z, z.hp); z.anim.hs = 1; G.events.push({ type: 'headshot', id: z.id });
      hint('headshot', 'Tiro na cabeça mata na hora — fique parado e perto para acertar mais', 'tiro');
      return;
    }
    strike(z, 50, p);
    if (z.hp <= 0 || v >= hs + 0.25) return;
    if (z.limp || z.crawl) { z.crawl = true; delete z.limp; } else z.limp = true;
    z.lg = G.t; G.events.push({ type: 'legshot', id: z.id, limp: !!z.limp, crawl: !!z.crawl });
    hint('limp', 'Manco: mais lento, mas ainda morde', 'tiro');
  }
  function playerAttack(p) {
    if (p.weapon === 'molotov') return G.throw();
    if (p.weapon !== 'pistol') {
      G.cd = 0.6; setAct(p, 'swing');
      G.events.push({ type: 'swing' });
      const a = aimOf(p); if (a) p.dir = Math.atan2(a.y - p.y, a.x - p.x);
      G.zombies.forEach(z => {
        if (dist(z, p) > 1.7 || (z.floor || 0) !== (p.floor || 0) || blocked(p.x, p.y, z.x, z.y, undefined, p.floor || 0) || angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.dir) > Math.PI / 4) return;
        strike(z, p.weapon === 'pipe_r' ? 35 : 25, p);
      });
    } else {
      const am = p.inv.find(i => i.id === 'ammo');
      if (!am) return;
      if (--am.qty <= 0) p.inv.splice(p.inv.indexOf(am), 1);
      G.cd = 0.4; setAct(p, 'shot');
      const best = aimOf(p); if (best) p.dir = Math.atan2(best.y - p.y, best.x - p.x);
      G.events.push({ type: 'shot', x: p.x, y: p.y, dir: p.dir });
      if (best) shotFx(best, p);
      G.zombies.forEach(z => { if (z.hp > 0 && dist(z, p) <= Math.min(5, G.viewR)) { z.alert = 6; z.state = 'chase'; } }); // dono: o tiro alerta so a 5 m, e so quem esta na tela
    }
  }
  // molotov: alvo = zumbi mais perto entre 3,5 e 12 m no cone de 60 graus sem parede; senao 6 m a frente. Voo 0,5 s, depois dano 35 (2,5 m) e fogo
  function throwMolotov(p) {
    const it = p.inv.find(i => i.id === 'molotov');
    if (!it || G.cd > 0 || p.car || G.dead) return false;
    let best = null, bd = 12;
    for (const z of G.zombies) { const d = dist(z, p); if (d >= 3.5 && d <= bd && angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.dir) <= Math.PI / 6 && (z.floor || 0) === (p.floor || 0) && !blocked(p.x, p.y, z.x, z.y, undefined, p.floor || 0)) { best = z; bd = d; } }
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
      blast(f.x, f.y, 2.5, 35); // fogo: dano chapado em zumbis + acende pocas
      G.fires.push({ x: f.x, y: f.y, t0: G.t, n: 0 }); if (G.fires.length > 4) G.fires.shift();
      G.events.push({ type: 'fire', x: f.x, y: f.y });
    }
    G.flights = G.flights.filter(f => !f.done);
    for (const f of G.fires) { // 3 ticks (idades 1, 2, 3 s); o jogador perde dur so no 1o golpe. Zumbis so queimam nos ticks 2 e 3 (10 cada): shortcut p/ casar com os asserts T1 (35 exato aos 2 s, >= 20 no total)
      if (G.t - f.t0 < (f.n || 0) + 1 - 1e-6) continue;
      f.n = (f.n || 0) + 1;
      if (f.n > 1) for (const z of G.zombies) if (dist(z, f) <= (f.r || 2) && !blocked(f.x, f.y, z.x, z.y)) { hurt(z, 10); G.events.push({ type: 'burn', id: z.id }); }
      if (dist(p, f) <= (f.r || 2) && !blocked(f.x, f.y, p.x, p.y)) { hurtPlayer(8, f.hit); f.hit = true; G.events.push({ type: 'burn', id: 'player' }); }
    }
    G.fires = G.fires.filter(f => (f.n || 0) < (f.max || 3));
  }
  // todo dano ao jogador: -20 % por peca (max 60 %); cada golpe absorvido gasta 1 de dur nas pecas
  function hurtPlayer(d, nodur) {
    if (G.dev.god) return;
    const p = G.player, eq = p.equip || {}, parts = Object.keys(eq).filter(k => eq[k] && k !== 'back'); // mochila nao e armadura
    p.hp -= d * (1 - Math.min(0.6, 0.2 * parts.length));
    if (!nodur) for (const k of parts) if (--eq[k].dur <= 0) { G.events.push({ type: 'armorBreak', part: k }); delete eq[k]; hint('armorBreak', 'Sua armadura quebrou', 'armor'); }
  }
  function hurt(z, dmg) {
    z.hp -= dmg;
    G.events.push({ type: 'hit', x: z.x, y: z.y });
    if (z.hp <= 0 && !(z.anim && z.anim.act === 'dead')) { z.anim = { move: 'idle', act: 'dead', t: 0 }; G.dying.push({ id: z.id, x: z.x, y: z.y, anim: z.anim, crawl: !!z.crawl }); } // corpo some em 1,5 s
  }

  const zf = z => z.face !== undefined ? z.face : (z.face = zv(String(z.id)).face);
  const front = (z, p) => angDiff(Math.atan2(p.y - z.y, p.x - z.x), zf(z)) <= Math.PI / 3; // jogador no cone de 120 graus da frente
  const idPhase = id => { let v = 0; for (const c of String(id)) v = (v * 31 + c.charCodeAt(0)) % 25; return v / 100; }; // escalona o recalculo por id
  // proximo waypoint contra a casa h (so ela): vao/porta aberta visivel mais perto do alvo; senao porta fechada; senao canto
  function navWay(z, p, h) {
    const cur = z.way, cand = [];
    (h.gaps || []).forEach((g, gi) => {
      if ((g.floor || 0) !== (z.floor || 0)) return;
      const dr = (h.doors || []).find(d => Math.abs(d.x + d.w / 2 - g.x) < 1e-6 && Math.abs(d.y + d.h / 2 - g.y) < 1e-6), closed = dr && (!dr.open || dr.locked), lk = dr && dr.locked;
      if (closed) { dr.open = true; dr.locked = false; } // a propria porta nao tapa a vista ate ela
      const vis = !blocked(z.x, z.y, g.x, g.y, [h], z.floor || 0);
      if (closed) { dr.open = false; dr.locked = lk; }
      if (vis && !(z.last || []).some(l => l.h === h.id && l.gi === gi && G.t - l.t < 10)) cand.push({ x: g.x, y: g.y, gi, dr: closed ? dr : null, s: hypot2(g.x - p.x, g.y - p.y) });
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
    if (cur && cur.gi === undefined && hypot2(cur.x - z.x, cur.y - z.y) > 0.3 && !blocked(z.x, z.y, cur.x, cur.y, [h], z.floor || 0)) return cur;
    const m = 0.6, cs = [[h.x - m, h.y - m], [h.x + h.w + m, h.y - m], [h.x - m, h.y + h.h + m], [h.x + h.w + m, h.y + h.h + m]];
    let bw = null, bs = 1e9;
    for (const c of cs) {
      const sc = hypot2(c[0] - z.x, c[1] - z.y) + hypot2(c[0] - p.x, c[1] - p.y);
      if (sc < bs && hypot2(c[0] - z.x, c[1] - z.y) > 0.3 && !blocked(z.x, z.y, c[0], c[1], [h], z.floor || 0)) { bs = sc; bw = { x: c[0], y: c[1] }; }
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
    let best = s0, bd = hypot2(cx(s0) - gx, cy(s0) - gy);
    for (let k = 0; k < qu.length && k < 400; k++) { // teto de nos (~3 m de raio): pico de BFS ~2 ms; acima disso fica o melhor ate ali
      const c = qu[k], i = c % nx, j = Math.floor(c / nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj, n = b * nx + a;
        if (a < 0 || b < 0 || a >= nx || b >= ny || prev[n] !== -2 || !free(cx(n), cy(n), undefined, undefined, z.floor || 0)) continue;
        prev[n] = c; qu.push(n);
        const d = hypot2(cx(n) - gx, cy(n) - gy);
        if (d < bd - 1e-9) { bd = d; best = n; }
      }
    }
    const path = []; for (let c = best; c !== -1; c = prev[c]) path.push(c);
    path.reverse();
    const t = path[Math.min(5, path.length - 1)];
    return { x: cx(t), y: cy(t) };
  }

  function updateZombie(z, p, dt) {
    const d = dist(z, p), fl = z.floor || 0, fd = fl !== (p.floor || 0); // fd: andar diferente (nao ataca; vai a escada)
    z.alert = Math.max(0, z.alert - dt);
    const za = z.anim || (z.anim = { move: 'idle', act: null, t: 0 }); za.t += dt;
    const hS = fd ? G.houses.find(q => q.stairs && inBox(q, fl ? z.x : p.x, fl ? z.y : p.y, 0.3)) : null, S = hS && hS.stairs;
    const tg = S && inBox(hS, z.x, z.y, 0.3) ? { x: fl ? S.lx1 : S.lx0, y: fl ? S.ly1 : S.ly0 } : p; // alvo: o jogador, ou o pe da escada quando ele esta em outro andar
    let h = null; // casa no caminho (parede/porta fechada), em cache 0,25 s por zumbi
    if (d < 12 && !fd) { if (!(G.t < z.ht)) { z.ht = G.t + 0.25 + idPhase(z.id) * 0.1; z.hc = G.houses.find(h => blocked(z.x, z.y, p.x, p.y, [h], fl)) || null; } h = z.hc; }
    const cw = !!z.crawl, rA = cw ? 0.8 : 1.1, rW = cw ? 0.9 : 1.2, rC = cw ? 1.0 : 1.2; // alcances por tipo: rastejante e baixo, so pega perto
    if (d <= rA && !h && !fd) z.state = 'attack';
    else if ((!h && !fd && front(z, p) && d < (p.crouch ? 0.5 : p.running ? 5 : 2)) || (d <= (p.noise || 0) && d <= G.viewR) || z.alert > 0 || (z.state === 'chase' && d < 5)) z.state = 'chase'; // dono: so de frente (120 graus), sem parede: 5 m correndo, 2 andando/parado, 0,5 agachado; perde a 5 m
    else z.state = 'idle';
    if (cw && fd) z.state = 'idle'; // rastejante nao usa escada
    z.sc = Math.max(0, (z.sc || 0) - dt);
    if (z.state === 'chase' && d < 5 && z.sc <= 0 && !G._sc) { // grito (J1.1): puxa ate 4 zumbis parados a <= 5 m dele; 1 grito por update, cooldown 3 s
      G._sc = 1; z.sc = 3 + idPhase(z.id) * 4; let n = 0;
      G.events.push({ type: 'scream', id: z.id });
      for (const o of G.zombies) {
        if (n >= 4) break;
        if (o === z || o.hp <= 0 || o.state !== 'idle' || o.alert > 0 || (o.floor || 0) !== fl) continue;
        const dx = o.x - z.x, dy = o.y - z.y;
        if (dx * dx + dy * dy <= 25 && dist(o, p) <= G.viewR && !blocked(z.x, z.y, o.x, o.y, undefined, fl)) { o.alert = 4; n++; }
      }
    }
    if (z.police && d < 10) hint('police', 'Policial zumbi: pode soltar munição ou pistola', 'police');
    z.zc = Math.max(0, (z.zc || 0) - dt);
    if (z.wu > 0 && (d > rC || fd)) z.wu = 0; // saiu do alcance (ou do andar): cancela, sem dano
    if (z.wu > 0) { // windup parado; ao fim fere se ainda no alcance
      if ((z.wu -= dt) <= 1e-9) { z.wu = 0; z.zc = 1.8; const dm = p.car ? 8 : 15; hurtPlayer(dm); G.events.push({ type: 'hurt', id: z.id, d: dm }); }
    } else if (d <= rW && !h && !fd && z.zc <= 0) { z.wu = cw ? 1.2 : 1.0; G.events.push({ type: 'windup', id: z.id }); }
    let mv = z.state === 'chase' ? 'walk' : 'idle';
    if (z.state === 'idle' && z.hg && z.ho && !fd) { // membro de horda parado: anda ate a posicao do grupo + deslocamento (sem pathTo; preso = espera)
      const P = hordePos(z.hg, G.t), tx = P.x + z.ho[0], ty = P.y + z.ho[1], dd = hypot2(tx - z.x, ty - z.y);
      if (dd > 0.5 && dd < 40) {
        const a = Math.atan2(ty - z.y, tx - z.x), s = Math.min(dd, (dd > 3 ? 1.2 : 0.8) * (z.crawl ? 0.5 : 1) * dt), nx = z.x + Math.cos(a) * s, ny = z.y + Math.sin(a) * s;
        if (free(nx, ny, undefined, undefined, fl) && lsAt(nx, ny)) { z.x = nx; z.y = ny; z.face = a; mv = 'walk'; }
      }
    }
    const ac = z.wu > 0 ? 'windup' : z.zc > 1.5 ? 'hit' : null;
    za.move = mv; if (za.act !== ac && za.act !== 'climb') { za.act = ac; za.t = 0; }
    if (z.state === 'attack') return;
    if (z.state === 'chase') {
      const a = Math.atan2(tg.y - z.y, tg.x - z.x), s = (z.crawl ? 0.8 : (z.runner ? 4 : 2.2) * (z.limp ? 0.6 : 1)) * dt; z.face = a;
      z.side = z.side || (rng() < 0.5 ? 1 : -1);
      const tryDir = ang => { const nx = z.x + Math.cos(ang) * s, ny = z.y + Math.sin(ang) * s; if (!free(nx, ny, undefined, undefined, z.floor || 0) || !lsAt(nx, ny)) return false; z.x = nx; z.y = ny; return true; };
      const slide = ang => { const c = Math.cos(ang) * s, n = Math.sin(ang) * s; // so um eixo (encosta e desliza)
        for (const [ax, ay] of Math.abs(c) > Math.abs(n) ? [[c, 0], [0, n]] : [[0, n], [c, 0]]) if (Math.abs(ax + ay) > s * 0.3 && free(z.x + ax, z.y + ay, undefined, undefined, z.floor || 0) && lsAt(z.x + ax, z.y + ay)) { z.x += ax; z.y += ay; return true; }
        return false; };
      if (d <= 6 && G.fences.length && !fl && !fd && !cw) { // cerca na reta (cache 0,25 s): encostado nela, sobe e atravessa
        if (!(G.t < z.fct)) { z.fct = G.t + 0.25 + idPhase(z.id) * 0.1; z.fc = G.fences.find(f => segHit(z.x, z.y, p.x, p.y, f)) || null; }
        if (z.fc && dBox(z.fc, z.x, z.y) < 0.7) {
          if ((z.climb = (z.climb || 0) + dt) > (z.runner ? 1.2 : 2)) {
            z.climb = 0; za.act = null;
            for (const k of [1.2, 1.5, 1.8, 2.1]) { const nx = z.x + Math.cos(a) * k, ny = z.y + Math.sin(a) * k; if (free(nx, ny, undefined, undefined, z.floor || 0) && lsAt(nx, ny)) { z.x = nx; z.y = ny; z.fc = null; z.fct = G.t + 0.5; G.events.push({ type: 'climb', id: z.id }); break; } }
          } else { if (za.act !== 'climb') { za.act = 'climb'; za.t = 0; } }
          return;
        }
      }
      if (z.climb) { z.climb = 0; if (za.act === 'climb') za.act = null; }
      z.fl = z.fl || 0;
      if (tg !== p && hypot2(tg.x - z.x, tg.y - z.y) < 0.5) { // no pe da escada de outro andar: encosta 0,8 s e sobe/desce
        if ((z.st = (z.st || 0) + dt) >= 0.8) { z.st = 0; const nx = fl ? S.lx0 : S.lx1, ny = fl ? S.ly0 : S.ly1; z.x = nx; z.y = ny; z.floor = fl ? 0 : 1; z.way = null; z.pw = null; G.events.push({ type: 'stairs', id: z.id, up: !fl, x: nx, y: ny }); }
        return;
      }
      z.st = 0;
      const hn = fd ? G.houses.find(q => blocked(z.x, z.y, tg.x, tg.y, [q], fl)) || null : h; // casa que atrapalha o caminho ate o alvo
      let aim = null;
      if (!hn) { // reta livre; se vinha de um vao, termina a travessia (o corpo de 0,4 m nao cabe em qualquer reta livre)
        z.bang = 0;
        const cw = z.way;
        if (cw && cw.hh && G.t - cw.t0 < 4) {
          if ((z.rc -= dt) <= 0) { z.rc = 0.25; const nw = navWay(z, tg, cw.hh); z.way = nw && nw.gi === cw.gi ? nw : null; }
          if (z.way) aim = Math.atan2(z.way.y - z.y, z.way.x - z.x);
        } else z.way = null;
      } else {
        z.rc = (z.rc === undefined ? idPhase(z.id) : z.rc) - dt;
        if (z.rc <= 0 || !z.way) { z.rc = 0.25; z.way = navWay(z, tg, hn); }
        const w = z.way;
        if (w && w.dr && dBox(w.dr, z.x, z.y) < 0.75) { // porta fechada no caminho: zumbi nao abre, bate 25/s (soma entre zumbis; 100 hp, trancada 200) ate quebrar
          const dr = w.dr; dr.hp -= 25 * dt;
          if (!(G.t < dr.nht)) { dr.nht = G.t + 0.8; G.events.push({ type: 'doorHit', id: dr.id, hp: Math.max(0, Math.round(dr.hp)) }); if (d < 12) hint('doorHit', 'Zumbis estão quebrando a porta — ela cede aos poucos', 'porta'); }
          if (dr.hp <= 0) { dr.hp = 0; dr.broken = dr.open = true; dr.locked = false; z.way = null; G.events.push({ type: 'doorBreak', id: dr.id }); }
          return;
        }
        z.bang = 0;
        if (w) aim = Math.atan2(w.y - z.y, w.x - z.x);
      }
      const stuck = z.ck && hypot2(z.x - z.ck.x, z.y - z.ck.y) < 0.25;
      if ((!z.ck || G.t - z.ck.t > 0.6) && !(stuck && G._pn >= 1)) { // empacado (<0,25 m em 0,6 s): grade ate o alvo (vao atual ou jogador); sem orcamento, tenta no proximo quadro
        if (stuck) { G._pn++; const g = z.way && !z.way.dr ? z.way : tg, q = pathTo(z, g.x, g.y); if (q) z.pw = { x: q.x, y: q.y, t: G.t + 0.9 }; }
        z.ck = { x: z.x, y: z.y, t: G.t };
      }
      if (z.pw && z.pw.t > G.t) aim = Math.atan2(z.pw.y - z.y, z.pw.x - z.x);
      const b = aim !== null ? aim : a;
      if (tryDir(b)) { z.fl = 0; return; }
      if (++z.fl >= 4 && !(z.pw && z.pw.t > G.t) && G._pn < 1) { // 4 passos seguidos sem avancar: grade ja (1 BFS por update; o resto tenta no proximo)
        G._pn++; const g = z.way && !z.way.dr ? z.way : tg, q = pathTo(z, g.x, g.y); z.fl = 0;
        if (q) { z.pw = { x: q.x, y: q.y, t: G.t + 0.9 }; if (tryDir(Math.atan2(q.y - z.y, q.x - z.x))) return; }
      }
      for (const o of [Math.PI / 2, 2.0, 2.6]) for (const sd of [z.side, -z.side]) // sem rota: desliza pela tangente
        if (tryDir(b + o * sd) || slide(b + o * sd)) { z.side = sd; return; }
    }
  }

  function step(dt) {
    const p = G.player, inp = p.input;
    G.t += dt; G._pn = 0; G._sc = 0; // orcamento de BFS de perseguicao por quadro
    G.cd = Math.max(0, G.cd - dt);

    let mx = inp.mx, my = inp.my;
    const len = hypot2(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const car = p.car && G.cars.find(c => c.id === p.car);
    if (G.dev.noclip) G._nc = 1; else if (G._nc) { G._nc = 0; Object.assign(p, nearFree(p.x, p.y)); } // desligou: sai da parede
    if (p.car && !car) p.car = null; // shortcut: carro sumiu (save antigo); cai a pe
    const jp = p.action && p.action.type === 'jump';
    const wantRun = !car && !jp && !!inp.run && len > 0.01 && (G._rw ? p.stamina > 0 : p.stamina >= 5);
    if (inp.crouch) { inp.crouch = false; if (!car && !wantRun) setCrouch(p, !p.crouch); } // borda: um toque, um liga/desliga
    if (wantRun) setCrouch(p, false);
    const vel = wantRun ? (p.hunger < 25 ? 3.6 : 4.2) : p.crouch ? 1.5 : 3, ox = p.x, oy = p.y;
    if (car) driveCar(p, car, mx, my, dt);
    else if (jp) { const a = p.action; a.t += dt; const f = Math.min(1, a.t / ACT.jump); p.x = a.x0 + (a.x1 - a.x0) * f; p.y = a.y0 + (a.y1 - a.y0) * f; if (f >= 1) p.action = null; }
    else if (len > 0.01 && !(p.action && (p.action.type === 'cut' || p.action.type === 'stairs') && len <= 0.3)) { p.dir = Math.atan2(my, mx); move(p, mx * vel * dt, my * vel * dt); } // cortando: zona morta 0,3 do joystick
    const dm = hypot2(p.x - ox, p.y - oy), real = !car && dm > 0.5 * vel * dt; // deslocamento real (parado na parede nao conta)
    p.running = wantRun && real; G._rw = p.running;
    if (!G.hints.cidades && G.ways.length && onRoadIn([], G.ways, p.x, p.y)) hint('cidades', 'Estradas ligam cidades — postos ficam na saída', 'cidades');
    p.noise = car ? (p._eng ? 15 + 2 * Math.abs(car.speed) : 0) : 0; // ruido so do motor (e do corte, em updateCut); passos nao alertam: a percepcao e a do cone da frente
    const sp = p.stamina;
    p.stamina = Math.max(0, Math.min(100, p.stamina + (p.running ? -28 : (real && !p.crouch ? 2 : 8) * (p.hunger < 25 ? 0.5 : 1)) * dt));
    if (sp >= 15 && p.stamina < 15) { G.events.push({ type: 'staminaLow' }); hint('folego', 'Sem fôlego — ande para recuperar', 'correr'); }
    if (real && len >= 0.8 && !p.running) hint('correr', 'Empurre o joystick até a borda para correr', 'correr');
    p.anim.move = car ? 'idle' : p.crouch ? 'crouch' : p.running ? 'run' : dm > 0.01 ? 'walk' : 'idle';
    p.inside = houseAt(p);
    { const ih = p.inside && G.houses.find(h => h.id === p.inside), lh = ih && LMH[ih.kind]; if (lh) hint(lh[0], lh[1], lh[2]); }
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
      if (c.scenery) return; // cenario (cama, sofa, mesa, vaso, pia, caixa): so colide
      const d = c.w ? dBox(cbox(c), p.x, p.y) : dist(c, p);
      if (d < bd && (c.floor || 0) === (p.floor || 0) && !blocked(p.x, p.y, c.x, c.y, undefined, p.floor || 0)) { bd = d; p.near = c.locked ? { type: 'crate', id: c.id, locked: true } : { type: c.tomb ? 'tomb' : 'crate', id: c.id }; }
    });
    if (!car && !p.floor) G.tanks.forEach(t => { // tampa do tanque do posto: SIFONAR com mangueira + galao
      const d = dBox(cbox(t), p.x, p.y);
      if (d < bd && !blocked(p.x, p.y, t.x, t.y)) { bd = d; p.near = { type: 'tank', id: t.id, fuel: t.fuel, act: tankAct(p, t) }; hint('posto', 'Bomba sem energia: sifone a tampa do tanque com mangueira e galão', 'posto'); }
    });
    if (!car) G.drops.forEach(c => {
      const d = dist(c, p);
      if (d < bd && (c.floor || 0) === (p.floor || 0) && !blocked(p.x, p.y, c.x, c.y, undefined, p.floor || 0)) { bd = d; p.near = { type: 'drop', id: c.id }; }
    });
    if (!car) G.houses.forEach(h => { // escada a < 1 m vence movel e item (a porta so se estiver mais perto)
      const S = h.stairs; if (!S) return;
      const d = dBox(S, p.x, p.y);
      if (d < 1 && inBox(h, p.x, p.y, 1) && !blocked(p.x, p.y, S.x + S.w / 2, S.y + S.h / 2, [h], p.floor || 0)) { bd = d; p.near = { type: 'stairs', id: h.id, up: !(p.floor || 0) }; hint('sobrado', 'Escada: toque SUBIR (0,8 s parado) — o andar de cima tem quartos e zumbis', 'sobrado'); }
    });
    if (!car) G.houses.forEach(h => (h.doors || []).forEach(dr => {
      const d = dBox(dr, p.x, p.y) - (dr.open ? 0.3 : 0); // porta aberta perto: FECHAR ganha de leve
      if (d >= bd) return;
      const o = dr.open, lk = dr.locked; dr.open = true; dr.locked = false; // a propria porta nao tapa a linha ate ela
      const vis = !(p.floor) && !blocked(p.x, p.y, dr.x + dr.w / 2, dr.y + dr.h / 2);
      dr.open = o; dr.locked = lk;
      if (vis) { bd = d; p.near = { type: 'door', id: dr.id, open: dr.open, locked: !!dr.locked }; nd = dr; }
    }));
    // tocar para vasculhar: input.target {type,id} valido (<= 2,5 m, sem parede no meio) vira o alvo; persiste enquanto ha acao (vasculhar 1 s)
    if (inp.target) { if (!p.action) p._tg = inp.target; inp.target = null; }
    if (p._tg && !car && !G.dead) { const t = pickTarget(p, p._tg); if (t) { p.near = t.near; nd = t.dr || null; } else p._tg = null; } else p._tg = null;
    if (p.near && nd && p.near.type === 'door') {
      if (nd.gate) hint('garagem', 'Portão da garagem: toque AÇÃO para abrir. Carro dentro? A chave está em algum móvel da casa', 'garagem');
      if (nd.locked) { const cut = p.inv.some(i => i.id === 'cutter'); hint(cut ? 'cut' : 'locked', cut ? 'Porta trancada: segure CORTAR 1,5 s com o alicate' : 'Trancada com cadeado — procure um alicate corta-cadeado em caixas de ferramentas nas casas, oficinas, galpões e porta-malas', cut ? 'cutter' : 'locked'); }
      else if (!nd.open) hint('door', 'Toque AÇÃO para abrir', 'porta');
    }
    if (!car && !p.near) { // mala (traseira, com loot) ganha de carro; litros do tanque em near.fuel
      let cd = 1.5, nc = null, tk = null;
      for (const c of G.cars) {
        const d = dBox(carBox(c), p.x, p.y);
        if (d >= 1.5) continue;
        if (!tk && hypot2(p.x - (c.x - Math.cos(c.dir) * 2.1), p.y - (c.y - Math.sin(c.dir) * 2.1)) <= 1.5) tk = c;
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
        const cx = Math.max(nf.x, Math.min(p.x, nf.x + nf.w)) - p.x, cy = Math.max(nf.y, Math.min(p.y, nf.y + nf.h)) - p.y, l = hypot2(cx, cy) || 1;
        const ux = (hypot2(cx, cy) ? cx : Math.cos(p.dir)) / l, uy = (hypot2(cx, cy) ? cy : Math.sin(p.dir)) / l;
        if (p.stamina < 20) hint('folego', 'Sem fôlego — ande para recuperar', 'correr');
        else for (const k of [1.5, 1.0]) {
          const x1 = p.x + ux * k, y1 = p.y + uy * k;
          if (!free(x1, y1, undefined, undefined, p.floor || 0)) continue;
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
    if (p.action && p.action.type === 'stairs') { // subir/descer: parado 0,8 s; joystick > 0,3 ou sair do raio cancela
      const a = p.action, h = G.houses.find(q => q.id === a.id);
      if (len > 0.3 || !h || !p.near || p.near.type !== 'stairs' || p.near.id !== a.id) { p.action = null; if (p.anim.act === 'stairs') p.anim.act = null; G.events.push({ type: 'stairs', id: a.id, p: 0 }); }
      else if ((a.t += dt) >= 0.8) {
        const S = h.stairs, nf = (p.floor || 0) ? 0 : 1, nx = nf ? S.lx1 : S.lx0, ny = nf ? S.ly1 : S.ly0;
        p.action = null; if (p.anim.act === 'stairs') p.anim.act = null;
        if (free(nx, ny, undefined, undefined, nf)) { p.x = nx; p.y = ny; p.floor = nf; G.events.push({ type: 'stairs', id: a.id, up: !!nf, x: nx, y: ny, done: true }); if (nf) hint('andar1', 'Andar de cima: quartos e banheiro — olhe antes de andar, pode haver zumbi', 'sobrado'); }
      } else G.events.push({ type: 'stairs', id: a.id, p: a.t / 0.8 });
    }
    if (inp.interact) {
      inp.interact = false; // borda: um toque, uma acao
      const n = p.near;
      if (car) exitCar(p, car, car.burn > 0);
      else if (n && !p.action) {
        if (n.type === 'fence') { /* PULAR trata a cerca */ }
        else if (n.type === 'stairs') { p.action = { type: 'stairs', id: n.id, t: 0 }; setAct(p, 'stairs'); G.events.push({ type: 'stairs', id: n.id, p: 0 }); }
        else if (n.type === 'door') {
          const dr = G.houses.flatMap(h => h.doors || []).find(d => d.id === n.id);
          if (dr.locked) {
            if (p.inv.some(i => i.id === 'cutter')) hint('cutTap', 'Segure CORTAR 1,5 s', 'cutter');
            else { G.events.push({ type: 'locked', id: dr.id }); hint('locked', 'Trancada com cadeado — procure um alicate corta-cadeado em caixas de ferramentas nas casas, oficinas, galpões e porta-malas', 'locked'); }
          } else if (!dr.open) { dr.open = true; G.events.push({ type: 'door', id: dr.id, open: true, gate: !!dr.gate }); }
          else if (dr.broken) hint('doorBroken', 'Porta quebrada — não fecha mais', 'porta');
          else if ([p].concat(G.zombies).some(e => dBox(dr, e.x, e.y) < 1)) G.events.push({ type: 'hint', id: 'doorBusy', text: 'Saia da porta para fechar' });
          else { dr.open = false; G.events.push({ type: 'door', id: dr.id, open: false, gate: !!dr.gate }); }
        } else if (n.type === 'drop') {
          const dp = G.drops.find(d => d.id === n.id), it = Object.assign({}, dp.item);
          if (addItem(it)) { G.drops.splice(G.drops.indexOf(dp), 1); setAct(p, 'pick'); G.events.push({ type: 'pick', item: dp.item }); }
          else if (it.qty < (dp.item.qty === undefined ? 1 : dp.item.qty)) { dp.item.qty = it.qty; setAct(p, 'pick'); }
        } else if (n.type === 'tomb') {
          G.openC(n); // tumba abre na hora (sem 1 s)
        } else if (n.type === 'car') enterCar(p, n.id);
        else if (n.type === 'trunk') {
          if (G.cars.some(c => c.id === n.id && c.opened)) G.openC(n); // ja vasculhado: abre na hora
          else {
            p.action = { type: 'search', id: n.id, t: 0, trunk: true };
            G.events.push({ type: 'trunk', id: n.id }, { type: 'search', id: n.id, p: 0 });
            hint('trunk', 'Porta-malas: fique parado 1 s para abrir', 'trunk');
          }
        } else if (n.type === 'tank') hint(n.act ? 'tank' : 'siphon', n.act ? 'Segure SIFONAR para encher o galão' : n.fuel > 0 ? 'Precisa de mangueira + galão' : 'Tanque seco: nada para sifonar', 'posto');
        else if (n.locked) { if (p.inv.some(i => i.id === 'cutter')) hint('cutTap', 'Segure CORTAR 1,5 s', 'cutter'); else { G.events.push({ type: 'locked', id: n.id }); hint('armario', 'Armário de armas tem cadeado — procure um alicate corta-cadeado', 'delegacia'); } }
        else if (G.crates.some(c => c.id === n.id && c.opened)) G.openC(n); // ja vasculhado (marcador verde no topo): abre na hora, sem os 1 s
        else {
          p.action = { type: 'search', id: n.id, t: 0 };
          G.events.push({ type: 'search', id: n.id, p: 0 });
          hint('search', 'Abrir leva 1 s na primeira vez — fique parado; móvel vasculhado ganha um marcador verde e abre na hora', 'buscar');
        }
      }
    }

    updateCut(p, car, len, dt);
    if (!p.action) p._tg = null;
    G.aim = null; { const a = aimOf(p); if (a) { G.aim = { id: a.id, x: a.x, y: a.y, hs: p.weapon === 'pistol' && dist(a, p) <= 4 && len <= 0.01 }; hint('mira', 'Anel amarelo = alvo: ATACAR vira você para ele', 'atacar'); } }
    if (inp.attack && G.cd <= 0 && !car) playerAttack(p);
    updateFire(dt); tickCars(dt);
    updateSiphon(p, car, len, dt);

    G.zombies.forEach(z => { if (G._ls.has(z.ch)) updateZombie(z, p, dt); }); // so simula chunk carregado
    for (const z of G.zombies) if (z.hp <= 0 && z.hg && hz(z)) { const e = G.hordes[z.hg] || (G.hordes[z.hg] = { k: 0, m: 0 }); e.k++; e.m = Math.floor(G.t / 60); } // morte de membro: o grupo nao volta inteiro antes de 60 min
    for (const z of G.zombies) if (z.hp <= 0 && z.police) { // tabela do policial: 1 rng()
      const v = rng() * 100, it = v < 60 ? { id: 'ammo', qty: 3 + Math.floor(v / 15) } : { id: v < 85 ? 'pistol' : v < 95 ? 'bandage' : 'helmet', qty: 1 };
      G.drops.push({ id: z.ch + ':d:' + G.nextId++, ch: z.ch, x: z.x, y: z.y, item: it, expires: G.t + 300 });
    }
    G.zombies = G.zombies.filter(z => z.hp > 0);
    G.target = G.zombies.reduce((b, z) => (z.wu > 0 && (!b || dist(z, p) < dist(b, p)) ? z : b), null);
    G.dying = G.dying.filter(d => (d.anim.t += dt) < 1.5);
    // hint agachar: zumbi parado a < 10 m que ainda nao te viu
    if (!p.crouch && G.zombies.some(z => z.state === 'idle' && dist(z, p) < 10)) hint('agachar', 'Agache para passar sem ser notado', 'agachar');
    if (!car && G.zombies.some(z => z.state === 'idle' && z.hp > 0 && dist(z, p) < 4 && !front(z, p))) hint('furtivo', 'Zumbi de costas: ataque por trás — dano dobrado e chance de matar na hora', 'furtivo');

    G._spawn += dt;
    if (G._spawn >= 7.5 && G._spawn >= (G.t > 1200 ? 15 : 30) / infestAt(p.x, p.y)) { // 7,5 s = menor intervalo possivel (evita o hash a cada passo) // area infestada: spawn ate 2x mais rapido
      G._spawn = 0;
      if (G.zombies.length < 88 && G.zombies.reduce((n, z) => n + (hz(z) ? 0 : 1), 0) < Math.min(70, Math.max(45, 45 + G.t / 90))) { const z = newZombie(); if (z) G.zombies.push(z); }
    }

    const an = p.anim; an.t += dt;
    if (p.hp < G._hp && !an.act) setAct(p, 'hurt');
    G._hp = p.hp;
    if (an.act === 'search' || an.act === 'siphon' || an.act === 'cut' || an.act === 'stairs' ? !p.action && !p.open : an.act && an.act !== 'dead' && an.t >= ACT[an.act]) an.act = null;
    if (p.hp <= 0) die();
    if ((G._as += dt) >= 10) { G._as = 0; G.save(); }
  }

  // hash inteiro deterministico (cx,cy negativos ok)
  function hash(seed, cx, cy, extra = 0) {
    let h = seed | 0;
    for (const v of [cx, cy, extra]) { h = Math.imul(h ^ (v | 0), 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; }
    return h >>> 0;
  }
  const BLK_G = [[6, 6], [26, 6], [6, 26], [26, 26]]; // quarteiroes 14x14 (locais); gen usa BLK (rural: so o do sitio)
  // ---- cidades F1 (CIDADES.md): macro puro de G.seed (celula 800 m); memo FIFO por mapa (teto), limpo em start ----
  const MC = 800, EXP = 5, MEMO = { cen: new Map(), edge: new Map(), sq: new Map(), lm: new Map() };
  const fifo = (m, k, f, cap) => { let v = m.get(k); if (v === undefined) { v = f(); if (m.size >= cap) m.delete(m.keys().next().value); m.set(k, v); } return v; };
  const U = (a, b, tag) => hash(G.seed, a, b, tag) / 4294967296;
  const ctype = (mx, my) => { const u = U(mx, my, 20); return mx === 0 && my === 0 ? 2 : mx === 1 && my === 0 ? (u < 0.3 ? 2 : 1) : u < 0.3 ? 2 : u < 0.6 ? 1 : 0; }; // 2 cidade 30 % · 1 vila 30 % · 0 rural; (0,0) cidade, (1,0) nunca rural (estrada garantida)
  const cpos = (mx, my) => ctype(mx, my) ? (mx === 0 && my === 0 ? [107, 23] : [(mx + 0.3 + 0.4 * U(mx, my, 21)) * MC, (my + 0.3 + 0.4 * U(mx, my, 22)) * MC]) : null; // (0,0): spawn (23,23) = cruzamento 2P a oeste da praca
  // centro {id,C,R,t}: R limitado a 0,45 da distancia ao vizinho mais perto => duas cidades nunca se sobrepoem
  const center = (mx, my) => fifo(MEMO.cen, G.seed + ':' + mx + ',' + my, () => {
    const C = cpos(mx, my); if (!C) return null;
    let d = 1e9; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const q = (i || j) && cpos(mx + i, my + j); if (q) d = Math.min(d, hypot2(q[0] - C[0], q[1] - C[1])); }
    const t = ctype(mx, my);
    return Object.freeze({ id: mx + ',' + my, n: mx * 4099 + my, P: t === 2 ? 42 : 40, C: Object.freeze(C), R: Math.min(t === 2 ? 150 + 100 * U(mx, my, 23) : 70 + 40 * U(mx, my, 23), 0.45 * d), t });
  }, 64);
  const cityAt = (x, y) => {
    const mx = Math.floor(x / MC), my = Math.floor(y / MC);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const c = center(mx + i, my + j); if (c && hypot2(x - c.C[0], y - c.C[1]) < c.R) return c; }
    return null;
  };
  const ZN = {}; for (const z of ['centro', 'resid', 'perif', 'rural']) ZN[z] = Object.freeze({ zona: z });
  const zone = (x, y) => { const c = cityAt(x, y); if (!c) return ZN.rural; const q = hypot2(x - c.C[0], y - c.C[1]) / c.R; return q < 0.2 ? ZN.centro : q < 0.55 ? ZN.resid : ZN.perif; };
  // densidade por regiao de 4x4 chunks (J4.3): calma 0,5x (25 %), normal 1x (50 %), infestada 2x (25 %); centro da cidade tende a infestada. Puro de G.seed
  const infestAt = (x, y) => { const u = hash(G.seed, Math.floor(x / (4 * CH)), Math.floor(y / (4 * CH)), 9003) / 4294967296 + (zone(x, y).zona === 'centro' ? 0.2 : 0); return u < 0.25 ? 0.5 : u < 0.75 ? 1 : 2; };
  const urbanCh = (cx, cy) => zone(cx * CH + 20, cy * CH + 20).zona !== 'rural'; // chunk urbano = centro dentro do raio (grade BLK); senao rural
  // estrada entre portais de cidades vizinhas (dir 0 leste, 1 sul): curva sin2 (0 e derivada 0 nas pontas), polilinha de 48 pts memoizada
  const edgeAt = (mx, my, dir) => fifo(MEMO.edge, G.seed + ':' + mx + ',' + my + ',' + dir, () => {
    const a = center(mx, my), b = dir ? center(mx, my + 1) : center(mx + 1, my), tg = 24 + dir * 3;
    if (!a || !b || (!(mx === 0 && my === 0 && !dir) && U(mx, my, tg) >= 0.85)) return null;
    const portal = (c, sg) => { // ponta da avenida: fim da ultima faixa urbana, sobre rua da grade
      const al = dir, cr = 1 - dir, q = [0, 0]; q[cr] = c.C[cr]; // avenida = linha 0 da grade, sem jitter
      const row = Math.floor(q[cr] / CH), urb = i => dir ? urbanCh(row, i) : urbanCh(i, row);
      let k = Math.floor(c.C[al] / CH); while (urb(k + sg)) k += sg;
      q[al] = (sg > 0 ? k + 1 : k) * CH; return q;
    };
    const A = portal(a, 1), B = portal(b, -1), L = hypot2(B[0] - A[0], B[1] - A[1]), amp = Math.min(60, 0.12 * L), ax = dir ? [0, 0.5 * L] : [0.5 * L, 0]; // Hermite: entra e sai ao longo do eixo da avenida
    const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L, p1 = U(mx, my, tg + 1), p2 = U(mx, my, tg + 2), k1 = p1 < 0.5 ? 1 : 2, k2 = p2 < 0.5 ? 3 : 4, pts = [];
    for (let i = 0; i < 48; i++) {
      const t = i / 47, e = Math.sin(Math.PI * t) ** 2, off = amp * e * (Math.sin(2 * Math.PI * (t * k1 + p1)) * 0.6 + Math.sin(2 * Math.PI * (t * k2 + p2)) * 0.4), t2 = t * t, t3 = t2 * t;
      for (const c of [0, 1]) pts.push((2 * t3 - 3 * t2 + 1) * A[c] + (t3 - 2 * t2 + t) * ax[c] + (3 * t2 - 2 * t3) * B[c] + (t3 - t2) * ax[c] + (c ? ny : nx) * off);
    }
    const xs = pts.filter((_, i) => !(i & 1)), ys = pts.filter((_, i) => i & 1);
    return Object.freeze({ pts: Object.freeze(pts), w: 6, bb: Object.freeze([Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) + 6, Math.max(...ys) + 6]) });
  }, 64);
  // Liang-Barsky: parte [t0,t1] do segmento dentro do retangulo, ou null
  function lbClip(ax, ay, bx, by, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [t0, t1];
  }
  // ways do chunk: polilinhas das arestas das 3x3 macro-celulas recortadas ao chunk expandido (EXP m); a polilinha memoizada e a mesma nos dois lados da borda
  function chunkWays(cx, cy) {
    const x0 = cx * CH - EXP, y0 = cy * CH - EXP, x1 = (cx + 1) * CH + EXP, y1 = (cy + 1) * CH + EXP, mx = Math.floor((cx * CH + 20) / MC), my = Math.floor((cy * CH + 20) / MC), out = [];
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (let dir = 0; dir < 2; dir++) {
      const e = edgeAt(mx + i, my + j, dir); if (!e || e.bb[2] < x0 || e.bb[0] > x1 || e.bb[3] < y0 || e.bb[1] > y1) continue;
      const p = e.pts; let cur = null;
      for (let k = 0; k + 3 < p.length; k += 2) {
        const c = lbClip(p[k], p[k + 1], p[k + 2], p[k + 3], x0, y0, x1, y1);
        if (!c) { cur = null; continue; }
        const at = t => t === 0 ? [p[k], p[k + 1]] : t === 1 ? [p[k + 2], p[k + 3]] : [p[k] + (p[k + 2] - p[k]) * t, p[k + 1] + (p[k + 3] - p[k + 1]) * t];
        if (!cur) out.push(cur = { pts: [at(c[0])], w: e.w, kind: 'estrada' });
        cur.pts.push(at(c[1])); if (c[1] < 1) cur = null;
      }
    }
    return out.filter(w => w.pts.length > 1);
  }
  // ---- grade irregular F2 (CIDADES.md): linhas X(i)/Y(j) com jitter por cidade; linha par = rua principal (0 = avenida), impar = rua interna em 4 "bracos" por superquadra 2x2 ----
  const UC = (c, a, b, tag) => hash(G.seed ^ Math.imul(c.n, 0x9E3779B1), a, b, tag) / 4294967296;
  const lnPos = (c, k, ax) => c.C[ax] + k * c.P + (k === 0 || (c.id === '0,0' && ax === 0 && k === -2) ? 0 : c.P * 0.15 * (2 * UC(c, k, ax, 30) - 1)); // k=0 sem jitter (avenida); (0,0): x=23 = cruzamento do spawn
  const lnHW = k => k ? 3 : 5; // meia largura: ruas 6 m, avenida (linha 0) 10 m
  const MASKS = [15, 15, 15, 15, 15, 15, 7, 11, 13, 14, 7, 11, 13, 14, 3, 12, 1, 2, 4, 8, 0]; // bracos N1 S2 W4 E8: cruz, T (3 bracos), reta, rua sem saida (1), quadra cheia (0)
  // bracos da superquadra (I,J), memo FIFO: (0,0) = praca (cruz); braco cujo ponto de encontro com a rua principal cai em chunk nao urbano some (nada de rua solta na borda da cidade)
  const sqMask = (c, I, J) => fifo(MEMO.sq, G.seed + ':' + c.id + ':' + I + ',' + J, () => {
    const m = I === 0 && J === 0 ? 15 : MASKS[Math.floor(UC(c, I, J, 32) * MASKS.length)], xm = lnPos(c, 2 * I + 1, 0), ym = lnPos(c, 2 * J + 1, 1);
    const ok = (x, y) => { const q = cityAt(Math.floor(x / CH) * CH + 20, Math.floor(y / CH) * CH + 20); return !!q && q.id === c.id; };
    return m & ((ok(xm, lnPos(c, 2 * J, 1)) ? 1 : 0) | (ok(xm, lnPos(c, 2 * J + 2, 1)) ? 2 : 0) | (ok(lnPos(c, 2 * I, 0), ym) ? 4 : 0) | (ok(lnPos(c, 2 * I + 2, 0), ym) ? 8 : 0));
  }, 256);
  // lado s (0 W,1 E,2 N,3 S) da celula (i,j) tem rua? linha par sempre; impar so se o braco existe
  const sideRoad = (c, i, j, s) => {
    const v = s < 2, L = v ? i + s : j + s - 2;
    return !(L & 1) || !!(sqMask(c, v ? L >> 1 : i >> 1, v ? j >> 1 : L >> 1) & (v ? (j & 1 ? 2 : 1) : (i & 1 ? 8 : 4)));
  };
  // quadra (i,j) da cidade c (puro): {i,j,x,y,w,h,sd,plaza}; ln(k,ax) = posicao da linha k (memo opcional)
  const blkOf = (c, i, j, ln) => {
    ln = ln || ((k, ax) => lnPos(c, k, ax));
    const sd = [0, 1, 2, 3].reduce((a, s) => a | (sideRoad(c, i, j, s) ? 1 << s : 0), 0), x0 = ln(i, 0) + (sd & 1 ? lnHW(i) : 0), x1 = ln(i + 1, 0) - (sd & 2 ? lnHW(i + 1) : 0), y0 = ln(j, 1) + (sd & 4 ? lnHW(j) : 0), y1 = ln(j + 1, 1) - (sd & 8 ? lnHW(j + 1) : 0);
    return { i, j, x: x0, y: y0, w: x1 - x0, h: y1 - y0, sd, plaza: i === 0 && j === 0 };
  };
  // landmarks da cidade (F4, puro, memo FIFO): em ordem de importancia, cada um na 1a quadra candidata onde a planta fixa (rodada 0-3, deslizando <= 8 m) cabe INTEIRA num chunk urbano da cidade, <= 1 por chunk, nunca a <= 1 chunk de (0,0)
  // rot: 0 porta ao sul, 1 leste, 2 norte, 3 oeste (a quadra tem rua desse lado). Devolve [{kind,rot,i,j,x,y,w,h,cx,cy,fuel?}]
  const LMDIM = {}, dimOf = k => LMDIM[k] || (LMDIM[k] = (p => [p.w, p.h])(PLANS[k]()));
  const RSD = [8, 2, 4, 1]; // rot -> bit do lado da rua
  function cityLM(c) {
    return fifo(MEMO.lm, G.seed + ':' + c.id, () => {
      const n = Math.ceil(c.R / c.P) + 1, cells = [], ln = (k, ax) => lnPos(c, k, ax), used = new Set(), out = [];
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        const B = blkOf(c, i, j, ln), d = hypot2(B.x + B.w / 2 - c.C[0], B.y + B.h / 2 - c.C[1]) / c.R;
        if (!B.plaza && d < 0.95 && B.w > 12 && B.h > 12) cells.push(Object.assign(B, { d }));
      }
      cells.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
      const urb = (cx, cy) => { const q = cityAt(cx * CH + 20, cy * CH + 20); return !!q && q.id === c.id && Math.abs(cx) + Math.abs(cy) > 1; };
      const put = (kind, list, rots) => {
        if (!PLANS[kind]) return null; // fase seguinte
        const [w, h] = dimOf(kind);
        for (const B of list) for (const rot of rots ? rots(B) : [0, 2, 3, 1]) {
          if (!(B.sd & RSD[rot])) continue;
          const rw = rot & 1 ? h : w, rh = rot & 1 ? w : h;
          for (const dd of [0, 1, 2, 3, 4, 6, 8]) for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8]) {
            const x = rot & 1 ? (rot === 1 ? B.x + B.w - 1.5 - rw - dd : B.x + 1.5 + dd) : B.x + (B.w - rw) / 2 + off, y = rot & 1 ? B.y + (B.h - rh) / 2 + off : (rot === 0 ? B.y + B.h - 1.5 - rh - dd : B.y + 1.5 + dd);
            if (x < B.x + 1 || y < B.y + 1 || x + rw > B.x + B.w - 1 || y + rh > B.y + B.h - 1) continue;
            const cx = Math.floor(x / CH), cy = Math.floor(y / CH);
            if (Math.floor((x - 1) / CH) !== cx || Math.floor((x + rw + 1) / CH) !== cx || Math.floor((y - 1) / CH) !== cy || Math.floor((y + rh + 1) / CH) !== cy || used.has(cx + ',' + cy) || !urb(cx, cy)) continue;
            used.add(cx + ',' + cy);
            const m = { kind, rot, i: B.i, j: B.j, x, y, w: rw, h: rh, cx, cy }; out.push(m); return m;
          }
        }
        return null;
      };
      const near = cells, far = cells.slice().reverse(), mid = cells.filter(B => B.d > 0.2 && B.d < 0.65), ring = cells.filter(B => B.d > 0.3 && B.d < 0.7), pl = cells.filter(B => Math.abs(B.i) + Math.abs(B.j) === 1);
      const toPlaza = B => [B.j === 1 ? 2 : B.j === -1 ? 0 : B.i === 1 ? 3 : 1]; // porta voltada para a praca
      const u = (a, t) => UC(c, a, 0, t);
      put('igreja', pl, toPlaza) || put('igreja', near); // obrigatoria: se nenhuma quadra da praca comporta, a mais perto
      if (c.t === 2) {
        put('mercadoG', near); put('farmacia', near); put('delegacia', near.filter(B => B.d < 0.45)); put('hospital', near.filter(B => B.d < 0.45)); put('mercadoM', mid);
        const pt = put('posto', far); if (pt) pt.fuel = u(0, 42) < 0.4 ? 0 : Math.round((4 + 21 * u(0, 43)) * 10) / 10; if (u(0, 44) < 0.5) put('posto', far);
        put('escola', ring); for (let k = u(0, 45) < 0.6 ? 2 : 1; k > 0; k--) put('mercadoP', mid); if (u(0, 46) < 0.5) put('oficina', far);
        put('cemiterio', far); for (let k = u(0, 47) < 0.5 ? 2 : 1; k > 0; k--) put('galpao', far);
      } else {
        put('mercadoP', near); if (u(0, 48) < 0.6) { const pt = put('posto', far); if (pt) pt.fuel = u(0, 42) < 0.4 ? 0 : Math.round((4 + 21 * u(0, 43)) * 10) / 10; }
        if (u(0, 49) < 0.5) put('saude', mid); if (u(0, 50) < 0.5) put('escola', ring); if (u(0, 51) < 0.5) put('farmacia', near);
      }
      return out;
    }, 16);
  }
  const layoutOf = (cx, cy) => {
    const ox = cx * CH, oy = cy * CH, z = zone(ox + 20, oy + 20).zona, roads = [], lots = [], landmarks = [], c = z === 'rural' ? null : cityAt(ox + 20, oy + 20);
    const cl = (x0, y0, x1, y1) => { x0 = Math.max(x0, ox); y0 = Math.max(y0, oy); x1 = Math.min(x1, ox + CH); y1 = Math.min(y1, oy + CH); if (x1 - x0 > 1e-6 && y1 - y0 > 1e-6) roads.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); };
    if (c) {
      const P = c.P, i0 = Math.floor((ox - c.C[0]) / P) - 1, i1 = Math.ceil((ox + CH - c.C[0]) / P) + 1, j0 = Math.floor((oy - c.C[1]) / P) - 1, j1 = Math.ceil((oy + CH - c.C[1]) / P) + 1, cc = [{}, {}];
      const ln = (k, ax) => cc[ax][k] ?? (cc[ax][k] = lnPos(c, k, ax));
      for (let k = i0 & ~1; k <= i1 + 1; k += 2) cl(ln(k, 0) - lnHW(k), oy, ln(k, 0) + lnHW(k), oy + CH);
      for (let k = j0 & ~1; k <= j1 + 1; k += 2) cl(ox, ln(k, 1) - lnHW(k), ox + CH, ln(k, 1) + lnHW(k));
      for (let I = i0 >> 1; I <= (i1 + 1) >> 1; I++) for (let J = j0 >> 1; J <= (j1 + 1) >> 1; J++) { // bracos internos da superquadra
        const m = sqMask(c, I, J), xm = ln(2 * I + 1, 0), ym = ln(2 * J + 1, 1);
        if (m & 1) cl(xm - 3, ln(2 * J, 1), xm + 3, ym);
        if (m & 2) cl(xm - 3, ym, xm + 3, ln(2 * J + 2, 1));
        if (m & 4) cl(ln(2 * I, 0), ym - 3, xm, ym + 3);
        if (m & 8) cl(xm, ym - 3, ln(2 * I + 2, 0), ym + 3);
      }
      const lm = cityLM(c).find(q => q.cx === cx && q.cy === cy);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { // quadras (celulas) que tocam o chunk
        const B = blkOf(c, i, j, ln);
        if (B.x + B.w <= ox || B.x >= ox + CH || B.y + B.h <= oy || B.y >= oy + CH) continue;
        if (lm && lm.i === i && lm.j === j) { B.mk = lm; landmarks.push({ kind: lm.kind.slice(0, 7) === 'mercado' ? 'market' : lm.kind, x: lm.x + lm.w / 2, y: lm.y + lm.h / 2 }); }
        lots.push(B);
      }
    }
    return { zone: z, roads, ways: chunkWays(cx, cy), lots, landmarks };
  };
  // ponto em rua da grade (inBox) ou a <= w/2+m do eixo de uma way
  function onRoadIn(roads, ways, x, y, m = 0) {
    if (roads.some(r => inBox(r, x, y, m))) return true;
    return ways.some(w => { const p = w.pts, h = w.w / 2 + m; for (let i = 0; i + 1 < p.length; i++) if (segDist(x, y, p[i], p[i + 1]) <= h) return true; return false; });
  }
  // way mais perto de (x,y): [dist, px, py] do ponto do eixo (ou null)
  function wayNear(ways, x, y) {
    let best = null;
    for (const w of ways) for (let i = 0; i + 1 < w.pts.length; i++) {
      const a = w.pts[i], b = w.pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0, px = a[0] + dx * t, py = a[1] + dy * t, d = hypot2(x - px, y - py);
      if (!best || d < best[0]) best = [d, px, py];
    }
    return best;
  }
  function segDist(x, y, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0; return hypot2(x - a[0] - dx * t, y - a[1] - dy * t); }
  // loot por movel (soma 100); gascan sai vazio (mkItem)
  const FURN = {
    fridge: [['food', 10], [null, 90]],
    cabinet: [['food', 3], ['bottle', 3], ['rag', 3], [null, 91]],
    stove: [['food', 2], [null, 98]],
    wardrobe: [['rag', 7], ['jacket', 1.5], ['helmet', 1], ['shinguards', 0.5], ['bag_school', 1], ['bag_hiking', 0.5], [null, 88.5]],
    nightstand: [['rag', 3.5], ['bottle', 1.5], ['ammo', 0.5], [null, 94.5]],
    medcab: [['bandage', 4], [null, 96]],
    bookshelf: [['rag', 4], [null, 96]],
    drawer: [['wire', 5], ['rag', 3], ['bandage', 1.5], ['ammo', 1], ['pistol', 0.5], [null, 89]],
    shelf: [['food', 12], ['rag', 6], ['bandage', 3], [null, 79]], // gondola de mercado (comida e rara: 3 gondolas = ~1 comida por mercado)
    toolbox: [['cutter', 6], ['wire', 29], ['pipe', 5], ['rag', 10], [null, 50]], // caixa de ferramentas (rara, RNG proprio 17); fora da reposicao
    toolbox_oficina: [['wire', 20], ['pipe', 10], ['cutter', 4], ['hose', 4], ['rag', 8], [null, 54]], // bancada da oficina
    box_mercado: [['food', 12], ['wire', 8], ['rag', 6], ['bottle', 4], [null, 70]], // deposito do mercado
    box_posto: [['gascan', 10], ['hose', 6], ['rag', 6], [null, 78]], // loja do posto (galao vazio)
    box_galpao: [['wire', 15], ['hose', 6], ['gascan', 6], ['cutter', 3], [null, 70]],
    pshelf: [['bandage', 20], ['rag', 5], [null, 75]], // farmacia
    medcart: [['bandage', 15], ['rag', 5], [null, 80]], // carrinho do hospital
    gunlocker: [['ammo', 16], ['pistol', 5], ['helmet', 3], [null, 76]], // armario de armas da delegacia (cadeado)
    desk: [['rag', 5], ['bandage', 2], [null, 93]], // recepcao da delegacia
    locker: [['rag', 7], ['bag_school', 2], ['food', 2], [null, 89]], // vestiario da escola
    sacristy: [['rag', 4], ['bottle', 2], [null, 94]], // igreja e capela: sem arma nem municao
  };
  // dimensoes (w,h) de cada movel; SCEN = cenario (so colide, sem loot); ROOM = moveis de cada tipo de comodo, em ordem de prioridade
  const FD = { fridge: [0.8, 0.8], cabinet: [1.2, 0.5], wardrobe: [1.2, 0.6], drawer: [0.9, 0.5], shelf: [2, 0.7], stove: [0.7, 0.6], sink: [0.8, 0.5], bed: [1, 2], nightstand: [0.5, 0.5], toilet: [0.5, 0.7], medcab: [0.5, 0.3], sofa: [1.8, 0.8], bookshelf: [1.2, 0.4], table: [1, 1], toolbox: [0.5, 0.35], toolbox_oficina: [0.5, 0.35], box_mercado: [0.8, 0.8], box_posto: [0.8, 0.8], box_galpao: [0.8, 0.8], pshelf: [1.8, 0.6], medcart: [0.8, 0.5], gunlocker: [1.2, 0.5], desk: [1.4, 0.7], locker: [1.2, 0.5], sacristy: [1, 0.5], pew: [2.8, 0.6], altar: [2, 0.8], pump: [0.7, 0.5], counter: [2.2, 0.7], stretcher: [0.9, 2], bars: [1.3, 0.15], carteira: [0.9, 0.6], register: [0.8, 0.6] };
  const SCEN = new Set(['bed', 'sofa', 'table', 'toilet', 'sink', 'register', 'pew', 'altar', 'pump', 'counter', 'stretcher', 'bars', 'carteira']);
  const ROOM = { sala: ['drawer', 'sofa', 'bookshelf', 'table'], cozinha: ['fridge', 'stove', 'sink', 'cabinet'], quarto: ['bed', 'wardrobe', 'nightstand'], banheiro: ['toilet', 'sink', 'medcab'] };
  const WT = 0.2, DW = 1.4; // parede, vao
  const dBox = (b, x, y) => hypot2(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - y, 0, y - b.y - b.h));
  // ---- landmarks F4 (CIDADES.md 2.2): plantas fixas em coordenadas canonicas (frente = sul, +y); o gen roda 0-3 (rot) e translada. RNG so para loot e zumbis ----
  const LP = (w, h, bld, o) => Object.assign({ w, h, bld, parts: [], doors: [], gaps: [], rooms: [], furn: [], zs: [], cars: [], props: [], fences: [] }, o);
  const lpW = (P, x, y, w, h, fl) => { if (w > 0.01 && h > 0.01) P.parts.push(fl ? { x, y, w, h, floor: fl } : { x, y, w, h }); };
  // parede reta (v: vertical em x=pos; senao horizontal em y=pos) de a ate b; d = centro de uma abertura de largura dw: vao livre (sem o) ou porta(s) o
  function lpS(P, v, pos, a, b, d, dw, o, fl) {
    dw = dw || DW; const w = (s, e) => v ? lpW(P, pos - WT / 2, s, WT, e - s, fl) : lpW(P, s, pos - WT / 2, e - s, WT, fl);
    if (d == null) return w(a, b);
    w(a, d - dw / 2); w(d + dw / 2, b);
    const gp = v ? { x: pos, y: d } : { x: d, y: pos };
    if (fl) gp.floor = fl;
    if (o) { lpD(P, v, pos, d, dw, o); if ([].concat(o)[0].gate) gp.hw = dw / 2; }
    P.gaps.push(gp);
  }
  // porta(s) sem parede em volta (vao de largura dw centrado em d); varias portas dividem o vao
  function lpD(P, v, pos, d, dw, o) {
    const os = [].concat(o), dd = dw / os.length;
    os.forEach((q, k) => {
      const s = d - dw / 2 + k * dd, dr = Object.assign(v ? { x: pos - WT / 2, y: s, w: WT, h: dd } : { x: s, y: pos - WT / 2, w: dd, h: WT }, { open: false, locked: false, hp: 100 }, q);
      P.doors.push(dr); P.parts.push({ dk: P.doors.length - 1, x: dr.x, y: dr.y, w: dr.w, h: dr.h });
    });
  }
  // casca retangular com a porta na parede sul (centro dx, largura dw)
  const lpBox = (P, x, y, w, h, dx, dw, o, fl) => { lpW(P, x, y, w, WT, fl); lpW(P, x, y + WT, WT, h - 2 * WT, fl); lpW(P, x + w - WT, y + WT, WT, h - 2 * WT, fl); lpS(P, false, y + h - WT / 2, x, x + w, dx, dw, o, fl); };
  const lpR = (P, x0, y0, x1, y1, type, fl) => P.rooms.push(fl ? { x0, y0, x1, y1, type, floor: fl } : { x0, y0, x1, y1, type });
  // movel (x,y = centro; wall 0 N 1 S 2 W 3 E = parede onde encosta, -1 livre). o: {fd:[w,h] canonicos, floor, locked, p}
  function lpF(P, kind, x, y, wall, o) {
    o = o || {}; const [fw, fh] = o.fd || FD[kind] || [0.8, 0.6], hz = wall < 2, f = { kind, x, y, w: hz ? fw : fh, h: hz ? fh : fw, wall };
    if (o.floor) f.floor = o.floor; if (o.locked) f.locked = true; if (o.p !== undefined) f.p = o.p;
    P.furn.push(f);
  }
  const WRK = [[0, 1, 2, 3], [2, 3, 1, 0], [1, 0, 3, 2], [3, 2, 0, 1]], ROTA = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // parede do movel e giro de desenho por rotacao
  // planta rodada: rot 0 porta ao sul, 1 leste, 2 norte, 3 oeste (pontos -> ponto; retangulos -> retangulo)
  function lpRot(P, rot) {
    const W = P.w, H = P.h, odd = rot & 1;
    const pt = (x, y) => rot === 0 ? [x, y] : rot === 1 ? [y, W - x] : rot === 2 ? [W - x, H - y] : [H - y, x];
    const rc = o => { const r = rot === 0 ? [o.x, o.y, o.w, o.h] : rot === 1 ? [o.y, W - o.x - o.w, o.h, o.w] : rot === 2 ? [W - o.x - o.w, H - o.y - o.h, o.w, o.h] : [H - o.y - o.h, o.x, o.h, o.w]; return Object.assign({}, o, { x: r[0], y: r[1], w: r[2], h: r[3] }); };
    const cp = o => { const [x, y] = pt(o.x, o.y); return Object.assign({}, o, { x, y }); };
    const R = Object.assign({}, P, { w: odd ? H : W, h: odd ? W : H });
    R.bld = rc(P.bld); if (P.yard) R.yard = rc(P.yard);
    R.parts = P.parts.map(rc); R.doors = P.doors.map(rc); R.gaps = P.gaps.map(cp);
    R.rooms = P.rooms.map(m => { const a = pt(m.x0, m.y0), b = pt(m.x1, m.y1); return Object.assign({}, m, { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) }); });
    R.furn = P.furn.map(f => { const q = cp(f); if (odd) { q.w = f.h; q.h = f.w; } q.wall = f.wall < 0 ? -1 : WRK[rot][f.wall]; return q; });
    R.fences = P.fences.map(rc); R.zs = P.zs.map(cp); R.cars = P.cars.map(c => Object.assign(cp(c), { dir: c.dir - ROTA[rot] }));
    R.props = P.props.map(q => Object.assign(cp(q), { a: (q.a || 0) + ROTA[rot] }));
    if (P.tank) R.tank = cp(P.tank);
    if (P.stairs) { const S = rc(P.stairs), a = pt(P.stairs.lx0, P.stairs.ly0), b = pt(P.stairs.lx1, P.stairs.ly1); Object.assign(S, { lx0: a[0], ly0: a[1], lx1: b[0], ly1: b[1] }); R.stairs = S; }
    return R;
  }
  const PLANS = {
    igreja() { // nave 8x14 com 8 bancos, altar, sacristia ao norte; torre (prop) ao lado da fachada
      const P = LP(10.2, 14, { x: 2.2, y: 0, w: 8, h: 14 }, { kind: 'igreja', pal: 1, zn: [3, 6] });
      lpBox(P, 2.2, 0, 8, 14, 6.2, 2, {}); lpS(P, false, 3.6, 2.4, 10, 8.2);
      lpR(P, 2.2, 0, 10.2, 3.6, 'sacristia'); lpR(P, 2.2, 3.6, 10.2, 14, 'nave');
      lpF(P, 'sacristy', 3.4, 0.45, 0); lpF(P, 'altar', 6.2, 4.1, 0);
      for (const y of [6, 7.8, 9.6, 11.4]) for (const x of [3.8, 8.6]) lpF(P, 'pew', x, y, -1);
      P.zs.push(...[[6.2, 6.1], [6.2, 9], [3.8, 6.9], [8.6, 8.7], [3.8, 10.5], [8.6, 6.9]].map(([x, y]) => ({ x, y })));
      P.props.push({ kind: 'torre', x: 1.1, y: 12.4, r: 1.1 });
      return P;
    },
    mercado(s) { // P 8x8 (1 gondola) | M 12x11 (3) | G 16x12 (5, 2 vaos no deposito); porta dupla de 2 m ao sul
      const [w, h] = s === 'P' ? [8, 8] : s === 'M' ? [12, 11] : [16, 12], P = LP(w, h, { x: 0, y: 0, w, h }, { kind: 'market', pal: 0, sign: 'MERCADO', size: s });
      lpBox(P, 0, 0, w, h, w / 2, 2, [{}, {}]);
      if (s === 'P') {
        lpR(P, 0, 0, w, h, 'salao'); lpF(P, 'shelf', 2.6, 0.55, 0); lpF(P, 'box_mercado', 6.8, 0.6, 0); lpF(P, 'register', 1.5, h - 0.5, 1); P.zs.push({ x: 4, y: 3.8 });
        return P;
      }
      for (const [a, b, d] of s === 'M' ? [[WT, w - WT, 3.5]] : [[WT, w / 2, 4], [w / 2, w - WT, w - 4]]) lpS(P, false, 3.4, a, b, d);
      lpR(P, 0, 0, w, 3.4, 'deposito'); lpR(P, 0, 3.4, w, h, 'salao');
      if (s === 'M') [2.2, 6, 9.8].forEach(x => lpF(P, 'shelf', x, 5.6, -1)); else [2.57, 5.29, 8.01, 10.73, 13.45].forEach(x => lpF(P, 'shelf', x, 6.5, 2)); // G: 5 gondolas em pe (corredores de 2 m)
      lpF(P, 'register', 1.5, h - 0.5, 1); lpF(P, 'register', w - 1.5, h - 0.5, 1);
      (s === 'M' ? [7.4, 9.8] : [7, 9, 14.6]).forEach(x => lpF(P, 'box_mercado', x, 0.6, 0)); if (s === 'G') lpF(P, 'box_mercado', 1.2, 0.6, 0, { p: 0.5 });
      P.zs.push(...(s === 'M' ? [[3.5, 7.2], [8.5, 7.2]] : [[3, 8], [6, 9], [10, 8.5], [13, 8]]).map(([x, y]) => ({ x, y })));
      return P;
    },
    mercadoP: () => PLANS.mercado('P'), mercadoM: () => PLANS.mercado('M'), mercadoG: () => PLANS.mercado('G'),
    farmacia() { // 7x8: balcao e 2 prateleiras de remedio
      const P = LP(7, 8, { x: 0, y: 0, w: 7, h: 8 }, { kind: 'farmacia', pal: 2, sign: 'FARMACIA', zn: [1, 2] });
      lpBox(P, 0, 0, 7, 8, 3.5, DW, {}); lpR(P, 0, 0, 7, 8, 'farmacia');
      lpF(P, 'pshelf', 1.5, 0.5, 0); lpF(P, 'pshelf', 5.3, 0.5, 0); lpF(P, 'counter', 3.5, 4.6, 0);
      P.zs.push({ x: 1.8, y: 3.2 }, { x: 5.4, y: 5.4 });
      return P;
    },
    delegacia() { // 10x10: cela (grade + porta SEMPRE trancada) no canto NO, armario de armas trancado, recepcao
      const P = LP(10, 10, { x: 0, y: 0, w: 10, h: 10 }, { kind: 'delegacia', pal: 2, sign: 'POLICIA', zn: [3, 5] });
      lpBox(P, 0, 0, 10, 10, 5, DW, {}); lpS(P, true, 4.1, WT, 4.4, null);
      lpD(P, false, 4.3, 2, 1.2, { locked: true, hp: 200 }); lpR(P, 0, 0, 4.1, 4.4, 'cela'); lpR(P, 4.1, 0, 10, 10, 'recepcao'); lpR(P, 0, 4.4, 4.1, 10, 'recepcao');
      lpF(P, 'bars', 0.8, 4.3, 0, { fd: [1.2, 0.15] }); lpF(P, 'bars', 3.3, 4.3, 0, { fd: [1.4, 0.15] });
      lpF(P, 'gunlocker', 7, 0.45, 0, { locked: true }); lpF(P, 'desk', 9.45, 6.6, 3);
      P.zs.push({ x: 2, y: 2.2, plain: 1 }, ...[[6, 3], [8.4, 3.6], [5.5, 6.5], [7.5, 8.2], [2.5, 7.5]].map(([x, y]) => ({ x, y, police: 1 })));
      return P;
    },
    posto() { // lote 12x10: loja 5x5 (sign) ao fundo, patio aberto com 2 bombas, cobertura e tampa do tanque; 0-1 carro com chave na gaveta do caixa
      const P = LP(12, 10, { x: 6.6, y: 0.4, w: 5, h: 5 }, { kind: 'posto', pal: 0, sign: 'POSTO', yard: { x: 0, y: 5.6, w: 12, h: 4.4 }, tank: { x: 1.5, y: 4.2 }, zn: [2, 3] });
      lpBox(P, 6.6, 0.4, 5, 5, 9.1, DW, {}); lpR(P, 6.6, 0.4, 11.6, 5.4, 'loja');
      lpF(P, 'shelf', 8, 0.95, 0); lpF(P, 'box_posto', 10.8, 1, 0); lpF(P, 'drawer', 11.15, 3.2, 3); lpF(P, 'register', 7.1, 3.2, 2);
      lpF(P, 'pump', 2.4, 6.5, 0); lpF(P, 'pump', 4.9, 6.5, 0);
      P.props.push({ kind: 'cobertura', x: 3.65, y: 6.5 });
      P.cars.push({ x: 3.4, y: 8.6, dir: 0, p: 0.5, fuel: 3 });
      P.zs.push({ x: 5.5, y: 8.2 }, { x: 9.2, y: 7.8 }, { x: 1.8, y: 8.8 });
      return P;
    },
    oficina() { // 8x8, portao 2,4 m, carro 60 % com a chave na gaveta da bancada, 2 bancadas de ferramentas
      const P = LP(8, 8, { x: 0, y: 0, w: 8, h: 8 }, { kind: 'oficina', pal: 0, sign: 'OFICINA' });
      lpBox(P, 0, 0, 8, 8, 4, 2.4, { gate: true }); lpR(P, 0, 0, 8, 8, 'oficina');
      lpF(P, 'toolbox_oficina', 0.375, 2.6, 2); lpF(P, 'toolbox_oficina', 0.375, 5.4, 2); lpF(P, 'drawer', 7.55, 2.4, 3);
      P.cars.push({ x: 4, y: 4.3, dir: Math.PI / 2, p: 0.6 });
      P.zs.push({ x: 1.8, y: 6.8, look: 'macacao' }, { x: 6.4, y: 6.6, look: 'macacao', p: 0.5 });
      return P;
    },
    hospital() { // 14x12, 2 andares (escada na parede leste): terreo recepcao + farmacia interna (50 % trancada); andar 1 = 2 enfermarias. 3 carrinhos + 2 armarinhos; jaleco
      const P = LP(14, 12, { x: 0, y: 0, w: 14, h: 12 }, { kind: 'hospital', pal: 2, zn: [4, 8], look: 'jaleco', stairs: { x: 12.8, y: 4, w: 1, h: 2.4, lx0: 13.3, ly0: 7.2, lx1: 13.3, ly1: 3.2 } });
      lpBox(P, 0, 0, 14, 12, 7, DW, {}); lpS(P, true, 3.8, WT, 3.9, null); lpS(P, false, 3.8, WT, 3.9, 2, 1.2, { lockP: 0.5 });
      lpR(P, 0, 0, 3.9, 3.9, 'farmacia'); lpR(P, 0, 0, 14, 12, 'recepcao');
      lpF(P, 'pshelf', 1.6, 0.5, 0); lpF(P, 'desk', 3, 11.45, 1); lpF(P, 'medcart', 10.5, 11.55, 1); lpF(P, 'medcab', 7, 0.35, 0); lpF(P, 'stretcher', 8, 5.5, -1);
      lpW(P, 0, 0, 14, WT, 1); lpW(P, 0, WT, WT, 11.6, 1); lpW(P, 14 - WT, WT, WT, 11.6, 1); lpW(P, 0, 12 - WT, 14, WT, 1); lpS(P, true, 7, WT, 11.8, 8, DW, null, 1);
      lpR(P, 0, 0, 7, 12, 'enfermaria', 1); lpR(P, 7, 0, 14, 12, 'enfermaria', 1);
      for (const [x, y] of [[2.2, 3.5], [4.6, 3.5], [9.5, 3.5]]) lpF(P, 'stretcher', x, y, -1, { floor: 1 });
      lpF(P, 'medcart', 5.5, 11.55, 1, { floor: 1 }); lpF(P, 'medcart', 9, 11.55, 1, { floor: 1 }); lpF(P, 'medcab', 3.5, 0.35, 0, { floor: 1 });
      P.zs.push({ x: 4.5, y: 7 }, { x: 3.5, y: 6.5, floor: 1 }, { x: 10, y: 9.5 }, { x: 10.5, y: 7.8, floor: 1 }, { x: 6, y: 2.5 }, { x: 11, y: 2.5, floor: 1 }, { x: 2, y: 9.5, floor: 1 }, { x: 5, y: 9, floor: 1 });
      return P;
    },
    saude() { // posto de saude 8x8: recepcao, 1 carrinho + 1 armarinho; jaleco
      const P = LP(8, 8, { x: 0, y: 0, w: 8, h: 8 }, { kind: 'saude', pal: 2, zn: [1, 2], look: 'jaleco' });
      lpBox(P, 0, 0, 8, 8, 4, DW, {}); lpR(P, 0, 0, 8, 8, 'recepcao');
      lpF(P, 'medcab', 4, 0.35, 0); lpF(P, 'medcart', 6.8, 0.45, 0); lpF(P, 'desk', 1.8, 7.45, 1); lpF(P, 'stretcher', 6, 5, -1);
      P.zs.push({ x: 3, y: 3.5 }, { x: 5.5, y: 6.8 });
      return P;
    },
    escola() { // 12x10: 3 salas de carteiras ao norte, cantina (geladeira + armario) e vestiario (armarios) ao sul, corredor central
      const P = LP(12, 10, { x: 0, y: 0, w: 12, h: 10 }, { kind: 'escola', pal: 1, sign: 'ESCOLA', zn: [2, 4] });
      lpBox(P, 0, 0, 12, 10, 6, DW, {});
      for (const x of [4, 8]) { lpS(P, true, x, WT, 5, 2.5); lpS(P, true, x, 5, 9.8, 7.5); }
      lpS(P, false, 5, WT, 4.1, null); lpS(P, false, 5, 4, 8, 6); lpS(P, false, 5, 7.9, 11.8, null);
      for (const [a, b, t] of [[0, 0, 'sala'], [4, 0, 'sala'], [8, 0, 'sala'], [0, 5, 'cantina'], [4, 5, 'corredor'], [8, 5, 'vestiario']]) lpR(P, a, b, a + 4, b + 5, t);
      for (const [dx, xs] of [[0, [1, 2.7]], [8, [9.1, 10.9]], [4, [4.9, 7.1]]]) for (const x of xs) for (const y of [1.2, 3.9]) lpF(P, 'carteira', x, y, -1);
      lpF(P, 'fridge', 1, 5.5, 0); lpF(P, 'cabinet', 2.9, 5.35, 0); lpF(P, 'locker', 11.55, 6.4, 3); lpF(P, 'locker', 11.55, 8.6, 3);
      P.zs.push({ x: 6, y: 7.5 }, { x: 6, y: 2.5 }, { x: 10, y: 7.5 }, { x: 2.2, y: 7.8 }, { x: 2, y: 2.5 });
      return P;
    },
    cemiterio() { // lote 16x14 cercado (portao aberto ao sul), 12 lapides, capela 4x5 com sacristia ao norte
      const P = LP(16, 14, { x: 6, y: 0.6, w: 4, h: 5 }, { kind: 'capela', pal: 1, zn: [1, 2] });
      lpBox(P, 6, 0.6, 4, 5, 8, DW, {}); lpR(P, 6, 0.6, 10, 5.6, 'capela'); lpF(P, 'sacristy', 8, 1.05, 0);
      P.fences.push({ x: 0, y: 0, w: 16, h: 0.2 }, { x: 0, y: 0.2, w: 0.2, h: 13.8 }, { x: 15.8, y: 0.2, w: 0.2, h: 13.8 }, { x: 0.2, y: 13.8, w: 6.3, h: 0.2 }, { x: 9.5, y: 13.8, w: 6.3, h: 0.2 });
      for (const y of [7, 9.2, 11.4]) for (const x of [2.2, 4.4, 11.6, 13.8]) P.props.push({ kind: 'lapide', x, y, r: 0.3 });
      P.zs.push({ x: 3.3, y: 8.1 }, { x: 12.7, y: 10.3 });
      return P;
    },
    galpao() { // 14x10: portao de 3 m, 3-4 caixas, sala de controle (gaveta com a chave) e van 30 %
      const P = LP(14, 10, { x: 0, y: 0, w: 14, h: 10 }, { kind: 'galpao', pal: 0, zn: [1, 3], look: 'macacao' });
      lpBox(P, 0, 0, 14, 10, 5, 3, { gate: true }); lpR(P, 0, 0, 9.8, 10, 'galpao'); lpR(P, 9.8, 0, 14, 4, 'controle');
      lpS(P, true, 9.8, WT, 4.1, null); lpS(P, false, 4, 9.8, 13.8, 11.8);
      [1.2, 3.2, 5.2].forEach(x => lpF(P, 'box_galpao', x, 0.6, 0)); lpF(P, 'box_galpao', 7.2, 0.6, 0, { p: 0.5 }); lpF(P, 'drawer', 13.55, 1.8, 3);
      P.cars.push({ x: 7, y: 6.2, dir: Math.PI / 2, p: 0.3 });
      P.zs.push({ x: 2.5, y: 6.5 }, { x: 11.5, y: 7.5 }, { x: 8.7, y: 2.5 });
      return P;
    },
  };
  const TBG = [['wire', 10], ['cutter', 1], ['pipe', 3], ['hose', 3], [null, 83]]; // caixa de ferramentas da garagem (alicate 1 %: com 3 % o alicate passava de 40 % dos mundos; dono: alicate raro)
  const TRUNK = [['rag', 12], ['wire', 8], ['food', 6], ['bottle', 6], ['hose', 6], ['gascan', 5], ['pipe', 5], ['bag_hiking', 2], ['cutter', 3], [null, 47]]; // porta-malas (soma 100), RNG proprio
  const RB = { s: new Uint8Array(6400), b: new Uint8Array(6400), q: new Int32Array(6400) }; // 80x80 celulas: casa de ate 17 m
  const UNIQUE_SPAWN = new Set(['key', 'gascan', 'hose']);
  const REPO_OK = new Set(['rag', 'wire', 'bottle']); // unico material que a reposicao devolve
  const P_TB = 0.12; // chance de caixa de ferramentas por casa (rara, calibrada)
  const zv = id => { let h = 0; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x9E3779B1) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B) >>> 0; return { look: h % 8, size: 0.9 + ((h >>> 8) % 201) / 1000, face: ((h >>> 16) % 628) / 100 }; }; // face: para onde olha parado (rad) // variacao visual do zumbi, por id
  function pick(r, tab) { let v = r() * 100; for (const [id, w] of tab) if ((v -= w) < 0) return id; return null; }
  function mkItem(r, id) { return id === 'gascan' ? { id, fuel: 0, qty: 1 } : id === 'cutter' ? { id, qty: 1, dur: 4 } : id === 'ammo' ? { id, qty: 3 + Math.floor(r() * 4) } : { id, qty: 1 }; }

  // pura: so le G.seed. Tudo em coordenadas de mundo.
  function gen(cx, cy) {
    const r = mulberry32(hash(G.seed, cx, cy)), ox = cx * CH, oy = cy * CH, ch = cx + ',' + cy;
    const origin = cx === 0 && cy === 0, near = Math.abs(cx) + Math.abs(cy) === 1;
    let n = 0; const nid = () => ch + ':' + n++;
    const L = layoutOf(cx, cy), rural = L.zone === 'rural', o = { roads: L.roads, ways: L.ways, zone: L.zone, houses: [], crates: [], zombies: [], cars: [], trees: [], fences: [], props: [], tanks: [] };
    // rural: sem grade; sitio (25 % dos chunks com way) num quarteirao a >= 14 m da way, porta virada para ela. BLK = so esse quarteirao
    let sb = -1, sFace = 0;
    if (rural && L.ways.length && U(cx, cy, 40) < 0.25) {
      let bd = 1e9;
      BLK_G.forEach(([bx, by], b) => { const wn = wayNear(L.ways, ox + bx + 7, oy + by + 7); if (wn && wn[0] >= 14 && wn[0] < bd) { bd = wn[0]; sb = b; const dx = wn[1] - ox - bx - 7, dy = wn[2] - oy - by - 7; sFace = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3); } });
    }
    // quadras locais: x0..y1 = bordas reais (rua ou linha), k* = recorte no chunk (1,6 m de folga para a casa nunca encostar na borda), s = area / 196 (escala de arvores e props), sd = lados com rua
    const mkB = (x0, y0, x1, y1, sd, plaza, mk) => { const B = { x0, y0, x1, y1, sd, plaza, mk, kx0: Math.max(x0, 1.6), kx1: Math.min(x1, 38.4), ky0: Math.max(y0, 1.6), ky1: Math.min(y1, 38.4) }; B.s = Math.max(0, B.kx1 - B.kx0) * Math.max(0, B.ky1 - B.ky0) / 196; return B; };
    const BL = rural ? (sb < 0 ? [] : [mkB(BLK_G[sb][0], BLK_G[sb][1], BLK_G[sb][0] + 14, BLK_G[sb][1] + 14, 15, false)]) : L.lots.map(B => mkB(B.x - ox, B.y - oy, B.x + B.w - ox, B.y + B.h - oy, B.sd, B.plaza, B.mk && Object.assign({}, B.mk, { x: B.mk.x - ox, y: B.mk.y - oy })) /* landmark (copia local) */).filter(B => B.s > 0.15);
    const mb = BL.findIndex(B => B.mk), mk = mb < 0 ? null : BL[mb].mk; // mb = quadra do supermercado
    const RD = L.roads.map(q => ({ x: q.x - ox, y: q.y - oy, w: q.w, h: q.h })); // ruas do chunk (locais)
    const rgap = (a, b) => hypot2(Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w), Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h));
    const hs = [], inH = (x, y, m) => hs.some(h => x > h.x - m && x < h.x + h.w + m && y > h.y - m && y < h.y + h.h + m) || (!!mk && x > mk.x - m && x < mk.x + mk.w + m && y > mk.y - m && y < mk.y + mk.h + m);
    // casa 5-6 m na quadra b, encostada (folga 1-1,5 da calcada, 1 m entre casas) numa rua; side = parede da rua (porta); so lados com rua, dentro do recorte do chunk
    const cnt = [], zn = L.zone;
    function place(b, fs) { // fs: lado fixo (sitio: so tenta esse lado)
      const B = BL[b];
      if (B.plaza) return false;
      const lk = b * 64 + (cnt[b] = (cnt[b] || 0) + 1), lr = mulberry32(hash(G.seed, cx, cy, 100 + lk)); // RNG por lote (lot.key): independe dos vizinhos
      const urb = !rural && !origin, zc = zn === 'centro', zr = zn === 'resid';
      if (urb && lr() < (zc ? 0.02 : zr ? 0.05 : 0.12)) return false; // baldio (spawn nunca)
      const u1 = lr(), u2 = lr(), u3 = lr(), ls = lr() < 0.5 ? 0 : 1, ps = zc ? 0.4 : zr ? 0.15 : 0;
      let shape = 'plain';
      if (urb) {
        if (u1 < ps && !mk && hs.filter(q => q.shape === 'sobrado').length < 2) shape = 'sobrado'; // <=2 por chunk, 0 com landmark
        else if (u1 >= ps && u1 < ps + 0.2 && ps && hs.length <= 10) shape = 'pair';
        else if (!zc && u2 < 0.25) shape = 'L'; else if (!zc && u2 < 0.45) shape = 'gar';
      }
      const rec = zc ? 1 : zr ? 2.2 : zn === "perif" ? 2.8 : 1; // recuo da frente por zona
      const s0 = fs === undefined ? Math.floor(lr() * 4) : fs, t0 = lr(), first = !hs.some(q => q.b === b), all = hs.concat(mk || []);
      const sizes = shape === 'sobrado' ? [[6.5 + lr() * 1.5, 6.5 + lr() * 1.5], [6.5, 6.5], [6.5, 6.5, 1]] : [[5 + lr(), 5 + lr()], [5, 5], [5, 5, 1]];
      for (const sz of sizes) for (let si = 0; si < (fs === undefined ? 4 : 1); si++) for (let k = 0; k < 12; k++) { // varre lados e posicoes (a partir de um ponto sorteado): 2 casas por quarteirao quase sempre cabem
        const side = (s0 + si) % 4, v = side < 2, gap = sz[2] || rec + lr() * 0.5, f = first ? (t0 < 0.5 ? 0 : 1) : (t0 + k / 12) % 1; // 1a casa no canto, deixa o resto para a 2a
        let w = sz[0], h = sz[1];
        if (shape === 'pair') { w = v ? 7 : 9.8; h = v ? 9.8 : 7; } else if (shape === 'L' || shape === 'gar') { if (v) h += shape === 'L' ? 3.5 : 3; else w += shape === 'L' ? 3.5 : 3; } // bbox = corpo + ala lateral
        if (!(B.sd & (1 << side)) || B.kx1 - B.kx0 < w + 2 || B.ky1 - B.ky0 < h + 2) continue;
        const x = side < 2 ? (side === 0 ? B.x0 + gap : B.x1 - gap - w) : B.kx0 + 1 + f * (B.kx1 - B.kx0 - 2 - w);
        const y = side >= 2 ? (side === 2 ? B.y0 + gap : B.y1 - gap - h) : B.ky0 + 1 + f * (B.ky1 - B.ky0 - 2 - h);
        if (x < 1.6 || y < 1.6 || x + w > 38.4 || y + h > 38.4) continue;
        if (!all.every(q => x >= q.x + q.w + 1 || x + w <= q.x - 1 || y >= q.y + q.h + 1 || y + h <= q.y - 1)) continue;
        const dd = [x - B.x0, B.x1 - x - w, y - B.y0, B.y1 - y - h].map((d, i) => B.sd & (1 << i) ? d : 1e9); // porta na parede da rua mais proxima
        const sd = fs === undefined ? dd.indexOf(Math.min(...dd)) : fs;
        if (shape !== 'plain' && shape !== 'sobrado' && sd !== side) continue; // corpo + ala so com a frente voltada ao lado do sorteio
        if (fs === undefined) { // a rua mais perto de verdade (inclui bracos vizinhos) tem de estar desse lado
          const hb = { x, y, w, h }; let best = 1e9, fc = 0;
          for (const q of RD) { const g = rgap(hb, q); if (g < best - 1e-9) { best = g; fc = 0; } if (g <= best + 1e-9) fc |= (q.x + q.w <= x ? 1 : 0) | (q.x >= x + w ? 2 : 0) | (q.y + q.h <= y ? 4 : 0) | (q.y >= y + h ? 8 : 0); }
          if (!(fc & (1 << sd)) || best < 0.5) continue;
        }
        const q = { x, y, w, h, b, side: sd, shape, gap, key: lk };
        if (shape === 'L' || shape === 'gar') q.wing = { kind: shape, ls };
        if (zr && gap >= 2 && (shape === 'plain' || q.wing) && u3 < 0.3) q.porch = true; // varanda: resid 30 %, recuo >= 2
        if (shape === 'pair') { // 2 casas 5x7 coladas (parede comum 0,2), mesma rua
          const A = Object.assign({}, q), Bq = Object.assign({}, q, { key: lk + 32 });
          if (v) { A.h = Bq.h = 5; Bq.y = y + 4.8; } else { A.w = Bq.w = 5; Bq.x = x + 4.8; }
          hs.push(A, Bq);
        } else hs.push(q);
        return true;
      }
      return false;
    }
    // planta (2-4 comodos) + paredes + porta + moveis de uma casa; tenta de novo se algum comodo/movel ficar inalcancavel
    function build(q) {
      const rs = mulberry32(hash(G.seed, cx, cy, 200 + q.key)); // RNG da casa = lote (nao depende dos vizinhos)
      let o = q.shape === 'sobrado' ? sobrado(q, rs) : null;
      if (o) return o;
      for (let tr = 0; tr < 12; tr++) { o = plan(q, rs); if (o.ok) break; }
      if (!o.ok) G._bad++;
      return o;
    }
    // corpo (sem a ala) dentro do lote q; ala = L (3,5 x 3,5 aos fundos) ou garagem (3 x 5 na frente) num lado lateral
    function mainOf(q) {
      if (!q.wing) return q;
      const e = q.wing.kind === 'gar' ? 3 : 3.5, v = q.side < 2, lo = q.wing.ls === 0;
      return v ? { x: q.x, y: lo ? q.y + e : q.y, w: q.w, h: q.h - e } : { x: lo ? q.x + e : q.x, y: q.y, w: q.w - e, h: q.h };
    }
    function wingRect(q) {
      const g = q.wing.kind === 'gar', e = g ? 3 : 3.5, dep = g ? 5 : 3.5, v = q.side < 2, lo = q.wing.ls === 0, fr = q.side === 0 || q.side === 2; // fr: frente no lado baixo do eixo de profundidade
      const a = v ? q.x : q.y, D = v ? q.w : q.h, d0 = fr === g ? a : a + D - dep, l0 = v ? q.y : q.x, L = v ? q.h : q.w, e0 = lo ? l0 : l0 + L - e; // g: rente a frente; L: rente aos fundos
      return v ? { x0: d0, x1: d0 + dep, y0: e0, y1: e0 + e, sh: lo ? 'y1' : 'y0' } : { x0: e0, x1: e0 + e, y0: d0, y1: d0 + dep, sh: lo ? 'x1' : 'x0' };
    }
    // sobrado: a escada (1 x 2,4) reservada nos 2 andares; terreo (sala+cozinha) e andar 1 (quartos+banheiro) com plan() cada
    function sobrado(q, rs) {
      const T0 = ['sala', 'cozinha', 'sala', 'banheiro'], T1 = ['quarto', 'banheiro', 'quarto', 'quarto'];
      for (let t = 0; t < 5; t++) {
        const wl = Math.floor(rs() * 4), off = WT + 0.8 + rs() * Math.max(0.1, (wl < 2 ? q.h : q.w) - 2 * WT - 1.6 - 2.4);
        const S = wl < 2 ? { x: wl ? q.x + q.w - WT - 1 : q.x + WT, y: q.y + off, w: 1, h: 2.4 } : { x: q.x + off, y: wl === 2 ? q.y + WT : q.y + q.h - WT - 1, w: 2.4, h: 1 };
        const e0 = wl < 2 ? [S.x + 0.5, S.y - 0.8] : [S.x - 0.8, S.y + 0.5], e1 = wl < 2 ? [S.x + 0.5, S.y + 2.4 + 0.8] : [S.x + 2.4 + 0.8, S.y + 0.5], sw = rs() < 0.5;
        S.lx0 = (sw ? e1 : e0)[0]; S.ly0 = (sw ? e1 : e0)[1]; S.lx1 = (sw ? e0 : e1)[0]; S.ly1 = (sw ? e0 : e1)[1];
        let a = null, b = null;
        for (let i = 0; i < 2 && !(a && a.ok); i++) a = plan(q, rs, { st: S, types: T0, lands: [[S.lx0, S.ly0]], land: [[S.lx0, S.ly0], [S.lx1, S.ly1]] });
        if (!a.ok) continue;
        for (let i = 0; i < 3 && !(b && b.ok); i++) b = plan(q, rs, { st: S, fl: 1, noDoor: true, types: T1, start: [S.lx1, S.ly1], lands: [[S.lx1, S.ly1]], land: [[S.lx0, S.ly0], [S.lx1, S.ly1]] });
        if (!b.ok) continue;
        b.parts.forEach(p => { p.floor = 1; a.parts.push(p); }); b.rooms.forEach(m => { m.floor = 1; a.rooms.push(m); }); b.gaps.forEach(g => { g.floor = 1; a.gaps.push(g); });
        b.furn.forEach(f => { f.floor = 1; a.furn.push(f); });
        a.stairs = S; a.floors = 2;
        return a;
      }
      return null;
    }
    function plan(q, r, op = {}) {
      const M = mainOf(q), { x, y, w, h } = M, side = q.side, X1 = x + w, Y1 = y + h, id = nid(), S = op.st;
      const fx = x + w * (0.4 + r() * 0.2), fy = y + h * (0.4 + r() * 0.2), mode = q.shape === 'pair' ? [0, 1, 3][Math.floor(r() * 3)] : Math.floor(r() * 4), half = r() < 0.5; // geminada 5x7: sem planta de 4 comodos (apertada demais)
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
          const c = d.a + DW / 2 + 0.1 + r() * Math.max(0, d.b - d.a - DW - 0.2), sc = nearD(js, c);
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
        const t = lo + 0.8 + r() * (len - 1.6), sc = nearD(tj, t);
        if (sc > bs) { bs = sc; c = t; }
      }
      const did = nid(), dr = vw ? { id: did, x: side ? X1 - WT : x, y: c - DW / 2, w: WT, h: DW, open: false, locked: false, hp: 100 } : { id: did, x: c - DW / 2, y: side === 3 ? Y1 - WT : y, w: DW, h: WT, open: false, locked: false, hp: 100 };
      const doors = op.noDoor ? [] : [dr];
      if (op.noDoor) parts.push({ x: dr.x, y: dr.y, w: dr.w, h: dr.h }); // andar 1: parede cheia
      else { parts.push(Object.assign({ door: did }, { x: dr.x, y: dr.y, w: dr.w, h: dr.h })); gaps.push({ x: dr.x + dr.w / 2, y: dr.y + dr.h / 2 }); }
      const wall = (sx, sy, sw, sh) => { if (sw > 0.01 && sh > 0.01) parts.push({ x: sx, y: sy, w: sw, h: sh }); };
      // topo/base de largura cheia; esquerda/direita entre elas
      if (side === 2) { wall(x, y, c - DW / 2 - x, WT); wall(c + DW / 2, y, X1 - c - DW / 2, WT); } else wall(x, y, w, WT);
      if (side === 3) { wall(x, Y1 - WT, c - DW / 2 - x, WT); wall(c + DW / 2, Y1 - WT, X1 - c - DW / 2, WT); } else wall(x, Y1 - WT, w, WT);
      if (side === 0) { wall(x, y + WT, WT, c - DW / 2 - y - WT); wall(x, c + DW / 2, WT, Y1 - WT - c - DW / 2); } else wall(x, y + WT, WT, h - 2 * WT);
      if (side === 1) { wall(X1 - WT, y + WT, WT, c - DW / 2 - y - WT); wall(X1 - WT, c + DW / 2, WT, Y1 - WT - c - DW / 2); } else wall(X1 - WT, y + WT, WT, h - 2 * WT);
      // comodos com tipo e moveis proprios: sala (porta) + cozinha + quarto + banheiro; 2 comodos = sala+cozinha ou quarto+banheiro
      const inn = vw ? [side ? X1 - WT - 0.3 : x + WT + 0.3, c] : [c, side === 3 ? Y1 - WT - 0.3 : y + WT + 0.3];
      const dRoom = rooms.find(m => inn[0] >= m.x0 && inn[0] <= m.x1 && inn[1] >= m.y0 && inn[1] <= m.y1) || rooms[0];
      const others = rooms.filter(m => m !== dRoom);
      if (op.types) { dRoom.type = op.types[0]; others.forEach((m, i) => { m.type = op.types[i + 1]; }); }
      else if (rooms.length === 2) { const pair = r() < 0.5 ? ['sala', 'cozinha'] : ['quarto', 'banheiro']; dRoom.type = pair[0]; others[0].type = pair[1]; }
      else { dRoom.type = 'sala'; others.forEach((m, i) => { m.type = ['cozinha', 'quarto', 'banheiro'][i]; }); }
      // ala (L ou garagem): 3 paredes + abertura de 1,4 m na parede do corpo; garagem: portao 2,4 m na frente, 30 % com carro dentro
      let gcar = null, wingR = null;
      if (q.wing && !S) {
        const Rw = wingR = wingRect(q), sh = Rw.sh, hz = sh[0] === 'y', kind = q.wing.kind, front = ['x0', 'x1', 'y0', 'y1'][side];
        const W = { x0: { x: Rw.x0, y: Rw.y0, w: WT, h: Rw.y1 - Rw.y0 }, x1: { x: Rw.x1 - WT, y: Rw.y0, w: WT, h: Rw.y1 - Rw.y0 }, y0: { x: Rw.x0, y: Rw.y0, w: Rw.x1 - Rw.x0, h: WT }, y1: { x: Rw.x0, y: Rw.y1 - WT, w: Rw.x1 - Rw.x0, h: WT } };
        for (const k of ['x0', 'x1', 'y0', 'y1']) {
          if (k === sh) continue;
          if (kind === 'gar' && k === front) { // portao no meio da frente da garagem
            const gid = nid(), wv = k[0] === 'x', cc = wv ? (Rw.y0 + Rw.y1) / 2 : (Rw.x0 + Rw.x1) / 2, wl = W[k];
            const gt = wv ? { id: gid, x: wl.x, y: cc - 1.2, w: WT, h: 2.4, open: false, locked: false, hp: 100, gate: true } : { id: gid, x: cc - 1.2, y: wl.y, w: 2.4, h: WT, open: false, locked: false, hp: 100, gate: true };
            doors.push(gt); parts.push(Object.assign({ door: gid }, { x: gt.x, y: gt.y, w: gt.w, h: gt.h })); gaps.push({ x: gt.x + gt.w / 2, y: gt.y + gt.h / 2, hw: 1.2 });
            if (wv) { wall(wl.x, wl.y, WT, gt.y - wl.y); wall(wl.x, gt.y + 2.4, WT, wl.y + wl.h - gt.y - 2.4); } else { wall(wl.x, wl.y, gt.x - wl.x, WT); wall(gt.x + 2.4, wl.y, wl.x + wl.w - gt.x - 2.4, WT); }
          } else wall(W[k].x, W[k].y, W[k].w, W[k].h);
        }
        // abertura: corta a parede do corpo que fecha a ala
        const ed = sh === 'y1' ? y : sh === 'y0' ? Y1 - WT : sh === 'x1' ? x : X1 - WT, pi = parts.findIndex(p => !p.door && (hz ? p.h === WT && Math.abs(p.y - ed) < 1e-9 : p.w === WT && Math.abs(p.x - ed) < 1e-9));
        const pw = parts[pi], a0 = hz ? Math.max(Rw.x0, pw.x) : Math.max(Rw.y0, pw.y), a1 = hz ? Math.min(Rw.x1, pw.x + pw.w) : Math.min(Rw.y1, pw.y + pw.h);
        const js = dv.filter(e => e.v === hz).map(e => e.pos);
        let c = (a0 + a1) / 2, bs = -1;
        for (let i = 0; i < 12; i++) { const t = a0 + DW / 2 + WT + r() * Math.max(0, a1 - a0 - DW - 2 * WT), sc = nearD(js, t); if (sc > bs) { bs = sc; c = t; } }
        parts.splice(pi, 1);
        if (hz) { seg(false, pw.y + WT / 2, pw.x, c - DW / 2, WT); seg(false, pw.y + WT / 2, c + DW / 2, pw.x + pw.w, WT); gaps.push({ x: c, y: pw.y + WT / 2 }); }
        else { seg(true, pw.x + WT / 2, pw.y, c - DW / 2, WT); seg(true, pw.x + WT / 2, c + DW / 2, pw.y + pw.h, WT); gaps.push({ x: pw.x + WT / 2, y: c }); }
        const wm = { x0: Rw.x0, y0: Rw.y0, x1: Rw.x1, y1: Rw.y1, I: { x0: Rw.x0 + (sh === 'x0' ? 0 : WT), x1: Rw.x1 - (sh === 'x1' ? 0 : WT), y0: Rw.y0 + (sh === 'y0' ? 0 : WT), y1: Rw.y1 - (sh === 'y1' ? 0 : WT) } };
        if (kind === 'gar') {
          wm.type = 'garagem'; wm.car = r() < 0.3;
          if (wm.car) gcar = { x: (Rw.x0 + Rw.x1) / 2, y: (Rw.y0 + Rw.y1) / 2, dir: side < 2 ? 0 : Math.PI / 2 };
        } else { const ts = rooms.map(m => m.type); wm.type = !ts.includes('quarto') ? 'quarto' : !ts.includes('banheiro') ? 'banheiro' : 'quarto'; }
        rooms.push(wm);
      }
      if (S && (gaps.some(g => dBox(S, g.x, g.y) < 0.9) || parts.some(p => !p.door && (op.land.some(l => dBox(p, l[0], l[1]) < 0.46) || (p.x < S.x + S.w - 0.01 && p.x + p.w > S.x + 0.01 && p.y < S.y + S.h - 0.01 && p.y + p.h > S.y + 0.01))))) return { ok: false }; // escada tocando parede/vao ou desembarque na parede: falha antes de mobiliar
      const furn = [];
      for (const m of rooms) for (const kind of (m.type === 'garagem' ? (m.car ? [] : ['toolbox']) : ROOM[m.type])) {
        const I = m.I || { x0: m.x0 + (m.x0 === x ? WT : WT / 2), x1: m.x1 - (m.x1 === X1 ? WT : WT / 2), y0: m.y0 + (m.y0 === y ? WT : WT / 2), y1: m.y1 - (m.y1 === Y1 ? WT : WT / 2) };
        for (let i = 0; i < 16; i++) {
          const fr = kind === 'table', s = fr ? -1 : Math.floor(r() * 4), hz = s < 2, [fw, fh] = FD[kind], bw = hz ? fw : fh, bh = hz ? fh : fw, pad = fr ? 0.4 : 0;
          if (bw + 2 * pad > I.x1 - I.x0 || bh + 2 * pad > I.y1 - I.y0 || (fr && Math.min(I.x1 - I.x0, I.y1 - I.y0) < 3)) continue; // mesa so em comodo largo
          const bx = fr || hz ? I.x0 + pad + r() * (I.x1 - I.x0 - bw - 2 * pad) : s === 2 ? I.x0 : I.x1 - bw, by = fr ? I.y0 + pad + r() * (I.y1 - I.y0 - bh - 2 * pad) : hz ? (s === 0 ? I.y0 : I.y1 - bh) : I.y0 + r() * (I.y1 - I.y0 - bh);
          const b = { x: bx, y: by, w: bw, h: bh };
          if (gaps.some(g => dBox(b, g.x, g.y) < 1.2) || (S && bx < S.x + S.w + 0.1 && bx + bw > S.x - 0.1 && by < S.y + S.h + 0.1 && by + bh > S.y - 0.1) || (op.land && op.land.some(l => dBox(b, l[0], l[1]) < 0.6)) || furn.some(f => bx < f._b.x + f._b.w + 0.1 && bx + bw > f._b.x - 0.1 && by < f._b.y + f._b.h + 0.1 && by + bh > f._b.y - 0.1)) continue;
          furn.push({ id: nid(), ch, x: bx + bw / 2, y: by + bh / 2, w: bw, h: bh, kind, room: m.type, wall: s, opened: SCEN.has(kind), loot: [], tomb: false, _b: b });
          if (SCEN.has(kind)) furn[furn.length - 1].scenery = true;
          break;
        }
      }
      const hh = { id, ch, x: q.x, y: q.y, w: q.w, h: q.h, kind: 'house', pal: Math.floor(r() * 3), roof: r() < 0.5 ? '4' : '2', parts, gaps, doors, rooms, furn };
      if (S) hh.stairs = S;
      if (gcar) hh.gcar = gcar;
      if (wingR) { hh.main = { x: M.x, y: M.y, w: M.w, h: M.h }; hh.wing = { x: wingR.x0, y: wingR.y0, w: wingR.x1 - wingR.x0, h: wingR.y1 - wingR.y0, sh: wingR.sh, kind: q.wing.kind }; } // volumes do L/garagem (telhado de cada um)
      const stOk = true;
      hh.ok = stOk && furn.length >= (S && op.fl ? 2 : 3) && furn.some(f => !f.scenery && f.room !== 'garagem') && reach(hh, op.start || [vw ? (side ? X1 + 1 : x - 1) : c, vw ? c : (side === 3 ? Y1 + 1 : y - 1)], op.lands);
      return hh;
    }
    // BFS em grade 0,25 m com raio 0,4 (mesma regra de free): cada comodo e cada movel alcancaveis a partir de fora da porta
    function reach(hh, st, lands) { // mesma regra de hitHouse, sem alocacao no laco quente (era 70 % do gen)
      const S = 0.25, x0 = hh.x - 1.5, y0 = hh.y - 1.5, nx = Math.ceil((hh.w + 3) / S), ny = Math.ceil((hh.h + 3) / S), seen = RB.s.length >= nx * ny ? RB.s.fill(0, 0, nx * ny) : new Uint8Array(nx * ny); // buffers reaproveitados (alocar era o custo do gen)
      const sp = hh.parts.filter(q => !q.door && !q.floor), fb = hh.furn.filter(c => c.w && !c.floor).map(cbox).concat(hh.stairs ? [hh.stairs] : []), bl = sp.concat(fb), blk = RB.b.length >= nx * ny ? RB.b.fill(0, 0, nx * ny) : new Uint8Array(nx * ny);
      const cl = [hh.x - R, hh.x + hh.w + R, hh.y - R, hh.y + hh.h + R]; // so conta bloqueio dentro do lote (+R): fora dele tudo e livre
      for (const b of bl) { // pre-rasteriza os bloqueios: retangulo de celulas cujo centro cai a < R da caixa (e dentro do lote)
        const xa = Math.max(b.x - R, cl[0]), xb = Math.min(b.x + b.w + R, cl[1]), ya = Math.max(b.y - R, cl[2]), yb = Math.min(b.y + b.h + R, cl[3]);
        const i0 = Math.max(0, Math.floor((xa - x0) / S - 0.5) + 1), i1 = Math.min(nx - 1, Math.ceil((xb - x0) / S - 0.5) - 1), j0 = Math.max(0, Math.floor((ya - y0) / S - 0.5) + 1), j1 = Math.min(ny - 1, Math.ceil((yb - y0) / S - 0.5) - 1);
        for (let j = j0; j <= j1; j++) for (let i = i0, o = j * nx + i0; i <= i1; i++, o++) blk[o] = 1;
      }
      const ok = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !blk[j * nx + i];
      const si = Math.floor((st[0] - x0) / S), sj = Math.floor((st[1] - y0) / S), qu = RB.q.length >= nx * ny ? RB.q : new Int32Array(nx * ny);
      let qn = 0; qu[qn++] = sj * nx + si; seen[sj * nx + si] = 1;
      for (let k = 0; k < qn; k++) {
        const c = qu[k], i = c % nx, j = (c - i) / nx;
        if (i + 1 < nx && !blk[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; qu[qn++] = c + 1; }
        if (i > 0 && !blk[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; qu[qn++] = c - 1; }
        if (j + 1 < ny && !blk[c + nx] && !seen[c + nx]) { seen[c + nx] = 1; qu[qn++] = c + nx; }
        if (j > 0 && !blk[c - nx] && !seen[c - nx]) { seen[c - nx] = 1; qu[qn++] = c - nx; }
      }
      const any = (lx, hx, ly, hy, f) => { // celulas vistas dentro do retangulo que passam em f (varre so o retangulo)
        const i0 = Math.max(0, Math.floor((lx - x0) / S) - 1), i1 = Math.min(nx - 1, Math.ceil((hx - x0) / S)), j0 = Math.max(0, Math.floor((ly - y0) / S) - 1), j1 = Math.min(ny - 1, Math.ceil((hy - y0) / S));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (seen[j * nx + i] && f(x0 + (i + 0.5) * S, y0 + (j + 0.5) * S)) return true;
        return false;
      };
      return (lands || []).every(p => ok(Math.floor((p[0] - x0) / S), Math.floor((p[1] - y0) / S)) && any(p[0] - 0.35, p[0] + 0.35, p[1] - 0.35, p[1] + 0.35, (px, py) => hypot2(px - p[0], py - p[1]) <= 0.35)) && hh.rooms.every(m => m.car || m.floor || any(m.x0, m.x1, m.y0, m.y1, (px, py) => px > m.x0 + WT && px < m.x1 - WT && py > m.y0 + WT && py < m.y1 - WT))
        && hh.furn.every(f => { if (f.floor) return true; const t = f.scenery ? 1.45 : 1.3; return any(f.x - t, f.x + t, f.y - t, f.y + t, (px, py) => px > hh.x + WT && px < hh.x + hh.w - WT && py > hh.y + WT && py < hh.y + hh.h - WT && hypot2(px - f.x, py - f.y) <= t); }); // celula DENTRO da casa (nao vale alcancar pela parede)
    }
    // landmark: planta fixa rodada e transladada para o retangulo mk; devolve [predio, patio aberto?] e enche crates/zumbis/carros/tanque/props
    const lz = [], lmProps = [];
    function landmark(m) {
      const P0 = PLANS[m.kind](), P = lpRot(P0, m.rot), tx = m.x, ty = m.y, T = e => { e.x += tx; e.y += ty; return e; };
      const ids = P.doors.map(() => nid()), doors = P.doors.map((d, i) => T(Object.assign({}, d, { id: ids[i] })));
      const parts = P.parts.map(q => { const e = Object.assign({}, q); if (e.dk !== undefined) { e.door = ids[e.dk]; delete e.dk; } return T(e); });
      const rooms = P.rooms.map(q => Object.assign({}, q, { x0: q.x0 + tx, x1: q.x1 + tx, y0: q.y0 + ty, y1: q.y1 + ty }));
      const b = T(Object.assign({}, P.bld)), hh = { id: nid(), ch, x: b.x, y: b.y, w: b.w, h: b.h, kind: P.kind, pal: P.pal, roof: '2', parts, gaps: P.gaps.map(g => T(Object.assign({}, g))), doors, rooms };
      if (P.sign) { // telhado plano com letreiro: desenhado na orientacao canonica e girado pelo render
        const c0 = P0.doors.filter(d => d.y + d.h >= P0.bld.y + P0.bld.h - WT - 1e-6 && d.y <= P0.bld.y + P0.bld.h);
        Object.assign(hh, { sign: P.sign, rot: m.rot, cw: P0.bld.w, cd: P0.bld.h, dx: c0.reduce((a, d) => a + d.x + d.w / 2, 0) / c0.length - P0.bld.x - P0.bld.w / 2 });
      }
      for (const d of doors) for (const [k, l, B] of [['x', 'w', hh.x], ['y', 'h', hh.y]]) if (Math.abs(d[k] - B) < 1e-6) { d[k] = B; parts.find(q => q.door === d.id)[k] = B; } // porta encostada na parede oeste/norte: igualdade exata (testes de borda)
      if (P.size) hh.size = P.size;
      if (P.stairs) { const S = Object.assign({}, P.stairs); S.x += tx; S.y += ty; S.lx0 += tx; S.lx1 += tx; S.ly0 += ty; S.ly1 += ty; hh.stairs = S; hh.floors = 2; } // hospital: 2 andares (mesma escada do sobrado)
      doors.forEach(d => { if (d.lockP !== undefined) { if (r() < d.lockP) { d.locked = true; d.hp = 200; } delete d.lockP; } }); // farmacia interna do hospital: 50 % com cadeado
      P.fences.forEach(f => o.fences.push(T(Object.assign({}, f))));
      const out = [hh], lc = [];
      if (P.yard) { const y = T(Object.assign({}, P.yard)); out.push({ id: nid(), ch, x: y.x, y: y.y, w: y.w, h: y.h, kind: 'patio', open: true, pal: P.pal, roof: '2', parts: [], gaps: [], doors: [], rooms: [] }); }
      P.furn.forEach(f => {
        if (f.p !== undefined && r() >= f.p) return;
        const sc = SCEN.has(f.kind), c = { id: nid(), ch, x: f.x + tx, y: f.y + ty, w: f.w, h: f.h, kind: f.kind, wall: f.wall, opened: sc, loot: [], tomb: false };
        if (sc) c.scenery = true; else c.loot = [mkItem(r, pick(r, FURN[f.kind]))].filter(it => it.id);
        if (f.floor) c.floor = f.floor; if (f.locked) c.locked = true;
        o.crates.push(c); lc.push(c);
      });
      P.cars.forEach((q, i) => { // carro dentro do landmark: a chave SEMPRE numa gaveta (drawer) da construcao; sem gaveta o carro nao nasce
        const cr = mulberry32(hash(G.seed, cx, cy, 60 + i)), dw = lc.find(c => c.kind === 'drawer' && !c.floor);
        if (cr() >= q.p || !dw) return;
        const gc = { id: nid(), ch, x: q.x + tx, y: q.y + ty, dir: q.dir, speed: 0, fuel: q.fuel ? Math.round(cr() * q.fuel * 10) / 10 : Math.round((2 + cr() * 8) * 10) / 10, trunk: [], hp: 50 + Math.floor(cr() * 51), gar: hh.id };
        const tr = mulberry32(hash(G.seed, cx, cy, 70 + i)); gc.trunk = [mkItem(tr, pick(tr, TRUNK))].filter(it => it.id);
        dw.loot = [{ id: 'key', car: gc.id, qty: 1 }]; o.cars.push(gc);
      });
      if (P.tank) o.tanks.push({ id: nid(), ch, x: P.tank.x + tx, y: P.tank.y + ty, w: 0.8, h: 0.8, fuel: m.fuel || 0 });
      P.props.forEach(q => lmProps.push(T(Object.assign({}, q))));
      const fz = P.zs.filter(z => z.plain), vz = P.zs.filter(z => !z.plain), n = P.zn ? P.zn[0] + Math.floor(r() * (P.zn[1] - P.zn[0] + 1)) : vz.length;
      fz.concat(vz.slice(0, n)).forEach(z => {
        if (z.p !== undefined && r() >= z.p) return;
        const x = z.x + tx, y = z.y + ty;
        if (!out.some(h => h.parts.length && hitHouse(h, lc, x, y, 0.5, z.floor))) lz.push({ x, y, police: !!z.police, look: z.look || P.look, floor: z.floor });
      });
      return out;
    }
    // praca (quadra 0,0 da cidade: centro fixo, sem casas) e balao do cruzamento das avenidas em C (canteiro Ø4 solido; disco de asfalto Ø14 desenhado pelo render)
    const pz = BL.find(B => B.plaza), pc = pz && [(pz.x0 + pz.x1) / 2, (pz.y0 + pz.y1) / 2], cty = rural ? null : cityAt(ox + 20, oy + 20), Cl = cty && [cty.C[0] - ox, cty.C[1] - oy];
    const noGo = (x, y) => (pc && Math.abs(x - pc[0]) < 12 && Math.abs(y - pc[1]) < 12) || (Cl && hypot2(x - Cl[0], y - Cl[1]) < 8.5); // miolo da praca e balao: sem arvore/cerca/poste/lixo/carro
    BL.forEach((B, b) => {
      const edge = [0, 1].reduce((a, s) => a + (B.sd & (1 << s) && (s ? B.x1 : B.x0) > 1.6 && (s ? B.x1 : B.x0) < 38.4 ? B.ky1 - B.ky0 : 0), 0) + [2, 3].reduce((a, s) => a + (B.sd & (1 << s) && (s > 2 ? B.y1 : B.y0) > 1.6 && (s > 2 ? B.y1 : B.y0) < 38.4 ? B.kx1 - B.kx0 : 0), 0); // metros de rua desta quadra dentro do chunk
      const k = rural ? 1 : origin ? (hs.length < 2 ? 1 : 0) : Math.min(8, Math.round(edge / 11)); // ~1 casa a cada 11 m de rua (spawn: 2 casas; sitio: 1)
      for (let j = 0; j < k && hs.length < 12; j++) place(b, rural ? sFace : undefined);
    });
    let wantCar = !origin && (near || r() < (rural ? 0.2 : 0.15));
    if (!origin && !hs.length) { if (near) for (let t = 0; !hs.length && t < BL.length * 4; t++) place(t % BL.length); else wantCar = false; }
    // carro na rua, fora do cruzamento, alinhado a rua; rural: na beira da way (dir = tangente), senao sem carro
    let car = null, spot = null;
    if (wantCar && rural) {
      const c = [];
      for (const w of L.ways) for (let i = 0; i + 1 < w.pts.length; i++) { const a = w.pts[i], b = w.pts[i + 1], mx = (a[0] + b[0]) / 2 - ox, my = (a[1] + b[1]) / 2 - oy; if (mx > 4 && mx < 36 && my > 4 && my < 36) c.push([a, b]); }
      if (c.length) { const [a, b] = c[Math.floor(r() * c.length)], l = hypot2(b[0] - a[0], b[1] - a[1]) || 1, t = 0.3 + r() * 0.4, sg = r() < 0.5 ? -1 : 1; spot = { x: a[0] + (b[0] - a[0]) * t - ox - (b[1] - a[1]) / l * 1.5 * sg, y: a[1] + (b[1] - a[1]) * t - oy + (b[0] - a[0]) / l * 1.5 * sg, dir: Math.atan2(b[1] - a[1], b[0] - a[0]) + (sg < 0 ? Math.PI : 0) }; }
      else wantCar = false;
    }
    if (wantCar && !rural) { // rua da cidade: segmento longo do chunk, faixa a 1,5 m do eixo, fora de cruzamento (nas 4 ultimas tentativas aceita cruzamento), dir = eixo
      for (let t = 0; t < 16 && !spot; t++) {
        const q = RD[Math.floor(r() * RD.length)], hz = q.w >= q.h, len = hz ? q.w : q.h; if (len < 10) continue;
        const al = (hz ? q.x : q.y) + 3 + r() * (len - 6), ln = (hz ? q.y + q.h / 2 : q.x + q.w / 2) + (r() < 0.5 ? -1.5 : 1.5), x = hz ? al : ln, y = hz ? ln : al;
        if (x < 3 || x > 37 || y < 3 || y > 37 || noGo(x, y) || (t < 12 && RD.some(e => e !== q && x > e.x - 3.5 && x < e.x + e.w + 3.5 && y > e.y - 3.5 && y < e.y + e.h + 3.5))) continue;
        spot = { x, y, dir: hz ? 0 : Math.PI / 2 };
      }
      if (!spot) wantCar = false;
    }
    if (wantCar) {
      car = { id: nid(), ch, x: 0, y: 0, dir: 0, speed: 0, fuel: Math.round((2 + r() * 8) * 10) / 10, trunk: [], hp: 50 + Math.floor(mulberry32(hash(G.seed, cx, cy, 19))() * 51) }; // hp: rng proprio (tag 19), nao toca em r
      Object.assign(car, spot);
      const tr = mulberry32(hash(G.seed, cx, cy, 7)); car.trunk = [mkItem(tr, pick(tr, TRUNK))].filter(i => i.id); // nao toca em r
      o.cars.push(car);
    }
    // casas (planta, paredes, porta) e moveis-conteiner; chave e garantias de (0,0) no 1o movel da casa
    const keyAt0 = car ? Math.floor(r() * hs.length) : -1, drw = [], kd = new Set(); let keyAt = -1; // keyAt = casa da chave (R3: sempre numa gaveta; sem gaveta no chunk o carro nao nasce)
    const tb = mulberry32(hash(G.seed, cx, cy, 17)); // caixas de ferramentas: RNG proprio (nao toca r nem nid)
    o.houses = hs.map((q, i) => {
      const hh = build(q), c = hh.doors[0], vw = q.side < 2; q.hh = hh;
      if (q.shape === 'pair' && i > 0 && hs[i - 1].shape === 'pair' && hs[i - 1].key === q.key - 32) { hh.pal = (hs[i - 1].hh.pal + 1) % 3; hh.pair = hs[i - 1].hh.pair = 1; } // geminadas: cores diferentes
      q.cx = c.x + c.w / 2 + (vw ? (q.side ? 0.6 : -0.6) : 0); q.cy = c.y + c.h / 2 + (vw ? 0 : (q.side === 3 ? 0.6 : -0.6)); // ponto fora da porta (guarda)
      const nc = hh.furn.filter(f => !f.scenery && f.room !== 'garagem').length;
      drw[i] = hh.furn.filter(f => f.kind === 'drawer' && !f.floor);
      const j0 = hh.furn.findIndex(f => !f.scenery); // 1o conteiner: garantias de (0,0) e chave
      hh.furn.forEach((f, j) => {
        if (!f.scenery) { f.loot = [mkItem(r, pick(r, f.room === 'garagem' ? TBG : FURN[f.kind]))].filter(it => it.id); if (nc > 4.2 && r() * nc > 4.2) f.loot = []; } // escassez: casa grande (sobrado, ala) nao rende mais que a media
        if (j === j0 && origin) f.loot = [mkItem(r, i === 0 ? 'gascan' : 'hose')];
        delete f._b; o.crates.push(f);
      });
      if (hh.gcar) { // carro na garagem (30 %): chave num movel da propria casa (nunca da garagem)
        const kf = hh.furn.filter(f => f.kind === 'drawer' && !f.floor && f.room !== 'garagem').pop();
        if (kf) {
          const gr = mulberry32(hash(G.seed, cx, cy, 52 + i)), gc = { id: nid(), ch, x: hh.gcar.x, y: hh.gcar.y, dir: hh.gcar.dir, speed: 0, fuel: Math.round((2 + gr() * 8) * 10) / 10, trunk: [], hp: 50 + Math.floor(gr() * 51), gar: hh.id };
          const tr = mulberry32(hash(G.seed, cx, cy, 53 + i)); gc.trunk = [mkItem(tr, pick(tr, TRUNK))].filter(it => it.id);
          kf.loot = [{ id: 'key', car: gc.id, qty: 1 }]; kd.add(kf); o.cars.push(gc); q.gk = 1;
        }
      }
      const rm0 = hh.rooms.filter(m => !m.floor && m.type !== 'garagem');
      if (r() < 0.5) for (let t = 0; t < 20; t++) { // guarda interno: ponto livre num comodo qualquer (todos alcancaveis)
        const m = rm0[Math.floor(r() * rm0.length)], zx = m.x0 + 0.7 + r() * (m.x1 - m.x0 - 1.4), zy = m.y0 + 0.7 + r() * (m.y1 - m.y0 - 1.4);
        if (!hitHouse(hh, hh.furn, zx, zy, 0.6)) { q.iz = [zx, zy]; break; }
      }
      const rs = hh.rooms.filter(m => m.type === 'sala' || m.type === 'cozinha');
      if (tb() < P_TB && rs.length) for (let t = 0; t < 12; t++) { // caixa de ferramentas (rara): sala/cozinha, rente a parede, alcancavel
        const m = rs[Math.floor(tb() * rs.length)], [fw, fh] = FD.toolbox, bx = m.x0 + WT + tb() * (m.x1 - m.x0 - 2 * WT - fw), top = tb() < 0.5, by = top ? m.y0 + WT : m.y1 - WT - fh;
        if (hh.furn.some(f => bx < f.x + f.w / 2 + 0.1 && bx + fw > f.x - f.w / 2 - 0.1 && by < f.y + f.h / 2 + 0.1 && by + fh > f.y - f.h / 2 - 0.1) || hh.gaps.some(g => dBox({ x: bx, y: by, w: fw, h: fh }, g.x, g.y) < 1.2) || (q.iz && dBox({ x: bx, y: by, w: fw, h: fh }, q.iz[0], q.iz[1]) < 0.8) || (hh.stairs && ([[hh.stairs.lx0, hh.stairs.ly0], [hh.stairs.lx1, hh.stairs.ly1]].some(l => dBox({ x: bx, y: by, w: fw, h: fh }, l[0], l[1]) < 0.6) || dBox(hh.stairs, bx + fw / 2, by + fh / 2) < 0.4))) continue; // nem no desembarque da escada
        const box = { id: ch + ':tb:' + i, ch, x: bx + fw / 2, y: by + fh / 2, w: fw, h: fh, kind: 'toolbox', room: m.type, wall: top ? 0 : 1, opened: false, loot: [mkItem(tb, pick(tb, FURN.toolbox))].filter(it => it.id), tomb: false };
        hh.furn.push(box);
        if (reach(hh, [q.cx, q.cy])) { o.crates.push(box); break; }
        hh.furn.pop();
      }
      if (hh.stairs && r() < 0.4) for (let t = 0; t < 20; t++) { // sobrado: 40 % com 1 zumbi no andar de cima
        const m = hh.rooms.filter(m => m.floor)[Math.floor(r() * hh.rooms.filter(m => m.floor).length)], zx = m.x0 + 0.7 + r() * (m.x1 - m.x0 - 1.4), zy = m.y0 + 0.7 + r() * (m.y1 - m.y0 - 1.4);
        if (!hitHouse(hh, hh.furn, zx, zy, 0.6, 1)) { q.up = [zx, zy]; break; }
      }
      hh.rooms.forEach(m => { delete m.I; delete m.car; });
      delete hh.furn; delete hh.ok; delete hh.gcar;
      return hh;
    });
    if (car) { for (let k = 0; k < hs.length && keyAt < 0; k++) { const i = (keyAt0 + k) % hs.length, dw = (drw[i] || []).find(f => !kd.has(f)); if (dw) { dw.loot = [{ id: 'key', car: car.id, qty: 1 }]; keyAt = i; } } if (keyAt < 0) { o.cars.splice(o.cars.indexOf(car), 1); car = null; } }
    const lr = mulberry32(hash(G.seed, cx, cy, 13)); // cadeados: RNG proprio (nao toca r nem nid); ~20 % das casas, nunca (0,0) casas 0/1 nem a casa da chave
    o.houses.forEach((hh, i) => { if (lr() < 0.2 && !(origin && i < 2) && i !== keyAt && !(hs[i] && hs[i].gk)) { hh.doors[0].locked = true; hh.doors[0].hp = 200; } });
    if (mk) o.houses.push(...landmark(mk));
    // zumbis: 1 guarda a <=3 m do 1o bau + 1-3 vagantes (<=4)
    const zOk = (x, y, m) => x > 1 && x < 39 && y > 1 && y < 39 && !inH(x, y, m) && !o.crates.some(c => c.kind === 'toolbox' && Math.abs(x - c.x) < c.w / 2 + 0.6 && Math.abs(y - c.y) < c.h / 2 + 0.6) && !o.cars.some(c => { const b = carBox(c); return x > b.x - 1 && x < b.x + b.w + 1 && y > b.y - 1 && y < b.y + b.h + 1; }) && (!origin || hypot2(x - 23, y - 23) > 10);
    const zs = [], addZ = (x, y, fl) => {
      const police = r() < 0.05 && !o.zombies.some(z => z.police) && !(mk && mk.kind === 'delegacia'), runner = !police && r() < 0.05; // corredor ~5 %
      const zid = nid();
      o.zombies.push({ id: zid, ch, x, y, hp: 60, state: 'idle', alert: 0, atk: 0, runner, police, ...zv(zid) });
      if (fl) o.zombies[o.zombies.length - 1].floor = fl;
      zs.push([x, y]);
    };
    if (hs.length && hs[0].iz && (!origin || hypot2(hs[0].iz[0] - 23, hs[0].iz[1] - 23) > 10)) addZ(hs[0].iz[0], hs[0].iz[1]);
    else if (hs.length) for (let i = 0; i < 10; i++) {
      const a = r() * 6.283, d = 1.5 + r() * 1.5, x = hs[0].cx + Math.cos(a) * d, y = hs[0].cy + Math.sin(a) * d;
      if (zOk(x, y, 0.6)) { addZ(x, y); break; }
    }
    hs.forEach(q => { if (q.up && o.zombies.length < 6) addZ(q.up[0], q.up[1], 1); }); // sobrado: 1 no andar de cima
    const wn = []; // vagantes (para densidade/rastejantes do bloco final)
    for (let k = Math.min(rural ? Math.floor(r() * 2) : 1 + Math.floor(r() * 3), (mk ? 1 : 4) - o.zombies.length); k > 0; k--) for (let i = 0; i < 20; i++) {
      const x = 1 + r() * 38, y = 1 + r() * 38;
      if (zOk(x, y, 1)) { const n0 = o.zombies.length; addZ(x, y); wn.push(o.zombies[n0]); break; }
    }
    lz.forEach(q => { if (o.zombies.length < 8 && !o.cars.some(c => inBox(carBox(c), q.x, q.y, 0.7))) { const zid = nid(); o.zombies.push(Object.assign({ id: zid, ch, x: q.x, y: q.y, hp: 60, state: 'idle', alert: 0, atk: 0, runner: false, police: q.police }, zv(zid), q.look ? { look: q.look } : {}, q.floor ? { floor: q.floor } : {})); zs.push([q.x, q.y]); } }); // landmark consome o teto do chunk (8)
    // decoracao: arvores (1-2 por quarteirao) e cercas baixas
    const stripOf = (q, d, hw) => { const B = BL[q.b], dx = d.x + d.w / 2, dy = d.y + d.h / 2; // calcada de acesso: da porta ate a borda do quarteirao, hw para cada lado; e o ponto central da porta
      return { dx, dy, x: q.side === 0 ? B.x0 : q.side === 1 ? q.x + q.w : dx - hw, y: q.side === 2 ? B.y0 : q.side === 3 ? q.y + q.h : dy - hw, w: q.side < 2 ? (q.side ? B.x1 - q.x - q.w : q.x - B.x0) : 2 * hw, h: q.side < 2 ? 2 * hw : (q.side === 3 ? B.y1 - q.y - q.h : q.y - B.y0) };
    };
    const strips = o.houses.slice(0, hs.length).map((hh, i) => stripOf(hs[i], hh.doors[0], 1.2));
    if (mk) { const Bm = BL[mb]; strips.push(Object.assign({ dx: -99, dy: -99 }, [{ x: mk.x, y: mk.y + mk.h, w: mk.w, h: Math.max(0, Bm.y1 - mk.y - mk.h) }, { x: mk.x + mk.w, y: mk.y, w: Math.max(0, Bm.x1 - mk.x - mk.w), h: mk.h }, { x: mk.x, y: Bm.y0, w: mk.w, h: Math.max(0, mk.y - Bm.y0) }, { x: Bm.x0, y: mk.y, w: Math.max(0, mk.x - Bm.x0), h: mk.h }][mk.rot])); } // frente do landmark (rua)
    o.houses.slice(0, hs.length).forEach((hh, i) => { const g = hh.doors.find(d => d.gate); if (g) { const t = stripOf(hs[i], g, 1.5); t.dx = t.dy = -99; strips.push(t); } }); // frente do portao: carro sai
    const inStrip = (x0, y0, x1, y1, m) => strips.some(t => x1 > t.x - m && x0 < t.x + t.w + m && y1 > t.y - m && y0 < t.y + t.h + m);
    const far = (x, y, m) => !inStrip(x, y, x, y, 0.9) && !inH(x, y, m) && !noGo(x, y) && hs.every(h => hypot2(x - h.cx, y - h.cy) > 1.2) && zs.every(z => hypot2(x - z[0], y - z[1]) > 1);
    const trees = [];
    BL.forEach(B => {
      const bw = B.kx1 - B.kx0 - 2, bh = B.ky1 - B.ky0 - 2; if (bw <= 0 || bh <= 0) return;
      for (let k = Math.max(1, Math.round((1 + (r() < 0.5 ? 1 : 0)) * B.s)); k > 0; k--) for (let i = 0; i < 10; i++) { // arvores, ~2 por 196 m2
        const x = B.kx0 + 1 + r() * bw, y = B.ky0 + 1 + r() * bh;
        if (far(x, y, 1)) { trees.push({ x, y }); break; }
      }
      for (let q = Math.max(1, Math.round(B.s / 3)); q > 0; q--) if (!B.plaza && r() < 0.25) for (let i = 0; i < 10; i++) {
        const hz = r() < 0.5, len = 3 + r() * 2; if ((hz ? bw : bh) <= len) continue;
        const x = B.kx0 + 1 + r() * (hz ? bw - len : bw), y = B.ky0 + 1 + r() * (hz ? bh : bh - len);
        const w = hz ? len : 0.2, h = hz ? 0.2 : len;
        if (far(x, y, 1) && far(x + w, y + h, 1) && far(x + w / 2, y + h / 2, 1) && zs.every(z => !(z[0] > x - 0.6 && z[0] < x + w + 0.6 && z[1] > y - 0.6 && z[1] < y + h + 0.6)) && !inStrip(x, y, x + w, y + h, 0.6) && trees.every(t => hypot2(x + w / 2 - t.x, y + h / 2 - t.y) > len / 2 + 0.6)) { o.fences.push({ x, y, w, h }); break; }
      }
    });
    // props (sem loot): RNG proprio hash(seed,cx,cy,11) e ids ch:p:n proprios; nao tocam r nem nid. So dentro do quarteirao, longe de portas, calcadas de acesso e passagens entre casas
    const pr = mulberry32(hash(G.seed, cx, cy, 11)), prr = (a, b) => a + pr() * (b - a);
    let pn = 0;
    o.props = [];
    const inBlk = (x, y) => x > 0.5 && x < 39.5 && y > 0.5 && y < 39.5 && BL.some(B => x > B.x0 + 0.2 && x < B.x1 - 0.2 && y > B.y0 + 0.2 && y < B.y1 - 0.2); // dentro de uma quadra
    const okP = (x, y, cl) => {
      if (!inBlk(x, y) || noGo(x, y) || inH(x, y, cl) || strips.some(t => x > t.x - 0.3 && x < t.x + t.w + 0.3 && y > t.y - 0.3 && y < t.y + t.h + 0.3 || hypot2(x - t.dx, y - t.dy) < 1.6)) return false;
      if (hs.filter(h => x > h.x - 1 && x < h.x + h.w + 1 && y > h.y - 1 && y < h.y + h.h + 1).length > 1) return false; // passagem de 1 m entre casas
      return trees.every(t => hypot2(x - t.x, y - t.y) > 0.9) && o.fences.every(f => !(x > f.x - 0.7 && x < f.x + f.w + 0.7 && y > f.y - 0.7 && y < f.y + f.h + 0.7)) && zs.every(z => hypot2(x - z[0], y - z[1]) > 1.2) && o.props.every(q => hypot2(x - q.x, y - q.y) > 0.8);
    };
    const addP = (kind, x, y, extra) => o.props.push(Object.assign({ id: ch + ':p:' + pn++, kind, x, y }, extra));
    if (pc) for (const [kind, dx, dy, ex] of [['coreto', 0, 0, { r: 2.4 }], ['bench', 6, 0, { a: Math.PI / 2 }], ['bench', -6, 0, { a: Math.PI / 2 }], ['bench', 0, 6, { a: 0 }], ['bench', 0, -6, { a: 0 }], ['canteiro', 9, 9, { r: 1.1 }], ['canteiro', -9, 9, { r: 1.1 }], ['canteiro', 9, -9, { r: 1.1 }], ['canteiro', -9, -9, { r: 1.1 }], ['pole', 11, 0, { r: 0.15 }], ['pole', -11, 0, { r: 0.15 }], ['pole', 0, 11, { r: 0.15 }], ['pole', 0, -11, { r: 0.15 }], ['bush', 7, 7, {}], ['bush', -7, 7, {}], ['bush', 7, -7, {}], ['bush', -7, -7, {}]]) {
      const x = pc[0] + dx, y = pc[1] + dy; if (x >= 0 && x < 40 && y >= 0 && y < 40) addP(kind, x, y, ex); // dono = chunk do ponto (meio aberto)
    }
    hs.forEach((q, i) => { if (q.porch) { const d = o.houses[i].doors[0], dx = d.x + d.w / 2, dy = d.y + d.h / 2, k = [[-0.7, 0], [0.7, 0], [0, -0.7], [0, 0.7]][q.side]; addP('varanda', dx + k[0], dy + k[1], { a: [-Math.PI / 2, Math.PI / 2, Math.PI, 0][q.side] }); } }); // varanda (piso 1,2 m + 2 colunas, sem colisao)
    if (Cl && Cl[0] >= 0 && Cl[0] < 40 && Cl[1] >= 0 && Cl[1] < 40) addP('canteiro', Cl[0], Cl[1], { r: 2, balao: 1 });
    lmProps.forEach(q => { const { kind, x, y, ...ex } = q; addP(kind, x, y, ex); }); // props do landmark (torre, cobertura, lapides...)
    BL.forEach(B => {
      const bw = B.kx1 - B.kx0 - 1, bh = B.ky1 - B.ky0 - 1, sn = n => Math.max(1, Math.round(n * B.s)), sides = [0, 1, 2, 3].filter(e => B.sd & (1 << e));
      if (bw <= 0 || bh <= 0) return;
      for (let k = sn(1 + Math.floor(pr() * 2)); k > 0; k--) for (let i = 0; i < 8; i++) { // arvores extras nos lotes
        const x = B.kx0 + 0.5 + pr() * bw, y = B.ky0 + 0.5 + pr() * bh;
        if (okP(x, y, 1.2)) { trees.push({ x, y }); break; }
      }
      const ed = () => { const e = sides[Math.floor(pr() * sides.length)], t = pr(); return e < 2 ? [e ? B.x1 - 0.4 : B.x0 + 0.4, B.ky0 + 0.5 + t * bh] : [B.kx0 + 0.5 + t * bw, e === 3 ? B.y1 - 0.4 : B.y0 + 0.4]; }; // ponto na borda da calcada (so lados com rua)
      if (sides.length) {
        for (let k = 0; k < Math.round(2 * B.s); k++) for (let i = 0; i < 6; i++) { const [x, y] = ed(); if (okP(x, y, 0.5)) { addP('pole', x, y, { r: 0.15 }); break; } } // poste ~ a cada 10 m
        for (let k = Math.floor(0.6 * B.s + pr()); k > 0; k--) for (let i = 0; i < 6; i++) { const [x, y] = ed(); if (okP(x, y, 0.5)) { addP('hydrant', x, y, { r: 0.2 }); break; } }
      }
      const yard = (kind, n, extra) => { for (let k = 0; k < n; k++) for (let i = 0; i < 6; i++) { const x = B.kx0 + 0.5 + pr() * bw, y = B.ky0 + 0.5 + pr() * bh; if (okP(x, y, 1)) { addP(kind, x, y, extra && { a: Math.floor(pr() * 4) * Math.PI / 2 }); break; } } };
      yard('trash', sn(1 + Math.floor(pr() * 2))); yard('bush', sn(2 + Math.floor(pr() * 2))); yard('bench', Math.floor(0.5 * B.s + pr()), true);
    });
    strips.forEach((t, i) => { if (i < hs.length && pr() < 0.7) { // caixa de correio na calcada, ao lado do acesso
      const q = hs[i], B = BL[q.b], sg = pr() < 0.5 ? -1 : 1, v = q.side < 2, x = v ? (q.side ? B.x1 - 0.4 : B.x0 + 0.4) : t.dx + sg * 1.9, y = v ? t.dy + sg * 1.9 : (q.side === 3 ? B.y1 - 0.4 : B.y0 + 0.4);
      if (okP(x, y, 0.5)) addP('mailbox', x, y, { a: q.side * Math.PI / 2 });
    } });
    if (rural) for (let k = 6 + Math.floor(r() * 7); k > 0; k--) for (let i = 0; i < 8; i++) { // pasto: arvores soltas fora da way
      const x = 1 + r() * 38, y = 1 + r() * 38;
      if (far(x, y, 1) && !onRoadIn([], L.ways, ox + x, oy + y, 2.5) && trees.every(t => hypot2(x - t.x, y - t.y) > 1.5)) { trees.push({ x, y }); break; }
    }
    o.trees = trees;
    if (G.gv) { // bloco FINAL (so mundo novo, gv:1): densidade por regiao e rastejantes; RNG proprio, ids ':x:' fora do nid => nao toca r() nem nid
      const xr = mulberry32(hash(G.seed, cx, cy, 9001)), u = infestAt(ox + 20, oy + 20), ex = [];
      if (u < 1) for (let k = Math.ceil(wn.length / 2); k > 0; k--) o.zombies.splice(o.zombies.indexOf(wn.pop()), 1); // calma: metade dos vagantes (nunca guarda nem landmark)
      const okX = (x, y) => zOk(x, y, 1) && trees.every(t => hypot2(x - t.x, y - t.y) > 1) && !o.fences.some(f => inBox(f, x, y, 1)) && !o.props.some(p => p.r && hypot2(x - p.x, y - p.y) < p.r + 1);
      if (u > 1) for (let k = wn.length; k > 0 && o.zombies.length < 8; k--) for (let i = 0; i < 12; i++) { // infestada: tantos vagantes quanto ja ha, de preferencia 2-4 m atras de um zumbi
        const b = i < 6 && o.zombies.length ? o.zombies[Math.floor(xr() * o.zombies.length)] : null, a = b ? (b.face !== undefined ? b.face : zv(b.id).face) + Math.PI + (xr() - 0.5) * 0.8 : 0, d = 2 + xr() * 2;
        const x = b ? b.x + Math.cos(a) * d : 1 + xr() * 38, y = b ? b.y + Math.sin(a) * d : 1 + xr() * 38;
        if (okX(x, y)) { const zid = ch + ':x:' + ex.length, z = { id: zid, ch, x, y, hp: 60, state: 'idle', alert: 0, atk: 0, runner: false, police: false, ...zv(zid) }; ex.push(z); o.zombies.push(z); break; }
      }
      const cand = ex.concat(o.zombies.filter(z => !ex.includes(z) && !z.police && !z.runner)); // 10 % de todos viram rastejantes (extras primeiro)
      for (let k = Math.min(cand.length, Math.floor(o.zombies.length * 0.1 + xr())) - 1; k >= 0; k--) cand[k].crawl = true;
    }
    // local -> mundo (roads ja nascem em mundo)
    const sh = e => { e.x += ox; e.y += oy; return e; };
    [o.houses, o.crates, o.zombies, o.trees, o.fences, o.props, o.tanks].forEach(l => l.forEach(sh));
    o.houses.forEach(h => h.rooms.forEach(m => { m.x0 += ox; m.x1 += ox; m.y0 += oy; m.y1 += oy; }));
    o.houses.forEach(h => [h.parts, h.gaps, h.doors].forEach(l => l.forEach(sh)));
    o.houses.forEach(h => { for (const v of [h.main, h.wing]) if (v) { v.x += ox; v.y += oy; } });
    o.houses.forEach(h => { if (h.stairs) { const S = h.stairs; S.x += ox; S.y += oy; S.lx0 += ox; S.lx1 += ox; S.ly0 += oy; S.ly1 += oy; } });
    // porta encostada na parede leste/sul: soma exata em float (x+w === h.x+h.w) para testes de borda
    o.houses.forEach(h => h.doors.forEach(d => { const pd = h.parts.find(q => q.door === d.id); for (const [p, l, T] of [['x', 'w', h.x + h.w], ['y', 'h', h.y + h.h]]) {
      if (Math.abs(d[p] + d[l] - T) > 1e-6) continue;
      d[l] = pd[l] = T - d[p]; } })); // Sterbenz: a subtracao e exata, logo x + w === T
    o.cars.forEach(c => { c.x += ox; c.y += oy; });
    return o;
  }

  // ---- chunks: referencia com histerese, fila, load/unload com diff ----
  const LISTS = ['houses', 'crates', 'zombies', 'cars', 'roads', 'ways', 'trees', 'fences', 'drops', 'props', 'spills', 'tanks'];
  const parse = k => k.split(',').map(Number);
  const drivenIds = () => G.players.map(p => p.car).filter(Boolean); // so protege o unload; o diff grava o carro no chunk onde esta
  const strip = e => { const c = Object.assign({}, e); delete c.ch; delete c.way; delete c.side; delete c.rc; delete c.bang; delete c.last; delete c.pw; delete c.ck; delete c.fl; delete c.anim; for (const k of ['wu', 'zc', 'climb', 'fc', 'fct', '_hitBy', 'burn', 'hc', 'ht', 'sc', 'lg']) delete c[k]; return c; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function syncCh() { for (const l of [G.zombies, G.cars]) for (const e of l) e.ch = chOf(e); for (const c of G.cars) if (c.hp === undefined) c.hp = 100; } // carro de save antigo: vida cheia
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
    const tx = p.x + fx * 40, ty = p.y + fy * 40, dd = k => { const [a, b] = parse(k); return hypot2((a + 0.5) * CH - tx, (b + 0.5) * CH - ty); };
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
      for (const c of g.crates) if (dc[c.id] && !dc[c.id].loot.length && FURN[c.kind] && !/^(shelf|box|toolbox|gunlocker)/.test(c.kind) && !c.loot.some(i => UNIQUE_SPAWN.has(i.id))) // nunca repõe quem nasceu com key/gascan/hose (regra do dono); kind sem tabela nao repoe (R1)
        { const it = mkItem(r, pick(r, FURN[c.kind])); dc[c.id] = Object.assign({}, dc[c.id], { opened: false, loot: [it].filter(i => REPO_OK.has(i.id)) }); } // repoe so com a tabela do proprio movel e so material (pano, arame, garrafa): nunca comida, remedio, municao, arma, armadura nem mochila (R2)
      for (const z of g.zombies) if (dz[z.id] === null) delete dz[z.id]; // shortcut: se o zumbi saiu para outro chunk, duplica; aceitavel
    }
    const tag = l => l.forEach(e => { e.ch = key; });
    for (const k of ['roads', 'ways', 'trees', 'fences', 'props']) { tag(g[k]); G[k].push(...g[k]); }
    g.fences.forEach((f, i) => { f.id = key + ':f:' + i; });
    g.houses.forEach(h => h.doors.forEach(dr => { const v = dd0[dr.id]; if (v === undefined) return; if (typeof v === 'object') { dr.open = !!v.open; dr.locked = !!v.locked; if (v.hp !== undefined) dr.hp = v.hp; dr.broken = !!v.broken; } else dr.open = v; })); // v:3 {open,locked}
    G.houses.push(...g.houses);
    g.tanks.forEach(t => { t.ch = key; const v = (d.tanks || {})[t.id]; if (v) Object.assign(t, v); G.tanks.push(t); });
    g.crates.forEach(c => { if (dc[c.id]) Object.assign(c, dc[c.id]); G.crates.push(c); });
    for (const id in dc) if (dc[id] && isFinite(dc[id].x) && !g.crates.some(c => c.id === id)) G.crates.push(Object.assign({ id, ch: key }, dc[id])); // tumbas
    g.zombies.forEach(z => { if (dz[z.id] === null || has(G.zombies, z.id)) return; G.zombies.push(Object.assign(z, dz[z.id])); });
    g.cars.forEach(c => { if (dk[c.id] === null || has(G.cars, c.id)) return; G.cars.push(Object.assign(c, dk[c.id])); });
    for (const [dd, l, b, def] of [[dz, G.zombies, g.zombies, { state: 'idle', alert: 0, atk: 0 }], [dk, G.cars, g.cars, { speed: 0 }]]) // estrangeiras
      for (const id in dd) if (dd[id] && !(l === G.zombies && id.startsWith('h:')) && !b.some(e => e.id === id) && !has(l, id)) l.push(Object.assign({}, def, dd[id], { ch: key }));
    for (const id in (d.drops || {})) if (d.drops[id].expires > G.t) G.drops.push(Object.assign({ id, ch: key }, d.drops[id]));
    for (const id in (d.spills || {})) if (d.spills[id].expires > G.t) G.spills.push(Object.assign({ id, ch: key, r: 2.5 }, d.spills[id]));
    G.zombies.forEach(z => { if (z.look === undefined) Object.assign(z, zv(z.id)); }); // saves antigos
    G.events.push({ type: 'chunkLoad', key });
  }
  // diff do chunk (sem descarregar); null se igual ao gen
  function diffOf(key) {
    const [cx, cy] = parse(key), g = G._gb.get(key) || gen(cx, cy), d = { crates: {}, cars: {}, zombies: {}, doors: {}, drops: {}, spills: {}, tanks: {} };
    G.houses.forEach(h => { if (h.ch === key) h.doors.forEach(dr => { const b = g.houses.find(q => q.id === h.id).doors.find(q => q.id === dr.id); if (dr.open !== b.open || !!dr.locked !== !!b.locked || dr.hp !== b.hp || !!dr.broken) d.doors[dr.id] = { open: dr.open, locked: !!dr.locked, hp: dr.hp, broken: !!dr.broken }; }); });
    G.tanks.forEach(t => { const b = t.ch === key && g.tanks.find(q => q.id === t.id); if (b && b.fuel !== t.fuel) d.tanks[t.id] = { fuel: t.fuel }; }); // tanque sifonado
    G.crates.forEach(c => {
      if (c.ch !== key) return;
      const b = g.crates.find(q => q.id === c.id);
      if (!b) d.crates[c.id] = c.tomb && !c.loot.length ? null : strip(c); // tumba esvaziada: null
      else if (!same(c.loot, b.loot) || !!c.locked !== !!b.locked) d.crates[c.id] = { opened: c.opened, loot: c.loot, locked: !!c.locked }; // locked: cadeado cortado
    });
    G.drops.forEach(e => { if (e.ch === key) d.drops[e.id] = { x: e.x, y: e.y, item: e.item, expires: e.expires }; });
    G.spills.forEach(e => { if (e.ch === key) d.spills[e.id] = { x: e.x, y: e.y, expires: e.expires }; });
    for (const [l, b, o, f] of [[G.zombies, g.zombies, d.zombies, ['x', 'y', 'hp', 'floor', 'limp', 'crawl']], [G.cars, g.cars, d.cars, ['x', 'y', 'dir', 'fuel', 'trunk', 'hp', 'burnt']]]) {
      l.forEach(e => {
        if (e.ch !== key || (l === G.zombies && hz(e))) return; // membros de horda (h:) nunca vao ao diff
        if (e.burn > 0) e = Object.assign({}, e, { burnt: true, fuel: 0, trunk: [] }); // descarregou/salvou em chamas: vira carcaca, sem explosao
        const q = b.find(z => z.id === e.id);
        if (!q) o[e.id] = strip(e);
        else if (f.some(k => !same(e[k], q[k]))) o[e.id] = Object.fromEntries(f.map(k => [k, e[k]]));
      });
      b.forEach(q => { if (!l.some(e => e.id === q.id && e.ch === key)) o[q.id] = null; }); // morto ou saiu
    }
    for (const k of ['crates', 'cars', 'zombies', 'doors', 'drops', 'spills', 'tanks']) if (!Object.keys(d[k]).length) delete d[k];
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

  // ---- hordas (J4): 1 por celula de 6x6 chunks (240 m); posicao PURA por formula (sem simulacao fora da area): segmento de 300 s entre pontos P_k e P_k+1 a 120 m do centro da celula ----
  const HC = 6 * CH, HSEG = 300, HMEMO = new Map();
  const hordeN = gid => { const [hx, hy] = gid.split(',').map(Number); return 8 + hash(G.seed, hx, hy, 9000) % 8; };
  const hordePt = (gid, k) => fifo(HMEMO, G.seed + ':' + gid + ':' + k, () => { const [hx, hy] = gid.split(',').map(Number), a = hash(G.seed, hx, hy, 9002 + k) / 4294967296 * 2 * Math.PI; return [hx * HC + HC / 2 + 120 * Math.cos(a), hy * HC + HC / 2 + 120 * Math.sin(a)]; }, 400);
  function hordePos(gid, t) {
    const k = Math.floor(t / HSEG), f = (t - k * HSEG) / HSEG, a = hordePt(gid, k), b = hordePt(gid, k + 1);
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, dx: b[0] - a[0], dy: b[1] - a[1] };
  }
  // 1x/s: reposicao dos mortos (60 min), fila de materializacao dos grupos das 3x3 celulas em volta, G.hordeNear e gemido
  function hordeSync() {
    const p = G.player, hx0 = Math.floor(p.x / HC), hy0 = Math.floor(p.y / HC), mn = Math.floor(G.t / 60);
    for (const id in G.hordes) if (mn - G.hordes[id].m >= 60) delete G.hordes[id];
    const by = {}; for (const z of G.zombies) if (z.hg) (by[z.hg] = by[z.hg] || []).push(z);
    let near = null;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gid = (hx0 + i) + ',' + (hy0 + j), n = hordeN(gid), left = n - ((G.hordes[gid] || {}).k || 0), al = by[gid];
      if (al) G._hseen[gid] = G.t;
      if (left <= 0 && !al) continue;
      let P = al ? { x: al.reduce((s, z) => s + z.x, 0) / al.length, y: al.reduce((s, z) => s + z.y, 0) / al.length } : hordePos(gid, G.t);
      const d = dist(P, p);
      if (d <= 25 && (!near || d < near.d)) near = { a: Math.atan2(P.y - p.y, P.x - p.x), d };
      if (al || G.t - (G._hseen[gid] === undefined ? -1e9 : G._hseen[gid]) < 60 || G._hq.some(q => q.gid === gid) || d < 20 || !lsAt(P.x, P.y)) continue;
      for (let m = 0; m < left; m++) G._hq.push({ gid, i: m });
    }
    G.hordeNear = near;
    if (near) {
      hint('horda', 'Horda por perto — entre numa casa e feche a porta, ou agache e saia de lado', 'horda');
      if (G.t >= G._hmn) { G._hmn = G.t + 4 + (hash(G.seed, Math.floor(G.t), 0, 9005) % 2001) / 1000; G.events.push({ type: 'hordeMoan', d: near.d }); }
    }
    if (infestAt(p.x, p.y) >= 2) hint('infest', 'Área infestada: mais zumbis por aqui', 'infestada');
    if (G.zombies.some(z => z.crawl && z.hp > 0 && dist(z, p) < 10)) hint('crawl', 'Rastejante: lento e baixo — cuidado ao passar perto', 'rastejante');
  }
  // ate 3 membros por update (fila G._hq), nunca no update em que o pump carregou/descarregou chunk; so com G.zombies < 88
  function hordeSpawn() {
    const p = G.player;
    for (let c = 0; c < 3 && G._hq.length; c++) {
      if (G.zombies.length >= 88) { G._hq.length = 0; return; } // o resto fica na contagem (nao nasce)
      const q = G._hq.shift(), [hx, hy] = q.gid.split(',').map(Number), P = hordePos(q.gid, G.t), id = 'h:' + q.gid + ':' + q.i;
      if (G.zombies.some(z => z.id === id)) continue;
      const a = hash(G.seed, hx * 64 + q.i, hy, 9006) / 4294967296 * 2 * Math.PI, rad = 3 * Math.sqrt(hash(G.seed, hx * 64 + q.i, hy, 9007) / 4294967296), crawl = hash(G.seed, hx * 64 + q.i, hy, 9008) % 10 === 0, hl = hypot2(P.dx, P.dy) || 1;
      const ox = Math.cos(a) * rad - (crawl ? P.dx / hl * (3 + rad) : 0), oy = Math.sin(a) * rad - (crawl ? P.dy / hl * (3 + rad) : 0), f = nearFree(P.x + ox, P.y + oy);
      if (!lsAt(f.x, f.y) || dist(f, p) < 12 || houseAt(f)) continue;
      const z = { id, ch: chOf(f), x: f.x, y: f.y, hp: 60, state: 'idle', alert: 0, atk: 0, runner: false, police: false, hg: q.gid, ho: [ox, oy], ...zv(id) };
      if (crawl) z.crawl = true;
      G.zombies.push(z);
    }
  }

  // novo mundo (st undefined) ou estado salvo
  function start(seed, slot, st) {
    G.gv = st ? (st.gv || 0) : 1; // gv:1 = gen com densidade/rastejantes; mundo salvo sem gv fica com o gen antigo (v:4 intocado)
    HMEMO.clear();
    st = st || {};
    MEMO.cen.clear(); MEMO.edge.clear(); MEMO.sq.clear(); MEMO.lm.clear();
    G.seed = seed; G.slot = slot; G._pe = false; // evento pendente de painel não vaza para o mundo novo
    rng = mulberry32(seed);
    G.t = st.t > 0 ? st.t : 0; G.dead = false; G.cd = 0; G.nextId = st.nextId > 0 ? st.nextId : 0;
    G._hunger = G._starve = G._spawn = G._as = 0; G._bad = 0;
    G.dying = []; G._hp = 100; G._rw = false;
    G.hints = st.hints || {}; G.chunks = st.chunks || {}; G.hordes = st.hordes || {}; G._hq = []; G._hseen = {}; G.hordeNear = null; G._hmn = 0; G._hnext = 0;
    G.events = []; G.queue = []; G.loaded = []; G._ls = new Set(); G.chunkGen = 0; G._gb = new Map(); G._gp = {}; G._ws = null; G.fires = []; G.flights = []; G.spills = [];
    const s0 = (st.players && st.players[0]) || {}, num = (v, d) => Number.isFinite(v) ? v : d;
    const p = G.player = { x: num(s0.x, 23), y: num(s0.y, 23), dir: num(s0.dir, 0), hp: num(s0.hp, 100), hunger: num(s0.hunger, 100),
      inv: s0.inv || [{ id: 'ammo', qty: 16 }], weapon: s0.weapon || 'pipe', equip: s0.equip || {}, car: s0.car || null,
      input: { mx: 0, my: 0, attack: false, interact: false, run: false, crouch: false, hold: false, target: null }, near: null, open: null,
      stamina: Math.max(0, Math.min(100, num(s0.stamina, 100))), crouch: !!s0.crouch, floor: s0.floor === 1 ? 1 : 0, running: false, noise: 0, anim: { move: 'idle', act: null, t: 0 }, inside: null, action: null };
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
    if (st.players && !free(p.x, p.y, undefined, p.car, p.floor)) { const q = nearFree(p.x, p.y); p.x = q.x; p.y = q.y; } // save dentro de cerca/obstaculo
    G.events = [];
  }

  const DEV_LM = ['market', 'igreja', 'delegacia', 'posto', 'farmacia', 'oficina', 'hospital', 'saude', 'escola', 'cemiterio', 'galpao']; // dev.tp para landmark
  const LMH = { // dica ao entrar num landmark: kind -> [id da dica, texto, id do guia]
    market: ['mercado', 'Mercado: comida nas gôndolas, materiais no depósito', 'interior'],
    igreja: ['igreja', 'Igreja: bancos e altar; a sacristia, nos fundos, guarda panos e garrafas — e há zumbis na nave', 'igreja'],
    delegacia: ['delegacia', 'Delegacia: policiais zumbis e armário de armas trancado — leve um alicate', 'delegacia'],
    posto: ['posto', 'Posto: a loja guarda galões e mangueiras; a gasolina está no tanque do pátio', 'posto'],
    patio: ['posto', 'Posto: a loja guarda galões e mangueiras; a gasolina está no tanque do pátio', 'posto'],
    farmacia: ['farmacia', 'Farmácia: atadura nas prateleiras, mas é raro', 'farmacia'],
    oficina: ['oficina', 'Oficina: ferramentas nas bancadas; às vezes um carro, com a chave na gaveta', 'oficina'],
    hospital: ['hospital', 'Hospital: carrinhos e armarinhos guardam atadura (pouca); enfermarias no andar de cima, e zumbis de jaleco', 'hospital'],
    saude: ['hospital', 'Posto de saúde: um carrinho e um armarinho — atadura é rara, mas vale conferir', 'hospital'],
    escola: ['escola', 'Escola: a cantina tem geladeira e armário; os armários do vestiário guardam panos e, raro, mochila escolar', 'escola'],
    capela: ['cemiterio', 'Cemitério: a capela tem uma sacristia; as lápides não guardam nada — e há zumbis entre elas', 'cemiterio'],
    galpao: ['galpao', 'Galpão: caixas de depósito e uma sala de controle; às vezes uma van, com a chave na gaveta', 'galpao'],
  };
  const g = (id, titulo, palavras, precisa, passos, demo) => ({ id, titulo, palavras, precisa, passos, demo });
  const GUIDE = [
    g('siphon', 'Gasolina e sifão', ['gasolina', 'sifao', 'combustivel', 'galao', 'mangueira', 'carro'], [{ item: 'hose', onde: 'loja do posto, galpões e porta-malas' }, { item: 'gascan', onde: 'loja do posto, galpões e porta-malas' }], ['Chegue perto de um carro com gasolina.', 'Segure SIFONAR até encher o galão (2 L/s, máx. 10 L).', 'Com a chave do carro, segure DESPEJAR para abastecer.', 'Gasolina é finita: está nos carros e no tanque de um posto por cidade (veja Posto de gasolina).'], 'siphon'),
    g('car', 'Dirigir', ['carro', 'dirigir', 'volante', 'acelerar', 'freio', 'motor', 'atropelar', 'sair'], [{ item: 'key', onde: 'móvel de casa no mesmo quarteirão' }, { item: 'gascan', onde: 'loja do posto, galpões e porta-malas' }], ['Com a chave, toque ENTRAR perto do carro.', 'Joystick: frente acelera, trás freia e dá ré; os lados viram.', 'Gasta combustível, faz barulho e atropela zumbis. Toque SAIR em lugar livre.'], 'car'),
    g('carDmg', 'Dano do carro', ['dano', 'bater', 'batida', 'vida', 'fumaca', 'poça', 'poca', 'explosao', 'incendio', 'vazamento', 'carro'], [], ['Bater acima de 18 km/h estraga o carro (barra de vida ao dirigir).', 'Vida baixa = mais lento; em 0 o motor morre.', 'Com 0 de vida, outra batida forte pode vazar gasolina (poça acende com fogo) ou pegar fogo: saia, vai explodir em 5 s.'], 'car'),
    g('trunk', 'Porta-malas', ['porta-malas', 'mala', 'carro', 'bagageiro', 'vasculhar'], [], ['Chegue atrás do carro e toque MALA.', 'Fique parado 1 s: o painel abre (10 espaços).', 'Toque um item para mover entre porta-malas e mochila.'], 'trunk'),
    g('molotov', 'Molotov', ['molotov', 'fogo', 'bomba', 'incendio', 'queimar', 'garrafa'], [{ item: 'bottle', onde: 'armários' }, { item: 'rag', onde: 'armários e gavetas' }, { item: 'gascan', onde: 'loja do posto, galpões e porta-malas (gasta 2 L)' }], ['Fabrique no MENU: garrafa + trapo + 2 L do galão (o galão fica).', 'Troque para MOLOTOV e toque ATACAR: mira sozinho em zumbi de 3,5 a 12 m.', 'Dano 35 e fogo por 3 s. Cuidado: o fogo queima você também.'], 'throw'),
    g('key', 'Chave do carro', ['chave', 'carro', 'dirigir', 'ligar'], [{ item: 'key', onde: 'móvel de casa no mesmo quarteirão' }], ['Procure nas casas próximas ao carro.', 'Com a chave, toque ENTRAR perto do carro.'], 'key'),
    g('food', 'Comida', ['comida', 'fome', 'comer', 'curar', 'atadura', 'bandagem'], [{ item: 'food', onde: 'geladeiras, armários e fogões (não volta depois de pega)' }, { item: 'bandage', onde: 'armarinho de remédios, gavetas e prateleiras (raro)' }], ['Abra a mochila no MENU.', 'Toque na comida para comer (fome +30) ou na bandagem para curar (vida +25).'], 'food'),
    g('tomb', 'Tumba', ['tumba', 'morte', 'morrer', 'mochila'], [{ lugar: 'ponto de sua morte', onde: 'marcado em vermelho no Mapa' }], ['Ao morrer você volta ao início e deixa uma tumba com tudo.', 'Abra o Mapa e ache o ponto vermelho.', 'Vá até lá e toque PEGAR.'], 'search'),
    g('correr', 'Correr', ['correr', 'corrida', 'folego', 'rapido', 'joystick', 'shift', 'andar'], [], ['Empurre o joystick até a borda para correr.', 'No teclado, segure SHIFT.', 'Correr gasta fôlego: ande para recuperar.'], 'run'),
    g('furtivo', 'Ataque furtivo', ['furtivo', 'costas', 'silencioso', 'matar', 'escondido', 'stealth'], [], ['O zumbi só percebe você na frente dele (cone de 120 graus): correndo a 5 m, andando ou parado a 2 m, agachado a 0,5 m.', 'Pelas costas ele não percebe, e parede esconde você — só o tiro (5 m) e o motor do carro chamam a atenção.', 'Acerto pelas costas (corpo a corpo ou tiro): dano dobrado e chance de matar na hora (50 % se ele não te notou, 25 % se já te perseguia).'], 'crouch'),
    g('agachar', 'Agachar', ['agachar', 'agachado', 'furtivo', 'silencio', 'esconder'], [], ['Toque o botão AGACHAR acima do joystick (no teclado: C).', 'Agachado: mais lento, passos quase mudos e menos visível.', 'Toque de novo para levantar.'], 'crouch'),
    g('atacar', 'Atacar e armas', ['atacar', 'arma', 'bater', 'cano', 'pistola', 'municao', 'tiro', 'luta'], [{ item: 'pipe', onde: 'você já começa com um' }, { item: 'pistol', onde: 'gavetas (rara) e policiais' }, { item: 'ammo', onde: 'gavetas e policiais' }], ['Toque ATACAR para bater (cano: curto alcance, cone à frente).', 'Pistola gasta 1 munição e acerta de longe; o barulho atrai zumbis.', 'Toque a arma (canto) para trocar: só aparecem as armas que você tem.', 'Ao atacar você vira sozinho para o zumbi mais perto (anel amarelo no chão): corpo a corpo até 2 m, pistola até 12 m.'], 'pipe'),
    g('buscar', 'Buscar em móveis', ['buscar', 'vasculhar', 'movel', 'bau', 'geladeira', 'armario', 'gaveta', 'loot'], [], ['Chegue perto de um móvel e toque BUSCAR.', 'Fique parado 1 s: se mexer, cancela. O painel abre.', 'Já vasculhado: um marcador verde aparece no topo do móvel e abrir de novo é imediato.', 'Toque um item para mover; o que não couber fica onde está.'], 'search'),
    g('container', 'Contêineres', ['container', 'conteiner', 'guardar', 'esconderijo', 'tumba', 'movel', 'mala', 'painel', 'pegar tudo'], [], ['BUSCAR abre o contêiner: ele à esquerda, sua mochila à direita.', 'Toque um item para mover a pilha; segure para mover 1.', 'Pegar tudo leva o que couber. Móvel 6, gôndola 8, porta-malas 10, tumba sem limite.', 'Você pode guardar qualquer item: vira esconderijo.'], 'search'),
    g('bag', 'Mochilas', ['mochila', 'mochilas', 'espacos', 'escolar', 'trilha', 'militar', 'costas', 'equipar'], [{ item: 'bag_school', onde: 'guarda-roupas (raro)' }, { item: 'bag_hiking', onde: 'guarda-roupas e porta-malas (muito raro)' }, { item: 'bag_military', onde: 'base militar' }], ['Equipe no MENU: escolar +4, trilha +8, militar +12 espaços.', 'Para tirar, esvazie os espaços extras antes.', 'Ao morrer, a mochila vai para a tumba.'], 'equip'),
    g('porta', 'Portas', ['porta', 'abrir', 'fechar', 'casa', 'arrombar', 'batente'], [], ['Toda porta de casa começa fechada: perto dela, toque AÇÃO para abrir ou fechar.', 'Só fecha sem ninguém a menos de 1 m.', 'Zumbi não abre porta: ele bate e vai quebrando (100 de vida, 200 se tiver cadeado; 1 zumbi leva 4 s, 2 levam 2 s).', 'Porta quebrada fica aberta, torta, e nunca mais fecha.'], 'search'),
    g('locked', 'Porta trancada', ['trancada', 'trancado', 'cadeado', 'porta', 'abrir', 'cortar'], [{ item: 'cutter', onde: 'caixas de ferramentas nas casas, oficinas, galpões e porta-malas (raro)' }], ['Algumas portas de casa têm cadeado: AÇÃO não abre.', 'Com o alicate na mochila, segure CORTAR por 1,5 s parado.', 'Zumbis também não passam por porta trancada.'], 'cutter'),
    g('cutter', 'Alicate corta-cadeado', ['alicate', 'corta', 'cadeado', 'cortar', 'ferramenta', 'trancada'], [{ item: 'cutter', onde: 'caixas de ferramentas nas casas, oficinas, galpões e porta-malas (raro)' }], ['Fica na mochila e vira o botão CORTAR perto de porta trancada.', 'Segure 1,5 s sem mexer o joystick; o corte faz barulho.', 'Tem 4 usos e depois quebra.'], 'cutter'),
    g('moveis', 'Cômodos e móveis', ['cozinha', 'quarto', 'banheiro', 'sala', 'fogao', 'pia', 'cama', 'sofa', 'estante', 'criado', 'remedio', 'movel', 'tocar'], [{ item: 'bandage', onde: 'armarinho de remédios do banheiro (raro)' }, { item: 'food', onde: 'geladeira, armários e fogão da cozinha' }, { item: 'rag', onde: 'guarda-roupa, criado-mudo e estante' }], ['Cada casa tem cozinha, quarto, banheiro e sala com móveis próprios.', 'Fogão, geladeira, armários, guarda-roupa, criado-mudo, armarinho, estante e gaveteiro guardam itens; cama, sofá, mesa, vaso e pia só atrapalham.', 'O móvel aceso é o alvo do BUSCAR; ou toque direto no móvel perto de você.'], 'search'),
    g('mochila', 'Mochila', ['mochila', 'inventario', 'slots', 'cheia', 'pilha', 'limite'], [], ['A mochila tem 8 slots; itens iguais empilham até o limite.', 'Armas, armaduras, chaves, galões e mangueira ocupam 1 slot cada.', 'Cheia: nada novo é coletado, só completa pilhas.'], 'food'),
    g('drop', 'Largar item', ['largar', 'soltar', 'chao', 'jogar', 'pegar', 'dropar'], [], ['Na mochila, escolha o item e toque LARGAR (1 unidade).', 'Para recolher, chegue perto e toque PEGAR.', 'Itens no chão somem em 5 minutos.'], 'food'),
    g('armor', 'Armadura', ['armadura', 'capacete', 'jaqueta', 'caneleira', 'equipar', 'proteger', 'durabilidade'], [{ item: 'helmet', onde: 'guarda-roupas (raro) e policiais' }, { item: 'jacket', onde: 'guarda-roupas (raro)' }, { item: 'shinguards', onde: 'guarda-roupas (muito raro)' }], ['Abra Equipar no MENU e toque na peça para vestir.', 'Cada peça reduz 20 % do dano (máx. 60 %).', 'Cada golpe absorvido gasta durabilidade; a peça quebra e some.'], 'equip'),
    g('craft', 'Fabricar', ['fabricar', 'receita', 'craft', 'criar', 'combinar'], [{ item: 'wire', onde: 'gavetas, caixas e armários' }, { item: 'pipe', onde: 'você já começa com um' }], ['Abra Fabricar no MENU: veja os ingredientes, mesmo sem tê-los.', 'Com tudo na mochila, toque FABRICAR.'], 'craft'),
    g('pipe_r', 'Cano reforçado', ['cano reforcado', 'arame', 'cano', 'taco', 'melhorar'], [{ item: 'pipe', onde: 'você já começa com um' }, { item: 'wire', onde: 'gavetas, caixas e armários' }], ['Junte cano + arame em Fabricar.', 'Dano 35 (cano comum: 25), mesmo ritmo.', 'Troque de arma com o botão de arma.'], 'craft'),
    g('zombie', 'Zumbis', ['zumbi', 'inimigo', 'corredor', 'horda', 'perigo', 'fugir'], [], ['Zumbis ouvem você de longe; agache para passar quieto.', 'Corredores são mais rápidos: só a corrida escapa.', 'Ao morder, param um instante: bata ou saia do alcance.'], 'pipe'),
    g('rastejante', 'Rastejante', ['rastejante', 'rastejar', 'arrastar', 'chao', 'lento', 'baixo', 'manco'], [], ['Zumbi que se arrasta no chão: cerca de 1 em 10 — lento (0,8 m/s) e baixo.', 'Só alcança de perto (0,8 m) e leva 1,2 s para o bote; o dano é o mesmo (15).', 'Costuma vir atrás de um grupo, e não pula cerca nem sobe escada.', 'Zumbi baleado na perna também passa a rastejar.'], 'crawl'),
    g('tiro', 'Tiro: cabeça e perna', ['tiro', 'cabeca', 'headshot', 'perna', 'manco', 'pistola', 'mirar', 'rastejar'], [{ item: 'pistol', onde: 'gavetas (rara) e policiais' }, { item: 'ammo', onde: 'gavetas e policiais' }], ['Cada tiro que acerta pode pegar a cabeça: 10 % de chance (20 % parado e a até 4 m) — mata na hora, e o anel de mira fica laranja.', 'Ou a perna (25 %): o zumbi fica manco (mais lento, ×0,6) e, no segundo tiro na perna, passa a rastejar.', 'Manco ainda morde. Sem tiro de cabeça, o dano é 50.', 'A pistola também erra: base 20 %, +15 % andando, +30 % correndo, +2 % por metro além de 4 m, −10 % agachado ou parado (5 a 70 %). Parado e perto, erra bem menos.'], 'shot'),
    g('horda', 'Horda', ['horda', 'grupo', 'bando', 'perseguicao', 'fugir', 'gemido', 'seta', 'grito'], [], ['Hordas de 8 a 15 zumbis vagam pelo mapa; uma seta vermelha na borda da tela mostra de onde vem (a menos de 25 m).', 'Zumbi que persegue a menos de 5 m grita e chama até 4 vizinhos parados: se você não fugir, vira horda.', 'Entre numa casa e feche a porta, ou agache e saia de lado. Barulho (tiro, motor) chama mais.', 'Os mortos da horda não voltam antes de 60 minutos de jogo.'], 'horde'),
    g('infestada', 'Áreas infestadas', ['infestada', 'calma', 'densidade', 'vermelho', 'regiao', 'mapa', 'zumbis', 'centro'], [], ['O mundo tem regiões calmas (metade dos zumbis), normais e infestadas (o dobro, e novos zumbis nascem mais rápido).', 'O centro das cidades costuma ser pior.', 'No Mapa, as regiões infestadas já exploradas ficam num tom vermelho.'], 'horde'),
    g('police', 'Policial zumbi', ['policial', 'policia', 'quepe', 'azul'], [{ item: 'ammo', onde: 'policiais mortos' }, { item: 'pistol', onde: 'policiais mortos (raro)' }, { item: 'helmet', onde: 'policiais mortos (muito raro)' }], ['Zumbi de camisa azul e quepe.', 'Ao morrer pode soltar munição, pistola, bandagem ou capacete.'], 'ammo'),
    g('hunger', 'Fome', ['fome', 'comer', 'estomago', 'faminto'], [{ item: 'food', onde: 'geladeiras, armários e zumbis' }], ['A fome cai com o tempo.', 'Com fome zerada você perde vida e fôlego.', 'Coma pela mochila.'], 'food'),
    g('fence', 'Cercas', ['cerca', 'pular', 'pulo', 'obstaculo', 'muro'], [], ['Cercas bloqueiam o caminho.', 'Perto de uma cerca, toque PULAR (gasta fôlego).', 'Zumbis levam alguns segundos para atravessar.'], 'jump'),
    g('map', 'Mapa', ['mapa', 'explorar', 'mundo', 'onde', 'localizar'], [], ['Abra o MENU e toque a aba Mapa.', 'Mostra os quarteirões que você já visitou.', 'O ponto vermelho é sua tumba.'], 'run'),
    g('cidades', 'Estradas e cidades', ['estrada', 'cidade', 'vila', 'posto', 'rural', 'sitio', 'viagem', 'caminho'], [], ['Estradas curvas ligam as cidades; fora delas só há pasto, árvores e sítios.', 'Sítios ficam na beira da estrada, com a porta virada para ela.', 'Postos de gasolina ficam na saída das cidades.', 'O Mapa mostra as estradas e os mercados.'], 'run'),
    g('sobrado', 'Sobrado e escada', ['sobrado', 'escada', 'andar', 'subir', 'descer', 'andar de cima', 'quarto', 'escadas'], [], ['Algumas casas têm 2 andares, com uma escada dentro.', 'Chegue perto da escada e toque SUBIR: fique parado 0,8 s.', 'Em cima ficam quartos e banheiro — e às vezes um zumbi.', 'Zumbis também sobem e descem a escada atrás de você.'], 'stairs'),
    g('garagem', 'Garagem e portão', ['garagem', 'portao', 'carro', 'chave', 'ferramenta', 'alicate'], [{ item: 'key', onde: 'móvel da própria casa (se há carro na garagem)' }, { item: 'cutter', onde: 'caixa de ferramentas da garagem (muito raro)' }], ['O portão da garagem nunca tem cadeado: toque AÇÃO para abrir.', 'Se há carro dentro, a chave está num móvel da mesma casa.', 'Garagem sem carro tem uma caixa de ferramentas.'], 'search'),
    g('interior', 'Mercado', ['mercado', 'supermercado', 'deposito', 'gondola', 'loja'], [{ item: 'food', onde: 'gôndolas do mercado' }, { item: 'wire', onde: 'depósito do mercado' }], ['Mercados são raros e têm zumbis dentro.', 'Gôndolas guardam comida; o depósito, materiais.'], 'search'),
    g('posto', 'Posto de gasolina', ['posto', 'gasolina', 'tanque', 'bomba', 'tampa', 'galao', 'mangueira', 'sifao', 'combustivel'], [{ item: 'hose', onde: 'loja do posto, galpões e porta-malas' }, { item: 'gascan', onde: 'loja do posto, galpões e porta-malas (vazio)' }], ['As bombas estão sem energia: não saem litros por elas.', 'A gasolina está no tanque sob a tampa de metal no chão do pátio.', 'Chegue na tampa com mangueira + galão e segure SIFONAR (2 L/s).', 'Só um posto por cidade ainda tem gasolina, e ela não volta depois de tirada.'], 'tank'),
    g('delegacia', 'Delegacia', ['delegacia', 'policia', 'policial', 'armario', 'arma', 'cela', 'municao', 'cadeado', 'pistola'], [{ item: 'cutter', onde: 'caixas de ferramentas, oficinas e galpões (raro)' }, { item: 'ammo', onde: 'armário de armas da delegacia (trancado)' }], ['Delegacia: 3 a 5 policiais zumbis na recepção e um prisioneiro na cela.', 'O armário de armas e a porta da cela têm cadeado: segure CORTAR 1,5 s com o alicate.', 'No armário: munição, às vezes uma pistola ou um capacete — nada é garantido.'], 'cutter'),
    g('igreja', 'Igreja', ['igreja', 'sacristia', 'altar', 'bancos', 'praca', 'torre'], [{ item: 'rag', onde: 'sacristia da igreja' }, { item: 'bottle', onde: 'sacristia da igreja (raro)' }], ['A igreja fica numa quadra em frente à praça central, com uma torre ao lado.', 'A nave tem bancos e zumbis; a sacristia, nos fundos, guarda panos e garrafas.', 'Sem armas nem munição aqui.'], 'search'),
    g('farmacia', 'Farmácia', ['farmacia', 'remedio', 'atadura', 'bandagem', 'curar', 'prateleira'], [{ item: 'bandage', onde: 'prateleiras da farmácia (raro, até 1 por cidade)' }], ['Farmácia: 2 prateleiras de remédio e um balcão, com 1 ou 2 zumbis.', 'A bandagem é rara mesmo aqui: confira cada prateleira.'], 'bandage'),
    g('oficina', 'Oficina', ['oficina', 'bancada', 'ferramenta', 'alicate', 'carro', 'chave', 'gaveta', 'portao'], [{ item: 'key', onde: 'gaveta da bancada da oficina' }, { item: 'cutter', onde: 'bancadas de ferramentas (raro)' }], ['O portão da oficina nunca tem cadeado: toque AÇÃO para abrir.', 'Se há carro dentro, a chave está na gaveta da bancada.', 'As bancadas guardam arame, cano, mangueira e, raramente, um alicate.'], 'search'),
    g('hospital', 'Hospital e posto de saúde', ['hospital', 'saude', 'remedio', 'atadura', 'bandagem', 'enfermaria', 'maca', 'jaleco', 'carrinho'], [{ item: 'bandage', onde: 'carrinhos, armarinhos e farmácia interna (cadeado em metade) — pouca' }], ['O hospital tem 2 andares: recepção embaixo, enfermarias em cima (escada na parede).', 'Carrinhos e armarinhos guardam atadura, mas são poucos — confira todos.', 'A farmácia interna às vezes tem cadeado: alicate. Zumbis de jaleco vagam pelos corredores.', 'O posto de saúde das vilas é pequeno: 1 carrinho e 1 armarinho.'], 'bandage'),
    g('escola', 'Escola', ['escola', 'cantina', 'vestiario', 'armario', 'carteira', 'mochila', 'sala de aula'], [{ item: 'bag_school', onde: 'armários do vestiário (muito raro)' }, { item: 'food', onde: 'geladeira e armário da cantina (raro)' }], ['A escola tem 3 salas de aula (só carteiras), a cantina e o vestiário.', 'Cantina: geladeira e armário. Vestiário: 2 armários com panos e, raro, mochila escolar.'], 'search'),
    g('cemiterio', 'Cemitério', ['cemiterio', 'lapide', 'capela', 'sacristia', 'cerca', 'portao'], [{ item: 'rag', onde: 'sacristia da capela' }], ['Muro de cerca com o portão aberto ao sul; dá para pular a cerca (PULAR).', 'As lápides só atrapalham o caminho. A capela, no fundo, tem uma sacristia.', 'Há zumbis entre as lápides.'], 'jump'),
    g('galpao', 'Galpão', ['galpao', 'deposito', 'caixa', 'van', 'portao', 'sala de controle', 'chave', 'mangueira', 'galao'], [{ item: 'hose', onde: 'caixas do galpão' }, { item: 'gascan', onde: 'caixas do galpão (vazio)' }, { item: 'key', onde: 'gaveta da sala de controle (se há van)' }], ['O portão de 3 m nunca tem cadeado: toque AÇÃO para abrir.', 'Caixas de depósito: arame, mangueira, galão vazio e, raro, alicate.', 'A sala de controle guarda a gaveta com a chave da van.'], 'search'),
  ];
  const ITEM_DESC = { food: 'Comida enlatada ou embalada. Mata a fome.', bandage: 'Pano limpo para estancar ferimentos. Cura vida.', rag: 'Pedaço de pano velho. Serve de pavio e para fabricar.', wire: 'Rolo de arame. Reforça o cano.', ammo: 'Munição de pistola. Cada tiro gasta uma.', bottle: 'Garrafa de vidro vazia. Base do molotov.', jacket: 'Jaqueta grossa que protege o tronco. Gasta ao levar dano.', helmet: 'Capacete que protege a cabeça. Gasta ao levar dano.', shinguards: 'Caneleiras que protegem as pernas. Gastam ao levar dano.', bag_school: 'Mochila escolar de costas: poucos espaços extras.', bag_hiking: 'Mochila de trilha: mais espaços extras.', pistol: 'Arma de fogo. Acerta de longe, mas o tiro chama zumbis a 5 m.', cutter: 'Alicate corta-cadeado. Abre porta trancada; quebra após alguns usos.', pipe: 'Cano de ferro. Arma corpo a corpo de curto alcance.', hose: 'Mangueira de borracha. Com um galão, sifona gasolina de carros.', gascan: 'Galão para gasolina. Mostra quanto combustível carrega.', pipe_r: 'Cano reforçado com arame. Bate mais forte.', molotov: 'Garrafa incendiária. Fogo em área; queima você também.', key: 'Chave de um carro específico. Sem ela o carro não liga.', bag_military: 'Mochila militar: o maior espaço extra de costas.' };
  const ITEM_IDS = [...new Set([...Object.keys(STACK), ...Object.values(FURN).flatMap(t => t.map(x => x[0]).filter(Boolean)), ...RECIPES.map(r => r.out), 'pipe', 'pistol', 'key', 'helmet', 'jacket', 'shinguards', 'bag_school', 'bag_hiking', 'bag_military'])];

  const G = window.G = {
    t: 0, map: { chunk: CH }, nextId: 0, ref: [0, 0], chunkGen: 0, _ls: new Set(), _pk: '',
    chunks: {}, loaded: [], queue: [], fires: [], spills: [], flights: [], _gb: new Map(), _gp: {}, explored: [], roads: [], cars: [], trees: [], fences: [], drops: [], props: [], tanks: [], _pc: [], recipes: RECIPES, guide: GUIDE, ITEM_IDS, ITEM_DESC, HOLD_MS: 400, capOf, hurtPlayer, gen, infestAt, hordePos, loot: FURN, free, ways: [], onRoad: (x, y, m) => onRoadIn(G.roads, G.ways, x, y, m), zone, layout: layoutOf, center, cityAt, cityLM, _plans: { PLANS, lpRot }, _memo: MEMO,
    // dev (fora do save): so existe na memoria; UI liga com 7 toques na versao
    dev: {
      on: false, god: false, noclip: false, noMiss: false, speed: 1,
      spawnItem(id, n) { if (G.dead) return false; const it = mkItem(rng, id); if (n > 1 && STACK[id]) it.qty = Math.min(n, STACK[id]); if (id === 'gascan') it.fuel = 10; return addItem(it); }, // respeita mochila cheia; n so em pilhas (max da pilha)
      spawnZ(kind, n) { // 'walker' | 'runner' | 'police' | 'crawl' | 'limp' | 'horde' (10 'h:dev:' em perseguicao, nunca salvos), 6-10 m a frente
        const p = G.player; n = n || (kind === 'horde' ? 10 : 1);
        for (let i = 0; i < n; i++) for (let t = 0; t < 30; t++) {
          const a = p.dir + (rng() - 0.5), d = 6 + rng() * 4, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          if (!free(x, y, 1) || houseAt({ x, y })) continue;
          if (!lsAt(x, y)) continue;
          const h = kind === 'horde', zid = (h ? 'h:dev:' : 'p:') + G.nextId++;
          G.zombies.push({ id: zid, ch: chOf({ x, y }), x, y, hp: 60, state: h ? 'chase' : 'idle', alert: h ? 6 : 0, atk: 0, runner: kind === 'runner', police: kind === 'police', ...zv(zid), ...(kind === 'jaleco' || kind === 'macacao' ? { look: kind } : {}), ...(kind === 'crawl' ? { crawl: true } : {}), ...(kind === 'limp' ? { limp: true } : {}) }); break;
        }
      },
      spawnCar(o) { // {fuel litros 0-10, hp 0-100}: carro a 5-14 m a frente + chave na mochila; null se nao coube
        o = o || {}; const p = G.player;
        for (let d = 5; d <= 14; d++) {
          const x = p.x + Math.cos(p.dir) * d, y = p.y + Math.sin(p.dir) * d;
          if (!free(x, y, 2.2)) continue;
          const id = 'p:' + G.nextId++, car = { id, ch: chOf({ x, y }), x, y, dir: Math.round(p.dir / (Math.PI / 2)) * Math.PI / 2, speed: 0, fuel: o.fuel ?? 10, trunk: [], hp: o.hp ?? 100 };
          G.cars.push(car); addItem({ id: 'key', car: id, qty: 1 }); return car;
        }
        return null;
      },
      tp(w) { // 'spawn' | 'far' (+10 chunks) | 'car' | 'market' | 'locked' (mais perto, so entre os carregados); false se nao ha / dirigindo
        const p = G.player, near = (l, f) => l.map(f).filter(Boolean).sort((a, b) => dist(a, p) - dist(b, p))[0];
        if (G.dead || p.car) return false;
        const lmT = () => { // landmark mais perto (macro puro: vale para chunk descarregado) -> ponto na rua em frente a porta
          const mx = Math.floor(p.x / MC), my = Math.floor(p.y / MC); let best = null;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const c = center(mx + i, my + j); if (c) for (const m of cityLM(c)) { const d = hypot2(m.x + m.w / 2 - p.x, m.y + m.h / 2 - p.y); if ((w === 'market' ? m.kind.slice(0, 7) === 'mercado' : m.kind === w) && (!best || d < best.d)) best = { d, m }; } }
          if (!best) return null; const m = best.m, f = [[0, 1], [1, 0], [0, -1], [-1, 0]][m.rot];
          return { x: m.x + m.w / 2 + f[0] * (m.w / 2 + 2.5), y: m.y + m.h / 2 + f[1] * (m.h / 2 + 2.5) };
        };
        const t = DEV_LM.includes(w) ? lmT() : w === 'spawn' ? { x: 23, y: 23 } : w === 'far' ? { x: p.x + 10 * CH, y: p.y }
          : w === 'car' ? near(G.cars, c => c)
          : w === 'locked' ? near(G.houses.flatMap(h => h.doors), d => d.locked && { x: d.x + d.w / 2, y: d.y + d.h / 2 })
          : w === 'sobrado' ? near(G.houses, h => h.stairs && { x: h.stairs.lx0, y: h.stairs.ly0 })
          : w === 'garagem' ? near(G.houses, h => { const g = h.doors.find(d => d.gate); if (!g) return null; const gx = g.x + g.w / 2, gy = g.y + g.h / 2, l = hypot2(gx - h.x - h.w / 2, gy - h.y - h.h / 2) || 1; return { x: gx + (gx - h.x - h.w / 2) / l * 3, y: gy + (gy - h.y - h.h / 2) / l * 3 }; }) : null;
        if (!t) return false;
        Object.assign(p, nearFree(t.x, t.y), { near: null, action: null, floor: 0 }); return true;
      },
      fill() { const p = G.player; p.hp = p.hunger = p.stamina = 100; },
    },
    seed: 0, gv: 1, viewR: 7, hordes: {}, hordeNear: null, players: [], input: null, target: null, // compat 0.1: alias de players[0].input
    player: null, dying: [], zombies: [], crates: [], houses: [], events: [],
    dead: false, slot: 1, hints: {}, _as: 0, _dead: 0, cd: 0, _hunger: 0, _starve: 0, _spawn: 0,

    init(seed, slot) { start(seed ?? Date.now(), slot || 1); },

    save() {
      try {
        syncCh();
        const chunks = Object.assign({}, G.chunks);
        for (const k of G.loaded) { const d = diffOf(k); if (d) chunks[k] = d; else delete chunks[k]; }
        const pl = G.players.map(({ x, y, dir, hp, hunger, inv, weapon, equip, car, stamina, crouch, floor }) => ({ x, y, dir, hp, hunger, inv, weapon, equip, car, stamina, crouch, floor: floor || 0 }));
        localStorage['zl1:s' + G.slot] = JSON.stringify({ v: 4, seed: G.seed, t: G.t, nextId: G.nextId, players: pl, hints: G.hints, explored: G.explored, chunks, gv: G.gv, hordes: G.hordes });
        return true;
      } catch (e) {
        if (typeof localStorage !== 'undefined') G.events.push({ type: 'hint', id: 'saveFull', text: 'Save cheio — não feche o jogo antes de pegar a tumba' }); // sem localStorage: silencio
        return false;
      }
    },
    read(slot) {
      try { const o = JSON.parse(localStorage['zl1:s' + slot]); return o && o.v === 4 && Number.isFinite(o.seed) ? o : null; } catch (e) { return null; }
    },
    load(slot) {
      const o = G.read(slot);
      if (!o) return false;
      start(o.seed, slot, o);
      return true;
    },
    slotOld(slot) { try { const o = JSON.parse(localStorage['zl1:s' + slot]); return !!o && o.v < 4 && Number.isFinite(o.seed); } catch (e) { return false; } }, // mundo salvo antes das cidades (v:3): nao carrega, a UI explica
    slots() { return [1, 2, 3].map(slot => { const o = G.read(slot); return o && { slot, seed: o.seed, t: o.t || 0 }; }); },
    wipe(slot) { try { delete localStorage['zl1:s' + slot]; } catch (e) {} },
    respawn() { G.dead = false; },

    // painel aberto (players[0].open) = simulacao parada: update so descarta eventos velhos (a UI nao precisa de UI.paused)
    update(dt) {
      if (G.player && G.player.open) { if (G._pe) G._pe = false; else G.events = []; return; }
      G.events = []; // compat 0.1: contrato manda UI limpar, mas ui.js atual nao limpa
      dt = Math.min(dt, 0.25);
      if (G.dev.speed > 1 && !G.queue.length) dt *= G.dev.speed; // dev: tempo acelerado (passos continuam <= 0,05); pausa com chunks na fila
      syncCh();
      if (G.dead) G.player.anim.t += dt;
      if (G.dead && (G._dead -= dt) <= 0) { G.dead = false; G.player.anim.act = null; }
      while (dt > 1e-9 && !G.dead && !G.player.open) { const h = Math.min(dt, 0.05); step(h); dt -= h; }
      const cg = G.chunkGen; pump();
      if (!G.dead) { if (G.t >= G._hnext) { G._hnext = G.t + 1; hordeSync(); } if (cg === G.chunkGen) hordeSpawn(); }
    },

    useItem(slot) {
      const p = G.player, s = p.inv[slot];
      if (G.dead || !s) return;
      if (s.id === 'food') { p.hunger = Math.min(100, p.hunger + 30); setAct(p, 'eat'); }
      else if (s.id === 'bandage') { p.hp = Math.min(100, p.hp + 25); setAct(p, 'heal'); }
      else return;
      if (--s.qty <= 0) p.inv.splice(slot, 1);
    },
    switchWeapon() { // cicla so entre as armas que o jogador tem (o cano inicial sempre)
      const p = G.player, l = ['pipe'].concat(countOf(p, 'pipe_r') ? ['pipe_r'] : [], countOf(p, 'pistol') ? ['pistol'] : [], countOf(p, 'molotov') ? ['molotov'] : []);
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
      if (!c || c.e.locked || (near.type === 'trunk' && (p.car !== null || c.e.speed !== 0))) return false; // armario com cadeado nao abre
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
