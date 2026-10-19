# «Академия ATU: Арена магов» — переделка VR-режима в аниме-фэнтези

Общий документ для всех, кто работает над фэнтези-режимом (три аккаунта Claude + 3D-модели из GPT). Читать целиком перед началом работы.

## Рамки
- Только VR (браузер шлема Quest/Pico, WebXR, без проводов, через сайт). ПК, телефон и мультиплеер **не развиваем и не ломаем**: на ПК остаётся текущий реалистичный режим.
- В VR-меню выбор режима: **«Фэнтези»** (по умолчанию) и **«Реализм»** (нынешнее оружие).
- Стиль: магия + энергия аниме. Противники атакуют в ответ (огненные шары, босс). Звук — только синтез (Web Audio), без аудиофайлов.
- Движок не меняем: Three.js r160 из `vendor/`, importmap, без сборки. Бесплатно, работает в браузере шлема.
- Весь интерфейс на русском. Комментарии в коде короткие, на русском.

## Как работаем втроём (важно)
- База — ветка **`fantasy`**. Каждый аккаунт работает в своей ветке от неё и в **своей отдельной папке-клоне** (не в одной папке с другими):
  - Аккаунт 1 «Ядро» — ветка `fantasy-core`
  - Аккаунт 2 «Мир, интерфейс, звук» — ветка `fantasy-world`
  - Аккаунт 3 «Оружие и противники» — ветка `fantasy-combat`
- Новые модули — в папке `js/fantasy/`. Каждый трогает **только свои файлы** (см. таблицу). `js/main.js` правит только аккаунт 1.
- Аккаунты 2 и 3 пушат свои ветки и пишут в `docs/fantasy/<ветка>.md` короткую сводку: что готово, точный API, как подключить.
- Аккаунт 1 вливает `fantasy-world` и `fantasy-combat` в `fantasy`, подключает модули в `main.js`, проверяет. В `main` (живой сайт) — **только после согласия пользователя**.
- Коммиты небольшие и частые. Не добавлять в git чужие файлы (`AGENTS.md`, `ArtCraft/`).

| Файлы | Владелец |
|---|---|
| `js/main.js`, `js/settings.js`, `js/fantasy/skills.js`, `js/fantasy/gestures.js`, `js/fantasy/assets.js`, `vendor/addons/loaders/GLTFLoader.js`, `vendor/addons/utils/BufferGeometryUtils.js` | 1 «Ядро» |
| `js/fantasy/world.js`, `js/fantasy/ui.js`, `js/fantasy/bracer.js`, `js/fantasy/audio.js` (+ только добавочные экспорты в `js/sfx.js`) | 2 «Мир» |
| `js/fantasy/weapons.js`, `js/fantasy/models.js`, `js/fantasy/bow.js`, `js/fantasy/melee.js`, `js/fantasy/enemies.js`, `js/fantasy/waves.js` (+ только добавочные изменения в `js/arsenal.js`) | 3 «Бой» |
| `assets/models/*.glb` | 3D-модели из GPT (кладёт пользователь) |

## Запуск и проверка
- Локальный сервер: `python3 serve.py 8000` (или `python serve.py 8000`), затем http://localhost:8000
- Отладка: `?debug` → `window.vrTirDebug` (state, info: вызовы отрисовки и время кадра).
- VR без шлема: `http://localhost:8000/tests/xr.html?debug&quality=low` — эмулятор Quest 3 (IWER), `window.xrTest` (enter, head, hand, press, hold, stick). Описание — `tests/XR-TEST.md`. Окно браузера должно быть видимым: в скрытом окне кадры не идут.
- Производительность Quest: бюджет ~100 вызовов отрисовки на глаз на «Низком» качестве, никаких аллокаций в кадре, статику склеивать (InstancedMesh / слияние по материалу), прозрачность экономно. Пресеты — `js/quality.js` (`quality.maxParticles`, `quality.crystal` и т. д.).
- Комфорт VR: никакой тряски камеры; вместо неё звук, вибрация контроллеров, вспышки, стоп-кадр 50–80 мс.

## Что уже есть и переиспользуется
- `js/arsenal.js` — `Weapon`/`Arsenal`: перегрев (`action: 'energy'`), разброс, отдача, события через `drain()`.
- `js/ballistics.js` — снаряды с гравитацией и сопротивлением, трассеры, «болты» (`bolt: true`), пробитие.
- `js/vr-holsters.js` — 5 кобур на теле (бедро П/Л, плечо П/Л, спина) → те же места для фэнтези-оружия.
- `js/vr-handling.js` — хват двумя руками, «подсумок» на поясе (станет кристаллом маны).
- `js/vr-comfort.js` — виньетка, моргание, подсказки на контроллерах, `toast()` перед глазами, `showWeapon()`.
- `js/fx.js` — частицы, всплывающие надписи, баннеры; `js/quality.js` — уровни качества.

