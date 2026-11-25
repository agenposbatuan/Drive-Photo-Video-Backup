import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Function to calculate CRC32 for PNG chunks
function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
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

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // Color type 6 = RGBA
  ihdr[10] = 0; // Compression method
  ihdr[11] = 0; // Filter method
  ihdr[12] = 0; // Interlace method

  // Scanlines with filter byte 0
  const rowBytes = width * 4;
  const filtered = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (rowBytes + 1)] = 0; // Filter 0 (None)
    const srcStart = y * rowBytes;
    rgbaBuffer.copy(filtered, y * (rowBytes + 1) + 1, srcStart, srcStart + rowBytes);
  }

  const idatData = zlib.deflateSync(filtered, { level: 9 });
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate PWA Icon with Google Drive Backup aesthetics
function drawIcon(size, isMaskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const radius = isMaskable ? size * 0.48 : size * 0.45;
  const cornerRadius = isMaskable ? 0 : size * 0.22; // rounded square for standard

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (x - center) / (size / 2);
      const ny = (y - center) / (size / 2);

      // Determine background bounds
      let inBackground = false;
      if (isMaskable) {
        // Full bleed for maskable
        inBackground = true;
      } else {
        // Smooth rounded squircle for standard
        const dx = Math.max(Math.abs(x - center) - (center - cornerRadius), 0);
        const dy = Math.max(Math.abs(y - center) - (center - cornerRadius), 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        inBackground = dist <= cornerRadius;
      }

      if (!inBackground) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0; // transparent
        continue;
      }

      // Background Gradient: Rich Vibrant Royal Blue to Sky Cyan (#1e40af to #2563eb to #0284c7)
      const gradT = (y / size) * 0.7 + (x / size) * 0.3;
      let bgR = Math.round(30 + gradT * 7);
      let bgG = Math.round(64 + gradT * 60);
      let bgB = Math.round(175 + gradT * 60);

      // Add subtle lighting
      const lightDist = Math.sqrt(Math.pow(nx + 0.3, 2) + Math.pow(ny + 0.4, 2));
      const highlight = Math.max(0, 1 - lightDist * 0.8) * 35;
      bgR = Math.min(255, Math.round(bgR + highlight));
      bgG = Math.min(255, Math.round(bgG + highlight));
      bgB = Math.min(255, Math.round(bgB + highlight));

      // Draw Icon Elements:
      // A white camera / gallery photo card with a cloud & upward arrow badge
      // Scale coordinates relative to icon center
      // Camera / photo frame bounds:
      const fw = size * 0.52;
      const fh = size * 0.46;
      const fx = center - fw / 2;
      const fy = center - fh / 2 + size * 0.02;
      const fRadius = size * 0.08;

      const fdx = Math.max(Math.abs(x - center) - (fw / 2 - fRadius), 0);
      const fdy = Math.max(Math.abs(y - (fy + fh / 2)) - (fh / 2 - fRadius), 0);
      const inFrame = Math.sqrt(fdx * fdx + fdy * fdy) <= fRadius;

      // Inside photo frame or outer glow
      if (inFrame) {
        // Check frame border vs inner content
        const innerMargin = size * 0.038;
        const ifdx = Math.max(Math.abs(x - center) - (fw / 2 - innerMargin - (fRadius - innerMargin / 2)), 0);
        const ifdy = Math.max(Math.abs(y - (fy + fh / 2)) - (fh / 2 - innerMargin - (fRadius - innerMargin / 2)), 0);
        const inInner = Math.sqrt(ifdx * ifdx + ifdy * ifdy) <= (fRadius - innerMargin / 2);

        if (!inInner) {
          // White Frame Border
          buf[idx] = 255;
          buf[idx + 1] = 255;
          buf[idx + 2] = 255;
          buf[idx + 3] = 255;
        } else {
          // Inner Photo Art: Dark navy canvas with mountain, sun, and cloud backup
          const py = (y - (fy + innerMargin)) / (fh - innerMargin * 2);
          const px = (x - (fx + innerMargin)) / (fw - innerMargin * 2);

          // Dark modern gradient inside photo
          let pr = Math.round(15 + py * 20);
          let pg = Math.round(23 + py * 30);
          let pb = Math.round(42 + py * 45);

          // Sun / Lens in upper right
          const sunDist = Math.sqrt(Math.pow(px - 0.75, 2) + Math.pow(py - 0.32, 2));
          if (sunDist < 0.12) {
            // Bright amber / gold sun
            pr = 251;
            pg = 191;
            pb = 36;
          }

          // Mountain peak 1 (left)
          // equation: py > 0.85 - px * 0.7
          const m1 = py > (0.82 - (px - 0.1) * 0.8) && px < 0.6;
          if (m1) {
            pr = 59;
            pg = 130;
            pb = 246;
          }

          // Mountain peak 2 (right)
          const m2 = py > (0.65 + (px - 0.55) * 0.9) || (py > (0.65 - (px - 0.55) * 1.1) && px >= 0.35);
          if (m2 && py > 0.6) {
            pr = 96;
            pg = 165;
            pb = 250;
          }

          // Drive Cloud / Backup badge at center bottom
          const cpx = px - 0.5;
          const cpy = py - 0.7;
          const inCloud = Math.sqrt(cpx * cpx + cpy * cpy * 1.5) < 0.22;
          if (inCloud) {
            pr = 255;
            pg = 255;
            pb = 255;
          }

          // Arrow pointing up in cloud
          const isArrowStem = Math.abs(cpx) < 0.035 && cpy >= -0.05 && cpy <= 0.08;
          const isArrowHead = cpy < -0.02 && cpy >= -0.12 && Math.abs(cpx) <= (-cpy - 0.02) * 1.2;
          if (isArrowStem || isArrowHead) {
            pr = 37;
            pg = 99;
            pb = 235; // Blue-600 arrow
          }

          buf[idx] = pr;
          buf[idx + 1] = pg;
          buf[idx + 2] = pb;
          buf[idx + 3] = 255;
        }
      } else {
        // Background
        buf[idx] = bgR;
        buf[idx + 1] = bgG;
        buf[idx + 2] = bgB;
        buf[idx + 3] = 255;
      }
    }
  }

  return encodeRGBAtoPNG(size, size, buf);
}

