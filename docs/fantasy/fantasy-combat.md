# fantasy-combat — оружие и противники (аккаунт 3 «Бой»)

Ветка `fantasy-combat` от `fantasy` (ae00e50). `js/main.js` не менялся — подключение делает ядро (аккаунт 1).
Проверено: логика в Node (оружие, лук/клинок, режимы, противники — 53 проверки, включая отсутствие аллокаций в кадре) (`tests/node/*.test.mjs`), сцена — `tests/combat.html` в Chromium (ПК-режим и эмулятор Quest 3 `?xr`). В настоящем шлеме не проверялось.

## Что готово
| Файл | Что внутри |
|---|---|
| `js/arsenal.js` | **только добавлено**: мана для `action: 'mana' \| 'melee' \| 'bow'`. Старые `WEAPONS`/`Weapon`/`Arsenal` работают как раньше (новые ветки кода срабатывают только при `manaFed`), подписи режимов добавлены в `MODE_LABEL`. |
| `js/fantasy/weapons.js` | `FANTASY_WEAPONS` (5 стволов на слотах 0..4), стихии, параметры выстрела, лук/клинок-помощники |
| `js/fantasy/models.js` | `createFantasyGun` — процедурные аниме-модели (4–5 мешей), рукоять в `GRIP`; при наличии `assets/models/<id>.glb` подменяет вид на GLB |
| `js/fantasy/bow.js` | `createBowController` — натяжение тетивы свободной рукой |
| `js/fantasy/melee.js` | `createMelee` — удары клинком по «прометённому» лезвию; `createSlashWaves` — полёт волн-полумесяцев |
| `js/fantasy/enemies.js` | `createEnemies` — 6 типов противников на InstancedMesh, огненные шары, стихии, замедление |
| `js/fantasy/waves.js` | `createWaveDirector` — режимы «Испытание духов», «Волны», «Дуэль с боссом» |
| `tests/combat.html` (+ `tests/combat-xr.js`) | тестовая сцена только с оружием и противниками; `?xr` — эмулятор Quest 3 (`window.xrTest`), `?glb=0` — процедурные модели, `?quality=low` |
| `tests/node/` | проверки логики: `node tests/node/weapons.test.mjs`, `node tests/node/waves.test.mjs`, `node --import ./tests/node/register.mjs tests/node/bow-melee.test.mjs` |

Общее: векторы — `THREE.Vector3`, мировые координаты, метры, пол y = 0. Возвращаемые массивы/объекты **переиспользуются** (валидны до следующего вызова того же метода) — копируйте, если храните. В кадре нет аллокаций.

## weapons.js
```js
import { FANTASY_WEAPONS, FANTASY_IDS, ELEMENTS, ELEMENT_ORDER, createFantasyArsenal,
         nextElement, shotParams, bowRelease, bladeWave, spreadDir } from './fantasy/weapons.js';

FANTASY_WEAPONS // [wand, staff, blade, bow, gauntlet] — индексы 0..4 = старые слоты/кобуры (ПМ, АК, МР-133, СВ-98, бластер)
// поля как у WEAPONS + id, slot, name, short, title, action: 'mana'|'melee'|'bow',
// manaMax, manaCost, manaRegen (/с), manaDelay (с до восстановления), restoreTime (с, «перезарядка»),
// velocity, gravity, drag, damage, maxRange, color, bolt; адаптировано под Weapon (spread, recoil, drawTime, adsFov…)
// wand:  charge { time 1.1, min 0.3, cost 22, damageMul 5, speedMul 1.6, radius 1.2 }
// staff: elements: true, modes ['fire','ice','lightning'], auto: true, twoHanded: true
// blade: waveCost 25, swing { minSpeed 2, fullSpeed 7, waveSpeed 6, damage 2 }, wave { speed 16, damage 3, range 30, width 1.6 }
// bow:   draw { length 0.55, min 0.12, minSpeed 18, maxSpeed 95, maxDamage 4, grab 0.14 }, zoom 4, scopeFov 10
// gauntlet: auto, быстрые болты ки
ELEMENTS // { fire: { color, burn {dps,time} }, ice: { slow {mul,time} }, lightning: { chain {count,radius,mul} } }

createFantasyArsenal() → Arsenal(FANTASY_WEAPONS)   // в руках по умолчанию посох (индекс 1, как АК)
nextElement(weapon) → 'fire'|'ice'|'lightning'|null // кнопка B у посоха; событие 'element-switch'
shotParams(weapon, shot, power?) → { speed, damage, color, gravity, drag, element, radius, charge, maxRange, bolt, penetration, size }
  // всё для ballistics.fire(); radius > 0 — взрыв по области (заряженный жезл)
bowRelease(weapon, power 0..1) → shot | null        // списывает ману, учитывает откат
bladeWave(weapon, strength) → shot | null           // списывает waveCost; событие 'wave'
```
### Мана в `Weapon` (js/arsenal.js, добавлено)
```js
w.manaFed            // true для фэнтези-оружия
w.mana, w.mana01     // запас и доля 0..1 (для наруча: weapon: { name, mana01 })
w.charge01           // заряд жезла 0..1 или null
w.element            // стихия посоха (= w.mode) или null
w.pull(first)        // жезл: нажатие начинает заряд (null); посох/перчатка: { shot, power, element } | { dry } | null
w.release()          // ОТПУСКАНИЕ КУРКА — обязательно вызывать для жезла: { shot, charge 0..1, cost } | { dry } | null
w.spend(cost) → bool, w.restoreMana(amount = всё), w.markShot(power)
w.startReload()      // медленное восполнение маны за restoreTime (reloadState.kind === 'mana')
w.manualMagSwap()    // кристалл маны с пояса (vr-handling «подсумок») — мана сразу полная
// события drain(): 'shot' {power?}, 'dry', 'mana-empty', 'charge-start', 'charge-full', 'charged-shot' {charge},
//                  'mode' {mode}, 'element-switch' {element}, 'wave' {power}, 'reload-start' {kind:'mana'}, 'reloaded', 'mana-restore'
```

