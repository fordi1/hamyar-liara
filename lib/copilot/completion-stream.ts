export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

/** Parses bounded OpenAI-compatible SSE without executing any tool. */
export async function readCompletion(response: Response) {
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw Error('ارائه‌دهنده پاسخ streaming معتبر برنگرداند.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, ToolCall>();
  let buffer = '', content = '', bytes = 0, ended = false, hasChoice = false;
  function line(value: string) {
    if (!value.startsWith('data:')) return;
    const raw = value.slice(5).trim();
    if (!raw) return;
    if (raw === '[DONE]') { ended = true; return; }
    const event = JSON.parse(raw);
    if (event.error) throw Error('ارائه‌دهنده هنگام تولید پاسخ خطا داد.');
    const choice = event.choices?.[0];
    if (!choice) return;
    hasChoice = true;
    if (choice.finish_reason === 'length') throw Error('پاسخ مدل به سقف طول رسید؛ درخواست را کوتاه‌تر کنید.');
    if (choice.finish_reason === 'content_filter') throw Error('ارائه‌دهنده تولید پاسخ را متوقف کرد.');
    if (choice.finish_reason) ended = true;
    const delta = choice.delta;
    if (!delta) return;
    if (typeof delta.content === 'string') content += delta.content;
    for (const part of delta.tool_calls || []) {
      if (!Number.isInteger(part.index) || part.index < 0 || part.index > 7) throw Error('شناسه بخش ابزار نامعتبر است.');
      const call = calls.get(part.index) || { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
      if (part.id) call.id = part.id;
      if (part.function?.name) call.function.name += part.function.name;
      if (part.function?.arguments) call.function.arguments += part.function.arguments;
      calls.set(part.index, call);
    }
  }
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 1024 * 1024) throw Error('پاسخ مدل بیش از حد مجاز است.');
      buffer += decoder.decode(next.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const value of lines) line(value);
    }
    buffer += decoder.decode();
    if (buffer.trim()) line(buffer);
    if (!ended || !hasChoice) throw Error('پاسخ streaming ناقص است؛ هیچ ابزاری اجرا نشد.');
    for (const call of calls.values()) {
      if (!call.id || !call.function.name) throw Error('فراخوانی ابزار ناقص است.');
      JSON.parse(call.function.arguments);
    }
    if (!content.trim() && !calls.size) throw Error('ارائه‌دهنده پاسخ خالی برگرداند.');
    return { content, calls };
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
