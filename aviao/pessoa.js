// Piloto a pé: corpo articulado (joelho, cotovelo, pescoço), rosto, macacão com detalhes,
// botas com garras magnéticas, paraquedas — e animações que se misturam suavemente.
import * as THREE from '../lib/three.module.min.js';

export function criarPessoa() {
  const raiz = new THREE.Group();
  const m = (c, r = 0.75, mt = 0.05, e = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt, ...e });
  const macacao = m('#5d6747'), escuro = m('#454d34'), pele = m('#d6a07a', 0.6), luva = m('#1c1c1c', 0.6), bota = m('#2b231d', 0.7), sola = m('#121212', 0.9);
  const cinta = m('#2f3a52', 0.6), fivela = m('#c9ccd0', 0.25, 0.9), capM = m('#ecebe6', 0.35), visM = m('#141820', 0.05, 0.95), mochila = m('#3a4436');
  const cap = (r, l, mat, seg = 10) => { const g = new THREE.CapsuleGeometry(r, l, 4, seg); g.translate(0, -l / 2 - r, 0); return new THREE.Mesh(g, mat); };
  const caixa = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const J = {}; // juntas
  const junta = (nome, pai, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); pai.add(g); J[nome] = g; return g; };

  const quadril = junta('quadril', raiz, 0, 0.98, 0);
  const bacia = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), macacao); bacia.scale.set(1.15, 0.75, 0.85); quadril.add(bacia);
  const cinto = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 6, 20), cinta); cinto.rotation.x = Math.PI / 2; cinto.position.y = 0.07; quadril.add(cinto);
  const fiv = caixa(0.06, 0.045, 0.02, fivela); fiv.position.set(0, 0.07, -0.16); quadril.add(fiv);
  // tronco
  const tronco = junta('tronco', quadril, 0, 0.08, 0);
  const barriga = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.14, 4, 12), macacao); barriga.position.y = 0.12; barriga.scale.set(1.12, 1, 0.85); tronco.add(barriga);
  const peito = junta('peito', tronco, 0, 0.26, 0);
  const torax = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.16, 4, 14), macacao); torax.position.y = 0.1; torax.scale.set(1.3, 1, 0.82); peito.add(torax);
  const ziper = caixa(0.012, 0.36, 0.01, fivela); ziper.position.set(0.02, 0.04, -0.128); peito.add(ziper);
  for (const s of [-1, 1]) {
    const bolso = caixa(0.09, 0.08, 0.02, escuro); bolso.position.set(s * 0.1, 0.15, -0.122); peito.add(bolso);
    const aba = caixa(0.095, 0.025, 0.025, escuro); aba.position.set(s * 0.1, 0.195, -0.125); peito.add(aba);
    const alca = caixa(0.04, 0.42, 0.02, cinta); alca.position.set(s * 0.085, 0.05, -0.135); alca.rotation.z = s * 0.12; peito.add(alca); // arnês
    const alcaC = caixa(0.04, 0.4, 0.02, cinta); alcaC.position.set(s * 0.085, 0.08, 0.13); peito.add(alcaC);
  }
  const peitoral = caixa(0.24, 0.035, 0.02, cinta); peitoral.position.set(0, 0.06, -0.142); peito.add(peitoral);
  const fv2 = caixa(0.05, 0.05, 0.02, fivela); fv2.position.set(0, 0.06, -0.152); peito.add(fv2);
  // etiqueta com nome e bandeira no ombro
  const etq = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), new THREE.MeshBasicMaterial({ map: texNome() })); etq.position.set(-0.1, 0.2, -0.134); etq.rotation.y = Math.PI; peito.add(etq);
  // mochila do paraquedas com puxador
  const pack = caixa(0.26, 0.34, 0.1, mochila); pack.position.set(0, 0.1, 0.165); peito.add(pack);
  const tampa = caixa(0.27, 0.05, 0.11, m('#33404f')); tampa.position.set(0, 0.27, 0.165); peito.add(tampa);
  const puxa = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 12), m('#d23a2a', 0.4)); puxa.position.set(0.12, -0.02, -0.15); peito.add(puxa);
  // pescoço e cabeça com rosto
  const pescoco = junta('pescoco', peito, 0, 0.3, 0);
  const pesc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.08, 10), pele); pesc.position.y = 0.03; pescoco.add(pesc);
  const gola = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.018, 6, 14), macacao); gola.rotation.x = Math.PI / 2; gola.position.y = -0.005; pescoco.add(gola);
  const cabeca = junta('cabeca', pescoco, 0, 0.08, 0);
  const cranio = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), pele); cranio.scale.set(0.95, 1.12, 1.05); cranio.position.y = 0.1; cabeca.add(cranio);
  const queixo = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), pele); queixo.scale.set(1.1, 0.8, 1); queixo.position.set(0, 0.035, -0.04); cabeca.add(queixo);
  const nariz = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 6), pele); nariz.rotation.x = -Math.PI / 2 - 0.3; nariz.position.set(0, 0.09, -0.11); cabeca.add(nariz);
  const branco = m('#f4f2ee', 0.4), pupila = m('#2a1b10', 0.3);
  for (const s of [-1, 1]) {
    const olho = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), branco); olho.position.set(s * 0.036, 0.115, -0.093); cabeca.add(olho);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), pupila); pu.position.set(s * 0.036, 0.115, -0.108); cabeca.add(pu);
    const sob = caixa(0.035, 0.008, 0.01, m('#3a2a1e')); sob.position.set(s * 0.036, 0.142, -0.1); sob.rotation.z = -s * 0.15; cabeca.add(sob);
    const orelha = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), pele); orelha.scale.set(0.5, 1, 0.8); orelha.position.set(s * 0.097, 0.1, 0); cabeca.add(orelha);
  }
  const boca = caixa(0.035, 0.007, 0.01, m('#8a4a3a')); boca.position.set(0, 0.05, -0.098); cabeca.add(boca);
  const cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.104, 14, 10, 0, Math.PI, Math.PI * 0.3, Math.PI * 0.4), m('#3a2618', 0.9)); cabelo.position.y = 0.1; cabeca.add(cabelo);
  // capacete com faixa e viseira
  const capacete = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), capM); capacete.position.set(0, 0.115, 0.01); capacete.rotation.x = 0.18; cabeca.add(capacete);
  const faixa = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20, Math.PI), m('#d23a2a', 0.4)); faixa.rotation.set(0, Math.PI / 2, Math.PI / 2); faixa.position.set(0, 0.12, 0.01); cabeca.add(faixa);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, -Math.PI * 0.78, Math.PI * 0.56, Math.PI * 0.3, Math.PI * 0.18), visM); visor.position.set(0, 0.115, 0.005); cabeca.add(visor); J.visor = visor;
  // braços: ombro -> cotovelo -> mão (com polegar)
  const braco = (s) => {
    const om = junta(s > 0 ? 'ombroD' : 'ombroE', peito, s * 0.2, 0.2, 0);
    const ombreira = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), macacao); om.add(ombreira);
    if (s < 0) { const band = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.04), new THREE.MeshBasicMaterial({ map: texBandeira(), side: THREE.DoubleSide })); band.position.set(-0.066, -0.06, 0); band.rotation.y = -Math.PI / 2; om.add(band); }
    om.add(cap(0.052, 0.2, macacao));
    const co = junta(s > 0 ? 'cotoveloD' : 'cotoveloE', om, 0, -0.29, 0);
    co.add(cap(0.045, 0.18, macacao));
    const pulso = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), luva); pulso.position.y = -0.22; co.add(pulso);
    const mao = junta(s > 0 ? 'maoD' : 'maoE', co, 0, -0.26, 0);
    const palma = caixa(0.07, 0.09, 0.035, luva); palma.position.y = -0.04; mao.add(palma);
    const dedos = caixa(0.065, 0.05, 0.03, luva); dedos.position.set(0, -0.1, -0.008); dedos.rotation.x = -0.35; mao.add(dedos);
    const pol = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.035, 3, 6), luva); pol.position.set(-s * 0.038, -0.045, -0.02); pol.rotation.z = s * 0.6; mao.add(pol);
  };
  braco(1); braco(-1);
  // pernas: quadril -> joelho -> tornozelo (bota com sola, cadarço e garras)
  const garras = [];
  const perna = (s) => {
    const cx = junta(s > 0 ? 'coxaD' : 'coxaE', quadril, s * 0.095, -0.03, 0);
    cx.add(cap(0.07, 0.3, macacao));
    const laco = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.014, 6, 16), cinta); laco.rotation.x = Math.PI / 2; laco.position.y = -0.1; cx.add(laco);
    const bolsoP = caixa(0.03, 0.12, 0.09, escuro); bolsoP.position.set(s * 0.075, -0.2, 0); cx.add(bolsoP);
    const jo = junta(s > 0 ? 'joelhoD' : 'joelhoE', cx, 0, -0.44, 0);
    const joelheira = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), escuro); joelheira.scale.set(1, 0.9, 0.7); joelheira.position.z = -0.03; jo.add(joelheira);
    jo.add(cap(0.058, 0.3, macacao));
    const to = junta(s > 0 ? 'tornD' : 'tornE', jo, 0, -0.43, 0);
    const cano = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.064, 0.13, 10), bota); cano.position.y = 0.01; to.add(cano);
    const pe = caixa(0.11, 0.08, 0.25, bota); pe.position.set(0, -0.06, -0.05); to.add(pe);
    const bico = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), bota); bico.scale.set(1, 0.72, 1); bico.position.set(0, -0.065, -0.16); to.add(bico);
    const so = caixa(0.115, 0.022, 0.29, sola); so.position.set(0, -0.105, -0.06); to.add(so);
    for (let k = 0; k < 3; k++) { const c = caixa(0.07, 0.006, 0.008, m('#c9b48a')); c.position.set(0, -0.015 - k * 0.025, -0.115 + k * 0.03); to.add(c); }
    const gr = new THREE.Group(); gr.position.set(0, -0.12, -0.06); to.add(gr); // garras magnéticas
    const azul = m('#9fd8ff', 0.2, 0.9, { emissive: 0x2a9dff, emissiveIntensity: 0.9 });
    for (let k = -1; k <= 1; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 5), azul); c.rotation.x = Math.PI; c.position.set(k * 0.035, -0.02, -0.12); gr.add(c);
      const c2 = c.clone(); c2.position.z = 0.1; gr.add(c2); }
    const placa = caixa(0.1, 0.012, 0.26, azul); placa.position.y = 0.005; gr.add(placa);
    garras.push(gr);
  };
  perna(1); perna(-1);
  // paraquedas tipo asa (ram-air): células coloridas em arco, cordas até os ombros
  const pq = new THREE.Group(); pq.visible = false; raiz.add(pq);
  const vel = new THREE.Group(); vel.position.y = 6.3; pq.add(vel);
  { const N = 9, P = 14, R = 7, A0 = 0.5, corda = 3.0, cores = ['#ff6b35', '#f4f4f0', '#1d4fa3'].map((h) => new THREE.Color(h));
    const sec = []; for (let i = 0; i < P; i++) { const t = i / P * Math.PI * 2, x = (1 - Math.cos(t)) / 2; const esp = 0.13 * Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.pow(x, 0.7)))); sec.push([x * corda - corda * 0.35, (Math.sin(t) >= 0 ? 1 : -0.35) * esp * corda + 0.06 * Math.sin(Math.PI * x)]); }
    const pt = (k, j) => { const a = -A0 + 2 * A0 * k / N, [z, y] = sec[j % P]; return new THREE.Vector3(Math.sin(a) * (R + y), Math.cos(a) * (R + y) - R, z); };
    const pos = [], col = [];
    const tri = (a, b, c, cor) => { for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); col.push(cor.r, cor.g, cor.b); } };
    for (let k = 0; k < N; k++) { const c = cores[k % 3]; for (let j = 0; j < P; j++) { const a = pt(k, j), b = pt(k, j + 1), c2 = pt(k + 1, j), d = pt(k + 1, j + 1); tri(a, c2, b, c); tri(b, c2, d, c); } }
    for (const [k, inv] of [[0, true], [N, false]]) { const c0 = pt(k, 0).add(pt(k, P / 2)).multiplyScalar(0.5); for (let j = 0; j < P; j++) inv ? tri(c0, pt(k, j), pt(k, j + 1), cores[0]) : tri(c0, pt(k, j + 1), pt(k, j), cores[0]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const velame = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })); velame.castShadow = true; vel.add(velame);
    const linhas = [], topos = []; for (let k = 0; k <= N; k += 1.5) for (const j of [P / 2 + 1, P / 2 + 4, P - 2]) { const p0 = pt(Math.round(k), Math.round(j)); topos.push(p0); linhas.push(p0.clone(), new THREE.Vector3(p0.x > 0 ? 0.2 : -0.2, 1.62, 0.02)); }
    const cordas = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linhas), new THREE.LineBasicMaterial({ color: 0x2b2b2b })); cordas.frustumCulled = false; pq.add(cordas); pq.userData = { cordas, topos };
  }
  raiz.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const pose = {}; for (const k of Object.keys(J)) pose[k] = new THREE.Euler();
  return { obj: raiz, J, garras, pq, vel: pq.children[0], pose, fase: 0, y: 0, t0: 0, abrindo: 0, modoAnt: '' };
}

