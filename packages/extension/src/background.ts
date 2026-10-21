import type { NativeUa, SystemMedia } from 'devknobs';
import { commands, DEFAULT_STATE, isDefault, type KnobState, sameState } from './knobs.ts';
import {
  type Answer,
  detachMessage,
  type Question,
  type Request,
  type Response,
  type SystemMessage,
  type TabMessage,
} from './messages.ts';
import { FrameLoads } from './refusal.ts';
import { RESOURCE_TYPES, uaCommand, uaHeaders } from './ua.ts';

const PROTOCOL_VERSION = '1.3';
const key = (tabId: number) => `tab:${tabId}`;
// The panel's switch for the debugger, for every tab and site: off, devknobs runs in the page alone.
const NATIVE_KEY = 'native';

const states = new Map<number, KnobState>();
let native: boolean | null = null;

async function nativeOn(): Promise<boolean> {
  native ??= (await chrome.storage.local.get(NATIVE_KEY))[NATIVE_KEY] !== false;
  return native;
}

function setNative(on: boolean) {
  native = on;
  void chrome.storage.local.set({ [NATIVE_KEY]: on });
}

// One change at a time per tab, so a fast drag cannot attach twice.
const queues = new Map<number, Promise<unknown>>();

function queued<T>(tabId: number, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(tabId) ?? Promise.resolve()).then(work, work);
  queues.set(
    tabId,
    next.catch(() => {}),
  );
  return next;
}

async function getState(tabId: number): Promise<KnobState> {
  const cached = states.get(tabId);
  if (cached) {
    return cached;
  }
  const stored = (await chrome.storage.session.get(key(tabId)))[key(tabId)] as
    | KnobState
    | undefined;
  const state = { ...DEFAULT_STATE, ...stored };
  states.set(tabId, state);
  return state;
}

async function forget(tabId: number) {
  states.delete(tabId);
  await chrome.storage.session.remove(key(tabId));
}

// What each tab's frames loaded while the debugger was on it, for why devknobs' frame was refused.
const loads = new Map<number, FrameLoads>();
// Tabs whose debugger reports the frames' loads.
const watching = new Set<number>();
// Tabs the debugger is on only to watch a frame load, for one answer.
const watchOnly = new Set<number>();
// Chrome's issue and console line about a refusal come a moment after the frame's load event.
const SETTLE_MS = 300;
// Tabs whose loads skip service workers while devknobs' frame is open, which takes the debugger.
const bypassing = new Set<number>();

/** Have the debugger, attached to the tab, report its frames' loads. */
async function watch(tabId: number) {
  if (watching.has(tabId)) {
    return;
  }
  const target = { tabId };
  const record = loads.get(tabId) ?? new FrameLoads();
  loads.set(tabId, record);
  const { frameTree } = (await chrome.debugger.sendCommand(target, 'Page.getFrameTree')) as {
    frameTree: { frame: { id: string } };
  };
  record.mainFrame = frameTree.frame.id;
  for (const method of ['Network.enable', 'Audits.enable', 'Log.enable']) {
    await chrome.debugger.sendCommand(target, method, {});
  }
  watching.add(tabId);
}

function unwatch(tabId: number) {
  watching.delete(tabId);
  watchOnly.delete(tabId);
  // What it saw then would answer for loads it did not see.
  loads.delete(tabId);
}

chrome.debugger.onEvent.addListener(({ sessionId, tabId }, method, params) => {
  if (tabId !== undefined && sessionId === undefined) {
    loads.get(tabId)?.event(method, (params ?? {}) as Record<string, unknown>);
  }
});

async function send(tabId: number, state: KnobState) {
  const { height = 0, width = 0 } = await chrome.tabs.get(tabId);
  for (const { method, params } of commands(state, { height, width })) {
    await chrome.debugger.sendCommand({ tabId }, method, params);
  }
}

