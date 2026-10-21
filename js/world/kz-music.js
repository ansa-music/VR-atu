// js/world/kz-music.js — синтез «казахских» тембров на WebAudio (без сэмплов, канон: music synth-only).
// домбыра (щипок, 2 струны, кварта), қобыз (смычковый, хрипловатый, вибрато), сыбызғы (флейта с придыханием и бурдоном горла),
// шаңқобыз (варган: бурдон + подвижная форманта). Кюй-мотивы: лады близкие к эолийскому/дорийскому, ритм «шертпе»/«төкпе».
// API: KZ_INSTRUMENTS, KZ_KUIS (биом -> кюй), playNote(ctx,dest,instr,midi,t,dur,vel), createKzMusic(ctx,{biome}) -> {start,stop,setIntensity,setBiome}
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const SCALES = Object.freeze({ aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] });
export const KZ_INSTRUMENTS = Object.freeze({
  dombyra: { kk: 'Домбыра', lat: 'Dombyra', recipe: '2 струны в кварту: saw+triangle, lowpass 2.2кГц→600Гц за 0.25с (щипок), атака 3мс, спад 0.6с; «қағыс» — второй голос +5 полутонов через 12мс' },
  qobyz: { kk: 'Қылқобыз', lat: 'Qylqobyz', recipe: 'saw ×2 (расстройка ±7 центов) → bandpass 900Гц Q2 + waveshaper (хрип конского волоса) + шумовой смычок; вибрато 5.5Гц ±18 центов, атака 120мс' },
  sybyzgy: { kk: 'Сыбызғы', lat: 'Sybyzğy', recipe: 'sine+triangle(×2) + полосовой шум 1.8кГц (дыхание) 15%; горловой бурдон — sine на квинту ниже, 8%' },
  shankobyz: { kk: 'Шаңқобыз', lat: 'Şañqobyz', recipe: 'бурдон pulse(square) на тонике → bandpass, частота которого «говорит» 400–2400Гц (форманты рта) по LFO/ритму' },
  dauylpaz: { kk: 'Дауылпаз', lat: 'Dauylpaz', recipe: 'бой: sine 70→45Гц за 0.2с + шумовой щелчок; только в бою' },
});
// кюи: tonic (midi), лад, темп, мотив (ступени лада; '-' пауза), ведущий инструмент. Шертпе — щипковый, медленный; төкпе — быстрый, «бьющий» (бой).
export const KZ_KUIS = Object.freeze({
  b_meadow:       { kk: 'Сарыарқа', lat: 'Saryarqa', note: 'по мотивам стиля кюя «Сарыарқа» (Құрманғазы) — не цитата', tonic: 50, scale: 'dorian', bpm: 112, lead: 'dombyra', style: 'tokpe', motif: [0, 2, 4, 4, 3, 2, 0, '-', 4, 5, 4, 2, 3, 2, 0, '-'] },
  b_forest:       { kk: 'Алтай сарыны', lat: 'Altai saryny', tonic: 48, scale: 'aeolian', bpm: 72, lead: 'sybyzgy', style: 'sherpe', motif: [0, '-', 2, 4, 3, '-', 2, 0, -1, '-', 0, 2, 0, '-', '-', '-'] },
  b_swamp:        { kk: 'Арал зары', lat: 'Aral zary', note: 'плач (зар) — медленный, қобыз', tonic: 45, scale: 'phrygian', bpm: 60, lead: 'qobyz', style: 'sherpe', motif: [0, '-', 1, 0, '-', -2, -1, 0, '-', '-', 3, 1, 0, '-', '-', '-'] },
  b_mountains:    { kk: 'Тәңіртау', lat: 'Täñirtau', tonic: 52, scale: 'aeolian', bpm: 80, lead: 'sybyzgy', style: 'sherpe', motif: [4, '-', 3, 4, 6, 4, 3, '-', 2, 0, 2, 3, '-', 2, 0, '-'] },
  b_desert_ruins: { kk: 'Шарын', lat: 'Şaryn', tonic: 49, scale: 'phrygian', bpm: 96, lead: 'shankobyz', style: 'tokpe', motif: [0, 0, 1, 0, 3, '-', 1, 0, 0, 0, 1, 3, 4, 3, 1, 0] },
  b_volcano:      { kk: 'Айдаһар', lat: 'Aidahar', tonic: 43, scale: 'phrygian', bpm: 132, lead: 'qobyz', style: 'tokpe', motif: [0, 1, 0, '-', 0, 1, 3, 1, 0, '-', 4, 3, 1, 0, -1, 0] },
});
export const BIOME_KUI_IDS = Object.keys(KZ_KUIS);
export function degreeToMidi(tonic, scale, deg) { const s = SCALES[scale], n = s.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n; return tonic + 12 * o + s[i]; }

