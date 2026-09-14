/**
 * QR Code (versão 2–4, ECC M, byte mode) para etiqueta autenticada.
 * Sem dependência externa — o payload não é uma URL pública.
 */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number) {
  if (!a || !b) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenerator(ecLen: number) {
  let poly = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecLen: number) {
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const b of data) {
    const factor = b ^ res[0];
    res.shift();
    res.push(0);
    if (!factor) continue;
    for (let i = 0; i < gen.length - 1; i++) {
      res[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return res;
}

type VerSpec = { version: number; size: number; dataBytes: number; ecLen: number; align: number[] };

const SPECS: VerSpec[] = [
  { version: 2, size: 25, dataBytes: 22, ecLen: 16, align: [18] },
  { version: 3, size: 29, dataBytes: 34, ecLen: 22, align: [22] },
  { version: 4, size: 33, dataBytes: 48, ecLen: 26, align: [26] },
];

function bitsToBytes(bits: number[]) {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] ?? 0);
    bytes.push(v);
  }
  return bytes;
}

function encodeBytes(payload: string, spec: VerSpec) {
  const data = Array.from(Buffer.from(payload, "utf8"));
  if (data.length > spec.dataBytes - 2) return null;
  const bits: number[] = [];
  const push = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  push(0b0100, 4);
  push(data.length, 8);
  for (const b of data) push(b, 8);
  push(0, Math.min(4, spec.dataBytes * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const bytes = bitsToBytes(bits);
  const pad = [0xec, 0x11];
  let p = 0;
  while (bytes.length < spec.dataBytes) bytes.push(pad[p++ % 2]);
  return bytes.concat(rsEncode(bytes, spec.ecLen));
}

function placeFinder(mod: number[][], x: number, y: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = y + r;
      const cc = x + c;
      if (rr < 0 || cc < 0 || rr >= mod.length || cc >= mod.length) continue;
      const on =
        r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      mod[rr][cc] = on ? 1 : 0;
    }
  }
}

function placeAlign(mod: number[][], cx: number, cy: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      mod[cy + r][cx + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1 ? 1 : 0;
    }
  }
}

function reserved(size: number, spec: VerSpec) {
  const r = Array.from({ length: size }, () => Array(size).fill(false));
  const mark = (x: number, y: number, w: number, h: number) => {
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) if (r[y + i]?.[x + j] !== undefined) r[y + i][x + j] = true;
  };
  mark(0, 0, 9, 9);
  mark(size - 8, 0, 8, 9);
  mark(0, size - 8, 9, 8);
  mark(6, 0, 1, size);
  mark(0, 6, size, 1);
  for (const a of spec.align) {
    mark(a - 2, a - 2, 5, 5);
  }
  return r;
}

function maskBit(x: number, y: number) {
  return (x + y) % 2 === 0;
}

function formatBits() {
  // ECC M (00) + mask 0 (000) → BCH format info 0x5412
  return 0x5412;
}

export function qrSvg(payload: string, moduleSize = 4): string {
  const text = payload.slice(0, 40);
  let spec: VerSpec | null = null;
  let code: number[] | null = null;
  for (const s of SPECS) {
    const encoded = encodeBytes(text, s);
    if (encoded) {
      spec = s;
      code = encoded;
      break;
    }
  }
  if (!spec || !code) throw new Error("Payload do QR grande demais");

  const size = spec.size;
  const modules = Array.from({ length: size }, () => Array(size).fill(0));
  placeFinder(modules, 0, 0);
  placeFinder(modules, size - 7, 0);
  placeFinder(modules, 0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    modules[6][i] = i % 2 === 0 ? 1 : 0;
    modules[i][6] = i % 2 === 0 ? 1 : 0;
  }
  for (const a of spec.align) placeAlign(modules, a, a);

  const res = reserved(size, spec);
  const fmt = formatBits();
  const positions: Array<[number, number]> = [];
  // format info
  for (let i = 0; i < 6; i++) modules[8][i] = (fmt >> i) & 1;
  modules[8][7] = (fmt >> 6) & 1;
  modules[8][8] = (fmt >> 7) & 1;
  modules[7][8] = (fmt >> 8) & 1;
  for (let i = 9; i < 15; i++) modules[14 - i][8] = (fmt >> i) & 1;
  for (let i = 0; i < 8; i++) modules[size - 1 - i][8] = (fmt >> i) & 1;
  for (let i = 0; i < 8; i++) modules[8][size - 8 + i] = (fmt >> (i + 7)) & 1;
  modules[size - 8][8] = 1;

  let bit = 0;
  const totalBits = code.length * 8;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const row = Math.floor((size - 1 - col) / 2) % 2 === 0 ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        if (res[row][x]) continue;
        let v = 0;
        if (bit < totalBits) {
          v = (code[bit >> 3] >> (7 - (bit & 7))) & 1;
          bit += 1;
        }
        if (maskBit(x, row)) v ^= 1;
        modules[row][x] = v;
      }
    }
  }

  const quiet = 2;
  const dim = (size + quiet * 2) * moduleSize;
  const rects: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y][x]) continue;
      rects.push(
        `<rect x="${(x + quiet) * moduleSize}" y="${(y + quiet) * moduleSize}" width="${moduleSize}" height="${moduleSize}" />`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#111">${rects.join("")}</g></svg>`;
}