function texNome() { const c = document.createElement('canvas'); c.width = 64; c.height = 24; const g = c.getContext('2d'); g.fillStyle = '#2b2b22'; g.fillRect(0, 0, 64, 24); g.fillStyle = '#e8e2c8'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('PILOTO', 32, 17); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function texBandeira() { const c = document.createElement('canvas'); c.width = 48; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#1f9d4a'; g.fillRect(0, 0, 48, 32); g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(4, 16); g.lineTo(24, 3); g.lineTo(44, 16); g.lineTo(24, 29); g.fill(); g.fillStyle = '#1e3c96'; g.beginPath(); g.arc(24, 16, 7, 0, 7); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

// Pose desejada para cada situação; a função mistura suavemente da pose atual para ela.
// Convenções (corpo em pé, de frente para -Z): coxa.x>0 perna pra frente · joelho.x<0 dobra o joelho
// tornozelo.x>0 ponta do pé pra cima · ombro.x>0 braço pra frente · ombro.z>0 (direito) abre pro lado
// cotovelo.x>0 dobra o cotovelo · tronco.x<0 inclina pra frente · cabeça.x>0 olha pra cima · quadril.x<0 corpo deita de bruços
// modo: 'pe' | 'pulo' | 'queda' | 'paraquedas' | 'sobre' | 'subindo' | 'pouso'
export function animarPessoa(p, modo, rapidez, t, dt, garras, vento = 0) {
  const A = {}; const set = (k, x = 0, y = 0, z = 0) => (A[k] = [x, y, z]);
  for (const k of Object.keys(p.J)) set(k);
  let quadY = 0.98, raizX = 0;
  p.garras.forEach((g) => (g.visible = garras));
  if (modo === 'paraquedas' && p.modoAnt !== 'paraquedas') p.abrindo = 0;
  p.modoAnt = modo; p.pq.visible = modo === 'paraquedas';
  if (p.pq.visible) { // velame inflando: estica de lado, enche e balança
    p.abrindo = Math.min(1, p.abrindo + dt / 1.1); const u = p.abrindo, e = 1 - Math.pow(1 - u, 3);
    p.vel.scale.set(0.15 + 0.85 * e, 0.3 + 0.7 * e + Math.sin(u * 14) * 0.08 * (1 - u), 0.4 + 0.6 * e); p.vel.position.y = 2.5 + 3.8 * e;
    p.vel.rotation.z = Math.sin(t * 0.9) * 0.05; p.vel.rotation.x = -0.12 + Math.sin(t * 1.3) * 0.03;
    p.vel.updateMatrix(); const { cordas, topos } = p.pq.userData, at = cordas.geometry.attributes.position; // cordas presas no velame enquanto ele infla
    topos.forEach((v, i) => { const w = v.clone().applyMatrix4(p.vel.matrix); at.setXYZ(i * 2, w.x, w.y, w.z); }); at.needsUpdate = true;
  }
  if (modo === 'pe') {
    const v = Math.min(rapidez, 7), corre = v > 3.6;
    p.fase += dt * (v < 0.2 ? 0 : 2.2 + v * 1.25);
    const f = p.fase, a = Math.min(1, v / 2.5) * (corre ? 0.85 : 0.55);
    if (v < 0.2) { // parado: respira e olha em volta
      const r = Math.sin(t * 1.6) * 0.03; set('peito', -r, 0, 0); set('cabeca', Math.sin(t * 0.3) * 0.08, Math.sin(t * 0.37) * 0.45, 0);
      set('ombroD', 0.05, 0, 0.1 + r); set('ombroE', 0.05, 0, -0.1 - r); set('cotoveloD', 0.18); set('cotoveloE', 0.18);
      set('coxaD', 0, 0, 0.03); set('coxaE', 0, 0, -0.03); quadY = 0.98 + r * 0.2;
    } else {
      set('coxaD', Math.sin(f) * a); set('coxaE', -Math.sin(f) * a);
      set('joelhoD', -(Math.max(0, Math.cos(f)) * a * 1.5 + 0.05)); set('joelhoE', -(Math.max(0, -Math.cos(f)) * a * 1.5 + 0.05));
      set('tornD', Math.max(0, Math.sin(f)) * 0.25); set('tornE', Math.max(0, -Math.sin(f)) * 0.25);
      set('ombroD', -Math.sin(f) * a * 0.9, 0, 0.08); set('ombroE', Math.sin(f) * a * 0.9, 0, -0.08);
      set('cotoveloD', corre ? 1.5 : 0.25 + Math.max(0, -Math.sin(f)) * 0.5); set('cotoveloE', corre ? 1.5 : 0.25 + Math.max(0, Math.sin(f)) * 0.5);
      set('tronco', corre ? -0.22 : -0.05, Math.sin(f) * 0.12, 0); set('peito', 0, -Math.sin(f) * 0.15, 0); set('cabeca', corre ? 0.18 : 0.04);
      quadY = 0.98 - Math.abs(Math.sin(f)) * (corre ? 0.06 : 0.03);
    }
  } else if (modo === 'pulo') {
    set('coxaD', 0.8); set('coxaE', 0.35); set('joelhoD', -1.3); set('joelhoE', -0.8); set('tornD', 0.3); set('tornE', 0.2);
    set('ombroD', 0.5, 0, 0.6); set('ombroE', 0.5, 0, -0.6); set('cotoveloD', 0.6); set('cotoveloE', 0.6);
  } else if (modo === 'pouso') {
    quadY = 0.72; set('coxaD', 1.1, 0, 0.1); set('coxaE', 1.1, 0, -0.1); set('joelhoD', -1.9); set('joelhoE', -1.9); set('tornD', 0.8); set('tornE', 0.8); set('tronco', -0.45); set('cabeca', 0.4);
    set('ombroD', 0.6, 0, 0.3); set('ombroE', 0.6, 0, -0.3); set('cotoveloD', 0.4); set('cotoveloE', 0.4);
  } else if (modo === 'queda') { // queda livre de bruços, posição "caixa": braços abertos com antebraço pra frente, joelhos dobrados
    raizX = -1.42; quadY = 0.6; const fl = Math.sin(t * 11) * 0.05, fl2 = Math.sin(t * 9.3) * 0.05;
    set('ombroD', 0, 0, 1.5 + fl); set('ombroE', 0, 0, -1.5 - fl2); set('cotoveloD', 0, 0, 1.3); set('cotoveloE', 0, 0, -1.3);
    set('coxaD', 0.05, 0, 0.32); set('coxaE', 0.05, 0, -0.32); set('joelhoD', -1.0 + fl2); set('joelhoE', -1.0 + fl); set('tornD', 0.5); set('tornE', 0.5);
    set('tronco', 0.18); set('pescoco', 0.35); set('cabeca', 0.55);
  } else if (modo === 'paraquedas') { // pendurado nas manetes, pernas balançando
    const b = Math.sin(t * 1.3) * 0.12, puxa = Math.sin(t * 0.7) * 0.15;
    set('ombroD', 2.75 - puxa, 0, 0.32); set('ombroE', 2.75 + puxa, 0, -0.32); set('cotoveloD', 0.35); set('cotoveloE', 0.35);
    set('coxaD', 0.18 + b, 0, 0.06); set('coxaE', 0.18 - b, 0, -0.06); set('joelhoD', -0.3); set('joelhoE', -0.4); set('tornD', -0.3); set('tornE', -0.3);
    set('cabeca', 0.1, Math.sin(t * 0.4) * 0.5, 0);
  } else if (modo === 'sobre') {
    const ag = garras ? Math.min(1, vento * 1.3) : 0;
    if (!garras && vento > 0.15) { // sem garras: se debatendo contra o vento
      set('tronco', 0.3); set('ombroD', 1.4 + Math.sin(t * 9) * 1.0, 0, 0.6); set('ombroE', 1.4 + Math.sin(t * 8 + 1) * 1.0, 0, -0.6);
      set('cotoveloD', 0.6); set('cotoveloE', 0.6); set('coxaD', 0.5); set('coxaE', -0.2); set('joelhoD', -0.8); set('joelhoE', -0.4); set('cabeca', -0.2);
    } else { // anda; com vento forte vai agachado, uma mão perto da superfície
      p.fase += dt * (rapidez < 0.1 ? 0 : 2.2 + rapidez * 1.4); const f = p.fase, a = Math.min(1, rapidez / 1.5) * 0.45;
      quadY = 0.98 - 0.32 * ag;
      set('coxaD', 1.15 * ag + Math.sin(f) * a); set('coxaE', 1.15 * ag - Math.sin(f) * a);
      set('joelhoD', -(2.0 * ag + Math.max(0, Math.cos(f)) * a * 1.4)); set('joelhoE', -(2.0 * ag + Math.max(0, -Math.cos(f)) * a * 1.4));
      set('tornD', 0.8 * ag); set('tornE', 0.8 * ag); set('tronco', -0.5 * ag); set('cabeca', 0.45 * ag);
      set('ombroD', 0.9 * ag - Math.sin(f) * a, 0, 0.15); set('cotoveloD', 0.2); set('ombroE', 0.3 * ag + Math.sin(f) * a, 0, -0.15 - 0.9 * ag); set('cotoveloE', 0.3);
    }
  } else if (modo === 'subindo') { // passando pela cabine
    quadY = 0.85; set('coxaD', 1.3); set('joelhoD', -1.6); set('coxaE', -0.2); set('joelhoE', -0.3); set('ombroD', 2.3); set('ombroE', 1.7); set('cotoveloD', 0.3); set('cotoveloE', 0.5); set('tronco', -0.3);
  }
  set('quadril', raizX); delete A.visor;
  const k = 1 - Math.exp(-dt * (modo === 'queda' || modo === 'pouso' ? 9 : 13));
  for (const [nome, [x, y, z]] of Object.entries(A)) { const e = p.pose[nome]; e.x += (x - e.x) * k; e.y += (y - e.y) * k; e.z += (z - e.z) * k; p.J[nome].rotation.copy(e); }
  p.y += (quadY - p.y) * k; p.J.quadril.position.y = p.y;
}
