// Céu Aberto — vários aviões, piloto a pé, cargueiro NPC, desafios, controles, HUD e som.
import * as THREE from '../lib/three.module.min.js';
import { criarCenario, HORAS } from './cenario.js';
import { desenhaPainel } from './aviao3d.js';
import { TIPOS, BAIA, criarCargueiro, PINT_CARGA } from './aeronaves.js';
import { criarPessoa, animarPessoa } from './pessoa.js';
import { LUGARES, DESAFIOS, PISTA, PISTA2, PORTA, VULCAO, MUNDO, clamp, lerp, smooth } from './mundo.js';

const $ = (id) => document.getElementById(id);
const TOQUE = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (TOQUE) document.body.classList.add('touch');

// ---------- Salvamento ----------
const SAVE = 'ceu-aberto-v1';
let S = { filtro: 0, desc: {}, recordes: {}, pintura: 0, tipo: 'andorinha', hora: 1, inverter: false, assist: true, som: true, qual: TOQUE ? 'media' : 'alta', fumacaCor: 0, feitos: {} };
try { Object.assign(S, JSON.parse(localStorage.getItem(SAVE) || '{}')); } catch (e) {}
if (!S.invPadrao) { S.inverter = true; S.invPadrao = 1; } // novo padrão: controles invertidos (puxar pra trás sobe)
S.filtro ??= 0;
if (!TIPOS[S.tipo]) S.tipo = 'andorinha';
const salvar = () => { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {} };
// filtros de imagem (CSS no canvas + vinheta): leves, não pesam no celular
const FILTROS = [
  { nome: 'Normal', css: '' },
  { nome: 'Vibrante', css: 'saturate(1.45) contrast(1.08)' },
  { nome: 'Cinema', css: 'contrast(1.15) saturate(0.85) sepia(0.12)', vinheta: 0.55, faixas: true },
  { nome: 'Pôr do sol', css: 'sepia(0.35) saturate(1.35) hue-rotate(-12deg) brightness(1.04)', vinheta: 0.35 },
  { nome: 'Antigo', css: 'sepia(0.75) contrast(1.1) brightness(0.95)', vinheta: 0.7 },
  { nome: 'Preto e branco', css: 'grayscale(1) contrast(1.2)', vinheta: 0.5 },
  { nome: 'Frio', css: 'saturate(0.9) hue-rotate(12deg) brightness(1.03) contrast(1.05)' },
  { nome: 'Sonho', css: 'saturate(1.25) brightness(1.08) contrast(0.9) blur(0.4px)', vinheta: 0.3 },
];
function aplicarFiltro() {
  const f = FILTROS[S.filtro] || FILTROS[0]; document.getElementById('c').style.filter = f.css;
  let v = document.getElementById('vinheta'); if (!v) { v = document.createElement('div'); v.id = 'vinheta'; document.body.insertBefore(v, document.getElementById('hud')); }
  v.style.cssText = `position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,${f.vinheta || 0}));` + (f.faixas ? 'box-shadow:inset 0 9vh 0 #000,inset 0 -9vh 0 #000;' : '');
}
aplicarFiltro();
const Q = { alta: S.qual === 'alta', sombra: S.qual === 'baixa' ? 0 : S.qual === 'alta' && !TOQUE ? 2048 : 1024, pr: Math.min(devicePixelRatio, S.qual === 'alta' ? (TOQUE ? 1.75 : 2) : S.qual === 'media' ? 1.4 : 1) }; // no celular, sombra 2048 + tela 3x estourava a memória

// ---------- Renderizador ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.qual !== 'baixa', powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pr); renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = !!Q.sombra; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 30000);
let escalaPontos = 1;
const atualizaEscala = () => { escalaPontos = (window.visualViewport ? visualViewport.height : innerHeight) * Q.pr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); };
const vv = window.visualViewport; // tamanho da área visível de verdade (no Safari pode ser menor que a janela)
const telaW = () => Math.round(vv ? vv.width : innerWidth), telaH = () => Math.round(vv ? vv.height : innerHeight);
function redimensionar() { window.__ajustaTela?.(); renderer.setSize(telaW(), telaH(), false); camera.aspect = telaW() / telaH(); camera.updateProjectionMatrix(); atualizaEscala(); }
addEventListener('resize', redimensionar); vv?.addEventListener('resize', redimensionar);

await new Promise((r) => setTimeout(r, 30));
const M = criarCenario(renderer, Q);
const cena = M.cena;

function recarregar(txt) { // recarrega mostrando um aviso (sem parecer travado)
  const d = document.createElement('div'); d.textContent = txt + ' — recarregando…'; d.style.cssText = 'position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;background:#0b1118;color:#fff;font:16px sans-serif';
  document.body.appendChild(d); renderer.setAnimationLoop?.(null); setTimeout(() => location.reload(), 150);
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (S.qual !== 'baixa') S.qual = S.qual === 'alta' ? 'media' : 'baixa'; salvar(); recarregar('O celular ficou sem memória de vídeo. Baixando os gráficos'); });

// ---------- Partículas ----------
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
const fumaca = sistema(Q.alta ? 1600 : 1000, false), fogo = sistema(600, true);
const CORES_FUMACA = [['Branca', '#ffffff'], ['Vermelha', '#ff4b3e'], ['Azul', '#3e8bff'], ['Verde', '#3ed27a'], ['Amarela', '#ffd23e'], ['Arco-íris', null]];
function rastro() {
  const N = 50, g = new THREE.BufferGeometry(), pos = new Float32Array(N * 6), c = new Float32Array(N * 8), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 4)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.frustumCulled = false; cena.add(m);
  const pts = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), a: 0 })), cima = new THREE.Vector3();
  return { passo(p, up, forca) {
    const o0 = pts.pop(); o0.p.copy(p); o0.a = forca; pts.unshift(o0); cima.copy(up).multiplyScalar(0.12);
    pts.forEach((o, i) => { const k = i * 6; pos[k] = o.p.x + cima.x; pos[k + 1] = o.p.y + cima.y; pos[k + 2] = o.p.z + cima.z; pos[k + 3] = o.p.x - cima.x; pos[k + 4] = o.p.y - cima.y; pos[k + 5] = o.p.z - cima.z;
      const a = o.a * (1 - i / N) * 0.55; for (let j = 0; j < 2; j++) c.set([1, 1, 1, a], (i * 2 + j) * 4); });
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true; } };
}
const rastroD = rastro(), rastroE = rastro();

// ---------- Aeronaves ----------
const V3 = () => new THREE.Vector3();
const EX = new THREE.Vector3(1, 0, 0), EY = new THREE.Vector3(0, 1, 0), EZ = new THREE.Vector3(0, 0, 1);
const tmpE = new THREE.Euler();
const fwd = V3(), up = V3(), dirD = V3(), tmpV = V3(), tmpV2 = V3(), tmpV3 = V3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpC = new THREE.Color();
const frota = [];
let semente = 1;
class Aero {
  constructor(tipo, pint = 0, esc = 1) {
    this.tipo = tipo; this.T = TIPOS[tipo]; this.pint = pint; this.esc = esc;
    this.obj = tipo === 'gigante' ? criarCargueiro(PINT_CARGA[0]) : this.T.criar(pint);
    if (tipo === 'gigante') this.T = { ...TIPOS.cargueiro, nome: 'Cargueiro gigante' };
    this.obj.scale.setScalar(esc); this.P = this.obj.userData.parts;
    this.k = 0.4 * this.T.empuxo / this.T.vmax ** 2;
    Object.assign(this, { pos: V3(), q: new THREE.Quaternion(), V: 0, dir: V3().set(0, 0, -1), queda: 0, acel: 0, rpm: 0, trem: 1, tremAlvo: 1, flap: 0, chao: true, vivo: true, G: 1, estol: false, vs: 0, fumaca: false, vAnt: V3(), comPiloto: false, npc: null, preso: null, entrouAtras: false, seed: semente++, ultimoPouso: 0, abre: 0 });
    this.ent = { p: 0, r: 0, y: 0, freio: false };
    cena.add(this.obj); frota.push(this);
  }
  velocidade(out) { return out.copy(this.dir).multiplyScalar(this.V).setY(this.dir.y * this.V - this.queda); }
  colocar(x, z, rumo, noAr, y) {
    this.q.setFromAxisAngle(EY, -THREE.MathUtils.degToRad(rumo));
    if (!noAr) { const at = this.P.atitude || 0; tmpQ.setFromAxisAngle(EX, at); this.q.multiply(tmpQ); this.pos.set(x, M.chao(x, z) + this.P.alturaTrem * this.esc, z); this.V = 0; this.acel = 0; this.trem = this.tremAlvo = 1; this.chao = true; }
    else { this.pos.set(x, Math.max(y || 250, Math.max(0, M.chao(x, z)) + 120), z); this.V = Math.max(58, this.T.VS * 1.5); this.acel = 0.75; this.trem = this.tremAlvo = 0; this.chao = false; }
    this.dir.set(0, 0, -1).applyQuaternion(tmpQ.setFromAxisAngle(EY, -THREE.MathUtils.degToRad(rumo)));
    this.flap = 0; this.queda = 0; this.vivo = true; this.obj.visible = true; this.rpm = this.acel; this.preso = null; this.entrouAtras = false; this.vAnt.set(0, 0, 0);
    this.sincronizar(); return this;
  }
  sincronizar() { this.obj.position.copy(this.pos); this.obj.quaternion.copy(this.q); this.obj.updateMatrixWorld(); }
  remover() { // tira da cena e libera a memória da placa de vídeo (senão o iPhone recarrega depois de muitas trocas)
    cena.remove(this.obj); const i = frota.indexOf(this); if (i >= 0) frota.splice(i, 1);
    this.obj.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } });
  }
}

// física de um avião (vale para o do jogador e para os sem piloto)
function fisica(a, dt, tempo) {
  const T = a.T, ent = a.ent, assist = a.comPiloto && S.assist;
  fwd.set(0, 0, -1).applyQuaternion(a.q); up.set(0, 1, 0).applyQuaternion(a.q); dirD.set(1, 0, 0).applyQuaternion(a.q);
  const ry = dirD.y, bank = Math.asin(clamp(-ry, -1, 1)), arf = Math.asin(clamp(fwd.y, -1, 1));
  const vs = T.VS - a.flap * T.VS * 0.18;
  const ctrl = clamp(a.V / (vs * 1.4), 0.12, 1.15);
  let pr = T.arf * ent.p * ctrl, rr = T.rol * ent.r * ctrl, yr = T.guinada * ent.y * ctrl;
  if (!a.chao) {
    // com a ajuda de voo, manche de lado = curva (inclinação até ~70°), nunca giro completo; sem ajuda, gira livre (tonneau)
    // ajuda de voo: a bolinha de lado escolhe a INCLINAÇÃO (até 70°), nunca o giro — vale em qualquer atitude (subindo, descendo, de cabeça pra baixo)
    if (assist && Math.abs(fwd.y) < 0.97) { const bankT = Math.atan2(-ry, up.y); rr = clamp((clamp(ent.r * 1.3, -1.22, 1.22) - bankT) * 2.6, -T.rol * 0.85, T.rol * 0.85) * Math.min(ctrl, 1); }
    if (assist && Math.abs(ent.p) < 0.1 && up.y > 0.5 && a.V > vs) pr -= arf * 0.5;
    if (!a.comPiloto) { // ninguém pilotando: vai torcendo e mergulhando devagar
      pr += -0.012 - arf * 0.15 + Math.sin(tempo * 0.31 + a.seed) * 0.02; rr += Math.sin(tempo * 0.23 + a.seed * 2) * 0.06 - bank * 0.15;
    }
    a.estol = a.V < vs;
    if (a.estol) { tmpV.crossVectors(fwd, tmpV2.set(0, -1, 0)); if (tmpV.lengthSq() > 1e-4) { tmpV.normalize(); tmpQ.setFromAxisAngle(tmpV, (1 - a.V / vs) * 1.4 * dt); a.q.premultiply(tmpQ); } }
  } else a.estol = false;
  tmpQ.setFromAxisAngle(EX, pr * dt); a.q.multiply(tmpQ);
  tmpQ.setFromAxisAngle(EZ, -rr * dt); a.q.multiply(tmpQ);
  tmpQ.setFromAxisAngle(EY, -yr * dt); a.q.multiply(tmpQ);
  if (!a.chao) {
    const w = 1.8 * 9.8 * Math.tan(clamp(bank, -1.25, 1.25)) / Math.max(a.V, 22) * clamp(up.y * 3, 0, 1) * smooth(0.3 * vs, vs, a.V);
    tmpQ.setFromAxisAngle(EY, -w * dt); a.q.premultiply(tmpQ);
  }
  a.q.normalize();
  fwd.set(0, 0, -1).applyQuaternion(a.q); up.set(0, 1, 0).applyQuaternion(a.q);
  // motor e velocidade
  const pos = T.motor === 'jato' && a.acel > 0.85 ? 1.5 : 1; // pós-combustor
  a.rpm = lerp(a.rpm, a.vivo ? 0.18 + a.acel * 0.82 : 0, 1 - Math.exp(-dt * (T.motor === 'jato' ? 1.2 : 2.5)));
  const empuxo = a.rpm * T.empuxo * pos * (1 - clamp(a.V / T.vmax, 0, 1.2) * 0.6);
  const arrasto = (a.k * (1 + a.flap * 0.6 + a.trem * 0.25)) * a.V * a.V;
  const atrito = a.chao ? (M.naPorta(a.pos.x, a.pos.z) && a.acel < 0.5 ? 13 : ent.freio ? 5 : 0.35) * Math.sign(a.V) : 0; // no porta-aviões o cabo de parada segura
  a.V = Math.max(0, a.V + (empuxo - arrasto - 9.8 * a.dir.y - atrito) * dt);
  const grip = a.chao ? 12 : 3.2 * smooth(vs * 0.45, vs, a.V);
  if (!a.chao) a.dir.lerp(fwd, Math.min(1, grip * dt)).normalize();
  const sust = Math.min(1, (a.V / vs) ** 2);
  if (!a.chao) a.queda += (9.8 * (1 - sust) - a.queda * 2.2 * sust) * dt; else a.queda = 0;
  a.queda = clamp(a.queda, 0, 55);
  const vel = a.velocidade(tmpV);
  a.pos.addScaledVector(vel, dt); a.vs = vel.y;
  const acc = tmpV2.copy(vel).sub(a.vAnt).divideScalar(Math.max(dt, 1e-3)); acc.y += 9.8; a.vAnt.copy(vel);
  a.G = lerp(a.G, clamp(acc.dot(up) / 9.8, -5, 12), 1 - Math.exp(-dt * 4));
  // chão
  const solo = M.chao(a.pos.x, a.pos.z), agua = solo < 0.3, base = agua ? 0 : solo;
  const altura = (a.P.alturaTrem * a.trem + 0.65 * (1 - a.trem)) * a.esc;
  if (a.pos.y - altura <= base + (a.chao && a.dir.y < 0.01 ? 0.05 : 0)) {
    const plano = M.normalY(a.pos.x, a.pos.z) > 0.965, ok = a.trem > 0.95 && !agua && plano && a.vs > -7.5 && Math.abs(bank) < 0.45 && arf > -0.2 && up.y > 0.8;
    if (!a.chao) { if (!ok) return bater(a, agua); pousou(a); }
    else if (!ok && (a.trem < 0.95 || agua || (a.V > 15 && !plano))) return bater(a, agua);
    a.chao = true; a.pos.y = base + altura;
    const at = a.P.atitude || 0, minimo = at * (1 - smooth(vs * 0.4, vs * 0.8, a.V)); // roda de cauda: nariz pra cima parado
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    let pitch = Math.max(minimo, Math.asin(clamp(fwd.y, -1, 1))); if (a.V < vs * 0.85 || ent.p <= 0.05) pitch = Math.max(minimo, pitch - dt * 0.6);
    const virar = (ent.r * 0.7 + ent.y) * 0.7 * clamp(a.V / 8, 0, 1) * (a.V < 25 ? 1 : 0.3) / Math.sqrt(a.esc * Math.max(1, a.P.envergadura / 10));
    a.q.setFromEuler(tmpE.set(pitch, yaw - virar * dt, 0, 'YXZ'));
    const sobe = ent.p > 0.05 && a.V > vs * 0.85 ? Math.max(0, pitch - minimo - 0.02) : 0; // só sobe se o piloto puxar
    a.dir.set(-Math.sin(yaw) * Math.cos(sobe), Math.sin(sobe), -Math.cos(yaw) * Math.cos(sobe));
    if (a.V > 3 && ent.freio && Math.random() < 0.3) fumaca.emitir(tmpV.copy(a.pos).setY(base + 0.3), tmpV2.set(0, 0.5, 0), tmpC.set(0xdddddd), 1, 4, 0.4, 1.2);
  } else if (a.chao && a.pos.y - altura > base + 0.4) a.chao = false;
}

