# XR-тест без шлема (IWER)

`tests/xr.html` — копия `index.html`, в которой до игровых модулей подключается
[IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) (Immersive Web Emulation Runtime от Meta, MIT).
Он подменяет `navigator.xr` эмулятором **Meta Quest 3** с контроллерами Touch Plus, и игра идёт по
своему настоящему VR-пути: кнопка «ВОЙТИ В VR» → `renderer.xr.setSession`, события `selectstart`/`squeezestart`, опрос `gamepad.buttons/axes`.

- Версия: `iwer@2.4.0` (вышла 11.09.2026), ES-модуль с CDN:
  `https://cdn.jsdelivr.net/npm/iwer@2.4.0/build/iwer.module.js` (одним файлом, зависимости внутри).
  Адрес задан в importmap страницы (`"iwer"`), а версия продублирована в `IWER_VERSION` в скрипте.
- Если CDN недоступен, в консоли будет ошибка `[xr-test] Не удалось загрузить IWER…`, а игра откроется как обычная страница.
- В Chrome/Edge есть «родной» `navigator.xr`, поэтому runtime ставится с `forceInstall: true`.
- IWER подменяет и `navigator.userAgent` на Quest 3, поэтому игра сама включает качество «Низкое», как в шлеме.
- Страница — копия: если меняется `index.html` (разметка, `?v=` у скриптов), обновите и `tests/xr.html`.

## Как открыть

1. Запустите сервер из корня проекта: `python serve.py` (порт 8000).
2. Откройте **http://localhost:8000/tests/xr.html?debug** (`?debug` даёт ещё и `window.vrTirDebug`).
3. Откройте DevTools → Console: там должно быть `[xr-test] IWER 2.4.0: эмулируется Meta Quest 3…`.

Вкладка должна быть видимой: в фоне браузер не рисует кадры, и XR-кадры тоже стоят.
В VR холст переносится в полноэкранный контейнер IWER поверх страницы; выходите командой `xrTest.exit()`.

## API `window.xrTest`

Координаты в метрах, в пространстве **local-floor**: пол на `y = 0`, «вперёд» — это `−Z`. Это пространство
игрового рига, поэтому после ходьбы стиком или поворота риг смещается вместе с ним.
`yawDeg`: + влево; `pitchDeg`: + вверх.

| Вызов | Что делает |
|---|---|
| `await xrTest.enter()` | Вход в VR кликом по `#VRButton` (как у игрока). Возвращается, когда игра получила сессию (`game:xr`). Запасные пути: принять `offerSession` или напрямую вызвать `requestSession` (в этом случае игра сессию не получит, об этом будет предупреждение). |
| `await xrTest.exit()` | Завершает сессию. |
| `xrTest.head(x, y, z, yawDeg = 0, pitchDeg = 0)` | Поза шлема; `y` — высота глаз (по умолчанию стоим в `0, 1.6, 0`). |
| `xrTest.hand(side, x, y, z, yawDeg = 0, pitchDeg = 0)` | Поза контроллера `'left'`/`'right'` (луч прицеливания). По умолчанию `∓0.2, 1.4, −0.35`, смотрит вперёд. |
| `await xrTest.press(side, button, ms = 80)` | Нажать и отпустить. Держит кнопку не меньше `ms` и не меньше 2 XR-кадров, после отпускания ждёт ещё 2 кадра. |
| `xrTest.hold(side, button, on)` | Держать (`true`, или `0..1` для `trigger`/`squeeze`) или отпустить (`false`). |
| `xrTest.stick(side, x, y)` | Положение стика `−1..1`: `x` + вправо; `y` как в WebXR, `−1` = от себя (вперёд). `stick(side, 0, 0)` — отпустить. |
| `await xrTest.wait(ms)` / `await xrTest.frames(n)` | Пауза в мс / ожидание n XR-кадров. |
| `xrTest.device`, `xrTest.session` | Объект `XRDevice` из IWER (например, `primaryInputMode = 'hand'`, `stereoEnabled = true`) и активная `XRSession`. |

Кнопки: `trigger`, `squeeze` (`grip`), `thumbstick` (`stick`, нажатие стика), `thumbrest`;
`a`, `b` есть только справа, `x`, `y` только слева. Для неверного имени или стороны будет понятная ошибка.

Раскладка игры. Справа: курок — огонь, хват — прицел, A — прыжок, B — следующее оружие, стик — поворот,
нажатие стика — режим огня. Слева: хват — перезарядка, X — присесть, Y — предыдущее оружие, стик — ходьба,
нажатие стика — бег. Курок свободной руки перекладывает оружие в эту руку.

## Пример (вставить в консоль)

```js
await xrTest.enter();                          // как клик по «ВОЙТИ В VR»
xrTest.head(0, 1.6, 0);                        // стоим в центре, смотрим вперёд
xrTest.hand('right', 0.2, 1.4, -0.35, 0, 0);   // правый контроллер прямо вперёд — на панель меню (3 м перед игроком)
await xrTest.wait(500);
await xrTest.press('right', 'trigger');        // выстрел по панели: отсчёт 3-2-1 и старт раунда
await xrTest.wait(3500);
await xrTest.press('right', 'trigger');        // выстрел
await xrTest.press('right', 'b');              // следующее оружие
await xrTest.wait(800);
vrTirDebug.state;                              // нужен ?debug: weapon, mag, score…
await xrTest.press('right', 'a');              // прыжок
xrTest.stick('left', 0, -1); await xrTest.wait(1000); xrTest.stick('left', 0, 0); // шаг вперёд
xrTest.stick('right', 1, 0); await xrTest.frames(3); xrTest.stick('right', 0, 0); // поворот рывком на 45° (если в настройках не «плавный»)
await xrTest.exit();
```
