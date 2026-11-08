---
id: EL-120-INSP
title: Stepper Motor Drive Assembly — Inspection Criteria
rev: B
owner: Quality
---

# EL-120 Inspection Criteria

## Indicator LED behaviour
The driver board carries four indicator LEDs, one per input.
Accept: the LEDs light in a repeating chase while the motor turns.
Reject, all four lit steadily: the inputs are held high and the motor
is stalled while energised. Remove power; the motor will overheat.
Reject, no LED activity: the driver has no supply. Check that the red
and black power jumpers reach the controller 5V and GND pins.
Reject, LEDs active but shaft only buzzing: two control signals are
transposed. Recheck the colour order in EL-120 step 2.

## Jumper colour convention
Accept: red carries the 5V supply, black carries the negative return,
and the four signal jumpers follow the step 2 colour order.
Reject: any jumper whose colour does not match its terminal.
Colour convention is mandatory on this assembly because downstream
inspection is performed from photographs.

## Connector seating
Accept: the five-way motor plug is fully home with no gap at the
socket face.
Reject: any visible gap, or cable strain holding the plug at an angle.

## Limits of visual inspection

Shaft position cannot be verified from a photograph or from the
controller. This drive is open-loop: there is no encoder on the motor
and no position feedback of any kind. A commanded move may fall short
if the motor stalled against load or lost steps during acceleration,
and nothing in the image or in the controller state will reveal it.
This assembly carries no index or datum mark, so there is no reference
to compare the shaft against. Shaft position must therefore never be
reported as verified.

Accumulated position error cannot be assessed visually. The gearbox
ratio is not exactly 64:1, so a step count that assumes it will drift
progressively over successive revolutions. Position must not be
inferred from the number of steps commanded.

Button contact closure cannot be confirmed visually, because the
contact is fully enclosed within the switch body. A button may look
correctly fitted and still not make. Closure is confirmed only by
observing the commanded move in EL-120 step 5.

Motor winding condition cannot be assessed from the exterior. Do not
report a winding pass on visual evidence alone.