let msgT = 0;
function mensagem(t, sub = '', dur = 2.6) { const m = $('msg'); m.innerHTML = t + (sub ? `<small>${sub}</small>` : ''); m.classList.add('on'); msgT = dur; }
function pousou(a) {
  if (!a.comPiloto || performance.now() - a.ultimoPouso < 3000) return; a.ultimoPouso = performance.now();
  const n = a.vs > -1.6 ? 3 : a.vs > -3.5 ? 2 : 1;
  mensagem(['', 'Pouso duro', 'Bom pouso!', 'Pouso perfeito!'][n], '⭐'.repeat(n) + ` · ${Math.abs(a.vs).toFixed(1)} m/s`);
  for (const r of a.P.rodas) { const p = r.getWorldPosition(V3()); for (let i = 0; i < 6; i++) fumaca.emitir(p, V3().set((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), tmpC.set(0xeeeeee), 1, 5, 0.5, 1.4); }
  som.pneu();
}
function explosao(c, agua, forca = 1) {
  for (let i = 0; i < 80 * forca; i++) {
    const v = V3().set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar((6 + Math.random() * 22) * Math.sqrt(forca));
    if (agua) fumaca.emitir(c, v.setY(Math.abs(v.y) * 1.6), tmpC.set(0xf4fbff), 3, 12, 0.85, 2.2, 0.8, -9);
    else { fogo.emitir(c, v, tmpC.setHSL(0.06 + Math.random() * 0.06, 1, 0.55), 4 * forca, 14 * forca, 1, 1 + Math.random(), 1.5, 2); fumaca.emitir(c, v.multiplyScalar(0.4), tmpC.set(0x2a2a2a), 6, 30 * forca, 0.7, 6, 0.8, 3); }
  }
  // destroços
  if (!agua) for (let i = 0; i < 10; i++) destrocos.push({ m: pedaco(), p: c.clone(), v: V3().randomDirection().multiplyScalar(12 + Math.random() * 15).add(tmpV.set(0, 10, 0)), r: V3().randomDirection(), t: 0 });
  const d = camera.position.distanceTo(c); cam.treme = Math.max(cam.treme, 2.5 * smooth(400, 20, d));
  som.batida(smooth(1500, 50, d));
}
const incendios = [], destrocos = [], gPedaco = new THREE.BoxGeometry(0.6, 0.15, 0.9), mPedaco = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
function pedaco() { const m = new THREE.Mesh(gPedaco, mPedaco); m.scale.setScalar(0.5 + Math.random() * 1.5); cena.add(m); return m; }
function bater(a, agua, motivo) {
  if (!a.vivo) return;
  a.vivo = false; a.V = 0; a.obj.visible = false; a.acel = 0; a.morteT = 0;
  const c = a.pos.clone(); if (agua) c.y = 0.5;
  if (!agua) incendios.push({ p: c.clone().setY(Math.max(M.chao(c.x, c.z), 0) + 1), t: 0, vida: 14 + a.esc * 3, f: Math.min(4, a.esc) });
  explosao(c, agua, Math.min(4, a.esc * (a.tipo === 'cargueiro' ? 2 : 1)));
  if (a === npc) for (const o of presos()) bater(o, agua);
  if (jog.aviao === a && jog.modo === 'piloto') { jog.vivo = false; jog.morteT = 0; mensagem(motivo || (agua ? 'Splash!' : 'Bateu!'), 'Voltando em instantes…', 3); }
  else if ((jog.modo === 'sobre' || jog.modo === 'trans') && jog.sobre === a) { jog.vivo = false; jog.morteT = 0; pessoa.obj.visible = false; mensagem('O avião caiu com você em cima!', 'Da próxima vez pule e abra o paraquedas', 3.5); }
  else if (camera.position.distanceTo(c) < 3000) mensagem(a.npc ? '' : 'Avião sem piloto caiu!', 'Boom!', 1.8);
}

// cargueiro gigante NPC: voa sozinho em círculo; a porta abre e fecha; dá pra pilotar e devolver ao piloto automático
const ESC_GIG = 3.2; // vão quase justo: caça da 2ª Guerra (11,3 m) passa com ~70 cm de cada lado; Andorinha ~1 m; caça a jato ~1,6 m
const npc = new Aero('gigante', 0, ESC_GIG);
npc.npc = { R: 3300, cx: 0, cz: 300, alt: 560, ang: 0.6, s: 1, blend: 0, v: 66 }; npc.V = 66; npc.trem = npc.tremAlvo = 0; npc.chao = false; npc.acel = 0.7; npc.rpm = 0.8; npc.portaAlvo = 1; npc.abre = 1;
npc.P.entrada = new THREE.Vector3(0, BAIA.piso, BAIA.frente + 0.35); // painel de comando na frente da baía
const alvoNPC = { p: V3(), q: new THREE.Quaternion() };
// tráfego aéreo: aviões com piloto NPC fazendo circuitos pelo arquipélago
for (const [t, pi, cx, cz, R, alt, v, s] of [['andorinha', 1, -1200, -700, 900, 380, 48, 1], ['guerra', 1, 2400, 1200, 1300, 450, 75, -1], ['cargueiro', 2, -300, 2600, 2200, 700, 70, 1], ['caca', 2, 0, -1500, 2600, 1000, 130, -1]]) {
  const a = new Aero(t, pi); a.npc = { R, cx, cz, alt, ang: Math.random() * 6.28, s, blend: 0, v }; a.chao = false; a.trem = a.tremAlvo = 0; a.acel = 0.7; a.rpm = 0.8; a.V = v; a.trafego = true;
}
function voarNPC(a, dt) {
  const n = a.npc; n.ang += n.s * a.V / n.R * dt;
  const x = n.cx + Math.cos(n.ang) * n.R, z = n.cz + Math.sin(n.ang) * n.R, tg = tmpV.set(-Math.sin(n.ang), 0, Math.cos(n.ang)).multiplyScalar(n.s);
  // piloto NPC olha 1,5 km à frente e sobe/desce para passar a pelo menos 'folga' metros do chão
  let topo = 0; for (let d = 0; d <= 1500; d += 150) { const an = n.ang + n.s * d / n.R; topo = Math.max(topo, M.chao(n.cx + Math.cos(an) * n.R, n.cz + Math.sin(an) * n.R)); }
  const quer = Math.max(n.alt, topo + (a === npc ? 160 : 90)); n.altAtual ??= quer;
  const alt0 = n.altAtual; n.altAtual += clamp(quer - n.altAtual, -6 * dt, 14 * dt); // sobe até 14 m/s, desce devagar
  const sobeV = (n.altAtual - alt0) / Math.max(dt, 1e-4) + Math.cos(n.ang * 3) * 3 * 25 * n.v / n.R; // velocidade vertical (subida + ondulação)
  n.arf = lerp(n.arf ?? 0, Math.atan2(sobeV, n.v), 1 - Math.exp(-dt * 1.5)); // nariz acompanha a subida, com atraso como num avião de verdade
  alvoNPC.p.set(x, n.altAtual + Math.sin(n.ang * 3) * 25, z);
  const bank = Math.atan(a.V * a.V / (9.8 * n.R));
  alvoNPC.q.setFromEuler(tmpE.set(0.03 + n.arf, Math.atan2(-tg.x, -tg.z), -n.s * bank, 'YXZ'));
  if (n.blend > 0) { // voltando suave para o circuito depois que o jogador pilotou
    n.blend = Math.max(0, n.blend - dt / 6); // 6 s: a pegada aumenta até grudar na rota (antes ficava ~110 m atrás pra sempre)
    const k = 1 - Math.exp(-dt * (0.6 + 40 * (1 - n.blend))); a.pos.lerp(alvoNPC.p, k); a.q.slerp(alvoNPC.q, k);
    a.V = lerp(a.V, n.v, k); a.dir.set(0, 0, -1).applyQuaternion(a.q);
  } else { a.vs = sobeV; a.pos.copy(alvoNPC.p); a.q.copy(alvoNPC.q); a.dir.copy(tg).multiplyScalar(n.v).setY(a.vs).normalize(); a.V = Math.hypot(n.v, a.vs); }
  a.queda = 0; a.acel = 0.7; a.trem = a.tremAlvo = 0; a.flap = 0;
  a.sincronizar(); if (tocaChao(a)) bater(a, M.chao(a.pos.x, a.pos.z) < 0.3, 'O avião bateu na montanha!');
}
const PONTAS = [[0, -0.6, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0.8]]; // nariz, cauda, pontas das asas, deriva (em fração do tamanho)
function tocaChao(a) { // alguma ponta do avião abaixo do chão (ou da água)?
  const s = a.P.envergadura / 2, c = a.P.comprimento || s * 1.6;
  for (const [x, y, z] of PONTAS) { const p = a.obj.localToWorld(tmpV.set(x * s, y * (a.P.alturaTrem || 2) * 1.2, z * c / 2)); if (p.y < Math.max(M.chao(p.x, p.z), 0)) return true; }
  return false;
}
function pilotoAutomatico(a) { // devolve o cargueiro ao NPC a partir de onde ele está
  const n = a.npc, dx = a.pos.x - n.cx, dz = a.pos.z - n.cz; n.altAtual = a.pos.y;
  n.R = clamp(Math.hypot(dx, dz), 1800, 4500); n.ang = Math.atan2(dz, dx); n.alt = clamp(a.pos.y, 350, 900);
  const f = tmpV.set(0, 0, -1).applyQuaternion(a.q); n.s = f.x * -Math.sin(n.ang) + f.z * Math.cos(n.ang) >= 0 ? 1 : -1; n.blend = 1;
  a.comPiloto = false; mensagem('Piloto automático ligado', 'O cargueiro volta a voar sozinho', 2.5);
}
function porta(a) { // abre/fecha a rampa de um cargueiro
  if (!a || !a.P.abrir) return; a.portaAlvo = a.portaAlvo ? 0 : 1; som.clique();
  mensagem(a.portaAlvo ? 'Abrindo a rampa' : 'Fechando a rampa', '', 1.4);
}
const presos = () => frota.filter((f) => f.preso);
const portaPerto = () => (jog.modo === 'sobre' && jog.sobre && jog.sobre.P.abrir ? jog.sobre : null);
// avião tentando entrar na baía do cargueiro gigante
function guiaBaia() { // atrás do cargueiro: mostra quanto falta corrigir para acertar a rampa
  const a = jog.aviao; if (!a || a === npc || a.preso || !npc.vivo) return '';
  const L = npc.obj.worldToLocal(tmpV3.copy(a.pos)), e = npc.esc, dist = (L.z - BAIA.rampaFim) * e; if (dist < -2 || dist > 250) return '';
  const dx = -L.x * e, dy = (BAIA.piso + a.P.alturaTrem * a.trem / e - L.y) * e, dv = (npc.V - a.V) * 3.6, cor = (v, lim) => (Math.abs(v) < lim ? '#7dffa0' : '#ffd05a');
  return `<b style="color:${cor(dx, 0.6)}">${dx > 0.15 ? '→' : dx < -0.15 ? '←' : '·'} ${Math.abs(dx).toFixed(1)} m</b> · <b style="color:${cor(dy, 0.8)}">${dy > 0.2 ? '↑' : dy < -0.2 ? '↓' : '·'} ${Math.abs(dy).toFixed(1)} m</b> · <b style="color:${cor(dv, 8)}">${dv > 0 ? '+' : ''}${Math.round(dv)} km/h</b> · ${Math.round(dist)} m${a.trem < 0.95 ? ' · <b style="color:#ff8070">BAIXE O TREM</b>' : ''}`;
}
function checarBaia(a, dt) {
  if (a === npc || !a.vivo || a.preso || a.chao || !npc.vivo) return;
  if (a.semBaia > 0) { a.semBaia -= dt; return; }
  if (a.pos.distanceToSquared(npc.pos) > 600 * 600) { a.entrouAtras = false; return; }
  const L = npc.obj.worldToLocal(tmpV3.copy(a.pos)), e = npc.esc, B = BAIA;
  const meia = a.P.envergadura / 2 / e, trem = (a.P.alturaTrem * a.trem + 0.65 * (1 - a.trem)) * a.esc / e;
  if (Math.abs(L.y - 2.1) < 0.5 + 0.4 / e && Math.abs(L.x) < 20.2 && L.z > -3.2 && L.z < 2.2) return bater(a, false); // asa
  if (Math.abs(L.x) < 0.5 && L.y > 1.8 && L.y < 9.5 && L.z > 8 && L.z < 15) return bater(a, false); // deriva
  const dentro = L.z > B.frente && L.z < B.rampaFim && Math.abs(L.x) < B.raio && L.y > B.piso - 0.8 && L.y < B.raio;
  if (!dentro) { if (L.z > B.rampaFim + 1) a.entrouAtras = true; else if (L.z < B.frente || Math.abs(L.x) > B.raio + 3 || Math.abs(L.y) > 4) a.entrouAtras = false; return; }
  if (!a.entrouAtras) return bater(a, false, 'Bateu na lateral do cargueiro!');
  if (npc.abre < 0.9) return bater(a, false, 'A rampa estava fechada!');
  const larg = Math.sqrt(Math.max(0, B.raio * B.raio - (L.y + 0.2) ** 2)), teto = L.z > B.fim ? B.teto - (L.z - B.fim) * 0.1 : B.raio - 0.3;
  const sobra = Math.abs(L.x) + meia - larg, sobraTeto = L.y + 0.9 * a.esc / e - teto;
  if (sobra > 0.7 / e || sobraTeto > 0.5 / e) return bater(a, false, sobra > 0 ? 'Bateu a asa na parede!' : 'Bateu no teto!');
  if (sobra > 0 || sobraTeto > 0) { // raspou de leve: volta pro meio, faísca e treme
    if (sobra > 0) L.x -= Math.sign(L.x) * (sobra + 0.05 / e); if (sobraTeto > 0) L.y -= sobraTeto + 0.03 / e;
    a.pos.copy(npc.obj.localToWorld(tmpV.copy(L))); cam.treme = Math.max(cam.treme, 0.6);
    const ponta = npc.obj.localToWorld(tmpV2.set(Math.sign(L.x || 1) * larg, L.y, L.z)); for (let k = 0; k < 8; k++) fogo.emitir(ponta, tmpV.randomDirection().multiplyScalar(6), tmpC.set(0xffd27a), 0.6, 0.2, 1, 0.4, 2);
    if ((a.raspouT = (a.raspouT || 0) + dt) > 0.3) { a.raspouT = 0; mensagem('Raspou!', 'Cuidado — mais que isso explode', 1.2); som.pneu(); }
  }
  for (const o of presos()) if (o.preso.L.distanceTo(L) * e < (o.P.envergadura + a.P.envergadura) * 0.42) return bater(a, false, 'Bateu no outro avião!');
  if (L.z < B.frente + 7 / e) return bater(a, false);
  if (L.y - trem <= B.piso + 0.02) {
    const vrel = a.velocidade(tmpV).sub(npc.velocidade(tmpV2)), vy = vrel.dot(tmpV2.set(0, 1, 0).applyQuaternion(npc.q));
    if (a.trem < 0.95 || vy < -8) return bater(a, false, a.trem < 0.95 ? 'Sem trem de pouso!' : 'Pouso duro demais dentro do cargueiro!');
    L.y = B.piso + trem;
    a.preso = { L: L.clone(), q: npc.q.clone().invert().multiply(a.q), vrel: Math.max(0, vrel.dot(tmpV2.set(0, 0, -1).applyQuaternion(npc.q))), soltando: false };
    a.preso.q.setFromEuler(new THREE.Euler(0, new THREE.Euler().setFromQuaternion(a.preso.q, 'YXZ').y, 0, 'YXZ'));
    a.acel = 0; S.feitos.baia = 1; salvar(); som.vitoria();
    mensagem('Você entrou no cargueiro!', 'Saia do avião (⇪) para andar, fechar a rampa ou pilotar o cargueiro', 5);
    if (desafio && desafio.d.id === 'baia') terminarDesafio('baia');
  }
}
function presoNoNPC(a, dt) {
  const p = a.preso, e = npc.esc;
  if (p.soltando) { // escorrega de ré pela rampa e sai voando
    p.vrel -= 7 * dt; p.L.z -= p.vrel * dt / e;
    if (p.L.z > BAIA.rampaFim + 3 / e) { a.preso = null; a.semBaia = 10; a.q.copy(npc.q).multiply(p.q); a.chao = false; a.V = npc.V - 10; a.dir.set(0, 0, -1).applyQuaternion(npc.q); a.queda = 6; a.acel = Math.max(a.acel, 0.7); a.entrouAtras = false; a.vAnt.copy(a.velocidade(tmpV)); mensagem('Lançado!', 'Desça um pouco, recolha o trem e acelere', 2.5); return; }
  } else { // freia e depois taxia sozinho até uma vaga dentro do baú, deixando a rampa livre
    const vaga = Math.max(BAIA.frente + 7 / e, BAIA.fim - (a.P.envergadura * 0.9 + 4) / e);
    p.vrel = Math.max(p.L.z > vaga + 0.5 / e ? 4 : 0, p.vrel - 9 * dt);
    const naFrente = jog.modo === 'sobre' && jog.sobre === npc && bloqueado(npc.obj.localToWorld(tmpV.copy(jog.L).add(tmpV2.set(0, 0, 1.2 / e))), npc) === a; // tem gente na frente: o avião espera
    if (naFrente) p.vrel = 0;
    p.L.z = Math.max(vaga, p.L.z - p.vrel * dt / e); p.L.x *= 1 - Math.min(1, dt * 0.8);
    for (const o of presos()) if (o !== a && Math.abs(o.preso.L.x - p.L.x) * e < (o.P.envergadura + a.P.envergadura) * 0.45 && o.preso.L.z < p.L.z && (p.L.z - o.preso.L.z) * e < 9) { p.L.z = o.preso.L.z + 9 / e; p.vrel = 0; } }
  a.pos.copy(npc.obj.localToWorld(tmpV.copy(p.L))); a.q.copy(npc.q).multiply(p.q); a.V = npc.V; a.dir.copy(npc.dir); a.chao = true; a.queda = 0; a.vs = 0;
  a.rpm = lerp(a.rpm, a.comPiloto ? 0.18 + a.acel * 0.8 : 0.18, dt);
}
function soltarAviao() { // dentro do cargueiro: o avião sai de ré pela rampa
  const a = jog.aviao; if (!a || !a.preso || a.preso.soltando) return;
  if (npc.abre < 0.9) return mensagem('Abra a rampa primeiro', 'Botão ⊓ porta', 1.8);
  a.preso.soltando = true; a.preso.vrel = 0; a.tremAlvo = 1; mensagem('Soltando...', 'O avião sai de ré pela rampa', 1.5);
}

function colisaoNoAr(a) { // dois aviões se tocando no ar: os dois caem (o cargueiro gigante tem regra própria na baía)
  for (const o of frota) {
    if (o === a || o === npc || !o.vivo || o.chao || o.preso) continue;
    const r = (a.P.envergadura * a.esc + o.P.envergadura * o.esc) * 0.33;
    if (a.pos.distanceToSquared(o.pos) < r * r) { bater(o, false); return bater(a, false, 'Colisão no ar!'); }
  }
}
// ---------- Tiros (caça a jato e caça da 2ª Guerra) e alvos ----------
const balas = [], alvos = [], misseis = [], inimigos = [];
// traçantes: riscos brilhantes de 14 m que voam com a bala (bem visíveis de longe)
const gTraco = new THREE.BoxGeometry(0.5, 0.5, 24).translate(0, 0, 12);
const mTraco = { j: new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), i: new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }) };
const poolTraco = [];
function atirar(a, dt, mirarEm) {
  const W = a.T.armas; if (!W || !a.vivo || a.preso) return;
  a.cadT = (a.cadT || 0) - dt; if (a.cadT > 0) return; a.cadT = 1 / W.cadencia;
  const c = W.canos[(a.canoI = (a.canoI || 0) + 1) % W.canos.length], p = a.obj.localToWorld(V3().set(...c));
  const disp = a.inimigo ? 6 : 3; // inimigo erra um pouco mais
  let dirTiro = null;
  if (!a.inimigo || jog.aviao) { // mira assistida (inimigo também mira no futuro, só em você): inimigo a até 1,2 km e dentro de ~9° do nariz → balas vão para onde ele vai estar
    const f = tmpV.set(0, 0, -1).applyQuaternion(a.q);
    for (const o of frota) {
      if (mirarEm) { const t = mirarEm.distanceTo(p) / W.vel; dirTiro = tmpV3.copy(mirarEm).add(tmpV.set(0, 1, 0)).addScaledVector(jog.sobre ? jog.sobre.velocidade(V3()) : jog.vel, t).addScaledVector(a.velocidade(V3()), -t).sub(p).normalize(); break; }
      if (o === a || !o.vivo || o.chao || o.fixo || o === npc || (a.inimigo && o !== jog.aviao) || (!a.inimigo && o === jog.aviao)) continue;
      const d = tmpV2.copy(o.pos).sub(a.pos), dist = d.length(); if (dist > 1200) continue;
      if (d.dot(f) / dist < Math.cos(0.16)) continue;
      const t = dist / W.vel; dirTiro = tmpV3.copy(o.pos).addScaledVector(o.velocidade(V3()), t).addScaledVector(a.velocidade(V3()), -t).sub(p).normalize(); break;
    }
  }
  const v = a.velocidade(V3()).addScaledVector(dirTiro || tmpV.set(0, 0, -1).applyQuaternion(a.q), W.vel).add(tmpV.set((Math.random() - 0.5) * disp, (Math.random() - 0.5) * disp, (Math.random() - 0.5) * disp));
  const m = poolTraco.pop() || new THREE.Mesh(gTraco); m.material = a.inimigo ? mTraco.i : mTraco.j; m.frustumCulled = false; m.position.copy(p); m.quaternion.setFromUnitVectors(EZ, tmpV.copy(v).normalize().negate()); cena.add(m);
  balas.push({ p, v, t: 0, m, dono: a });
  fogo.emitir(p, a.velocidade(tmpV2), tmpC.set(0xffe2a0), 6, 2, 1, 0.08, 0); // clarão na boca do cano
  if (a === jog.aviao || camera.position.distanceToSquared(p) < 600 * 600) som.tiro();
}
const PESSOA = { inimigo: false }; // "dono" das balas do fuzil
function atirarFuzil(dt) {
  if (!jog.vivo || jog.modo === 'piloto' || jog.modo === 'trans') return;
  jog.cadF = (jog.cadF || 0) - dt; pessoa.mira = 0.6; if (jog.cadF > 0) return; jog.cadF = 0.11;
  const f = camera.getWorldDirection(V3()); jog.yaw = Math.atan2(-f.x, -f.z); // vira o corpo pra onde a câmera olha
  if (jog.modo === 'sobre' && jog.sobre) jog.yaw = Math.atan2(-tmpV.copy(f).applyQuaternion(tmpQ.copy(jog.sobre.q).invert()).x, -tmpV.z);
  const cima = jog.modo === 'sobre' && jog.sobre ? tmpV3.set(0, 1, 0).applyQuaternion(jog.sobre.q) : tmpV3.set(0, 1, 0);
  const p = V3().copy(jog.pos).addScaledVector(cima, 1.35).addScaledVector(f, 0.9); // sai da altura do ombro, na direção da mira
  let alvoP = tmpV2.copy(camera.position).addScaledVector(f, 400); // mira no centro da tela
  for (const o of frota) { // mira assistida: avião a até 800 m perto da mira
    if (!o.vivo || o.chao || o.fixo || o === npc || o === jog.sobre) continue; const d = tmpV3.copy(o.pos).sub(camera.position), dist = d.length();
    if (dist < 800 && d.dot(f) / dist > Math.cos(0.1)) { const vb = jog.modo === 'sobre' && jog.sobre ? jog.sobre.velocidade(V3()) : jog.vel; alvoP = tmpV2.copy(o.pos).addScaledVector(o.velocidade(V3()).sub(vb), dist / 600); break; } // desconta a velocidade de quem atira
  }
  const base = jog.modo === 'sobre' && jog.sobre ? jog.sobre.velocidade(V3()) : jog.vel.clone();
  const v = V3().subVectors(alvoP, p).normalize().multiplyScalar(600).add(base).add(tmpV.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4));
  const m = poolTraco.pop() || new THREE.Mesh(gTraco); m.material = mTraco.j; m.frustumCulled = false; m.position.copy(p); m.quaternion.setFromUnitVectors(EZ, tmpV.copy(v).normalize().negate()); cena.add(m);
  balas.push({ p, v, t: 0, m, dono: PESSOA }); pessoa.disparo = 0.05; som.tiro();
}
// ---------- Gancho: cabo que puxa você até outro avião ----------
const cabo = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(), V3()]), new THREE.LineBasicMaterial({ color: 0x222222 })); cabo.frustumCulled = false; cabo.visible = false; cena.add(cabo);
function alvoGancho() { // avião no ar mais perto (até 120 m), que não seja o que você está
  if (!jog.vivo || !['queda', 'paraquedas', 'sobre', 'pe'].includes(jog.modo)) return null;
  let melhor = null, md = 120; for (const o of frota) { if (!o.vivo || o === jog.sobre || o.preso || (o.chao && o.V < 1) || o.inimigo) continue; const d = o.pos.distanceTo(jog.pos) - o.P.envergadura * o.esc * 0.3; if (d < md) { md = d; melhor = o; } }
  return melhor;
}
function gancho() {
  const a = alvoGancho(); if (!a) return mensagem('Nenhum avião perto', 'O gancho alcança 120 m', 1.4);
  jog.modo = 'gancho'; jog.gancho = { a, t: 0, de: jog.pos.clone(), dur: Math.max(0.5, a.pos.distanceTo(jog.pos) / 70) };
  cabo.visible = true; som.flare(); cam.iniciado = false;
}
function atualizarGancho(dt) {
  const G = jog.gancho, a = G.a; if (!a.vivo) { jog.modo = 'queda'; cabo.visible = false; return; }
  G.t += dt / G.dur; const u = Math.min(1, G.t), s2 = u * u * (3 - 2 * u), dest = a.obj.localToWorld(tmpV3.copy(a.P.entradaVoo || a.P.entrada).setY((a.P.entradaVoo || a.P.entrada).y + 0.3));
  jog.pos.copy(G.de).lerp(dest, s2); jog.vel.copy(a.velocidade(tmpV));
  cabo.geometry.attributes.position.setXYZ(0, jog.pos.x, jog.pos.y + 1.2, jog.pos.z); cabo.geometry.attributes.position.setXYZ(1, dest.x, dest.y, dest.z); cabo.geometry.attributes.position.needsUpdate = true;
  if (u >= 1) { cabo.visible = false; jog.modo = 'sobre'; jog.sobre = a; jog.L.copy(a.P.entradaVoo || a.P.entrada); jog.poucoT = 0.3; jog.yaw = 0; cam.iniciado = false; prenderNaBaia(); mensagem('Agarrou o avião!', a.P.baia ? '' : 'Entre na cabine (⇩) ou ande em cima', 2); }
}
function ferirPessoa(dano) {
  jog.hp = (jog.hp ?? 100) - dano; piscarDano(); cam.treme = Math.max(cam.treme, 0.5);
  if (jog.hp <= 0) { jog.vivo = false; jog.morteT = 0; pessoa.obj.visible = false; explosao(jog.pos.clone(), false, 0.2); mensagem('Você foi atingido!', 'Volte para a cabine quando o inimigo estiver perto', 3); }
}
function danificar(a, dano, porQuem) { // aviões têm "vida"; com pouca vida soltam fumaça; zero = explode
  if (!a.vivo || a.fixo || a === npc) return;
  a.hp = (a.hp ?? 100) - dano;
  for (let k = 0; k < 4; k++) fogo.emitir(a.pos, tmpV.randomDirection().multiplyScalar(10), tmpC.set(0xffc060), 1.5, 0.3, 1, 0.25, 2); // faíscas do impacto
  if (a === jog.aviao) { cam.treme = Math.max(cam.treme, 0.8); piscarDano(); }
  if (a.hp <= 0) { bater(a, false, a === jog.aviao ? 'Você foi abatido!' : null); if ((porQuem === jog.aviao || porQuem === PESSOA) && a !== jog.aviao) { mensagem('Abatido!', a.inimigo ? `${inimigos.filter((x) => x.vivo).length} inimigo(s) restante(s)` : 'Você derrubou um avião', 2); som.descobre(); } }
}
function piscarDano() { const d = $('dano'); d.style.opacity = 0.45; clearTimeout(piscarDano.t); piscarDano.t = setTimeout(() => (d.style.opacity = 0), 120); }
function atualizarBalas(dt) {
  for (let i = balas.length - 1; i >= 0; i--) {
    const b = balas[i], ant = tmpV3.copy(b.p); b.t += dt; b.v.y -= 9.8 * dt; b.p.addScaledVector(b.v, dt); b.m.position.copy(b.p);
    if (b.t > 0.08) for (let k = 0; k < 3; k++) fogo.emitir(tmpV.copy(ant).lerp(b.p, k / 3), tmpV2.set(0, 0, 0), b.dono.inimigo ? tmpC.set(0xff5040) : tmpC.set(0xffd27a), 2.6, 1, 1, 0.3, 0); // rastro brilhante contínuo (visível de qualquer ângulo)
    let fim = b.t > 2.4;
    const seg = tmpV2.copy(b.p).sub(ant), L2 = Math.max(seg.lengthSq(), 1e-6);
    const toca = (c, r) => { const u = clamp(tmpV.copy(c).sub(ant).dot(seg) / L2, 0, 1); return tmpV.copy(ant).addScaledVector(seg, u).distanceTo(c) < r; };
    for (let k = alvos.length - 1; k >= 0 && !fim; k--) if (toca(alvos[k].g.position, alvos[k].r)) { acertou(alvos[k], k); fim = true; }
    for (const a of frota) { // bala contra avião (no ar, vivo, que não é quem atirou)
      if (fim || a === b.dono || (b.dono === PESSOA && a === jog.sobre) || !a.vivo || a.chao || a.fixo || a === npc || a.pos.distanceToSquared(b.p) > 250 * 250) continue;
      if (toca(a.pos, a.P.envergadura * a.esc * 0.55)) { danificar(a, a === jog.aviao ? 4 : b.dono === PESSOA ? 9 : 14, b.dono); fim = true; }
    }
    if (!fim && b.dono.inimigo && jog.vivo && jog.modo !== 'piloto' && jog.modo !== 'trans' && toca(tmpV3.copy(jog.pos).add(tmpV2.set(0, 1, 0)), 1.3)) { ferirPessoa(2); fim = true; } // acertou você
    const h = M.chao(b.p.x, b.p.z);
    if (!fim && b.p.y < Math.max(h, 0)) { fumaca.emitir(b.p, tmpV.set(0, 3, 0), tmpC.set(h < 0 ? 0xf4fbff : 0x9a8a70), 1.5, 5, 0.6, 0.8); fim = true; }
    if (fim) { cena.remove(b.m); poolTraco.push(b.m); balas.splice(i, 1); }
  }
  atualizarMisseis(dt); atualizarFlares(dt);
}
// ---------- Mísseis guiados (caça a jato): trava num alvo à frente e persegue ----------
const gMissil = (() => { const g = new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8); g.rotateX(Math.PI / 2); return g; })(), mMissil = new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.4 });
function alvoTravado(a) { // avião no ar, à frente (até 28°), a menos de 3 km
  if (!a || !a.T.armas?.misseis) return null;
  const f = tmpV.set(0, 0, -1).applyQuaternion(a.q); let melhor = null, mv = Infinity;
  for (const o of frota) {
    if (o === a || !o.vivo || o.chao || o.fixo || o === npc || o.preso) continue;
    const d = tmpV2.copy(o.pos).sub(a.pos), dist = d.length(); if (dist > 3000 || dist < 60) continue;
    const ang = Math.acos(clamp(d.dot(f) / dist, -1, 1)); if (ang > 0.49) continue;
    const nota = ang * 2000 + dist + (o.inimigo ? -1500 : 0); if (nota < mv) { mv = nota; melhor = o; }
  }
  return melhor;
}
function dispararMissil(a, alvoForcado) {
  const W = a?.T.armas; if (!W?.misseis || !a.vivo) return;
  const eu = a === jog.aviao;
  a.misseis ??= W.misseis; if (a.misseis <= 0) return eu && mensagem('Sem mísseis', 'Eles voltam quando você renasce', 1.5);
  const alvo = alvoForcado || alvoTravado(a); if (!alvo) return eu && mensagem('Nenhum alvo travado', 'Aponte o nariz para um avião (até 3 km)', 1.6);
  a.misseis--; const lado = a.misseis % 2 ? 1 : -1;
  const p = a.obj.localToWorld(V3().set(lado * a.P.envergadura * 0.45, -0.3, 0));
  const m = new THREE.Mesh(gMissil, a.inimigo ? mMissilIni : mMissil); m.position.copy(p); cena.add(m);
  misseis.push({ p, v: a.velocidade(V3()), alvo, t: 0, m, dono: a });
  if (eu) { som.missil(); mensagem('Fox 2!', `Míssil lançado · ${a.misseis} restante(s)`, 1.3); }
  if (alvo.inimigo && Math.random() < 0.5) alvo.flareEm = 0.6 + Math.random() * 1.2; // o inimigo pode reagir soltando flares
}
// ---------- Flares: iscas quentes que puxam os mísseis ----------
const flares = [], mMissilIni = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.4 });
function soltarFlares(a) {
  if (!a?.vivo) return; a.flares ??= 30; if (a.flares <= 0) return a === jog.aviao && mensagem('Sem flares', '', 1.2);
  if ((a.flareT || 0) > 0) return; a.flareT = 0.8; a.flares -= 2;
  const lateral = tmpV.set(1, 0, 0).applyQuaternion(a.q);
  for (const s2 of [-1, 1]) {
    const v = a.velocidade(V3()).multiplyScalar(0.6).addScaledVector(lateral, s2 * 18).add(tmpV2.set(0, -6, 0));
    const f = { pos: a.pos.clone(), v, t: 0, vivo: true, velocidade(out) { return out.copy(this.v); } }; flares.push(f);
    for (const m of misseis) if (m.alvo === a && m.p.distanceTo(a.pos) < 5000 && Math.random() < 0.6) m.alvo = f; // cada flare engana 60% dos mísseis vindo
  }
  if (a === jog.aviao) { som.flare(); mensagem('Flares!', `${a.flares} restante(s)`, 1); }
}
function atualizarFlares(dt) {
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i]; f.t += dt; f.v.y -= 9.8 * dt; f.v.multiplyScalar(1 - 0.9 * dt); f.pos.addScaledVector(f.v, dt);
    fogo.emitir(f.pos, tmpV.set(0, 0, 0), tmpC.set(0xfff0c0), 5, 2, 1, 0.12, 0); fumaca.emitir(f.pos, tmpV.set(0, 1, 0), tmpC.set(0xdddddd), 1, 5, 0.5, 2.5, 0.5);
    if (f.t > 3.5) { f.vivo = false; flares.splice(i, 1); }
  }
  for (const a of frota) if (a.flareT > 0) a.flareT -= dt;
}
const a_misselDano = (al) => (al === jog.aviao ? 70 : 999); // você aguenta um míssil (sai bem avariado)
function atualizarMisseis(dt) {
  for (let i = misseis.length - 1; i >= 0; i--) {
    const s = misseis[i]; s.t += dt; const al = s.alvo;
    const vel = Math.min(480, s.v.length() + 260 * dt); // acelera até ~1700 km/h
    if (al.vivo && s.t > 0.35) { // navegação: aponta para onde o alvo vai estar
      const tgo = s.p.distanceTo(al.pos) / vel, quer = tmpV.copy(al.pos).addScaledVector(al.velocidade(tmpV2), tgo).sub(s.p).normalize();
      const atual = tmpV2.copy(s.v).normalize(), ang = Math.acos(clamp(atual.dot(quer), -1, 1)), max = 2.6 * dt; // curva máxima por quadro
      s.v.copy(ang > max ? atual.lerp(quer, max / ang).normalize() : quer).multiplyScalar(vel);
    } else { s.v.setLength(vel); s.v.y -= 9.8 * dt; }
    s.p.addScaledVector(s.v, dt); s.m.position.copy(s.p); s.m.quaternion.setFromUnitVectors(EZ, tmpV.copy(s.v).normalize());
    fumaca.emitir(s.p, tmpV.set(0, 0.5, 0), tmpC.set(0xeeeeee), 1.2, 6, 0.7, 2.5, 0.8); fogo.emitir(s.p, tmpV.set(0, 0, 0), tmpC.set(0xffb060), 2.2, 0.5, 1, 0.08, 0);
    const bateu = al.vivo && s.p.distanceTo(al.pos) < 14, chao = s.p.y < Math.max(M.chao(s.p.x, s.p.z), 0);
    if (bateu || chao || s.t > 12) {
      if (bateu && al.velocidade && al.P) danificar(al, a_misselDano(al), s.dono); else explosao(s.p.clone(), chao && M.chao(s.p.x, s.p.z) < 0, 0.4);
      cena.remove(s.m); misseis.splice(i, 1);
    }
  }
}
// ---------- Inimigos: caças com piloto NPC que te perseguem e atiram ----------
function criarInimigo(tipo, x, z, y, rumo) {
  const a = new Aero(tipo, tipo === 'caca' ? 1 : 2); a.colocar(x, z, rumo, true, y); a.pos.y = y;
  a.inimigo = true; a.comPiloto = true; a.hp = 100; a.misseis = tipo === 'caca' ? 2 : 0; a.flares = 10; a.acel = 0.85; a.V = tipo === 'caca' ? 130 : 80; a.vAnt.copy(a.velocidade(V3()));
  inimigos.push(a); return a;
}
function pilotarInimigo(a, dt) {
  const alvo = !jog.vivo ? null : jog.modo === 'piloto' ? jog.aviao : (jog.modo === 'sobre' || jog.modo === 'gancho') && jog.sobre && !jog.sobre.chao ? jog.sobre : null; if (!alvo) { a.ent.r = a.ent.p = 0; return; }
  const f = tmpV.set(0, 0, -1).applyQuaternion(a.q), d = tmpV2.copy(alvo.pos).addScaledVector(alvo.velocidade(tmpV3), clamp(a.pos.distanceTo(alvo.pos) / 900, 0, 1.5)).sub(a.pos);
  const dist = d.length(), solo = a.pos.y - Math.max(0, M.chao(a.pos.x, a.pos.z), M.chao(a.pos.x + f.x * 400, a.pos.z + f.z * 400));
  const rumoErr = Math.atan2(f.x * d.z - f.z * d.x, f.x * d.x + f.z * d.z); // erro de rumo (horizontal)
  const subir = Math.atan2(d.y, Math.hypot(d.x, d.z)) - Math.asin(clamp(f.y, -1, 1));
  a.ent.r = clamp(rumoErr * 1.6, -0.9, 0.9);
  a.ent.p = clamp(subir * 2.2 + Math.abs(a.ent.r) * 0.35, -0.7, 1);
  if (solo < 180) { a.ent.r *= 0.3; a.ent.p = 1; } // perto do chão: nivela e puxa
  a.acel = dist > 1500 ? 1 : dist < 300 ? 0.55 : 0.85;
  const ang = Math.acos(clamp(f.dot(d) / dist, -1, 1));
  if (dist < 900 && ang < 0.14) atirar(a, dt, jog.modo !== 'piloto' ? jog.pos : null); // tem você na mira: atira (no boneco, se estiver fora da cabine)
  a.missilT = (a.missilT ?? 6 + Math.random() * 6) - dt; // lança míssil de vez em quando, se tiver você à frente
  if (a.missilT <= 0 && dist > 500 && dist < 2600 && ang < 0.45) { a.missilT = 12 + Math.random() * 8; dispararMissil(a, alvo); }
  if (a.flareEm !== undefined && (a.flareEm -= dt) <= 0) { a.flareEm = undefined; soltarFlares(a); }
}
function limparInimigos() { for (const a of inimigos) a.remover(); inimigos.length = 0; }
function criarAlvos(cx, cz, n) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e8322a'; g.fillRect(i * 8, 0, 8, 32); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5 }), anel = new THREE.MeshBasicMaterial({ color: 0xffd05a });
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.random() * 0.4, d = 300 + Math.random() * 900, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const g = new THREE.Group(); g.position.set(x, Math.max(M.chao(x, z), 0) + 110 + Math.random() * 220, z);
    const esf = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), mat); esf.castShadow = true; g.add(esf);
    const ar = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.35, 6, 32), anel); ar.rotation.x = Math.PI / 2; g.add(ar);
    cena.add(g); alvos.push({ g, r: 8, y0: g.position.y, f: Math.random() * 6 });
  }
}
function limparAlvos() { for (const al of alvos) cena.remove(al.g); alvos.length = 0; }
function acertou(al, k) {
  explosao(al.g.position.clone(), false, 0.6); cena.remove(al.g); alvos.splice(k, 1);
  if (desafio && desafio.d.id === 'tiro') { mensagem(`Acertou! ${desafio.total - alvos.length}/${desafio.total}`, '', 1.2); if (!alvos.length) terminarDesafio('tiro'); }
}

