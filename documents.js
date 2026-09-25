/* Versioned document catalogue is loaded with the authenticated dashboard payload.
   Public files contain only AES-GCM ciphertext; no document key is shipped here. */
let libraryRenderSignature='';
const libraryText=(hu,en)=>lang==='hu'?hu:en;
function libraryDocuments(){return cloudSession?state.documentLibrary?.documents||[]:[]}
function taskDocuments(id){return libraryDocuments().filter(d=>d.taskIds.includes(Number(id)))}
function taskDocumentMarkup(id){const docs=taskDocuments(id);if(!docs.length)return '';return `<div class="task-documents"><strong>${libraryText('Dokumentumok','Documents')} (${docs.length})</strong>${docs.map(d=>`<div><button type="button" class="doc-link" data-document="${esc(d.id)}">${esc(d.title)}</button> <span class="doc-meta">v${esc(d.versions[0].version)} · ${esc(d.language.toUpperCase())}</span></div>`).join('')}</div>`}
function libraryRender(){
 const docs=libraryDocuments();const sig=JSON.stringify([lang,docs]);
 document.querySelector('#documentsNav').hidden=!cloudSession;
 document.querySelector('#documentLibrary').hidden=!cloudSession;
 if(!cloudSession){document.querySelector('#documentRows').replaceChildren();document.querySelector('#taskDocumentPanel').replaceChildren();libraryRenderSignature='';return}
 if(sig!==libraryRenderSignature){
  const select=document.querySelector('#documentTaskFilter'),val=select.value;
  select.innerHTML=`<option value="">${libraryText('Minden kapcsolódó feladat','All related tasks')}</option>`+state.tasks.filter(t=>docs.some(d=>d.taskIds.includes(t.id))).map(t=>`<option value="${t.id}">#${t.id} ${esc(t['title_'+lang]||t.title_hu)}</option>`).join('');select.value=val;
  document.querySelector('#documentSearch').placeholder=libraryText('Keresés a dokumentumok között…','Search documents…');
  document.querySelector('#documentTaskFilter').setAttribute('aria-label',libraryText('Kapcsolódó feladat','Related task'));
  document.querySelectorAll('[data-doc-hu]').forEach(el=>el.textContent=libraryText(el.dataset.docHu,el.dataset.docEn));
  document.querySelector('#documentCount').textContent=libraryText(`${docs.length} dokumentum · ${docs.reduce((n,d)=>n+d.versions.length,0)} verzió`,`${docs.length} documents · ${docs.reduce((n,d)=>n+d.versions.length,0)} versions`);
  libraryRenderSignature=sig;libraryFilter();
 }
}
function libraryFileButtons(d,v){return v.files.map((f,i)=>`<button type="button" class="btn secondary doc-download" data-doc-id="${esc(d.id)}" data-version="${esc(v.version)}" data-file="${i}" aria-label="${esc(d.title)} v${esc(v.version)} ${esc(f.type.toUpperCase())}">${esc(f.type.toUpperCase())} ↓ <small>${Math.ceil(f.size/1024)} KB</small></button>`).join(' ')}
function libraryFilter(){
 const q=document.querySelector('#documentSearch').value.trim().toLocaleLowerCase(),task=Number(document.querySelector('#documentTaskFilter').value);
 const docs=libraryDocuments().filter(d=>(!task||d.taskIds.includes(task))&&(!q||[d.title,d.id,d.language,...d.versions.map(v=>v.note)].join(' ').toLocaleLowerCase().includes(q)));
 document.querySelector('#documentRows').innerHTML=docs.map(d=>{
  const latest=d.versions[0];
  return `<article class="doc-card" id="document-${esc(d.id)}"><div class="doc-heading"><div><h3>${esc(d.title)}</h3><div class="doc-meta">${esc(d.language.toUpperCase())} · <span class="pill">${libraryText('Tervezet / jóváhagyásra vár','Draft / awaiting approval')}</span></div></div><span class="doc-version">v${esc(latest.version)}</span></div>
  <p class="doc-meta">${libraryText('Aktuális változat','Current version')}: ${esc(latest.date)} · ${esc(latest.note)}</p>
  <div class="doc-actions">${libraryFileButtons(d,latest)}</div>
  <p class="doc-meta">${libraryText('Kapcsolódó feladatok','Related tasks')}: ${d.taskIds.map(id=>{const t=state.tasks.find(t=>t.id===id);return `<button class="doc-link" type="button" data-task-link="${id}">#${id} ${esc(t?.['title_'+lang]||t?.title_hu||'')}</button>`}).join(' · ')}</p>
  <details><summary>${libraryText('Verziótörténet','Version history')} (${d.versions.length})</summary><div class="doc-history">${d.versions.map((v,i)=>`<div class="doc-history-row"><div><strong>v${esc(v.version)}${i===0?' · '+libraryText('aktuális','current'):''}</strong><br><span class="doc-meta">${esc(v.date)} · ${esc(v.note)}</span></div><div>${libraryFileButtons(d,v)}</div></div>`).join('')}</div></details></article>`
 }).join('')||`<p>${libraryText('Nincs a szűrésnek megfelelő dokumentum.','No matching documents.')}</p>`;
}
function libraryOpenDocument(id){
 if(!cloudSession)return;
 document.querySelector('#documentSearch').value='';document.querySelector('#documentTaskFilter').value='';libraryFilter();
 const el=document.getElementById('document-'+id);if(el){if(document.querySelector('#dlg').open)document.querySelector('#dlg').close();el.scrollIntoView({behavior:'smooth',block:'center'});el.setAttribute('tabindex','-1');el.focus({preventScroll:true});}
}
function libraryTaskPanel(id){document.querySelector('#taskDocumentPanel').innerHTML=taskDocumentMarkup(id)}
function libraryBytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function libraryDownload(id,version,index,button){
 const sessionId=cloudSession?.user?.id;if(!sessionId)return;
 const doc=libraryDocuments().find(d=>d.id===id),v=doc?.versions.find(v=>v.version===version),file=v?.files[index],secret=state.documentLibrary?.key;
 const message=document.querySelector('#documentMessage');button.disabled=true;
 try{
  if(!secret||!file||!/^documents\/sealed\/[a-z0-9-]+\/\d+(?:\.\d+)*\/[a-f0-9]{64}\.json$/.test(file.path))throw Error('Invalid record');
  message.textContent=libraryText('Letöltés előkészítése…','Preparing download…');
  const response=await fetch(new URL(file.path,location.href),{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Download failed');const sealed=await response.json();
  if(sealed.format!=='axs-aes-gcm-v1')throw Error('Invalid format');
  const key=await crypto.subtle.importKey('raw',libraryBytes(secret),{name:'AES-GCM'},false,['decrypt']);
  const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:libraryBytes(sealed.iv),additionalData:new TextEncoder().encode(file.path)},key,libraryBytes(sealed.ciphertext));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==file.sha256||data.byteLength!==file.size)throw Error('Integrity mismatch');
  if(cloudSession?.user?.id!==sessionId)throw Error('Signed out');
  const mime=file.type==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const url=URL.createObjectURL(new Blob([data],{type:mime}));const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  message.textContent=libraryText('A fájl letöltése elindult.','File download started.');
 }catch{message.textContent=libraryText('A letöltés nem sikerült. Frissítsd az oldalt, és próbáld újra.','Download failed. Refresh the page and retry.');}
 finally{button.disabled=false}
}
document.addEventListener('click',e=>{
 const link=e.target.closest('[data-document]');if(link){libraryOpenDocument(link.dataset.document);return}
 const download=e.target.closest('[data-doc-id]');if(download){libraryDownload(download.dataset.docId,download.dataset.version,Number(download.dataset.file),download);return}
 const task=e.target.closest('[data-task-link]');if(task&&cloudSession){['statusFilter','groupFilter','ownerFilter','priorityFilter'].forEach(id=>document.getElementById(id).value='');const t=state.tasks.find(t=>t.id===Number(task.dataset.taskLink));document.querySelector('#search').value=t?.['title_'+lang]||t?.title_hu||'';view='list';renderTasks();document.querySelector('.tablecard').scrollIntoView({behavior:'smooth'});}
});
document.querySelector('#documentSearch').addEventListener('input',libraryFilter);
document.querySelector('#documentTaskFilter').addEventListener('change',libraryFilter);
document.querySelector('#documentsNav').addEventListener('click',()=>document.querySelector('#documentLibrary').scrollIntoView({behavior:'smooth'}));
