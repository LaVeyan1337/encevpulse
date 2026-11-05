import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { inspectDocxTemplate, renderDocxTemplate } from './docx-template.js';

type Entry={name:string;content:string};
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){let value=n;for(let bit=0;bit<8;bit++)value=(value&1)?(0xedb88320^(value>>>1)):(value>>>1);crcTable[n]=value>>>0;}
function crc32(data:Buffer){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}

function zip(entries:Entry[]):Buffer {
  const locals:Buffer[]=[];const centrals:Buffer[]=[];let localOffset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name,'utf8'),data=Buffer.from(entry.content,'utf8');
    const compressed=deflateRawSync(data),crc=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);
    local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);
    local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
    locals.push(local,name,compressed);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x0800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);
    central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);
    central.writeUInt16LE(name.length,28);central.writeUInt32LE(localOffset,42);
    centrals.push(central,name);
    localOffset+=local.length+name.length+compressed.length;
  }
  const local=Buffer.concat(locals),central=Buffer.concat(centrals),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(central.length,12);end.writeUInt32LE(local.length,16);
  return Buffer.concat([local,central,end]);
}
function docx(documentXml:string,headerXml=''):Buffer {
  const entries:Entry[]=[
    {name:'[Content_Types].xml',content:'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'},
    {name:'word/document.xml',content:documentXml},
  ];
  if(headerXml)entries.push({name:'word/header1.xml',content:headerXml});
  return zip(entries);
}
const xml=(text:string)=>`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;

test('DOCX şablonu ZIP bütünlüğünü doğrular ve alanları keşfeder',()=>{
  const bytes=docx(xml('{{PROJECT_NAME}} · {{PETITION_SUBJECT}}'));
  const result=inspectDocxTemplate(bytes);
  assert.equal(result.size,bytes.length);
  assert.match(result.sha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(result.fieldKeys,['PETITION_SUBJECT','PROJECT_NAME']);
});

test('DOCX üretimi XML karakterlerini güvenli kaçırır ve çok satırlı metni Word satırına dönüştürür',()=>{
  const bytes=docx(xml('{{PROJECT_NAME}} — {{PETITION_BODY}}'));
  const result=renderDocxTemplate(bytes,{
    PROJECT_NAME:'A&B <GES>',
    PETITION_BODY:'İlk satır\nİkinci satır',
  });
  assert.ok(result.content.length>bytes.length/2);
  assert.match(result.sha256,/^[0-9a-f]{64}$/);
  assert.match(result.previewText,/A&B <GES>/);
  assert.match(result.previewText,/İlk satır\nİkinci satır/);
  assert.ok(result.content.includes(Buffer.from('A&amp;B &lt;GES&gt;')));
  assert.ok(result.content.includes(Buffer.from('<w:br/>')));
  assert.ok(!result.content.includes(Buffer.from('{{PROJECT_NAME}}')));
});

test('üstbilgideki alanlar da bulunur ve doldurulur',()=>{
  const bytes=docx(xml('{{PROJECT_NAME}}'),'<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>{{DOCUMENT_DATE}}</w:t></w:r></w:p></w:hdr>');
  const inspection=inspectDocxTemplate(bytes);
  assert.deepEqual(inspection.fieldKeys,['DOCUMENT_DATE','PROJECT_NAME']);
  const result=renderDocxTemplate(bytes,{PROJECT_NAME:'Proje',DOCUMENT_DATE:'05.11.2026'});
  assert.ok(result.content.includes(Buffer.from('05.11.2026')));
});

test('zorunlu alan eksikse Word çıktısı üretilmez',()=>{
  const bytes=docx(xml('{{RECIPIENT_NAME}} — {{PETITION_BODY}}'));
  assert.throws(()=>renderDocxTemplate(bytes,{RECIPIENT_NAME:'Bakanlık',PETITION_BODY:''}),/Dilekçe metni/);
});

test('tanınmayan ve Word satırlarına bölünmüş alanlar reddedilir',()=>{
  assert.throws(()=>inspectDocxTemplate(docx(xml('{{UNKNOWN_FIELD}}'))),/tanınmıyor/);
  const split=docx(xml('{{PROJECT_</w:t></w:r></w:p><w:p><w:r><w:t>NAME}}'));
  assert.throws(()=>inspectDocxTemplate(split),/tek Word metin satırında/);
});

test('bozuk ZIP veya CRC değeri değiştirilmiş DOCX reddedilir',()=>{
  const bytes=docx(xml('{{PROJECT_NAME}}'));
  const badSignature=Buffer.from(bytes);badSignature[0]=0;
  assert.throws(()=>inspectDocxTemplate(badSignature),/ZIP bitiş kaydı|ZIP kayıtlarından biri|yerel ZIP başlığı/);
  const badCrc=Buffer.from(bytes);
  const localNameLength=badCrc.readUInt16LE(26),localExtraLength=badCrc.readUInt16LE(28);
  badCrc[30+localNameLength+localExtraLength]^=0x01;
  assert.throws(()=>inspectDocxTemplate(badCrc),/bütünlüğü doğrulanamadı|açılamadı/);
});
