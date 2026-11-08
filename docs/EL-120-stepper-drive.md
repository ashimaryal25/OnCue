---
id: EL-120
title: Stepper Motor Drive Assembly — 28BYJ-48 with ULN2003
rev: B
owner: Training
---

# EL-120 — Stepper Motor Drive Assembly

## Step 1 — Connect the motor to the driver board
The motor cable ends in a five-way plug. The driver board socket is
keyed, so the plug fits one way only; do not force it. Press until the
plug shoulder meets the socket face.
Accept: plug fully home, no gap visible at the socket face.
Reject: plug standing out of the socket, or cable strain pulling the
plug at an angle.
[VIDEO: el120-step1-motor-connector]

## Step 2 — Wire the control signals
Connect the four driver inputs to the controller using one colour per
input, running in pin order:
  IN1 to D8 (yellow), IN2 to D9 (green),
  IN3 to D10 (blue), IN4 to D11 (orange).
Signal order matters. If two inputs are transposed the motor will
buzz and vibrate in place instead of rotating.
Accept: four jumpers present, one per input, in the colour order above.
Reject: any input left unconnected, or two inputs sharing a colour.

## Step 3 — Connect power to the driver board
Connect the driver board supply terminal marked plus to the controller
5V pin using the red jumper, and the terminal marked minus to a
controller GND pin using the black jumper. This also establishes the
shared ground the control signals need.
The unloaded motor draws about 240 mA, which the controller's 5V pin
supplies. Keep the shaft free of mechanical load; a stalled or loaded
shaft raises the current and can brown out the controller and reset it
mid-move.
Accept: red jumper on the plus terminal to 5V, black jumper on the
minus terminal to GND.
Reject: red and black reversed, or either power jumper left off.

## Step 4 — Fit the command button
Connect one button leg to D2 and the opposite leg to a controller GND
pin. The firmware enables the internal pull-up, so no series resistor
is required. Use the diagonally opposite legs of the button; the two
legs on the same side are already bonded inside the body.
[VIDEO: el120-step4-button-wiring]

## Step 5 — Verify the assembly
Apply power and press the button. The four indicator LEDs on the
driver board must light in a repeating chase, and the output shaft
must rotate smoothly in one direction.
Accept: LEDs chasing in sequence, shaft rotating without hesitation.
Reject: all four LEDs lit steadily, no LED activity, or a shaft that
buzzes without turning.
