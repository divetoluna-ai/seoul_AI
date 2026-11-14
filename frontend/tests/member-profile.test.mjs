import test from 'node:test';
import assert from 'node:assert/strict';
import { profileComplete, profileInput } from '../src/member-profile.ts';
test('login onboarding requires both nickname and registered dog', () => {
  assert.equal(profileComplete(null),false);
  assert.equal(profileComplete({nickname:'보리네',petName:''}),false);
  assert.equal(profileComplete({nickname:'보리네',petName:'  '}),false);
  assert.equal(profileComplete({nickname:'보리네',petName:'보리'}),true);
});
test('shared profile submission trims fields and rejects incomplete pet registration', () => {
  assert.deepEqual(profileInput({nickname:'  보리네  ',petName:' 보리 '}),{nickname:'보리네',petName:'보리'});
  assert.throws(()=>profileInput({nickname:'가',petName:'보리'}),/닉네임/);
  assert.throws(()=>profileInput({nickname:'보리네',petName:' '}),/반려견/);
  assert.throws(()=>profileInput({nickname:'보리네',petName:'가'.repeat(21)}),/반려견/);
});
