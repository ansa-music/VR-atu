// js/world/ambient-audio.js — природные звуки открытого мира: птицы днём на лугу и в лесу, пар у вулкана.
// Файлы — CC0 (freesound.org через Unity «Create with VR», см. CREDITS.md). Работает через общий контекст sfx.js.
import { audioCore } from '../sfx.js';

const BASE = new URL('../../assets/audio/', import.meta.url).href;
const BIRDS = ['SFX_Bird_1', 'SFX_Bird_2', 'SFX_Bird_3'];
const buffers = {};
let loading = null;

function load(core) {
  if (loading) return loading;
  loading = Promise.all([...BIRDS, 'SFX_Loop_Steam', 'SFX_Liquid_Splash'].map(async (n) => {
    try {
      const res = await fetch(BASE + n + '.ogg');
      buffers[n] = await core.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) { /* нет звука — не страшно */ }
  }));
  return loading;
}

export function createAmbientAudio() {
  let core = null, timer = 2, steam = null, steamGain = null;

  function play(name, vol, pan) {
    const b = buffers[name];
    if (!b || !core) return;
    const src = core.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const g = core.ctx.createGain();
    g.gain.value = vol;
    const p = core.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(g).connect(p).connect(core.sfxBus);
    src.start();
  }

  return {
    // biome — id биома под игроком, night 0..1
    update(dt, biome, night) {
      if (!core) {
        core = audioCore();
        if (!core) return;
        load(core);
      }
      if (core.ctx.state !== 'running') return;
      // птицы днём
      timer -= dt;
      if (timer <= 0) {
        timer = 4 + Math.random() * 8;
        if (night < 0.5 && (biome === 'b_meadow' || biome === 'b_forest')) {
          play(BIRDS[(Math.random() * BIRDS.length) | 0], 0.25 + Math.random() * 0.2, Math.random() * 1.6 - 0.8);
        }
      }
      // пар и гейзеры у вулкана — тихая петля
      const wantSteam = biome === 'b_volcano' && buffers.SFX_Loop_Steam;
      if (wantSteam && !steam) {
        steam = core.ctx.createBufferSource();
        steam.buffer = buffers.SFX_Loop_Steam;
        steam.loop = true;
        steamGain = core.ctx.createGain();
        steamGain.gain.value = 0.15;
        steam.connect(steamGain).connect(core.sfxBus);
        steam.start();
      } else if (!wantSteam && steam) {
        try { steam.stop(); } catch {}
        steam = null;
      }
    },
    splash(vol = 0.5) { play('SFX_Liquid_Splash', vol, 0); },
  };
}
