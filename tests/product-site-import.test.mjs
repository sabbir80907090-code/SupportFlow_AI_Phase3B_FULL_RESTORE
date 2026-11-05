import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/product-site-import.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const {extractSiteCandidates,parseSitemapLocations,rankSitemapCandidates}=new Function('publicUrl','fetchPublicUrl','parseProductPage',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return {extractSiteCandidates,parseSitemapLocations,rankSitemapCandidates}')(
 value=>new URL(value),async()=>({body:Buffer.from(''),url:'https://shop.example/'}),()=>[]
);
test('discovers product and category URLs but rejects external and transactional links',()=>{
 const html='<a href="/products/phone">Phone</a><a href="/collections/sale">Sale</a><a href="/cart">Cart</a><a href="https://evil.example/products/x">External</a><script><a href="/products/hidden">hidden</a></script>';
 const rows=extractSiteCandidates(html,'https://shop.example/');
 assert.deepEqual(rows.map(x=>x.kind),['product','category']);
 assert.ok(rows.every(x=>new URL(x.url).origin==='https://shop.example'));
});
test('detects pagination and rejects non-HTTPS or cross-origin URLs',()=>{
 const rows=extractSiteCandidates('<a rel="next" href="?page=2">Next</a><a href="http://shop.example/products/x">Unsafe</a>','https://shop.example/category');
 assert.equal(rows[0].kind,'pagination');assert.equal(rows.length,1);
});
test('sitemap parsing resolves same-origin entries and ranks product URLs',()=>{
 const xml='<urlset><url><loc>https://shop.example/products/a</loc></url><url><loc>https://evil.example/products/b</loc></url><url><loc>https://shop.example/collections/c</loc></url></urlset>';
 const urls=parseSitemapLocations(xml,'https://shop.example/sitemap.xml');
 assert.equal(urls.length,2);assert.equal(rankSitemapCandidates(urls)[0].kind,'product');
});