## Содержание
**Мир (аккаунт 2):** парящий каменный остров в сумерках; магический круг — граница арены (радиус 11 м); рунные обелиски вместо неоновых колонн; небо с двумя лунами и северным сиянием; башня академии вдали; печать-герб ATU над вратами; «Мост лучников» — мишени-руны на парящих скалах на 40/75/110 м (направление как у нынешнего рубежа, `range.js`); 4–6 парящих скал-платформ для мгновенного шага.

**Оружие (аккаунт 3), те же 5 слотов и кобуры:**
| Слот | Было | Стало | Механика |
|---|---|---|---|
| 1 бедро П | ПМ | Жезл «Искра» | быстрые магические стрелы; удержание курка — заряженный выстрел |
| 2 плечо П | АК-74М | Посох стихий | очередь сферами; B — смена стихии: огонь (поджог), лёд (замедление), молния (цепь по соседним); хват двумя руками |
| 3 спина | МР-133 | Клинок души | удары взмахом (скорость кончика > 2 м/с), сильный взмах пускает волну-полумесяц |
| 4 плечо Л | СВ-98 | Лук рун | натяжение тетивы свободной рукой: сила 0..1 → скорость стрелы; стрела по баллистике; руна-прицел с увеличением |
| 5 бедро Л | Бластер | Перчатка ки | выстрелы энергией из ладони |
Вместо патронов — **мана** (как перегрев, но «расходуется» и восстанавливается кристаллом маны с пояса).

**Навыки (аккаунт 1), мана на наруче:**
| Навык | Вызов в шлеме | Эффект |
|---|---|---|
| Мгновенный шаг | левый стик вперёд → дуга → отпустить | телепорт с послеобразами; основное перемещение; цели — пол и платформы |
| Энергосфера | ладонь вверх + хват | шар растёт в руке, бросок рукой — взрыв по области |
| Волна ки | обе руки у пояса, оба хвата 1,5 с, толчок вперёд | луч через арену, вся мана |
| Ускорение восприятия | коснуться наруча другой рукой | мир ×0.25 на 4 с, игрок с нормальной скоростью |
| Барьер | ладонь вперёд + хват | шестиугольный щит, отражает снаряды |
| Небесный шаг | A в прыжке | прыжок от воздуха, до 3 раз |
| Руны жестами | рисовать знак свободной рукой при зажатом курке | круг — щит, треугольник — огненный шар, зигзаг — молния, спираль — мана |
| Ульта «Пробуждение» | шкала от серии + оба хвата + курок | 8 с всё вдвое сильнее, купол «Территории» |

**Противники (аккаунт 3):** огонёк-дух (+1, уворачивается), золотая фея (+3, 3 с), проклятый череп (−5 при попадании), каменный страж (уязвим только руной на груди), летучий глаз (стреляет огненными шарами), босс — каменный колосс в конце волны. Режимы: «Испытание духов» (на время), «Волны», «Небесная тропа», «Дуэль с боссом».

**Интерфейс и звук (аккаунт 2):** меню и табло — каменные скрижали; наруч на левой руке (мана, руны навыков с откатом, ульта, очки, время, FPS); шрифт с кириллицей в фэнтези-стиле (canvas: Google Fonts Ruslan Display / Cormorant); крупные выкрики навыков; музыка — синтез «оркестра» (хор, арфа, барабаны), звуки заклинаний.

## API между модулями (договор; менять — только с записью в docs/fantasy/)
Все функции принимают `{ quality }` — пресет из `js/quality.js`. Векторы — `THREE.Vector3`, мировые координаты, метры, пол y = 0.

