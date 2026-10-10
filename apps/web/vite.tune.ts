import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Where the fold tuning panel (`src/dev/foldtune.tsx`) saves and reads back.
const PATH = '/__tune/fold';

// A spec and its values are a few hundred bytes. Nothing larger is read.
const LIMIT = 64 * 1024;

type Numbers = Record<string, number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, 512) : null;
}

/** What drew the fold, as the panel read it: two strings, each cut at 300. */
function infoOf(value: unknown): { drawnBy: string; why: string } | null {
  if (
    !isRecord(value) ||
    typeof value['drawnBy'] !== 'string' ||
    typeof value['why'] !== 'string'
  ) {
    return null;
  }
  return { drawnBy: value['drawnBy'].slice(0, 300), why: value['why'].slice(0, 300) };
}

/**
 * What a save may hold, or null for a body that is not one: a spec of keyed
 * entries, a finite number for keys of that spec only, the changed ones
 * as `{ from, to }`, and `info` when the panel sent one.
 */
function saveOf(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body) || !Array.isArray(body['spec']) || !isRecord(body['values'])) {
    return null;
  }
  const spec = body['spec'].filter(isRecord);
  const keys = new Set(spec.map((entry) => entry['key']));
  if (spec.length !== body['spec'].length || [...keys].some((key) => typeof key !== 'string')) {
    return null;
  }
  const values: Numbers = {};
  for (const [key, value] of Object.entries(body['values'])) {
    if (!keys.has(key) || !finite(value)) {
      return null;
    }
    values[key] = value;
  }
  const changed: Record<string, { from: number; to: number }> = {};
  for (const [key, value] of Object.entries(isRecord(body['changed']) ? body['changed'] : {})) {
    if (!keys.has(key) || !isRecord(value) || !finite(value['from']) || !finite(value['to'])) {
      return null;
    }
    changed[key] = { from: value['from'], to: value['to'] };
  }
  const info = body['info'] === undefined ? undefined : infoOf(body['info']);
  if (info === null) {
    return null;
  }
  return {
    changed,
    ...(info !== undefined && { info }),
    savedAt: text(body['savedAt']),
    spec,
    userAgent: text(body['userAgent']),
    values,
  };
}

/** The page's own requests only: a write names this host as its origin, and no read comes from another site. */
function sameOrigin(req: IncomingMessage, write: boolean): boolean {
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && (write || site !== 'none')) {
    return false;
  }
  const { origin } = req.headers;
  if (origin === undefined) {
    return !write;
  }
  // Behind portless the proxy's host is the page's, and it may hand it on as forwarded.
  const hosts = [req.headers.host, req.headers['x-forwarded-host']].flat();
  return URL.canParse(origin) && hosts.includes(new URL(origin).host);
}

/** The request's body as text, or null once it is over the limit. */
async function read(req: IncomingMessage): Promise<string | null> {
  const chunks: Array<Buffer> = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > LIMIT) {
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Dev only: `POST /__tune/fold` writes the values picked in the fold tuning
 * panel to `<dir>/fold.json`, and `GET` gives the file back. The values are
 * read from that file when they are baked into devknobs, so it is on disk and
 * not in the browser. Listed first, and added to the server ahead of Vite's
 * own middlewares, so it answers before the app's handler sees the path.
 */
export function tuneEndpoint(dir: string): Plugin {
  const file = resolve(dir, 'fold.json');
  return {
    apply: (_config, { command, isPreview }) => command === 'serve' && !isPreview,
    // A save is not a change to the page: no reload for it.
    config: () => ({ server: { watch: { ignored: [`${dir}/**`] } } }),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== PATH) {
          next();
          return;
        }
        const answer = (status: number, body: string) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          res.end(body);
        };
        const refuse = (status: number, error: string) => answer(status, JSON.stringify({ error }));
        const handle = async () => {
          if (req.method !== 'GET' && req.method !== 'POST') {
            res.setHeader('allow', 'GET, POST');
            refuse(405, 'GET or POST');
            return;
          }
          const write = req.method === 'POST';
          if (!sameOrigin(req, write)) {
            refuse(403, 'same origin only');
            return;
          }
          if (!write) {
            const saved = await readFile(file, 'utf8').catch(() => null);
            if (saved === null) {
              refuse(404, 'nothing saved');
              return;
            }
            answer(200, saved);
            return;
          }
          if (!req.headers['content-type']?.startsWith('application/json')) {
            refuse(415, 'application/json only');
            return;
          }
          const body = await read(req);
          if (body === null) {
            refuse(413, `over ${LIMIT} bytes`);
            return;
          }
          const save = saveOf(parse(body));
          if (save === null) {
            refuse(
              400,
              'values must be finite numbers for keys of the posted spec, info two strings',
            );
            return;
          }
          await mkdir(dir, { recursive: true });
          await writeFile(file, `${JSON.stringify(save, null, 2)}\n`);
          answer(200, JSON.stringify({ file, ok: true }));
        };
        void handle().catch(next);
      });
    },
    name: 'tune-endpoint',
  };
}
