/*
  VR Тир — контроллер для браузерной WebXR-игры (Arduino Uno/Nano, Web Serial, 115200 бод).

  Подключение:
  +-----------------------------+--------------------------------------------+
  | Деталь                      | Куда подключать                            |
  +-----------------------------+--------------------------------------------+
  | Джойстик VRx                | A0                                         |
  | Джойстик VRy                | A1                                         |
  | Джойстик SW (кнопка)        | D2 (INPUT_PULLUP, нажата = LOW)            |
  | Джойстик +5V                | 5V                                         |
  | Джойстик GND                | GND                                        |
  | Светодиод                   | D13 (встроенный, вспышка обратной связи)   |
  | Пищалка (необязательно)     | D8 -> GND (пассивная, звук через tone())   |
  | Доп. кнопка (необязательно) | D3 -> GND (INPUT_PULLUP, вторая кнопка     |
  |                             | огня, объединяется по ИЛИ с SW)            |
  +-----------------------------+--------------------------------------------+

  Протокол:
  МК -> ПК каждые ~20 мс: "J,<x>,<y>,<b>\n", x и y от -100 до 100, b = 0/1 (1 = огонь).
  y > 0 - вперёд/вверх, x > 0 - вправо.
  ПК -> МК (один символ): H хит, G золотой хит, B бомба, S старт раунда, E конец раунда,
  P пинг (ответ "OK,VR_TIR_MK"). Остальные символы (в т.ч. \r \n) игнорируются.
*/

// Если персонаж движется не в ту сторону - поменяйте true/false (положение модуля бывает разным).
const bool INVERT_X = false;
const bool INVERT_Y = true;

const uint8_t PIN_VRX = A0;
const uint8_t PIN_VRY = A1;
const uint8_t PIN_SW = 2;
const uint8_t PIN_BTN2 = 3;
const uint8_t PIN_BUZZER = 8;
const uint8_t PIN_LED = 13;

const int DEADZONE = 12;                 // мёртвая зона, в единицах -100..100
const unsigned long SEND_MS = 20;        // период отправки состояния
const unsigned long DEBOUNCE_MS = 15;    // время подавления дребезга кнопки

int centerX = 512, centerY = 512;        // центр джойстика (калибруется при старте)
unsigned long lastSend = 0;
bool ledOn = false;                      // светодиод сейчас горит
unsigned long ledOffAt = 0;              // когда погасить светодиод
bool rawFire = false, stableFire = false;
unsigned long rawChangedAt = 0;

// Объявления функций (не полагаемся на авто-прототипы IDE)
int readCenter(uint8_t pin);
int mapAxis(int raw, int center, bool invert);
void updateFire(unsigned long now);
void feedback(unsigned int freq, unsigned int toneMs, unsigned int ledMs);
void handleCommand(char c);

// Среднее из 32 замеров оси - это центр
int readCenter(uint8_t pin) {
  long sum = 0;
  for (int i = 0; i < 32; i++) { sum += analogRead(pin); delay(2); }
  return (int)(sum / 32);
}

// Отдельное масштабирование каждой половины оси, мёртвая зона, ограничение и инверсия
int mapAxis(int raw, int center, bool invert) {
  long v = (long)raw - center;
  long span = (v >= 0) ? (1023L - center) : (long)center;
  long out = (span > 0) ? (v * 100L / span) : 0;   // защита от деления на ноль
  if (out > -DEADZONE && out < DEADZONE) out = 0;
  if (out > 100) out = 100;
  if (out < -100) out = -100;
  if (invert) out = -out;
  return (int)out;
}

// Кнопка огня: SW или доп. кнопка, с подавлением дребезга
void updateFire(unsigned long now) {
  bool r = (digitalRead(PIN_SW) == LOW) || (digitalRead(PIN_BTN2) == LOW);
  if (r != rawFire) { rawFire = r; rawChangedAt = now; }
  if (now - rawChangedAt >= DEBOUNCE_MS) stableFire = rawFire;
}

// Звук (если пищалка есть) и неблокирующая вспышка светодиода
void feedback(unsigned int freq, unsigned int toneMs, unsigned int ledMs) {
  tone(PIN_BUZZER, freq, toneMs);
  digitalWrite(PIN_LED, HIGH);
  ledOn = true;
  ledOffAt = millis() + ledMs;
}

void handleCommand(char c) {
  switch (c) {
    case 'H': feedback(1200, 60, 80); break;
    case 'G': feedback(1800, 120, 200); break;
    case 'B': feedback(150, 400, 500); break;
    case 'S': feedback(1000, 150, 150); break;
    case 'E': feedback(400, 500, 600); break;
    case 'P': Serial.println(F("OK,VR_TIR_MK")); break;
    default: break;                      // всё остальное игнорируем
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_SW, INPUT_PULLUP);
  pinMode(PIN_BTN2, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  centerX = readCenter(PIN_VRX);         // джойстик при старте не трогать!
  centerY = readCenter(PIN_VRY);
  Serial.println(F("OK,VR_TIR_MK"));
}

void loop() {
  unsigned long now = millis();
  while (Serial.available() > 0) handleCommand((char)Serial.read());
  if (ledOn && (long)(now - ledOffAt) >= 0) { digitalWrite(PIN_LED, LOW); ledOn = false; }
  updateFire(now);
  if (now - lastSend >= SEND_MS) {
    lastSend = now;
    int x = mapAxis(analogRead(PIN_VRX), centerX, INVERT_X);
    int y = mapAxis(analogRead(PIN_VRY), centerY, INVERT_Y);
    Serial.print(F("J,")); Serial.print(x); Serial.print(',');
    Serial.print(y); Serial.print(','); Serial.println(stableFire ? 1 : 0);
  }
}
