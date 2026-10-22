import { describe, expect, test } from 'bun:test';
import {
  type Command,
  commands,
  DEFAULT_STATE,
  isDefault,
  type KnobState,
  type TabSize,
  patchOf,
  sameState,
} from '../src/knobs.ts';

const params = (list: Array<Command>, method: string) =>
  list.find((command) => command.method === method)?.params;

const TAB: TabSize = { height: 800, width: 1200 };

const PHONE = {
  dpr: 3,
  height: 874,
  mobile: true,
  touch: true,
  touchPointer: true,
  width: 402,
};

const with_ = (patch: Partial<KnobState>): KnobState => ({
  ...DEFAULT_STATE,
  ...patch,
});

describe('isDefault', () => {
  test('is true only when every knob is at system', () => {
    expect(isDefault(DEFAULT_STATE)).toBe(true);
    expect(isDefault(with_({ textSize: 24 }))).toBe(false);
    expect(isDefault(with_({ offline: true }))).toBe(false);
    expect(isDefault(with_({ scheme: 'dark' }))).toBe(false);
    expect(isDefault(with_({ contrast: 'more' }))).toBe(false);
    expect(isDefault(with_({ motion: 'reduce' }))).toBe(false);
    expect(isDefault(with_({ transparency: 'reduce' }))).toBe(false);
    expect(isDefault(with_({ viewport: PHONE }))).toBe(false);
  });
});

