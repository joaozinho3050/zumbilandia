// Céu Aberto — física de voo, câmeras, desafios, controles, HUD e som.
import * as THREE from '../lib/three.module.min.js';
import { criarCenario, HORAS } from './cenario.js';
import { criarAviao, PINTURAS, desenhaPainel } from './aviao3d.js';
import { LUGARES, DESAFIOS, PISTA, MUNDO, clamp, lerp, smooth } from './mundo.js';

const $ = (id) => document.getElementById(id);
const TOQUE = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (TOQUE) document.body.classList.add('touch');

// ---------- Salvamento ----------
const SAVE = 'ceu-aberto-v1';
let S = { desc: {}, recordes: {}, pintura: 0, hora: 1, inverter: false, assist: true, som: true, qual: TOQUE ? 'media' : 'alta', fumacaCor: 0 };
try { Object.assign(S, JSON.parse(localStorage.getItem(SAVE) || '{}')); } catch (e) {}
const salvar = () => { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {} };

const Q = { alta: S.qual === 'alta', sombra: S.qual === 'baixa' ? 0 : S.qual === 'alta' ? 2048 : 1024, pr: Math.min(devicePixelRatio, S.qual === 'alta' ? 2 : S.qual === 'media' ? 1.5 : 1) };

// ---------- Renderizador ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.qual !== 'baixa', powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pr); renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = !!Q.sombra; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 30000);
let escalaPontos = 1;
function redimensionar() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  escalaPontos = h * Q.pr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
addEventListener('resize', redimensionar);

await new Promise((r) => setTimeout(r, 30)); // deixa o "carregando" aparecer
const M = criarCenario(renderer, Q);
const cena = M.cena;

// ---------- Avião ----------
let aviao = criarAviao(PINTURAS[S.pintura % PINTURAS.length]); cena.add(aviao);
let P = aviao.userData.parts;
function trocarPintura(i) {
  S.pintura = i; salvar();
  const n = criarAviao(PINTURAS[i]); n.position.copy(aviao.position); n.quaternion.copy(aviao.quaternion); n.visible = aviao.visible;
  cena.remove(aviao); aviao = n; P = n.userData.parts; cena.add(n);
}