async function setState(tabId: number, requested: KnobState): Promise<KnobState> {
  // With the switch off, a tab's knobs live in its page: the debugger only ever leaves.
  const state = (await nativeOn()) ? requested : DEFAULT_STATE;
  const current = await getState(tabId);
  if (sameState(current, state)) {
    return requested;
  }
  // A stored state that is not the default means our debugger is on the tab: onDetach clears it.
  // getTargets cannot tell, since DevTools or another client also counts as attached.
  const attached = !isDefault(current) || watchOnly.has(tabId) || bypassing.has(tabId);
  if (isDefault(state)) {
    await forget(tabId);
    if (attached) {
      // Detaching alone leaves the font size until the next navigation.
      await send(tabId, state);
      if (!bypassing.has(tabId)) {
        await detach(tabId);
        unwatch(tabId);
      }
    }
    return requested;
  }
  if (!attached) {
    await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
    await overrideUa(tabId);
  }
  // The knobs keep it on now.
  watchOnly.delete(tabId);
  await watch(tabId);
  await send(tabId, state);
  states.set(tabId, state);
  await chrome.storage.session.set({ [key(tabId)]: state });
  return state;
}

function tell(tabId: number, message: TabMessage) {
  chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => {
    // No devknobs in the tab: a page extensions cannot reach, or one loaded before the install.
  });
}

let offscreen: Promise<void> | null = null;

function ensureOffscreen(): Promise<void> {
  offscreen ??= (async () => {
    const open = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    if (open.length === 0) {
      await chrome.offscreen.createDocument({
        justification: "Reads the user's own color scheme and motion for the devknobs panel.",
        reasons: [chrome.offscreen.Reason.MATCH_MEDIA],
        url: 'offscreen.html',
      });
    }
  })().catch((error: unknown) => {
    offscreen = null;
    throw error;
  });
  return offscreen;
}

/** The user's own scheme and motion, which the knobs hide from every tab they are set in. */
async function readSystem(): Promise<SystemMedia | undefined> {
  try {
    await ensureOffscreen();
    return await chrome.runtime.sendMessage<SystemMessage, SystemMedia>({ type: 'read-system' });
  } catch {
    // The panel reads its own media queries instead.
    return undefined;
  }
}

/**
 * The debugger left a tab without our asking. The user closing Chrome's bar turns the
 * switch off for every tab, and the panel keeps its knobs in the page.
 */
function detached(tabId: number, reason: `${chrome.debugger.DetachReason}`) {
  // Default at once, so a change on its way in does not think the debugger is still on.
  states.set(tabId, { ...DEFAULT_STATE });
  unwatch(tabId);
  bypassing.delete(tabId);
  void chrome.storage.session.remove(key(tabId));
  const message = detachMessage(reason);
  if (message.type === 'native') {
    setNative(false);
  }
  tell(tabId, message);
}

chrome.debugger.onDetach.addListener(({ tabId }, reason) => {
  if (tabId !== undefined) {
    detached(tabId, reason);
  }
});

// The switch, flipped in any tab's panel or by a closed bar: every tab's panel follows.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[NATIVE_KEY];
  if (area !== 'local' || !change) {
    return;
  }
  const on = change.newValue !== false;
  native = on;
  void chrome.tabs.query({}).then((tabs) => {
    for (const { id } of tabs) {
      if (id !== undefined) {
        tell(id, { on, type: 'native' });
      }
    }
  });
});

