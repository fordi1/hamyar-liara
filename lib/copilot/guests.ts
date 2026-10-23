import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const GUEST_COOKIE = 'liara_guest';
export const GUEST_TTL = 7 * 24 * 60 * 60 * 1000;
export class GuestLimitError extends Error { readonly status=429; }
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function openGuests(path=(process.env.COPILOT_DB_PATH || '/tmp/liara-copilot/data.sqlite')+'.guest-sessions') {
  mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS guest_sessions(token_hash TEXT PRIMARY KEY,actor TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS guest_limits(scope TEXT NOT NULL,bucket INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(scope,bucket));`);
  return db;
}
export function consumeGuestLimit(db:DatabaseSync,scope:string,max:number,windowMs:number,now=Date.now()) {
  const bucket=Math.floor(now/windowMs);
  const row=db.prepare(`INSERT INTO guest_limits VALUES(?,?,1) ON CONFLICT(scope,bucket) DO UPDATE SET count=count+1 WHERE count<? RETURNING count`).get(scope,bucket,max);
  if(!row)throw new GuestLimitError('تعداد درخواست‌ها به حد مجاز رسیده است؛ کمی بعد دوباره تلاش کنید.');
}
export function resolveGuest(db:DatabaseSync,token:string|undefined,now=Date.now()) {
  if(token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const row=db.prepare('SELECT actor,expires FROM guest_sessions WHERE token_hash=? AND expires>?').get(hash(token),now);
    if(row)return {actor:String(row.actor),expires:Number(row.expires),token:undefined as string|undefined};
  }
  // A client-provided actor, old auth token or arbitrary cookie never becomes an actor ID.
  consumeGuestLimit(db,'new-sessions',300,3600000,now);
  const opaque=randomBytes(32).toString('base64url');
  const actor='guest_'+randomUUID(),expires=now+GUEST_TTL;
  db.prepare('INSERT INTO guest_sessions VALUES(?,?,?)').run(hash(opaque),actor,expires);
  return {actor,expires,token:opaque};
}
export function guestCookieOptions(secure:boolean) {
  return {httpOnly:true,secure,sameSite:'lax' as const,path:'/',maxAge:GUEST_TTL/1000};
}
