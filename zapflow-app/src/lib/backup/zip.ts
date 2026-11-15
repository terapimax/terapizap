// ZIP mínimo, sem dependências.
// Escrita: só "store" (sem compressão) — áudio, imagem e vídeo já vêm comprimidos.
// Leitura: "store" e "deflate" (caso a pessoa tenha recompactado o backup no Windows),
// lendo direto do arquivo por fatias, sem carregar tudo na memória.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const enc = new TextEncoder();
const MAX = 0xffffffff;

function dosTime(d: Date) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface Entry { name: Uint8Array; crc: number; size: number; offset: number; time: number; date: number }

/** Monta um .zip como Blob. Os arquivos grandes continuam como Blob (o navegador não copia tudo para a memória do JS). */
export class ZipWriter {
  private parts: BlobPart[] = [];
  private entries: Entry[] = [];
  private offset = 0;

  async add(path: string, data: Blob | Uint8Array | string) {
    const blob = typeof data === "string" ? new Blob([enc.encode(data)]) : data instanceof Blob ? data : new Blob([data as BlobPart]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const size = bytes.length;
    if (this.offset + size > MAX - 1024 * 1024) throw new Error("O backup passou de 4 GB. Desmarque “Incluir arquivos” ou apague mídias que não usa.");
    const name = enc.encode(path);
    const crc = crc32(bytes);
    const { time, date } = dosTime(new Date());

    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true); // nomes em UTF-8
    h.setUint16(8, 0, true); // store
    h.setUint16(10, time, true);
    h.setUint16(12, date, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, size, true);
    h.setUint32(22, size, true);
    h.setUint16(26, name.length, true);
    h.setUint16(28, 0, true);

    this.entries.push({ name, crc, size, offset: this.offset, time, date });
    this.parts.push(h.buffer, name as BlobPart, blob);
    this.offset += 30 + name.length + size;
  }

  finish(): Blob {
    const start = this.offset;
    let cdSize = 0;
    for (const e of this.entries) {
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, e.time, true);
      c.setUint16(14, e.date, true);
      c.setUint32(16, e.crc, true);
      c.setUint32(20, e.size, true);
      c.setUint32(24, e.size, true);
      c.setUint16(28, e.name.length, true);
      c.setUint32(42, e.offset, true);
      this.parts.push(c.buffer, e.name as BlobPart);
      cdSize += 46 + e.name.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, start, true);
    this.parts.push(end.buffer);
    return new Blob(this.parts, { type: "application/zip" });
  }
}

export interface ZipFile { name: string; size: number; read(): Promise<Blob> }

/** Lê o índice do .zip e devolve os arquivos para ler sob demanda. */
export async function readZip(file: Blob): Promise<Map<string, ZipFile>> {
  const tailLen = Math.min(file.size, 22 + 65535);
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Este arquivo não é um .zip válido.");
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset === MAX || count === 0xffff) throw new Error("Zip grande demais (ZIP64) não é suportado.");

  const cd = new DataView(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const out = new Map<string, ZipFile>();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error("Índice do .zip corrompido.");
    const method = cd.getUint16(p + 10, true);
    const compSize = cd.getUint32(p + 20, true);
    const size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const local = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen)).replace(/\\/g, "/");
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    out.set(name, {
      name,
      size,
      async read() {
        const lh = new DataView(await file.slice(local, local + 30).arrayBuffer());
        if (lh.getUint32(0, true) !== 0x04034b50) throw new Error(`Arquivo ${name} corrompido no .zip.`);
        const start = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const raw = file.slice(start, start + compSize);
        if (method === 0) return raw;
        if (method === 8) return new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
        throw new Error(`Compressão do arquivo ${name} não suportada.`);
      },
    });
  }
  return out;
}
