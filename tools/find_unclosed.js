const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'app.js');
const s = fs.readFileSync(p, 'utf8');

function findUnclosed(chOpen, chClose) {
  const stack = [];
  const lines = s.split(/\r?\n/);
  let lineNo = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\n') lineNo++;
    if (ch === chOpen) {
      // compute line/col
      const before = s.slice(0, i);
      const ln = before.split(/\r?\n/).length;
      const col = i - before.lastIndexOf('\n');
      stack.push({index: i, line: ln, col: col});
    } else if (ch === chClose) {
      if (stack.length === 0) {
        // extra close
        return {extraClose: {index:i}};
      } else {
        stack.pop();
      }
    }
  }
  return {stack};
}

const b = findUnclosed('{','}');
const ppar = findUnclosed('(',')');
const bkt = findUnclosed('[',']');
console.log('BRACES:', b.stack.length ? `UNMATCHED open braces: ${b.stack.length}` : 'All matched');
if (b.stack.length) console.log('Last unmatched brace at line/col/index:', b.stack[b.stack.length-1]);
console.log('PARENS:', ppar.stack.length ? `UNMATCHED open parens: ${ppar.stack.length}` : 'All matched');
if (ppar.stack.length) console.log('Last unmatched paren at line/col/index:', ppar.stack[ppar.stack.length-1]);
console.log('BRACKETS:', bkt.stack.length ? `UNMATCHED open brackets: ${bkt.stack.length}` : 'All matched');
if (bkt.stack.length) console.log('Last unmatched bracket at line/col/index:', bkt.stack[bkt.stack.length-1]);

// Print context around the brace
if (b.stack.length) {
  const pos = b.stack[b.stack.length-1].index;
  const start = Math.max(0, pos-300);
  const end = Math.min(s.length, pos+300);
  const ctx = s.slice(start, end);
  console.log('\n--- Context around last unmatched brace ---\n');
  console.log(ctx);
}

if (ppar.stack.length) {
  const pos = ppar.stack[ppar.stack.length-1].index;
  const start = Math.max(0, pos-200);
  const end = Math.min(s.length, pos+200);
  const ctx = s.slice(start, end);
  console.log('\n--- Context around last unmatched paren ---\n');
  console.log(ctx);
}

