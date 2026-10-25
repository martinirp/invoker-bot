@'
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'utils', 'ytDlp.ts');
let c = fs.readFileSync(file, 'utf8');
const arrStart = c.indexOf('const ytArgs = [');
if (arrStart === -1) process.exit(0);
let depth = 0;
let i = arrStart;
let endArr = -1;
for (; i < c.length; i++) {
  if (c[i] === '[') depth++;
  else if (c[i] === ']') { depth--; if (depth === 0) { endArr = i+1; break; } }
}
if (endArr === -1) process.exit(0);
const repl =   const ytArgs = [
    '--js-runtimes', 'node',
    ...getCookieArgs(),
    ...getExtractorArgs(options.playerClient),
    '-f', 'ba[acodec=opus]/ba[ext=m4a]/bestaudio/best',
    '--no-playlist',
    '--no-warnings',
    '--no-cache-dir',
    '--buffer-size', '128K',
    '--socket-timeout', '30',
    '--retries', '3',
    '-o', '-',
    url
  ];;
c = c.slice(0, arrStart) + repl + c.slice(endArr);
fs.writeFileSync(file, c);
console.log('ok');
'@
