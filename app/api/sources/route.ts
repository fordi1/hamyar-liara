import {withGuestErrors} from '@/lib/copilot/session';
import {actorStore,checkOrigin,OriginError,limitGuest} from '@/lib/copilot/session';import {ingestSource} from '@/lib/copilot/ingest';
export const runtime='nodejs';
async function handlePOST(req:Request){const {actor,db}=await actorStore();try{checkOrigin(req);limitGuest(actor,'sources',10,3600000);return Response.json(await ingestSource(db,actor,req));}catch(e){return Response.json({error:e instanceof Error?e.message:'خطای دریافت سورس'},{status:e instanceof OriginError?403:(e as any)?.status||400});}finally{db.close();}}

export const POST=withGuestErrors(handlePOST);
