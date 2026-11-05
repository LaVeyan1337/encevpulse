import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT_ATTACHMENT_MAX_FILE_BYTES, CHAT_ATTACHMENT_MAX_FILES, CHAT_ATTACHMENT_MAX_TOTAL_BYTES, validateChatAttachmentFiles } from './chat-attachments.js';

const pngSignature=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
function uploaded(name:string,mime:string,content:Buffer){
  return {originalname:name,mimetype:mime,size:content.length,buffer:content};
}
function pngBytes(size=pngSignature.length+4){
  const content=Buffer.alloc(size,0);
  pngSignature.copy(content);
  return content;
}

test('chat uploads normalize Windows paths and retain only a safe base filename',()=>{
  const result=validateChatAttachmentFiles([
    uploaded('C:\\Users\\Person\\Desktop\\flora.png','image/png',pngBytes()),
  ]);
  assert.equal(result[0].originalName,'flora.png');
  assert.equal(result[0].mimeType,'image/png');
  assert.equal(result[0].byteSize,pngSignature.length+4);
  assert.match(result[0].sha256,/^[a-f0-9]{64}$/);
});

test('chat uploads reject mismatched MIME signatures and active-content file types',()=>{
  assert.throws(()=>validateChatAttachmentFiles([
    uploaded('fake.png','image/png',Buffer.from('<script>alert(1)</script>')),
  ]),/i);
  assert.throws(()=>validateChatAttachmentFiles([
    uploaded('payload.svg','image/svg+xml',Buffer.from('<svg/>')),
  ]),/i);
});

test('chat uploads enforce per-file, per-message and file-count limits',()=>{
  assert.throws(()=>validateChatAttachmentFiles([
    uploaded('large.png','image/png',pngBytes(CHAT_ATTACHMENT_MAX_FILE_BYTES+1)),
  ]));
  assert.throws(()=>validateChatAttachmentFiles(
    Array.from({length:CHAT_ATTACHMENT_MAX_FILES+1},(_,index)=>uploaded(index+'.png','image/png',pngBytes())),
  ));
  const large=pngBytes(5*1024*1024);
  assert.ok(large.length*5>CHAT_ATTACHMENT_MAX_TOTAL_BYTES);
  assert.throws(()=>validateChatAttachmentFiles(
    Array.from({length:5},(_,index)=>uploaded(index+'.png','image/png',large)),
  ));
});

test('chat uploads accept plain text only as validated UTF-8 .txt or .csv',()=>{
  const accepted=validateChatAttachmentFiles([uploaded('notlar.txt','text/plain',Buffer.from('Saha gözlemi: flora'))]);
  assert.equal(accepted[0].mimeType,'text/plain');
  assert.throws(()=>validateChatAttachmentFiles([uploaded('notlar.txt','text/plain',Buffer.from([0x66,0x00,0x6f]))]));
});