// ---------- Controle por inclinação do celular (acelerômetro) ----------
const incl = { ligado: false, p: 0, r: 0, g: [0, 0, 0], ok: false, cal: null, s: 1 };
function eixosTela() { // gravidade em coordenadas da tela (direita, cima, para fora da tela)
  const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0, [x, y, z] = incl.g;
  return ang === 90 ? [-y, x, z] : ang === -90 || ang === 270 ? [y, -x, z] : [x, y, z];
}
function calibrarIncl() {
  if (!incl.ok) return; const [, up, z] = eixosTela();
  incl.s = up + z < 0 ? 1 : -1; // iPhone e Android dão a gravidade com sinais opostos
  incl.cal = Math.atan2(z * incl.s, -up * incl.s);
}
addEventListener('devicemotion', (e) => {
  const g = e.accelerationIncludingGravity; if (!g || g.x === null) return;
  incl.g = [g.x, g.y, g.z]; if (!incl.ok) { incl.ok = true; calibrarIncl(); }
  if (!incl.ligado || incl.cal === null) return;
  const [rt, up, z] = eixosTela().map((v) => v * incl.s);
  const lim = (v) => clamp(Math.abs(v) < 0.04 ? 0 : v, -1, 1);
  incl.r = lim(Math.atan2(rt, -up) / 0.5);                          // girar como volante
  incl.p = lim(-(Math.atan2(z, -up) - incl.cal) / 0.4);              // topo do celular pra você = sobe
});
async function ligarIncl() {
  try { if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission && (await DeviceMotionEvent.requestPermission()) !== 'granted') throw 0; }
  catch (e) { S.incl = false; salvar(); incl.ligado = false; return mensagem('Sem permissão de movimento', 'Ative em Ajustes do iPhone e tente de novo', 3); }
  incl.ligado = true; calibrarIncl(); mensagem('Inclinação ligada', 'Gire o celular como volante · incline o topo pra você para subir', 3);
}
if (S.incl) document.addEventListener('pointerdown', () => ligarIncl(), { once: true }); // o iPhone só deixa pedir permissão num toque

// ---------- Jogador: piloto ou a pé ----------
const pessoa = criarPessoa(); cena.add(pessoa.obj); pessoa.obj.visible = false;
const jog = { camPit: 0.28, hop: 0, hopV: 0, correr: false, modo: 'piloto', aviao: null, sobre: null, L: V3(), pos: V3(), vel: V3(), yaw: 0, camYaw: 0, garras: true, vivo: true, morteT: 0, rapidez: 0, noChao: true, ondeNasce: null, trans: null, poucoT: 0 };
function pilotar(a) {
  if (jog.aviao && jog.aviao !== a) { if (jog.aviao === npc && npc.comPiloto && npc.vivo) pilotoAutomatico(npc); else jog.aviao.comPiloto = false; }
  jog.hop = jog.hopV = 0; jog.hp = 100; if (!a.inimigo) { a.hp ??= 100; }
  jog.aviao = a; a.comPiloto = true; jog.modo = 'piloto'; jog.vivo = true; jog.sobre = null; jog.trans = null; pessoa.obj.visible = false;
  if (a.trafego) { a.npc = null; a.trafego = false; a.vAnt.copy(a.velocidade(tmpV)); } // tomou o avião do tráfego
  if (a === npc) { a.npc.blend = 0; a.ent.p = a.ent.r = a.ent.y = 0; a.vAnt.copy(a.velocidade(tmpV)); }
  cam.iniciado = false; document.body.classList.remove('ape'); if (a.tipo !== 'gigante') { S.tipo = a.tipo; salvar(); }
}
function novoAviao(tipo, pint) { const a = new Aero(tipo, pint ?? (S.pintura % TIPOS[tipo].pinturas.length)); return a; }
function nascer(o) { // o = {x,z,y?,rumo,chao?}
  jog.ondeNasce = o;
  let a = jog.aviao;
  const meu = a && a !== npc && !a.preso && !a.fixo; // avião do jogador que pode ser reaproveitado ou apagado
  if (!meu || a.tipo !== S.tipo || a.pint !== S.pintura % TIPOS[S.tipo].pinturas.length) { if (meu) a.remover(); a = novoAviao(S.tipo); }
  a.colocar(o.x, o.z, o.rumo || 0, !o.chao, o.y); a.hp = 100; a.misseis = a.T.armas?.misseis || 0; a.flares = 30;
  limparFrota(a); pilotar(a);
}
function nascerLugar(l) {
  if (l.id === 'aero') return nascer({ x: PISTA.x, z: PISTA.z1 - 40, rumo: 0, chao: true });
  if (l.id === 'aero2') return nascer({ x: PISTA2.x, z: PISTA2.z1 - 40, rumo: 0, chao: true });
  if (l.id === 'porta') return nascer({ x: PORTA.x, z: PORTA.z + 2800, y: 180, rumo: 0 });
  const a = THREE.MathUtils.degToRad(l.rumo);
  nascer({ x: l.x - Math.sin(a) * 900, z: l.z + Math.cos(a) * 900, y: l.y, rumo: l.rumo });
}
function limparFrota(manter) { // tira aviões abandonados longe demais (mantém estacionados, os que estão no cargueiro e o NPC)
  for (const a of [...frota]) if (a !== manter && !a.npc && !a.inimigo && !a.estacionado && !a.fixo && !a.preso && (!a.vivo || a.pos.distanceTo(manter.pos) > 6000)) a.remover();
}