// The width knob's frame loads the tab's own page, which X-Frame-Options or a
// frame-ancestors policy would refuse. Only this tab's frames of its own host
// lose those headers, and the CSP goes whole: a rule cannot edit part of a header.
// The rule id is the tab id, so a page load in the tab replaces its rule.
async function allowFrames(tabId: number, url: string | undefined) {
  const { MODIFY_HEADERS } = chrome.declarativeNetRequest.RuleActionType;
  const { REMOVE } = chrome.declarativeNetRequest.HeaderOperation;
  const host = url ? URL.parse(url)?.hostname : undefined;
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: host
      ? [
          {
            action: {
              responseHeaders: [
                { header: 'x-frame-options', operation: REMOVE },
                { header: 'content-security-policy', operation: REMOVE },
              ],
              type: MODIFY_HEADERS,
            },
            condition: {
              initiatorDomains: [host],
              requestDomains: [host],
              resourceTypes: [chrome.declarativeNetRequest.ResourceType.SUB_FRAME],
              tabIds: [tabId],
            },
            id: tabId,
          },
        ]
      : [],
    removeRuleIds: [tabId],
  });
}

// A service worker's own fetch of the frame's page is no frame load of the tab's, so the rule
// above misses it. While a tab has devknobs' frame open on a host, what that host's service
// worker fetches from it loses the same headers. One rule per host, its id from the host.
const FRAMED_KEY = 'framed';
let framedTabs: Promise<Map<number, string>> | null = null;
let ruling: Promise<void> = Promise.resolve();

// Tab ids take any positive number, so these rules are told apart by their `tabIds`, not their ids.
function workerRuleId(host: string): number {
  let hash = 0;
  for (const char of host) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647;
  }
  return hash + 1;
}

/** Each tab's host with devknobs' frame open, kept through the service worker's restarts. */
function framedHosts(): Promise<Map<number, string>> {
  framedTabs ??= chrome.storage.session.get(FRAMED_KEY).then((stored) => {
    const kept = (stored[FRAMED_KEY] ?? {}) as Record<string, string>;
    return new Map(Object.entries(kept).map(([tabId, host]) => [Number(tabId), host]));
  });
  return framedTabs;
}

/** Say the tab has devknobs' frame open on `host`, or none. Resolves once the rules follow. */
async function setFramed(tabId: number, host: string | null): Promise<void> {
  const tabs = await framedHosts();
  if (host ? tabs.get(tabId) === host : !tabs.has(tabId)) {
    return ruling;
  }
  if (host) {
    tabs.set(tabId, host);
  } else {
    tabs.delete(tabId);
  }
  const hosts = new Set(tabs.values());
  void chrome.storage.session.set({ [FRAMED_KEY]: Object.fromEntries(tabs) });
  ruling = ruling.then(async () => {
    const { MODIFY_HEADERS } = chrome.declarativeNetRequest.RuleActionType;
    const { REMOVE } = chrome.declarativeNetRequest.HeaderOperation;
    const stale = (await chrome.declarativeNetRequest.getSessionRules())
      .filter(
        ({ action, condition }) =>
          condition.tabIds?.includes(chrome.tabs.TAB_ID_NONE) && !isUaRule({ action }),
      )
      .map(({ id }) => id);
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [...hosts].map((framedHost) => ({
        action: {
          responseHeaders: [
            { header: 'x-frame-options', operation: REMOVE },
            { header: 'content-security-policy', operation: REMOVE },
          ],
          type: MODIFY_HEADERS,
        },
        condition: {
          initiatorDomains: [framedHost],
          requestDomains: [framedHost],
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
          tabIds: [chrome.tabs.TAB_ID_NONE],
        },
        id: workerRuleId(framedHost),
      })),
      removeRuleIds: stale,
    });
  });
  return ruling;
}

/** The tab's devknobs frame is gone, with the page it was on. */
function unframed(tabId: number) {
  forgetReopen(tabId);
  void setFramed(tabId, null);
  void unbypass(tabId).catch(() => {
    // The debugger already left.
  });
}

// A page loading again on the host its frame was bypassing service workers on, such as one that
// reloads itself as the frame's copy updates its worker: its stored knobs open the frame again,
// so the bypass waits that long for it.
const REOPEN_MS = 15_000;
const reopening = new Map<number, ReturnType<typeof setTimeout>>();

function forgetReopen(tabId: number) {
  clearTimeout(reopening.get(tabId));
  reopening.delete(tabId);
}