## models.js
```js
import { createFantasyGun, FANTASY_GUN_IDS, ELEMENT_COLORS } from './fantasy/models.js';
createFantasyGun(id, { color, quality, glb = true }) → {
  id, group, muzzle /*Object3D*/, ejector: null, sight /*Vector3*/, eyeDist, lens /*Mesh у лука, иначе null*/,
  fire(), update(dt, { mana01, charge01, element, draw01, moving, aim }),
  setElement(el), setCharge(x01), setDraw(x01), setColor(hex),
  string /*лук: точка тетивы, userData.restLocal — покой*/, tip, base /*клинок*/, crystal /*посох*/,
}
```
- Интерфейс как у `createGun` из `js/guns.js`: рукоять в `GRIP` (перчатка подходит), вперёд −Z. Геометрия кэшируется на тип. Меши: wand 4, staff 5, blade 5, bow 5 (+ тетива LineSegments), gauntlet 4; +1 спрайт ореола.
- GLB: если `assets/models/<id>.glb` есть (сейчас есть все 5), вид подменяется на GLB через `assets.js`, маркеры Muzzle/String/Tip/Crystal переносятся. **Процедурные модели выглядят заметно лучше GPT-моделей** — чтобы оставить их, передайте `glb: false`. Решение за ядром/пользователем.
- GLB-лук из `assets/models` без маркеров `StringTop`/`StringBottom`: тетива рисуется по процедурным точкам, а своя тетива GLB статична — с `glb: false` лук выглядит правильно.
- Треугольники процедурных: staff и bow ≈ 8,5 тыс. (выше бюджета GLB 5000, но 4–5 вызовов отрисовки). Если Quest не тянет — `glb: true` (GLB по 400–950).

## bow.js
```js
const bowCtl = createBowController({ length = 0.55, min = 0.12, grab = 0.14 });
const rel = bowCtl.update(dt, { bow /*модель лука*/, bowHand, drawHand /*Object3D|Vector3 свободной руки*/, drawing /*курок или хват свободной руки*/ });
// rel = { power 0..1, origin, dir } в кадр отпускания тетивы (иначе null); стрела летит от руки к луку
bowCtl.draw01, bowCtl.nocked, bowCtl.near /*рука у тетивы — подсветка/вибрация*/, bowCtl.ticks /*щелчки натяжения 0..10*/, bowCtl.cancel()
// выстрел: const r = bowRelease(weapon, rel.power); if (r) ballistics.fire({ origin: rel.origin, dir: rel.dir, ...shotParams(weapon, r, rel.power) })
```
Захват: нажать курок/хват свободной рукой у точки тетивы (≤ 14 см), тянуть назад вдоль лука. Рука увела в сторону > 35 см — тетива срывается без выстрела. Модель натягивается сама (`setDraw`).