// colisão do boneco com aviões parados: as peças viram "caixas" na altura certa
function bloqueado(pw, ignorar, altura = 1.75) {
  for (const a of frota) {
    if (a === ignorar || !a.vivo || !a.obj.visible || (a.V > 3 && !a.preso) || a.pos.distanceToSquared(pw) > (25 * a.esc + 25) ** 2) continue;
    const L = a.obj.worldToLocal(tmpV2.copy(pw)); if (vaoDaBaia(a, L)) continue;
    const pe = L.y + 0.05 / a.esc, cabeca = L.y + altura / a.esc;
    for (const y of a.P.superficies(L.x, L.z)) if (y > pe + 0.3 / a.esc && fundoPeca(a, L.x, y) < cabeca) return a;
  }
  return null;
}
const vaoDaBaia = (a, L) => a.P.baia && Math.abs(L.x) < BAIA.raio - 0.15 && L.z > BAIA.frente && L.z < BAIA.rampaFim && L.y > BAIA.piso - 0.05 && L.y < BAIA.raio - 0.25; // oco do baú
const fundoPeca = (a, x, y) => { const rc = a.P.raioCorpo || 0.8; return Math.abs(x) < rc ? y - 2 * rc : y - 0.45; }; // fuselagem é grossa, asa é fina
function dentroDeAviao(pw) { // ponto (câmera) dentro de alguma peça de avião?
  for (const a of frota) {
    if (!a.vivo || !a.obj.visible || a.pos.distanceToSquared(pw) > (25 * a.esc + 25) ** 2) continue;
    const L = a.obj.worldToLocal(tmpV2.copy(pw)), folga = 0.25 / a.esc;
    if (vaoDaBaia(a, L)) continue;
    for (const y of a.P.superficies(L.x, L.z)) if (L.y < y + folga && L.y > fundoPeca(a, L.x, y) - folga) return true;
  }
  return false;
}
function desencalhar(ref) { // se o boneco ficou dentro de um avião, empurra pro lado até ficar livre
  const a = bloqueado(jog.pos, ref); if (!a) return;
  const lado = tmpV3.set(1, 0, 0).applyQuaternion(a.q).setY(0).normalize(); const L = a.obj.worldToLocal(tmpV.copy(jog.pos)); if (L.x < 0) lado.negate();
  for (let i = 0; i < 80 && bloqueado(jog.pos, ref); i++) jog.pos.addScaledVector(lado, 0.5);
  jog.pos.y = Math.max(M.chao(jog.pos.x, jog.pos.z), -1);
}
function sair() {
  const a = jog.aviao; if (!a || jog.modo !== 'piloto' || !jog.vivo) return;
  a.comPiloto = false; a.ent.p = a.ent.r = a.ent.y = 0; a.ent.freio = !!a.chao;
  document.body.classList.add('ape'); pessoa.obj.visible = true; cam.iniciado = false;
  const cab = a.obj.localToWorld(V3().copy(a.P.entrada));
  if (a === npc) { // sai do comando do cargueiro: piloto automático assume, você fica na baía
    pilotoAutomatico(a); jog.modo = 'sobre'; jog.sobre = npc; jog.L.copy(npc.P.entrada).add(tmpV.set(0, 0, 1.2 / npc.esc)); jog.yaw = Math.PI; jog.camYaw = Math.PI; return;
  }
  if (a.chao && a.V < 8 && !a.preso) { // desce pelo lado, longe da asa
    a.acel = 0; const s = a.P.saida || new THREE.Vector3(a.P.envergadura / 2 + 1.2, 0, 0);
    const destino = a.obj.localToWorld(V3().copy(s)); destino.y = Math.max(M.chao(destino.x, destino.z), -1);
    jog.yaw = Math.atan2(-fwd.set(0, 0, -1).applyQuaternion(a.q).x, -fwd.z); jog.camYaw = jog.yaw;
    jog.modo = 'trans'; jog.trans = { de: cab, para: destino, t: 0, dur: 0.9, arco: 1.2, fim: () => { jog.modo = 'pe'; jog.pos.copy(destino); jog.vel.set(0, 0, 0); jog.noChao = true; desencalhar(); jog.poucoT = 0.35; mensagem('A pé', 'Chegue perto de um avião para entrar', 2); } };
    jog.pos.copy(cab); return;
  }
  // em pleno voo: sobe em cima do avião (ou fica na baía do cargueiro)
  const alvo = a.preso ? npc : a;
  jog.modo = 'sobre'; jog.sobre = alvo; jog.yaw = 0; jog.camYaw = 0;
  if (a.preso) { const s = a.P.saida || new THREE.Vector3(a.P.envergadura / 2 + 1, 0, 0); jog.L.copy(npc.obj.worldToLocal(a.obj.localToWorld(V3().copy(s)))); jog.L.y = BAIA.piso; prenderNaBaia(); if (bloqueado(npc.obj.localToWorld(V3().copy(jog.L)), npc)) jog.L.x = Math.sign(jog.L.x || 1) * (BAIA.meia - 0.4 / npc.esc); }
  else { jog.L.copy(a.P.entradaVoo || a.P.entrada); if (a.P.baia) jog.yaw = Math.PI; }
  mensagem(a.preso ? 'Dentro do cargueiro' : jog.garras ? 'Garras presas no avião!' : 'Sem garras: segure-se!', a.preso ? 'Feche/abra a rampa, vá ao painel da frente para pilotar ou pule pela rampa' : 'O avião segue sem piloto — e pode cair', 3.5);
}
function entrarPerto() { // devolve o avião mais perto que dá pra entrar
  let melhor = null, md = 1e9;
  for (const a of frota) {
    if (!a.vivo) continue;
    let d;
    if (jog.modo === 'sobre') {
      if (jog.sobre === a) d = a.P.baia ? jog.L.distanceTo(a.P.entradaVoo || a.P.entrada) * a.esc - 0.6 * a.esc : 0; // em cima de avião: entra de qualquer ponto (anda até a cabine)
      else if (jog.sobre === npc && a.preso) d = Math.min(a.obj.localToWorld(tmpV.copy(a.P.saida || a.P.entrada)).distanceTo(jog.pos) - 1.0, a.pos.distanceTo(jog.pos) - a.P.envergadura * 0.5); // perto de qualquer parte do avião guardado
      else continue;
    } else if (jog.modo === 'pe') { if (a === npc) continue; d = Math.min(a.obj.localToWorld(tmpV.copy(a.P.entrada)).distanceTo(jog.pos) - 1.5 * a.esc, a.obj.localToWorld(tmpV.copy(a.P.saida || a.P.entrada)).setY(jog.pos.y).distanceTo(jog.pos) - 0.5); }
    else continue;
    if (d < md) { md = d; melhor = a; }
  }
  return md < 2.6 ? melhor : null;
}
function entrar() {
  const a = entrarPerto(); if (!a) return;
  const nome = a === npc ? 'Cargueiro gigante' : a.T.nome;
  if (jog.modo === 'sobre' && jog.sobre === a && !a.P.baia && jog.L.distanceTo(a.P.entrada) * a.esc > 1.5) { // anda por cima até a cabine e entra
    jog.modo = 'trans'; jog.trans = { ref: a, deL: jog.L.clone(), paraL: a.P.entrada.clone(), t: 0, dur: clamp(jog.L.distanceTo(a.P.entrada) * a.esc / 3.5, 0.4, 2.5), fim: () => { pilotar(a); mensagem('Pilotando: ' + nome, '', 1.6); } };
    return;
  }
  if (jog.modo === 'sobre' && jog.sobre === a && a.P.baia) { // cargueiro: atravessa a portinha da cabine
    jog.modo = 'trans'; jog.trans = { ref: a, deL: jog.L.clone(), paraL: V3().copy(a.P.entradaVoo || a.P.entrada).add(tmpV.set(0, 0, -0.6)), t: 0, dur: 1.1,
      fim: () => { pilotar(a); mensagem('Pilotando: ' + nome, '⊓ rampa · ⇪ volta pro baú' + (a === npc ? ' (piloto automático assume)' : ''), 2.5); } };
    return;
  }
  if (jog.modo === 'sobre') { pilotar(a); return mensagem('Pilotando: ' + nome, a === npc ? '⊓ rampa · ⇪ devolve ao piloto automático' : '', 2.2); } // em movimento: entra direto
  // anima o boneco subindo até a cabine
  jog.modo = 'trans'; jog.trans = { de: jog.pos.clone(), a, t: 0, dur: 0.7, arco: 0.9, fim: () => { pilotar(a); mensagem('Pilotando: ' + nome, a === npc ? 'Botão ⇪ devolve ao piloto automático' : '', 2); } };
}
function pular() {
  if (jog.modo === 'pe' && jog.noChao) { if (escalar()) return; jog.vel.y = 6; jog.noChao = false; return; }
  if (jog.modo === 'sobre' && jog.sobre.chao && jog.sobre.V < 2) { const a = jog.sobre; jog.pos.copy(a.obj.localToWorld(tmpV.copy(jog.L))); jog.modo = 'pe'; jog.noChao = false; jog.vel.set(-Math.sin(jog.yaw) * 2, 5, -Math.cos(jog.yaw) * 2); jog.ignorar = { a, t: 0.8 }; cam.iniciado = false; return; }
  if (jog.modo === 'sobre' && naBaia()) { if (!jog.hop) jog.hopV = 4.2; return; } // dentro do baú: pulinho, continua dentro
  if (jog.modo === 'sobre') { const a = jog.sobre; jog.pos.copy(a.obj.localToWorld(tmpV.copy(jog.L))); a.velocidade(jog.vel).add(tmpV.set(0, 4, 0).applyQuaternion(a.q)); jog.ignorar = { a, t: 1.2 }; jog.modo = 'queda'; jog.yaw = Math.atan2(-tmpV2.set(0, 0, -1).applyQuaternion(a.q).x, -tmpV2.z); cam.iniciado = false; mensagem('Pulou!', 'Abra o paraquedas (☂ / espaço)', 2); return; }
  if (jog.modo === 'queda') return paraquedas();
}
function naBaia() { const a = jog.sobre; return !!(a && a.P.baia && Math.abs(jog.L.x) < BAIA.meia + 0.3 && jog.L.z < BAIA.fim && jog.L.y < 0); } // só a parte de dentro; na rampa o pulo te leva pra fora
const posSobre = (out) => jog.sobre.obj.localToWorld(out.copy(jog.L).setY(jog.L.y + jog.hop / jog.sobre.esc)); // posição em cima do avião (com o pulinho)
function paraquedas() { if (jog.modo !== 'queda') return; jog.modo = 'paraquedas'; som.clique(); }
function garras() { jog.garras = !jog.garras; mensagem(jog.garras ? 'Garras ligadas' : 'Garras soltas', jog.garras ? 'Grudado no avião' : 'O vento pode te derrubar', 1.5); }
function prenderNaBaia() { // dentro do cargueiro: paredes, frente e rampa fechada seguram o boneco
  const c = jog.sobre || npc; if (!c.P.baia) return;
  const B = BAIA, e = c.esc, L = jog.L;
  if (L.z > B.frente && L.z < B.rampaFim && L.y < 0) {
    L.x = clamp(L.x, -B.meia + 0.35 / e, B.meia - 0.35 / e); L.z = Math.max(L.z, B.frente + 0.3 / e);
    if (c.abre < 0.9) L.z = Math.min(L.z, B.fim - 0.3 / e);
  }
}
const correndo = (k) => jog.correr || k.corre;
function fisicaPessoa(dt, k) {
  const inX = k.r, inY = k.p; // joystick: x vira/anda pro lado, y anda pra frente
  const andar = (ref, vel) => { // direção relativa à câmera
    const m = Math.hypot(inX, inY); if (m < 0.05) return 0;
    const ang = jog.camYaw + Math.atan2(-inX, inY); jog.yaw = lerpAng(jog.yaw, ang, 1 - Math.exp(-dt * 10));
    ref.x = -Math.sin(ang) * vel * Math.min(1, m); ref.z = -Math.cos(ang) * vel * Math.min(1, m); return Math.min(1, m) * vel;
  };
  if (jog.modo === 'gancho') return atualizarGancho(dt);
  if (jog.modo === 'trans') { // subindo/descendo da cabine
    const T = jog.trans; T.t += dt / T.dur; const u = Math.min(1, T.t), s = u * u * (3 - 2 * u);
    if (T.ref) { // andando dentro de um avião em movimento: tudo no referencial dele
      jog.L.copy(T.deL).lerp(T.paraL, s); jog.rapidez = 1.6; const d = tmpV.copy(T.paraL).sub(T.deL); jog.yaw = Math.atan2(-d.x, -d.z);
      jog.pos.copy(T.ref.obj.localToWorld(tmpV.copy(jog.L))); if (u >= 1) T.fim(); return;
    }
    const para = T.para || T.a.obj.localToWorld(tmpV3.copy(T.a.P.entrada));
    jog.pos.copy(T.de).lerp(para, s); jog.pos.y += Math.sin(u * Math.PI) * T.arco; jog.rapidez = 0;
    const d = tmpV.copy(para).sub(T.de); if (d.lengthSq() > 0.01) jog.yaw = Math.atan2(-d.x, -d.z);
    if (u >= 1) T.fim();
    return;
  }
  if (jog.modo === 'pe') {
    jog.poucoT -= dt; if (jog.ignorar) jog.ignorar.t -= dt;
    desencalhar();
    const h = M.chao(jog.pos.x, jog.pos.z), agua = h < -0.8, chao = agua ? -1.0 : h;
    const mv = { x: 0, z: 0 }; jog.rapidez = andar(mv, agua ? 2 : correndo(k) ? 12.5 : 5.5);
    jog.vel.x = mv.x; jog.vel.z = mv.z; jog.vel.y -= 9.8 * dt;
    // anda separando x e z: se bater num avião ou prédio, desliza pelo lado; degrau baixo de avião parado = sobe nele
    const x0 = jog.pos.x, z0 = jog.pos.z, y0 = jog.pos.y;
    const livre = () => !bloqueado(jog.pos) && !M.bateObst(jog.pos.x, jog.pos.z, 0.35);
    jog.pos.x += jog.vel.x * dt; if (!livre()) { if (subirEm()) return; jog.pos.x = x0; }
    jog.pos.z += jog.vel.z * dt; if (!livre()) { if (subirEm()) return; jog.pos.z = z0; }
    jog.pos.y += jog.vel.y * dt;
    if (!jog.noChao && jog.vel.y < 0 && pousarEmAviao(y0)) return; // pulou em cima de um avião
    if (jog.pos.y <= chao) { if (!jog.noChao && jog.vel.y < -4) jog.poucoT = 0.3; jog.pos.y = chao; jog.vel.y = 0; jog.noChao = true; }
  } else if (jog.modo === 'queda' || jog.modo === 'paraquedas') {
    if (jog.modo === 'queda') {
      jog.vel.y -= 9.8 * dt; jog.vel.multiplyScalar(1 - Math.min(0.5, jog.vel.length() * 0.00324 * dt));
      const mv = { x: 0, z: 0 }; andar(mv, 9); jog.vel.x += mv.x * dt; jog.vel.z += mv.z * dt;
      jog.rapidez = 0;
    } else {
      jog.yaw -= inX * 0.9 * dt; const f = 7 + Math.max(0, inY) * 4;
      jog.vel.x = lerp(jog.vel.x, -Math.sin(jog.yaw) * f, 1 - Math.exp(-dt * 1.5)); jog.vel.z = lerp(jog.vel.z, -Math.cos(jog.yaw) * f, 1 - Math.exp(-dt * 1.5));
      jog.vel.y = lerp(jog.vel.y, -4.5 + Math.max(0, -inY) * -2, 1 - Math.exp(-dt * 2)); jog.camYaw = lerpAng(jog.camYaw, jog.yaw, 1 - Math.exp(-dt * 2));
    }
    jog.pos.addScaledVector(jog.vel, dt); if (jog.ignorar) jog.ignorar.t -= dt;
    // pousar em cima de um avião (inclusive dentro do cargueiro)
    for (const a of frota) {
      if (!a.vivo || (jog.ignorar && jog.ignorar.a === a && jog.ignorar.t > 0) || a.pos.distanceToSquared(jog.pos) > (60 * a.esc) ** 2) continue;
      const L = a.obj.worldToLocal(tmpV.copy(jog.pos)), ys = a.P.superficies(L.x, L.z);
      for (const y of ys) if (L.y <= y + 0.05 && L.y > y - 2.5 / a.esc) { jog.modo = 'sobre'; jog.sobre = a; jog.L.copy(L).setY(y); jog.yaw = 0; jog.poucoT = 0.35; if (a === npc) prenderNaBaia(); mensagem('Aterrissou no ' + (a === npc ? 'cargueiro!' : 'avião!'), '', 2); cam.iniciado = false; return; }
    }
    const h = M.chao(jog.pos.x, jog.pos.z), agua = h < -0.8;
    if (jog.pos.y <= (agua ? -1 : h)) {
      const v = jog.vel.length();
      if (!agua && v > 15) { jog.vivo = false; jog.morteT = 0; mensagem('Splat!', 'Abra o paraquedas antes de chegar no chão', 3); fumaca.emitir(jog.pos, tmpV.set(0, 2, 0), tmpC.set(0x9a8a70), 2, 6, 0.6, 1.5); som.batida(0.4); pessoa.obj.visible = false; return; }
      if (agua) for (let i = 0; i < 20; i++) fumaca.emitir(tmpV.copy(jog.pos).setY(0.2), V3().randomDirection().multiplyScalar(4).setY(5), tmpC.set(0xf4fbff), 1, 4, 0.8, 1.2, 0.5, -9);
      jog.modo = 'pe'; jog.pos.y = agua ? -1 : h; jog.vel.set(0, 0, 0); jog.noChao = true; jog.poucoT = 0.4; desencalhar();
      if (!agua) mensagem('Aterrissou!', '', 1.2);
    }
  } else if (jog.modo === 'sobre') {
    const a = jog.sobre, e = a.esc;
    if (!a.vivo) return;
    jog.poucoT -= dt;
    const mv = { x: 0, z: 0 }; jog.rapidez = andar(mv, correndo(k) ? 5.5 : 2.6);
    up.set(0, 1, 0).applyQuaternion(a.q);
    const dentroBaia = a.P.baia && Math.abs(jog.L.x) < BAIA.meia && jog.L.z < BAIA.rampaFim && jog.L.y < 0;
    const vento = dentroBaia || a.chao ? 0 : smooth(18, 70, a.V);
    jog.vento = vento;
    let dx = mv.x * dt / e, dz = mv.z * dt / e;
    if (!jog.garras && !dentroBaia) { // sem garras o vento empurra pra trás; de cabeça pra baixo, cai
      dz += vento * (3 + Math.sin(tempo * 7) * 1.5) * dt / e; dx += Math.sin(tempo * 3.1) * vento * 0.6 * dt / e;
      if (up.y < 0.2 && vento > 0) return soltar(a);
    }
    // onde dá pra pisar: sobe degraus de até 1,15 m (asa -> fuselagem), peça mais alta é parede, sem nada é a borda
    const passo = (nx, nz) => { // peça que sobe acima do degrau e passa da cabeça = parede (ex.: deriva); oco do baú não conta
      const ys = a.P.superficies(nx, nz); if (!ys.length) return 'borda';
      const vao = vaoDaBaia(a, tmpV3.set(nx, jog.L.y + 0.1 / e, nz)), cab = jog.L.y + 1.75 / e;
      if (!vao && ys.some((y) => y > jog.L.y + 1.15 / e && fundoPeca(a, nx, y) < cab)) return 'parede';
      const ok = ys.filter((y) => y <= jog.L.y + 1.15 / e); return ok.length ? Math.max(...ok) : ys.every((y) => fundoPeca(a, nx, y) >= cab) ? 'borda' : 'parede'; }; // peça só lá em cima (deriva) não é chão
    const solta = !jog.garras && vento > 0; // sem garras e com vento: a borda derruba
    let r = passo(jog.L.x + dx, jog.L.z + dz);
    if (typeof r !== 'number' && Math.abs(dx) > 1e-7 && Math.abs(dz) > 1e-7) { // tenta deslizar só em x ou só em z
      const rx = passo(jog.L.x + dx, jog.L.z), rz = passo(jog.L.x, jog.L.z + dz);
      if (typeof rx === 'number') { dz = 0; r = rx; } else if (typeof rz === 'number') { dx = 0; r = rz; }
    }
    if (typeof r === 'number') { jog.L.x += dx; jog.L.z += dz; jog.L.y = r; }
    else if (r === 'borda' && a.chao && a.V < 2) { // avião parado: desce da borda pro chão
      jog.L.x += dx; jog.L.z += dz; jog.pos.copy(a.obj.localToWorld(tmpV.copy(jog.L))); jog.modo = 'pe'; jog.noChao = false; jog.vel.set(0, 0, 0); jog.ignorar = { a, t: 0.6 }; cam.iniciado = false; return;
    } else if (r === 'borda' && (solta || (a.P.baia && jog.L.z > BAIA.fim - 0.1))) { jog.L.x += dx; jog.L.z += dz; return soltar(a); } // ponta da rampa: cai pra fora
    prenderNaBaia();
    if (presos().length) { // não atravessa o avião guardado no baú
      let b = bloqueado(a.obj.localToWorld(tmpV.copy(jog.L)), a);
      if (b && !bloqueado(a.obj.localToWorld(tmpV.copy(jog.L)), a, 0.8)) { b = null; jog.agachado = 0.25; } // passa agachado por baixo da asa
      if (b && !bloqueado(a.obj.localToWorld(tmpV.copy(jog.L).sub(tmpV2.set(dx, 0, dz))), a)) { jog.L.x -= dx; jog.L.z -= dz; }
      else if (b) { jog.L.x -= dx; jog.L.z -= dz; const lado = Math.sign(jog.L.x - a.obj.worldToLocal(tmpV.copy(b.pos)).x) || 1; jog.L.x += lado * 6 * dt / e; } // ficou dentro (o avião andou até ele): é empurrado pro lado
    }
    const ys = a.P.superficies(jog.L.x, jog.L.z).filter((y) => y <= jog.L.y + 1.15 / e);
    if (!ys.length) { if (a.chao) { jog.modo = 'pe'; jog.noChao = false; jog.pos.copy(a.obj.localToWorld(tmpV.copy(jog.L))); return; } return soltar(a); }
    const yAlvo = Math.max(...ys); // degrau suave: sobe/desce andando, sem "pular" sozinho
    jog.L.y = yAlvo > jog.L.y ? Math.min(yAlvo, jog.L.y + 2.5 * dt / e) : Math.max(yAlvo, jog.L.y - 5 * dt / e);
    if (jog.hopV || jog.hop) { jog.hopV -= 9.8 * dt; jog.hop = Math.max(0, jog.hop + jog.hopV * dt); if (!jog.hop) jog.hopV = 0; }
    jog.pos.copy(posSobre(tmpV));
  }
}
function pousarEmAviao(yAnt) { // caindo/pulando: se passar por cima de uma superfície de avião, fica em pé nela
  for (const a of frota) {
    if (!a.vivo || (jog.ignorar && jog.ignorar.a === a && jog.ignorar.t > 0) || a.pos.distanceToSquared(jog.pos) > (60 * a.esc) ** 2) continue;
    const L = a.obj.worldToLocal(tmpV.copy(jog.pos)), La = a.obj.worldToLocal(tmpV3.copy(jog.pos).setY(yAnt));
    for (const y of a.P.superficies(L.x, L.z)) if (L.y <= y + 0.05 && La.y >= y - 0.3 / a.esc) {
      jog.modo = 'sobre'; jog.sobre = a; jog.L.copy(L).setY(y); jog.poucoT = 0.3; jog.vel.set(0, 0, 0);
      jog.yaw = 0; jog.camYaw = lerpAng(0, jog.camYaw, 1); cam.iniciado = false; prenderNaBaia(); return true;
    }
  }
  return false;
}
function subirEm() { // degrau baixo (até 0,9 m) de um avião parado: sobe andando
  const a = bloqueado(jog.pos); if (!a || a.V > 2) return false;
  const L = a.obj.worldToLocal(tmpV.copy(jog.pos)), feet = L.y;
  const ys = a.P.superficies(L.x, L.z).filter((y) => (y - feet) * a.esc <= 0.9 && y >= feet);
  if (!ys.length) return false;
  jog.modo = 'sobre'; jog.sobre = a; jog.L.copy(L).setY(Math.max(...ys)); jog.yaw = 0; cam.iniciado = false; return true;
}
function escalar() { // a pé, na frente de um avião parado: pula/escala até 3 m e fica em cima
  const f = tmpV2.set(-Math.sin(jog.yaw), 0, -Math.cos(jog.yaw));
  for (let d = 0.6; d <= 2.2; d += 0.4) {
    const p = V3().copy(jog.pos).addScaledVector(f, d);
    for (const a of frota) {
      if (!a.vivo || a.V > 2 || a.pos.distanceToSquared(p) > (25 * a.esc + 25) ** 2) continue;
      const L = a.obj.worldToLocal(V3().copy(p)), ys = a.P.superficies(L.x, L.z).filter((y) => (y - L.y) * a.esc <= 3.0 && y > L.y);
      if (!ys.length) continue;
      const topo = a.obj.localToWorld(V3().copy(L).setY(Math.max(...ys)));
      jog.modo = 'trans'; jog.trans = { de: jog.pos.clone(), para: topo, t: 0, dur: 0.75, arco: 0.8, fim: () => { jog.modo = 'sobre'; jog.sobre = a; jog.L.copy(a.obj.worldToLocal(V3().copy(topo))); jog.poucoT = 0.3; cam.iniciado = false; } };
      return true;
    }
  }
  return false;
}
function soltar(a) { jog.ignorar = { a, t: 1.2 }; jog.modo = 'queda'; jog.pos.copy(a.obj.localToWorld(tmpV.copy(jog.L))); a.velocidade(jog.vel); cam.iniciado = false; mensagem('Caiu do avião!', 'Abra o paraquedas (☂ / espaço)', 2.5); }
const lerpAng = (a, b, t) => { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * t; };

