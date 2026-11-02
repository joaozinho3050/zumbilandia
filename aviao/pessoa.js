// Piloto a pé: corpo com juntas, botas com garras magnéticas e paraquedas.
import * as THREE from 'three';

export function criarPessoa() {
  const raiz = new THREE.Group();
  const m = (c, r = 0.7, mt = 0.1, e = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt, ...e });
  const macacao = m('#5b6346'), pele = m('#d9a27a'), bota = m('#2a2420'), cap = m('#e9e9e4', 0.4), mochila = m('#3d4a5c');
  const pelve = new THREE.Group(); pelve.position.y = 0.95; raiz.add(pelve);
  const tronco = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), macacao); tronco.position.y = 0.33; pelve.add(tronco);
  const cinto = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 12), m('#222')); cinto.position.y = 0.08; pelve.add(cinto);
  const colete = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.3), m('#4a4f3a')); colete.position.set(0, 0.42, -0.03); pelve.add(colete);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.16), mochila); pack.position.set(0, 0.38, 0.22); pelve.add(pack);
  const cabeca = new THREE.Group(); cabeca.position.y = 0.78; pelve.add(cabeca);
  cabeca.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), pele));
  const capacete = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), cap); capacete.position.y = 0.02; capacete.rotation.x = 0.2; cabeca.add(capacete);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.04), m('#1a1a22', 0.05, 0.9)); visor.position.set(0, 0.03, -0.12); cabeca.add(visor);
  const membro = (r, l, mat) => { const g = new THREE.CapsuleGeometry(r, l, 3, 8); g.translate(0, -l / 2 - r, 0); return new THREE.Mesh(g, mat); };
  const braco = (s) => { const p = new THREE.Group(); p.position.set(s * 0.26, 0.58, 0); pelve.add(p); p.add(membro(0.055, 0.5, macacao));
    const luva = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m('#222')); luva.position.y = -0.64; p.add(luva); return p; };
  const garras = [];
  const perna = (s) => { const p = new THREE.Group(); p.position.set(s * 0.11, 0.02, 0); pelve.add(p); p.add(membro(0.075, 0.7, macacao));
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.26), bota); b.position.set(0, -0.9, -0.04); p.add(b);
    const gr = new THREE.Group(); gr.position.set(0, -0.96, -0.04); p.add(gr); // garras magnéticas
    for (let k = -1; k <= 1; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 5), m('#9fd8ff', 0.2, 0.9, { emissive: 0x2a9dff, emissiveIntensity: 0.8 })); c.rotation.x = Math.PI; c.position.set(k * 0.04, -0.03, -0.1); gr.add(c); }
    garras.push(gr); return p; };
  const bD = braco(1), bE = braco(-1), pD = perna(1), pE = perna(-1);
  // paraquedas (velame listrado + cordas)
  const pq = new THREE.Group(); pq.visible = false; raiz.add(pq);
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) { g.fillStyle = ['#ff6b35', '#ffffff', '#1d4fa3'][i % 3]; g.fillRect(i * 256 / 9, 0, 256 / 9 + 1, 32); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const velame = new THREE.Mesh(new THREE.SphereGeometry(3.6, 18, 6, 0, Math.PI * 2, 0, 1.0), m('#fff', 0.8, 0, { map: tx, side: THREE.DoubleSide }));
  velame.scale.set(1.25, 0.55, 0.75); velame.position.y = 4.6; velame.castShadow = true; pq.add(velame);
  const pts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 3.6 * Math.sin(1) * 1.25, 4.6 + 3.6 * Math.cos(1) * 0.55, Math.sin(a) * 3.6 * Math.sin(1) * 0.75), new THREE.Vector3(Math.cos(a) > 0 ? 0.2 : -0.2, 1.6, 0)); }
  pq.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 })));
  raiz.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { obj: raiz, pelve, cabeca, bD, bE, pD, pE, garras, pq };
}

// pose conforme o estado: 'pe' (anda), 'queda', 'paraquedas', 'sobre' (em cima do avião)
export function animarPessoa(p, modo, rapidez, t, garras, vento = 0) {
  const sw = Math.sin(t * (4 + rapidez * 1.6)) * Math.min(1, rapidez / 3) * 0.7;
  p.garras.forEach((g) => (g.visible = garras));
  p.pq.visible = modo === 'paraquedas';
  p.pelve.rotation.set(0, 0, 0); p.pelve.position.y = 0.95;
  if (modo === 'queda') { // de barriga pra baixo, braços e pernas abertos
    p.pelve.rotation.x = -1.35; p.pelve.position.y = 0.5;
    p.bD.rotation.set(0, 0, 1.9 + Math.sin(t * 9) * 0.08); p.bE.rotation.set(0, 0, -1.9 - Math.sin(t * 8) * 0.08);
    p.pD.rotation.set(0.5, 0, 0.35); p.pE.rotation.set(0.5, 0, -0.35);
  } else if (modo === 'paraquedas') {
    p.bD.rotation.set(0, 0, 2.6); p.bE.rotation.set(0, 0, -2.6); p.pD.rotation.set(0.15, 0, 0.05); p.pE.rotation.set(-0.1, 0, -0.05);
    p.pq.rotation.z = Math.sin(t * 0.8) * 0.06;
  } else {
    const ag = modo === 'sobre' ? Math.min(1, vento) : 0; // agachado contra o vento
    p.pelve.rotation.x = -0.45 * ag; p.pelve.position.y = 0.95 - 0.25 * ag;
    p.bD.rotation.set(sw - ag * 0.8, 0, 0.12 + ag * 0.3); p.bE.rotation.set(-sw - ag * 0.8, 0, -0.12 - ag * 0.3);
    p.pD.rotation.set(-sw + ag * 0.9, 0, 0); p.pE.rotation.set(sw + ag * 0.9, 0, 0);
    p.cabeca.rotation.x = ag * 0.4;
  }
}
