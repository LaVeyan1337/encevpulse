import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const MAX_DOCX_BYTES = 12 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1200;
const MAX_ENTRY_BYTES = 24 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface DocxFieldDefinition {
  key: string;
  label: string;
  source: 'project' | 'user' | 'system';
  required: boolean;
  multiline?: boolean;
}

export const DOCX_FIELDS: Record<string, DocxFieldDefinition> = {
  DOCUMENT_DATE: { key: 'DOCUMENT_DATE', label: 'Belge tarihi', source: 'system', required: true },
  PROJECT_NAME: { key: 'PROJECT_NAME', label: 'Proje adı', source: 'project', required: true },
  PROJECT_DESCRIPTION: { key: 'PROJECT_DESCRIPTION', label: 'Proje açıklaması', source: 'project', required: false, multiline: true },
  PROJECT_TYPE: { key: 'PROJECT_TYPE', label: 'Proje türü', source: 'project', required: true },
  PROJECT_OWNER: { key: 'PROJECT_OWNER', label: 'Proje sorumlusu', source: 'project', required: true },
  PROJECT_START_DATE: { key: 'PROJECT_START_DATE', label: 'Proje başlangıç tarihi', source: 'project', required: false },
  PROJECT_TARGET_DATE: { key: 'PROJECT_TARGET_DATE', label: 'Proje hedef tarihi', source: 'project', required: false },
  PROJECT_FILE_NUMBER: { key: 'PROJECT_FILE_NUMBER', label: 'ÇED dosya numarası', source: 'project', required: false },
  ECED_REFERENCE: { key: 'ECED_REFERENCE', label: 'e-ÇED referansı', source: 'project', required: false },
  AUTHOR_NAME: { key: 'AUTHOR_NAME', label: 'Belgeyi oluşturan', source: 'system', required: true },
  AUTHOR_TITLE: { key: 'AUTHOR_TITLE', label: 'Oluşturanın unvanı', source: 'system', required: false },
  AUTHOR_DEPARTMENT: { key: 'AUTHOR_DEPARTMENT', label: 'Oluşturanın birimi', source: 'system', required: false },
  AUTHOR_EMAIL: { key: 'AUTHOR_EMAIL', label: 'Oluşturanın e-posta adresi', source: 'system', required: false },
  RECIPIENT_NAME: { key: 'RECIPIENT_NAME', label: 'Hitap edilen kişi / makam', source: 'user', required: true },
  INSTITUTION_NAME: { key: 'INSTITUTION_NAME', label: 'Kurum adı', source: 'user', required: true },
  CONTACT_PERSON: { key: 'CONTACT_PERSON', label: 'İlgili kişi', source: 'user', required: false },
  PETITION_SUBJECT: { key: 'PETITION_SUBJECT', label: 'Dilekçe konusu', source: 'user', required: true },
  PETITION_BODY: { key: 'PETITION_BODY', label: 'Dilekçe metni', source: 'user', required: true, multiline: true },
  REFERENCE_NUMBER: { key: 'REFERENCE_NUMBER', label: 'İlgi / referans numarası', source: 'user', required: false },
};

interface ZipEntry {
  name: string;
  data: Buffer;
  method: 0 | 8;
  modifiedTime: number;
  modifiedDate: number;
  externalAttributes: number;
}

export interface InspectedDocx {
  sha256: string;
  size: number;
  fieldKeys: string[];
}

export interface RenderedDocx {
  content: Buffer;
  sha256: string;
  size: number;
  previewText: string;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  CRC_TABLE[n] = value >>> 0;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readZipEntries(input: Buffer): ZipEntry[] {
  if (input.length < 22 || input.length > MAX_DOCX_BYTES) throw new Error('DOCX dosya boyutu geçersiz.');
  const minimum = Math.max(0, input.length - 65_557);
  let endRecord = -1;
  for (let offset = input.length - 22; offset >= minimum; offset -= 1) {
    if (input.readUInt32LE(offset) === 0x06054b50) {
      const commentLength = input.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === input.length) { endRecord = offset; break; }
    }
  }
  if (endRecord < 0) throw new Error('DOCX dosyasının ZIP bitiş kaydı okunamadı.');