function env(g, t, a, peak, d, sus = 0.0001) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + d); }
let _noise = null;
function noiseBuf(ctx) { if (_noise && _noise.sampleRate === ctx.sampleRate) return _noise; const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0); let s = 1; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823 - 1; } return (_noise = b); }
function osc(ctx, type, f, t, end, detune = 0) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune; o.start(t); o.stop(end); return o; }
let _curve = null; const hairCurve = () => _curve || (_curve = Float32Array.from({ length: 256 }, (_, i) => { const x = i / 128 - 1; return Math.tanh(x * 2.2); }));

/** Одна нота. Возвращает время окончания. Все узлы самоочищаются (stop). */
export function playNote(ctx, dest, instr, midi, t, dur = 0.4, vel = 0.6) {
  const f = mtof(midi), end = t + dur + 0.8, out = ctx.createGain(); out.connect(dest);
  switch (instr) {
    case 'dombyra': {
      for (const [semi, dl, g] of [[0, 0, 1], [5, 0.012, 0.55]]) { const o1 = osc(ctx, 'sawtooth', mtof(midi + semi), t + dl, end), o2 = osc(ctx, 'triangle', mtof(midi + semi), t + dl, end, 4), lp = ctx.createBiquadFilter(), ga = ctx.createGain(); lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(2200, t + dl); lp.frequency.exponentialRampToValueAtTime(600, t + dl + 0.25); o1.connect(lp); o2.connect(lp); lp.connect(ga); ga.connect(out); env(ga, t + dl, 0.003, vel * 0.35 * g, 0.6); }
      break;
    }
    case 'qobyz': {
      const lfo = osc(ctx, 'sine', 5.5, t, end), lg = ctx.createGain(); lg.gain.value = 18; lfo.connect(lg);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2; const ws = ctx.createWaveShaper(); ws.curve = hairCurve(); const ga = ctx.createGain();
      for (const dt of [-7, 7]) { const o = osc(ctx, 'sawtooth', f, t, end, dt); lg.connect(o.detune); o.connect(ws); }
      const nz = ctx.createBufferSource(); nz.buffer = noiseBuf(ctx); nz.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = f * 3; nf.Q.value = 6; const ng = ctx.createGain(); ng.gain.value = 0.25; nz.connect(nf); nf.connect(ng); ng.connect(ws); nz.start(t); nz.stop(end);
      ws.connect(bp); bp.connect(ga); ga.connect(out); env(ga, t, 0.12, vel * 0.3, dur, vel * 0.08); ga.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
      break;
    }
    case 'sybyzgy': {
      const ga = ctx.createGain(); const o = osc(ctx, 'sine', f, t, end), o2 = osc(ctx, 'triangle', f * 2, t, end); const g2 = ctx.createGain(); g2.gain.value = 0.2; o.connect(ga); o2.connect(g2); g2.connect(ga);
      const dr = osc(ctx, 'sine', f * 2 / 3 / 2, t, end), dg = ctx.createGain(); dg.gain.value = 0.08; dr.connect(dg); dg.connect(ga);
      const nz = ctx.createBufferSource(); nz.buffer = noiseBuf(ctx); nz.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 1.5; const ng = ctx.createGain(); ng.gain.value = 0.15; nz.connect(nf); nf.connect(ng); ng.connect(ga); nz.start(t); nz.stop(end);
      ga.connect(out); env(ga, t, 0.06, vel * 0.3, dur, vel * 0.1); ga.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
      break;
    }
    case 'shankobyz': {
      const o = osc(ctx, 'square', f / 2, t, end), bp = ctx.createBiquadFilter(), ga = ctx.createGain(); bp.type = 'bandpass'; bp.Q.value = 8; bp.frequency.setValueAtTime(400, t); bp.frequency.linearRampToValueAtTime(2400, t + dur * 0.4); bp.frequency.linearRampToValueAtTime(700, t + dur);
      o.connect(bp); bp.connect(ga); ga.connect(out); env(ga, t, 0.01, vel * 0.25, dur, vel * 0.05); ga.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
      break;
    }
    case 'dauylpaz': {
      const o = osc(ctx, 'sine', 70, t, end), ga = ctx.createGain(); o.frequency.exponentialRampToValueAtTime(45, t + 0.2); o.connect(ga); ga.connect(out); env(ga, t, 0.004, vel * 0.7, 0.35);
      break;
    }
    default: throw new Error('kz-music: unknown instrument ' + instr);
  }
  setTimeout?.(() => { try { out.disconnect(); } catch {} }, (end - ctx.currentTime + 0.2) * 1000);
  return end;
}
/** Плеер кюя по биому: lookahead-планировщик 100мс; intensity 0..1 (бой) ускоряет темп до +35% и добавляет дауылпаз и бурдон домбыры. */
export function createKzMusic(ctx, { biome = 'b_meadow', volume = 0.5, destination } = {}) {
  const master = ctx.createGain(); master.gain.value = volume; master.connect(destination || ctx.destination);
  let kui = KZ_KUIS[biome] || KZ_KUIS.b_meadow, step = 0, next = 0, timer = null, intensity = 0;
  const tick = () => {
    const spb = 60 / (kui.bpm * (1 + 0.35 * intensity)) / 2;
    while (next < ctx.currentTime + 0.1) {
      const d = kui.motif[step % kui.motif.length];
      if (d !== '-') playNote(ctx, master, kui.lead, degreeToMidi(kui.tonic + 12, kui.scale, d), next, spb * (kui.style === 'sherpe' ? 1.8 : 0.9), 0.55);
      if (step % 8 === 0) playNote(ctx, master, 'dombyra', kui.tonic, next, spb * 4, 0.35); // бурдон тоники
      if (intensity > 0.3 && step % 4 === 0) playNote(ctx, master, 'dauylpaz', 0, next, 0.3, 0.3 + 0.4 * intensity);
      step++; next += spb;
    }
  };
  return {
    start() { if (timer) return; next = ctx.currentTime + 0.05; timer = setInterval(tick, 25); tick(); },
    stop() { clearInterval(timer); timer = null; master.gain.setTargetAtTime(0, ctx.currentTime, 0.3); },
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
    setBiome(id) { if (KZ_KUIS[id]) { kui = KZ_KUIS[id]; step = 0; } },
    get biome() { return Object.keys(KZ_KUIS).find((k) => KZ_KUIS[k] === kui); },
    master,
  };
}
/** Короткие SFX кастов по стихии (для системы заклинаний sp_*). */
export const KZ_CAST_SFX = Object.freeze({ fire: ['dombyra', [0, 4, 7]], frost: ['sybyzgy', [7, 12]], lightning: ['shankobyz', [0, 12]], arcane: ['qobyz', [0, 3, 7]], poison: ['shankobyz', [0, 1]], physical: ['dauylpaz', [0]], wind: ['sybyzgy', [0, 5, 10]], water: ['sybyzgy', [0, 3]] });
export function playCast(ctx, dest, element, t = ctx.currentTime) { const [ins, iv] = KZ_CAST_SFX[element] || KZ_CAST_SFX.arcane; iv.forEach((s, i) => playNote(ctx, dest, ins, 62 + s, t + i * 0.07, 0.25, 0.5)); }
