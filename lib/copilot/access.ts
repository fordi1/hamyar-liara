import {createHmac,timingSafeEqual} from 'node:crypto';
export const GUEST_ACCOUNT_MESSAGE='تحلیل محلی بدون ورود فعال است. برای دیپلوی و پایش واقعی، در «تنظیمات» کلید مالک را وارد کنید.';
export class AccountAccessError extends Error {readonly status=403;constructor(){super(GUEST_ACCOUNT_MESSAGE);}}
export const OWNER_ACTOR='owner';
export const OWNER_COOKIE='liara_owner';
export const isGuest=(actor:string)=>actor!==OWNER_ACTOR;
export function assertAccountAccess(actor:string){if(isGuest(actor))throw new AccountAccessError();}
export function guestAccess(){return {kind:'guest' as const,accountOperations:false,ai:false,sourceAnalysis:true,ownerAvailable:!!process.env.OWNER_KEY,message:GUEST_ACCOUNT_MESSAGE};}
export function ownerAccess(){return {kind:'owner' as const,accountOperations:true,ai:true,sourceAnalysis:true,ownerAvailable:true,message:'حالت مالک فعال است؛ عملیات حساس همچنان تأیید مستقل می‌خواهند.'};}
export const guestProviderStatus={state:'restricted',provider:'مدل متصل',message:'مدل متصل مالک برای مهمان‌ها استفاده نمی‌شود؛ تحلیل قطعی محلی و دمو در دسترس‌اند.'};
export function ownerToken(){const key=process.env.OWNER_KEY;if(!key||key.length<8)return null;return createHmac('sha256',key).update('liara-owner-v1').digest('hex');}
export function checkOwnerKey(input:string){const key=process.env.OWNER_KEY;if(!key||key.length<8)return false;const a=Buffer.from(input),b=Buffer.from(key);return a.length===b.length&&timingSafeEqual(a,b);}
export function isOwnerCookie(value?:string){const t=ownerToken();if(!t||!value)return false;const a=Buffer.from(value),b=Buffer.from(t);return a.length===b.length&&timingSafeEqual(a,b);}
