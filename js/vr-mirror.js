// js/vr-mirror.js — трансляция VR на монитор (ПК-VR: шлем по кабелю/Link, игра в браузере ПК).
// После кадра для шлема сцена ещё раз рисуется в обычный холст страницы — с позиции головы,
// со сглаженным поворотом (зрителей на экране не укачивает). На автономном Quest страницу никто не видит:
// там зеркало выключено, трансляция — встроенная «Трансляция» шлема.
import * as THREE from 'three';

export function createVrMirror(renderer, { enabled = true, fov = 75 } = {}) {
  const cam = new THREE.PerspectiveCamera(fov, 16 / 9, 0.05, 400);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  const size = new THREE.Vector2();
  let first = true;
  let on = enabled;
  let frames = 0;

  return {
    get enabled() { return on; },
    set enabled(v) { on = !!v; first = true; },
    get frames() { return frames; },
    /** Вызывать сразу после renderer.render(scene, camera) в шлеме. */
    render(scene, camera, dt) {
      if (!on || !renderer.xr.isPresenting) { first = true; return; }
      const xrCam = renderer.xr.getCamera();
      xrCam.matrixWorld.decompose(pos, quat, scl);
      // сглаживание: позиция почти сразу, поворот — плавно (без дрожи головы)
      const k = first ? 1 : 1 - Math.exp(-dt * 6);
      cam.position.lerp(pos, first ? 1 : 1 - Math.exp(-dt * 20));
      cam.quaternion.slerp(quat, k);
      first = false;
      const canvas = renderer.domElement;
      size.set(canvas.width, canvas.height);
      if (size.x < 2 || size.y < 2) return;
      cam.aspect = size.x / size.y;
      cam.near = camera.near;
      cam.far = camera.far;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      const prevTarget = renderer.getRenderTarget();
      const pr = renderer.getPixelRatio();
      renderer.xr.enabled = false;
      try {
        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, size.x / pr, size.y / pr);
        renderer.render(scene, cam);
        frames++;
      } finally {
        renderer.xr.enabled = true;
        renderer.setRenderTarget(prevTarget);
      }
    },
  };
}