// ---------- Desafios (argolas e o cargueiro) ----------
let desafio = null;
const matArg = new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0xffa400, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.25 });
const matArgFraca = new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.35, depthWrite: false });
const DESAFIO_BAIA = { id: 'baia', nome: 'Entrar no Cargueiro', desc: 'Voe por trás do cargueiro gigante e pouse dentro dele.' };
const DESAFIO_CARGA = { id: 'carga', nome: 'Lançamento de Carga', desc: 'Num cargueiro, abra a rampa e solte caixas de paraquedas nos alvos (📦 ou tecla J).', inicio: { x: 2200, z: 2300, y: 260, rumo: 315 } };
const ALVOS_CARGA = [[700, 900], [-300, -250], [-1200, -900]]; // campo perto da vila, morro atrás da pista, vale dos balões
const caixas = [];
function soltarCarga(a) {
  if (!a || !a.P.baia) return; if (a.abre < 0.9) return mensagem('Abra a rampa primeiro', '⊓ rampa', 1.6);
  if (a.recargaCarga > 0) return; a.recargaCarga = 1.2;
  const g = new THREE.Group(); const cx = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x7a6038, roughness: 0.9 })); cx.castShadow = true; g.add(cx);
  for (const r of [0, Math.PI / 2]) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.44, 1.14, 0.12), new THREE.MeshStandardMaterial({ color: 0xc49a1a })); c.rotation.y = r; g.add(c); }
  const pq = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 6, 0, Math.PI * 2, 0, 1.15), new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.8, side: THREE.DoubleSide })); pq.position.y = 6; pq.scale.set(1, 0.6, 1); pq.visible = false; g.add(pq);
  const cordas = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([0, 1, 2, 3].flatMap((k) => [new THREE.Vector3(Math.cos(k * 1.57) * 3.6, 4.4, Math.sin(k * 1.57) * 3.6), new THREE.Vector3(0, 0.55, 0)])), new THREE.LineBasicMaterial({ color: 0x333333 })); cordas.visible = false; g.add(cordas);
  g.position.copy(a.obj.localToWorld(tmpV.set(0, BAIA.piso + 0.7, BAIA.fim + 1.5))); cena.add(g);
  caixas.push({ g, pq, cordas, v: a.velocidade(V3()).add(tmpV.set(0, 0, 3).applyQuaternion(a.q)), t: 0 }); som.clique(); mensagem('Carga lançada!', '', 1);
}
function atualizarCaixas(dt) {
  for (let i = caixas.length - 1; i >= 0; i--) {
    const c = caixas[i]; c.t += dt; const aberto = c.t > 1.2; c.pq.visible = c.cordas.visible = aberto;
    c.v.y -= 9.8 * dt; if (aberto) { c.v.multiplyScalar(1 - Math.min(1, 1.6 * dt)); c.v.y = Math.max(c.v.y, -6); } // paraquedas freia
    c.g.position.addScaledVector(c.v, dt); c.g.rotation.y += dt * 0.3;
    const h = Math.max(M.chao(c.g.position.x, c.g.position.z), 0);
    if (c.g.position.y - 0.55 <= h) {
      c.g.position.y = h + 0.55; c.pq.visible = c.cordas.visible = false; fumaca.emitir(c.g.position, tmpV.set(0, 2, 0), tmpC.set(0x9a8a70), 2, 7, 0.6, 1.5);
      if (desafio && desafio.d.id === 'carga') {
        const p = c.g.position, al = desafio.alvos[desafio.feitos]; const d = Math.hypot(p.x - al.x, p.z - al.z), pts = d < 15 ? 3 : d < 40 ? 2 : d < 90 ? 1 : 0;
        desafio.pontos += pts; mensagem(pts ? ['', 'Perto!', 'Muito bom!', 'Na mosca!'][pts] : 'Longe do alvo', `${Math.round(d)} m do centro · ${'⭐'.repeat(pts)}`, 2.5);
        if (pts) { cena.remove(al.g); desafio.feitos++; if (desafio.feitos >= desafio.alvos.length) terminarDesafio('carga'); }
      }
      setTimeout(() => cena.remove(c.g), 20000); caixas.splice(i, 1);
    }
  }
}
function previsaoCarga() { // onde a caixa cairia se soltasse agora (a caixa anda ~1,8 s na velocidade do avião antes de parar)
  const a = jog.aviao, al = desafio?.alvos?.[desafio.feitos]; if (!a || !al || !a.P.baia) return '';
  const per = 1.8 * a.V - 12, px = a.pos.x + a.dir.x * per, pz = a.pos.z + a.dir.z * per, // medido: a caixa anda 1,8 s na velocidade do avião, menos 12 m (sai da traseira)
    d = Math.hypot(px - al.x, pz - al.z);
  return d < 14 ? ' · <b style="color:#7dffa0">SOLTE!</b>' : d < 70 ? ' · <b>quase…</b>' : '';
}
function criarAlvoCarga(x, z) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  for (const [r, cor] of [[126, '#ffffff'], [100, '#e8322a'], [70, '#ffffff'], [40, '#e8322a'], [14, '#ffffff']]) { g.fillStyle = cor; g.beginPath(); g.arc(128, 128, r, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const gm = new THREE.CircleGeometry(45, 40); gm.rotateX(-Math.PI / 2); const p = gm.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, Math.max(M.chao(x + p.getX(i), z + p.getZ(i)), 0) + 0.4); // segue o relevo
  const m = new THREE.Mesh(gm, new THREE.MeshBasicMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -4 })); m.position.set(x, 0, z); cena.add(m);
  const fum = { x, z, g: m }; return fum;
}
const DESAFIO_COMBATE = { id: 'combate', nome: 'Combate Aéreo', desc: '3 caças inimigos te caçam. Derrube todos com tiros (✦/V) e mísseis (◆/M).', inicio: { x: 0, z: 2600, y: 900, rumo: 0 } };
const DESAFIO_PORTA = { id: 'porta', nome: 'Pouso no Porta-aviões', desc: 'Pouse no convés de 330 m no meio do mar. Motor no mínimo: o cabo segura.', inicio: { x: PORTA.x, z: PORTA.z + 3200, y: 200, rumo: 0 } };
const DESAFIO_TIRO = { id: 'tiro', nome: 'Tiro ao Alvo', desc: 'Com um caça, derrube os 12 balões-alvo. Botão ✦ ou tecla V atira.', inicio: { x: -1500, z: 2400, y: 320, rumo: 20 } };
function comecarDesafio(d) {
  pararDesafio();
  if (d.id === 'porta') { if (TIPOS[S.tipo].VS > 45) S.tipo = 'andorinha'; nascer({ ...d.inicio }); desafio = { d, aneis: [], i: 0, t: 0 }; mensagem(d.nome, 'Trem e flap baixados, devagar, alinhe com a linha branca', 4); return; }
  if (d.id === 'combate') {
    if (!TIPOS[S.tipo].armas) S.tipo = 'caca';
    nascer({ ...d.inicio }); limparInimigos(); jog.aviao.hp = 100; jog.aviao.misseis = jog.aviao.T.armas.misseis || 0; jog.aviao.V = Math.max(jog.aviao.V, jog.aviao.T.VS * 2);
    const ti = S.tipo === 'caca' ? 'caca' : 'guerra';
    for (const [x, z] of [[-500, -1400], [0, -1800], [500, -1500]]) criarInimigo(ti, x, z, 950 + Math.random() * 150, 180);
    desafio = { d, aneis: [], i: 0, t: 0 }; mensagem(d.nome, 'Eles vêm de frente! Aponte e atire', 3.5); return;
  }
  if (d.id === 'carga') {
    if (!TIPOS[S.tipo].criar || !['cargueiro'].includes(S.tipo)) S.tipo = 'cargueiro';
    nascer({ ...d.inicio }); const a = jog.aviao; a.portaAlvo = 1; a.abre = 1; a.V = 62;
    desafio = { d, aneis: [], i: 0, t: 0, feitos: 0, pontos: 0, alvos: ALVOS_CARGA.map(([x, z]) => criarAlvoCarga(x, z)) };
    mensagem(d.nome, 'Voe baixo (~150 m) e devagar, solte um pouco ANTES do alvo', 4); return;
  }
  if (d.id === 'tiro') {
    if (!TIPOS[S.tipo].armas) S.tipo = 'caca';
    nascer({ ...d.inicio }); criarAlvos(-1500, 1400, 12);
    desafio = { d, aneis: [], i: 0, t: 0, total: 12 };
    mensagem(d.nome, TOQUE ? 'Segure ✦ para atirar' : 'Segure V para atirar', 3.5); return;
  }
  if (d.id === 'baia') {
    for (const o of presos()) o.remover(); // recomeçar o desafio esvazia o baú (com o vão justo só cabe um avião)
    const f = tmpV.set(0, 0, -1).applyQuaternion(npc.q), p = npc.pos.clone().addScaledVector(f, -700).add(tmpV2.set(0, -8, 0));
    const rumo = (THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z)) + 360) % 360;
    if (S.tipo === 'cargueiro') S.tipo = 'andorinha';
    nascer({ x: p.x, z: p.z, y: p.y, rumo }); jog.aviao.pos.y = p.y; jog.aviao.V = npc.V + 8; jog.aviao.acel = 0.55;
    desafio = { d, aneis: [], i: 0, t: 0 };
    mensagem(d.nome, 'Baixe o trem, iguale a velocidade e entre pela rampa', 4); return;
  }
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
  desafio = { d, aneis, i: 0, t: 0 };
  nascer({ ...d.inicio });
  mensagem(d.nome, 'Passe por dentro das argolas douradas!', 3);
}
function pararDesafio() { if (!desafio) return; if (desafio.d.id === 'combate') limparInimigos(); if (desafio.alvos) for (const al of desafio.alvos) cena.remove(al.g); for (const a of desafio.aneis) cena.remove(a.g); if (desafio.d.id === 'tiro') limparAlvos(); desafio = null; $('missao').style.display = 'none'; }
function atualizarDesafio(dt, t) {
  if (!desafio) return; const D = desafio; if (jog.vivo) D.t += dt;
  D.aneis.forEach((a, k) => { a.g.visible = k >= D.i && k < D.i + 4; a.m.material = k === D.i ? matArg : matArgFraca; a.brilho.material.opacity = k === D.i ? 0.25 + 0.15 * Math.sin(t * 6) : 0; if (k === D.i) a.g.scale.setScalar(1 + 0.04 * Math.sin(t * 5)); });
  const a = D.aneis[D.i], av = jog.aviao; if (!a || !av || !jog.vivo || jog.modo !== 'piloto') return;
  const lado = tmpV.copy(av.pos).sub(a.c).dot(a.n);
  if (a.lado !== null && a.lado < 0 && lado >= 0) {
    const lat = tmpV.copy(av.pos).sub(a.c).addScaledVector(a.n, -lado).length();
    if (lat < a.R + 1) {
      D.i++; som.argola(D.i); for (let k = 0; k < 40; k++) fogo.emitir(a.c.clone().add(V3().randomDirection().multiplyScalar(a.R)), V3().randomDirection().multiplyScalar(8), tmpC.set(0xffd24a), 3, 0.5, 1, 0.8, 1);
      a.g.visible = false; if (D.i >= D.aneis.length) return terminarDesafio();
    }
  }
  a.lado = lado;
}
function terminarDesafio(esp) { // esp: 'baia' ou 'tiro' (pontuação só por tempo)
  const D = desafio; let n; const baia = esp === 'baia';
  if (esp === 'porta') n = D.t < 60 ? 3 : D.t < 120 ? 2 : 1;
  else if (esp === 'combate') n = (jog.aviao?.hp ?? 0) > 60 ? 3 : (jog.aviao?.hp ?? 0) > 25 ? 2 : 1;
  else if (esp === 'carga') n = Math.max(1, Math.round(D.pontos / 3));
  else if (esp) n = D.t < (baia ? 40 : 70) ? 3 : D.t < (baia ? 90 : 140) ? 2 : 1;
  else { const comp = D.aneis.reduce((s, a, i) => s + (i ? a.c.distanceTo(D.aneis[i - 1].c) : 0), 0), par = comp / 62 + 4; n = D.t <= par ? 3 : D.t <= par * 1.3 ? 2 : 1; }
  const t = D.t, rec = S.recordes[D.d.id], novo = !rec || t < rec.t; if (novo) { S.recordes[D.d.id] = { t, n }; salvar(); }
  if (!baia || esp === 'carga' || esp === 'combate' || esp === 'porta') mensagem(`${D.d.nome} completo!`, `${'⭐'.repeat(n)}  ${fmtT(t)}${novo ? ' · novo recorde!' : ` · recorde ${fmtT(rec.t)}`}`, 5);
  som.vitoria(); pararDesafio();
}
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