async function pageLoads(tabId: number, url: string) {
  const host = URL.parse(url)?.hostname;
  const framedOn = (await framedHosts()).get(tabId);
  if (!bypassing.has(tabId) || !host || framedOn !== host) {
    unframed(tabId);
    return;
  }
  void setFramed(tabId, null);
  forgetReopen(tabId);
  reopening.set(
    tabId,
    setTimeout(() => unframed(tabId), REOPEN_MS),
  );
}

// The user agent the ua knob, or a device's browser, sends to servers, with no debugger: a rule
// per tab sets it and its client hints on every request of the tab, and one per host on what
// that host's service worker fetches, which belongs to no tab. The ids are any free ones, since
// the framing rules take tab ids and host hashes: these are told apart by their request headers.
const UA_KEY = 'ua';
let uaTabsKept: Promise<Map<number, { host: string | null; ua: NativeUa }>> | null = null;

/** Each tab's user agent and its page's host, kept through the service worker's restarts. */
function uaTabs(): Promise<Map<number, { host: string | null; ua: NativeUa }>> {
  uaTabsKept ??= chrome.storage.session.get(UA_KEY).then((stored) => {
    const kept = (stored[UA_KEY] ?? {}) as Record<string, { host: string | null; ua: NativeUa }>;
    return new Map(Object.entries(kept).map(([tabId, entry]) => [Number(tabId), entry]));
  });
  return uaTabsKept;
}

function isUaRule({ action }: Pick<chrome.declarativeNetRequest.Rule, 'action'>): boolean {
  return action.requestHeaders !== undefined;
}

function uaRule(
  ua: NativeUa,
  condition: chrome.declarativeNetRequest.RuleCondition,
  id: number,
): chrome.declarativeNetRequest.Rule {
  return {
    action: {
      requestHeaders: uaHeaders(ua),
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
    },
    condition: { ...condition, resourceTypes: [...RESOURCE_TYPES] },
    id,
  };
}

/** Put every tab's user agent rules in place of the last ones. Resolves once they are in. */
function ruleUas(): Promise<void> {
  const run = ruling
    .catch(() => {})
    .then(async () => {
      const tabs = await uaTabs();
      const rules = await chrome.declarativeNetRequest.getSessionRules();
      const taken = new Set([
        ...rules.filter((rule) => !isUaRule(rule)).map(({ id }) => id),
        ...(await chrome.tabs.query({})).map(({ id }) => id),
      ]);
      let last = 0;
      const free = () => {
        do {
          last += 1;
        } while (taken.has(last));
        return last;
      };
      // Two tabs on one host with different ones: the last set wins on its service worker.
      const hosts = new Map<string, NativeUa>();
      for (const { host, ua } of tabs.values()) {
        if (host) {
          hosts.set(host, ua);
        }
      }
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [
          ...[...tabs].map(([tabId, { ua }]) => uaRule(ua, { tabIds: [tabId] }, free())),
          ...[...hosts].map(([host, ua]) =>
            uaRule(
              ua,
              {
                initiatorDomains: [host],
                requestDomains: [host],
                tabIds: [chrome.tabs.TAB_ID_NONE],
              },
              free(),
            ),
          ),
        ],
        removeRuleIds: rules.filter(isUaRule).map(({ id }) => id),
      });
    });
  ruling = run.catch(() => {});
  return run;
}

/** Whether our debugger is on the tab. */
async function attachedTo(tabId: number): Promise<boolean> {
  return !isDefault(await getState(tabId)) || watchOnly.has(tabId) || bypassing.has(tabId);
}

/** The tab's user agent on its debugger too, for its scripts and workers, or none. */
async function overrideUa(tabId: number, clear = false) {
  const ua = clear ? null : ((await uaTabs()).get(tabId)?.ua ?? null);
  const { method, params } = uaCommand(ua);
  await chrome.debugger.sendCommand({ tabId }, method, params);
}

