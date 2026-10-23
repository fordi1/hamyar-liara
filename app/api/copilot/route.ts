import {withGuestErrors} from '@/lib/copilot/session';
import {actorStore,checkOrigin,OriginError} from '@/lib/copilot/session';import {list,save} from '@/lib/copilot/store';import {diagnose} from '@/lib/copilot/analyzers';import {operationSchema} from '@/lib/copilot/executor';import {jobView} from '@/lib/copilot/jobs';import {redact} from '@/lib/copilot/liaraClient';
export const runtime='nodejs';
async function handleGET(){const {actor,db}=await actorStore();try{return Response.json({...jobView(db,actor),chat:list(db,'chat').reverse(),playbook:list(db,'playbook'),deployments:list(db,'deployment')});}finally{db.close();}}
async function handlePOST(req:Request){const {db}=await actorStore();try{checkOrigin(req);if(req.headers.get('content-type')?.includes('multipart'))throw Error('بارگذاری سورس فقط از مسیر یکپارچه /api/sources انجام می‌شود');const b=await req.json();if(b.op==='chat'&&b.demo){const findings=diagnose(String(b.text).slice(0,12000));return new Response('نمونه نمایشی — '+(findings.length?findings.map(f=>f.title+'\n'+f.fix).join('\n'):'برای تحلیل نمایشی یک لاگ نمونه وارد کنید.'),{headers:{'Content-Type':'text/plain; charset=utf-8'}});}if(b.op==='playbook'){save(db,'playbook',{title:redact(String(b.title).slice(0,200)),steps:redact(String(b.steps).slice(0,5000)),...(b.payload?{payload:operationSchema.parse(b.payload)}:{})});return Response.json({ok:true});}throw Error('مسیر قدیمی تأیید یا تنظیمات غیرفعال است؛ از کار و نسخه واقعی استفاده کنید.');}catch(e){return Response.json({error:e instanceof Error?e.message:'درخواست نامعتبر'},{status:e instanceof OriginError?403:400});}finally{db.close();}}

export const GET=withGuestErrors(handleGET);

export const POST=withGuestErrors(handlePOST);
