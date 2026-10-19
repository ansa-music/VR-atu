# fantasy-world — мир, интерфейс, звук (аккаунт 2)

Готово и проверено на `tests/world.html` (кадры по таймеру, работает и в скрытом окне; `?quality=low|medium|high`). В шлеме не проверялось.

## Файлы
| Файл | Что внутри |
|---|---|
| `js/fantasy/world.js` | парящий остров, магический круг r=11, 8 рунных обелисков, небо с двумя лунами и сиянием, море облаков, замок академии, врата с печатью ATU, «Мост лучников» с рунами 40/75/110 м, 6 платформ для телепорта |
| `js/fantasy/ui.js` | скрижали табло и меню с выбором «Фэнтези/Реализм» (`pick(uv)`), шрифты Ruslan Display + Philosopher |
| `js/fantasy/bracer.js` | магический наруч на левой руке (мана, оружие, руны навыков с откатом, ульта, очки, время, FPS) |
| `js/fantasy/audio.js` | `fantasyMusic` (хор, арфа, струнные, тайко, челеста) и `playSpell` — 26 звуков |
| `js/sfx.js` | только добавлены экспорты `audioCore()`, `musicVolume()`, `noiseBuffer()` |
| `assets/models/` | 16 GLB из GPT, `manifest.json`, `README_RU.md`; на все модели **2 общие текстуры** (1024 на 11 моделей, 512 на 5) — загрузчик должен их делить |
| `tests/world.html` | тестовая страница |

## Нагрузка (вместе со скрижалями и наручем)
Низкое: 22 вызова отрисовки, ~13,8 тыс. треугольников. Сам мир: low 18, medium 19, high 19 вызовов.

## API
```js
import { createFantasyWorld } from './fantasy/world.js';
const world = createFantasyWorld(scene, { quality });   // группа добавлена в сцену и СКРЫТА
world.setVisible(true);      // показывает мир и ставит свои scene.background и scene.fog (цвет 0x3a2a6e, 45–280 м); false — возвращает прежние
world.update(dt, time);      // ничего не делает, пока скрыт
world.colliders;             // 4 объекта: обелиски (InstancedMesh), скалы платформ (InstancedMesh), невидимые коллайдеры врат и моста
world.teleportSurfaces;      // 7 невидимых горизонтальных дисков: верх острова (r 15,2, y 0) и верх 6 платформ — цели мгновенного шага
world.platforms;             // [{ position, radius }] — position.y обновляется (покачивание ±5 см)
world.runes.meshes;          // 3 руны (40, 75, 110 м)
world.runes.hit(mesh, point) // → { distance, points 2/3/5, scored, label '40 м' } | null; после засчитанного попадания 1,2 с scored = false
```
Платформы (верх, радиус): (10.00, 4.8, 0.00) 1.4 · (7.76, 3.2, 9.93) 1.7 · (−3.25, 5.4, 5.63) 1.3 · (−7.05, 4.2, −2.57) 1.6 · (−7.11, 3.0, −10.16) 1.7 · (6.93, 3.6, −4.00) 1.5.
Руны: 40 м (6.33, 1.40, −39.52), 75 м (15.81, 1.80, −73.33), 110 м (20.68, 2.20, −108.04). Врата: центр (2.89, 0, −14.52), печать (2.73, 7.6, −13.71).

```js
import { createFantasyBoard, createFantasyMenu } from './fantasy/ui.js';
const board = createFantasyBoard();   // { mesh, update({ score, timeLeft, multiplier, timeFrac, wave }) } — 4×1 м
const menu = createFantasyMenu();     // { mesh, showStart(roundTime, mode), showCountdown(n), showResults(r), pick(uv), screen, mode } — 2,4×1,2 м
menu.pick(hit.uv);  // 'start' | 'mode-fantasy' | 'mode-realism' | null (uv из raycast по menu.mesh; у плиты-основы raycast отключён)

import { createBracer } from './fantasy/bracer.js';
const bracer = createBracer();        // bracer.group → ребёнок левого контроллера (позиция как у старого наручного экрана)
bracer.update({ mana, maxMana, skills: [{ id, name, ready, cooldown01 /* ОСТАВШЕЕСЯ 1→0 */ }], ult01, score, timeLeft, weapon: { name, mana01 }, fps });
bracer.group.userData.touchPoint;     // Object3D в центре панели — для жеста «коснуться наруча»

import { fantasyMusic, playSpell } from './fantasy/audio.js';
fantasyMusic.start(); fantasyMusic.setIntensity(0..1); fantasyMusic.stop();
playSpell('flash-step', { volume, pitch, distance, element }); // → { stop() } | null
```

## Как подключить в main.js (для ядра)
1. В фэнтези-режиме скрыть старую арену (`soloEnvironment`: env, range, logo) и показать `world.setVisible(true)`; при выходе — наоборот.
2. **Свет:** у мира свои источники света внутри группы — при переключении материалы перекомпилируются один раз. Для прогрева: `world.setVisible(true)`, `renderer.compile(scene, camera)`, `world.setVisible(false)`.
3. Табло и меню: те же вызовы, что у `createScoreboard`/`createMenu`; кнопки меню — через `menu.pick(hit.uv)` вместо «любое попадание = старт».
4. Наруч вместо старого наручного экрана на левой руке.
5. Музыка: при старте `fantasyMusic` остановить старую `music` из sfx.js, иначе заиграют обе. Первый звук — внутри жеста пользователя.
6. Цели телепорта: `world.teleportSurfaces`; коллайдеры снарядов: `world.colliders`; руны моста: `world.runes`.
