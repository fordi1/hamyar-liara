import test from 'node:test';
import assert from 'node:assert/strict';
import { readCompletion } from '../lib/copilot/completion-stream';
import { probeProvider, providerConfig, classifyProvider } from '../lib/copilot/provider';

function stream(events: unknown[], done=true) {
  const text=events.map(event=>'data: '+JSON.stringify(event)+'\r\n\r\n').join('')+(done?'data: [DONE]\n\n':'');
  const bytes=new TextEncoder().encode(text);
  return new Response(new ReadableStream({start(controller){
    for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));
    controller.close();
  }}),{headers:{'Content-Type':'text/event-stream; charset=utf-8'}});
}
const toolEvents=[
  {choices:[{delta:{tool_calls:[{index:0,id:'test-call',type:'function',function:{name:'connection_check',arguments:'{"status":'}}]}}]},
  {choices:[{delta:{tool_calls:[{index:0,function:{arguments:'"ok"}'}}]},finish_reason:'tool_calls'}]},
];
test('SSE parser preserves Persian UTF-8 and fragmented tool arguments',async()=>{
  const result=await readCompletion(stream([{choices:[{delta:{content:'سلام، بررسی انجام شد.'}}]},...toolEvents]));
  assert.equal(result.content,'سلام، بررسی انجام شد.');
  assert.equal(result.calls.get(0)?.function.arguments,'{"status":"ok"}');
});
test('incomplete, empty and HTML streams cannot imply success or run tools',async()=>{
  await assert.rejects(()=>readCompletion(stream([{choices:[{delta:{tool_calls:[{index:0,id:'x',function:{name:'restart',arguments:'{}'}}]}}]}],false)));
  await assert.rejects(()=>readCompletion(stream([])));
  await assert.rejects(()=>readCompletion(new Response('<html>challenge</html>',{headers:{'Content-Type':'text/html'}})));
  await assert.rejects(()=>readCompletion(stream([{choices:[{delta:{content:'unfinished'},finish_reason:'length'}]}])));
});
test('provider errors stay Persian, provider-specific, and do not echo raw bodies',()=>{
  const blocked=classifyProvider(403,'text/html','Just a moment: sensitive-upstream-value','BoxAPI');
  assert.equal(blocked.state,'network_block');
  assert(blocked.message.includes('BoxAPI'));
  assert(!blocked.message.includes('CodeCraft'));
  assert(!blocked.message.includes('sensitive-upstream-value'));
  const denied=classifyProvider(403,'application/json','{"error":{"message":"This API key is not allowed to use the requested model."}}','BoxAPI');
  assert.equal(denied.state,'unavailable');
  assert(denied.message.includes('مدل تنظیم‌شده'));
  assert(!denied.message.includes('کلید نامعتبر'));
  assert(classifyProvider(402,'application/json','private-data','BoxAPI').message.includes('اعتبار'));
});
test('BoxAPI probe uses actual completion contract, caches only matching configuration',async()=>{
  const originalFetch=globalThis.fetch;
  const originals=Object.fromEntries(['LLM_API_KEY','LLM_MODEL','LLM_BASE_URL'].map(k=>[k,process.env[k]]));
  const runtime=globalThis as any;
  delete runtime.copilotProviderV2;
  process.env.LLM_API_KEY='box-ai-test-fixture';
  process.env.LLM_MODEL='test-model';
  process.env.LLM_BASE_URL='https://ai.boxapi.ir/ai/v1';
  let count=0;
  globalThis.fetch=async(url,init)=>{
    count++;
    assert.equal(String(url),'https://ai.boxapi.ir/ai/v1/chat/completions');
    assert.equal(init?.method,'POST');
    assert.equal(init?.redirect,'error');
    const body=JSON.parse(String(init?.body));
    assert.equal(body.stream,true);
    if (body.model === 'gpt-5.4-mini') {
      assert.equal(typeof body.max_completion_tokens, 'number');
      assert(!Object.hasOwn(body, 'max_tokens'));
    } else assert.equal(typeof body.max_tokens, 'number');
    assert(!JSON.stringify(body.messages).includes(process.env.LLM_API_KEY!));
    if(body.tools)return stream(toolEvents);
    assert.equal(body.messages[2].role,'tool');
    assert.equal(body.messages[2].tool_call_id,'test-call');
    return stream([{choices:[{delta:{content:'OK'},finish_reason:'stop'}]}]);
  };
  try {
    const first=await probeProvider();
    assert.equal(first.state,'ready');
    assert.equal(first.provider,'BoxAPI');
    await probeProvider(); assert.equal(count,2);
    process.env.LLM_MODEL='test-model-2';
    await probeProvider(); assert.equal(count,4);
    process.env.LLM_MODEL='gpt-5.4-mini';
    await probeProvider(); assert.equal(count,6);
    runtime.copilotProviderV2.result=Promise.resolve({state:'unavailable',message:'temporary outage'});
    runtime.copilotProviderV2.expires=Date.now()-1;
    assert.equal((await probeProvider()).state,'ready');assert.equal(count,8);
    await probeProvider(true);assert.equal(count,8); // Explicit retry is rate-limited for 30 seconds.
    process.env.LLM_BASE_URL='https://codecraftapi.com/v1';
    assert.throws(()=>providerConfig());
    const blocked=await probeProvider();assert.equal(blocked.state,'unavailable');assert.equal(count,8);
  } finally {
    globalThis.fetch=originalFetch;
    for(const [k,v] of Object.entries(originals)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
    delete runtime.copilotProviderV2;
  }
});
