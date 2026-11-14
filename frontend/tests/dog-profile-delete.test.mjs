import test from 'node:test';
import assert from 'node:assert/strict';
import { accountApi, AccountRequestError } from '../src/dog-profiles.ts';
test('dog deletion uses the authenticated same-origin API and accepts an empty success response',async () => {
  const original = globalThis.fetch;
  try {
    let request;
    globalThis.fetch=async (url,options)=>{request={url,options};return new Response(null,{status:204});};
    assert.equal(await accountApi('/dogs/test-id','DELETE'),undefined);
    assert.equal(request.url,'/api/auth/dogs/test-id');
    assert.equal(request.options.method,'DELETE');
    assert.equal(request.options.credentials,'same-origin');
    assert.equal(request.options.headers['X-Auth-Client'],'web');
    assert.equal(request.options.body,undefined);
    globalThis.fetch=async()=>new Response(JSON.stringify({}),{status:401});
    await assert.rejects(accountApi('/dogs/test-id','DELETE'),e=>e instanceof AccountRequestError && e.status===401);
  } finally {globalThis.fetch=original;}
});
