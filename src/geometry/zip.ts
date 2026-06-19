export interface ZipFile {
  path: string;
  data: string | Uint8Array;
}

const encoder = new TextEncoder();

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? encoder.encode(data) : data;
}

function writeU16(view: DataView, off: number, v: number): void {
  view.setUint16(off, v, true);
}

function writeU32(view: DataView, off: number, v: number): void {
  view.setUint32(off, v >>> 0, true);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export function zipStore(files: ZipFile[]): Blob {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = encoder.encode(f.path);
    const data = bytes(f.data);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    writeU32(lv, 0, 0x04034b50);
    writeU16(lv, 4, 20);
    writeU16(lv, 6, 0);
    writeU16(lv, 8, 0);
    writeU16(lv, 10, 0);
    writeU16(lv, 12, 0);
    writeU32(lv, 14, crc);
    writeU32(lv, 18, data.length);
    writeU32(lv, 22, data.length);
    writeU16(lv, 26, name.length);
    writeU16(lv, 28, 0);
    local.set(name, 30);
    chunks.push(local, data);

    const c = new Uint8Array(46 + name.length);
    const cv = new DataView(c.buffer);
    writeU32(cv, 0, 0x02014b50);
    writeU16(cv, 4, 20);
    writeU16(cv, 6, 20);
    writeU16(cv, 8, 0);
    writeU16(cv, 10, 0);
    writeU16(cv, 12, 0);
    writeU16(cv, 14, 0);
    writeU32(cv, 16, crc);
    writeU32(cv, 20, data.length);
    writeU32(cv, 24, data.length);
    writeU16(cv, 28, name.length);
    writeU16(cv, 30, 0);
    writeU16(cv, 32, 0);
    writeU16(cv, 34, 0);
    writeU16(cv, 36, 0);
    writeU32(cv, 38, 0);
    writeU32(cv, 42, offset);
    c.set(name, 46);
    central.push(c);

    offset += local.length + data.length;
  }

  const centralStart = offset;
  const centralBytes = concat(central);
  chunks.push(centralBytes);
  offset += centralBytes.length;

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  writeU32(ev, 0, 0x06054b50);
  writeU16(ev, 4, 0);
  writeU16(ev, 6, 0);
  writeU16(ev, 8, files.length);
  writeU16(ev, 10, files.length);
  writeU32(ev, 12, centralBytes.length);
  writeU32(ev, 16, centralStart);
  writeU16(ev, 20, 0);
  chunks.push(end);

  return new Blob([concat(chunks) as BlobPart], { type: 'application/zip' });
}
