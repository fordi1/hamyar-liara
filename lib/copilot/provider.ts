import { createHash } from 'node:crypto';
import { readCompletion } from './completion-stream';

export type ProviderStatus = {
  state: 'ready' | 'network_block' | 'unavailable' | 'missing';
  message: string;
  httpStatus?: number;
  provider?: string;
};
const runtime = globalThis as typeof globalThis & {
  copilotProviderV2?: { fingerprint: string; result: Promise<ProviderStatus>; expires?:number; checked?:number };
};

export function providerName() {
  try {
    const host = new URL(process.env.LLM_BASE_URL || '').hostname;
    return host === 'ai.boxapi.ir' ? 'BoxAPI' : host === 'codecraftapi.com' ? 'CodeCraft' : 'هوش مصنوعی';
  } catch { return 'هوش مصنوعی'; }
}

export function providerConfig() {
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  const url = process.env.LLM_BASE_URL;
  if (!key || !model || !url) throw Error('پیکربندی ارائه‌دهنده در runtime کامل نیست.');
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw Error('نشانی ارائه‌دهنده باید HTTPS و بدون اطلاعات ورود یا query باشد.');
  }
  if (key.startsWith('box-ai-') && base.hostname !== 'ai.boxapi.ir') {
    throw Error('توکن BoxAPI فقط به endpoint رسمی آن ارسال می‌شود.');
  }
  return { key, model, endpoint: base.toString().replace(/\/$/, '') + '/chat/completions' };
}

function providerErrorDetail(body: string) {
  try {
    const parsed = JSON.parse(body);
    let detail = parsed.error?.message ?? parsed.message ?? parsed.detail ?? (typeof parsed.error === 'string' ? parsed.error : '');
    if (typeof detail !== 'string') return '';
    for (const key of ['LLM_API_KEY', 'LIARA_API_TOKEN', 'LLM_BASE_URL', 'LLM_MODEL']) {
      const secret = process.env[key];
      if (secret) detail = detail.split(secret).join('[حذف‌شده]');
    }
    return detail.replace(/(?:box-ai-|sk-)[a-z0-9_-]+/gi, '[حذف‌شده]').replace(/Bearer\s+[^\s"']+/gi, 'Bearer [حذف‌شده]').replace(/https?:\/\/[^\s"']+/g, '[نشانی حذف‌شده]').slice(0,350);
  } catch { return ''; }
}

export function classifyProvider(status: number, contentType: string, body: string, provider = providerName()): ProviderStatus {
  if (status === 403 && (/text\/html/i.test(contentType) || /cloudflare|just a moment/i.test(body))) {
    return { state: 'network_block', provider, httpStatus: status, message: `دسترسی شبکه به ارائه‌دهنده ${provider} با چالش مرورگر مسدود شده است. این پاسخ نشانهٔ نامعتبر بودن کلید API نیست. مالک حساب باید از پشتیبانی ارائه‌دهنده درخواست دسترسی رسمی سروربه‌سرور کند.` };
  }
  if (status === 403 && /not allowed to use the requested model|model_not_allowed|model_access_denied/i.test(body)) {
    return { state: 'unavailable', provider, httpStatus: status, message: `${provider}: این کلید اجازهٔ استفاده از مدل تنظیم‌شده را ندارد. مالک حساب باید دسترسی این مدل را در داشبورد ارائه‌دهنده فعال کند یا نام دقیق مدل مجاز این کلید را برای تنظیم برنامه مشخص کند. کلید را دوباره در گفت‌وگو نفرستید.` };
  }
  const detail = status === 401 ? 'احراز هویت درخواست پذیرفته نشد؛ مالک حساب باید تنظیمات دسترسی را بررسی کند.'
    : status === 402 ? 'اعتبار یا دسترسی مالی حساب ارائه‌دهنده کافی نیست؛ داشبورد ارائه‌دهنده را بررسی کنید.'
    : status === 429 ? 'محدودیت درخواست ارائه‌دهنده فعال شده است؛ کمی بعد دوباره تلاش کنید.'
    : status === 400 || status === 404 || status === 422 ? 'ارائه‌دهنده مدل یا قالب درخواست را نپذیرفت؛ تنظیمات مدل و قابلیت ابزار باید بررسی شوند.'
    : 'ارائه‌دهنده پاسخ قابل استفاده‌ای نداد.';
  const providerDetail = providerErrorDetail(body);
  return { state: 'unavailable', provider, httpStatus: status, message: `${provider}: ${detail} پاسخ شبیه‌سازی‌شده جایگزین نمی‌شود.${providerDetail ? ' پیام سرویس: ' + providerDetail : ''}` };
}

export class ProviderRequestError extends Error {
  constructor(public readonly status: ProviderStatus) { super(status.message); }
}

export async function requestCompletion(body: Record<string, unknown>, signal: AbortSignal) {
  const config = providerConfig();
  const payload: Record<string, unknown> = { ...body, model: config.model, stream: true };
  if (/^(?:openai\/)?(?:gpt-5|o[134](?:-|$))/.test(config.model) && typeof payload.max_tokens === 'number') {
    payload.max_completion_tokens = payload.max_tokens;
    delete payload.max_tokens;
  }
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(payload),
    signal, redirect: 'error', cache: 'no-store',
  });
  if (!response.ok) {
    // Never propagate a raw provider body: it can contain credentials or upstream URLs.
    const error = classifyProvider(response.status, response.headers.get('content-type') || '', (await response.text()).slice(0,10000));
    throw new ProviderRequestError(error);
  }
  return readCompletion(response);
}

