/* sfx.js: sons por evento (G.events), passo, gemido e loops (motor, sifão, fogo), com Web Audio (sem arquivos).
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

  // Loops (motor, sifão, fogo): um por nome, ocupam 1 voz do teto até loopOff. set(k) atualiza a cada quadro.
  const LOOPS = {};
  function loopOn(name, make) {
    if (LOOPS[name]) return LOOPS[name];
    if (!ctx || muteOn || voices >= MAX_VOICES) return null;
    voices++;
    const nodes = [], out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);
    nodes.push(out);
    const set = make(ctx.currentTime + 0.01, nodes, out);
    LOOPS[name] = { nodes, out, set };
    return LOOPS[name];
  }
  function loopOff(name) {
    const L = LOOPS[name];
    if (!L) return;
    delete LOOPS[name];
    voices--;
    try { L.out.gain.setTargetAtTime(0, ctx.currentTime, 0.03); } catch (e) {}
    setTimeout(() => {
      for (const n of L.nodes) {
        try { if (n.stop) n.stop(); } catch (e) {}
        try { n.disconnect(); } catch (e) {}
      }
    }, 200);
  }
  // k = 0 parado .. 1 a 11 m/s: serra + quadrada grave subindo, ruído filtrado a seguir.
  function engineLoop(t, nodes, out) {
    const a = ctx.createOscillator(), sq = ctx.createOscillator(), lp = ctx.createBiquadFilter();
    const ga = ctx.createGain(), gq = ctx.createGain();
    const ns = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    a.type = 'sawtooth'; sq.type = 'square';
    lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.7;
    ga.gain.value = 0.12; gq.gain.value = 0.06;
    ns.buffer = noiseBuf; ns.loop = true;
    nf.type = 'bandpass'; nf.Q.value = 0.8; ng.gain.value = 0.15;
    a.connect(ga).connect(lp); sq.connect(gq).connect(lp); lp.connect(out);
    ns.connect(nf).connect(ng).connect(out);
    a.start(t); sq.start(t); ns.start(t, Math.random() * 0.5);
    nodes.push(a, sq, lp, ga, gq, ns, nf, ng);
    return (k) => {
      const now = ctx.currentTime;
      a.frequency.setTargetAtTime(40 + 80 * k, now, 0.08);
      sq.frequency.setTargetAtTime(20 + 40 * k, now, 0.08);
      nf.frequency.setTargetAtTime(250 + 300 * k, now, 0.1);
      out.gain.setTargetAtTime(0.6, now, 0.05);
    };
  }
  // Borbulhar: seno grave com modulação de amplitude de ~12 Hz (bolhas).
  function bubbleLoop(t, nodes, out) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 180;
    g.gain.value = 0.2; lfo.frequency.value = 12; lg.gain.value = 0.15;
    o.connect(g).connect(out);
    lfo.connect(lg).connect(g.gain);
    o.start(t); lfo.start(t);
    nodes.push(o, g, lfo, lg);
    out.gain.setTargetAtTime(0.7, t, 0.05);
    return () => {};
  }
  // Fogo: whoosh (passa-faixa) + crepitar (passa-alta modulado). k = volume pela distância.
  function fireLoop(t, nodes, out) {
    const ns = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g1 = ctx.createGain();
    const hp = ctx.createBiquadFilter(), g2 = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    ns.buffer = noiseBuf; ns.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7; g1.gain.value = 0.25;
    hp.type = 'highpass'; hp.frequency.value = 2500; g2.gain.value = 0.06;
    lfo.type = 'square'; lfo.frequency.value = 18; lg.gain.value = 0.05;
    ns.connect(bp).connect(g1).connect(out);
    ns.connect(hp).connect(g2).connect(out);
    lfo.connect(lg).connect(g2.gain);
    ns.start(t, Math.random() * 0.5); lfo.start(t);
    nodes.push(ns, bp, g1, hp, g2, lfo, lg);
    return (k) => out.gain.setTargetAtTime(0.7 * k, ctx.currentTime, 0.1);
  }

  let moanAt = -1e9, dragAt = -1e9; // hordeMoan: 1 voz por vez; drag: >= 1,5 s entre arrastos
  let dmgAt = -1e9; // carDmg: no máximo 1 lata a cada 150 ms
  const SND = {
    shot: () => voice(0.14, (t, n) => {
      noise(n, t, 0.06, 0.6, 'highpass', 1800, 0.7);
      osc(n, 'triangle', 140, 45, t, 0.14, 0.25);
    }),
    swing: () => voice(0.25, (t, n) => noise(n, t, 0.25, 0.25, 'bandpass', 900, 1.2, 0.08)),
    hit: () => voice(0.15, (t, n) => osc(n, 'sine', 150, 45, t, 0.15, 0.6)),
    stealthKill: () => voice(0.3, (t, n) => { osc(n, 'sine', 90, 40, t, 0.25, 0.5); noise(n, t, 0.12, 0.12, 'lowpass', 500, 0.8, 0.05); }), // golpe abafado pelas costas
    hurt: () => voice(0.25, (t, n) => osc(n, 'triangle', 420, 140, t, 0.25, 0.35)),
    death: () => voice(1.3, (t, n) => {
      [330, 262, 196].forEach((f, i) => osc(n, 'triangle', f, f * 0.7, t + i * 0.05, 1.2 - i * 0.05, 0.12));
    }),
    crateOpen: () => voice(0.2, (t, n) => osc(n, 'sawtooth', 200, 600, t, 0.18, 0.12)),
    doorOpen: () => voice(0.25, (t, n) => osc(n, 'triangle', 170, 380, t, 0.22, 0.2)),   // rangido curto subindo
    doorClose: () => voice(0.16, (t, n) => osc(n, 'sine', 120, 50, t, 0.15, 0.6)),       // batida grave curta
    stairs: (vol) => voice(0.85, (t, n) => [0, 0.2, 0.4, 0.6].forEach((d, i) => { // 4 passos de madeira subindo de tom
      osc(n, 'triangle', 180 + i * 25, 90 + i * 12, t + d, 0.1, 0.5 * (vol || 1));
      noise(n, t + d, 0.05, 0.25 * (vol || 1), 'bandpass', 700 + i * 120, 1.2, 0.005);
    })),
    gateOpen: () => voice(0.5, (t, n) => { noise(n, t, 0.4, 0.3, 'bandpass', 500, 1.4, 0.05); osc(n, 'sawtooth', 110, 220, t, 0.35, 0.1); }),  // portao enrolando: chocalho grave subindo
    gateClose: () => voice(0.5, (t, n) => { noise(n, t, 0.3, 0.3, 'bandpass', 700, 1.4, 0.03); osc(n, 'sawtooth', 220, 90, t, 0.3, 0.1); osc(n, 'sine', 100, 40, t + 0.3, 0.15, 0.6); }), // chocalho descendo + baque
    search: () => voice(0.3, (t, n) => [0, 0.09, 0.18].forEach((d) => noise(n, t + d, 0.04, 0.3, 'bandpass', 1400, 1.5, 0.005))), // remexer: 3 burst
    doorHit: () => voice(0.3, (t, n) => { osc(n, 'sine', 120, 55, t, 0.18, 0.6); noise(n, t, 0.08, 0.35, 'lowpass', 400, 0.7, 0.004); osc(n, 'triangle', 210, 140, t, 0.1, 0.2); }), // pancada de zumbi na porta: baque de madeira
    backstab: () => voice(0.3, (t, n) => { noise(n, t, 0.07, 0.4, 'bandpass', 1800, 1.2, 0.003); osc(n, 'sawtooth', 320, 90, t, 0.14, 0.3); }), // golpe pelas costas: estalo agudo + queda
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
    engineOn: () => voice(0.4, (t, n) => { // arranque: giro curto subindo
      osc(n, 'sawtooth', 50, 110, t, 0.35, 0.14);
      noise(n, t, 0.35, 0.12, 'bandpass', 300, 0.8, 0.02);
    }),
    engineOff: () => voice(0.5, (t, n) => osc(n, 'sawtooth', 100, 35, t, 0.45, 0.14)), // giro caindo
    brake: () => voice(0.2, (t, n) => noise(n, t, 0.18, 0.2, 'bandpass', 3200, 2, 0.02)), // chiado curto
    crash: () => voice(0.35, (t, n) => { // pancada + vidro leve
      osc(n, 'sine', 110, 40, t, 0.25, 0.6);
      noise(n, t, 0.2, 0.2, 'highpass', 3500, 0.7, 0.002);
    }),
    run_over: () => voice(0.25, (t, n) => { // baque
      osc(n, 'sine', 120, 45, t, 0.2, 0.6);
      noise(n, t, 0.08, 0.3, 'lowpass', 300, 0.7, 0.002);
    }),
    trunk: () => voice(0.2, (t, n) => { // tranca: clique seco e trava
      noise(n, t, 0.03, 0.4, 'highpass', 2500, 0.7, 0.002);
      osc(n, 'square', 1500, 1500, t + 0.07, 0.04, 0.12);
    }),
    throw: () => voice(0.4, (t, n) => noise(n, t, 0.35, 0.25, 'bandpass', 900, 1, 0.05)), // sopro da garrafa
    fire: () => voice(0.6, (t, n) => noise(n, t, 0.5, 0.35, 'lowpass', 900, 0.5, 0.1)),   // whoosh ao acender
    burn: () => voice(0.15, (t, n) => noise(n, t, 0.14, 0.2, 'highpass', 2000, 0.7, 0.005)), // chiado curto
    tank: () => voice(0.35, (t, n) => { // tampa de metal do tanque: clang + gole oco
      osc(n, 'square', 620, 520, t, 0.07, 0.12); osc(n, 'sine', 180, 120, t + 0.06, 0.2, 0.3);
      noise(n, t + 0.1, 0.18, 0.15, 'bandpass', 500, 4, 0.02);
    }),
    noKey: () => voice(0.4, (t, n) => [0, 0.18].forEach((d) => osc(n, 'square', 150, 150, t + d, 0.1, 0.14))), // dois bipes graves
    openCrate: () => voice(0.2, (t, n) => { // madeira: rangido de porta de armário
      osc(n, 'triangle', 180, 420, t, 0.16, 0.15);
      noise(n, t, 0.08, 0.15, 'bandpass', 1800, 3, 0.005);
    }),
    openTrunk: () => voice(0.3, (t, n) => { // tranca (clique) + tampa rangendo
      noise(n, t, 0.03, 0.4, 'highpass', 2500, 0.7, 0.002);
      osc(n, 'square', 1500, 1500, t + 0.07, 0.04, 0.12);
      osc(n, 'triangle', 150, 300, t + 0.14, 0.15, 0.1);
    }),
    openTomb: () => voice(0.35, (t, n) => noise(n, t, 0.3, 0.25, 'lowpass', 600, 0.5, 0.03)), // terra/pá suave
    stowBag: () => voice(0.2, (t, n) => { // tecido + zíper curto
      noise(n, t, 0.12, 0.2, 'bandpass', 1200, 0.8, 0.03);
      osc(n, 'square', 2600, 2600, t + 0.09, 0.02, 0.07);
    }),
    stowBox: () => voice(0.14, (t, n) => { // baque leve no contêiner
      osc(n, 'sine', 140, 60, t, 0.1, 0.3);
      noise(n, t, 0.05, 0.12, 'lowpass', 300, 0.7, 0.003);
    }),
    cut: () => voice(0.12, (t, n) => { // estalo metálico seco
      noise(n, t, 0.04, 0.5, 'highpass', 3000, 0.7, 0.002);
      osc(n, 'square', 1800, 1200, t, 0.05, 0.12);
    }),
    toolBreak: () => voice(0.5, (t, n) => { // estalo + tilintar
      noise(n, t, 0.05, 0.6, 'highpass', 2500, 0.7, 0.002);
      osc(n, 'sine', 2400, 2400, t + 0.06, 0.4, 0.12);
      osc(n, 'sine', 3100, 3100, t + 0.1, 0.35, 0.08);
    }),
    locked: () => voice(0.5, (t, n) => { // sacudida: 3 batidas de madeira + tilintar de cadeado
      [0, 0.09, 0.18].forEach((d) => {
        osc(n, 'sine', 160, 70, t + d, 0.07, 0.4);
        noise(n, t + d, 0.04, 0.25, 'lowpass', 500, 0.7, 0.003);
      });
      osc(n, 'sine', 2300, 2300, t + 0.03, 0.3, 0.07);
      osc(n, 'sine', 3000, 3000, t + 0.12, 0.25, 0.05);
    }),
    closeBox: () => voice(0.12, (t, n) => osc(n, 'sine', 140, 90, t, 0.1, 0.3)), // batida suave ao fechar
    carDmg: (ev) => { // lata: ruído agudo curto + tom metálico; volume pelo dano (ev.d)
      const now = performance.now();
      if (now - dmgAt < 150) return;
      dmgAt = now;
      const v = Math.max(0.05, Math.min(0.5, (ev.d || 0) * 0.01));
      voice(0.2, (t, n) => { noise(n, t, 0.1, v, 'highpass', 2500, 0.7, 0.002); osc(n, 'sine', 1400, 900, t, 0.15, v * 0.5); });
    },
    carFire: () => voice(1.0, (t, n) => noise(n, t, 0.9, 0.35, 'lowpass', 900, 0.5, 0.1)), // fogo do carro: o whoosh do fire, mais longo
    blast: () => voice(0.8, (t, n) => { // explosão: boom grave + ruído
      osc(n, 'sine', 120, 35, t, 0.6, 0.7);
      noise(n, t, 0.6, 0.5, 'lowpass', 500, 0.7, 0.003);
    }),
    spill: () => voice(0.15, (t, n) => { // gotejar: dois pingos curtos caindo
      osc(n, 'sine', 900, 500, t, 0.05, 0.12);
      osc(n, 'sine', 700, 400, t + 0.07, 0.05, 0.1);
    }),
    headshot: () => voice(0.2, (t, n) => { // estalo seco + queda grave (cabeca)
      noise(n, t, 0.04, 0.7, 'highpass', 2200, 0.7, 0.002);
      osc(n, 'square', 900, 300, t, 0.08, 0.2); osc(n, 'sine', 120, 45, t + 0.04, 0.15, 0.5);
    }),
    legshot: () => voice(0.4, (t, n) => { // baque na perna + gemido curto
      osc(n, 'sine', 140, 50, t, 0.12, 0.55); noise(n, t, 0.05, 0.25, 'lowpass', 350, 0.7, 0.003);
      osc(n, 'sawtooth', 210, 120, t + 0.08, 0.28, 0.12);
    }),
    miss: () => voice(0.25, (t, n) => { noise(n, t, 0.2, 0.22, 'bandpass', 3200, 2.5, 0.03); osc(n, 'sine', 2600, 1400, t, 0.18, 0.06); }), // bala passando: zunido agudo caindo
    scream: () => voice(0.4, (t, n) => { // grunhido curto que chama os vizinhos
      osc(n, 'sawtooth', 240, 130, t, 0.35, 0.16); osc(n, 'square', 120, 90, t, 0.35, 0.06);
      noise(n, t, 0.3, 0.12, 'bandpass', 700, 1.2, 0.04);
    }),
    hordeMoan: (ev) => { // gemido de horda: 1 voz, ganho pela distancia (<= 25 m)
      const now = performance.now(), v = Math.max(0, 1 - (ev.d || 25) / 25) * 0.3;
      if (now - moanAt < 1500 || v < 0.01) return;
      moanAt = now;
      voice(1.5, (t, n) => { [110, 82, 65].forEach((f, i) => osc(n, 'sawtooth', f * 1.1, f * 0.8, t + i * 0.12, 1.3 - i * 0.12, v * 0.4)); noise(n, t, 1.3, v * 0.3, 'lowpass', 300, 0.6, 0.2); });
    },
    drag: (vol) => { // rastejante arrastando o corpo: raspado baixo e fosco, 1 voz, >= 1,5 s entre sons
      const now = performance.now();
      if (now - dragAt < 1500) return;
      dragAt = now;
      voice(0.5, (t, n) => { noise(n, t, 0.45, 0.2 * (vol || 1), 'bandpass', 380, 1.5, 0.12); noise(n, t + 0.1, 0.3, 0.1 * (vol || 1), 'lowpass', 220, 0.8, 0.1); });
    },
    carDead: () => voice(0.5, (t, n) => { // motor engasgando: três trancos curtos
      [0, 0.1, 0.2].forEach((d) => osc(n, 'sawtooth', 110, 60, t + d, 0.08, 0.12));
      noise(n, t, 0.4, 0.1, 'bandpass', 300, 0.8, 0.02);
    }),
  };

  // Evento -> som. door: abrir/fechar pelo ev.open. search: só o início (p:0 com action ativa; cancelamento tem action null).
  // windup: rosnado só se o zumbi estiver a <12 m do jogador. open: ev.kind = crate|trunk|tomb. move: to 'inv' = mochila.
  function play(ev, G) {
    if (ev.type === 'door') return (ev.gate ? (ev.open ? SND.gateOpen : SND.gateClose) : (ev.open ? SND.doorOpen : SND.doorClose))();
    if (ev.type === 'stairs') { // jogador: passos no inicio (p:0 com acao ativa); zumbi (up definido, sem done): baixo e so a <12 m
      const a = G.player && G.player.action, z = ev.up !== undefined && !ev.done && (G.zombies || []).find((e) => e.id === ev.id);
      if (ev.p === 0 && a && a.type === 'stairs' && a.id === ev.id) SND.stairs(1);
      else if (z && G.player && Math.hypot(z.x - G.player.x, z.y - G.player.y) < 12) SND.stairs(0.4);
      return;
    }
    if (ev.type === 'open') return (ev.kind === 'trunk' ? SND.openTrunk : ev.kind === 'tomb' ? SND.openTomb : SND.openCrate)();
    if (ev.type === 'move') return (ev.to === 'inv' ? SND.stowBag : SND.stowBox)();
    if (ev.type === 'close') return SND.closeBox();
    if (ev.type === 'windup') {
      const z = (G.zombies || []).find((e) => e.id === ev.id), p = G.player;
      if (z && p && Math.hypot(z.x - p.x, z.y - p.y) < 12) SND.windup();
      return;
    }
    if (ev.type === 'search') { const a = G.player && G.player.action; if (ev.p === 0 && a && a.id === ev.id) SND.search(); return; }
    if (ev.type === 'engine') return (ev.on ? SND.engineOn : SND.engineOff)();
    if (SND[ev.type]) SND[ev.type](ev); // siphon/pour não têm one-shot: o loop do sifão cuida

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
          if (G.zombies) { // arrasto: rastejante perseguindo a < 12 m (volume pela distancia)
            for (const z of G.zombies) {
              const d = z.crawl && z.state === 'chase' && Math.hypot(z.x - p.x, z.y - p.y);
              if (d && d < 12) { SND.drag(1 - d / 12); break; }
            }
          }
          if (now - climbAt >= 0.5 && G.zombies) { // raspar enquanto algum zumbi sobe cerca perto (1 som a cada 0,5 s)
            for (const z of G.zombies) {
              if (z.anim && z.anim.act === 'climb' && Math.hypot(z.x - p.x, z.y - p.y) < 12) {
                climbAt = now; SND.climb(); break;
              }
            }
          }
          // loops: motor (dirigindo com motor ligado), sifão (action siphon) e fogo (G.fires < 15 m). Param ao sair/morrer/mudo.
          const car = p.car && (G.cars || []).find((c) => c.id === p.car);
          if (!G.dead && p._eng && car) { const L = loopOn('engine', engineLoop); if (L) L.set(Math.min(1, Math.abs(car.speed || 0) / 11)); }
          else loopOff('engine');
          if (!G.dead && p.action && p.action.type === 'siphon') { const L = loopOn('siphon', bubbleLoop); if (L) L.set(1); }
          else loopOff('siphon');
          let fd = Infinity;
          for (const f of G.fires || []) fd = Math.min(fd, Math.hypot(f.x - p.x, f.y - p.y));
          if (!G.dead && fd < 15) { const L = loopOn('fire', fireLoop); if (L) L.set(1 - fd / 15); }
          else loopOff('fire');
        }
        lastX = p.x; lastY = p.y;
      }
    } catch (e) {}
  }

  function mute(v) {
    muteOn = !!v;
    if (muteOn) for (const k of Object.keys(LOOPS)) loopOff(k);
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
