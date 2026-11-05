import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

export const CHAT_ATTACHMENT_MAX_FILE_BYTES = 12 * 1024 * 1024;
export const CHAT_ATTACHMENT_MAX_TOTAL_BYTES = 24 * 1024 * 1024;
export const CHAT_ATTACHMENT_MAX_FILES = 5;
export const CHAT_ATTACHMENT_USER_QUOTA_BYTES = 1024 * 1024 * 1024;

export type UploadedChatFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type ValidatedChatFile = {
  originalName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  content: Buffer;
};

const EXTENSION_MIMES: Record<string, string[]> = {
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'],
  '.png': ['image/png'], '.webp': ['image/webp'], '.gif': ['image/gif'],
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.txt': ['text/plain'], '.csv': ['text/csv'],
  '.webm': ['audio/webm', 'video/webm'],
  '.ogg': ['audio/ogg'], '.oga': ['audio/ogg'],
  '.mp3': ['audio/mpeg'],
  '.m4a': ['audio/mp4'], '.wav': ['audio/wav'],
  '.mp4': ['audio/mp4', 'video/mp4'],
};

function hasPrefix(buffer: Buffer, signature: number[]): boolean {
  return buffer.length >= signature.length && signature.every((value,index)=>buffer[index]===value);
}

function contentMatches(mimeType: string, buffer: Buffer): boolean {
  switch (mimeType) {
    case 'image/jpeg': return hasPrefix(buffer,[0xff,0xd8,0xff]);
    case 'image/png': return hasPrefix(buffer,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    case 'image/webp': return buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';
    case 'image/gif': return buffer.length>=6&&['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6));
    case 'application/pdf': return buffer.subarray(0,5).toString('ascii')==='%PDF-';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return hasPrefix(buffer,[0x50,0x4b,0x03,0x04]);
    case 'text/plain':
    case 'text/csv':
      return !buffer.includes(0)&&Buffer.from(buffer.toString('utf8'),'utf8').equals(buffer);
    case 'audio/webm':
    case 'video/webm':
      return hasPrefix(buffer,[0x1a,0x45,0xdf,0xa3]);
    case 'audio/ogg': return buffer.length>=4&&buffer.toString('ascii',0,4)==='OggS';
    case 'audio/mpeg': return buffer.length>=3&&(buffer.toString('ascii',0,3)==='ID3'||(buffer[0]===0xff&&(buffer[1]&0xe0)===0xe0));
    case 'audio/wav': return buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WAVE';
    case 'audio/mp4':
    case 'video/mp4': return buffer.length>=12&&buffer.toString('ascii',4,8)==='ftyp';
    default: return false;
  }
}

export function validateChatAttachmentFiles(files: UploadedChatFile[]): ValidatedChatFile[] {
  if (!Array.isArray(files)||files.length<1||files.length>CHAT_ATTACHMENT_MAX_FILES) {
    throw invalid('Bir mesajda 1–5 dosya ekleyebilirsiniz.');
  }
  let totalBytes=0;
  const validated=files.map((file)=>{
    if (!file||!Buffer.isBuffer(file.buffer)||file.buffer.length<1) throw invalid('Dosya içeriği okunamadı.');
    const byteSize=file.buffer.length;
    if (byteSize>CHAT_ATTACHMENT_MAX_FILE_BYTES) throw invalid('Her dosya en fazla 12 MB olabilir.');
    if (Number(file.size)!==byteSize) throw invalid('Dosya boyutu doğrulanamadı.');
    totalBytes+=byteSize;
    const originalPath=String(file.originalname??'').replace(/\\/g,'/');
    const rawName=originalPath.split('/').pop()??'';
    const originalName=rawName.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,180);
    const extension=originalName.slice(originalName.lastIndexOf('.')).toLocaleLowerCase('en-US');
    const allowedMimes=EXTENSION_MIMES[extension];
    if(!originalName||!allowedMimes) throw invalid('Bu dosya türüne izin verilmiyor.');
    const reportedMime=String(file.mimetype??'').split(';')[0].trim().toLocaleLowerCase('en-US');
    const mimeType=reportedMime&&reportedMime!=='application/octet-stream'?reportedMime:allowedMimes[0];
    if(!allowedMimes.includes(mimeType)||!contentMatches(mimeType,file.buffer)) {
      throw invalid('Dosya uzantısı veya içeriği desteklenen türle eşleşmiyor.');
    }
    if((mimeType==='text/plain'||mimeType==='text/csv')&&byteSize>1024*1024) {
      throw invalid('Metin dosyaları en fazla 1 MB olabilir.');
    }
    return {
      originalName,
      mimeType,
      byteSize,
      sha256:createHash('sha256').update(file.buffer).digest('hex'),
      content:file.buffer,
    };
  });
  if(totalBytes>CHAT_ATTACHMENT_MAX_TOTAL_BYTES) throw invalid('Bir mesajdaki toplam ek boyutu en fazla 24 MB olabilir.');
  return validated;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({code:'INVALID_CHAT_ATTACHMENT',message});
}
