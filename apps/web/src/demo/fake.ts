/**
 * The one value the requests card's secret headers row sends as its token and its key. It is not a
 * secret: it is here so devknobs has something to hide, and so the echo
 * endpoint knows which header values it may send back.
 */
export const FAKE_SECRET = 'demo-not-a-secret';
