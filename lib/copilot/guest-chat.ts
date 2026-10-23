import type {DatabaseSync} from 'node:sqlite';
import {getJob} from './jobs';import {readRevision} from './revisions';import {diagnose} from './analyzers';import {redact} from './liaraClient';import {save} from './store';import {GUEST_ACCOUNT_MESSAGE} from './access';
export function localGuestReply(db:DatabaseSync,actor:string,text:string,jobId?:string){
  const safe=redact(text).slice(0,12000);let answer='**تحلیل محلی — بدون فراخوانی مدل یا حساب مالک**\n\n';
  if(jobId){const job=getJob(db,actor,jobId),r=readRevision(db,actor,job.source);answer+=`سورس «${r.name}» با نسخهٔ ${r.hash.slice(0,8)} در این نشست ذخیره شده است.\n\nپشتهٔ شناسایی‌شده: ${r.analysis.framework}؛ پلتفرم پیشنهادی: ${r.analysis.platform||'نامشخص'}.\n\n`;
    if(r.root===null)answer+='برای بررسی دقیق‌تر، پوشهٔ اصلی پروژه را در کارت سورس انتخاب کنید.\n\n';
    if(job.patches.length)answer+=`برای این نسخه ${job.patches.length} اصلاح قطعی پیشنهاد شده؛ diff را در همین گفت‌وگو بررسی و در صورت تمایل روی نسخهٔ جدید اعمال کنید.\n\n`;
  }else answer+='فایل ZIP را پیوست کنید تا پشته، پورت، نام متغیرها و اصلاح‌های قطعی راه‌اندازی را بررسی کنم.\n\n';
  const findings=diagnose(safe);if(findings.length)answer+=findings.map(f=>`**${f.title}** — ${f.confidence}\n\n${f.fix}\n\nشواهد:\n\`\`\`text\n${f.evidence.join('\n')}\n\`\`\`\n${f.missing}`).join('\n\n')+'\n\n';
  answer+=GUEST_ACCOUNT_MESSAGE;
  save(db,'chat',{role:'user',text:safe});save(db,'chat',{role:'assistant',text:answer,mode:'local'});return answer;
}
