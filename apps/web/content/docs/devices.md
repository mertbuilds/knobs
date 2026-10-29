---
title: devices
description: Phone, tablet and laptop presets, with mocks, bezels and the phone's browser drawn around the page.
order: 4
---

## pick a device

the device knob sets a size, a ratio and a touch screen in one pick. the
presets come in six families:

- iPhone, such as iPhone 18 Pro (402 × 874) and iPhone SE (375 × 667)
- Pixel, such as Pixel 10 (412 × 924)
- iPad, such as iPad mini (744 × 1133)
- MacBook Air 13 (1470 × 956)
- laptop (1366 × 768) and desktop (1920 × 1080)

the panel's device list has them all, and search finds them by name, kind or
platform, such as `pixel` or `tablet`.

## landscape and custom sizes

`landscape` turns the frame. type a size such as `390x844` for a custom one.

## mocks, bezels and the phone's browser

a phone or tablet comes up in a mock of its body: the glass, the island or
punch hole, the buttons. every iPhone and Pixel wears its maker's own bezel.
the mock switch in the device editor turns it off.

a phone also shows the page in its browser: Safari's bars on an iPhone,
Chrome's toolbar on a Pixel. the browser knob picks the layout, or off for
the whole screen, and the bars minimize as the page scrolls.

## custom devices

`custom…` in the device row adds a device from a PNG or SVG of its body.
knobs finds the screen hole, see-through or one flat color, and its corner.
drag the box and its corners to correct it, mark the island if you like, and
set the viewport, the dpr and the browser to draw (none, iOS Safari or
Android). saved, it lists under custom, next to the presets, in this browser
only. export json saves it as one file with the picture in it.

## compare devices

`compare` in the device row puts the device beside a copy at the xxl text
size. each frame runs the page with the panel's knobs and its own on top:
click a frame's chip to set its device, text size, scheme, motion, contrast,
locale or network. `+ frame` adds one, scroll sync keeps them on the same part
of the page. storage, cookies and the extension's real settings stay shared.

## touch and the user agent

a touch device gets a touch screen inside its frame: `(pointer: coarse)`
matches, and the mouse acts as a finger, with a round dot for a cursor. a
press scrolls and flings, and a tap clicks.

a device sets the user agent to its own browser too. the frame reloads when
a pick changes the user agent, the touch screen or the ratio.

## the iPhone Duo

the iPhone Duo folds. it comes up closed on its cover screen, and `unfold`
and `fold` in the device row open it onto its inner screen and shut it
again, with the fold drawn in view.
