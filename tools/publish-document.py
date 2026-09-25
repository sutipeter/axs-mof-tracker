#!/usr/bin/env python3
"""Append a protected document version. Requires Python cryptography and authenticated gh."""
import argparse,base64,copy,getpass,hashlib,json,re,secrets,subprocess,time,urllib.request,urllib.error
from pathlib import Path
from datetime import datetime,timezone
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
URL='https://fuqgyfpgmhfivkaaljcm.supabase.co'
KEY='sb_publishable_vx1lB6ImgwjxUb4JazjXXQ_bA0H8qXj'
REPO='sutipeter/axs-mof-tracker'
def version(s):
 if not re.fullmatch(r'\d+(?:\.\d+)*',s): raise ValueError('Use a numeric version, e.g. 1.2')
 return tuple(map(int,s.split('.')))
def run():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('file',type=Path);p.add_argument('--document-id',required=True);p.add_argument('--version',required=True);p.add_argument('--note',required=True);p.add_argument('--title');p.add_argument('--language',choices=['hu','en']);p.add_argument('--task-ids',help='Comma-separated IDs for a new document');args=p.parse_args()
 if not re.fullmatch('[a-z0-9-]+',args.document_id):p.error('Invalid document ID')
 version(args.version)
 if args.file.suffix.lower() not in ('.docx','.pdf'):p.error('Only DOCX/PDF supported')
 raw=args.file.read_bytes()
 if not raw or len(raw)>20*1024*1024:p.error('File must be between 1 byte and 20 MiB')
 email=input('Tracker username or email: ').strip()
 if email.lower()=='axs-project':email='sutipeter+axs-project@gmail.com'
 password=getpass.getpass('Tracker password: ')
 def request(path,body=None,token=None):
  headers={'apikey':KEY,'Content-Type':'application/json'}
  if token:headers['Authorization']='Bearer '+token
  req=urllib.request.Request(URL+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
  with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
 auth=request('/auth/v1/token?grant_type=password',{'email':email,'password':password});password=None;token=auth['access_token']
 row=request('/rest/v1/axs_dashboard?id=eq.1&select=*',token=token)[0];payload=copy.deepcopy(row['payload']);library=payload['documentLibrary'];docs=library['documents'];doc=next((d for d in docs if d['id']==args.document_id),None)
 if doc:
  if version(args.version)<=max(version(v['version']) for v in doc['versions']):raise ValueError('Version must be newer; existing versions are immutable')
 else:
  if not args.title or not args.language or not args.task_ids:p.error('New documents need --title, --language, --task-ids')
  ids=sorted(set(map(int,args.task_ids.split(','))));valid={t['id'] for t in payload['tasks']}
  if not ids or not set(ids)<=valid:raise ValueError('Unknown task ID')
  doc={'id':args.document_id,'title':args.title,'language':args.language,'taskIds':ids,'versions':[]};docs.append(doc)
 sha=hashlib.sha256(raw).hexdigest();path=f'documents/sealed/{args.document_id}/{args.version}/{sha}.json';iv=secrets.token_bytes(12)
 cipher=AESGCM(base64.b64decode(library['key'])).encrypt(iv,raw,path.encode());sealed=json.dumps({'format':'axs-aes-gcm-v1','iv':base64.b64encode(iv).decode(),'ciphertext':base64.b64encode(cipher).decode()},separators=(',',':')).encode()
 # Only encrypted bytes go to the public GitHub API. Existing content must match before reuse.
 endpoint=f'repos/{REPO}/contents/{path}'
 existing=subprocess.run(['gh','api',endpoint],capture_output=True,text=True)
 if existing.returncode==0:
  e=json.loads(existing.stdout);old=json.loads(base64.b64decode(e['content']));recovered=AESGCM(base64.b64decode(library['key'])).decrypt(base64.b64decode(old['iv']),base64.b64decode(old['ciphertext']),path.encode())
  if recovered!=raw:raise ValueError('Existing path contains different data')
 else:
  if '404' not in existing.stderr:raise RuntimeError('GitHub access failed')
  body=json.dumps({'message':f'Add document {args.document_id} version {args.version}','content':base64.b64encode(sealed).decode(),'branch':'main'})
  subprocess.run(['gh','api','--method','PUT',endpoint,'--input','-'],input=body,text=True,stdout=subprocess.DEVNULL,check=True)
 # Verify Pages serves the encrypted file before exposing its catalogue link.
 for attempt in range(36):
  try:
   with urllib.request.urlopen('https://sutipeter.github.io/axs-mof-tracker/'+path,timeout=20) as r:remote=json.load(r)
   verified=AESGCM(base64.b64decode(library['key'])).decrypt(base64.b64decode(remote['iv']),base64.b64decode(remote['ciphertext']),path.encode())
   if verified!=raw:raise ValueError('Remote file verification failed')
   break
  except urllib.error.HTTPError as e:
   if e.code!=404:raise
   if attempt==35:raise RuntimeError('Pages pending; rerun after deployment')
   time.sleep(10)
 doc['versions'].insert(0,{'version':args.version,'date':datetime.now(timezone.utc).date().isoformat(),'note':args.note,'status':'draft','files':[{'name':args.file.name,'path':path,'sha256':sha,'size':len(raw),'type':args.file.suffix.lower()[1:]}]})
 for t in payload['tasks']:t['documentIds']=[d['id'] for d in docs if t['id'] in d['taskIds']]
 if len(json.dumps(payload).encode())>1900000:raise ValueError('Catalogue exceeds dashboard capacity')
 try:saved=request('/rest/v1/rpc/axs_save',{'expected_revision':row['revision'],'new_payload':payload},token)
 except urllib.error.HTTPError:raise RuntimeError('Catalogue not saved; reload and rerun. No concurrent edits were overwritten.') from None
 print(f"Published {args.document_id} v{args.version}; dashboard revision {saved['revision']}")
if __name__=='__main__':run()
