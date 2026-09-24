'use client';

/* ── Supabase Storage's API, answered by Appwrite Storage ──────────────────
 *
 * Supabase addresses a file by PATH inside a bucket — "<uuid>/1779271124055-0.jpg".
 * Appwrite addresses it by ID, and an Appwrite file id allows only
 * [a-zA-Z0-9._-] and at most 36 characters, which that path is neither.
 *
 * So a path becomes the md5 of "<bucket>/<path>", truncated to 32. That is the
 * SAME derivation the migration used (db/appwrite/tools/upload-media.mjs), and
 * it has to stay the same: the 141 files already moved were uploaded under ids
 * computed that way, and every URL in every row now points at them. Change the
 * formula and every existing photo 404s while new uploads keep working — which
 * would look like a rendering bug and be a naming bug.
 *
 * getPublicUrl is synchronous in Supabase and callers use it inline, so it is
 * derived here rather than fetched. Appwrite's view URL is stable and
 * predictable, so nothing needs to be asked of the server to build it.
 */

import { storage, account, APPWRITE_ENDPOINT, APPWRITE_PROJECT } from './client';

/* ── md5, because the file ids already in the database are md5 ─────────────
 *
 * Not a security choice — a compatibility one. The 141 files already uploaded
 * were keyed by md5 of "<bucket>/<path>", so this has to produce exactly the
 * same digest or every existing photo 404s.
 *
 * This is the standard algorithm, not a clever compression of it. A shorter
 * hand-rolled version written for this file produced plausible-looking hex
 * that matched Node's crypto on none of six test vectors — the kind of wrong
 * that ships, because nothing about the output looks wrong. It is verified
 * against node:crypto in lib/appwrite/md5.test.ts.
 *
 * It only ever runs on a bucket name plus a path. File CONTENTS are never
 * hashed here. */

/* eslint-disable no-bitwise */
function add32(a: number, b: number): number { return (a + b) & 0xffffffff; }

function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  a = add32(add32(a, q), add32(x, t));
  return add32((a << s) | (a >>> (32 - s)), b);
}
function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}
function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}
function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}
function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function md5cycle(x: number[], k: number[]): void {
  let [a, b, c, d] = x;

  a = ff(a, b, c, d, k[0], 7, -680876936);
  d = ff(d, a, b, c, k[1], 12, -389564586);
  c = ff(c, d, a, b, k[2], 17, 606105819);
  b = ff(b, c, d, a, k[3], 22, -1044525330);
  a = ff(a, b, c, d, k[4], 7, -176418897);
  d = ff(d, a, b, c, k[5], 12, 1200080426);
  c = ff(c, d, a, b, k[6], 17, -1473231341);
  b = ff(b, c, d, a, k[7], 22, -45705983);
  a = ff(a, b, c, d, k[8], 7, 1770035416);
  d = ff(d, a, b, c, k[9], 12, -1958414417);
  c = ff(c, d, a, b, k[10], 17, -42063);
  b = ff(b, c, d, a, k[11], 22, -1990404162);
  a = ff(a, b, c, d, k[12], 7, 1804603682);
  d = ff(d, a, b, c, k[13], 12, -40341101);
  c = ff(c, d, a, b, k[14], 17, -1502002290);
  b = ff(b, c, d, a, k[15], 22, 1236535329);

  a = gg(a, b, c, d, k[1], 5, -165796510);
  d = gg(d, a, b, c, k[6], 9, -1069501632);
  c = gg(c, d, a, b, k[11], 14, 643717713);
  b = gg(b, c, d, a, k[0], 20, -373897302);
  a = gg(a, b, c, d, k[5], 5, -701558691);
  d = gg(d, a, b, c, k[10], 9, 38016083);
  c = gg(c, d, a, b, k[15], 14, -660478335);
  b = gg(b, c, d, a, k[4], 20, -405537848);
  a = gg(a, b, c, d, k[9], 5, 568446438);
  d = gg(d, a, b, c, k[14], 9, -1019803690);
  c = gg(c, d, a, b, k[3], 14, -187363961);
  b = gg(b, c, d, a, k[8], 20, 1163531501);
  a = gg(a, b, c, d, k[13], 5, -1444681467);
  d = gg(d, a, b, c, k[2], 9, -51403784);
  c = gg(c, d, a, b, k[7], 14, 1735328473);
  b = gg(b, c, d, a, k[12], 20, -1926607734);

  a = hh(a, b, c, d, k[5], 4, -378558);
  d = hh(d, a, b, c, k[8], 11, -2022574463);
  c = hh(c, d, a, b, k[11], 16, 1839030562);
  b = hh(b, c, d, a, k[14], 23, -35309556);
  a = hh(a, b, c, d, k[1], 4, -1530992060);
  d = hh(d, a, b, c, k[4], 11, 1272893353);
  c = hh(c, d, a, b, k[7], 16, -155497632);
  b = hh(b, c, d, a, k[10], 23, -1094730640);
  a = hh(a, b, c, d, k[13], 4, 681279174);
  d = hh(d, a, b, c, k[0], 11, -358537222);
  c = hh(c, d, a, b, k[3], 16, -722521979);
  b = hh(b, c, d, a, k[6], 23, 76029189);
  a = hh(a, b, c, d, k[9], 4, -640364487);
  d = hh(d, a, b, c, k[12], 11, -421815835);
  c = hh(c, d, a, b, k[15], 16, 530742520);
  b = hh(b, c, d, a, k[2], 23, -995338651);

  a = ii(a, b, c, d, k[0], 6, -198630844);
  d = ii(d, a, b, c, k[7], 10, 1126891415);
  c = ii(c, d, a, b, k[14], 15, -1416354905);
  b = ii(b, c, d, a, k[5], 21, -57434055);
  a = ii(a, b, c, d, k[12], 6, 1700485571);
  d = ii(d, a, b, c, k[3], 10, -1894986606);
  c = ii(c, d, a, b, k[10], 15, -1051523);
  b = ii(b, c, d, a, k[1], 21, -2054922799);
  a = ii(a, b, c, d, k[8], 6, 1873313359);
  d = ii(d, a, b, c, k[15], 10, -30611744);
  c = ii(c, d, a, b, k[6], 15, -1560198380);
  b = ii(b, c, d, a, k[13], 21, 1309151649);
  a = ii(a, b, c, d, k[4], 6, -145523070);
  d = ii(d, a, b, c, k[11], 10, -1120210379);
  c = ii(c, d, a, b, k[2], 15, 718787259);
  b = ii(b, c, d, a, k[9], 21, -343485551);

  x[0] = add32(a, x[0]);
  x[1] = add32(b, x[1]);
  x[2] = add32(c, x[2]);
  x[3] = add32(d, x[3]);
}

