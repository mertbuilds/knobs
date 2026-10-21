/**
 * What a tab's frames loaded, as the DevTools protocol saw it: the document
 * loads of every frame under the top one, so the panel can say why devknobs'
 * frame was refused.
 */

/** One document load in a frame under the top one. */
export interface FrameLoad {
  /** Chrome's console lines about framing. */
  console: Array<string>;
  failed: {
    blockedReason: string | null;
    canceled: boolean;
    corsError: string | null;
    errorText: string;
  } | null;
  /** Where the frame ended: the last answer, or Chrome's error page. */
  finalUrl: string;
  frameId: string;
  /** Chrome's issues about it, from the Audits domain. */
  issues: Array<{ code: string; details: unknown }>;
  redirects: Array<{
    fromServiceWorker: boolean;
    location: string | null;
    status: number;
    url: string;
  }>;
  requestId: string;
  response: {
    fromDiskCache: boolean;
    fromServiceWorker: boolean;
    /** Only the headers that bear on framing, names in lower case. */
    headers: Record<string, string>;
    serviceWorkerResponseSource: string | null;
    /** The protocol does not tell it: the page fills it in, from its own registrations. */
    serviceWorkerScope: string | null;
    status: number;
    url: string;
  } | null;
  /** Fetch metadata as sent, where Chrome tells it (not for an answer from a service worker). */
  sent: { secFetchDest: string | null; secFetchSite: string | null } | null;
  /** Wall time, in ms. */
  startedAt: number;
  /** The address first asked for. */
  url: string;
}

const ERROR_PAGE = 'chrome-error://chromewebdata/';

// How many loads a tab keeps, and how many issues and lines each.
const KEPT_LOADS = 6;
const KEPT_NOTES = 5;
const FRAMING_LINE = /in a frame|framing|frame-ancestors|x-frame-options/i;

type Headers = Record<string, string>;
type Params = Record<string, unknown>;

function header(headers: Headers | undefined, name: string): string | null {
  if (!headers) {
    return null;
  }
  const found = Object.keys(headers).find((key) => key.toLowerCase() === name);
  return found === undefined ? null : headers[found]!;
}

