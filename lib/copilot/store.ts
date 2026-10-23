import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export const risks = { inspect:'read', config:'safe_write', deploy:'sensitive', restart:'sensitive', power:'sensitive', resize:'sensitive', delete:'sensitive', rollback:'sensitive', database_create:'sensitive', database_attach:'sensitive', environment_replace:'sensitive', domain:'sensitive' } as const;
export type Action = keyof typeof risks;
export function openStore(path = process.env.COPILOT_DB_PATH || '/tmp/liara-copilot/data.sqlite') {
 mkdirSync(dirname(path), {recursive:true}); const db = new DatabaseSync(path); db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL); CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, action TEXT NOT NULL, args TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL, expires INTEGER NOT NULL, result TEXT);`); return db;
}
function canonical(v: unknown): string { if(Array.isArray(v)) return '['+v.map(canonical).join(',')+']'; if(v && typeof v==='object') return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}'; return JSON.stringify(v); }
export function propose(db:DatabaseSync, action:Action, args:unknown, ttl=300000) { if(!Object.hasOwn(risks,action)) throw Error('عملیات ناشناخته'); const id=randomUUID(), text=canonical(args), digest=createHash('sha256').update(action+text).digest('hex'); db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,NULL)').run(id,action,text,digest,'pending',Date.now()+ttl); return id; }
export function transition(db:DatabaseSync,id:string, state:'approved'|'cancelled') { const r=db.prepare('UPDATE approvals SET state=? WHERE id=? AND state=? AND expires>?').run(state,id,'pending',Date.now()); if(!r.changes) throw Error('تأیید منقضی یا مصرف شده است'); }
export function execute(_db:DatabaseSync,_id:string,_args:unknown,_dryRun=true):never { throw Error('تأیید قدیمی قابل اجرا نیست؛ اصلاح باید روی نسخه جدید سورس اعمال شود.'); }
export function save(db:DatabaseSync,kind:string,body:unknown){ const id=randomUUID(); db.prepare('INSERT INTO records VALUES(?,?,?,?)').run(id,kind,JSON.stringify(body),new Date().toISOString()); return id; }
export function list(db:DatabaseSync,kind:string){return db.prepare('SELECT * FROM records WHERE kind=? ORDER BY created DESC LIMIT 100').all(kind).map(r=>({...r,body:JSON.parse(String(r.body))}));}
