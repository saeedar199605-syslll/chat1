// workerd can't load iconv-lite (needs node:stream internals); UTF-8 via TextDecoder is all this app uses.
export const decode = (buf, enc = 'utf8') => new TextDecoder(enc === 'utf8' ? 'utf-8' : enc).decode(buf);
export const encodingExists = (e) => { try { new TextDecoder(e); return true; } catch { return false; } };
export const getDecoder = (enc) => { const d = new TextDecoder(enc); return { write: (b) => d.decode(b, { stream: true }), end: () => '' }; };
export default { decode, encodingExists, getDecoder };
