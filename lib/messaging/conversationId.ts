import { md5 } from '../appwrite/storageAdapter';
import { orderedPair } from './format';

/** The id of the one conversation between two members — the same derivation
 *  the server uses (app/api/_lib/messaging.ts, via node:crypto), so a screen
 *  can open a thread with someone before either of them has written in it. */
export function conversationIdFor(x: string, y: string): string {
  const [a, b] = orderedPair(x, y);
  return md5(`dm|${a}|${b}`);
}