async function detach(tabId: number) {
  await overrideUa(tabId, true).catch(() => {
    // The debugger already left.
  });
  await chrome.debugger.detach({ tabId });
}

/** The user agent the tab's requests carry, null for the browser's own, from the page at `url`. */
async function setUa(tabId: number, ua: NativeUa | null, url: string | undefined) {
  const tabs = await uaTabs();
  const had = tabs.get(tabId);
  const host = (url ? URL.parse(url)?.hostname : undefined) ?? null;
  if (JSON.stringify(had ?? null) === JSON.stringify(ua ? { host, ua } : null)) {
    return;
  }
  // Last in, so its host's service worker takes it.
  tabs.delete(tabId);
  if (ua) {
    tabs.set(tabId, { host, ua });
  }
  void chrome.storage.session.set({ [UA_KEY]: Object.fromEntries(tabs) });
  await ruleUas();
  if (await attachedTo(tabId)) {
    await overrideUa(tabId);
  }
}

// Before the document loads, so a frame it brings up at once, from knobs stored
// on its host, is let in on its first load. The bridge's word on load stays the fallback.
chrome.webNavigation.onBeforeNavigate.addListener(({ frameId, tabId, url }) => {
  if (frameId === 0) {
    void allowFrames(tabId, url);
    void pageLoads(tabId, url);
  }
});
// Again once the page is there: a redirect to another host, such as www to the bare one,
// would leave the rule on the host it left.
chrome.webNavigation.onCommitted.addListener(({ frameId, tabId, url }) => {
  if (frameId === 0) {
    void allowFrames(tabId, url);
  }
});