// ---------- Partículas (fumaça, fogo, faíscas) ----------
function sistema(max, aditivo) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(max * 3), cor = new Float32Array(max * 3), alfa = new Float32Array(max), tam = new Float32Array(max);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('cor', new THREE.BufferAttribute(cor, 3)); g.setAttribute('alfa', new THREE.BufferAttribute(alfa, 1)); g.setAttribute('tam', new THREE.BufferAttribute(tam, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { escala: { value: 1 }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) }, fog: true, transparent: true, depthWrite: false, blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `attribute vec3 cor; attribute float alfa, tam; uniform float escala; varying vec3 vC; varying float vA;
      #include <fog_pars_vertex>
      void main(){ vC = cor; vA = alfa; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = min(tam * escala / -mvPosition.z, 400.0);
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      #include <fog_pars_fragment>
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; if (a < 0.01) discard;
        gl_FragColor = vec4(vC, a);
        #include <fog_fragment>
      }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; cena.add(pts);
  const L = Array.from({ length: max }, () => ({ v: 0, vel: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color(), t0: 1, t1: 1, a0: 1, vida: 0, max: 1, arrasto: 0, sobe: 0 }));
  let prox = 0;
  return {
    emitir(p, vel, c, t0, t1, a0, vida, arrasto = 0.5, sobe = 0) { const o = L[prox]; prox = (prox + 1) % max; o.p.copy(p); o.vel.copy(vel); o.c.copy(c); o.t0 = t0; o.t1 = t1; o.a0 = a0; o.vida = 0; o.max = vida; o.arrasto = arrasto; o.sobe = sobe; o.v = 1; },
    atualizar(dt) {
      mat.uniforms.escala.value = escalaPontos;
      for (let i = 0; i < max; i++) { const o = L[i];
        if (o.v) { o.vida += dt; if (o.vida >= o.max) o.v = 0; else { o.vel.multiplyScalar(1 - o.arrasto * dt); o.vel.y += o.sobe * dt; o.p.addScaledVector(o.vel, dt); } }
        const k = o.vida / o.max;
        pos[i * 3] = o.p.x; pos[i * 3 + 1] = o.p.y; pos[i * 3 + 2] = o.p.z; cor[i * 3] = o.c.r; cor[i * 3 + 1] = o.c.g; cor[i * 3 + 2] = o.c.b;
        alfa[i] = o.v ? o.a0 * (1 - k) * smooth(0, 0.08, k) : 0; tam[i] = lerp(o.t0, o.t1, Math.sqrt(k));
      }
      for (const n of ['position', 'cor', 'alfa', 'tam']) g.attributes[n].needsUpdate = true;
    },
  };
}
const fumaca = sistema(Q.alta ? 1400 : 900, false), fogo = sistema(400, true);
const CORES_FUMACA = [['Branca', '#ffffff'], ['Vermelha', '#ff4b3e'], ['Azul', '#3e8bff'], ['Verde', '#3ed27a'], ['Amarela', '#ffd23e'], ['Arco-íris', null]];

// rastros de vórtice nas pontas das asas
function rastro() {
  const N = 50, g = new THREE.BufferGeometry(), pos = new Float32Array(N * 2 * 3), c = new Float32Array(N * 2 * 4), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 4)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.frustumCulled = false; cena.add(m);
  const pts = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), a: 0 })), cima = new THREE.Vector3();
  return {
    passo(p, up, forca) {
      pts.pop(); pts.unshift({ p: p.clone(), a: forca }); cima.copy(up).multiplyScalar(0.12);
      pts.forEach((o, i) => { const k = i * 6; pos[k] = o.p.x + cima.x; pos[k + 1] = o.p.y + cima.y; pos[k + 2] = o.p.z + cima.z; pos[k + 3] = o.p.x - cima.x; pos[k + 4] = o.p.y - cima.y; pos[k + 5] = o.p.z - cima.z;
        const a = o.a * (1 - i / N) * 0.55; for (let j = 0; j < 2; j++) c.set([1, 1, 1, a], (i * 2 + j) * 4); });
      g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true;
    },
  };
}
const rastroD = rastro(), rastroE = rastro();

// ---------- Estado do voo ----------
const V3 = () => new THREE.Vector3();
const A = { pos: V3(), q: new THREE.Quaternion(), V: 0, dir: V3(), queda: 0, acel: 0, rpm: 0, trem: 1, tremAlvo: 1, flap: 0, chao: true, vivo: true, morto: 0, G: 1, fumaca: false, estol: false, vs: 0, ultimoPouso: 0 };
const ent = { p: 0, r: 0, y: 0, freio: false, olhaX: 0, olhaY: 0 };
const VS = 27; // velocidade de estol (m/s)
const fwd = V3(), up = V3(), dir_ = V3(), tmpV = V3(), tmpV2 = V3(), tmpQ = new THREE.Quaternion(), EY = new THREE.Vector3(0, 1, 0), EX = new THREE.Vector3(1, 0, 0), EZ = new THREE.Vector3(0, 0, 1);
let ondeNasce = null;

function nascer(o) { // o = {x,z,y?,rumo,chao?}
  ondeNasce = o;
  A.q.setFromAxisAngle(EY, -THREE.MathUtils.degToRad(o.rumo || 0));
  fwd.set(0, 0, -1).applyQuaternion(A.q);
  if (o.chao) { A.pos.set(o.x, M.chao(o.x, o.z) + P.alturaTrem, o.z); A.V = 0; A.acel = 0; A.trem = A.tremAlvo = 1; A.chao = true; A.flap = 0; }
  else { const y = Math.max(o.y || 250, Math.max(0, M.chao(o.x, o.z)) + 120); A.pos.set(o.x, y, o.z); A.V = 58; A.acel = 0.7; A.trem = A.tremAlvo = 0; A.chao = false; A.flap = 0; }
  A.dir.copy(fwd); A.queda = 0; A.vivo = true; A.morto = 0; A.rpm = A.acel; aviao.visible = true;
  cam.iniciado = false;
}
function nascerLugar(l) {
  if (l.id === 'aero') return nascer({ x: PISTA.x, z: PISTA.z1 - 30, rumo: 0, chao: true });
  const a = THREE.MathUtils.degToRad(l.rumo); // chega voando na direção do lugar
  nascer({ x: l.x - Math.sin(a) * 900, z: l.z + Math.cos(a) * 900, y: l.y, rumo: l.rumo });
}

function fisica(dt) {
  fwd.set(0, 0, -1).applyQuaternion(A.q); up.set(0, 1, 0).applyQuaternion(A.q); const dir = tmpV2.set(1, 0, 0).applyQuaternion(A.q);
  const ry = dir.y, bank = Math.asin(clamp(-dir.y, -1, 1)), arf = Math.asin(clamp(fwd.y, -1, 1));
  const ctrl = clamp(A.V / 38, 0.12, 1.15);
  let pr = 1.5 * ent.p * ctrl, rr = 2.6 * ent.r * ctrl, yr = 0.45 * ent.y * ctrl;
  const vs = VS - A.flap * 5;
  if (!A.chao) {
    // ajuda de voo: manche de lado = inclinação alvo (até ~70°); no fim do curso gira de verdade
    if (S.assist && Math.abs(ent.r) < 0.92 && up.y > 0.2) rr = clamp((ent.r * 1.3 - bank) * 2.6, -2.2, 2.2) * Math.min(ctrl, 1);
    else if (S.assist && Math.abs(ent.r) < 0.1 && Math.abs(ent.p) < 0.1) rr = (ry < 0 ? -1.6 : 1.6) * Math.min(ctrl, 1); // de cabeça pra baixo: desvira
    if (S.assist && Math.abs(ent.p) < 0.1 && up.y > 0.5 && A.V > vs) pr -= arf * 0.5;        // e o nariz devagar
    A.estol = A.V < vs;
    if (A.estol) { // estol: o nariz cai na direção do chão
      tmpV.crossVectors(fwd, tmpV2.set(0, -1, 0)); if (tmpV.lengthSq() > 1e-4) { tmpV.normalize(); tmpQ.setFromAxisAngle(tmpV, (1 - A.V / vs) * 1.4 * dt); A.q.premultiply(tmpQ); }
    }
  } else A.estol = false;
  tmpQ.setFromAxisAngle(EX, pr * dt); A.q.multiply(tmpQ);
  tmpQ.setFromAxisAngle(EZ, -rr * dt); A.q.multiply(tmpQ);
  tmpQ.setFromAxisAngle(EY, -yr * dt); A.q.multiply(tmpQ);
  if (!A.chao) { // curva coordenada: inclinou, virou
    const w = 1.8 * 9.8 * Math.tan(clamp(bank, -1.25, 1.25)) / Math.max(A.V, 22) * clamp(up.y * 3, 0, 1) * smooth(0.3 * vs, vs, A.V);
    tmpQ.setFromAxisAngle(EY, -w * dt); A.q.premultiply(tmpQ);
  }
  A.q.normalize();
  fwd.set(0, 0, -1).applyQuaternion(A.q); up.set(0, 1, 0).applyQuaternion(A.q);

  // velocidade ao longo da trajetória
  A.rpm = lerp(A.rpm, A.vivo ? 0.18 + A.acel * 0.82 : 0, 1 - Math.exp(-dt * 2.5));
  const empuxo = A.acel * 24 * (1 - clamp(A.V / 110, 0, 1) * 0.6);
  const arrasto = (0.0019 + A.flap * 0.0011 + A.trem * 0.0005) * A.V * A.V;
  const atrito = A.chao ? (ent.freio ? 5 : 0.35) * Math.sign(A.V) : 0;
  A.V = Math.max(0, A.V + (empuxo - arrasto - 9.8 * A.dir.y - atrito) * dt);
  const grip = A.chao ? 12 : 3.2 * smooth(vs * 0.45, vs, A.V);
  A.dir.lerp(fwd, Math.min(1, grip * dt)).normalize();
  const sust = Math.min(1, (A.V / vs) ** 2);
  if (!A.chao) A.queda += (9.8 * (1 - sust) - A.queda * 2.2 * sust) * dt; else A.queda = 0;
  A.queda = clamp(A.queda, 0, 45);

  const velAnt = tmpV.copy(A.dir).multiplyScalar(A.V); velAnt.y -= A.queda;
  A.pos.addScaledVector(velAnt, dt);
  A.vs = velAnt.y;
  // G sentido pelo piloto
  if (!fisica.vAnt) fisica.vAnt = V3().copy(velAnt);
  const acc = tmpV2.copy(velAnt).sub(fisica.vAnt).divideScalar(Math.max(dt, 1e-3)); acc.y += 9.8; fisica.vAnt.copy(velAnt);
  A.G = lerp(A.G, acc.dot(up) / 9.8, 1 - Math.exp(-dt * 4));

  // chão
  const solo = M.chao(A.pos.x, A.pos.z), agua = solo < 0.3, base = Math.max(solo, agua ? 0 : solo);
  const altura = P.alturaTrem * A.trem + 0.65 * (1 - A.trem);
  if (A.pos.y - altura <= base) {
    const plano = M.normalY(A.pos.x, A.pos.z) > 0.965, ok = A.trem > 0.95 && !agua && plano && A.vs > -7.5 && Math.abs(bank) < 0.45 && arf > -0.2 && up.y > 0.8;
    if (!A.chao) { if (!ok) return bater(agua); pousou(A.vs); }
    else if (!ok && (A.trem < 0.95 || agua || A.V > 15 && !plano)) return bater(agua);
    A.chao = true; A.pos.y = base + altura;
    // no chão: só gira no eixo vertical; levanta o nariz se tiver velocidade
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    let pitch = Math.max(0, arf); if (A.V < vs * 0.85 || ent.p <= 0.05) pitch = Math.max(0, pitch - dt * 0.6);
    const viradaChao = (ent.r * 0.7 + ent.y) * 0.7 * clamp(A.V / 8, 0, 1) * (A.V < 25 ? 1 : 0.3);
    A.q.setFromEuler(new THREE.Euler(pitch, yaw - viradaChao * dt, 0, 'YXZ'));
    fwd.set(0, 0, -1).applyQuaternion(A.q);
    A.dir.set(fwd.x, Math.max(0, fwd.y), fwd.z).normalize();
    if (A.V > 3 && Math.random() < 0.3 && ent.freio) fumaca.emitir(tmpV.copy(A.pos).setY(base + 0.3), tmpV2.set(0, 0.5, 0), new THREE.Color(0xdddddd), 1, 4, 0.4, 1.2);
  } else if (A.chao && A.pos.y - altura > base + 0.4) A.chao = false;
}

let msgT = 0;
function mensagem(t, sub = '', dur = 2.6) { const m = $('msg'); m.innerHTML = t + (sub ? `<small>${sub}</small>` : ''); m.classList.add('on'); msgT = dur; }
function pousou(vs) {
  if (performance.now() - A.ultimoPouso < 3000) return; A.ultimoPouso = performance.now();
  const n = vs > -1.6 ? 3 : vs > -3.5 ? 2 : 1;
  mensagem(['', 'Pouso duro', 'Bom pouso!', 'Pouso perfeito!'][n], '⭐'.repeat(n) + ` · ${Math.abs(vs).toFixed(1)} m/s`);
  for (const r of P.rodas) { const p = r.getWorldPosition(V3()); for (let i = 0; i < 6; i++) fumaca.emitir(p, V3().set((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), new THREE.Color(0xeeeeee), 1, 5, 0.5, 1.4); }
  som.pneu();
}
function bater(agua) {
  A.vivo = false; A.morto = 0; A.V = 0; aviao.visible = false; A.acel = 0;
  const c = A.pos.clone(); if (agua) c.y = 0.5;
  for (let i = 0; i < 70; i++) {
    const v = V3().set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 22);
    if (agua) fumaca.emitir(c, v.setY(Math.abs(v.y) * 1.6), new THREE.Color(0xf4fbff), 3, 12, 0.85, 2.2, 0.8, -9);
    else { fogo.emitir(c, v, new THREE.Color().setHSL(0.06 + Math.random() * 0.06, 1, 0.55), 4, 14, 1, 1 + Math.random(), 1.5, 2); fumaca.emitir(c, v.multiplyScalar(0.4), new THREE.Color(0x2a2a2a), 6, 30, 0.7, 5, 0.8, 3); }
  }
  mensagem(agua ? 'Splash!' : 'Bateu!', 'Voltando em instantes…'); som.batida();
  if (desafio) desafio.batidas++;
}

// ---------- Desafios (argolas) ----------
let desafio = null;
const matArg = new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0xffa400, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.25 });
const matArgFraca = new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.35, depthWrite: false });
function comecarDesafio(d) {
  pararDesafio();
  const pts = d.pts.map((p) => { const [x, z] = p; const y = p[2] === 'abs' ? p[3] : Math.max(M.chao(x, z), 0) + p[2]; return V3().set(x, y, z); });
  const ini = V3().set(d.inicio.x, d.inicio.y, d.inicio.z);
  const aneis = pts.map((c, i) => {
    const prev = i ? pts[i - 1] : ini, next = pts[i + 1] || c.clone().add(c.clone().sub(prev)), n = next.clone().sub(prev).normalize();
    const R = d.id === 'canion' || d.id === 'mar' ? 15 : 19;
    const g = new THREE.Group(); g.position.copy(c); g.quaternion.setFromUnitVectors(EZ, n);
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, 1.1, 10, 48), matArgFraca); g.add(m);
    const brilho = new THREE.Mesh(new THREE.TorusGeometry(R, 2.6, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(brilho);
    cena.add(g); return { c, n, R, g, m, brilho, lado: null };
  });
  desafio = { d, aneis, i: 0, t: 0, batidas: 0 };
  nascer({ ...d.inicio });
  mensagem(d.nome, 'Passe por dentro das argolas douradas!', 3);
}
function pararDesafio() { if (!desafio) return; for (const a of desafio.aneis) cena.remove(a.g); desafio = null; $('missao').style.display = 'none'; }
function atualizarDesafio(dt, t) {
  if (!desafio) return; const D = desafio; if (A.vivo) D.t += dt;
  D.aneis.forEach((a, k) => {
    a.g.visible = k >= D.i && k < D.i + 4;
    a.m.material = k === D.i ? matArg : matArgFraca;
    a.brilho.material.opacity = k === D.i ? 0.25 + 0.15 * Math.sin(t * 6) : 0;
    if (k === D.i) a.g.scale.setScalar(1 + 0.04 * Math.sin(t * 5));
  });
  const a = D.aneis[D.i]; if (!a || !A.vivo) return;
  const lado = tmpV.copy(A.pos).sub(a.c).dot(a.n);
  if (a.lado !== null && a.lado < 0 && lado >= 0) {
    const lat = tmpV.copy(A.pos).sub(a.c).addScaledVector(a.n, -lado).length();
    if (lat < a.R + 1) { // passou!
      D.i++; som.argola(D.i); for (let k = 0; k < 40; k++) fogo.emitir(a.c.clone().add(V3().randomDirection().multiplyScalar(a.R)), V3().randomDirection().multiplyScalar(8), new THREE.Color(0xffd24a), 3, 0.5, 1, 0.8, 1);
      a.g.visible = false;
      if (D.i >= D.aneis.length) return terminarDesafio();
    }
  }
  a.lado = lado;
}
function terminarDesafio() {
  const D = desafio, comp = D.aneis.reduce((s, a, i) => s + (i ? a.c.distanceTo(D.aneis[i - 1].c) : 0), 0), par = comp / 62 + 4;
  const t = D.t, n = t <= par ? 3 : t <= par * 1.3 ? 2 : 1, rec = S.recordes[D.d.id];
  const novo = !rec || t < rec.t; if (novo) { S.recordes[D.d.id] = { t, n }; salvar(); }
  mensagem(`${D.d.nome} completo!`, `${'⭐'.repeat(n)}  ${fmtT(t)}${novo ? ' · novo recorde!' : ` · recorde ${fmtT(rec.t)}`}`, 5);
  som.vitoria(); pararDesafio();
}
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

// ---------- Câmera ----------
const CAMS = ['Atrás', 'Cabine', 'Cinema', 'Lado'];
const cam = { modo: 0, q: new THREE.Quaternion(), pos: V3(), iniciado: false, fixo: V3(), trocaT: 0, treme: 0 };
const cimaCam = V3(), alvoCam = V3(), mtx = new THREE.Matrix4();
function atualizarCamera(dt, t) {
  const p = A.pos; fwd.set(0, 0, -1).applyQuaternion(A.q); up.set(0, 1, 0).applyQuaternion(A.q);
  if (!cam.iniciado) { cam.q.copy(A.q); cam.pos.copy(p).addScaledVector(fwd, -16).addScaledVector(EY, 4); cam.iniciado = true; cam.fixo.set(0, 0, 0); }
  P.piloto.visible = cam.modo !== 1;
  const vel01 = clamp(A.V / 85, 0, 1);
  let fov = 60;
  if (cam.modo === 0 || cam.modo === 3) {
    cam.q.slerp(A.q, 1 - Math.exp(-dt * (cam.modo === 0 ? 4 : 2.5)));
    const cf = tmpV.set(0, 0, -1).applyQuaternion(cam.q), cu = cimaCam.set(0, 1, 0).applyQuaternion(cam.q).lerp(EY, 0.65).normalize();
    const dist = (cam.modo === 0 ? 15 : 13) + vel01 * 3;
    const off = cam.modo === 0 ? tmpV2.copy(cf).multiplyScalar(-dist).addScaledVector(cu, 3.6) : tmpV2.set(1, 0, 0).applyQuaternion(cam.q).multiplyScalar(dist).addScaledVector(cu, 2).addScaledVector(cf, -3);
    off.applyAxisAngle(EY, -ent.olhaX * Math.PI); off.applyAxisAngle(tmpV.set(1, 0, 0).applyQuaternion(cam.q), -ent.olhaY * 1.2);
    camera.position.copy(p).add(off);
    alvoCam.copy(p).addScaledVector(fwd, cam.modo === 0 ? 12 * (1 - Math.min(1, Math.abs(ent.olhaX) * 3)) : 0);
    camera.up.copy(cu); camera.lookAt(alvoCam);
    fov = 58 + vel01 * 12;
    camera.near = 0.5;
  } else if (cam.modo === 1) {
    camera.position.copy(P.piloto.localToWorld(tmpV.set(0, 0.48, -0.02)));
    camera.quaternion.copy(A.q); camera.rotateY(-ent.olhaX * Math.PI); camera.rotateX(-ent.olhaY * 1.2);
    camera.near = 0.08; fov = 70 + vel01 * 6;
  } else { // cinema: câmera parada que vê o avião passar
    const d = camera.position.distanceTo(p);
    if (cam.fixo.lengthSq() === 0 || d > 420 || t > cam.trocaT) {
      const lado = Math.random() < 0.5 ? -1 : 1, dt2 = A.V * 4 + 60;
      cam.fixo.copy(p).addScaledVector(A.dir, dt2).add(tmpV.set(1, 0, 0).applyQuaternion(A.q).setY(0).normalize().multiplyScalar(lado * (25 + Math.random() * 50)));
      cam.fixo.y = Math.max(cam.fixo.y + (Math.random() - 0.3) * 30, Math.max(M.chao(cam.fixo.x, cam.fixo.z), 0) + 4);
      cam.trocaT = t + 9;
    }
    camera.position.copy(cam.fixo); camera.up.copy(EY); camera.lookAt(p);
    fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(14 / Math.max(d, 1))), 8, 60); camera.near = 1;
  }
  // não entra no chão
  const ch = Math.max(M.chao(camera.position.x, camera.position.z), 0) + 1.5; if (camera.position.y < ch) camera.position.y = ch;
  // tremor: velocidade alta, G alto, batida
  cam.treme = Math.max(cam.treme - dt * 2, 0); const tr = cam.treme + Math.max(0, A.V - 75) * 0.003 + Math.max(0, A.G - 3) * 0.02;
  if (tr > 0 && cam.modo !== 2) camera.position.add(tmpV.set(Math.sin(t * 61), Math.sin(t * 53), Math.sin(t * 47)).multiplyScalar(tr * 0.15));
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, cam.modo === 2 ? 1 : 1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); escalaPontos = innerHeight * Q.pr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); }
}

// ---------- Animação do avião ----------
const corFumaca = new THREE.Color(), tmpC = new THREE.Color(), cauda = V3(), caudaAnt = V3();
function animarAviao(dt, t) {
  aviao.position.copy(A.pos); aviao.quaternion.copy(A.q); aviao.updateMatrixWorld();
  // hélice
  P.pas.rotation.z -= Math.min(A.rpm * 55 * dt, 1.1); P.disco.material.opacity = smooth(0.25, 0.7, A.rpm) * 0.85; P.disco.rotation.z += dt * 3;
  P.brasa.emissiveIntensity = 0.3 + A.acel * 2.5 + (Math.random() - 0.5) * 0.4;
  // superfícies
  const k = A.vivo ? 1 : 0;
  P.ailD.userData.set(-ent.r * 0.35 * k); P.ailE.userData.set(-ent.r * 0.35 * k);
  P.profD.userData.set(-ent.p * 0.4 * k); P.profE.userData.set(ent.p * 0.4 * k);
  P.leme.userData.set((ent.y + ent.r * 0.2) * 0.4 * k);
  P.flapD.userData.set(A.flap * 0.6); P.flapE.userData.set(-A.flap * 0.6);
  P.manche.rotation.set(-ent.p * 0.3, 0, -ent.r * 0.35);
  // trem
  A.trem += clamp(A.tremAlvo - A.trem, -dt / 2.2, dt / 2.2);
  for (const g of P.trem) { const a = (1 - A.trem) * Math.PI / 2; if (g.userData.eixo === 'x') g.rotation.x = -a; else g.rotation.z = -g.userData.sinal * a; g.visible = A.trem > 0.01; }
  if (A.chao) for (const r of P.rodas) r.rotation.x -= A.V / 0.3 * dt;
  // piloto olha para a curva
  P.piloto.children[1].rotation.y = -ent.r * 0.5; P.piloto.children[2].rotation.y = -ent.r * 0.5;
  P.cachecol.rotation.z = Math.sin(t * 9) * 0.25; P.cachecol.rotation.x = Math.sin(t * 13) * 0.15;
  // luzes
  const noite = M.noite, ciclo = t % 1.3, flash = ciclo < 0.05 || (ciclo > 0.14 && ciclo < 0.19);
  for (const s of [P.estD, P.estE]) s.scale.setScalar(flash ? s.userData.tam * (0.6 + noite) : 0.001);
  for (const s of [P.navD, P.navE, P.luzCauda]) s.scale.setScalar(s.userData.tam * (0.35 + noite * 1.2));
  P.beacon.scale.setScalar(P.beacon.userData.tam * Math.max(0, Math.sin(t * 6)) ** 4 * (0.5 + noite));
  P.farol.intensity = noite > 0.3 && A.trem > 0.5 ? 120 * noite : 0; P.lampFarol.visible = P.farol.intensity > 0;
  // painel (só quando dá pra ver)
  if (P.painel && (cam.modo === 1 || (t * 10 | 0) % 3 === 0)) {
    const r = tmpV2.set(1, 0, 0).applyQuaternion(A.q);
    desenhaPainel(P.painel, { vel: A.V * 3.6, alt: Math.max(0, A.pos.y), vs: A.vs, rol: Math.asin(clamp(-r.y, -1, 1)) * (up.y < 0 ? -1 : 1), arf: Math.asin(clamp(fwd.y, -1, 1)), rumo: rumo(), rpm: A.rpm, trem: A.trem, flap: A.flap, estol: A.estol });
  }
  if (!A.vivo) return;
  // fumaça de acrobacia, saindo da cauda e preenchendo o caminho
  cauda.copy(A.pos).addScaledVector(fwd, -4.9);
  if (A.fumaca && !A.chao) {
    const cf = CORES_FUMACA[S.fumacaCor][1]; if (cf) corFumaca.set(cf); else corFumaca.setHSL((t * 0.15) % 1, 0.85, 0.6);
    const n = Math.ceil(caudaAnt.distanceTo(cauda) / 1.6);
    for (let i = 0; i < Math.min(n, 8); i++) fumaca.emitir(tmpV.copy(caudaAnt).lerp(cauda, (i + 1) / n), tmpV2.copy(A.dir).multiplyScalar(-2).add(V3().randomDirection().multiplyScalar(0.6)), corFumaca, 2.2, 13, 0.85, 7, 0.6, 0.3);
  }
  caudaAnt.copy(cauda);
  // fumacinha do escapamento
  if (Math.random() < A.acel * 0.5) for (const s of [-1, 1]) fumaca.emitir(aviao.localToWorld(tmpV.set(s * 0.8, -0.2, -2.6)), tmpV2.copy(A.dir).multiplyScalar(-6).add(tmpV.set(s * 2, 0, 0).applyQuaternion(A.q)), tmpC.setRGB(0.55, 0.55, 0.55), 0.3, 2, 0.25, 0.6, 2);
  // vórtices nas pontas quando puxa forte
  const forca = smooth(2.2, 4, A.G) + smooth(0.2, 1, A.flap) * smooth(20, 40, A.V) * 0.3;
  rastroD.passo(aviao.localToWorld(tmpV.copy(P.pontaD)), up, forca); rastroE.passo(aviao.localToWorld(tmpV.copy(P.pontaE)), up, forca);
}
const rumo = () => { const f = tmpV.set(0, 0, -1).applyQuaternion(A.q); return (THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z)) + 360) % 360; };

// ---------- Som ----------
const som = (() => {
  let ctx = null, mot, mot2, filtro, gMot, vento, gVento, lfo, gLfo, mestre;
  const iniciar = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    mestre = ctx.createGain(); mestre.gain.value = S.som ? 0.55 : 0; mestre.connect(ctx.destination);
    mot = ctx.createOscillator(); mot.type = 'sawtooth'; mot2 = ctx.createOscillator(); mot2.type = 'square';
    filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 500; gMot = ctx.createGain(); gMot.gain.value = 0;
    lfo = ctx.createOscillator(); lfo.frequency.value = 20; gLfo = ctx.createGain(); gLfo.gain.value = 0.04; lfo.connect(gLfo); gLfo.connect(gMot.gain);
    const g2 = ctx.createGain(); g2.gain.value = 0.35; mot.connect(filtro); mot2.connect(g2); g2.connect(filtro); filtro.connect(gMot); gMot.connect(mestre);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = b * 4; }
    vento = ctx.createBufferSource(); vento.buffer = buf; vento.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.4;
    gVento = ctx.createGain(); gVento.gain.value = 0; vento.connect(bp); bp.connect(gVento); gVento.connect(mestre);
    mot.start(); mot2.start(); lfo.start(); vento.start();
  };
  const bip = (f, t0, dur, tipo = 'sine', vol = 0.25) => { if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = tipo; o.frequency.value = f; g.gain.setValueAtTime(0, ctx.currentTime + t0); g.gain.linearRampToValueAtTime(vol, ctx.currentTime + t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur); o.connect(g); g.connect(mestre); o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.05); };
  const ruido = (dur, freq, vol) => { if (!ctx) return; const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2; n.buffer = buf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; const g = ctx.createGain(); g.gain.value = vol; n.connect(f); f.connect(g); g.connect(mestre); n.start(); };
  return {
    iniciar,
    mudo(m) { if (mestre) mestre.gain.value = m ? 0 : 0.55; },
    atualizar(dentro) {
      if (!ctx) return; const t = ctx.currentTime, r = A.rpm;
      mot.frequency.setTargetAtTime(32 + r * 62, t, 0.1); mot2.frequency.setTargetAtTime(16 + r * 31, t, 0.1); lfo.frequency.setTargetAtTime(9 + r * 30, t, 0.1);
      filtro.frequency.setTargetAtTime(dentro ? 300 + r * 500 : 400 + r * 1100, t, 0.1); gMot.gain.setTargetAtTime(A.vivo ? 0.07 + r * 0.12 : 0, t, 0.15);
      gVento.gain.setTargetAtTime(A.vivo ? Math.min(0.5, (A.V / 85) ** 2 * 0.35) * (dentro ? 0.5 : 1) : 0, t, 0.2);
    },
    argola(i) { [0, 4, 7].forEach((s, k) => bip(523 * 2 ** ((s + i % 5) / 12), k * 0.07, 0.35, 'triangle', 0.2)); },
    vitoria() { [0, 4, 7, 12, 16].forEach((s, k) => bip(392 * 2 ** (s / 12), k * 0.12, 0.6, 'triangle', 0.22)); },
    batida() { ruido(1.6, 500, 1.2); }, pneu() { ruido(0.35, 2500, 0.35); },
    clique() { bip(900, 0, 0.05, 'square', 0.06); }, descobre() { [0, 7, 12].forEach((s, k) => bip(659 * 2 ** (s / 12), k * 0.15, 0.8, 'sine', 0.18)); },
  };
})();

// ---------- Entrada: teclado ----------
const teclas = new Set();
addEventListener('keydown', (e) => {
  som.iniciar(); if (e.repeat) return; teclas.add(e.code);
  if (estado === 'titulo' && (e.code === 'Enter' || e.code === 'Space')) return comecar();
  if (e.code === 'Escape' || e.code === 'KeyP') return estado === 'menu' ? fecharMenu() : estado === 'voo' && abrirMenu();
  if (estado !== 'voo') return;
  const acoes = { KeyG: trem, KeyF: flap, Space: fumacaToggle, KeyC: proxCam, KeyH: modoFoto, KeyT: proxHora, KeyR: () => !A.vivo || renascer() };
  if (acoes[e.code]) { e.preventDefault(); acoes[e.code](); }
});
addEventListener('keyup', (e) => teclas.delete(e.code));
addEventListener('blur', () => teclas.clear());
const tem = (...c) => c.some((k) => teclas.has(k));
function lerTeclado(dt) {
  const inv = S.inverter ? -1 : 1;
  const p = ((tem('KeyW', 'ArrowUp') ? 1 : 0) - (tem('KeyS', 'ArrowDown') ? 1 : 0)) * inv, r = (tem('KeyD', 'ArrowRight') ? 1 : 0) - (tem('KeyA', 'ArrowLeft') ? 1 : 0), y = (tem('KeyE') ? 1 : 0) - (tem('KeyQ') ? 1 : 0);
  if (tem('ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd')) A.acel = Math.min(1, A.acel + dt * 0.6);
  if (tem('ControlLeft', 'ControlRight', 'Minus', 'NumpadSubtract', 'KeyZ')) A.acel = Math.max(0, A.acel - dt * 0.6);
  return { p, r, y, freio: tem('KeyB') };
}

// ---------- Entrada: toque ----------
const toque = { stick: null, sx: 0, sy: 0, p: 0, r: 0, leme: 0, olha: null, ox: 0, oy: 0, freio: false };
const zona = $('zonaStick'), base = $('stickBase'), pino = $('stickPin');
const baseInicial = () => { base.style.left = ''; base.style.top = ''; pino.style.transform = ''; };
zona.addEventListener('pointerdown', (e) => {
  som.iniciar(); if (toque.stick !== null) return; toque.stick = e.pointerId; zona.setPointerCapture(e.pointerId);
  const r = zona.getBoundingClientRect(); toque.sx = e.clientX; toque.sy = e.clientY; base.style.left = e.clientX - r.left + 'px'; base.style.top = e.clientY - r.top + 'px';
});
zona.addEventListener('pointermove', (e) => {
  if (e.pointerId !== toque.stick) return; const R = 62;
  let dx = (e.clientX - toque.sx) / R, dy = (e.clientY - toque.sy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  pino.style.transform = `translate(${dx * R}px,${dy * R}px)`;
  const curva = (v) => { const a = Math.abs(v) < 0.08 ? 0 : (Math.abs(v) - 0.08) / 0.92; return Math.sign(v) * (0.35 * a + 0.65 * a * a); };
  toque.r = curva(dx); toque.p = -curva(dy) * (S.inverter ? -1 : 1);
});
const soltaStick = (e) => { if (e.pointerId !== toque.stick) return; toque.stick = null; toque.p = toque.r = 0; baseInicial(); };
zona.addEventListener('pointerup', soltaStick); zona.addEventListener('pointercancel', soltaStick);
// acelerador
const acelEl = $('acel');
const poeAcel = (e) => { const r = acelEl.getBoundingClientRect(); A.acel = clamp(1 - (e.clientY - r.top - 10) / (r.height - 20), 0, 1); };
acelEl.addEventListener('pointerdown', (e) => { som.iniciar(); acelEl.setPointerCapture(e.pointerId); poeAcel(e); });
acelEl.addEventListener('pointermove', (e) => { if (acelEl.hasPointerCapture(e.pointerId)) poeAcel(e); });
// arrastar no resto da tela gira a câmera
canvas.addEventListener('pointerdown', (e) => { som.iniciar(); if (estado !== 'voo' || toque.olha !== null) return; toque.olha = e.pointerId; toque.ox = e.clientX; toque.oy = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== toque.olha) return; ent.olhaX = clamp(ent.olhaX + (e.clientX - toque.ox) / innerWidth * 1.4, -1, 1); ent.olhaY = clamp(ent.olhaY + (e.clientY - toque.oy) / innerHeight, -0.6, 0.6); toque.ox = e.clientX; toque.oy = e.clientY; });
const soltaOlha = (e) => { if (e.pointerId === toque.olha) toque.olha = null; };
canvas.addEventListener('pointerup', soltaOlha); canvas.addEventListener('pointercancel', soltaOlha);
// botões
const botao = (id, f) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); som.iniciar(); som.clique(); f(); });
botao('tTrem', trem); botao('tFlap', flap); botao('tFuma', fumacaToggle); botao('tCam', proxCam); botao('tHora', proxHora);
$('tFreio').addEventListener('pointerdown', (e) => { e.preventDefault(); toque.freio = true; $('tFreio').classList.add('on'); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('tFreio').addEventListener(ev, () => { toque.freio = false; $('tFreio').classList.remove('on'); });
document.querySelectorAll('[data-leme]').forEach((b) => {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); toque.leme = +b.dataset.leme; b.classList.add('on'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { toque.leme = 0; b.classList.remove('on'); });
});
$('bMenu').addEventListener('click', () => abrirMenu());
$('bFoto').addEventListener('click', modoFoto);

function trem() { if (A.chao && A.tremAlvo === 1) return mensagem('No chão não dá!', '', 1.2); A.tremAlvo = A.tremAlvo ? 0 : 1; mensagem(A.tremAlvo ? 'Trem baixado' : 'Trem recolhido', '', 1.2); }
function flap() { A.flap = A.flap === 0 ? 0.5 : A.flap === 0.5 ? 1 : 0; mensagem(`Flap ${Math.round(A.flap * 30)}°`, '', 1.2); }
function fumacaToggle() { A.fumaca = !A.fumaca; caudaAnt.copy(A.pos).addScaledVector(fwd.set(0, 0, -1).applyQuaternion(A.q), -4.9); }
function proxCam() { cam.modo = (cam.modo + 1) % CAMS.length; cam.fixo.set(0, 0, 0); ent.olhaX = ent.olhaY = 0; mensagem('Câmera: ' + CAMS[cam.modo], '', 1.2); }
function modoFoto() { document.body.classList.toggle('foto'); }
function renascer() {
  if (desafio && desafio.i > 0) { const a = desafio.aneis[desafio.i - 1], n = desafio.aneis[desafio.i] || a; const d = n.c.clone().sub(a.c); nascer({ x: a.c.x, z: a.c.z, y: a.c.y, rumo: THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z)) }); a.lado = null; desafio.aneis.forEach((x) => (x.lado = null)); }
  else if (desafio) { nascer({ ...desafio.d.inicio }); desafio.aneis.forEach((x) => (x.lado = null)); }
  else nascer(ondeNasce);
}

// ---------- Hora do dia ----------
let hora = { de: S.hora, para: S.hora, t: 1 };
function proxHora() { mudarHora((hora.para + 1) % HORAS.length); }
function mudarHora(i) { hora = { de: hora.para, para: i, t: 0 }; S.hora = i; salvar(); mensagem(HORAS[i].nome, '', 1.5); }
let envT = 0;
function atualizarHora(dt) {
  if (hora.t >= 1) return; hora.t = Math.min(1, hora.t + dt / 3); envT -= dt;
  if (envT <= 0 || hora.t >= 1) { M.aplicarHora(hora.de, hora.para, hora.t); envT = 0.25; }
}

// ---------- Lugares para descobrir ----------
function verLugares() {
  for (const l of LUGARES) {
    if (S.desc[l.id] || Math.hypot(A.pos.x - l.x, A.pos.z - l.z) > l.r) continue;
    S.desc[l.id] = 1; salvar(); som.descobre();
    const c = $('cartao'); c.innerHTML = `<div class="rot">📍 lugar descoberto · ${Object.keys(S.desc).length}/${LUGARES.length}</div><b>${l.nome}</b><small>${l.desc}</small>`;
    c.classList.add('on'); clearTimeout(verLugares.t); verLugares.t = setTimeout(() => c.classList.remove('on'), 4500);
  }
}

// ---------- HUD ----------
const bus = $('bussola').querySelector('canvas').getContext('2d'), mapaEl = $('mapa'), mapaG = mapaEl.getContext('2d');
const ALC = 4800, fundoMapa = document.createElement('canvas'); fundoMapa.width = fundoMapa.height = 200; M.miniMapa(fundoMapa, ALC);
const alvoEl = $('alvo');
let hudT = 0;
function hud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.08;
  $('vVel').textContent = Math.round(A.V * 3.6); $('vAlt').textContent = Math.round(Math.max(0, A.pos.y)); $('vMot').textContent = Math.round(A.acel * 100);
  $('vs').textContent = `${A.vs >= 0 ? '▲' : '▼'} ${Math.abs(A.vs).toFixed(1)} m/s · ${A.G.toFixed(1)} G`;
  $('acelFill').style.height = A.acel * 100 + '%'; $('acelPct').textContent = Math.round(A.acel * 100) + '%';
  $('tTrem').classList.toggle('on', A.tremAlvo === 1); $('tFlap').classList.toggle('on', A.flap > 0); $('tFuma').classList.toggle('on', A.fumaca);
  $('descobertos').textContent = `📍 ${Object.keys(S.desc).length}/${LUGARES.length}`;
  const aviso = $('aviso'), solo = A.pos.y - Math.max(0, M.chao(A.pos.x, A.pos.z));
  const av = !A.vivo ? '' : A.estol ? 'ESTOL — acelere e abaixe o nariz' : (!A.chao && solo < 60 && A.vs < -8) ? 'CHÃO! Puxe!' : (!A.chao && A.tremAlvo === 0 && solo < 25 && A.V < 45) ? 'Baixe o trem (G)' : Math.max(Math.abs(A.pos.x), Math.abs(A.pos.z)) > MUNDO * 0.6 ? 'Volte para as ilhas' : '';
  aviso.style.display = av ? 'block' : 'none'; aviso.textContent = av;
  // bússola
  const W = 380, H = 40, rm = rumo(); bus.clearRect(0, 0, W, H); bus.fillStyle = '#fff'; bus.textAlign = 'center'; bus.font = 'bold 14px sans-serif';
  for (let d = Math.floor((rm - 60) / 5) * 5; d <= rm + 60; d += 5) { const x = W / 2 + (d - rm) * 3.2, n = ((d % 360) + 360) % 360;
    bus.fillRect(x - 0.5, 0, 1, n % 15 ? 5 : 10); if (n % 45 === 0) { bus.fillStyle = n % 90 ? '#ddd' : '#ffcc4d'; bus.fillText({ 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' }[n], x, 30); bus.fillStyle = '#fff'; } }
  bus.fillStyle = '#ffcc4d'; bus.beginPath(); bus.moveTo(W / 2 - 6, H); bus.lineTo(W / 2 + 6, H); bus.lineTo(W / 2, H - 8); bus.fill();
  const alvo = desafio && desafio.aneis[desafio.i];
  if (alvo) { let d = THREE.MathUtils.radToDeg(Math.atan2(alvo.c.x - A.pos.x, -(alvo.c.z - A.pos.z))) - rm; d = ((d + 540) % 360) - 180; const x = W / 2 + clamp(d, -58, 58) * 3.2; bus.fillStyle = '#ffcc4d'; bus.beginPath(); bus.arc(x, 8, 5, 0, 7); bus.fill(); }
  // missão
  const mi = $('missao');
  if (desafio) { mi.style.display = 'block'; mi.innerHTML = `${desafio.d.nome} · argola <b>${desafio.i + 1}/${desafio.aneis.length}</b> · <b>${fmtT(desafio.t)}</b>`; } else mi.style.display = 'none';
  // marcador da próxima argola na tela
  if (alvo) {
    tmpV.copy(alvo.c).project(camera); const atras = tmpV.z > 1; let x = tmpV.x, y = tmpV.y; if (atras) { x = -x; y = -y; }
    const fora = atras || Math.abs(x) > 0.92 || Math.abs(y) > 0.88;
    if (fora) { const k = 0.9 / Math.max(Math.abs(x), Math.abs(y) / 0.95, 1e-3); x *= k; y *= k; }
    alvoEl.style.display = 'block'; alvoEl.classList.toggle('fora', fora);
    alvoEl.style.transform = `translate(${(x * 0.5 + 0.5) * innerWidth}px,${(-y * 0.5 + 0.5) * innerHeight}px)` + (fora ? ` rotate(${Math.atan2(x, y)}rad)` : '');
    alvoEl.querySelector('span').textContent = fora ? '' : Math.round(alvo.c.distanceTo(A.pos)) + ' m';
  } else alvoEl.style.display = 'none';
  // minimapa (gira com o avião)
  const S2 = 200, esc = S2 / (2 * ALC) * 1.6; mapaG.save(); mapaG.clearRect(0, 0, S2, S2); mapaG.beginPath(); mapaG.arc(100, 100, 100, 0, 7); mapaG.clip();
  mapaG.fillStyle = '#0d3150'; mapaG.fillRect(0, 0, S2, S2);
  mapaG.translate(100, 100); mapaG.rotate(-THREE.MathUtils.degToRad(rm)); mapaG.scale(1.6, 1.6);
  mapaG.drawImage(fundoMapa, -100 - A.pos.x / ALC * 100, -100 - A.pos.z / ALC * 100);
  const pt = (x, z) => [(x - A.pos.x) / ALC * 100, (z - A.pos.z) / ALC * 100];
  for (const l of LUGARES) { const [x, z] = pt(l.x, l.z); mapaG.fillStyle = S.desc[l.id] ? '#fff' : 'rgba(255,255,255,.45)'; mapaG.beginPath(); mapaG.arc(x, z, 2.2, 0, 7); mapaG.fill(); }
  if (desafio) desafio.aneis.forEach((a, k) => { if (k < desafio.i) return; const [x, z] = pt(a.c.x, a.c.z); mapaG.fillStyle = k === desafio.i ? '#ffcc4d' : 'rgba(255,204,77,.5)'; mapaG.fillRect(x - 1.6, z - 1.6, 3.2, 3.2); });
  mapaG.restore();
  mapaG.fillStyle = '#ffcc4d'; mapaG.strokeStyle = '#000'; mapaG.lineWidth = 1.5; mapaG.beginPath(); mapaG.moveTo(100, 90); mapaG.lineTo(107, 108); mapaG.lineTo(100, 104); mapaG.lineTo(93, 108); mapaG.closePath(); mapaG.fill(); mapaG.stroke();
}

// ---------- Menu ----------
let estado = 'titulo';
const painel = $('painelMenu');
function abrirMenu() {
  if (estado !== 'voo') return; estado = 'menu'; document.body.classList.add('menu');
  const desafios = DESAFIOS.map((d) => { const r = S.recordes[d.id]; return `<button class="card" data-desafio="${d.id}"><b>${d.nome}</b><small>${d.desc}${r ? `<br>${'⭐'.repeat(r.n)} ${fmtT(r.t)}` : ''}</small></button>`; }).join('');
  const lugares = LUGARES.map((l) => `<button class="card" data-lugar="${l.id}"><b>${S.desc[l.id] ? '📍 ' : ''}${l.nome}</b><small>${l.desc}</small></button>`).join('');
  const pint = PINTURAS.map((p, i) => `<button class="card${i === S.pintura ? ' sel' : ''}" data-pintura="${i}"><span class="bolinha" style="background:${p.base}"></span><span class="bolinha" style="background:${p.acc}"></span>${p.nome}</button>`).join('');
  const fum = CORES_FUMACA.map(([n, c], i) => `<button class="card${i === S.fumacaCor ? ' sel' : ''}" data-fumaca="${i}"><span class="bolinha" style="background:${c || 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)'}"></span>${n}</button>`).join('');
  const horas = HORAS.map((h, i) => `<button class="card${i === hora.para ? ' sel' : ''}" data-hora="${i}">${['🌅', '☀️', '🌇', '🌙'][i]} ${h.nome}</button>`).join('');
  const op = (id, txt, on) => `<button class="card${on ? ' sel' : ''}" data-op="${id}">${on ? '✔ ' : ''}${txt}</button>`;
  painel.innerHTML = `<button id="fechar">Continuar ✈</button><h2>Pausa</h2>
    <h3>Desafios de argolas</h3><div class="grade">${desafios}${desafio ? '<button class="card" data-parar="1"><b>Sair do desafio</b><small>Voltar ao voo livre</small></button>' : ''}</div>
    <h3>Ir para um lugar</h3><div class="grade">${lugares}</div>
    <h3>Pintura do avião</h3><div class="linha">${pint}</div>
    <h3>Cor da fumaça</h3><div class="linha">${fum}</div>
    <h3>Hora do dia</h3><div class="linha">${horas}</div>
    <h3>Opções</h3><div class="linha">${op('assist', 'Ajuda de voo (nivela sozinho)', S.assist)}${op('inverter', 'Inverter subir/descer', S.inverter)}${op('som', 'Som', S.som)}
      <button class="card" data-op="qual">Gráficos: ${{ alta: 'Bonito', media: 'Médio', baixa: 'Rápido' }[S.qual]}</button></div>
    <h3>Comandos</h3><small style="opacity:.8;line-height:1.6;display:block">${TOQUE ? 'Bolinha à esquerda: manche (para cima sobe, para os lados inclina). Barra à direita: motor. Arraste a tela para olhar em volta.' : 'W/S ou ↑/↓: subir/descer · A/D ou ←/→: inclinar · Q/E: leme · Shift/Ctrl: motor · G: trem · F: flap · Espaço: fumaça · B: freio · C: câmera · T: hora · H: modo foto · Esc: menu'}<br>Para decolar: motor no máximo, espere passar de 110 km/h e puxe. Para pousar: devagar (130–160 km/h), trem e flap baixados, desça suave na pista.</small>`;
  $('fechar').onclick = fecharMenu;
}
painel.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; som.clique(); const d = b.dataset;
  if (d.desafio) { comecarDesafio(DESAFIOS.find((x) => x.id === d.desafio)); return fecharMenu(); }
  if (d.parar) { pararDesafio(); return fecharMenu(); }
  if (d.lugar) { pararDesafio(); nascerLugar(LUGARES.find((x) => x.id === d.lugar)); return fecharMenu(); }
  if (d.pintura) trocarPintura(+d.pintura);
  if (d.fumaca) { S.fumacaCor = +d.fumaca; A.fumaca = true; }
  if (d.hora) mudarHora(+d.hora);
  if (d.op === 'qual') { S.qual = { alta: 'baixa', media: 'alta', baixa: 'media' }[S.qual]; salvar(); location.reload(); return; }
  if (d.op) { S[d.op] = !S[d.op]; if (d.op === 'som') som.mudo(!S.som); }
  salvar(); const sc = painel.scrollTop; estado = 'voo'; abrirMenu(); painel.scrollTop = sc;
});
function fecharMenu() { estado = 'voo'; document.body.classList.remove('menu'); }

// ---------- Título ----------
$('dicas').textContent = TOQUE ? 'Bolinha da esquerda pilota · barra da direita acelera · arraste a tela para olhar' : 'W/S sobe e desce · A/D inclina · Shift acelera · C troca a câmera · Esc menu';
function comecar() {
  som.iniciar(); estado = 'voo'; document.body.classList.remove('titulo');
  nascerLugar(LUGARES[0]); cam.modo = 0; cam.iniciado = false;
  try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) {}
  if (!S.visto) { S.visto = 1; salvar(); setTimeout(() => mensagem('Bem-vindo ao Céu Aberto!', TOQUE ? 'Suba a barra do MOTOR e puxe a bolinha para cima depois de 110 km/h' : 'Segure Shift para acelerar e W para subir depois de 110 km/h', 6), 600); }
}
$('bVoar').addEventListener('click', comecar);
function voarSozinho(t) { // avião de enfeite na tela inicial: dá voltas sobre a ilha
  const a = t * 0.06, R = 700, cx = 200, cz = 300;
  A.pos.set(cx + Math.cos(a) * R, 230 + Math.sin(t * 0.3) * 20, cz + Math.sin(a) * R);
  const tg = tmpV.set(-Math.sin(a), 0, Math.cos(a));
  A.q.setFromEuler(new THREE.Euler(0.04, Math.atan2(-tg.x, -tg.z), -0.32, 'YXZ'));
  A.V = 60; A.acel = 0.75; A.rpm = 0.8; A.trem = A.tremAlvo = 0; A.vivo = true; A.chao = false; A.dir.set(0, 0, -1).applyQuaternion(A.q); aviao.visible = true;
  const ang = t * 0.1; camera.position.copy(A.pos).add(tmpV.set(Math.cos(ang) * 22, 5 + Math.sin(t * 0.2) * 4, Math.sin(ang) * 22));
  camera.up.copy(EY); camera.lookAt(A.pos); if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
}

// ---------- Laço principal ----------
M.aplicarHora(S.hora, S.hora, 1);
redimensionar();
nascerLugar(LUGARES[0]);
$('carregando').style.opacity = 0; setTimeout(() => $('carregando').remove(), 700);
let ult = performance.now(), tempo = 0, lugT = 0;
function quadro(agora) {
  requestAnimationFrame(quadro);
  const dt = Math.min((agora - ult) / 1000, 0.05); ult = agora;
  if (estado === 'menu') { renderer.render(cena, camera); return; }
  tempo += dt;
  if (estado === 'titulo') voarSozinho(tempo);
  else {
    const k = lerTeclado(dt);
    const alvoP = clamp(k.p + toque.p, -1, 1), alvoR = clamp(k.r + toque.r, -1, 1), alvoY = clamp(k.y + toque.leme, -1, 1);
    const suave = 1 - Math.exp(-dt * (TOQUE ? 14 : 6));
    ent.p = lerp(ent.p, alvoP, suave); ent.r = lerp(ent.r, alvoR, suave); ent.y = lerp(ent.y, alvoY, suave); ent.freio = k.freio || toque.freio;
    if (toque.olha === null) { ent.olhaX *= 1 - Math.min(1, dt * 1.5); ent.olhaY *= 1 - Math.min(1, dt * 1.5); }
    if (A.vivo) { fisica(dt / 2); if (A.vivo) fisica(dt / 2); }
    else if ((A.morto += dt) > 2.8) renascer();
    if (!A.vivo) cam.treme = Math.max(cam.treme, 2 - A.morto);
    atualizarDesafio(dt, tempo);
    if ((lugT -= dt) < 0) { lugT = 0.5; verLugares(); }
  }
  atualizarHora(dt);
  animarAviao(dt, tempo);
  if (estado === 'voo') atualizarCamera(dt, tempo);
  for (const f of M.animar) f(tempo);
  M.uAgua.value = tempo;
  fumaca.atualizar(dt); fogo.atualizar(dt);
  M.ceu.position.copy(camera.position);
  M.sol.position.copy(A.pos).addScaledVector(M.solDir, 200); M.sol.target.position.copy(A.pos);
  if ((msgT -= dt) < 0) $('msg').classList.remove('on');
  hud(dt); som.atualizar(cam.modo === 1);
  renderer.render(cena, camera);
}
requestAnimationFrame(quadro);
document.addEventListener('visibilitychange', () => { if (document.hidden && estado === 'voo') abrirMenu(); ult = performance.now(); });
const simular = (seg, e) => { Object.assign(ent, e); const log = []; for (let i = 0; i < seg * 120; i++) { if (!A.vivo) break; fisica(1 / 120); if (i % 120 === 0) log.push([Math.round(A.V * 3.6), Math.round(A.pos.y), A.chao ? 'chão' : 'ar', Math.round(rumo())].join(' ')); } return log.join(' | ') + (A.vivo ? '' : ' | BATEU'); };
window.__jogo = { horaJa: (i) => { hora = { de: i, para: i, t: 1 }; M.aplicarHora(i, i, 1); }, simular, A, cam, camera, comecar, mudarHora, comecarDesafio, nascerLugar, DESAFIOS, LUGARES, ent, proxCam }; // para testes