/** The `frame-ancestors` part of a Content-Security-Policy, or null. */
export function frameAncestors(policy: string | null | undefined): string | null {
  if (!policy) {
    return null;
  }
  for (const directive of policy.split(/[;,]/)) {
    const trimmed = directive.trim();
    if (/^frame-ancestors(\s|$)/i.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

/** The headers of an answer that bear on framing. */
function framingHeaders(headers: Headers | undefined): Headers {
  const kept: Headers = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const key = name.toLowerCase();
    if (key === 'x-frame-options' || key === 'location' || key.startsWith('cross-origin-')) {
      kept[key] = value;
    } else if (key === 'content-security-policy') {
      const ancestors = frameAncestors(value);
      if (ancestors) {
        kept[key] = ancestors;
      }
    }
  }
  return kept;
}

const withoutHash = (url: string) => url.split('#')[0];

/** The document loads of one tab's frames, newest last. */
export class FrameLoads {
  readonly loads: Array<FrameLoad> = [];
  /** The tab's own frame, whose loads are not kept. */
  mainFrame: string | null = null;
  /** Headers as sent that came in before their request. */
  private readonly early = new Map<string, Headers>();

  private find(requestId: unknown): FrameLoad | undefined {
    return this.loads.findLast((load) => load.requestId === requestId);
  }

  private sent(load: FrameLoad, headers: Headers) {
    load.sent = {
      secFetchDest: header(headers, 'sec-fetch-dest'),
      secFetchSite: header(headers, 'sec-fetch-site'),
    };
  }

  /** Take one protocol event, `method` and its `params`. */
  event(method: string, params: Params): void {
    switch (method) {
      case 'Network.requestWillBeSent': {
        this.requested(params);
        break;
      }
      case 'Network.requestWillBeSentExtraInfo': {
        const headers = (params.headers ?? {}) as Headers;
        const load = this.find(params.requestId);
        if (load) {
          this.sent(load, headers);
        } else if (typeof params.requestId === 'string') {
          this.early.set(params.requestId, headers);
          if (this.early.size > 50) {
            this.early.delete(this.early.keys().next().value!);
          }
        }
        break;
      }
      case 'Network.responseReceived': {
        const load = this.find(params.requestId);
        const response = params.response as Params | undefined;
        if (!load || !response) {
          break;
        }
        const url = String(response.url);
        const fromServiceWorker = response.fromServiceWorker === true;
        load.response = {
          fromDiskCache: response.fromDiskCache === true,
          fromServiceWorker,
          headers: framingHeaders(response.headers as Headers | undefined),
          serviceWorkerResponseSource: (response.serviceWorkerResponseSource as string) ?? null,
          serviceWorkerScope: null,
          status: Number(response.status),
          url,
        };
        load.finalUrl = url;
        break;
      }
      case 'Network.loadingFailed': {
        const load = this.find(params.requestId);
        if (!load) {
          break;
        }
        const canceled = params.canceled === true;
        load.failed = {
          blockedReason: (params.blockedReason as string) ?? null,
          canceled,
          corsError:
            ((params.corsErrorStatus as Params | undefined)?.corsError as string | undefined) ??
            null,
          errorText: String(params.errorText ?? ''),
        };
        if (!canceled) {
          load.finalUrl = ERROR_PAGE;
        }
        break;
      }
      case 'Audits.issueAdded': {
        this.issue(params.issue as { code: string; details: Record<string, Params> } | undefined);
        break;
      }
      case 'Log.entryAdded': {
        const text = String((params.entry as Params | undefined)?.text ?? '');
        const load = this.loads.at(-1);
        if (load && FRAMING_LINE.test(text) && load.console.length < KEPT_NOTES) {
          load.console.push(text.trim());
        }
        break;
      }
      default:
    }
  }

  private requested(params: Params) {
    const request = params.request as Params | undefined;
    const frameId = params.frameId as string | undefined;
    if (params.type !== 'Document' || !request || !frameId || frameId === this.mainFrame) {
      return;
    }
    const url = String(request.url);
    const redirect = params.redirectResponse as Params | undefined;
    const load = this.find(params.requestId);
    if (load && redirect) {
      load.redirects.push({
        fromServiceWorker: redirect.fromServiceWorker === true,
        location: header(redirect.headers as Headers | undefined, 'location'),
        status: Number(redirect.status),
        url: String(redirect.url),
      });
      load.finalUrl = url;
      return;
    }
    const requestId = String(params.requestId);
    const next: FrameLoad = {
      console: [],
      failed: null,
      finalUrl: url,
      frameId,
      issues: [],
      redirects: [],
      requestId,
      response: null,
      sent: null,
      startedAt: Math.round(Number(params.wallTime ?? 0) * 1000),
      url,
    };
    const early = this.early.get(requestId);
    if (early) {
      this.sent(next, early);
      this.early.delete(requestId);
    }
    this.loads.push(next);
    if (this.loads.length > KEPT_LOADS) {
      this.loads.shift();
    }
  }

  /** An issue about one of the loads, by its request, or a frame-ancestors one, which names none. */
  private issue(issue: { code: string; details: Record<string, Params> } | undefined) {
    if (!issue) {
      return;
    }
    const requestId = Object.values(issue.details ?? {})
      .map((details) => (details?.request as Params | undefined)?.requestId)
      .find((id) => id !== undefined);
    const csp = issue.details?.contentSecurityPolicyIssueDetails;
    const load =
      requestId === undefined
        ? csp?.violatedDirective === 'frame-ancestors'
          ? this.loads.at(-1)
          : undefined
        : this.find(requestId);
    if (load && load.issues.length < KEPT_NOTES) {
      load.issues.push({ code: issue.code, details: issue.details });
    }
  }

  /**
   * The latest load of the frame that was asked to load `url`: the newest one
   * that started there gives the frame, and that frame's newest load is the
   * answer. Else the newest of all.
   */
  pick(url: string): FrameLoad | null {
    const started = this.loads.findLast((load) => withoutHash(load.url) === withoutHash(url));
    const frame = started?.frameId;
    return (
      (frame === undefined ? undefined : this.loads.findLast((load) => load.frameId === frame)) ??
      this.loads.at(-1) ??
      null
    );
  }
}

/** A short form of an address: its host and path, no query. */
function where(url: string): string {
  const parsed = URL.parse(url);
  if (!parsed) {
    return url;
  }
  return parsed.pathname === '/' ? parsed.host : `${parsed.host}${parsed.pathname}`;
}

const hostOf = (url: string) => URL.parse(url)?.hostname ?? '';

/** Why the load did not give a page devknobs can reach, in plain words. */
function refusal(load: FrameLoad): string {
  const { failed, response } = load;
  const at = where(response?.url ?? load.finalUrl);
  const host = hostOf(response?.url ?? load.finalUrl);
  const ancestors = response?.headers['content-security-policy'];
  const xfo = response?.headers['x-frame-options'];
  const cspIssue = load.issues.some((issue) => issue.code === 'ContentSecurityPolicyIssue');
  if (failed) {
    if (failed.corsError) {
      return `blocked by Chrome: CORS (${failed.corsError}) on ${host}`;
    }
    if (failed.blockedReason && failed.blockedReason !== 'other') {
      return `blocked by Chrome: ${failed.blockedReason} on ${host}`;
    }
    // Chrome takes frame-ancestors over X-Frame-Options where both are sent.
    if (ancestors) {
      return `blocked by Chrome: ${ancestors} on ${host}`;
    }
    if (xfo) {
      return `${at} answered ${response.status} with X-Frame-Options: ${xfo}`;
    }
    if (cspIssue) {
      return `blocked by Chrome: frame-ancestors on ${host}`;
    }
    if (failed.canceled) {
      return `the load of ${at} was canceled`;
    }
    return `${at} failed: ${failed.errorText}`;
  }
  return response ? `${at} answered ${response.status}` : `${at} gave no answer yet`;
}

/** One line that says why the frame's page was refused, from what its load shows. */
export function describeLoad(load: FrameLoad): string {
  const first = hostOf(load.url);
  const last = hostOf(load.response?.url ?? load.finalUrl);
  const elsewhere = last !== '' && last !== first;
  const parts: Array<string> = [];
  if (elsewhere) {
    parts.push(`redirected to another site: ${last}`);
  }
  if (load.failed || !elsewhere) {
    parts.push(refusal(load));
  }
  const line = parts.join('; ');
  return load.response?.fromServiceWorker ? `${line} (from a service worker)` : line;
}