/** One small, real tool-call round-trip per runtime/configuration; no Liara action. */
export function probeProvider(retry=false) {
  const fingerprint = createHash('sha256').update(JSON.stringify([
    process.env.LLM_BASE_URL, process.env.LLM_MODEL, process.env.LLM_API_KEY,
  ])).digest('hex');
  if (runtime.copilotProviderV2?.fingerprint === fingerprint && Date.now()<(runtime.copilotProviderV2.expires??Infinity) && (!retry||Date.now()-(runtime.copilotProviderV2.checked||0)<30000)) return runtime.copilotProviderV2.result;
  const result = (async (): Promise<ProviderStatus> => {
    const provider = providerName();
    if (!process.env.LLM_BASE_URL || !process.env.LLM_API_KEY || !process.env.LLM_MODEL) {
      return { state: 'missing', provider, message: 'پیکربندی مدل در runtime کامل نیست.' };
    }
    try {
      const signal = AbortSignal.timeout(35000);
      const tool = { type: 'function', function: {
        name: 'connection_check', description: 'Harmless connection capability check. No external action.',
        parameters: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } }, required: ['status'], additionalProperties: false },
      } };
      const messages = [{ role: 'user', content: 'Call connection_check with status ok. This is a harmless API compatibility test; do nothing else.' }];
      const first = await requestCompletion({ messages, tools: [tool], tool_choice: { type: 'function', function: { name: 'connection_check' } }, max_tokens: 512 }, signal);
      const calls = [...first.calls.values()];
      if (calls.length !== 1 || calls[0].function.name !== 'connection_check' || JSON.parse(calls[0].function.arguments).status !== 'ok') {
        return { state: 'unavailable', provider, message: `${provider} پاسخ داد، اما فراخوانی ابزار مورد نیاز همیار تأیید نشد. هیچ عملیات لیارا اجرا نشد.` };
      }
      const second = await requestCompletion({ messages: [
        ...messages,
        { role: 'assistant', content: first.content || null, tool_calls: calls },
        { role: 'tool', tool_call_id: calls[0].id, content: '{"status":"ok"}' },
        { role: 'user', content: 'The test is complete. Reply with OK only.' },
      ], max_tokens: 512 }, signal);
      if (!second.content.trim() || second.calls.size) throw Error('پاسخ پس از نتیجه ابزار معتبر نبود.');
      return { state: 'ready', provider, httpStatus: 200, message: `اتصال ${provider} تأیید شد؛ پاسخ streaming، فراخوانی ابزار و پاسخ پس از ابزار در runtime واقعی بررسی شدند.` };
    } catch (error) {
      if (error instanceof ProviderRequestError) return error.status;
      const message = error instanceof Error ? error.message : 'ارتباط شبکه با ارائه‌دهنده برقرار نشد.';
      // All expected upstream errors are already converted to fixed Persian text.
      if (message.includes('چالش مرورگر')) return { state: 'network_block', provider, httpStatus: 403, message };
      if (message.startsWith(provider + ':') || /پاسخ|ابزار|توکن BoxAPI|پیکربندی|نشانی ارائه‌دهنده/.test(message)) {
        return { state: 'unavailable', provider, message };
      }
      return { state: 'unavailable', provider, message: `${provider}: ارتباط یا آزمون پاسخ در مهلت تعیین‌شده کامل نشد؛ هیچ پاسخ ساختگی تولید نشده است.` };
    }
  })();
  runtime.copilotProviderV2 = { fingerprint, result, checked:Date.now(), expires:Infinity };
  void result.then(status=>{if(runtime.copilotProviderV2?.result===result)runtime.copilotProviderV2.expires=Date.now()+(status.state==='ready'?3600000:60000);});
  return result;
}
