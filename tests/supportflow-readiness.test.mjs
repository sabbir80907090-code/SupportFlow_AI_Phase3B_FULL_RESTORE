import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../app/api/internal/supportflow-readiness/route.ts',import.meta.url),'utf8');

test('readiness counts claimed outbox items as in-flight',()=>{
 assert.match(src,/processing:count\(outbox\.data,'claimed'\)/);
 assert.doesNotMatch(src,/processing:count\(outbox\.data,'processing'\)/);
});
test('readiness surfaces delivery-uncertain queue without resending',()=>{
 assert.match(src,/needsReview:count\(outbox\.data,'needs_review'\)/);
 assert.match(src,/if\(!authorized\(req\)\)/);
});