  const diskNumber = input.readUInt16LE(endRecord + 4);
  const centralDisk = input.readUInt16LE(endRecord + 6);
  const entriesOnDisk = input.readUInt16LE(endRecord + 8);
  const entryCount = input.readUInt16LE(endRecord + 10);
  const centralSize = input.readUInt32LE(endRecord + 12);
  const centralOffset = input.readUInt32LE(endRecord + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount ||
      entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new Error('Çok parçalı veya ZIP64 Word dosyaları desteklenmiyor.');
  }
  if (entryCount < 1 || entryCount > MAX_ZIP_ENTRIES ||
      centralOffset + centralSize !== endRecord || centralOffset > input.length) {
    throw new Error('DOCX dosyasının ZIP dizini geçersiz.');
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let offset = centralOffset;
  let totalUncompressed = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endRecord || input.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('DOCX dosyasının ZIP kayıtlarından biri bozuk.');
    }
    const flags = input.readUInt16LE(offset + 8);
    const method = input.readUInt16LE(offset + 10);
    const modifiedTime = input.readUInt16LE(offset + 12);
    const modifiedDate = input.readUInt16LE(offset + 14);
    const expectedCrc = input.readUInt32LE(offset + 16);
    const compressedSize = input.readUInt32LE(offset + 20);
    const uncompressedSize = input.readUInt32LE(offset + 24);
    const nameLength = input.readUInt16LE(offset + 28);
    const extraLength = input.readUInt16LE(offset + 30);
    const commentLength = input.readUInt16LE(offset + 32);
    const startDisk = input.readUInt16LE(offset + 34);
    const externalAttributes = input.readUInt32LE(offset + 38);
    const localOffset = input.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > endRecord || nameLength < 1 || startDisk !== 0 ||
        compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('DOCX ZIP kaydının boyut veya konum alanı geçersiz.');
    }
    if ((flags & 0x0001) !== 0) throw new Error('Şifrelenmiş DOCX şablonları kullanılamaz.');
    if (method !== 0 && method !== 8) throw new Error('DOCX şablonunda desteklenmeyen sıkıştırma yöntemi var.');
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error('DOCX içindeki bir dosya izin verilen boyutu aşıyor.');

    let name: string;
    try {
      const nameBytes = input.subarray(offset + 46, offset + 46 + nameLength);
      name = (flags & 0x0800) ? decoder.decode(nameBytes) : nameBytes.toString('latin1');
    } catch {
      throw new Error('DOCX dosyasındaki bir ZIP dosya adı geçersiz.');
    }
    const normalized = name.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.split('/').some(part => part === '..') ||
        names.has(normalized) || normalized.includes('\u0000')) {
      throw new Error('DOCX dosyası yinelenen veya güvenli olmayan dosya yolu içeriyor.');
    }
    names.add(normalized);

    if (localOffset + 30 > centralOffset || input.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('DOCX dosyasının yerel ZIP başlığı geçersiz.');
    }
    const localNameLength = input.readUInt16LE(localOffset + 26);
    const localExtraLength = input.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const localName = input.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    if (decoder.decode(localName) !== name || dataOffset + compressedSize > centralOffset) {
      throw new Error('DOCX ZIP başlığı ve dosya dizini birbiriyle uyuşmuyor.');
    }

    const compressed = input.subarray(dataOffset, dataOffset + compressedSize);
    let data: Buffer;
    try {
      data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
    } catch {
      throw new Error('DOCX içindeki bir dosya açılamadı veya boyut sınırını aşıyor.');
    }
    if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) {
      throw new Error('DOCX dosyasının içerik bütünlüğü doğrulanamadı.');
    }
    totalUncompressed += data.length;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('DOCX toplam açılmış içerik boyutu izin verilen sınırı aşıyor.');
    }
    entries.push({
      name: normalized, data, method: 8, modifiedTime, modifiedDate, externalAttributes,
    });
    offset = next;
  }
  if (offset !== endRecord || !names.has('[Content_Types].xml') || !names.has('word/document.xml')) {
    throw new Error('Dosya geçerli bir Word DOCX paketi değil.');
  }
  return entries;
}

function writeZipEntries(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 6 });
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(entry.modifiedTime, 10);
    local.writeUInt16LE(entry.modifiedDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(entry.modifiedTime, 12);
    central.writeUInt16LE(entry.modifiedDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt32LE(0, 36);
    central.writeUInt32LE(entry.externalAttributes, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localDirectory.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localDirectory, centralDirectory, end]);
}

