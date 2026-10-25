// Outside every tab, so the DevTools protocol's emulated media never reaches it:
// what the user's system really prefers, for the panel, which should not follow the knobs.
import type { SystemMedia } from '@vinena/knobs';
import type { SystemMessage } from './messages.ts';

const dark = matchMedia('(prefers-color-scheme: dark)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const read = (): SystemMedia => ({
  motion: reduce.matches ? 'reduce' : 'no-preference',
  scheme: dark.matches ? 'dark' : 'light',
});

const changed = () =>
  void chrome.runtime.sendMessage<SystemMessage>({ media: read(), type: 'system' });
dark.addEventListener('change', changed);
reduce.addEventListener('change', changed);

chrome.runtime.onMessage.addListener(
  (message: SystemMessage, sender, reply: (media: SystemMedia) => void) => {
    // The service worker's question alone: a tab's content script reaches this document too.
    if (message.type === 'read-system' && !sender.tab) {
      reply(read());
    }
    return false;
  },
);
