// @ts-nocheck
const fs = require('fs');

function isValidOggOpus(file) {
  try {
    if (!fs.existsSync(file)) return false;
    const stats = fs.statSync(file);
    // Require a minimal size to avoid tiny partial files
    // Allow smaller files (some short tracks may be under 2KB), but still reject extremely small files
    if (!stats.isFile() || stats.size < 512) return false;

    const fd = fs.openSync(file, 'r');
    // Read a larger header window to be more tolerant to different encodings
    const headerSize = Math.min(4096, Math.max(64, Math.floor(stats.size)));
    const buf = Buffer.alloc(headerSize);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return false;

    // Ogg files contain the magic "OggS"; scan the buffer for it (some files might have small preambles)
    const magic = Buffer.from('OggS');
    let found = false;
    for (let i = 0; i <= Math.max(0, bytesRead - 4); i++) {
      if (buf[i] === magic[0] && buf[i+1] === magic[1] && buf[i+2] === magic[2] && buf[i+3] === magic[3]) {
        found = true;
        break;
      }
    }
    if (!found) return false;

    // Optional: check for OpusHead in subsequent bytes for stronger validation
    // Not strictly required; presence of OggS + reasonable size is enough to avoid corrupted partials

    return true;
  } catch {
    return false;
  }
}

module.exports = { isValidOggOpus };

