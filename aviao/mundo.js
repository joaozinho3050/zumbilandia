// Relevo, cores e lugares do arquipélago. Sem THREE: roda no node para testar.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

export function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(x, z) { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123; return h - Math.floor(h); }
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}
export function fbm(x, z, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged(x, z, o = 5) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { const v = 1 - Math.abs(vnoise(x * f, z * f) * 2 - 1); s += a * v * v; n += a; a *= 0.5; f *= 2.1; } return s / n; }

export const MUNDO = 12000; // lado do terreno em metros (de -6000 a 6000)
export const PISTA = { x: 0, z0: -650, z1: 1050, w: 45, h: 18 }; // pista norte-sul
export const LAGO = { x: -150, z: -2300, r: 240, h: 330 };
export const CANION = (x) => 420 + 300 * Math.sin((x - 3000) * 0.0025); // z do rio no cânion
export const ATOL = { x: -2800, z: 2900, r: 560 };
export const FAROL = { x: 2560, z: 2960 };

const T = { h: 0, mesa: 0, mtn: 0 };
// Altura do terreno (água = 0). Devolve também as máscaras de bioma em T.
export function terreno(x, z) {
  const big = fbm(x * 0.0004 + 11, z * 0.0004 + 5, 3), det = fbm(x * 0.0025, z * 0.0025, 4) - 0.5;
  const wx = x + (fbm(x * 0.0007 + 40, z * 0.0007, 3) - 0.5) * 900, wz = z + (fbm(x * 0.0007, z * 0.0007 + 70, 3) - 0.5) * 900; // costa torta
  const mMain = smooth(1, 0.72, Math.hypot(wx, wz * 1.15) / (2300 * (0.75 + 0.5 * big)) + det * 0.15);
  const mMtn = smooth(1, 0.6, Math.hypot((wx + 600) * 0.8, wz + 2900) / 1900 + det * 0.3);
  const mMesa = smooth(1, 0.82, Math.hypot(wx - 3000, (wz - 400) * 1.1) / (1300 * (0.85 + 0.3 * big)) + det * 0.12);
  const mCape = smooth(1, 0.5, Math.hypot(wx - 2500, wz - 2900) / 420 + det * 0.5);
  const ra = Math.hypot(x - ATOL.x, z - ATOL.z);
  const mRing = smooth(95, 35, Math.abs(ra - ATOL.r) + det * 140);

  let h = -48 + det * 14;
  if (ra < 700) h = lerp(h, -5 + det * 6, smooth(700, 540, ra)); // laguna rasa
  h = lerp(h, 4 + det * 3, mRing);                                // anel de areia
  const hill = 14 + big * 120 * smooth(500, 1800, Math.hypot(x, z - 200)) + det * 40;
  h = lerp(h, hill, mMain);
  const mt = 70 + ridged(x * 0.0011 + 3, z * 0.0011 + 9) * 950 * smooth(0.6, 1, mMtn) + det * 40;
  h = lerp(h, Math.max(h, mt), mMtn);
  h = lerp(h, 30 + det * 60 + (1 - Math.hypot(x - 2500, z - 2900) / 380) * 25, mCape);
  // planalto em degraus, cortado por um rio
  let pv = 235 + det * 90; const tt = pv / 32, f = tt - Math.floor(tt); pv = (Math.floor(tt) + smooth(0.25, 0.75, f)) * 32;
  h = lerp(h, pv, mMesa);
  const cz = CANION(x), dc = Math.abs(z - cz) + det * 30;
  h = lerp(h, -7 + det * 4, smooth(150, 45, dc) * smooth(0.0, 0.3, mMesa));
  // lago na montanha: borda sempre acima da água
  const dl = Math.hypot(x - LAGO.x, z - LAGO.z);
  if (dl < LAGO.r * 2.2) {
    const rim = Math.max(h, LAGO.h + 6 + (dl - LAGO.r) * 0.25);
    const fundo = LAGO.h - 4 - 14 * (1 - dl / LAGO.r);
    h = lerp(fundo, lerp(rim, h, smooth(LAGO.r * 1.5, LAGO.r * 2.2, dl)), smooth(LAGO.r * 0.85, LAGO.r * 1.08, dl));
  }
  // pista: chão plano com borda suave
  const dx = Math.max(Math.abs(x - PISTA.x) - 110, 0), dz = Math.max(z - PISTA.z1 - 60, PISTA.z0 - 60 - z, 0);
  h = lerp(PISTA.h, h, smooth(0, 220, Math.hypot(dx, dz)));
  T.h = h; T.mesa = mMesa; T.mtn = mMtn;
  return T;
}
export const altura = (x, z) => terreno(x, z).h;

