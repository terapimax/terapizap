const fs = require('fs');
try {
    const logPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\9119363d-bdde-44ee-8446-350bf54608f7\\.system_generated\\logs\\overview.txt';
    const log = fs.readFileSync(logPath, 'utf8');

    const lines = log.split('\n');
    let capturing = false;
    let recoveredAppJs = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.includes('Showing lines 150 to 3658')) {
            capturing = true;
            console.log('Found capture start near line ' + i);
            continue;
        }
        
        if (capturing) {
            const match = line.match(/^(\d+):\s(.*)$/);
            if (match) {
                recoveredAppJs.push(match[2]); // push the code part only
                if (match[1] === '3658') {
                    console.log('Finished capturing at line ' + match[1]);
                    break;
                }
            } else if (line.includes('The above content does NOT show')) {
                 break;
            } else if (recoveredAppJs.length > 0) {
                // possibly multi-line match or just noise
            }
        }
    }
    
    if (recoveredAppJs.length > 0) {
        fs.writeFileSync('recovered.js', recoveredAppJs.join('\n'));
        console.log('Recovered ' + recoveredAppJs.length + ' lines!');
    } else {
        console.log('Could not find the content in the logs.');
    }
} catch (e) {
    console.error(e);
}