describe('commands', () => {
  test('defaults restore 16/13 fonts, no media features and online', () => {
    expect(commands(DEFAULT_STATE, TAB)).toEqual([
      {
        method: 'Page.setFontSizes',
        params: { fontSizes: { fixed: 13, standard: 16 } },
      },
      {
        method: 'Emulation.setEmulatedMedia',
        params: { features: [], media: '' },
      },
      { method: 'Network.enable', params: {} },
      {
        method: 'Network.emulateNetworkConditions',
        params: {
          downloadThroughput: -1,
          latency: 0,
          offline: false,
          uploadThroughput: -1,
        },
      },
      { method: 'Emulation.clearDeviceMetricsOverride', params: {} },
      { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: false } },
      { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: false } },
    ]);
  });

  test('text size scales the monospace size with it', () => {
    expect(params(commands(with_({ textSize: 24 }), TAB), 'Page.setFontSizes')).toEqual({
      fontSizes: { fixed: 20, standard: 24 },
    });
    expect(params(commands(with_({ textSize: 32 }), TAB), 'Page.setFontSizes')).toEqual({
      fontSizes: { fixed: 26, standard: 32 },
    });
    expect(params(commands(with_({ textSize: 48 }), TAB), 'Page.setFontSizes')).toEqual({
      fontSizes: { fixed: 39, standard: 48 },
    });
  });

  test('any size the text knob takes goes in whole pixels', () => {
    expect(params(commands(with_({ textSize: 6 }), TAB), 'Page.setFontSizes')).toEqual({
      fontSizes: { fixed: 5, standard: 6 },
    });
    expect(params(commands(with_({ textSize: 17.5 }), TAB), 'Page.setFontSizes')).toEqual({
      fontSizes: { fixed: 14, standard: 18 },
    });
    expect(params(commands(with_({ textSize: 72 }), TAB), 'Page.setFontSizes')).toEqual({
      fontSizes: { fixed: 59, standard: 72 },
    });
  });

  test('offline cuts the network', () => {
    const list = commands(with_({ offline: true }), TAB);
    expect(list.map((command) => command.method)).toContain('Network.enable');
    expect(params(list, 'Network.emulateNetworkConditions')).toMatchObject({
      offline: true,
    });
  });

  test('each media preference becomes one feature', () => {
    const features = (patch: Partial<KnobState>) =>
      params(commands(with_(patch), TAB), 'Emulation.setEmulatedMedia')?.features;
    expect(features({ scheme: 'dark' })).toEqual([{ name: 'prefers-color-scheme', value: 'dark' }]);
    expect(features({ scheme: 'light' })).toEqual([
      { name: 'prefers-color-scheme', value: 'light' },
    ]);
    expect(features({ contrast: 'more' })).toEqual([{ name: 'prefers-contrast', value: 'more' }]);
    expect(features({ motion: 'reduce' })).toEqual([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    expect(features({ transparency: 'reduce' })).toEqual([
      { name: 'prefers-reduced-transparency', value: 'reduce' },
    ]);
  });

  test('combined state sets everything in one pass', () => {
    const list = commands(
      {
        contrast: 'more',
        motion: 'reduce',
        offline: true,
        scheme: 'dark',
        textSize: 48,
        transparency: 'reduce',
        viewport: null,
      },
      TAB,
    );
    expect(params(list, 'Page.setFontSizes')).toEqual({
      fontSizes: { fixed: 39, standard: 48 },
    });
    expect(params(list, 'Emulation.setEmulatedMedia')).toEqual({
      features: [
        { name: 'prefers-color-scheme', value: 'dark' },
        { name: 'prefers-contrast', value: 'more' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-reduced-transparency', value: 'reduce' },
      ],
      media: '',
    });
    expect(params(list, 'Network.emulateNetworkConditions')).toMatchObject({
      offline: true,
    });
  });

  test('reset after a combined state gives the default commands', () => {
    const reset = { ...with_({ offline: true, scheme: 'dark', textSize: 32 }), ...DEFAULT_STATE };
    expect(commands(reset, TAB)).toEqual(commands(DEFAULT_STATE, TAB));
  });
});

describe('viewport', () => {
  test('a phone sets its screen, ratio, touch screen and finger', () => {
    const list = commands(with_({ viewport: PHONE }), TAB);
    expect(params(list, 'Emulation.setDeviceMetricsOverride')).toEqual({
      deviceScaleFactor: 3,
      height: 874,
      mobile: true,
      scale: 0.9153318077803204,
      screenHeight: 874,
      screenWidth: 402,
      width: 402,
    });
    expect(params(list, 'Emulation.setTouchEmulationEnabled')).toEqual({
      enabled: true,
      maxTouchPoints: 5,
    });
    expect(params(list, 'Emulation.setEmitTouchEventsForMouse')).toEqual({
      configuration: 'mobile',
      enabled: true,
    });
  });

  test('a plain width keeps the screen, the ratio and the tab height, with no touch', () => {
    const plain = {
      ...PHONE,
      dpr: null,
      height: null,
      mobile: false,
      touch: false,
      touchPointer: false,
      width: 390,
    };
    const list = commands(with_({ viewport: plain }), TAB);
    expect(params(list, 'Emulation.setDeviceMetricsOverride')).toEqual({
      deviceScaleFactor: 0,
      height: 800,
      mobile: false,
      scale: 1,
      width: 390,
    });
    expect(params(list, 'Emulation.setTouchEmulationEnabled')).toEqual({ enabled: false });
    expect(params(list, 'Emulation.setEmitTouchEventsForMouse')).toEqual({ enabled: false });
  });

  test('one wider than the tab is scaled to fit, its open side filling the tab', () => {
    const wide = {
      ...PHONE,
      dpr: 1,
      height: null,
      mobile: false,
      touch: false,
      touchPointer: false,
      width: 2400,
    };
    expect(
      params(commands(with_({ viewport: wide }), TAB), 'Emulation.setDeviceMetricsOverride'),
    ).toMatchObject({
      height: 1600,
      scale: 0.5,
      width: 2400,
    });
  });

  test('a tab with no size yet scales nothing', () => {
    expect(
      params(
        commands(with_({ viewport: PHONE }), { height: 0, width: 0 }),
        'Emulation.setDeviceMetricsOverride',
      ),
    ).toMatchObject({ height: 874, scale: 1, width: 402 });
  });

  test('none clears the override', () => {
    expect(params(commands(DEFAULT_STATE, TAB), 'Emulation.clearDeviceMetricsOverride')).toEqual(
      {},
    );
  });
});

describe('sameState', () => {
  test('compares the viewport by value', () => {
    expect(sameState(with_({ viewport: PHONE }), with_({ viewport: { ...PHONE } }))).toBe(true);
    expect(sameState(with_({ viewport: PHONE }), with_({ viewport: { ...PHONE, dpr: 2 } }))).toBe(
      false,
    );
  });

  test('compares every knob', () => {
    expect(sameState(DEFAULT_STATE, { ...DEFAULT_STATE })).toBe(true);
    expect(sameState(DEFAULT_STATE, with_({ textSize: 20 }))).toBe(false);
    expect(sameState(with_({ motion: 'reduce' }), with_({ motion: 'reduce' }))).toBe(true);
  });
});

describe('patchOf', () => {
  test('puts the tab knobs in devknobs terms', () => {
    expect(
      patchOf({
        contrast: 'more',
        motion: 'reduce',
        offline: true,
        scheme: 'dark',
        textSize: 32,
        transparency: 'reduce',
        viewport: null,
      }),
    ).toEqual({
      contrast: 'more',
      motion: 'reduce',
      network: { online: 'offline' },
      scheme: 'dark',
      text: 32,
      transparency: 'reduce',
    });
    expect(patchOf(DEFAULT_STATE)).toEqual({
      contrast: 'system',
      motion: 'system',
      network: { online: 'system' },
      scheme: 'system',
      text: 'system',
      transparency: 'system',
    });
  });
});
