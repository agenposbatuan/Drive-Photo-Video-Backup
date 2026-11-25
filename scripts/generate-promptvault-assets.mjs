import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, body, crcBuf]);
}

function encodeRGBAtoPNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = width * 4;
  const filtered = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (rowBytes + 1)] = 0;
    const srcStart = y * rowBytes;
    rgbaBuffer.copy(filtered, y * (rowBytes + 1) + 1, srcStart, srcStart + rowBytes);
  }

  const idatData = zlib.deflateSync(filtered, { level: 9 });
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function drawPromptVaultIcon(size, isMaskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const cornerRadius = isMaskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (x - center) / (size / 2);
      const ny = (y - center) / (size / 2);

      let inBounds = false;
      if (isMaskable) {
        inBounds = true;
      } else {
        const dx = Math.max(Math.abs(x - center) - (center - cornerRadius), 0);
        const dy = Math.max(Math.abs(y - center) - (center - cornerRadius), 0);
        inBounds = Math.sqrt(dx * dx + dy * dy) <= cornerRadius;
      }

      if (!inBounds) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      // Background: Dark Obsidian Slate with Radial Glow (#090d16 to #0f172a to #1e1b4b)
      const distFromCenter = Math.sqrt(nx * nx + ny * ny);
      let bgR = Math.round(9 + (1 - Math.min(1, distFromCenter)) * 25);
      let bgG = Math.round(13 + (1 - Math.min(1, distFromCenter)) * 20);
      let bgB = Math.round(22 + (1 - Math.min(1, distFromCenter)) * 75);

      // Outer Shield / Vault Frame bounds
      const sw = size * 0.54;
      const sh = size * 0.60;
      const sx = Math.abs(x - center);
      const sy = y - (center - size * 0.04);

      // Shield math: top half is rect, bottom half is curved tip
      let inShield = false;
      let inShieldBorder = false;
      if (sy >= -sh * 0.45 && sy <= sh * 0.55 && sx <= sw * 0.5) {
        // Curve taper at bottom
        if (sy > 0) {
          const taper = (sy / (sh * 0.55));
          if (sx <= (sw * 0.5) * (1 - Math.pow(taper, 1.8))) {
            inShield = true;
          }
        } else {
          inShield = true;
        }
      }

      // Border check (thickness: size * 0.04)
      const borderThick = size * 0.038;
      let inInnerShield = false;
      if (inShield) {
        const isy = sy;
        const isx = sx;
        if (isy >= -sh * 0.45 + borderThick && isy <= sh * 0.55 - borderThick && isx <= sw * 0.5 - borderThick) {
          if (isy > 0) {
            const itaper = (isy / (sh * 0.55 - borderThick));
            if (isx <= (sw * 0.5 - borderThick) * (1 - Math.pow(Math.max(0, itaper), 1.8))) {
              inInnerShield = true;
            }
          } else {
            inInnerShield = true;
          }
        }
        inShieldBorder = !inInnerShield;
      }

      if (inShieldBorder) {
        // Neon Indigo / Cyan Border Glow
        const gradT = (y / size);
        buf[idx] = Math.round(99 + gradT * 50);   // #6366f1 to #06b6d4
        buf[idx + 1] = Math.round(102 + gradT * 80);
        buf[idx + 2] = 241;
        buf[idx + 3] = 255;
        continue;
      }

      if (inInnerShield) {
        // Inner Dark Plate
        let pr = 15;
        let pg = 23;
        let pb = 42;

        // Draw </> symbol inside shield
        // Center offset
        const cx = x - center;
        const cy = y - center + size * 0.02;

        // Slash '/' at center: line from (size*0.06, -size*0.16) to (-size*0.06, size*0.16)
        // distance to line segment
        const slashDist = Math.abs(cx * 0.9 + cy * 0.35);
        const inSlash = slashDist < size * 0.022 && Math.abs(cy) < size * 0.16;

        // Left angle '<':
        const lx = cx + size * 0.12;
        const inLeft1 = Math.abs((lx - cy) - 0) < size * 0.022 && cy <= 0 && cy >= -size * 0.12 && lx >= -size * 0.12;
        const inLeft2 = Math.abs((lx + cy) - 0) < size * 0.022 && cy > 0 && cy <= size * 0.12 && lx >= -size * 0.12;
        const inLeftAngle = inLeft1 || inLeft2;

        // Right angle '>':
        const rx = cx - size * 0.12;
        const inRight1 = Math.abs((rx + cy) - 0) < size * 0.022 && cy <= 0 && cy >= -size * 0.12 && rx <= size * 0.12;
        const inRight2 = Math.abs((rx - cy) - 0) < size * 0.022 && cy > 0 && cy <= size * 0.12 && rx <= size * 0.12;
        const inRightAngle = inRight1 || inRight2;

        if (inSlash) {
          // Vibrant Cyan #00f0ff
          pr = 6;
          pg = 182;
          pb = 212;
        } else if (inLeftAngle || inRightAngle) {
          // Electric Violet / Indigo #818cf8
          pr = 129;
          pg = 140;
          pb = 248;
        }

        buf[idx] = pr;
        buf[idx + 1] = pg;
        buf[idx + 2] = pb;
        buf[idx + 3] = 255;
        continue;
      }

      // Background pixel
      buf[idx] = bgR;
      buf[idx + 1] = bgG;
      buf[idx + 2] = bgB;
      buf[idx + 3] = 255;
    }
  }

  return encodeRGBAtoPNG(size, size, buf);
}

function generateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
    <linearGradient id="symbolGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f0ff"/>
      <stop offset="100%" stop-color="#818cf8"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#6366f1" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- Background Squircle -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>

  <!-- Shield Vault Frame -->
  <g filter="url(#glow)">
    <path d="M 256 80 L 390 125 C 390 280 340 375 256 425 C 172 375 122 280 122 125 Z" fill="#0f172a" stroke="url(#shieldGrad)" stroke-width="16" stroke-linejoin="round"/>
  </g>

  <!-- PromptVault </> Code Symbol -->
  <g filter="url(#glow)">
    <!-- Left Bracket < -->
    <path d="M 215 200 L 165 256 L 215 312" fill="none" stroke="#818cf8" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
    
    <!-- Slash / -->
    <path d="M 285 185 L 227 327" fill="none" stroke="#00f0ff" stroke-width="20" stroke-linecap="round"/>

    <!-- Right Bracket > -->
    <path d="M 297 200 L 347 256 L 297 312" fill="none" stroke="#818cf8" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const targetDir = 'D:/09. Antigravity/Backup/01. sevenprojectchannel/Prompt Shorthand Analizer V3/prompt-shorthand-analyzer-v2/public';
const iconsDir = path.join(targetDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log('Generating PWA icons for PromptVault...');
const icon192 = drawPromptVaultIcon(192, false);
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), icon192);

const icon512 = drawPromptVaultIcon(512, false);
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), icon512);

const iconMaskable512 = drawPromptVaultIcon(512, true);
fs.writeFileSync(path.join(iconsDir, 'icon-maskable-512.png'), iconMaskable512);

const svg = generateSvg();
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svg, 'utf8');
fs.writeFileSync(path.join(targetDir, 'favicon.svg'), svg, 'utf8');
fs.writeFileSync(path.join(targetDir, 'apple-touch-icon.png'), icon192);

// .nojekyll for GitHub Pages
fs.writeFileSync(path.join(targetDir, '.nojekyll'), '', 'utf8');

console.log('PWA icons and .nojekyll successfully created in public directory!');
