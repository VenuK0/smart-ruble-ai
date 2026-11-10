import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const scope={};
runInNewContext(readFileSync("src/smartruble/web/antifraud-utils.js","utf8"),scope);
const {percent,barPositions,notes}=scope.SRAntifraud;

test("relative score bars reflect ordering, not risk probability",()=>{
 const bars=barPositions([{anomaly_score:.60},{anomaly_score:.55},{anomaly_score:.50}]);
 assert.deepEqual(Array.from(bars),[100,56,12]);
});
test("one score or identical scores produce neutral bar lengths",()=>{
 assert.deepEqual(Array.from(barPositions([])),[]);
 assert.deepEqual(Array.from(barPositions([{anomaly_score:.8}])),[60]);
 assert.deepEqual(Array.from(barPositions([{anomaly_score:.3},{anomaly_score:.3}])),[60,60]);
});
test("display percentages clamp and round accurately",()=>{
 assert.equal(percent(.21751),21.8);
 assert.equal(percent(.5),50);
 assert.equal(percent(0),0);
 assert.equal(percent(-.5),0);
 assert.equal(percent(5),100);
});
test("descriptive flags use observed feature thresholds",()=>{
 const lines=notes({night_share:.35,round_large_share:.4,largest_student_share:.65});
 assert.equal(lines.length,3);
 assert.ok(lines.some(x=>x.includes("ночные")));
 assert.ok(lines.some(x=>x.includes("круглые")));
 assert.ok(lines.some(x=>x.includes("концентрация")));
});
test("absence of notable flags does not imply innocence or fraud",()=>{
 const lines=notes({night_share:0,round_large_share:0,largest_student_share:.2});
 assert.equal(lines.length,1);
 assert.ok(lines[0].includes("не обнаружены"));
});

test("merchant comparison shows observed peer differences, never a fraud probability",()=>{
 const item={
   signals:{night_share:1,round_large_share:1,largest_student_share:.417,average_amount_rub:55000,transaction_count:24},
   comparison:{merchant_count:43,signals:{
     night_share:.12,round_large_share:.05,largest_student_share:.31,
     average_amount_rub:12000,transaction_count:19
   }}
 };
 const highlights=scope.SRAntifraud.comparisonHighlights(item);
 assert.ok(highlights.some(x=>x.includes("100%")&&x.includes("12%")));
 assert.ok(highlights.some(x=>x.includes("круглые суммы")||x.includes("Крупные круглые суммы")));
 assert.ok(!highlights.some(x=>x.includes("мошенничества")));
 assert.ok(scope.SRAntifraud.comparisonTeaser(item).includes("Ночные операции"));
});
test("missing or unexceptional peer data does not invent a causal reason",()=>{
 const data={signals:{night_share:0,round_large_share:0,largest_student_share:.2,average_amount_rub:2000,transaction_count:4}};
 assert.equal(scope.SRAntifraud.comparisonHighlights(data).length,0);
 assert.equal(scope.SRAntifraud.comparisonHighlights({...data,comparison:{merchant_count:0,signals:{}}}).length,0);
 const neutral={...data,comparison:{merchant_count:43,signals:{night_share:.1,round_large_share:.1,largest_student_share:.3,average_amount_rub:4000,transaction_count:12}}};
 assert.deepEqual(Array.from(scope.SRAntifraud.comparisonHighlights(neutral)),[]);
 assert.match(scope.SRAntifraud.comparisonTeaser(neutral),/сочетании признаков/);
});