// Cor do chão (r,g,b 0..1) dado altura e inclinação (ny = normal.y)
export function corChao(x, z, ny, out) {
  const { h, mesa } = terreno(x, z);
  const n = fbm(x * 0.008, z * 0.008, 3), n2 = vnoise(x * 0.06, z * 0.06);
  let r, g, b;
  if (h < -1) { // fundo do mar
    const t = smooth(-1.5, -26, h);
    r = lerp(0.92, 0.10, t); g = lerp(0.86, 0.30, t); b = lerp(0.66, 0.36, t);
  } else if (h < 4 + n * 4 && mesa < 0.5) { r = 0.95; g = 0.87; b = 0.66; } // praia
  else {
    // grama: verde que muda com ruído
    const campo = vnoise(x * 0.004 + 9, z * 0.004); // manchas de pasto mais claro / mata mais escura
    r = lerp(0.20, 0.42, n) + campo * 0.08; g = lerp(0.40, 0.52, n) + campo * 0.03; b = lerp(0.13, 0.20, n);
    const seco = smooth(150, 380, h); r = lerp(r, 0.46, seco * 0.6); g = lerp(g, 0.48, seco * 0.6); b = lerp(b, 0.30, seco * 0.6);
    if (mesa > 0.02) { // faixas vermelhas
      const band = [[0.78, 0.36, 0.20], [0.86, 0.52, 0.30], [0.70, 0.28, 0.18], [0.92, 0.66, 0.42]][Math.floor((h + n * 10) / 16) & 3];
      const m = smooth(0.0, 0.4, mesa) * smooth(2, 10, h);
      r = lerp(r, band[0], m); g = lerp(g, band[1], m); b = lerp(b, band[2], m);
    }
    const rock = smooth(0.8, 0.6, ny) * (1 - smooth(0.2, 0.6, mesa) * 0.6);
    r = lerp(r, 0.46, rock); g = lerp(g, 0.43, rock); b = lerp(b, 0.40, rock);
    const snow = smooth(430 + n * 120, 500 + n * 120, h) * smooth(0.45, 0.65, ny);
    r = lerp(r, 0.96, snow); g = lerp(g, 0.97, snow); b = lerp(b, 1.0, snow);
  }
  const v = 0.92 + n2 * 0.16;
  out[0] = r * v; out[1] = g * v; out[2] = b * v;
  return out;
}

// Lugares para visitar: [nome, x, z, raio, altura de chegada, rumo (graus)]
export const LUGARES = [
  { id: 'aero', nome: 'Aeroporto Central', x: 0, z: 200, r: 700, y: 0, rumo: 0, desc: 'Decole da pista e explore o céu.' },
  { id: 'vila', nome: 'Vila das Flores', x: 780, z: 560, r: 450, y: 220, rumo: 300, desc: 'Casinhas coloridas e a igreja na praça.' },
  { id: 'baloes', nome: 'Vale dos Balões', x: -1000, z: -800, r: 600, y: 300, rumo: 40, desc: 'Balões coloridos flutuando no vale.' },
  { id: 'lago', nome: 'Lago Espelho', x: LAGO.x, z: LAGO.z, r: 450, y: 520, rumo: 200, desc: 'Um lago azul no meio das montanhas.' },
  { id: 'pico', nome: 'Pico Nevado', x: -700, z: -3000, r: 700, y: 1250, rumo: 90, desc: 'Montanhas de neve e vales profundos.' },
  { id: 'canion', nome: 'Cânion Vermelho', x: 3000, z: 420, r: 900, y: 320, rumo: 270, desc: 'Um rio entre paredões vermelhos.' },
  { id: 'farol', nome: 'Farol da Ponta', x: FAROL.x, z: FAROL.z, r: 450, y: 160, rumo: 330, desc: 'O farol listrado na ilha de pedra.' },
  { id: 'atol', nome: 'Atol Turquesa', x: ATOL.x, z: ATOL.z, r: 800, y: 180, rumo: 60, desc: 'Laguna azul-clara e coqueiros.' },
];

// Desafios: argolas (x, z, altura acima do chão ou absoluta se 'abs')
export const DESAFIOS = [
  { id: 'ilha', nome: 'Volta da Ilha', desc: 'Fácil: em volta do aeroporto e da vila.', inicio: { x: 0, z: 1600, y: 200, rumo: 0 },
    pts: [[0, 1100, 120], [-80, 300, 90], [0, -500, 90], [300, -1100, 140], [900, -700, 120], [1100, 100, 110], [800, 560, 90], [350, 900, 80], [0, 1500, 120]] },
  { id: 'canion', nome: 'Rio do Cânion', desc: 'Voe baixo entre os paredões!', inicio: { x: 4700, z: CANION(4700), y: 70, rumo: 270 },
    pts: [4300, 4000, 3700, 3450, 3200, 2950, 2700, 2450, 2200, 1950, 1750].map((x, i) => [x, CANION(x), 'abs', 45 + (i % 3) * 18]) },
  { id: 'picos', nome: 'Picos Gelados', desc: 'Entre as montanhas até o lago.', inicio: { x: -2600, z: -1600, y: 600, rumo: 60 },
    pts: [[-2000, -2100, 110], [-1500, -2700, 110], [-1000, -3300, 120], [-300, -3500, 120], [400, -3000, 110], [300, -2400, 90], [LAGO.x, LAGO.z, 'abs', LAGO.h + 25], [-700, -1800, 110]] },
  { id: 'mar', nome: 'Atol ao Farol', desc: 'Rasante sobre o mar azul.', inicio: { x: -3700, z: 2300, y: 120, rumo: 120 },
    pts: [[-3200, 2700, 'abs', 30], [-2800, 2900, 'abs', 20], [-2350, 3150, 'abs', 25], [-1600, 3300, 'abs', 30], [-700, 3300, 'abs', 25], [200, 3200, 'abs', 30], [1100, 3100, 'abs', 25], [1900, 3000, 'abs', 30], [FAROL.x - 150, FAROL.z + 160, 'abs', 60]] },
];