// ---------- Câmera ----------
const CAMS = ['Atrás', 'Cabine', 'Cinema', 'Lado'];
const cam = { modo: 0, q: new THREE.Quaternion(), iniciado: false, fixo: V3(), trocaT: 0, treme: 0 };
const cimaCam = V3(), alvoCam = V3();
function atualizarCamera(dt, t) {
  let fov = 60;
  if (jog.modo === 'piloto' || !jog.vivo && jog.aviao && jog.modo === 'piloto') {
    const a = jog.aviao, p = a.pos, e = Math.max(1, a.P.envergadura * a.esc / 10.5);
    fwd.set(0, 0, -1).applyQuaternion(a.q);
    if (!cam.iniciado) { cam.q.copy(a.q); cam.iniciado = true; cam.fixo.set(0, 0, 0); }
    a.P.piloto.visible = cam.modo !== 1;
    const vel01 = clamp(a.V / Math.min(a.T.vmax, 120), 0, 1);
    if (cam.modo === 0 || cam.modo === 3) {
      cam.q.slerp(a.q, 1 - Math.exp(-dt * (cam.modo === 0 ? 4 : 2.5)));
      const cf = tmpV.set(0, 0, -1).applyQuaternion(cam.q), cu = cimaCam.set(0, 1, 0).applyQuaternion(cam.q).lerp(EY, 0.65).normalize();
      const dist = ((cam.modo === 0 ? 15 : 13) + vel01 * 3) * e;
      const off = cam.modo === 0 ? tmpV2.copy(cf).multiplyScalar(-dist).addScaledVector(cu, 3.6 * e) : tmpV2.set(1, 0, 0).applyQuaternion(cam.q).multiplyScalar(dist).addScaledVector(cu, 2 * e).addScaledVector(cf, -3 * e);
      off.applyAxisAngle(EY, -ent.olhaX * Math.PI); off.applyAxisAngle(tmpV.set(1, 0, 0).applyQuaternion(cam.q), -ent.olhaY * 1.2);
      camera.position.copy(p).add(off); alvoCam.copy(p).addScaledVector(fwd, cam.modo === 0 ? 12 * e * (1 - Math.min(1, Math.abs(ent.olhaX) * 3)) : 0);
      camera.up.copy(cu); camera.lookAt(alvoCam); fov = 58 + vel01 * 12; camera.near = 0.5;
    } else if (cam.modo === 1) {
      camera.position.copy(a.P.piloto.localToWorld(tmpV.set(0, 0.48, -0.02)));
      camera.quaternion.copy(a.q); camera.rotateY(-ent.olhaX * Math.PI); camera.rotateX(-ent.olhaY * 1.2); camera.near = 0.08; fov = 70 + vel01 * 6;
    } else {
      const d = camera.position.distanceTo(p);
      if (cam.fixo.lengthSq() === 0 || d > 420 * e || t > cam.trocaT) {
        const lado = Math.random() < 0.5 ? -1 : 1;
        cam.fixo.copy(p).addScaledVector(a.dir, a.V * 4 + 60 * e).add(tmpV.set(1, 0, 0).applyQuaternion(a.q).setY(0).normalize().multiplyScalar(lado * (25 + Math.random() * 50) * e));
        cam.fixo.y = Math.max(cam.fixo.y + (Math.random() - 0.3) * 30, Math.max(M.chao(cam.fixo.x, cam.fixo.z), 0) + 4); cam.trocaT = t + 9;
      }
      camera.position.copy(cam.fixo); camera.up.copy(EY); camera.lookAt(p);
      fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(14 * e / Math.max(d, 1))), 8, 60); camera.near = 1;
    }
  } else { // a pé / caindo / em cima do avião: câmera de 3ª pessoa
    const quadro = (jog.modo === 'sobre' || (jog.modo === 'trans' && jog.trans.ref)) && jog.sobre ? jog.sobre.q : null;
    const yaw = jog.camYaw + ent.olhaX * Math.PI, pit = jog.camPit + ent.olhaY;
    const dist = jog.modo === 'paraquedas' ? 13 : jog.modo === 'queda' ? 7 : 4.2;
    const off = tmpV2.set(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)).multiplyScalar(dist);
    const ombro = jog.modo === 'pe' || jog.modo === 'sobre' ? 0.85 : 0; // câmera por cima do ombro direito: a mira (centro) fica livre, não em cima do boneco
    const alvo = tmpV3.copy(jog.pos).add(tmpV.set(Math.cos(yaw) * ombro, 1.55, -Math.sin(yaw) * ombro).applyQuaternion(quadro || tmpQ.identity()));
    if (quadro) off.applyQuaternion(quadro);
    camera.position.copy(alvo).add(off);
    const baia = (jog.modo === 'sobre' || jog.modo === 'trans') && jog.sobre?.P.baia && vaoDaBaia(jog.sobre, tmpV.copy(jog.L).setY(jog.L.y + 0.1)) ? jog.sobre : null;
    if (baia) { // dentro do baú: câmera presa entre paredes, piso e teto (não sai pela lateral)
      const Lc = baia.obj.worldToLocal(tmpV.copy(camera.position)), B = BAIA;
      Lc.x = clamp(Lc.x, -B.meia + 0.25, B.meia - 0.25); Lc.y = clamp(Lc.y, B.piso + 0.4, B.raio - 0.45); Lc.z = clamp(Lc.z, B.frente + 0.3, baia.abre > 0.9 ? B.rampaFim + 3 : B.fim - 0.3);
      camera.position.copy(baia.obj.localToWorld(Lc));
    } else for (let i = 0; i < 6 && (dentroDeAviao(camera.position) || M.dentroObst(camera.position)); i++) { off.multiplyScalar(0.72); camera.position.copy(alvo).add(off); } // não atravessa asa/fuselagem
    camera.up.copy(quadro ? tmpV.set(0, 1, 0).applyQuaternion(quadro).lerp(EY, 0.4).normalize() : EY);
    camera.lookAt(alvo); camera.near = 0.2; fov = 62 + (jog.modo === 'queda' ? clamp(jog.vel.length() / 55, 0, 1) * 14 : 0);
    if (jog.modo === 'queda' && Math.hypot(jog.vel.x, jog.vel.z) > 1) jog.camYaw = lerpAng(jog.camYaw, jog.yaw, 1 - Math.exp(-dt * 0.8));
  }
  const ch = Math.max(M.chao(camera.position.x, camera.position.z), 0) + 1.2; if (camera.position.y < ch) camera.position.y = ch;
  cam.treme = Math.max(cam.treme - dt * 2, 0); const av = jog.aviao;
  const tr = cam.treme + (jog.modo === 'piloto' && av ? Math.max(0, av.V - 0.85 * av.T.vmax) * 0.004 + Math.max(0, av.G - 3) * 0.02 : 0) + (jog.modo === 'sobre' ? (jog.vento || 0) * 0.5 : 0);
  if (tr > 0 && cam.modo !== 2) camera.position.add(tmpV.set(Math.sin(t * 61), Math.sin(t * 53), Math.sin(t * 47)).multiplyScalar(tr * 0.15));
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, cam.modo === 2 && jog.modo === 'piloto' ? 1 : 1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); atualizaEscala(); }
}

// ---------- Animação dos aviões ----------
const luzPouso = new THREE.SpotLight(0xfff2d8, 0, 700, 0.38, 0.5, 1); cena.add(luzPouso, luzPouso.target);
const corFumaca = new THREE.Color(), caudaAnt = V3(), cauda = V3();
function animarAero(a, dt, t, perto) {
  a.sincronizar(); const P = a.P;
  if (a.vivo && a.hp < 50 && Math.random() < 0.6) fumaca.emitir(a.pos, a.velocidade(tmpV).multiplyScalar(-0.2), tmpC.setRGB(0.18, 0.18, 0.18), 2, 14, 0.7, 3, 0.6, 1); // avião avariado solta fumaça preta
  for (const h of P.helices) { h.pas.rotation.z -= Math.min(a.rpm * 55 * dt / Math.sqrt(h.raio), 1.1); h.disco.material.opacity = smooth(0.25, 0.7, a.rpm) * 0.85; h.disco.rotation.z += dt * 3; }
  if (P.brasa) P.brasa.emissiveIntensity = 0.3 + a.acel * 2.5 + (Math.random() - 0.5) * 0.4;
  if (P.chama) { const ab = a.vivo && a.acel > 0.85 ? (a.acel - 0.85) / 0.15 : 0; P.chama.visible = ab > 0.01; P.chama.scale.set(0.8 + ab * 0.3, 0.8 + ab * 0.3, (0.5 + ab * 0.7) * (0.92 + Math.random() * 0.16)); }
  if (!perto) return;
  const e = a.ent, k = a.vivo ? 1 : 0;
  P.ailD?.userData.set(-e.r * 0.35 * k); P.ailE?.userData.set(-e.r * 0.35 * k);
  P.profD?.userData.set(-e.p * 0.4 * k); P.profE?.userData.set(e.p * 0.4 * k);
  P.leme?.userData.set((e.y + e.r * 0.2) * 0.4 * k);
  P.flapD?.userData.set(a.flap * 0.6); P.flapE?.userData.set(-a.flap * 0.6);
  P.manche?.rotation.set(-e.p * 0.3, 0, -e.r * 0.35);
  if (P.tremFixo) a.trem = a.tremAlvo = 1;
  if (a !== npc) a.trem += clamp(a.tremAlvo - a.trem, -dt / 2.2, dt / 2.2);
  for (const g of P.trem) { const ang = (1 - a.trem) * Math.PI / 2, u = g.userData;
    if (u.eixo === 'x') g.rotation.x = -ang; else if (u.eixo === 'z') g.rotation.z = -u.sinal * ang; else { u.y0 ??= g.position.y; g.position.y = u.y0 + (1 - a.trem) * u.sobe; }
    g.visible = u.eixo === 'y' || a.trem > 0.01; }
  if (a.chao) for (const r of P.rodas) r.rotation.x -= a.V / 0.35 * dt;
  if (P.piloto) { P.piloto.visible = a.comPiloto && !(a === jog.aviao && cam.modo === 1) || !!a.npc; P.piloto.children[1].rotation.y = -e.r * 0.5; P.piloto.children[2].rotation.y = -e.r * 0.5; }
  if (P.cachecol) { P.cachecol.rotation.z = Math.sin(t * 9) * 0.25; P.cachecol.rotation.x = Math.sin(t * 13) * 0.15; }
  const noite = M.noite, ciclo = (t + a.seed * 0.37) % 1.3, flash = ciclo < 0.05 || (ciclo > 0.14 && ciclo < 0.19);
  for (const s of [P.estD, P.estE]) s.scale.setScalar(flash ? s.userData.tam * (0.6 + noite) : 0.001);
  for (const s of [P.navD, P.navE, P.luzCauda]) s.scale.setScalar(s.userData.tam * (0.35 + noite * 1.2));
  P.beacon.scale.setScalar(P.beacon.userData.tam * Math.max(0, Math.sin(t * 6 + a.seed)) ** 4 * (0.5 + noite));
  if (P.luzSalto) P.luzSalto.visible = a.abre > 0.95;
  if (P.portinha) { const porta = P.entradaVoo || P.entrada, junto = jog.sobre === a && (jog.modo === 'sobre' || jog.modo === 'trans') && jog.L.distanceTo(porta) < 1.4;
    a.portCab = clamp((a.portCab || 0) + (junto ? dt : -dt) * 2.5, 0, 1); P.portinha.rotation.y = -a.portCab * 1.7; }
  P.lampFarol.visible = noite > 0.3 && a.trem > 0.5;
}
function efeitosJogador(a, dt, t) {
  fwd.set(0, 0, -1).applyQuaternion(a.q); up.set(0, 1, 0).applyQuaternion(a.q);
  luzPouso.intensity = M.noite > 0.3 && a.trem > 0.5 && a.vivo ? 140 * M.noite : 0;
  if (luzPouso.intensity) { a.obj.localToWorld(luzPouso.position.copy(a.P.lampFarol.position)); luzPouso.target.position.copy(luzPouso.position).addScaledVector(fwd, 60).addScaledVector(up, -8); }
  if (a.P.painel && (cam.modo === 1 || (t * 10 | 0) % 3 === 0)) {
    const r = tmpV2.set(1, 0, 0).applyQuaternion(a.q);
    desenhaPainel(a.P.painel, { vel: a.V * 3.6, alt: Math.max(0, a.pos.y), vs: a.vs, rol: Math.asin(clamp(-r.y, -1, 1)) * (up.y < 0 ? -1 : 1), arf: Math.asin(clamp(fwd.y, -1, 1)), rumo: rumoDe(a.q), rpm: a.rpm, trem: a.trem, flap: a.flap, estol: a.estol });
  }
  if (!a.vivo) return;
  cauda.copy(a.obj.localToWorld(tmpV.copy(a.P.cauda)));
  if (a.fumaca && !a.chao) {
    const cf = CORES_FUMACA[S.fumacaCor][1]; if (cf) corFumaca.set(cf); else corFumaca.setHSL((t * 0.15) % 1, 0.85, 0.6);
    const n = Math.ceil(caudaAnt.distanceTo(cauda) / 1.6);
    for (let i = 0; i < Math.min(n, 10); i++) fumaca.emitir(tmpV.copy(caudaAnt).lerp(cauda, (i + 1) / n), tmpV2.copy(a.dir).multiplyScalar(-2).add(tmpV3.randomDirection().multiplyScalar(0.6)), corFumaca, 2.2, 13, 0.85, 7, 0.6, 0.3);
  }
  caudaAnt.copy(cauda);
  if (a.T.motor !== 'jato' && Math.random() < a.acel * 0.5 && a.P.helices[0]) { const h = a.P.helices[0].h; fumaca.emitir(h.getWorldPosition(tmpV).addScaledVector(fwd, -1.5).addScaledVector(up, -0.2), tmpV2.copy(a.dir).multiplyScalar(-6), tmpC.setRGB(0.55, 0.55, 0.55), 0.3, 2, 0.25, 0.6, 2); }
  const forca = smooth(2.2, 4, a.G) + smooth(0.2, 1, a.flap) * smooth(20, 40, a.V) * 0.3;
  rastroD.passo(a.obj.localToWorld(tmpV.copy(a.P.pontaD)), up, forca); rastroE.passo(a.obj.localToWorld(tmpV.copy(a.P.pontaE)), up, forca);
}
const rumoDe = (q) => { const f = tmpV3.set(0, 0, -1).applyQuaternion(q); return (THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z)) + 360) % 360; };

// ---------- Som ----------
const som = (() => {
  let ctx = null, mot, mot2, filtro, gMot, vento, gVento, lfo, gLfo, mestre, jato, gJato, fJato;
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
    // turbina: chiado + assobio
    const bufB = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), db = bufB.getChannelData(0); for (let i = 0; i < db.length; i++) db[i] = Math.random() * 2 - 1;
    const ruido = ctx.createBufferSource(); ruido.buffer = bufB; ruido.loop = true; fJato = ctx.createBiquadFilter(); fJato.type = 'lowpass'; fJato.frequency.value = 800;
    jato = ctx.createOscillator(); jato.type = 'sine'; const gAs = ctx.createGain(); gAs.gain.value = 0.05; jato.connect(gAs);
    gJato = ctx.createGain(); gJato.gain.value = 0; ruido.connect(fJato); fJato.connect(gJato); gAs.connect(gJato); gJato.connect(mestre);
    mot.start(); mot2.start(); lfo.start(); vento.start(); ruido.start(); jato.start();
  };
  const bip = (f, t0, dur, tipo = 'sine', vol = 0.25) => { if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = tipo; o.frequency.value = f; g.gain.setValueAtTime(0, ctx.currentTime + t0); g.gain.linearRampToValueAtTime(vol, ctx.currentTime + t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur); o.connect(g); g.connect(mestre); o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.05); };
  const ruido = (dur, freq, vol) => { if (!ctx || vol < 0.01) return; const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2; n.buffer = buf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; const g = ctx.createGain(); g.gain.value = vol; n.connect(f); f.connect(g); g.connect(mestre); n.start(); };
  return {
    iniciar, mudo(m) { if (mestre) mestre.gain.value = m ? 0 : 0.55; },
    atualizar(a, dentro, aPe) {
      if (!ctx) return; const t = ctx.currentTime, r = a ? a.rpm : 0, vivo = a && a.vivo, distF = aPe && a ? smooth(600, 20, camera.position.distanceTo(a.pos)) : 1;
      const tipo = a ? a.T.motor : 'helice', helice = tipo !== 'jato';
      mot.frequency.setTargetAtTime((tipo === 'turbo' ? 55 : 32) + r * 62, t, 0.1); mot2.frequency.setTargetAtTime(16 + r * 31, t, 0.1); lfo.frequency.setTargetAtTime(9 + r * 30, t, 0.1);
      filtro.frequency.setTargetAtTime(dentro ? 300 + r * 500 : 400 + r * 1100, t, 0.1);
      gMot.gain.setTargetAtTime(vivo && helice ? (0.07 + r * 0.12) * distF : 0, t, 0.15);
      gJato.gain.setTargetAtTime(vivo && !helice ? (0.05 + r * 0.25 + (a.acel > 0.85 ? 0.15 : 0)) * distF : vivo && tipo === 'turbo' ? 0.04 * distF : 0, t, 0.2);
      fJato.frequency.setTargetAtTime(400 + r * 1800 + (a && a.acel > 0.85 ? 1200 : 0), t, 0.2); jato.frequency.setTargetAtTime(900 + r * 2600, t, 0.3);
      const vv = aPe ? (jog.modo === 'queda' ? jog.vel.length() : jog.modo === 'sobre' && jog.sobre ? jog.sobre.V : 0) : a ? a.V : 0;
      gVento.gain.setTargetAtTime(Math.min(0.55, (vv / 85) ** 2 * 0.4) * (dentro ? 0.5 : 1), t, 0.2);
    },
    argola(i) { [0, 4, 7].forEach((s, k) => bip(523 * 2 ** ((s + i % 5) / 12), k * 0.07, 0.35, 'triangle', 0.2)); },
    vitoria() { [0, 4, 7, 12, 16].forEach((s, k) => bip(392 * 2 ** (s / 12), k * 0.12, 0.6, 'triangle', 0.22)); },
    missil() { ruido(1.2, 1400, 0.5); }, flare() { ruido(0.25, 3000, 0.3); }, alerta() { bip(1250, 0, 0.09, 'square', 0.12); },
    tiro() { ruido(0.07, 2200, 0.16); },
    batida(v = 1) { ruido(1.6, 500, 1.2 * v); }, pneu() { ruido(0.35, 2500, 0.35); },
    clique() { bip(900, 0, 0.05, 'square', 0.06); }, descobre() { [0, 7, 12].forEach((s, k) => bip(659 * 2 ** (s / 12), k * 0.15, 0.8, 'sine', 0.18)); },
  };
})();

// ---------- Entrada ----------
const ent = { olhaX: 0, olhaY: 0 };
const teclas = new Set();
const pilotando = () => jog.modo === 'piloto' && jog.vivo;
addEventListener('keydown', (e) => {
  som.iniciar(); if (e.repeat) return; teclas.add(e.code);
  if (estado === 'titulo' && (e.code === 'Enter' || e.code === 'Space')) return comecar();
  if (e.code === 'Escape' || e.code === 'KeyP') return estado === 'menu' ? fecharMenu() : estado === 'voo' && abrirMenu();
  if (estado !== 'voo') return;
  const av = jog.aviao;
  const comum = { KeyC: proxCam, KeyH: modoFoto, KeyT: proxHora };
  const voo = { KeyN: () => soltarFlares(jog.aviao), KeyM: () => dispararMissil(jog.aviao), KeyJ: () => soltarCarga(jog.aviao), KeyG: trem, KeyF: flap, Space: fumacaToggle, KeyX: sair, KeyO: () => porta(jog.aviao), KeyL: soltarAviao };
  const pe = { KeyG: gancho, Space: pular, KeyE: entrar, KeyK: garras, KeyX: entrar, KeyO: () => porta(portaPerto()) };
  const f = comum[e.code] || (pilotando() ? voo : jog.vivo ? pe : {})[e.code];
  if (f) { e.preventDefault(); f(); }
});
addEventListener('keyup', (e) => teclas.delete(e.code));
addEventListener('blur', () => teclas.clear());
let mouseTiro = false; // no computador: botão do mouse atira com o fuzil a pé
addEventListener('mousedown', (e) => { if (e.button === 0 && e.target === canvas && estado === 'voo' && !pilotando()) mouseTiro = true; }); addEventListener('mouseup', () => (mouseTiro = false));
const tem = (...c) => c.some((k) => teclas.has(k));
function lerTeclado(dt) {
  const inv = S.inverter && pilotando() ? -1 : 1;
  const p = ((tem('KeyW', 'ArrowUp') ? 1 : 0) - (tem('KeyS', 'ArrowDown') ? 1 : 0)) * inv, r = (tem('KeyD', 'ArrowRight') ? 1 : 0) - (tem('KeyA', 'ArrowLeft') ? 1 : 0), y = (tem('KeyE') ? 1 : 0) - (tem('KeyQ') ? 1 : 0);
  const av = jog.aviao;
  if (pilotando() && av) {
    if (tem('ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd')) av.acel = Math.min(1, av.acel + dt * 0.6);
    if (tem('ControlLeft', 'ControlRight', 'Minus', 'NumpadSubtract', 'KeyZ')) av.acel = Math.max(0, av.acel - dt * 0.6);
  }
  return { p, r, y: pilotando() ? y : 0, freio: tem('KeyB'), atira: tem('KeyV') || (!pilotando() && mouseTiro), corre: !pilotando() && tem('ShiftLeft', 'ShiftRight') };
}
const toque = { stick: null, sx: 0, sy: 0, p: 0, r: 0, leme: 0, olha: null, ox: 0, oy: 0, freio: false };
const zona = $('zonaStick'), base = $('stickBase'), pino = $('stickPin');
zona.addEventListener('pointerdown', (e) => { som.iniciar(); if (toque.stick !== null) return; toque.stick = e.pointerId; zona.setPointerCapture(e.pointerId); const r = zona.getBoundingClientRect(); toque.sx = e.clientX; toque.sy = e.clientY; base.style.left = e.clientX - r.left + 'px'; base.style.top = e.clientY - r.top + 'px'; });
zona.addEventListener('pointermove', (e) => {
  if (e.pointerId !== toque.stick) return; const R = 56;
  let dx = (e.clientX - toque.sx) / R, dy = (e.clientY - toque.sy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  pino.style.transform = `translate(${dx * R}px,${dy * R}px)`;
  const curva = (v) => { const a = Math.abs(v) < 0.08 ? 0 : (Math.abs(v) - 0.08) / 0.92; return Math.sign(v) * (0.35 * a + 0.65 * a * a); };
  toque.r = curva(dx); toque.p = -curva(dy);
});
const soltaStick = (e) => { if (e.pointerId !== toque.stick) return; toque.stick = null; toque.p = toque.r = 0; base.style.left = base.style.top = pino.style.transform = ''; };
zona.addEventListener('pointerup', soltaStick); zona.addEventListener('pointercancel', soltaStick);
const acelEl = $('acel');
const poeAcel = (e) => { const r = acelEl.getBoundingClientRect(); if (jog.aviao && pilotando()) jog.aviao.acel = clamp(1 - (e.clientY - r.top - 10) / (r.height - 20), 0, 1); };
acelEl.addEventListener('pointerdown', (e) => { som.iniciar(); acelEl.setPointerCapture(e.pointerId); poeAcel(e); });
acelEl.addEventListener('pointermove', (e) => { if (acelEl.hasPointerCapture(e.pointerId)) poeAcel(e); });
canvas.addEventListener('pointerdown', (e) => { som.iniciar(); if (estado !== 'voo' || toque.olha !== null) return; toque.olha = e.pointerId; toque.ox = e.clientX; toque.oy = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== toque.olha) return;
  if (estado === 'voo' && !pilotando()) { jog.camYaw -= (e.clientX - toque.ox) / telaW() * 1.4 * Math.PI; jog.camPit = clamp(jog.camPit + (e.clientY - toque.oy) / telaH() * 1.2 * (S.inverter ? 1 : -1), -0.25, 1.2); toque.ox = e.clientX; toque.oy = e.clientY; return; } /* a pé: a câmera gira e fica */
  ent.olhaX = clamp(ent.olhaX + (e.clientX - toque.ox) / telaW() * 1.4, -1, 1); ent.olhaY = clamp(ent.olhaY + (e.clientY - toque.oy) / telaH(), -0.6, 0.6); toque.ox = e.clientX; toque.oy = e.clientY; });