function isWordXml(name: string): boolean {
  return /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(name);
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    const numeric = lower.startsWith('#x') ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    try { return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : _match; } catch { return _match; }
  });
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function extractTokens(xml: string): string[] {
  const tokenPattern = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;
  const tokens = new Set<string>();
  let textMarkerCount = 0;
  for (const match of xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) {
    const plain = decodeXml(match[1]);
    for (const token of plain.matchAll(tokenPattern)) {
      tokens.add(token[1]);
      textMarkerCount += 1;
    }
  }
  const totalMarkerCount = (xml.match(/\{\{/g) ?? []).length;
  if (totalMarkerCount !== textMarkerCount) {
    throw new Error('Word şablonunda alan işaretleyicilerinden biri metin satırına bölünmüş veya hatalı yazılmış. {{ALAN_ADI}} ifadesini tek Word metin satırında tutun.');
  }
  return [...tokens].sort();
}

function replaceWordText(xml: string, values: Record<string, string>): string {
  return xml.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (_whole, opening: string, encoded: string, closing: string) => {
    let plain = decodeXml(encoded);
    plain = plain.replace(/\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g, (_token, key: string) => {
      if (!Object.hasOwn(values, key)) throw new Error(`Şablondaki ${key} alanı için değer bulunamadı.`);
      const clean = values[key].replace(/\u0000/g, '');
      return clean.split(/\r\n|\r|\n/).map(escapeXml)
        .join('</w:t><w:br/><w:t xml:space="preserve">');
    });
    return opening + plain.split(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i).join('&amp;') + closing;
  });
}

function plainWordText(xml: string): string {
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  return paragraphs.map(paragraph => {
    const runs = [...paragraph[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)];
    return runs.map(run => decodeXml(run[1])).join('');
  }).join('\n').replace(/[ \t]+\n/g, '\n').trim();
}

export function inspectDocxTemplate(input: Buffer): InspectedDocx {
  const entries = readZipEntries(input);
  const xmlEntries = entries.filter(entry => isWordXml(entry.name));
  const tokens = new Set<string>();
  for (const entry of xmlEntries) {
    const found = extractTokens(entry.data.toString('utf8'));
    for (const key of found) {
      if (!DOCX_FIELDS[key]) throw new Error(`Şablondaki {{${key}}} alanı tanınmıyor. Desteklenen alan adlarını kontrol edin.`);
      tokens.add(key);
    }
  }
  if (tokens.size === 0) throw new Error('Word şablonunda alan bulunamadı. Metin içine {{PROJECT_NAME}} gibi alanlar ekleyin.');
  return {
    sha256: createHash('sha256').update(input).digest('hex'),
    size: input.length,
    fieldKeys: [...tokens].sort(),
  };
}

export function renderDocxTemplate(input: Buffer, values: Record<string, string>): RenderedDocx {
  const inspection = inspectDocxTemplate(input);
  const missing = inspection.fieldKeys.filter(key => DOCX_FIELDS[key].required && !String(values[key] ?? '').trim());
  if (missing.length) {
    const labels = missing.map(key => DOCX_FIELDS[key].label);
    throw new Error('Belge oluşturulamadı. Şu zorunlu alanları doldurun: ' + labels.join(', ') + '.');
  }

  const entries = readZipEntries(input);
  let previewXml = '';
  for (const entry of entries) {
    if (!isWordXml(entry.name)) continue;
    const xml = entry.data.toString('utf8');
    const replaced = replaceWordText(xml, values);
    if (entry.name.toLowerCase() === 'word/document.xml') previewXml = replaced;
    entry.data = Buffer.from(replaced, 'utf8');
  }
  const content = writeZipEntries(entries);
  if (content.length > MAX_DOCX_BYTES) throw new Error('Oluşturulan Word belgesi 12 MB sınırını aşıyor.');
  return {
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
    size: content.length,
    previewText: plainWordText(previewXml).slice(0, 20_000),
  };
}

export function fieldDefinitions(keys: string[]): DocxFieldDefinition[] {
  return keys.map(key => {
    const definition = DOCX_FIELDS[key];
    if (!definition) throw new Error('Word şablonu tanımlanmayan alan içeriyor.');
    return definition;
  });
}

export const DOCX_CONTENT_TYPE = DOCX_MIME;
