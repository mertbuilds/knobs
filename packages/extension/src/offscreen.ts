// Outside every tab, so the DevTools protocol's emulated media never reaches it:
// what the user's system really prefers, for the panel, which should not follow the knobs.
import type { SystemMedia } from 'devknobs';
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
  (message: SystemMessage, _sender, reply: (media: SystemMedia) => void) => {
    if (message.type === 'read-system') {
      reply(read());
    }
    return false;
  },
);