### Аккаунт 2 «Мир»
```js
// js/fantasy/world.js
createFantasyWorld(scene, { quality }) → {
  group, setVisible(bool), update(dt, time),
  colliders,            // Mesh[] — снаряды останавливаются (искры)
  teleportSurfaces,     // Mesh[] — куда можно встать мгновенным шагом (пол острова + верх платформ)
  platforms,            // [{ position: Vector3 (центр верха), radius }]
  runes: { meshes, hit(mesh, point) → { distance, points, scored, label } | null }, // мост лучников
}
// js/fantasy/ui.js — тот же API, что createScoreboard/createMenu в js/ui.js, плюс выбор режима
createFantasyBoard() → { mesh, update({ score, timeLeft, multiplier, timeFrac, wave }) }
createFantasyMenu() → { mesh, showStart(roundTime, mode), showCountdown(n), showResults(r), pick(uv) → 'start' | 'mode-fantasy' | 'mode-realism' | null }
// js/fantasy/bracer.js — крепится к левому контроллеру
createBracer() → { group, update({ mana, maxMana, skills: [{ id, name, ready, cooldown01 }], ult01, score, timeLeft, weapon: { name, mana01 }, fps }) }
// js/fantasy/audio.js
fantasyMusic: { start(), stop(), setIntensity(0..1) }
playSpell(name, opts?) // имена: cast-bolt, cast-orb, charge, ki-wave, flash-step, barrier-up, barrier-hit, slowmo-in, slowmo-out,
                       // sword-swing, sword-hit, bow-draw, bow-release, arrow-hit, rune-drawn, rune-fail, ult, enemy-hit,
                       // enemy-die, fireball, boss-roar, fairy, skull, mana-restore, element-switch, level-up
```

### Аккаунт 3 «Бой»
```js
// js/fantasy/weapons.js — описания под Weapon/Arsenal из js/arsenal.js (те же индексы слотов 0..4)
FANTASY_WEAPONS  // { id: 'wand'|'staff'|'blade'|'bow'|'gauntlet', slot, name, title, action: 'mana'|'melee'|'bow', element?, ... }
// js/fantasy/models.js — тот же интерфейс, что createGun в js/guns.js
createFantasyGun(id, { color }) → { id, group, muzzle, ejector: null, sight, eyeDist, lens, fire(), update(dt, s),
                                    string?, tip?, crystal? } // если есть assets/models/<id>.glb — берёт его (через js/fantasy/assets.js), иначе процедурная модель
// js/fantasy/bow.js
createBowController() → { update(dt, { bow, bowHand, drawHand, drawing }) → { power: 0..1 } | null /* отпустили тетиву */, draw01 }
// js/fantasy/melee.js
createMelee() → { update(dt, { blade, hand, hittables }) → [{ object, point, strength }], wave: { origin, dir, power } | null }
// js/fantasy/enemies.js
createEnemies(scene, { quality }) → {
  spawn(type, position?), clear(), update(dt, { headPos, timeScale }) → events, // события: { type: 'fireball', origin, dir, speed } | { type: 'escaped', enemy }
  meshes,                                       // для попаданий
  hit(mesh, point, { damage, element }) → { killed, points, type, weakPoint } | null,
  projectiles: { list, hitTest(segmentFrom, segmentTo) → hit | null, deflect(projectile, dir), destroy(projectile) },
}
// js/fantasy/waves.js
createWaveDirector(enemies) → { start(mode), stop(), update(dt) → events /* wave-start, wave-clear, boss, victory, defeat */ }
```

### Аккаунт 1 «Ядро»
```js
// js/fantasy/assets.js — загрузка GLB из assets/models/ (GLTFLoader r160 в vendor/addons/loaders/)
loadModel(id) → Promise<THREE.Object3D | null>   // null, если файла нет: модули берут процедурную модель
// js/fantasy/skills.js, js/fantasy/gestures.js — внутренние модули ядра
// main.js: settings.mode ('fantasy'|'realism'), timeScale (ускорение восприятия), стоп-кадр, мана, подключение всего выше
```

## 3D-модели (GPT → `assets/models/`)
Формат glTF 2.0 binary `.glb`, метры, Y вверх, вперёд −Z. Оружие: точка (0,0,0) — центр рукояти. Бюджет треугольников: оружие ≤ 5000, противник ≤ 3000, босс ≤ 12000, декор ≤ 2000. Один материал, текстура 1024 (мелочь 512), светящиеся части — emissive. Имена узлов: `Muzzle` (жезл, посох, перчатка), `String` (лук), `Tip` (клинок), `Crystal` (посох), `WeakPoint` (страж, босс). Файлы: `wand.glb, staff.glb, blade.glb, bow.glb, gauntlet.glb, wisp.glb, fairy.glb, skull.glb, guardian.glb, eye.glb, boss.glb, obelisk.glb, platform.glb, seal.glb, rune-target.glb, mana-crystal.glb`. Пока файлов нет — всё работает на процедурных моделях.

## Этапы
0. Ядро: режим в VR-меню, мана, навыки, жесты, загрузчик моделей, оптимизация (в VR выключить ПК-нагрузку, FPS на наруче).
1–3 параллельно: мир+интерфейс+звук (2), оружие+противники (3), навыки (1).
4. Сборка в `fantasy`, проверка в эмуляторе и в шлеме, затем `main` по согласию пользователя.
