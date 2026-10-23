import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOrigin, OriginError } from '../lib/copilot/origin';

function configured(value: string | undefined, run: () => void) {
  const old = process.env.TEABLE_APP_PUBLIC_ORIGIN;
  if (value === undefined) delete process.env.TEABLE_APP_PUBLIC_ORIGIN;
  else process.env.TEABLE_APP_PUBLIC_ORIGIN = value;
  try { run(); } finally {
    if (old === undefined) delete process.env.TEABLE_APP_PUBLIC_ORIGIN;
    else process.env.TEABLE_APP_PUBLIC_ORIGIN = old;
  }
}
function request(headers: Record<string,string>, path='/api/agent', url='http://0.0.0.0:3000') {
  return new Request(url + path, { method:'POST', headers, body:'{"text":"ببین چیزی روی لیارا دارم"}' });
}
const publicOrigin='https://preview-fixture.sandbox.teable.ai';
const invalid=(error:unknown)=>error instanceof OriginError && error.status===403;

test('preview POSTs accept configured public origin despite internal Host for every guarded route',()=>{
  configured(publicOrigin,()=>{
    for(const path of ['/api/agent','/api/liara','/api/sources','/api/copilot']) {
      const req=request({origin:publicOrigin,host:'0.0.0.0:3000','sec-fetch-site':'same-origin'},path);
      // This reproduces the previous failure, before applying the proxy-aware check.
      assert.notEqual(new URL(req.headers.get('origin')!).host,req.headers.get('host'));
      assert.doesNotThrow(()=>checkOrigin(req));
      assert.equal(req.bodyUsed,false);
    }
  });
});
test('configured origin takes priority; forged Host and forwarded headers cannot allow another site',()=>{
  configured(publicOrigin,()=>{
    assert.throws(()=>checkOrigin(request({origin:'https://evil.example',host:'evil.example','x-forwarded-host':'evil.example','x-forwarded-proto':'https'})),invalid);
    assert.throws(()=>checkOrigin(request({origin:'https://another-preview.sandbox.teable.ai',host:'0.0.0.0:3000','sec-fetch-site':'same-site'})),invalid);
    assert.doesNotThrow(()=>checkOrigin(request({origin:publicOrigin,host:'wrong.internal','x-forwarded-host':'wrong.example'})));
  });
});
test('trusted ingress forwarding is used when platform public-origin configuration is absent',()=>{
  configured(undefined,()=>{
    assert.doesNotThrow(()=>checkOrigin(request({origin:publicOrigin,host:'0.0.0.0:3000','x-forwarded-host':'preview-fixture.sandbox.teable.ai, internal.proxy','x-forwarded-proto':'https, http'})));
    assert.throws(()=>checkOrigin(request({origin:'https://evil.example',host:'0.0.0.0:3000','x-forwarded-host':'preview-fixture.sandbox.teable.ai','x-forwarded-proto':'https'})),invalid);
  });
});
test('origin matching includes protocol and port, normalizes default ports',()=>{
  configured(publicOrigin,()=>{
    assert.throws(()=>checkOrigin(request({origin:'http://preview-fixture.sandbox.teable.ai'})),invalid);
    assert.throws(()=>checkOrigin(request({origin:publicOrigin+':444'})),invalid);
    assert.doesNotThrow(()=>checkOrigin(request({origin:'https://PREVIEW-FIXTURE.sandbox.teable.ai:443'})));
  });
});
test('malformed, opaque and credential-bearing origins fail closed',()=>{
  configured(publicOrigin,()=>{
    for(const origin of ['', 'null', 'not a URL', publicOrigin+'/path', publicOrigin+'?x=1',publicOrigin+'#x','https://user@preview-fixture.sandbox.teable.ai','file:///tmp','https://ok.example, https://evil.example']) {
      assert.throws(()=>checkOrigin(request({origin})),invalid,origin);
    }
  });
});
test('cross-site fetch metadata cannot bypass validation with a missing or matching Origin',()=>{
  configured(publicOrigin,()=>{
    assert.throws(()=>checkOrigin(request({'sec-fetch-site':'cross-site'})),invalid);
    assert.throws(()=>checkOrigin(request({origin:publicOrigin,'sec-fetch-site':'cross-site'})),invalid);
    // Non-browser clients without Origin still pass this guard; route authentication remains mandatory.
    assert.doesNotThrow(()=>checkOrigin(request({host:'0.0.0.0:3000'})));
  });
});
test('local development and direct public hosts follow the platform origin contract',()=>{
  configured(undefined,()=>{
    assert.doesNotThrow(()=>checkOrigin(request({origin:'http://localhost:3000',host:'localhost:3000'},'/api/agent','http://localhost:3000')));
    assert.throws(()=>checkOrigin(request({origin:'http://localhost:4000',host:'localhost:3000'})),invalid);
    assert.doesNotThrow(()=>checkOrigin(request({origin:'https://copilot.example',host:'copilot.example'})));
  });
});
