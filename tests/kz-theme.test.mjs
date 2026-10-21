// tests/kz-theme.test.mjs — казахская тема: валидатор, орнаменты, модели, музыка (с фейковым AudioContext), локаль.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateKz } from '../tools/validate-kz.mjs';
import { MOTIF_IDS, drawMotif, buildOrnamentAtlas, frameBorder } from '../js/world/kz-ornaments.js';
import { KZ_MODEL_IDS, buildKzModelData } from '../js/world/kz-models.js';
import { KZ_KUIS, KZ_INSTRUMENTS, playNote, createKzMusic, degreeToMidi, playCast } from '../js/world/kz-music.js';
import { applyKzSpellNames, kzSpellName, KZ_THEME } from '../shared/defs/theme_kz.js';

test('validate-kz: 0 ошибок', async () => { const r = await validateKz(); assert.deepEqual(r.errors, []); assert.ok(r.checked >= 150); });
test('орнаменты: каждый мотив рисует fg и bg, детерминированно', () => {
  for (const id of MOTIF_IDS) { const a = drawMotif(id, 64), b = drawMotif(id, 64); assert.deepEqual(a.data, b.data); const fg = [254, 197, 12]; let cnt = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] === fg[0] && a.data[i + 1] === fg[1] && a.data[i + 2] === fg[2]) cnt++; const share = cnt / (64 * 64); assert.ok(share > 0.03 && share < 0.8, `${id} fg share ${share}`); }
});
test('атлас: uv в [0,1] без перекрытий', () => { const a = buildOrnamentAtlas({ cell: 32 }); assert.equal(Object.keys(a.uv).length, MOTIF_IDS.length); for (const [u0, v0, u1, v1] of Object.values(a.uv)) { assert.ok(u0 >= 0 && u1 <= 1 && v0 >= 0 && v1 <= 1 && u1 > u0 && v1 > v0); } });
test('рамка: центр прозрачный, край непрозрачный', () => { const f = frameBorder(128, 96, { band: 16 }); assert.equal(f.data[(48 * 128 + 64) * 4 + 3], 0); assert.equal(f.data[3], 255); });
test('модели: бюджеты, узлы rig, валидные числа', () => {
  for (const id of KZ_MODEL_IDS) { const d = buildKzModelData(id); assert.ok(d.triCount > 50 && d.triCount <= d.budget, id); for (const n of d.nodes) for (const v of n.position) assert.ok(Number.isFinite(v)); }
  const t = buildKzModelData('kz_tulpar'); for (const nm of ['leg_FL', 'leg_FR', 'leg_BL', 'leg_BR', 'wing_L', 'wing_R', 'tail', 'Saddle']) assert.ok(t.nodes.some((n) => n.name === nm), nm);
  assert.ok(buildKzModelData('kz_shanyrak_portal').nodes.some((n) => n.name === 'Surface'));
  assert.ok(buildKzModelData('kz_mausoleum').nodes.some((n) => n.name === 'Door'));
});
// фейковый WebAudio
function fakeCtx() {
  let made = 0; const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = (extra = {}) => { made++; return { connect() {}, disconnect() {}, start() {}, stop() {}, frequency: param(), detune: param(), gain: param(), Q: param(), type: '', ...extra }; };
  return { sampleRate: 8000, currentTime: 0, destination: node(), createGain: () => node(), createOscillator: () => node(), createBiquadFilter: () => node(), createWaveShaper: () => node({ curve: null }), createBufferSource: () => node({ buffer: null, loop: false }), createBuffer: (c, l, sr) => ({ sampleRate: sr, getChannelData: () => new Float32Array(l) }), get made() { return made; } };
}
test('музыка: все инструменты и кюи синтезируются', () => {
  const ctx = fakeCtx();
  for (const ins of Object.keys(KZ_INSTRUMENTS)) assert.ok(playNote(ctx, ctx.destination, ins, 60, 0, 0.3) > 0);
  for (const [b, k] of Object.entries(KZ_KUIS)) { assert.ok(k.motif.length >= 8, b); for (const d of k.motif) if (d !== '-') { const m = degreeToMidi(k.tonic + 12, k.scale, d); assert.ok(m > 40 && m < 90, b); } }
  for (const el of Object.keys(KZ_THEME.elements)) playCast(ctx, ctx.destination, el, 0);
  const mus = createKzMusic(ctx, { biome: 'b_swamp' }); mus.setIntensity(1); mus.start(); mus.setBiome('b_volcano'); assert.equal(mus.biome, 'b_volcano'); mus.stop();
  assert.ok(ctx.made > 50);
});
test('nameKk для sp_*: маппинг по element/role, уникальность', () => {
  const spells = { sp_a: { element: 'fire', role: 'projectile' }, sp_b: { element: 'fire', role: 'projectile' }, sp_c: { element: 'frost', role: 'nova' }, sp_d: { element: 'wind', role: 'dash' }, sp_e: { element: 'unknown' } };
  const out = applyKzSpellNames(spells);
  assert.equal(out.sp_a.nameKk, 'От жебе'); assert.equal(out.sp_b.nameKk, 'От жебе II'); assert.equal(out.sp_c.nameKk, 'Боран'); assert.equal(out.sp_d.nameKk, 'Тұлпар екпіні'); assert.equal(out.sp_e.nameKk, 'Аруақ');
  assert.equal(kzSpellName({ id: 'sp_x', element: 'lightning', role: 'chain' }).nameLat, 'Naizağai tizbegi');
});
test('kk.json валиден', () => { const kk = JSON.parse(fs.readFileSync(new URL('../locales/kk.json', import.meta.url), 'utf8')); assert.equal(kk._meta.lang, 'kk'); assert.ok(Object.keys(kk).length > 60); });