// A viewport bigger than the tab is scaled to it, and a side it leaves to the window fills it.
chrome.windows.onBoundsChanged.addListener(({ id }) => {
  void chrome.tabs.query({ windowId: id }).then((tabs) => {
    for (const { id: tabId } of tabs) {
      if (tabId !== undefined) {
        void queued(tabId, async () => {
          const state = await getState(tabId);
          if (state.viewport) {
            await send(tabId, state);
          }
        });
      }
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forget(tabId);
  loads.delete(tabId);
  queues.delete(tabId);
  void chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
  void setFramed(tabId, null);
  setUa(tabId, null, undefined).catch(() => {
    // The debugger went with the tab.
  });
  forgetReopen(tabId);
  bypassing.delete(tabId);
});

// A new tab's id can be one a user agent rule took: the tab's framing rule would replace it.
chrome.tabs.onCreated.addListener(({ id }) => {
  void chrome.declarativeNetRequest.getSessionRules().then((rules) => {
    if (rules.some((rule) => rule.id === id && isUaRule(rule))) {
      void ruleUas();
    }
  });
});

chrome.action.onClicked.addListener(({ id }) => {
  if (id !== undefined) {
    tell(id, { type: 'toggle' });
  }
});

/** What the debugger saw of the frame's load of `url`. One it was on only to watch leaves after. */
async function why(tabId: number, url: string): Promise<Answer> {
  if (!(await nativeOn())) {
    return { native: false };
  }
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const record = loads.get(tabId)?.pick(url) ?? null;
  if (record && watchOnly.has(tabId)) {
    await queued(tabId, async () => {
      if (watchOnly.has(tabId) && !bypassing.has(tabId)) {
        unwatch(tabId);
        await detach(tabId);
      }
      watchOnly.delete(tabId);
    });
  }
  return { native: true, record };
}

/** Put the debugger on the tab, if no knob has, to watch the frame's next load. */
function watchNext(tabId: number): Promise<Answer> {
  return queued(tabId, async () => {
    if (!(await nativeOn())) {
      return { native: false };
    }
    if (isDefault(await getState(tabId)) && !watchOnly.has(tabId)) {
      await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
      await overrideUa(tabId);
      watchOnly.add(tabId);
    }
    await watch(tabId);
    return { native: true };
  });
}

/** Have the tab's loads skip service workers while devknobs' frame stays open, the debugger on. */
function bypass(tabId: number): Promise<Answer> {
  return queued(tabId, async () => {
    if (!(await attachedTo(tabId))) {
      await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
      await overrideUa(tabId);
    }
    bypassing.add(tabId);
    await watch(tabId);
    await chrome.debugger.sendCommand({ tabId }, 'Network.setBypassServiceWorker', {
      bypass: true,
    });
    return { native: await nativeOn() };
  });
}

/** The frame went: service workers answer the tab again, and the debugger leaves if nothing else keeps it. */
function unbypass(tabId: number): Promise<void> {
  return queued(tabId, async () => {
    if (!bypassing.delete(tabId)) {
      return;
    }
    await chrome.debugger.sendCommand({ tabId }, 'Network.setBypassServiceWorker', {
      bypass: false,
    });
    if (isDefault(await getState(tabId)) && !watchOnly.has(tabId)) {
      unwatch(tabId);
      await detach(tabId);
    }
  });
}

async function answer(tabId: number, question: Question, url: string | undefined): Promise<Answer> {
  switch (question.type) {
    case 'why': {
      return why(tabId, question.url);
    }
    case 'watch': {
      return watchNext(tabId);
    }
    case 'bypass': {
      return bypass(tabId);
    }
    case 'ua': {
      await queued(tabId, () => setUa(tabId, question.ua, url));
      return {};
    }
    case 'frame': {
      const host = url ? URL.parse(url)?.hostname : undefined;
      if (question.open && host) {
        forgetReopen(tabId);
        await setFramed(tabId, host);
      } else {
        unframed(tabId);
      }
      return {};
    }
  }
}

chrome.runtime.onMessage.addListener(
  (
    request: Request | Question | SystemMessage,
    sender,
    reply: (response: Response | Answer) => void,
  ) => {
    if (request.type === 'system') {
      const { media } = request;
      void chrome.tabs.query({}).then((tabs) => {
        for (const { id } of tabs) {
          if (id !== undefined) {
            tell(id, { media, type: 'system' });
          }
        }
      });
      return false;
    }
    if (request.type === 'read-system') {
      return false;
    }
    const tabId = sender.tab?.id;
    if (tabId === undefined || sender.frameId !== 0) {
      return false;
    }
    if (
      request.type === 'why' ||
      request.type === 'watch' ||
      request.type === 'frame' ||
      request.type === 'bypass' ||
      request.type === 'ua'
    ) {
      answer(tabId, request, sender.url).then(reply, (error) =>
        reply({ error: error instanceof Error ? error.message : String(error) }),
      );
      return true;
    }
    if (request.type === 'get') {
      void allowFrames(tabId, sender.url);
    }
    if (request.type === 'native') {
      // Before the knobs the panel hands over next, which this decides the fate of.
      setNative(request.on);
    }
    queued(tabId, async () => {
      if (request.type === 'set') {
        return setState(tabId, request.state);
      }
      // A tab loaded with the switch off leaves the debugger, should it still be on.
      return (await nativeOn()) ? getState(tabId) : setState(tabId, DEFAULT_STATE);
    }).then(
      async (state) =>
        reply({
          native: await nativeOn(),
          state,
          system: request.type === 'get' ? await readSystem() : undefined,
        }),
      async (error: unknown) =>
        reply({
          error: error instanceof Error ? error.message : String(error),
          state: await getState(tabId),
        }),
    );
    return true;
  },
);

// Lets the smoke test, or a look from the service worker's console, read a tab's knobs.
// `detached` runs what Chrome's bar closing does, which a test cannot click.
Object.assign(globalThis, {
  knobs: {
    bypassing: (tabId: number) => bypassing.has(tabId),
    detached,
    get: getState,
    loads: (tabId: number) => loads.get(tabId)?.loads ?? [],
  },
});