const soltaOlha = (e) => { if (e.pointerId === toque.olha) toque.olha = null; };
canvas.addEventListener('pointerup', soltaOlha); canvas.addEventListener('pointercancel', soltaOlha);
const botao = (id, f) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); som.iniciar(); som.clique(); f(); });
botao('tTrem', () => trem()); botao('tFlap', () => flap()); botao('tFuma', () => fumacaToggle()); botao('tCam', () => proxCam()); botao('tSair', () => sair());
$('tAtirar').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); toque.atira = true; $('tAtirar').classList.add('on'); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('tAtirar').addEventListener(ev, () => { toque.atira = false; $('tAtirar').classList.remove('on'); });
botao('tMissil', () => dispararMissil(jog.aviao)); botao('tFlare', () => soltarFlares(jog.aviao));
botao('tCarga', () => soltarCarga(jog.aviao));
botao('tPorta', () => porta(pilotando() ? jog.aviao : portaPerto())); botao('tSoltar', () => soltarAviao());
botao('tPular', () => pular()); botao('tGancho', () => gancho());
$('tFuzil').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); toque.fuzil = true; $('tFuzil').classList.add('on'); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('tFuzil').addEventListener(ev, () => { toque.fuzil = false; $('tFuzil').classList.remove('on'); }); botao('tCorrer', () => { jog.correr = !jog.correr; }); botao('tEntrar', () => entrar()); botao('tGarras', () => garras()); botao('tParaq', () => paraquedas());
$('tFreio').addEventListener('pointerdown', (e) => { e.preventDefault(); toque.freio = true; $('tFreio').classList.add('on'); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('tFreio').addEventListener(ev, () => { toque.freio = false; $('tFreio').classList.remove('on'); });
document.querySelectorAll('[data-leme]').forEach((b) => {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); toque.leme = +b.dataset.leme; b.classList.add('on'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { toque.leme = 0; b.classList.remove('on'); });
});
$('bMenu').addEventListener('click', () => abrirMenu());

function trem() { const a = jog.aviao; if (a.P.tremFixo) return mensagem('Trem fixo', 'Este avião não recolhe as rodas', 1.4); if (a.chao && a.tremAlvo === 1) return mensagem('No chão não dá!', '', 1.2); a.tremAlvo = a.tremAlvo ? 0 : 1; mensagem(a.tremAlvo ? 'Trem baixado' : 'Trem recolhido', '', 1.2); }
function flap() { const a = jog.aviao; a.flap = a.flap === 0 ? 0.5 : a.flap === 0.5 ? 1 : 0; mensagem(`Flap ${Math.round(a.flap * 30)}°`, a.P.abrir ? (a.flap === 1 ? 'Rampa abrindo' : '') : '', 1.2); }
function fumacaToggle() { const a = jog.aviao; a.fumaca = !a.fumaca; caudaAnt.copy(a.obj.localToWorld(tmpV.copy(a.P.cauda))); }
function proxCam() { cam.modo = (cam.modo + 1) % CAMS.length; cam.fixo.set(0, 0, 0); ent.olhaX = ent.olhaY = 0; if (pilotando()) mensagem('Câmera: ' + CAMS[cam.modo], '', 1.2); }
function modoFoto() { document.body.classList.toggle('foto'); }
function renascer() {
  pessoa.obj.visible = false;
  if (desafio && desafio.d.id === 'baia') return comecarDesafio(desafio.d);
  if (desafio && (desafio.d.id === 'combate' || desafio.d.id === 'porta')) return comecarDesafio(desafio.d);
  if (desafio && desafio.d.id === 'tiro') return nascer({ ...desafio.d.inicio });
  if (desafio && desafio.d.id === 'carga') { nascer({ ...desafio.d.inicio }); jog.aviao.portaAlvo = 1; jog.aviao.abre = 1; return; }
  if (desafio && desafio.i > 0) { const a = desafio.aneis[desafio.i - 1], n = desafio.aneis[desafio.i] || a; const d = n.c.clone().sub(a.c); nascer({ x: a.c.x, z: a.c.z, y: a.c.y, rumo: THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z)) }); jog.aviao.pos.y = a.c.y; desafio.aneis.forEach((x) => (x.lado = null)); }
  else if (desafio) { nascer({ ...desafio.d.inicio }); desafio.aneis.forEach((x) => (x.lado = null)); }
  else nascer(jog.ondeNasce);
}

// ---------- Hora do dia ----------
let hora = { de: S.hora, para: S.hora, t: 1 };
function proxHora() { mudarHora((hora.para + 1) % HORAS.length); }
function mudarHora(i) { hora = { de: hora.para, para: i, t: 0 }; S.hora = i; salvar(); mensagem(HORAS[i].nome, '', 1.5); }
let envT = 0;
function atualizarHora(dt) { if (hora.t >= 1) return; hora.t = Math.min(1, hora.t + dt / 3); envT -= dt; if (envT <= 0 || hora.t >= 1) { M.aplicarHora(hora.de, hora.para, hora.t); envT = 0.25; } }

// ---------- Lugares ----------
function verLugares(p) {
  for (const l of LUGARES) {
    if (S.desc[l.id] || Math.hypot(p.x - l.x, p.z - l.z) > l.r) continue;
    S.desc[l.id] = 1; salvar(); som.descobre();
    const c = $('cartao'); c.innerHTML = `<div class="rot">lugar descoberto · ${Object.keys(S.desc).length}/${LUGARES.length}</div><b>${l.nome}</b><small>${l.desc}</small>`;
    c.classList.add('on'); clearTimeout(verLugares.t); verLugares.t = setTimeout(() => c.classList.remove('on'), 4500);
  }
}

// ---------- HUD ----------
const bus = $('bussola').getContext('2d'), mapaEl = $('mapa'), mapaG = mapaEl.getContext('2d');
const ALC = 7000, fundoMapa = document.createElement('canvas'); fundoMapa.width = fundoMapa.height = 200; M.miniMapa(fundoMapa, ALC);
const alvoEl = $('alvo');
let hudT = 0, modoBotoes = '';
function hud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.08;
  const a = jog.aviao, piloto = jog.modo === 'piloto', p = piloto && a ? a.pos : jog.pos;
  const vel = piloto && a ? a.V : jog.modo === 'sobre' && jog.sobre ? jog.sobre.V : jog.vel.length();
  $('vVel').textContent = Math.round(vel * 3.6); $('vAlt').textContent = Math.round(Math.max(0, p.y));
  $('linha2').textContent = piloto && a ? `${a.hp !== undefined && a.hp < 100 ? '♥ ' + Math.max(0, Math.round(a.hp)) + ' · ' : ''}${a.T.nome} · motor ${Math.round(a.acel * 100)}%${a.T.motor === 'jato' && a.acel > 0.85 ? ' 🔥' : ''} · ${a.vs >= 0 ? '▲' : '▼'}${Math.abs(a.vs).toFixed(1)} · ${a.G.toFixed(1)}G`
    : { gancho: 'gancho!', trans: '…', pe: (jog.hp < 100 ? '♥ ' + Math.max(0, Math.round(jog.hp)) + ' · ' : '') + 'a pé', queda: 'caindo!', paraquedas: 'paraquedas aberto', sobre: `em cima do ${jog.sobre === npc ? 'cargueiro' : 'avião'} · garras ${jog.garras ? 'presas' : 'soltas'}` }[jog.modo];
  if (a) { $('acelFill').style.height = a.acel * 100 + '%'; $('acelPct').textContent = Math.round(a.acel * 100) + '%'; $('tTrem').classList.toggle('on', a.tremAlvo === 1); $('tFlap').classList.toggle('on', a.flap > 0); $('tFuma').classList.toggle('on', a.fumaca); }
  $('tGarras').classList.toggle('on', jog.garras); $('tCorrer').classList.toggle('on', jog.correr);
  const m = piloto ? 'piloto' : 'ape';
  if (m !== modoBotoes) { modoBotoes = m; document.querySelectorAll('#botoes [data-m]').forEach((b) => (b.hidden = b.dataset.m !== m)); }
  $('tPorta').hidden = !(piloto && a && a.P.abrir) && !(!piloto && portaPerto()); $('tPorta').classList.toggle('on', !!(piloto ? a && a.portaAlvo : portaPerto()?.portaAlvo));
  $('tSoltar').hidden = !(piloto && a && a.preso);
  const vindo = piloto && a && misseis.some((m) => m.alvo === a);
  $('tFlare').hidden = !(piloto && a && a.T.armas && !a.preso); if (a?.T.armas) $('tFlare').querySelector('small').textContent = `flare ${a.flares ?? 30}`; $('tFlare').classList.toggle('on', !!vindo);
  $('tMissil').hidden = !(piloto && a && a.T.armas?.misseis && !a.preso); if (a?.T.armas?.misseis) $('tMissil').querySelector('small').textContent = `míssil ${a.misseis ?? a.T.armas.misseis}`;
  $('tCarga').hidden = !(piloto && a && a.P.baia && a.abre > 0.9 && !a.preso);
  $('tAtirar').hidden = !(piloto && a && a.T.armas && !a.preso);
  if (!piloto) { $('tGancho').hidden = !alvoGancho(); $('mira').style.display = jog.vivo && jog.modo !== 'gancho' ? 'block' : 'none'; } else $('mira').style.display = 'none';
  if (!piloto) { const ep = entrarPerto(); $('tEntrar').hidden = !ep; $('tEntrar').querySelector('small').textContent = ep === npc ? 'pilotar' : 'entrar'; $('tGarras').hidden = jog.modo !== 'sobre' || naBaia(); $('tParaq').hidden = jog.modo !== 'queda'; $('tPular').hidden = !(jog.modo === 'pe' || jog.modo === 'sobre'); }
  $('descobertos').textContent = `${Object.keys(S.desc).length}/${LUGARES.length} lugares`;
  const solo = p.y - Math.max(0, M.chao(p.x, p.z));
  if (vindo && (hud.bip = (hud.bip || 0) + 1) % 3 === 0) som.alerta();
  const av = !jog.vivo ? '' : vindo ? 'MÍSSIL! Solte flares (✺ / N) e faça curva fechada' : piloto && a ? (a.estol ? 'ESTOL — acelere e abaixe o nariz' : (!a.chao && solo < 60 && a.vs < -8 && !a.preso) ? 'CHÃO! Puxe!' : (!a.chao && a.tremAlvo === 0 && solo < 25 && a.V < 45) ? 'Baixe o trem (G)' : Math.max(Math.abs(p.x), Math.abs(p.z)) > MUNDO * 0.6 ? 'Volte para as ilhas' : '')
    : jog.modo === 'queda' && solo < 400 ? 'Abra o paraquedas!' : jog.modo === 'sobre' && jog.sobre !== npc && jog.sobre.vivo && solo < 150 && jog.sobre.vs < -5 ? 'O avião vai cair — pule!' : '';
  const aviso = $('aviso'); aviso.style.display = av ? 'block' : 'none'; aviso.textContent = av;
  // bússola
  const W = 280, H = 30, rm = piloto && a ? rumoDe(a.q) : ((THREE.MathUtils.radToDeg(-jog.camYaw) % 360) + 360) % 360; bus.clearRect(0, 0, W, H); bus.fillStyle = 'rgba(255,255,255,.75)'; bus.textAlign = 'center'; bus.font = '12px sans-serif';
  for (let d = Math.floor((rm - 50) / 5) * 5; d <= rm + 50; d += 5) { const x = W / 2 + (d - rm) * 2.6, n = ((d % 360) + 360) % 360;
    bus.fillRect(x - 0.5, 0, 1, n % 15 ? 3 : 6); if (n % 45 === 0) { bus.fillStyle = n % 90 ? 'rgba(255,255,255,.75)' : '#ffd05a'; bus.fillText({ 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' }[n], x, 22); bus.fillStyle = 'rgba(255,255,255,.75)'; } }
  bus.fillStyle = '#ffd05a'; bus.fillRect(W / 2 - 1, 0, 2, 9);
  const alvo = desafio && desafio.aneis[desafio.i];
  const trava = piloto && a ? alvoTravado(a) : null, inimPerto = desafio?.d.id === 'combate' ? inimigos.filter((x) => x.vivo).sort((x, y) => x.pos.distanceToSquared(p) - y.pos.distanceToSquared(p))[0] : null;
  $('alvo').classList.toggle('trava', !!trava);
  const alvoPos = desafio?.d.id === 'porta' ? tmpV2.set(PORTA.x, PORTA.h, PORTA.z + 140).clone() : trava ? trava.pos : inimPerto ? inimPerto.pos : alvo ? alvo.c : desafio && desafio.d.id === 'baia' ? npc.obj.localToWorld(V3().set(0, 0, BAIA.rampaFim)) : desafio && desafio.d.id === 'carga' && desafio.alvos[desafio.feitos] ? tmpV2.set(desafio.alvos[desafio.feitos].x, Math.max(M.chao(desafio.alvos[desafio.feitos].x, desafio.alvos[desafio.feitos].z), 0), desafio.alvos[desafio.feitos].z).clone() : desafio && desafio.d.id === 'tiro' && alvos.length ? alvos.reduce((m, al) => (al.g.position.distanceToSquared(p) < m.distanceToSquared(p) ? al.g.position : m), alvos[0].g.position) : null;
  if (alvoPos) { let d = THREE.MathUtils.radToDeg(Math.atan2(alvoPos.x - p.x, -(alvoPos.z - p.z))) - rm; d = ((d + 540) % 360) - 180; bus.beginPath(); bus.arc(W / 2 + clamp(d, -48, 48) * 2.6, 4, 3.5, 0, 7); bus.fill(); }
  const mi = $('missao');
  if (desafio) { mi.style.display = 'block'; mi.innerHTML = desafio.d.id === 'combate' ? `Combate · inimigos <b>${inimigos.filter((x) => x.vivo).length}/${inimigos.length}</b> · <b>${fmtT(desafio.t)}</b>` : desafio.d.id === 'carga' ? `Carga · alvo <b>${desafio.feitos + 1}/${desafio.alvos.length}</b> · <b>${desafio.pontos} pts</b> · ${Math.round(Math.hypot(p.x - desafio.alvos[Math.min(desafio.feitos, desafio.alvos.length - 1)].x, p.z - desafio.alvos[Math.min(desafio.feitos, desafio.alvos.length - 1)].z))} m${previsaoCarga()}` : desafio.d.id === 'baia' && guiaBaia() ? guiaBaia() : desafio.d.id === 'tiro' ? `Tiro ao Alvo · <b>${desafio.total - alvos.length}/${desafio.total}</b> · <b>${fmtT(desafio.t)}</b>` : desafio.d.id === 'baia' ? `Cargueiro · <b>${Math.round(npc.pos.distanceTo(p))} m</b> · <b>${fmtT(desafio.t)}</b>` : `${desafio.d.nome} · <b>${desafio.i + 1}/${desafio.aneis.length}</b> · <b>${fmtT(desafio.t)}</b>`; } else mi.style.display = 'none';
  if (alvoPos) {
    tmpV.copy(alvoPos).project(camera); const atras = tmpV.z > 1; let x = tmpV.x, y = tmpV.y; if (atras) { x = -x; y = -y; }
    const fora = atras || Math.abs(x) > 0.92 || Math.abs(y) > 0.88;
    if (fora) { const k = 0.9 / Math.max(Math.abs(x), Math.abs(y) / 0.95, 1e-3); x *= k; y *= k; }
    alvoEl.style.display = 'block'; alvoEl.classList.toggle('fora', fora);
    alvoEl.style.transform = `translate(${(x * 0.5 + 0.5) * telaW()}px,${(-y * 0.5 + 0.5) * telaH()}px)` + (fora ? ` rotate(${Math.atan2(x, y)}rad)` : '');
    alvoEl.querySelector('span').textContent = fora ? '' : (trava ? 'TRAVADO ' : '') + Math.round(alvoPos.distanceTo(p)) + ' m';
  } else alvoEl.style.display = 'none';
  // minimapa
  const S2 = 200; mapaG.save(); mapaG.clearRect(0, 0, S2, S2); mapaG.beginPath(); mapaG.arc(100, 100, 100, 0, 7); mapaG.clip();
  mapaG.fillStyle = '#0d3150'; mapaG.fillRect(0, 0, S2, S2);
  mapaG.translate(100, 100); mapaG.rotate(-THREE.MathUtils.degToRad(rm)); mapaG.scale(1.6, 1.6);
  mapaG.drawImage(fundoMapa, -100 - p.x / ALC * 100, -100 - p.z / ALC * 100);
  const pt = (x, z) => [(x - p.x) / ALC * 100, (z - p.z) / ALC * 100];
  for (const l of LUGARES) { const [x, z] = pt(l.x, l.z); mapaG.fillStyle = S.desc[l.id] ? '#fff' : 'rgba(255,255,255,.45)'; mapaG.beginPath(); mapaG.arc(x, z, 2.2, 0, 7); mapaG.fill(); }
  { const [x, z] = pt(npc.pos.x, npc.pos.z); mapaG.fillStyle = '#7fd0ff'; mapaG.fillRect(x - 2.5, z - 2.5, 5, 5); }
  if (desafio) desafio.aneis.forEach((r, k) => { if (k < desafio.i) return; const [x, z] = pt(r.c.x, r.c.z); mapaG.fillStyle = k === desafio.i ? '#ffd05a' : 'rgba(255,208,90,.5)'; mapaG.fillRect(x - 1.6, z - 1.6, 3.2, 3.2); });
  mapaG.restore();
  mapaG.fillStyle = '#ffd05a'; mapaG.beginPath(); mapaG.moveTo(100, 90); mapaG.lineTo(107, 108); mapaG.lineTo(100, 104); mapaG.lineTo(93, 108); mapaG.closePath(); mapaG.fill();
}

// ---------- Menu ----------
let estado = 'titulo', abaMenu = 'aviao';
const painel = $('painelMenu');
function abrirMenu() {
  if (estado !== 'voo') return; estado = 'menu'; document.body.classList.add('menu');
  const T = TIPOS[S.tipo];
  const avs = Object.entries(TIPOS).map(([id, t]) => `<button class="card${id === S.tipo && jog.aviao !== npc ? ' sel' : ''}" data-tipo="${id}"><b>${t.nome}</b><small>${t.desc}</small></button>`).join('') + `<button class="card${jog.aviao === npc ? ' sel' : ''}" data-gigante="1"><b>Cargueiro gigante</b><small>O NPC enorme: pilote, abra a rampa e leve aviões dentro.</small></button>`;
  const desafios = [DESAFIO_COMBATE, DESAFIO_PORTA, DESAFIO_BAIA, DESAFIO_TIRO, DESAFIO_CARGA, ...DESAFIOS].map((d) => { const r = S.recordes[d.id]; return `<button class="card" data-desafio="${d.id}"><b>${d.nome}</b><small>${d.desc}${r ? `<br>${'⭐'.repeat(r.n)} ${fmtT(r.t)}` : ''}</small></button>`; }).join('');
  const lugares = LUGARES.map((l) => `<button class="card" data-lugar="${l.id}"><b>${S.desc[l.id] ? '· ' : ''}${l.nome}</b><small>${l.desc}</small></button>`).join('');
  const pint = T.pinturas.map((p, i) => `<button class="card${i === S.pintura % T.pinturas.length ? ' sel' : ''}" data-pintura="${i}"><span class="bolinha" style="background:${p.base}"></span>${p.nome}</button>`).join('');
  const fum = CORES_FUMACA.map(([n, c], i) => `<button class="card${i === S.fumacaCor ? ' sel' : ''}" data-fumaca="${i}"><span class="bolinha" style="background:${c || 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)'}"></span>${n}</button>`).join('');
  const horas = HORAS.map((h, i) => `<button class="card${i === hora.para ? ' sel' : ''}" data-hora="${i}">${h.nome}</button>`).join('');
  const op = (id, txt, on) => `<button class="card${on ? ' sel' : ''}" data-op="${id}">${txt}</button>`;
  const ABAS = [['aviao', 'Avião'], ['desafios', 'Desafios'], ['lugares', 'Lugares'], ['visual', 'Visual'], ['opcoes', 'Opções']];
  const conteudo = {
    aviao: `<h3>Avião</h3><div class="grade">${avs}</div>
    <h3>Pintura</h3><div class="linha">${pint}</div>
    <h3>Fumaça</h3><div class="linha">${fum}</div>`,
    desafios: `<h3>Desafios</h3><div class="grade">${desafios}${desafio ? '<button class="card" data-parar="1"><b>Sair do desafio</b><small>Voltar ao voo livre</small></button>' : ''}</div>`,
    lugares: `<h3>Ir para</h3><div class="grade">${lugares}</div>`,
    visual: `<h3>Hora do dia</h3><div class="linha">${horas}</div>
    <h3>Filtro de imagem</h3><div class="linha">${FILTROS.map((f, i) => `<button class="card${i === S.filtro ? ' sel' : ''}" data-filtro="${i}">${f.nome}</button>`).join('')}</div>`,
    opcoes: `<h3>Opções</h3><div class="linha">${op('assist', 'Ajuda de voo (desligue para fazer tonneau)', S.assist)}${op('inverter', 'Controles invertidos (puxar pra trás sobe)', S.inverter)}${op('incl', 'Pilotar inclinando o celular', S.incl)}${op('som', 'Som', S.som)}${op('foto', 'Modo foto', document.body.classList.contains('foto'))}
      <button class="card" data-op="qual">Gráficos: ${{ alta: 'Bonito', media: 'Médio', baixa: 'Rápido' }[S.qual]}</button></div>
    <h3>Comandos</h3><small style="color:var(--sub);line-height:1.7;display:block">${TOQUE ? 'Bolinha da esquerda: manche ' + (S.inverter ? '(puxe para baixo para subir, como avião de verdade)' : '(para cima sobe)') + '; no chão/a pé: anda. Barra da direita: motor. Arraste a tela para olhar. ⇪ sai do avião — em voo você fica em cima dele com as garras ⋔. Sem garras o vento te derruba; ☂ abre o paraquedas.' : (S.inverter ? 'S sobe / W desce' : 'W sobe / S desce') + ' · A/D inclinar · Q/E leme · Shift/Ctrl motor · G trem · F flap · Espaço fumaça · B freio · X sair do avião · V atira · M míssil (caça a jato) · N flares · C câmera · T hora · H foto · Esc menu<br>A pé: WASD anda · Espaço pula/abre paraquedas · E entra · K garras · V ou clique atira com o fuzil · G gancho'}<br>Cargueiro gigante: chegue por trás na mesma velocidade, trem baixado, e pouse na rampa.</small>`
  };
  painel.innerHTML = `<div id="topoMenu"><div id="abas" role="tablist">${ABAS.map(([id, nome]) => `<button class="aba${id === abaMenu ? ' on' : ''}" role="tab" aria-selected="${id === abaMenu}" data-aba="${id}">${nome}</button>`).join('')}</div><button id="fechar">Continuar</button></div>
    <div id="conteudoAba" role="tabpanel">${conteudo[abaMenu]}</div>`;
  $('fechar').onclick = fecharMenu;
}
painel.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.id === 'fechar') return; som.clique(); const d = b.dataset;
  if (d.aba) { abaMenu = d.aba; estado = 'voo'; abrirMenu(); painel.scrollTop = 0; return; }
  if (d.tipo) { S.tipo = d.tipo; S.pintura = 0; salvar(); pararDesafio(); trocarAviao(); return fecharMenu(); }
  if (d.gigante) { pararDesafio(); if (!npc.vivo) return fecharMenu(); const v = jog.aviao; if (v && v !== npc && !v.preso && !v.estacionado) v.remover(); pilotar(npc); mensagem('Pilotando o cargueiro gigante', '⊓ abre/fecha a rampa · ⇪ devolve ao piloto automático', 3); return fecharMenu(); }
  if (d.desafio) { comecarDesafio([DESAFIO_COMBATE, DESAFIO_PORTA, DESAFIO_BAIA, DESAFIO_TIRO, DESAFIO_CARGA, ...DESAFIOS].find((x) => x.id === d.desafio)); return fecharMenu(); }
  if (d.parar) { pararDesafio(); return fecharMenu(); }
  if (d.lugar) { pararDesafio(); nascerLugar(LUGARES.find((x) => x.id === d.lugar)); return fecharMenu(); }
  if (d.pintura) { S.pintura = +d.pintura; salvar(); trocarAviao(); }
  if (d.fumaca) { S.fumacaCor = +d.fumaca; if (jog.aviao) jog.aviao.fumaca = true; }
  if (d.filtro) { S.filtro = +d.filtro; aplicarFiltro(); }
  if (d.hora) mudarHora(+d.hora);
  if (d.op === 'qual') { S.qual = { alta: 'baixa', media: 'alta', baixa: 'media' }[S.qual]; salvar(); recarregar('Gráficos: ' + { alta: 'Bonito', media: 'Médio', baixa: 'Rápido' }[S.qual]); return; }
  if (d.op === 'foto') { modoFoto(); return fecharMenu(); }
  if (d.op) { S[d.op] = !S[d.op]; if (d.op === 'som') som.mudo(!S.som); if (d.op === 'incl') { if (S.incl) ligarIncl(); else incl.ligado = false; } }
  salvar(); const sc = painel.scrollTop; estado = 'voo'; abrirMenu(); painel.scrollTop = sc;
});
function trocarAviao() { // troca o avião mantendo onde está
  const v = jog.aviao, noAr = v && v !== npc && !v.preso && jog.modo === 'piloto' && !v.chao && v.vivo;
  if (!v || !noAr) return nascerLugar(LUGARES[0]);
  const n = novoAviao(S.tipo); n.colocar(v.pos.x, v.pos.z, rumoDe(v.q), true, v.pos.y); n.pos.y = v.pos.y; n.V = Math.max(v.V, n.T.VS * 1.3);
  v.remover(); pilotar(n);
}
function fecharMenu() { // ao voltar do menu, a posição atual do celular vira o "centro" da inclinação
  if (incl.ligado) calibrarIncl(); estado = 'voo'; document.body.classList.remove('menu'); }

