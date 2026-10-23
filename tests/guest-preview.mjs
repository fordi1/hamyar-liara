// Real managed-preview browser checks. Local fixture uploads only; no provider or Liara mutation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {zipSync,strToU8} from 'fflate';
const require=createRequire(import.meta.url);
const {chromium}=require('/usr/local/lib/node_modules/playwright');
const env=readFileSync('.env.local','utf8');
const origin=process.env.PREVIEW_TEST_ORIGIN||env.match(/^TEABLE_APP_PUBLIC_ORIGIN=(.*)$/m)?.[1]?.replace(/^['"]|['"]$/g,'');
if(!origin)throw Error('Preview public origin is not configured');
const browser=await chromium.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox']});
const a=await browser.newContext({viewport:{width:1440,height:960}}),b=await browser.newContext({viewport:{width:390,height:844}});
try{
 const page=await a.newPage(),other=await b.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));other.on('pageerror',e=>errors.push(e.message));
 const sessionResponse=page.waitForResponse(r=>r.url().endsWith('/api/session'));await page.goto(origin);await sessionResponse;await page.waitForFunction(()=>document.querySelector('textarea')!==null);await page.getByRole('heading',{name:'سلام، من همیار لیارا هستم'}).waitFor();await page.getByText('بدون ورود · تحلیل محلی',{exact:true}).waitFor();assert(!page.url().includes('/login'));
 const cookie=(await a.cookies()).find(c=>c.name==='liara_guest');assert(cookie?.httpOnly);assert(cookie?.secure);assert.equal(cookie?.sameSite,'Lax');assert(!(await page.evaluate(()=>document.cookie)).includes('liara_guest'));
 for(const name of ['پروژه‌ها','استقرارها','عیب‌یابی','راهنماها','تاریخچه عملیات','تنظیمات','گفت‌وگو']){await page.getByRole('button',{name,exact:true}).click();assert(!page.url().includes('/login'));}
 const fixture=zipSync({'package.json':strToU8('{"name":"guest-browser-fixture","main":"server.js"}'),'server.js':strToU8('console.log("not executed")')});
 const uploadResponse=page.waitForResponse(r=>r.url().endsWith('/api/sources')&&r.request().method()==='POST');
 await page.locator('input[type=file]').setInputFiles({name:'guest-browser-fixture.zip',mimeType:'application/zip',buffer:Buffer.from(fixture)});
 const upload=await uploadResponse;assert.equal(upload.status(),200);const payload=await upload.json();assert(payload.sourceRef);assert(payload.job.id);
 await page.getByText('سورس ذخیره‌شده · ادامهٔ استقرار ←',{exact:true}).waitFor();
 await page.reload();await page.getByText('سورس ذخیره‌شده · ادامهٔ استقرار ←',{exact:true}).waitFor();
 await page.getByRole('button',{name:'پذیرش و ساخت نسخه اصلاح‌شده',exact:true}).click();await page.getByText('نسخه اصلاحی جدید ساخته شد؛ اصل سورس حفظ شده است.',{exact:true}).first().waitFor();
 const own=await (await a.request.get(origin+'/api/jobs')).json();const job=own.jobs.find(j=>j.id===payload.job.id);assert(job);assert.notEqual(job.source,job.original);
 assert.equal((await a.request.get(origin+'/api/jobs?download='+job.source)).status(),200);
 await page.getByLabel('پیام به همیار').fill('سورس را بررسی کن');await page.getByRole('button',{name:'ارسال',exact:true}).click();await page.getByText('تحلیل محلی — بدون فراخوانی مدل یا حساب مالک',{exact:false}).waitFor();
 await other.goto(origin);await other.getByRole('heading',{name:'سلام، من همیار لیارا هستم'}).waitFor();await other.getByLabel('باز کردن منو').click();await other.getByRole('button',{name:'پروژه‌ها',exact:true}).click();assert(!other.url().includes('/login'));assert.equal(await other.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const second=await (await b.request.get(origin+'/api/jobs')).json();assert.equal(second.jobs.length,0);assert.equal(second.chat.length,0);
 const cookieB=(await b.cookies()).find(c=>c.name==='liara_guest');assert(cookieB);assert.notEqual(cookie.value,cookieB.value);
 assert.equal((await b.request.get(origin+'/api/jobs?download='+job.source)).status(),404);
 const headers={Origin:origin,'Content-Type':'application/json','x-teable-user-id':'owner-forgery'};
 for(const body of [{op:'select',id:job.id},{op:'patch',id:job.id}])assert.equal((await b.request.post(origin+'/api/jobs',{headers,data:{...body,actor:job.actor}})).status(),400);
 assert.equal((await a.request.get(origin+'/api/liara')).status(),403);
 assert.equal((await a.request.get(origin+'/api/source-export')).status(),403);
 assert.equal((await a.request.post(origin+'/api/liara',{headers,data:{op:'prepare',payload:{action:'restart',project:'owner-app'},actor:'anonymous'}})).status(),403);
 assert.equal((await a.request.post(origin+'/api/jobs',{headers,data:{op:'mode',mode:'real'}})).status(),403);
 assert.equal((await a.request.post(origin+'/api/jobs',{headers,data:{op:'provider_retry'}})).status(),403);
 assert.equal((await a.request.post(origin+'/api/jobs',{headers,data:{op:'env_prepare',id:job.id,values:[{key:'SECRET',value:'fixture'}]}})).status(),403);
 assert.equal((await a.request.post(origin+'/api/jobs',{headers:{...headers,Origin:'https://external.example'},data:{op:'mode',mode:'preview'}})).status(),403);
 const alias=await a.request.get(origin+'/login',{maxRedirects:0});assert.equal(alias.status(),200);assert(!alias.headers().location);
 assert.equal((await a.request.get(origin+'/auth/teable/callback?code=fixture',{maxRedirects:0})).status(),410);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: no-login desktop/mobile entry and navigation; HttpOnly secure guest cookie; upload/patch/download/reload; local chat; two-session isolation; owner credential denial; forged actor/Origin rejection; old login route has no form or redirect.');
}finally{await browser.close();}
