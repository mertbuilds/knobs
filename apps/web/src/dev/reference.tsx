import { create, props } from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { mountKnobs, unmountKnobs } from '../lib/panel.ts';
import { arriveAtReference } from './refscreen.ts';

/**
 * A development tool, never in a build: one of the reference images in
 * `apps/web/.tune/ref/` in place of the page, so it can be seen in devknobs'
 * fold. See `AGENTS.md`, "Tuning the fold (dev)".
 */

const LIST = '/__tune/ref';

// The Duo open: wider than it is tall, or wider than a cover screen gets. In
// css and not in script, so devknobs' picture of the page at its other
// screen's size, which runs no script, shows that screen's image.
const OPEN = '@media (orientation: landscape), (width > 600px)';

const styles = create({
  // Apple's screens are on true black, which no token is.
  ground: {
    backgroundColor: 'black',
    inset: 0,
    margin: 0,
    overflow: 'hidden',
    position: 'fixed',
  },
  image: {
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    width: '100%',
  },
  inner: {
    display: { default: 'none', [OPEN]: 'block' },
  },
  outer: {
    display: { default: 'block', [OPEN]: 'none' },
  },
});

export default function Reference({ name }: { name: string }) {
  const [files, setFiles] = useState<ReadonlyArray<string>>([]);

  useEffect(() => {
    let live = true;
    fetch(LIST)
      .then((response) => (response.ok ? (response.json() as Promise<{ files?: unknown }>) : null))
      .then(
        (list) => {
          if (live && Array.isArray(list?.files)) {
            setFiles(list.files.filter((file) => typeof file === 'string'));
          }
        },
        () => {},
      );
    return () => {
      live = false;
    };
  }, []);

  // The panel, as on the page itself, and no tour. The top page, not the copy
  // in the device's frame, then takes the browser off the device.
  useEffect(() => {
    let live = true;
    void mountKnobs().then((knobs) => {
      if (live && window.top === window) {
        arriveAtReference(knobs);
      }
    });
    return () => {
      live = false;
      unmountKnobs();
    };
  }, []);

  const inner = files.find((each) => each.startsWith(`${name}-inner.`));
  const outer = files.find((each) => each.startsWith(`${name}-outer.`));
  return (
    <main {...props(styles.ground)} data-ref={name}>
      {inner !== undefined && (
        <img {...props(styles.image, styles.inner)} alt="" src={`${LIST}/${inner}`} />
      )}
      {outer !== undefined && (
        <img {...props(styles.image, styles.outer)} alt="" src={`${LIST}/${outer}`} />
      )}
    </main>
  );
}