## melee.js
```js
const melee = createMelee({ minSpeed = 2, fullSpeed = 7, waveSpeed = 6 });
const hits = melee.update(dt, { blade /*модель клинка: tip, base, group*/, hand, hittables /*enemies.meshes*/ });
// hits: [{ object, instanceId, point, strength 0..1, dir }] — одна цель не бьётся дважды за 0,35 с
melee.wave       // { origin, dir, up, power } в кадр окончания сильного взмаха (пик скорости кончика ≥ 6 м/с), иначе null
melee.tipSpeed   // м/с
melee.segment    // { from, to } путь кончика за кадр — разрубить/отразить снаряд: enemies.projectiles.hitTest(from, to, 0.12)
melee.reset()    // при смене оружия

const slashes = createSlashWaves(scene, { quality });   // 1 InstancedMesh
if (melee.wave && bladeWave(weapon, melee.wave.power)) slashes.spawn(melee.wave, weapon.def.wave);
slashes.update(dt, { hittables: enemies.meshes, onHit: ({ object, instanceId, point, damage }) => enemies.hit(object, point, { damage, instanceId }), timeScale });
```
Урон удара: `def.swing.damage * (0.5 + strength)`.

## enemies.js
```js
const enemies = createEnemies(scene, { quality, glb });   // glb: по умолчанию GLB только у огонька и стража; false — все процедурные; ['wisp',…] — свой набор
enemies.spawn(type, position?) → enemy | null   // 'wisp'|'fairy'|'skull'|'guardian'|'eye'|'boss'; без position — перед игроком
enemies.update(dt, { headPos, headDir, timeScale }) → events  // всё мировое время = dt * timeScale (ускорение восприятия ×0.25)
enemies.meshes                                    // для Raycaster: тела и слабые места (InstancedMesh → intersection.instanceId)
enemies.hit(mesh, point, { damage = 1, element = null|'fire'|'ice'|'lightning'|'rune', instanceId }) →
  { killed, points, type, weakPoint, blocked, enemy, position } | null
enemies.explode(point, radius, { damage, element }) → [результаты как у hit]   // урон по области
enemies.threat(origin, dir)                       // вызывать на каждый выстрел игрока: огоньки уворачиваются
enemies.count, enemies.countOf(type), enemies.boss, enemies.active, enemies.clear(), enemies.setVisible(b), enemies.dispose()
enemies.group, enemies.capacity, enemies.modelsReady /*Promise*/, enemies.glbUsed
// враг (enemy): type, position (= pos), center (точка прицеливания: руна стража, ядро босса), hp, maxHp, phase, alive
enemies.projectiles = {
  list,                                    // ТОЛЬКО живые огненные шары; у каждого position (Vector3), velocity, deflected
  hitTest(from, to, radius = 0) → { projectile, point, distance } | null,  // отрезок (пуля, кончик клинка)
  deflect(projectile, dir),                // отразить (барьер, клинок): летит по dir ×1.3, бьёт противников
  destroy(projectile),                     // сбит выстрелом
}
```
**Противники:** (события из `hit()`/`spawn()`/`deflect()` между кадрами приходят в следующем `update()`; молния не перескакивает на черепа и стражей; босс 2,2 с поднимается из земли и только потом атакует)
Огонёк-дух +1 (уворачивается, улетает через ~9 с), золотая фея +3 (3 с), проклятый череп −5 (штраф за попадание), каменный страж +8 (идёт к игроку до 1,7 м и бьёт кулаком: замах 0,7 с — `charge`, затем `player-hit` damage 2; тело неуязвимо → `blocked: true`; уязвим руной на груди — `weakPoint`, или любым попаданием с `element: 'rune'`), летучий глаз +5 (3 хп, заряжается и стреляет огненным шаром в голову), каменный колосс +150 (60 хп; лавовое ядро — ×3 урона, тело ×0.25; залпы 3/5 шаров, фаза 2 на 50 %).
**Стихии:** огонь — поджог 1/с на 3 с; лёд — замедление ×0.4 на 3 с; молния — цепь до 3 соседей в 4 м (×0.6).
**События `update()`** (поле `type`; векторы из пула — копировать):
| type | поля | что делать в main.js |
|---|---|---|
| `fireball` | origin, dir, speed, projectile | звук `fireball` |
| `charge` | enemy | звук заряда (глаз/босс) |
| `player-hit` | damage, projectile (у удара стража — null, есть enemy), point | урон игроку: `director.damagePlayer(damage)`, вспышка, вибрация |
| `killed` | enemy, points, position | смерть от поджога/цепи/шара — очки |
| `projectile-hit` | projectile, enemy, killed, points | отражённый шар попал во врага |
| `burst` | position, color, kind | частицы `fx.burst` |
| `chain` | from, to | молния — `fx.tracer` |
| `escaped` | enemy | улетел (без штрафа) |
| `boss-roar` / `boss-phase` | phase | звук `boss-roar`, баннер |

