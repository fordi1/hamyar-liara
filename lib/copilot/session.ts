import {cookies,headers} from 'next/headers';
import {NextRequest} from 'next/server';
import {getPublicOrigin} from '@/lib/public-url';
import {openStore} from './store';
import {createHash} from 'node:crypto';
import {openGuests,resolveGuest,GUEST_COOKIE,guestCookieOptions,consumeGuestLimit} from './guests';
import {guestAccess,ownerAccess,isOwnerCookie,OWNER_COOKIE,OWNER_ACTOR} from './access';
import {checkOrigin} from './origin';
export async function actorStore(){
  const h=await headers();
  const request=new NextRequest('http://localhost:3000/api/session',{headers:h});
  checkOrigin(request);
  const cookieStore=await cookies();
  if(isOwnerCookie(cookieStore.get(OWNER_COOKIE)?.value))return {actor:OWNER_ACTOR,access:ownerAccess() as ReturnType<typeof ownerAccess>|ReturnType<typeof guestAccess>,db:openStore((process.env.COPILOT_DB_PATH||'/tmp/liara-copilot/data.sqlite')+'.'+createHash('sha256').update(OWNER_ACTOR).digest('hex'))};
  const registry=openGuests();
  try {
    const session=resolveGuest(registry,cookieStore.get(GUEST_COOKIE)?.value);
    consumeGuestLimit(registry,'requests:'+session.actor,120,60000);
    if(session.token)cookieStore.set(GUEST_COOKIE,session.token,guestCookieOptions(new URL(getPublicOrigin(request)).protocol==='https:'));
    const actor=session.actor;
    return {actor,access:guestAccess() as ReturnType<typeof ownerAccess>|ReturnType<typeof guestAccess>,db:openStore((process.env.COPILOT_DB_PATH||'/tmp/liara-copilot/data.sqlite')+'.'+createHash('sha256').update(actor).digest('hex'))};
  } finally {registry.close();}
}
export function limitGuest(actor:string,scope:string,max:number,windowMs:number){const registry=openGuests();try{if(scope==='sources')consumeGuestLimit(registry,'all-uploads',50,3600000);consumeGuestLimit(registry,scope+':'+actor,max,windowMs);}finally{registry.close();}}
export function withGuestErrors<T extends (...args:any[])=>Promise<Response>>(handler:T){return async(...args:Parameters<T>)=>{try{const response=await handler(...args);response.headers.set('Cache-Control','private, no-store');response.headers.append('Vary','Cookie');return response;}catch(e){const status=typeof (e as any)?.status==='number'?(e as any).status:500;return Response.json({error:status===500?'درخواست کامل نشد؛ دوباره تلاش کنید.':e instanceof Error?e.message:'درخواست مجاز نیست'},{status,headers:{'Cache-Control':'private, no-store',...(status===429?{'Retry-After':'60'}:{})}});}};}
export {checkOrigin,OriginError} from './origin';