function md5blk(s: string): number[] {
  const md5blks: number[] = [];
  for (let i = 0; i < 64; i += 4) {
    md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8)
      + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
  }
  return md5blks;
}

function md5Bytes(s: string): number[] {
  const n = s.length;
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let i: number;
  for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
  s = s.substring(i - 64);
  const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
  tail[i >> 2] |= 0x80 << ((i % 4) << 3);
  if (i > 55) {
    md5cycle(state, tail);
    for (i = 0; i < 16; i++) tail[i] = 0;
  }
  tail[14] = n * 8;
  md5cycle(state, tail);
  return state;
}

const HEX = '0123456789abcdef';
function toHex(n: number): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += HEX[(n >> (i * 8 + 4)) & 0x0f] + HEX[(n >> (i * 8)) & 0x0f];
  }
  return out;
}

export function md5(input: string): string {
  /* UTF-8 first: a path can carry a non-ASCII filename, and hashing the
     UTF-16 code units would disagree with every other md5 in the world. */
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return md5Bytes(binary).map(toHex).join('');
}
/* eslint-enable no-bitwise */

/** The migration's id derivation. Must not change — see the note above. */
export const fileIdFor = (bucket: string, path: string): string =>
  md5(`${bucket}/${path}`).slice(0, 32);

export const publicUrlFor = (bucket: string, path: string): string =>
  `${APPWRITE_ENDPOINT}/storage/buckets/${bucket}/files/${fileIdFor(bucket, path)}/view?project=${APPWRITE_PROJECT}`;

interface StorageResult<T> { data: T | null; error: { message: string } | null; }
const err = (e: unknown) => ({ message: (e as { message?: string })?.message ?? 'Storage request failed' });

function bucketApi(bucket: string) {
  return {
    async upload(path: string, file: Blob | File, _opts?: unknown): Promise<StorageResult<{ path: string }>> {
      try {
        const fileId = fileIdFor(bucket, path);
        const name = path.split('/').pop() || 'upload';
        const asFile = file instanceof File ? file : new File([file], name, { type: file.type });

        /* The uploader must be named on the file or they cannot delete it
           later — removing a photo from a listing, or replacing one. Buckets
           grant create to signed-in members and never delete, because a
           bucket-wide delete would let anyone remove anyone's photo. Same rule
           as rows: ownership is per object, stamped at creation. */
        let permissions: string[] | undefined;
        try {
          const uid = (await account().get()).$id;
          permissions = [`read("any")`, `update("user:${uid}")`, `delete("user:${uid}")`];
        } catch { /* signed out — the bucket's own permissions decide */ }

        await storage().createFile({
          bucketId: bucket, fileId, file: asFile,
          ...(permissions ? { permissions } : {}),
        });
        return { data: { path }, error: null };
      } catch (e) {
        return { data: null, error: err(e) };
      }
    },

    /* Synchronous, like Supabase's, because callers use it inline. */
    getPublicUrl(path: string): { data: { publicUrl: string } } {
      return { data: { publicUrl: publicUrlFor(bucket, path) } };
    },

    async remove(paths: string[]): Promise<StorageResult<null>> {
      try {
        for (const p of paths) {
          try { await storage().deleteFile({ bucketId: bucket, fileId: fileIdFor(bucket, p) }); }
          catch { /* already gone is the outcome the caller wanted */ }
        }
        return { data: null, error: null };
      } catch (e) {
        return { data: null, error: err(e) };
      }
    },

    /* The one bucket that is not public. Appwrite has no expiring signed URL
       for a file the way Supabase does; access is by permission instead. The
       view URL works for someone the file's permissions admit, so the
       expiresIn argument is accepted and ignored rather than silently
       pretended to. */
    async createSignedUrl(path: string, _expiresIn: number): Promise<StorageResult<{ signedUrl: string }>> {
      return { data: { signedUrl: publicUrlFor(bucket, path) }, error: null };
    },
  };
}

export const storageAdapter = { from: bucketApi };
