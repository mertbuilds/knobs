import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Where the fold tuning panel (`src/dev/foldtune.tsx`) saves and reads back.
const PATH = '/__tune/fold';

// The reference images the card lists and the reference view shows, from `<dir>/ref`.
const REF = '/__tune/ref';
const REF_FILE = /^[a-z0-9-]+\.(png|avif|jpg|webp)$/;
const REF_TYPES: Record<string, string> = {
  avif: 'image/avif',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

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

/** A name the card sent along, such as a preset's: a string of 64 at most. */
function short(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64;
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
 * as `{ from, to }`, and `info`, `preset`, `angle` and `ref` when the panel
 * sent them.
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
  const { angle, preset, ref } = body;
  if (
    (angle !== undefined && !finite(angle)) ||
    (preset !== undefined && !short(preset)) ||
    (ref !== undefined && !short(ref))
  ) {
    return null;
  }
  return {
    ...(angle !== undefined && { angle }),
    changed,
    ...(info !== undefined && { info }),
    ...(preset !== undefined && { preset }),
    ...(ref !== undefined && { ref }),
    savedAt: text(body['savedAt']),
    spec,
    userAgent: text(body['userAgent']),
    values,
  };
}

/**
 * A host the dev server is known by, by Vite's own rule: an IP address,
 * `localhost` or a `.localhost` name, or one in `server.allowedHosts`, where
 * portless adds the name it serves the page at. A name that only resolves
 * here, as a rebound DNS name does, is none of these.
 */
function devHost(hostname: string, allowed: ReadonlyArray<string> | true): boolean {
  return (
    allowed === true ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
    hostname.startsWith('[') ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    allowed.some((host) =>
      host.startsWith('.')
        ? hostname.endsWith(host) || hostname === host.slice(1)
        : hostname === host,
    )
  );
}

/**
 * The page's own requests only: a write names this host as its origin, and no
 * read comes from another site. The origin must also be a known dev host,
 * never just whatever host the request names.
 */
function sameOrigin(
  req: IncomingMessage,
  write: boolean,
  allowed: ReadonlyArray<string> | true,
): boolean {
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && (write || site !== 'none')) {
    return false;
  }
  const { origin } = req.headers;
  if (origin === undefined) {
    return !write;
  }
  if (!URL.canParse(origin)) {
    return false;
  }
  const from = new URL(origin);
  // Behind portless the proxy's host is the page's, and it may hand it on as forwarded.
  const hosts = [req.headers.host, req.headers['x-forwarded-host']].flat();
  return devHost(from.hostname, allowed) && hosts.includes(from.host);
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
 * not in the browser. `GET /__tune/ref` lists the reference images in
 * `<dir>/ref`, and `GET /__tune/ref/<file>` gives one, from this origin so a
 * picture drawn of the page can hold it. Listed first, and added to the server ahead of Vite's
 * own middlewares, so it answers before the app's handler sees the path.
 */
export function tuneEndpoint(dir: string): Plugin {
  const file = resolve(dir, 'fold.json');
  const refs = resolve(dir, 'ref');
  return {
    apply: (_config, { command, isPreview }) => command === 'serve' && !isPreview,
    // A save is not a change to the page: no reload for it.
    config: () => ({ server: { watch: { ignored: [`${dir}/**`] } } }),
    configureServer(server) {
      const { allowedHosts: allowed } = server.config.server;
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path === undefined || (path !== PATH && path !== REF && !path.startsWith(`${REF}/`))) {
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
        const listRefs = async () => {
          if (req.method !== 'GET') {
            res.setHeader('allow', 'GET');
            refuse(405, 'GET');
            return;
          }
          if (!sameOrigin(req, false, allowed)) {
            refuse(403, 'same origin only');
            return;
          }
          const names = await readdir(refs).catch(() => []);
          answer(
            200,
            JSON.stringify({ files: names.filter((name) => REF_FILE.test(name)).sort() }),
          );
        };
        // An `<img>` names no origin, so an image is given to any GET: the name rule keeps it to this folder.
        const sendRef = async (name: string) => {
          const type = REF_TYPES[REF_FILE.exec(name)?.[1] ?? ''];
          const image =
            type === undefined || req.method !== 'GET'
              ? null
              : await readFile(resolve(refs, name)).catch(() => null);
          if (type === undefined || image === null) {
            refuse(404, 'no such image');
            return;
          }
          res.statusCode = 200;
          res.setHeader('content-type', type);
          res.setHeader('cache-control', 'no-store');
          res.end(image);
        };
        const handle = async () => {
          if (path === REF) {
            await listRefs();
            return;
          }
          if (path !== PATH) {
            await sendRef(path.slice(REF.length + 1));
            return;
          }
          if (req.method !== 'GET' && req.method !== 'POST') {
            res.setHeader('allow', 'GET, POST');
            refuse(405, 'GET or POST');
            return;
          }
          const write = req.method === 'POST';
          if (!sameOrigin(req, write, allowed)) {
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
              'values must be finite numbers for keys of the posted spec, info two strings, preset and ref short strings, angle a finite number',
            );
            return;
          }
          await mkdir(dir, { recursive: true });
          // Written whole, then moved over the file, so two saves at once never mix.
          const temp = `${file}.${randomUUID()}.tmp`;
          await writeFile(temp, `${JSON.stringify(save, null, 2)}\n`);
          await rename(temp, file);
          answer(200, JSON.stringify({ file, ok: true }));
        };
        void handle().catch(next);
      });
    },
    name: 'tune-endpoint',
  };
}
