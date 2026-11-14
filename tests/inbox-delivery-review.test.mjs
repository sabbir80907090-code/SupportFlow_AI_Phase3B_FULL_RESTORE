import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../components/unified-inbox.tsx',import.meta.url),'utf8');

test('delivery review is workspace-scoped and status-only',()=>{
 assert.match(src,/\.from\('support_outbox'\)\.select\('conversation_id',\{count:'exact'\}\)/);
 assert.match(src,/\.eq\('business_id',businessId\)\.eq\('status','needs_review'\)/);
 assert.doesNotMatch(src,/\.from\('support_outbox'\)\.select\('\*'/);
});
test('agent roles do not query or see the delivery review summary',()=>{
 assert.match(src,/if\(role==='agent'\)\{setDeliveryReviewIds/);
 assert.match(src,/role!=='agent'&&deliveryReviewCount>0/);
});
test('delivery review is informational and never triggers resend',()=>{
 assert.match(src,/Check the provider before sending again\./);
 assert.match(src,/setDeliveryReviewOnly\(v=>!v\)/);
 assert.doesNotMatch(src,/rpc\('retry_support_outbox'/);
});
