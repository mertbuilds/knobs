import { describe, expect, test } from 'bun:test';
import { detachMessage } from '../src/messages.ts';

describe('detachMessage', () => {
  test('the user closing the bar turns the switch off and keeps the knobs', () => {
    expect(detachMessage('canceled_by_user')).toEqual({
      on: false,
      reason: 'bar-closed',
      type: 'native',
    });
  });

  test('the tab going away puts the knobs back', () => {
    expect(detachMessage('target_closed')).toEqual({ type: 'detached' });
  });
});
