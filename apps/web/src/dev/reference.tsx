import { create, props } from '@stylexjs/stylex';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { mountKnobs, unmountKnobs } from '../tour/knobs.ts';

/**
 * A development tool, never in a build: one of the reference images in
 * `apps/web/.tune/ref/` in place of the page, so it can be seen in devknobs'
 * fold. See `AGENTS.md`, "Tuning the fold (dev)".
 */

const LIST = '/__tune/ref';

// The Duo open: wider than it is tall, or wider than a cover screen gets.
const OPEN = '(orientation: landscape), (width > 600px)';

function watchOpen(listener: () => void): () => void {
  const media = window.matchMedia(OPEN);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

const isOpen = (): boolean | null => window.matchMedia(OPEN).matches;
// Not known on the server or while hydrating, so the shell is all both draw.
const unknown = (): boolean | null => null;

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
    display: 'block',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    width: '100%',
  },
});

export default function Reference({ name }: { name: string }) {
  const open = useSyncExternalStore(watchOpen, isOpen, unknown);
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

  // The panel, as on the page itself, and no tour.
  useEffect(() => {
    void mountKnobs();
    return unmountKnobs;
  }, []);

  const side = open === null ? null : `${name}-${open ? 'inner' : 'outer'}.`;
  const file = side === null ? undefined : files.find((each) => each.startsWith(side));
  return (
    <main {...props(styles.ground)} data-ref={name}>
      {file !== undefined && <img {...props(styles.image)} alt="" src={`${LIST}/${file}`} />}
    </main>
  );
}
