import {withGuestErrors,actorStore,checkOrigin} from '@/lib/copilot/session';
import {checkOwnerKey,ownerToken,OWNER_COOKIE} from '@/lib/copilot/access';
import {cookies} from 'next/headers';
import {getPublicOrigin} from '@/lib/public-url';
import {NextRequest} from 'next/server';
export const runtime='nodejs';
const failures=new Map<string,number[]>();
async function handleGET(){try{const {db,access}=await actorStore();db.close();return Response.json({access,session:access.kind,message:'نشست آماده است.'},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return Response.json({error:e instanceof Error?e.message:'نشست آماده نشد'},{status:(e as any)?.status||400,headers:{'Cache-Control':'no-store'}});}}
async function handlePOST(req:Request){checkOrigin(req);const b=await req.json().catch(()=>({}));const store=await cookies();if(b.op==='logout'){store.delete(OWNER_COOKIE);return Response.json({ok:true});}
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'local';const now=Date.now();const recent=(failures.get(ip)||[]).filter(t=>now-t<600000);if(recent.length>=5)return Response.json({error:'تلاش‌های ناموفق زیاد بود؛ ده دقیقه صبر کنید.'},{status:429});
 if(typeof b.ownerKey!=='string'||!checkOwnerKey(b.ownerKey)){recent.push(now);failures.set(ip,recent);return Response.json({error:'کلید مالک درست نیست.'},{status:403});}
 const secure=new URL(getPublicOrigin(new NextRequest(req.url,{headers:req.headers}))).protocol==='https:';
 store.set(OWNER_COOKIE,ownerToken()!,{httpOnly:true,sameSite:'lax',secure,path:'/',maxAge:60*60*24*7});return Response.json({ok:true});}
export const GET=withGuestErrors(handleGET);
export const POST=withGuestErrors(handlePOST);
