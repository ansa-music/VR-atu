// Уровни качества графики. Автономные шлемы (Quest, Pico) получают «низкое»,
// ПК-VR и обычный ПК — «высокое». Переопределение: ?quality=low|medium|high
// или localStorage 'vr-tir-quality'.

export const QUALITY = {
  high: {
    id: 'high', label: 'Высокое',
    pixelRatio: 2,        // максимум devicePixelRatio на ПК
    stars: 1500, dust: 300, city: 70, mountainDetail: 3,
    crystal: 'physical',  // материал кристаллов: physical | standard | basic
    foveation: 0.5,       // фиксированный фовеальный рендер в шлеме, 0..1
    framebufferScale: 1,  // разрешение XR-буфера
    scopeRes: 512,        // текстура оптики СВ-98 в VR
    maxParticles: 600,
  },
  medium: {
    id: 'medium', label: 'Среднее',
    pixelRatio: 1.5,
    stars: 900, dust: 150, city: 50, mountainDetail: 2,
    crystal: 'standard',
    foveation: 0.8,
    framebufferScale: 1,
    scopeRes: 384,
    maxParticles: 400,
  },
  low: {
    id: 'low', label: 'Низкое',
    pixelRatio: 1,
    stars: 500, dust: 0, city: 36, mountainDetail: 1,
    crystal: 'basic',
    foveation: 1,
    framebufferScale: 0.9,
    scopeRes: 256,
    maxParticles: 250,
  },
};

const ORDER = ['low', 'medium', 'high'];

// браузер автономного шлема или телефона
export function isStandaloneHeadset(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /OculusBrowser|Quest|Pico|Wolvic|VR\b|Mobile VR/i.test(ua);
}

export function detectQuality() {
  let id = null;
  try { id = new URLSearchParams(location.search).get('quality'); } catch {}
  if (!QUALITY[id]) { try { id = localStorage.getItem('vr-tir-quality'); } catch {} }
  if (!QUALITY[id]) {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    id = isStandaloneHeadset(ua) ? 'low' : /Android|iPhone|iPad|Mobile/i.test(ua) ? 'medium' : 'high';
  }
  return QUALITY[id];
}

export function lowerQuality(q) {
  const i = ORDER.indexOf(q.id);
  return i > 0 ? QUALITY[ORDER[i - 1]] : null;
}
