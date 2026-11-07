/*
 * EL-120 Stepper Motor Drive Assembly
 * 28BYJ-48 motor via ULN2003 driver, Arduino Uno.
 *
 * Wiring (matches docs/EL-120-stepper-drive.md):
 *   ULN2003 IN1 -> D8   (yellow)
 *   ULN2003 IN2 -> D9   (green)
 *   ULN2003 IN3 -> D10  (blue)
 *   ULN2003 IN4 -> D11  (orange)
 *   ULN2003  +  -> 5V   (red)
 *   ULN2003  -  -> GND  (black)
 *   button leg  -> D2
 *   button leg  -> GND  (diagonally opposite leg)
 *
 * Press the button to turn the output shaft one full revolution.
 */

const int IN1 = 8;
const int IN2 = 9;
const int IN3 = 10;
const int IN4 = 11;
const int BUTTON = 2;

// Half-step sequence. Eight phases give the smoothest rotation and
// make the driver board indicator LEDs chase visibly.
const int SEQUENCE[8][4] = {
  {1, 0, 0, 0},
  {1, 1, 0, 0},
  {0, 1, 0, 0},
  {0, 1, 1, 0},
  {0, 0, 1, 0},
  {0, 0, 1, 1},
  {0, 0, 0, 1},
  {1, 0, 0, 1},
};

// 4096 half-steps is one revolution of the output shaft.
const int STEPS_PER_REVOLUTION = 4096;
const int STEP_DELAY_MS = 2;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);
  release();
}

void loop() {
  // INPUT_PULLUP means the pin reads LOW while the button is held.
  if (digitalRead(BUTTON) == LOW) {
    delay(20);  // settle the contact
    if (digitalRead(BUTTON) == LOW) {
      rotate(STEPS_PER_REVOLUTION);
      while (digitalRead(BUTTON) == LOW) {
        delay(10);  // wait for release so one press is one revolution
      }
    }
  }
}

void rotate(int steps) {
  for (int step = 0; step < steps; step++) {
    const int phase = step % 8;
    digitalWrite(IN1, SEQUENCE[phase][0]);
    digitalWrite(IN2, SEQUENCE[phase][1]);
    digitalWrite(IN3, SEQUENCE[phase][2]);
    digitalWrite(IN4, SEQUENCE[phase][3]);
    delay(STEP_DELAY_MS);
  }
  release();
}

// De-energise the windings so the motor does not sit hot and the
// indicator LEDs do not stay lit between moves.
void release() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}