## waves.js
```js
import { createWaveDirector, MODES, MODE_NAME, waveRecipe } from './fantasy/waves.js';
const director = createWaveDirector(enemies, { roundTime = 60, wavesTotal = 10, maxHp = 10 });
MODES // [{ id: 'trial', name: 'Испытание духов' }, { id: 'waves', name: 'Волны' }, { id: 'boss', name: 'Дуэль с боссом' }] (+ hint)
director.start(mode), director.stop()
director.update(dt, { timeScale }) → events: { type: 'wave-start'|'wave-clear'|'boss'|'victory'|'defeat', wave, mode, label }
director.damagePlayer(n) → hp, director.heal(n)
director.mode, running, wave, wavesTotal, timeLeft (испытание), elapsed, hp, maxHp, label
```
«Испытание духов» — 60 с, духи/феи/черепа постоянно, конец — `victory`. «Волны» — 10 волн, 5-я и 10-я с боссом, после очистки +1 хп и пауза 3 с. «Дуэль с боссом» — колосс + глаза/страж в подкрепление, `victory` при смерти колосса. `defeat` при hp = 0. Очки считает main.js по `hit()`/событиям.

## Как подключить в main.js (для ядра)
Рабочий пример всего цикла — `tests/combat.html` (функция `frame`), можно переносить почти дословно.
1. **Оружие** при `settings.mode === 'fantasy'`: `arsenal = createFantasyArsenal()`; модели — `createFantasyGun(def.id, { color: def.color, quality })` вместо `gunMod.createGun` (тот же `GRIP`, кобуры по индексам 0..4 не меняются).
2. **Курок:** для `def.action === 'mana'` — `w.pull(first)` каждый кадр, пока зажат, и **`w.release()` при отпускании** (заряд жезла); выстрел → `ballistics.fire({ origin: muzzle, dir, ...shotParams(w, r), shot: { damage, element, radius } })` и `enemies.threat(origin, dir)`.
   `def.action === 'bow'` — `bowCtl.update(...)` со свободной рукой (курок/хват свободной руки — тетива; в фэнтези они заняты навыками, так что **для лука курок свободной руки отдать тетиве**), затем `bowRelease`.
   `def.action === 'melee'` — `melee.update(...)`, удары → `enemies.hit`, волна → `bladeWave` + `slashes.spawn`, отражение — `projectiles.hitTest(melee.segment.from, melee.segment.to, 0.12)` → `deflect`.
3. **B** на посохе — `nextElement(w)` + `gun.setElement(el)`. **Кристалл маны** с пояса — `w.manualMagSwap()`.
4. **Попадания пуль** (`hitTest` для `ballistics.update`): Raycaster по `enemies.meshes` + `enemies.projectiles.hitTest(from, to)`; в `onHit` — `enemies.hit(object, point, { damage, element, instanceId })`, при `shot.radius` — `enemies.explode(point, radius, …)`; попадание в шар — `projectiles.destroy`.
5. **Навыки ядра:** `projectiles: () => enemies.projectiles` (барьер уже вызывает `list[i].position` и `deflect`); `skillDamage` — `enemies.explode(center, radius, { damage, element })` для сферы/волны ки/рун; руна-молния — `element: 'lightning'`; урон стражу рунами — `element: 'rune'`.
6. **Каждый кадр:** `enemies.update(dt, { headPos, headDir, timeScale: worldScale })`, `director.update(dt, { timeScale })`, `slashes.update(...)`; события → очки, `fx`, `playSpell` (`enemy-hit`, `enemy-die`, `fireball`, `boss-roar`, `fairy`, `skull`, `sword-swing`, `sword-hit`, `bow-draw`, `bow-release`, `arrow-hit`, `charge`, `element-switch`, `mana-restore`).
7. **Меню:** режимы `MODES` → `director.start(id)`; табло — `{ score, timeLeft: director.timeLeft, wave: director.wave }`; результаты — по `victory`/`defeat`.
8. Наруч: `weapon: { name: def.short, mana01: w.mana01 }`.
