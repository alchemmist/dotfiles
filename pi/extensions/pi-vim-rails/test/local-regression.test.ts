import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySelectionBackground } from '../visual-render.ts';
import { normalizeVimLayoutKey } from '../input-keys.ts';
import { ModalEditor } from '../index.ts';
const sgr = /\x1b\[[0-9;]*m/g;
const markers = /\x1b_[^\x07]*\x07/g;
function editor(text: string) {
 const e = new ModalEditor({terminal:{rows:30}, requestRender(){}} as any, {borderColor:(s:string)=>s} as any, {matches:()=>false} as any);
 e.setText(text); e.focused=true; e.handleInput('\x1b'); e.render(40); return e;
}
test('all Pi cursor markers survive every possible selection boundary',()=>{
 for(const text of ['abcdef','а👩‍💻е́中文z']) {
 const input='ab\x1b_pi:c\x07\x1b_pi:fc\x07'+text+'\x1b_pi:/fc\x07 rest';
 for(let start=0;start<15;start++) for(let end=start+1;end<16;end++) {
 const output=applySelectionBackground(input,start,end);
 assert.equal(output.replace(sgr,''),input);
 assert.deepEqual(output.match(markers),input.match(markers));
 }
 }
});
test('selection does not repaint following padding',()=>{
 assert.equal(applySelectionBackground('abcdef',1,3),'a\x1b[100mb\x1b[49m\x1b[100mc\x1b[49mdef');
});
test('real editor: Russian and English commands produce identical state',()=>{
 for(const [english,russian] of [['gg0vll','пп0мдд'],['gg0dw','пп0вц'],['gg0yyjp','пп0нно з'.replaceAll(' ','')],['gg0Vj','пп0Мо'],['gg0ciw','пп0сшц']]) {
 const a=editor('one two three\nfour five\nsix'); const b=editor('one two three\nfour five\nsix');
 for(const c of english)a.handleInput(c);
 for(const c of russian)b.handleInput(c);
 assert.equal(b.getText(),a.getText(),russian); assert.deepEqual(b.getCursor(),a.getCursor(),russian);
 }
});
test('real editor render preserves cursor markers, widths, wrapped/reversed selections',()=>{
 for(const text of ['asdf asdf asdf asdf\nasdf asdf','repeat '.repeat(30),'а👩‍💻е́中文\nsecond']) {
 const e=editor(text);
 for(const c of 'gg0vllllll')e.handleInput(c);
 for(const width of [8,20,80]) {
 const lines=e.render(width); const joined=lines.join('\n');
 assert.ok(joined.includes('\x1b[100m'));
 assert.equal((joined.match(/\x1b_pi:c\x07/g)||[]).length,1);
 assert.equal((joined.match(/\x1b_pi:fc\x07/g)||[]).length,1);
 assert.equal((joined.match(/\x1b_pi:\/fc\x07/g)||[]).length,1);
 }
 }
});
test('Insert and character targets keep Cyrillic literal',()=>{
 const e=editor('абвг'); for(const c of 'gg0fв')e.handleInput(c); assert.equal(e.getCursor().col,2);
 e.handleInput('i');e.handleInput('привет'); assert.ok(e.getText().includes('привет'));
});
test('shifted Russian punctuation maps to shifted QWERTY',()=>{
 for(const [ru,en] of [['Ж',':'],['Б','<'],['Ю','>'],['Э','"'],['Х','{']]) assert.equal(normalizeVimLayoutKey(ru),en);
});
test('reversed same-line selection paints only the inclusive range',()=>{
 const e=editor('abcdef');for(const c of 'gg0llvhh')e.handleInput(c);
 const row=e.render(40)[1];assert.equal((row.match(/100m/g)||[]).length,3);
});
test('rail truncation keeps all Pi cursor controls intact',()=>{
 const e=editor('asdf '.repeat(12));
 (e as any).inputRail={glyph:'┃',colorize:(s:string)=>s,hideModeLabel:true};
 for(const c of 'gg0vllll')e.handleInput(c);
 for(const width of [10,40,80]) {
 const output=e.render(width).join('\n');
 assert.equal((output.match(/\x1b_pi:c\x07/g)||[]).length,1);
 assert.equal((output.match(/\x1b_pi:fc\x07/g)||[]).length,1);
 assert.equal((output.match(/\x1b_pi:\/fc\x07/g)||[]).length,1);
 }
});
