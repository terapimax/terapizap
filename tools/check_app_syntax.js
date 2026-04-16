const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'app.js');
const s = fs.readFileSync(p, 'utf8');
const counts = {
  singleQuotes: (s.match(/'/g) || []).length,
  doubleQuotes: (s.match(/"/g) || []).length,
  backticks: (s.match(/`/g) || []).length,
  openBrace: (s.match(/{/g) || []).length,
  closeBrace: (s.match(/}/g) || []).length,
  openParen: (s.match(/\(/g) || []).length,
  closeParen: (s.match(/\)/g) || []).length,
  openBracket: (s.match(/\[/g) || []).length,
  closeBracket: (s.match(/\]/g) || []).length
};
console.log('COUNTS:', counts);
console.log('\n--- Last 600 chars of app.js ---\n');
console.log(s.slice(-600));

// Find last unclosed backtick position if odd number
if (counts.backticks % 2 === 1) {
  console.log('\nBackticks count is odd — likely an unclosed template literal. Searching for last backtick index...');
  console.log('Last backtick index:', s.lastIndexOf('`'));
}

// Try to locate any unterminated comment (/* without */)
const openCommentIdx = s.indexOf('/*');
const closeCommentIdx = s.indexOf('*/', openCommentIdx + 2);
if (openCommentIdx !== -1 && closeCommentIdx === -1) {
  console.log('\nFound an open block comment (/*) without a closing */ at index', openCommentIdx);
}

// Also attempt to detect if file ends inside a string started by \\" or \\'
function lastUnclosedQuote(ch) {
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ch && !escaped) {
      // flip occurrence
    }
    escaped = (s[i] === '\\' && !escaped);
  }
}

// Print file length
console.log('\nFile length (chars):', s.length);