// Generate SVG icon
function generateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="50%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <linearGradient id="innerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Background Squircle -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>

  <!-- Photo Card Frame -->
  <g filter="url(#shadow)">
    <rect x="100" y="116" width="312" height="280" rx="36" fill="#ffffff"/>
    
    <!-- Inner Photo Canvas -->
    <rect x="120" y="136" width="272" height="240" rx="24" fill="url(#innerGrad)"/>
    
    <!-- Sun -->
    <circle cx="316" cy="190" r="24" fill="#fbbf24"/>
    
    <!-- Mountain Background -->
    <path d="M120 376 L210 270 L280 340 L340 280 L392 340 L392 376 Z" fill="#3b82f6" opacity="0.8"/>
    <path d="M160 376 L250 290 L320 360 L392 300 L392 376 Z" fill="#60a5fa" opacity="0.9"/>
  </g>

  <!-- Cloud Backup Badge -->
  <g filter="url(#shadow)" transform="translate(256, 350)">
    <path d="M-60 10 A24 24 0 0 1 -40 -25 A38 38 0 0 1 20 -30 A30 30 0 0 1 55 -5 A24 24 0 0 1 50 20 L-50 20 A20 20 0 0 1 -60 10 Z" fill="#ffffff"/>
    <!-- Upload Arrow -->
    <path d="M0 -18 L18 0 L7 0 L7 12 L-7 12 L-7 0 L-18 0 Z" fill="#2563eb"/>
  </g>
</svg>`;
}

const outDir = path.resolve('public', 'icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating 192x192 icon...');
const icon192 = drawIcon(192, false);
fs.writeFileSync(path.join(outDir, 'icon-192.png'), icon192);

console.log('Generating 512x512 icon...');
const icon512 = drawIcon(512, false);
fs.writeFileSync(path.join(outDir, 'icon-512.png'), icon512);

console.log('Generating 512x512 maskable icon...');
const iconMaskable = drawIcon(512, true);
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), iconMaskable);

console.log('Generating SVG icon...');
fs.writeFileSync(path.join(outDir, 'icon.svg'), generateSvg(), 'utf8');

console.log('All icons generated successfully!');
