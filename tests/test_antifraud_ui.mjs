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
