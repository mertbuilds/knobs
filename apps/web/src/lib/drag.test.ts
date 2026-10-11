import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampOffset,
  DRAG_AFTER,
  dragStarted,
  fitsView,
  type Home,
  keyStep,
  parseStored,
} from './drag.ts';

// A 200 by 100 box at the bottom centre of a 1000 by 800 window, 16 over its bottom.
const home: Home = { height: 100, left: 400, top: 684, width: 200 };
const view = { height: 800, width: 1000 };

test('a place in the window is kept as it is', () => {
  assert.deepEqual(clampOffset({ x: 0, y: 0 }, home, view, 8), { x: 0, y: 0 });
  assert.deepEqual(clampOffset({ x: -120, y: -300 }, home, view, 8), { x: -120, y: -300 });
});

test('a place past an edge stops a margin from it', () => {
  assert.deepEqual(clampOffset({ x: -9999, y: -9999 }, home, view, 8), { x: -392, y: -676 });
  assert.deepEqual(clampOffset({ x: 9999, y: 9999 }, home, view, 8), { x: 392, y: 8 });
});

test('a box larger than the window stands at its left and top', () => {
  const small = { height: 60, width: 150 };
  const at = clampOffset({ x: 50, y: 50 }, home, small, 8);
  assert.equal(home.left + at.x, 8);
  assert.equal(home.top + at.y, 8);
});

test('a smaller window pulls the box back in', () => {
  const at = clampOffset({ x: 300, y: 0 }, home, { height: 800, width: 800 }, 8);
  assert.equal(home.left + at.x + home.width, 792);
});

test('a place is in the window or it is not', () => {
  assert.equal(fitsView({ x: 0, y: 0 }, home, view, 8), true);
  assert.equal(fitsView({ x: 392, y: 8 }, home, view, 8), true);
  assert.equal(fitsView({ x: 393, y: 0 }, home, view, 8), false);
  assert.equal(fitsView({ x: 0, y: -700 }, home, view, 8), false);
});

test('a press is a drag only past the threshold', () => {
  assert.equal(dragStarted(0, 0), false);
  assert.equal(dragStarted(DRAG_AFTER - 1, 0), false);
  assert.equal(dragStarted(2, 2), false);
  assert.equal(dragStarted(DRAG_AFTER, 0), true);
  assert.equal(dragStarted(0, -DRAG_AFTER), true);
  assert.equal(dragStarted(3, 3), true);
});

test('arrow keys step, further with shift, and no other key does', () => {
  assert.deepEqual(keyStep('ArrowLeft', false), { x: -16, y: 0 });
  assert.deepEqual(keyStep('ArrowDown', false), { x: 0, y: 16 });
  assert.deepEqual(keyStep('ArrowUp', true), { x: 0, y: -64 });
  assert.deepEqual(keyStep('ArrowRight', true), { x: 64, y: 0 });
  assert.equal(keyStep('Enter', false), null);
  assert.equal(keyStep(' ', true), null);
});

test('what was stored is read back', () => {
  assert.deepEqual(parseStored('{"minimized":true,"place":{"x":-40,"y":-12.5}}'), {
    minimized: true,
    place: { x: -40, y: -12.5 },
  });
});

test('anything else stored reads as the defaults', () => {
  const none = { minimized: false, place: { x: 0, y: 0 } };
  assert.deepEqual(parseStored(null), none);
  assert.deepEqual(parseStored(''), none);
  assert.deepEqual(parseStored('not json'), none);
  assert.deepEqual(parseStored('null'), none);
  assert.deepEqual(parseStored('[1,2]'), none);
  assert.deepEqual(parseStored('{"minimized":"yes","place":{"x":"1","y":2}}'), none);
  assert.deepEqual(parseStored('{"place":{"x":1}}'), none);
  assert.deepEqual(parseStored('{"place":null,"minimized":1}'), none);
});

test('a stored place needs both numbers, the minimized state does not need a place', () => {
  assert.deepEqual(parseStored('{"minimized":true}'), {
    minimized: true,
    place: { x: 0, y: 0 },
  });
  assert.deepEqual(parseStored('{"minimized":true,"place":{"x":1e999,"y":0}}'), {
    minimized: true,
    place: { x: 0, y: 0 },
  });
});
