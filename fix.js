const fs = require('fs');

let lines = fs.readFileSync('app.js', 'utf8').split(/\r?\n/);

// We need to delete lines 1566 to 1574 (0-indexed: index 1565 to 1573)
lines.splice(1565, 1574 - 1566 + 1);

fs.writeFileSync('app.js', lines.join('\n'));
console.log('Fixed syntax error in app.js');
