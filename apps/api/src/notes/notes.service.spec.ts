import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNoteInput } from './notes.service.js';

test('not girişi başlık, metin, etiket ve proje alanlarını sınırlar',()=>{
  const note=validateNoteInput({
    title:'  Saha notu ',
    body:'Örnek metin\nİkinci satır',
    tags:[' saha ','Saha','ÇED',''],
    projectId:'123e4567-e89b-42d3-a456-426614174000',
  },true);
  assert.equal(note.title,'Saha notu');
  assert.equal(note.body,'Örnek metin\nİkinci satır');
  assert.deepEqual(note.tags,['saha','ÇED']);
  assert.equal(note.projectId,'123e4567-e89b-42d3-a456-426614174000');
});

test('not girişi eksik veya sınır dışı alanları reddeder',()=>{
  assert.throws(()=>validateNoteInput({title:'',body:'',tags:[]},true));
  assert.throws(()=>validateNoteInput({title:'Başlık',body:'x'.repeat(20001),tags:[]},true));
  assert.throws(()=>validateNoteInput({title:'Başlık',body:'',tags:Array(13).fill('etiket')},true));
  assert.throws(()=>validateNoteInput({title:'Başlık',body:'',tags:['x'.repeat(33)]},true));
  assert.throws(()=>validateNoteInput({title:'Başlık',body:'',tags:[],projectId:'not-a-uuid'},true));
  assert.throws(()=>validateNoteInput({title:'Başlık',body:'',tags:[],taskId:'not-a-uuid'},true));
  assert.throws(()=>validateNoteInput({title:'Başlık',version:0},false));
});

test('not güncellemesi bilinmeyen alanları ve geçersiz sürümü reddeder',()=>{
  assert.throws(()=>validateNoteInput({version:1,ownerUserId:'another-user'},false));
  assert.throws(()=>validateNoteInput({version:'1',title:'Güncel'},false));
  const partial=validateNoteInput({version:2,title:'Yeni başlık'},false);
  assert.deepEqual(partial,{version:2,title:'Yeni başlık'});
});
