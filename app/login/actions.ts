"use server";
const disabled={error:'ورود غیرفعال است؛ برنامه بدون ورود باز می‌شود.'};
export async function sendCodeAction(..._args:unknown[]){return disabled;}
export async function verifyCodeAction(..._args:unknown[]){return disabled;}
export async function getOAuthAuthorizeUrlAction(..._args:unknown[]){return disabled;}
export async function pollRelayResultAction(..._args:unknown[]){return disabled;}
