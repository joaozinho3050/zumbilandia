/* sfx.js: sons por evento (G.events), passo e gemido, com Web Audio (sem arquivos).
   Só lê G. Mudo em localStorage['zl1.mute']. Sem Web Audio, tudo vira no-op. */
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const MAX_VOICES = 6, MASTER = 0.4, MUTE_KEY = 'zl1.mute';
  let ctx = null, master = null, noiseBuf = null, voices = 0, muteOn = false;
  try { muteOn = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
  const seen = new WeakSet(); // evento já tocado (G.events pode não ser limpo)
  let stepAt = 0, groanAt = 0, breathAt = 0, climbAt = 0, lastX = null, lastY = null;

  // Cria o AudioContext (só dentro de gesto do usuário) e retoma se suspenso.
  function ensure() {
    try {
      if (!AC) return;
      if (!ctx) {
        const c = new AC();
        const m = c.createGain();
        m.gain.value = muteOn ? 0 : MASTER;
        m.connect(c.destination);
        const nb = c.createBuffer(1, c.sampleRate, c.sampleRate); // 1 s de ruído branco, único
        const d = nb.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        master = m; noiseBuf = nb; ctx = c;
      }
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    } catch (e) { ctx = null; }
  }

  // Envelope: ataque curto (att) e queda exponencial até dur.
  function env(g, t, dur, vol, att) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (att || Math.min(0.01, dur / 4)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function osc(nodes, type, f0, f1, t, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, dur, vol);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur);
    nodes.push(o, g);
    return o;
  }
  function noise(nodes, t, dur, vol, type, freq, q, att) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, dur, vol, att);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * (noiseBuf.duration - dur));
    s.stop(t + dur);
    nodes.push(s, f, g);
  }

  // Uma voz: respeita mudo e teto; build(t, nodes) agenda os nós; somem e desconectam ao acabar.
  function voice(dur, build) {
    if (!ctx || muteOn || voices >= MAX_VOICES) return;
    voices++;
    const nodes = [];
    try { build(ctx.currentTime + 0.01, nodes); } catch (e) {}
    setTimeout(() => {
      voices--;
      for (const n of nodes) { try { n.disconnect(); } catch (e) {} }
    }, (dur + 0.1) * 1000);
  }

  const SND = {
    shot: () => voice(0.14, (t, n) => {
      noise(n, t, 0.06, 0.6, 'highpass', 1800, 0.7);
      osc(n, 'triangle', 140, 45, t, 0.14, 0.25);
    }),
    swing: () => voice(0.25, (t, n) => noise(n, t, 0.25, 0.25, 'bandpass', 900, 1.2, 0.08)),
    hit: () => voice(0.15, (t, n) => osc(n, 'sine', 150, 45, t, 0.15, 0.6)),
    hurt: () => voice(0.25, (t, n) => osc(n, 'triangle', 420, 140, t, 0.25, 0.35)),
    death: () => voice(1.3, (t, n) => {
      [330, 262, 196].forEach((f, i) => osc(n, 'triangle', f, f * 0.7, t + i * 0.05, 1.2 - i * 0.05, 0.12));
    }),
    crateOpen: () => voice(0.2, (t, n) => osc(n, 'sawtooth', 200, 600, t, 0.18, 0.12)),
    doorOpen: () => voice(0.25, (t, n) => osc(n, 'triangle', 170, 380, t, 0.22, 0.2)),   // rangido curto subindo
    doorClose: () => voice(0.16, (t, n) => osc(n, 'sine', 120, 50, t, 0.15, 0.6)),       // batida grave curta
    search: () => voice(0.3, (t, n) => [0, 0.09, 0.18].forEach((d) => noise(n, t + d, 0.04, 0.3, 'bandpass', 1400, 1.5, 0.005))), // remexer: 3 burst
    doorBreak: () => voice(1.0, (t, n) => [0, 0.3, 0.6].forEach((d) => { // pancadas fortes graves
      osc(n, 'sine', 90, 40, t + d, 0.22, 0.7);
      noise(n, t + d, 0.12, 0.4, 'lowpass', 300, 0.7, 0.005);
    })),
    full: () => voice(0.35, (t, n) => {
      osc(n, 'square', 220, 220, t, 0.12, 0.1);
      osc(n, 'square', 175, 175, t + 0.18, 0.12, 0.1);
    }),
    hint: () => voice(0.2, (t, n) => osc(n, 'sine', 880, 880, t, 0.18, 0.12)),
    step: (vol) => voice(0.06, (t, n) => noise(n, t, 0.05, vol || 0.25, 'lowpass', 400, 0.5)),
    pant: () => voice(0.5, (t, n) => noise(n, t, 0.5, 0.14, 'lowpass', 700, 0.6, 0.15)), // respiração ofegante: ruído filtrado suave
    crouch: () => voice(0.18, (t, n) => noise(n, t, 0.18, 0.12, 'bandpass', 2500, 0.8, 0.05)), // roçar de roupa
    groan: () => voice(1.3, (t, n) => {
      const o = osc(n, 'sine', 110, 80, t, 1.2, 0.22);
      const l = ctx.createOscillator(), lg = ctx.createGain(); // vibrato
      l.frequency.value = 6; lg.gain.value = 7;
      l.connect(lg).connect(o.frequency);
      l.start(t); l.stop(t + 1.2);
      n.push(l, lg);
    }),
    drop: () => voice(0.14, (t, n) => { // baque curto no chão
      osc(n, 'sine', 110, 55, t, 0.12, 0.35);
      noise(n, t, 0.05, 0.2, 'lowpass', 250, 0.7, 0.003);
    }),
    pick: () => voice(0.1, (t, n) => { // estalo agudo curto
      osc(n, 'triangle', 1400, 1800, t, 0.06, 0.2);
      noise(n, t, 0.03, 0.12, 'highpass', 3000, 0.7, 0.002);
    }),
    equip: () => voice(0.25, (t, n) => { // tecido + fivela
      noise(n, t, 0.18, 0.25, 'bandpass', 1200, 0.8, 0.04);
      osc(n, 'square', 2400, 2400, t + 0.12, 0.02, 0.1);
    }),
    armorBreak: () => voice(0.45, (t, n) => { // estalo seco + tilintar
      noise(n, t, 0.05, 0.6, 'highpass', 2500, 0.7, 0.002);
      osc(n, 'sine', 2200, 2200, t + 0.06, 0.35, 0.12);
      osc(n, 'sine', 2900, 2900, t + 0.09, 0.3, 0.08);
    }),
    craft: () => voice(0.3, (t, n) => [0, 0.09, 0.18].forEach((d) => { // 3 cliques metálicos
      osc(n, 'triangle', 2600, 2600, t + d, 0.03, 0.2);
      noise(n, t + d, 0.02, 0.15, 'bandpass', 3500, 3, 0.002);
    })),
    windup: () => voice(0.5, (t, n) => { // rosnado grave curto
      osc(n, 'sawtooth', 90, 60, t, 0.45, 0.18);
      noise(n, t, 0.45, 0.15, 'lowpass', 250, 0.6, 0.05);
    }),
    jump: () => voice(0.22, (t, n) => { // sopro curto subindo
      noise(n, t, 0.22, 0.18, 'bandpass', 800, 0.8, 0.08);
      osc(n, 'triangle', 200, 500, t, 0.2, 0.06);
    }),
    climb: () => voice(0.14, (t, n) => noise(n, t, 0.14, 0.22, 'bandpass', 1800, 3, 0.02)), // raspar madeira
  };

  // Evento -> som. door: abrir/fechar pelo ev.open. search: só o início (p:0 com action ativa; cancelamento tem action null).
  // windup: rosnado só se o zumbi estiver a <12 m do jogador.
  function play(ev, G) {
    if (ev.type === 'door') return (ev.open ? SND.doorOpen : SND.doorClose)();
    if (ev.type === 'windup') {
      const z = (G.zombies || []).find((e) => e.id === ev.id), p = G.player;
      if (z && p && Math.hypot(z.x - p.x, z.y - p.y) < 12) SND.windup();
      return;
    }
    if (ev.type === 'search') { const a = G.player && G.player.action; if (ev.p === 0 && a && a.id === ev.id) SND.search(); return; }
    if (SND[ev.type]) SND[ev.type]();
  }

  // Lê G.events (sem limpar) e gera passo/gemido pelo estado do jogo.
  function draw(G) {
    try {
      for (const ev of G.events || []) {
        if (seen.has(ev)) continue;
        seen.add(ev);
        if (ctx) play(ev, G);
      }
      const p = G.player, now = performance.now() / 1000;
      if (p) {
        if (ctx) {
          const moved = lastX !== null && !p.car && Math.hypot(p.x - lastX, p.y - lastY) > 0.002;
          const gap = p.crouch ? 0.7 : p.running ? 0.28 : 0.45; // passo: agachado, correndo, andando
          if (moved && now - stepAt >= gap) { // volume pelo raio de ruído (3/6/12 m): agachado quase mudo
            stepAt = now; const k = Math.min(1, (p.noise || 0) / 12); SND.step(Math.max(0.01, k * k));
          }
          if (p.stamina != null && p.stamina < 15 && now - breathAt >= 1.2) { breathAt = now; SND.pant(); }
          if (now - groanAt >= 3 && G.zombies) {
            for (const z of G.zombies) {
              if (z.state === 'chase' && Math.hypot(z.x - p.x, z.y - p.y) < 10) {
                groanAt = now; SND.groan(); break;
              }
            }
          }
          if (now - climbAt >= 0.5 && G.zombies) { // raspar enquanto algum zumbi sobe cerca perto (1 som a cada 0,5 s)
            for (const z of G.zombies) {
              if (z.anim && z.anim.act === 'climb' && Math.hypot(z.x - p.x, z.y - p.y) < 12) {
                climbAt = now; SND.climb(); break;
              }
            }
          }
        }
        lastX = p.x; lastY = p.y;
      }
    } catch (e) {}
  }

  function mute(v) {
    muteOn = !!v;
    try { localStorage.setItem(MUTE_KEY, muteOn ? '1' : '0'); } catch (e) {}
    try { if (master) master.gain.setTargetAtTime(muteOn ? 0 : MASTER, ctx.currentTime, 0.02); } catch (e) {}
  }
  function muted() { return muteOn; }

  // Primeiro toque/tecla cria o contexto; volta da aba retoma.
  function init() {
    if (!AC) return;
    const unlock = () => ensure();
    document.addEventListener('pointerdown', unlock, { once: true, capture: true });
    document.addEventListener('keydown', unlock, { once: true, capture: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx) ensure(); });
  }

  window.SFX = { init, draw, mute, muted };
  init(); // index.html não chama init: roda ao carregar
})();