// ---------- Título e aviões estacionados ----------
$('dicas').textContent = TOQUE ? 'Bolinha da esquerda pilota · barra da direita acelera · ⇪ sai do avião' : (S.inverter ? 'S sobe, W desce' : 'W sobe, S desce') + ' · A/D inclina · Shift acelera · X sai do avião · Esc menu';
function comecar() {
  som.iniciar(); estado = 'voo'; document.body.classList.remove('titulo');
  nascerLugar(LUGARES[0]); cam.modo = 0; cam.iniciado = false;
  try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) {}
  if (!S.visto2) { S.visto2 = 1; salvar(); setTimeout(() => mensagem('Bem-vindo ao Céu Aberto!', TOQUE ? (S.inverter ? 'Suba a barra do motor e puxe a bolinha para baixo depois de 110 km/h' : 'Suba a barra do motor e puxe a bolinha para cima depois de 110 km/h') : (S.inverter ? 'Segure Shift para acelerar e S para subir depois de 110 km/h' : 'Segure Shift para acelerar e W para subir depois de 110 km/h'), 6), 600); }
}
$('bVoar').addEventListener('click', comecar);
const estacionados = [['caca', 140, -30, 1], ['guerra', 140, 45, 0], ['cargueiro', 160, 175, 0], ['andorinha', 140, 100, 2], ['tucano', 140, 250, 1], ['cessna', 135, 285, 0]];
for (const [t, x, z, pi] of estacionados) { const a = new Aero(t, pi); a.colocar(PISTA.x + x, z, 270, false); a.estacionado = a.fixo = true; a.ent.freio = true; } // fixo: os da exposição nunca são apagados
let titulo = null;
function voarSozinho(t) {
  if (!titulo) { titulo = jog.aviao || novoAviao(S.tipo); jog.aviao = titulo; }
  const a = titulo, ang = t * 0.06, R = 700, cx = 200, cz = 300;
  a.pos.set(cx + Math.cos(ang) * R, 230 + Math.sin(t * 0.3) * 20, cz + Math.sin(ang) * R);
  const tg = tmpV.set(-Math.sin(ang), 0, Math.cos(ang));
  a.q.setFromEuler(new THREE.Euler(0.04, Math.atan2(-tg.x, -tg.z), -0.32, 'YXZ'));
  a.V = 60; a.acel = 0.75; a.rpm = 0.8; a.trem = a.tremAlvo = 0; a.vivo = true; a.chao = false; a.comPiloto = true; a.dir.set(0, 0, -1).applyQuaternion(a.q); a.obj.visible = true;
  const k = t * 0.1; camera.position.copy(a.pos).add(tmpV.set(Math.cos(k) * 22, 5 + Math.sin(t * 0.2) * 4, Math.sin(k) * 22));
  camera.up.copy(EY); camera.lookAt(a.pos); if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); atualizaEscala(); }
}

// ---------- Laço principal ----------
M.aplicarHora(S.hora, S.hora, 1);
redimensionar();
$('carregando').style.opacity = 0; setTimeout(() => $('carregando').remove(), 700);
let ult = performance.now(), tempo = 0, lugT = 0;
function passo(dt) {
  tempo += dt;
  if (estado === 'titulo') voarSozinho(tempo);
  else {
    const k = lerTeclado(dt);
    const ti = incl.ligado && pilotando(); // inclinação soma com o manche
    const alvoP = clamp(k.p + (pilotando() && S.inverter ? -toque.p : toque.p) + (ti ? incl.p : 0), -1, 1), alvoR = clamp(k.r + toque.r + (ti ? incl.r : 0), -1, 1), alvoY = clamp(k.y + toque.leme, -1, 1);
    const av = jog.aviao;
    if (pilotando() && av) { const suave = 1 - Math.exp(-dt * (TOQUE ? 14 : 6)); av.ent.p = lerp(av.ent.p, alvoP, suave); av.ent.r = lerp(av.ent.r, alvoR, suave); av.ent.y = lerp(av.ent.y, alvoY, suave); av.ent.freio = k.freio || toque.freio; }
    else if (jog.vivo) fisicaPessoa(dt, { p: alvoP, r: alvoR, corre: k.corre });
    if (pilotando() && av && (k.atira || toque.atira)) atirar(av, dt);
    if (!pilotando() && (k.atira || toque.fuzil)) atirarFuzil(dt);
    if (toque.olha === null) { ent.olhaX *= 1 - Math.min(1, dt * 1.5); ent.olhaY *= 1 - Math.min(1, dt * 1.5); if (Math.abs(ent.olhaX) < 1e-3) ent.olhaX = 0; }
    if (!jog.vivo && (jog.morteT += dt) > 2.8) renascer();
    atualizarDesafio(dt, tempo);
    if ((lugT -= dt) < 0) { lugT = 0.5; verLugares(pilotando() ? av.pos : jog.pos); }
  }
  // todos os aviões: o cargueiro primeiro (os aviões guardados nele dependem dele), e a posição 3D atualizada logo após a física
  for (const a of [npc, ...frota.filter((f) => f !== npc)]) { atualizarAero(a, dt); a.sincronizar(); }
  if ((jog.modo === 'sobre' || (jog.modo === 'trans' && jog.trans.ref)) && jog.sobre && jog.vivo) jog.pos.copy(posSobre(tmpV)); // boneco acompanha o avião no mesmo quadro
  atualizarBalas(dt); atualizarCaixas(dt);
  if (M.vulcao && Math.random() < 0.5) fumaca.emitir(tmpV.copy(M.vulcao).add(tmpV2.set((Math.random() - 0.5) * 120, 10, (Math.random() - 0.5) * 120)), tmpV2.set(4, 14 + Math.random() * 6, 2), tmpC.setRGB(0.32, 0.3, 0.3), 30, 160, 0.55, 22, 0.05, 0.8); // coluna de fumaça do vulcão
  if (desafio?.d.id === 'porta' && jog.vivo && jog.aviao?.chao && M.naPorta(jog.aviao.pos.x, jog.aviao.pos.z) && jog.aviao.V < 3) terminarDesafio('porta');
  if (desafio?.d.id === 'combate' && jog.vivo && inimigos.length && inimigos.every((x) => !x.vivo)) terminarDesafio('combate');
  for (const x of inimigos) if (!x.vivo) x.morteT = 0; // não renascem if (jog.aviao?.recargaCarga > 0) jog.aviao.recargaCarga -= dt;
  for (let i = incendios.length - 1; i >= 0; i--) { const f = incendios[i]; f.t += dt; const k = 1 - f.t / f.vida; if (k <= 0) { incendios.splice(i, 1); continue; }
    if (Math.random() < 0.6 * k) fogo.emitir(tmpV.copy(f.p).add(tmpV2.set((Math.random() - 0.5) * 4 * f.f, 0, (Math.random() - 0.5) * 4 * f.f)), tmpV2.set(0, 4 + Math.random() * 4, 0), tmpC.setHSL(0.05 + Math.random() * 0.05, 1, 0.55), 3 * f.f, 1, 0.9, 0.8, 0.5, 2);
    if (Math.random() < 0.5) fumaca.emitir(tmpV.copy(f.p).add(tmpV2.set(0, 2 * f.f, 0)), tmpV2.set(1.5, 3, 0), tmpC.setRGB(0.15, 0.15, 0.15), 4 * f.f, 22 * f.f, 0.6 * k, 7, 0.2, 1.5); }
  for (const al of alvos) al.g.position.y = al.y0 + Math.sin(tempo * 0.8 + al.f) * 4;
  for (let i = destrocos.length - 1; i >= 0; i--) { const d = destrocos[i]; d.t += dt; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt); d.m.position.copy(d.p); d.m.rotation.x += d.r.x * dt * 8; d.m.rotation.y += d.r.y * dt * 8;
    if (Math.random() < 0.3) fumaca.emitir(d.p, tmpV.set(0, 1, 0), tmpC.set(0x333333), 1, 5, 0.5, 1.5);
    if (d.p.y < Math.max(0, M.chao(d.p.x, d.p.z)) || d.t > 8) { cena.remove(d.m); destrocos.splice(i, 1); } }
}
function atualizarAero(a, dt) {
  if (a.P.abrir) { a.abre = clamp(a.abre + clamp((a.portaAlvo || 0) - a.abre, -dt * 0.3, dt * 0.3), 0, 1); a.P.abrir(a.abre); a.P.rampaAberta = a.abre > 0.9; }
  if (a.npc && !a.vivo) { a.morteT = (a.morteT || 0) + dt; if (a.morteT > 8) { a.vivo = true; a.obj.visible = true; a.comPiloto = false; a.npc.blend = 0; a.npc.altAtual = undefined; if (a === npc) a.portaAlvo = 1; } return; }
  if (a.npc && !a.comPiloto) { voarNPC(a, dt); return; }
  if (a === titulo && estado === 'titulo') return;
  if (a.preso) { if (npc.vivo) presoNoNPC(a, dt); return; }
  if (!a.vivo) { a.morteT = (a.morteT || 0) + dt; if (a !== jog.aviao && a.morteT > 6) a.remover(); return; }
  if (a.estacionado && a.chao && a.V < 0.01 && !a.comPiloto) return;
  if (a.inimigo) { if (!a.vivo) return; pilotarInimigo(a, dt); }
  if (!a.comPiloto) { a.ent.p = a.ent.r = a.ent.y = 0; }
  fisica(a, dt / 2, tempo); if (a.vivo) fisica(a, dt / 2, tempo);
  checarBaia(a, dt);
  if (a.vivo && !a.npc && M.dentroObst(a.pos)) return bater(a, false, a === jog.aviao ? 'Bateu no prédio!' : null);
  if (a === jog.aviao && a.vivo && !a.chao) { colisaoNoAr(a); if (a.vivo && a.esc > 1 && tocaChao(a)) bater(a, false, 'O cargueiro bateu!'); }
  a.estacionado = a.chao && a.V < 0.5 && !a.comPiloto && !a.preso;
}
function quadro(agora) {
  requestAnimationFrame(quadro);
  const dt = Math.min((agora - ult) / 1000, 0.05); ult = agora;
  if (estado === 'menu') { renderer.render(cena, camera); return; }
  passo(dt);
  atualizarHora(dt);
  for (const a of frota) if (a.vivo) animarAero(a, dt, tempo, a.pos.distanceToSquared(camera.position) < (900 * a.esc) ** 2);
  if (jog.aviao) efeitosJogador(jog.aviao, dt, tempo);
  if (jog.modo !== 'piloto' && jog.vivo) {
    pessoa.obj.position.copy(jog.pos);
    if ((jog.modo === 'sobre' || (jog.modo === 'trans' && jog.trans.ref)) && jog.sobre) { pessoa.obj.quaternion.copy(jog.sobre.q).multiply(tmpQ.setFromAxisAngle(EY, jog.yaw)); }
    else pessoa.obj.quaternion.setFromAxisAngle(EY, jog.yaw);
    const pose = jog.modo === 'gancho' ? 'pulo' : jog.modo === 'trans' ? (jog.trans.ref ? 'pe' : 'subindo') : jog.poucoT > 0 && (jog.modo === 'pe' || jog.modo === 'sobre') ? 'pouso' : jog.modo === 'pe' && !jog.noChao ? 'pulo' : jog.modo;
    jog.agachado = Math.max(0, (jog.agachado || 0) - dt);
    if (jog.agachado > 0 && jog.modo === 'sobre') animarPessoa(pessoa, 'sobre', jog.rapidez, tempo, dt, true, 1); // andando agachado
    else animarPessoa(pessoa, pose, jog.rapidez, tempo, dt, jog.garras, jog.vento);
  }
  if (estado === 'voo' && !window.__camLivre) atualizarCamera(dt, tempo);
  for (const f of M.animar) f(tempo);
  M.atualizarPerto(camera.position, jog.modo !== 'piloto' || !jog.aviao || jog.aviao.V < 25); // rasante rápido: sem grama (pesava no celular)
  M.uAgua.value = tempo;
  fumaca.atualizar(dt); fogo.atualizar(dt);
  M.ceu.position.copy(camera.position);
  const foco = jog.modo === 'piloto' && jog.aviao ? jog.aviao.pos : jog.pos;
  M.sol.position.copy(foco).addScaledVector(M.solDir, 200); M.sol.target.position.copy(foco);
  if ((msgT -= dt) < 0) $('msg').classList.remove('on');
  hud(dt); som.atualizar(jog.aviao, cam.modo === 1 && pilotando(), !pilotando());
  renderer.render(cena, camera);
}
requestAnimationFrame(quadro);
document.addEventListener('visibilitychange', () => { if (document.hidden && estado === 'voo') abrirMenu(); ult = performance.now(); });

// testes automáticos
const simular = (seg, e = {}) => { const a = jog.aviao; toque.p = e.p || 0; toque.r = e.r || 0; toque.leme = e.y || 0; toque.freio = !!e.freio; if (e.acel !== undefined) a.acel = e.acel; const log = []; for (let i = 0; i < seg * 60; i++) { passo(1 / 60); if (i % 60 === 0) log.push([Math.round(a.V * 3.6), Math.round(a.pos.y), a.chao ? 'chão' : 'ar', jog.modo].join(' ')); if (!jog.vivo) break; } toque.p = toque.r = toque.leme = 0; toque.freio = false; return log.join(' | ') + (jog.vivo ? '' : ' | MORREU'); };
window.__jogo = { pessoa, cameraJa: () => atualizarCamera(1 / 60, tempo), bloqueado: (p, i) => bloqueado(p, i), incl, M, chao: (x, z) => M.chao(x, z), simular, passo, jog, npc, frota, cam, camera, comecar, mudarHora, comecarDesafio, nascerLugar, DESAFIOS, DESAFIO_BAIA, DESAFIO_TIRO, DESAFIO_CARGA, DESAFIO_COMBATE, DESAFIO_PORTA, inimigos, dispararMissil, alvoTravado, misseis, balas, soltarCarga, soltarFlares, flares, atirarFuzil, gancho, alvoGancho, caixas, previsaoCarga: () => previsaoCarga(), LUGARES, ent, proxCam, sair, pular, paraquedas, garras, entrar, S, horaJa: (i) => { hora = { de: i, para: i, t: 1 }; M.aplicarHora(i, i, 1); } };
