const API_BASE=(window.MALGEUL_CONFIG?.apiBase||'https://generativelanguage.googleapis.com').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const el={setup:$('#setupPanel'),processing:$('#processingPanel'),result:$('#resultPanel'),title:$('#meetingTitle'),date:$('#meetingDate'),language:$('#language'),consent:$('#consentCheck'),record:$('#recordButton'),captureTitle:$('#captureTitle'),captureHint:$('#captureHint'),recordMeta:$('#recordMeta'),timer:$('#timer'),visualizer:$('#visualizer'),file:$('#audioFile'),apiStatus:$('#apiStatus'),apiKey:$('#apiKeyInput'),toggleKey:$('#toggleKeyButton'),saveKey:$('#saveKeyButton'),removeKey:$('#removeKeyButton'),toast:$('#toast'),processingTitle:$('#processingTitle'),progress:$('#progressBar'),resultTitle:$('#resultTitle'),resultMeta:$('#resultMeta'),overview:$('#summaryOverview'),keyPoints:$('#keyPoints'),decisions:$('#decisions'),actions:$('#actionItems'),speakerInputs:$('#speakerInputs'),transcript:$('#transcriptList'),copy:$('#copyButton'),download:$('#downloadButton'),newMeeting:$('#newMeetingButton')};
let recorder,stream,chunks=[],elapsed=0,timerId,progressId,currentData,speakerNames={},apiKey=localStorage.getItem('malgeul-gemini-key')||'';
localStorage.removeItem('malgeul-openai-key');
el.date.value=new Date().toISOString().slice(0,10);

function toast(m){el.toast.textContent=m;el.toast.classList.add('show');setTimeout(()=>el.toast.classList.remove('show'),2600)}
function clock(s=0){return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`}
function seconds(v){const n=Number.parseFloat(String(v||'0').replace(/s$/,''));return Number.isFinite(n)?n:0}
function esc(v=''){const d=document.createElement('div');d.textContent=String(v);return d.innerHTML}
function setRecording(on){el.record.classList.toggle('active',on);el.recordMeta.hidden=!on;el.captureTitle.textContent=on?'회의를 듣고 있어요':'마이크를 켜고 회의를 시작하세요';el.captureHint.textContent=on?'끝나면 가운데 버튼을 다시 눌러 주세요.':'회의가 끝나면 화자별 대화와 핵심 내용을 자동으로 정리해 드려요.';el.visualizer.innerHTML=on?Array.from({length:28},(_,i)=>`<i style="animation-delay:${i%7*-.09}s"></i>`).join(''):''}
function checkService(){el.apiKey.value=apiKey;el.removeKey.hidden=!apiKey;status(Boolean(apiKey),apiKey?'Gemini 준비됨':'Gemini API 키 필요')}
function status(ok,label){el.apiStatus.classList.toggle('offline',!ok);el.apiStatus.querySelector('b').textContent=label}
function ready(){if(!apiKey){toast('먼저 Gemini API 키를 저장해 주세요.');el.apiKey.focus();return false}if(!el.consent.checked){toast('참석자 녹음 동의를 확인해 주세요.');return false}return true}

async function toggle(){
  if(recorder?.state==='recording'){recorder.stop();return}
  if(!ready())return;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast('Chrome 또는 Edge 최신 버전에서 이용해 주세요.');
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    chunks=[];elapsed=0;el.timer.textContent='00:00';
    const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'';
    recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:32000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    recorder.onstop=()=>{const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});stream.getTracks().forEach(t=>t.stop());clearInterval(timerId);setRecording(false);processAudio(blob,`meeting-${Date.now()}.webm`)};
    recorder.start(1000);setRecording(true);timerId=setInterval(()=>{elapsed++;el.timer.textContent=clock(elapsed);if(elapsed>=1800&&recorder?.state==='recording'){toast('화자 분리는 최대 30분까지 지원해 녹음을 마쳤어요.');recorder.stop()}},1000);
  }catch(e){toast(e.name==='NotAllowedError'?'마이크 권한을 허용해 주세요.':'마이크를 시작하지 못했어요.')}
}

async function processAudio(blob,name){
  if(blob.size>25*1024*1024)return toast('파일은 25MB 이하만 사용할 수 있어요.');
  el.setup.hidden=true;el.result.hidden=true;el.processing.hidden=false;fakeProgress();
  let uploadedFile;
  try{
    uploadedFile=await uploadGeminiFile(blob,name);
    const transcription=await transcribe(uploadedFile);
    const minutes=await summarize(transcription,el.title.value.trim()||'새로운 회의');
    currentData={transcription,minutes};speakerNames={};
    transcription.segments.forEach(s=>speakerNames[s.speaker]||=`화자 ${s.speaker}`);
    clearInterval(progressId);el.progress.style.width='100%';render();
  }catch(e){
    clearInterval(progressId);el.processing.hidden=true;el.setup.hidden=false;
    toast(e.message||'처리 중 오류가 발생했어요.');
  }finally{
    if(uploadedFile?.name)await deleteGeminiFile(uploadedFile.name);
  }
}

function mimeFor(blob,name){
  const raw=(blob.type||'').split(';')[0].toLowerCase();
  const aliases={'audio/x-m4a':'audio/m4a','audio/mp4':'audio/m4a','audio/x-wav':'audio/wav','audio/x-aiff':'audio/aiff'};
  if(aliases[raw])return aliases[raw];
  if(raw.startsWith('audio/'))return raw;
  const ext=name.split('.').pop().toLowerCase();
  return({mp3:'audio/mp3',mpeg:'audio/mpeg',m4a:'audio/m4a',wav:'audio/wav',webm:'audio/webm',ogg:'audio/ogg',flac:'audio/flac',aac:'audio/aac',aiff:'audio/aiff'}[ext]||'audio/webm');
}

async function uploadGeminiFile(blob,name){
  const mimeType=mimeFor(blob,name);
  const start=await fetch(`${API_BASE}/upload/v1beta/files`,{method:'POST',headers:{'x-goog-api-key':apiKey,'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(blob.size),'X-Goog-Upload-Header-Content-Type':mimeType,'Content-Type':'application/json'},body:JSON.stringify({file:{display_name:name}})});
  if(!start.ok){const d=await safeJson(start);throw new Error(apiError(d,'Gemini 음성 업로드를 시작하지 못했어요.'))}
  const uploadUrl=start.headers.get('x-goog-upload-url');
  if(!uploadUrl)throw new Error('Gemini 업로드 주소를 받지 못했어요.');
  const upload=await fetch(uploadUrl,{method:'POST',headers:{'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},body:blob});
  const data=await safeJson(upload);
  if(!upload.ok)throw new Error(apiError(data,'Gemini 음성 업로드에 실패했습니다.'));
  if(!data.file?.uri)throw new Error('업로드된 음성 정보를 읽지 못했어요.');
  return data.file;
}

async function transcribe(file){
  const languageCodes={ko:['ko-KR'],en:['en-US'],ja:['ja-JP'],zh:['cmn-Hans-CN']}[el.language.value]||[];
  const r=await fetch(`${API_BASE}/v1beta/interactions`,{method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:'gemini-3.5-transcribe',input:[{type:'audio',uri:file.uri,mime_type:file.mimeType||file.mime_type}],generation_config:{transcription_config:{language_codes:languageCodes,mode:{type:'verbatim',diarization_mode:'speaker',timestamp_granularities:['word']}}}})});
  const data=await safeJson(r);
  if(!r.ok)throw new Error(apiError(data,'Gemini 화자 분리 전사에 실패했습니다.'));
  const words=[];
  for(const step of data.steps||[])for(const content of step.content||[])for(const annotation of content.annotations||[])if(annotation.type==='word_info')words.push(annotation);
  const segments=groupWords(words);
  if(!segments.length&&data.output_text)segments.push(...parseOutputText(data.output_text));
  if(!segments.length)throw new Error('음성에서 대화를 찾지 못했어요.');
  return{segments,duration:Math.max(...segments.map(s=>s.end||s.start),0),text:data.output_text||segments.map(s=>s.text).join(' ')};
}

function groupWords(words){
  const segments=[];
  for(const word of words){
    const speaker=String(word.speaker||'spk_1').replace(/^spk_/i,'');
    const start=seconds(word.start_offset),end=seconds(word.end_offset),text=String(word.text||'').trim();
    if(!text)continue;
    const last=segments.at(-1);
    if(last&&last.speaker===speaker&&start-last.end<2.5){last.text=joinWord(last.text,text);last.end=end||last.end}
    else segments.push({speaker,start,end,text});
  }
  return segments;
}

function joinWord(before,word){return/^[.,!?;:%)\]\}…。，！？、]/.test(word)?`${before}${word}`:`${before} ${word}`}
function parseOutputText(text){
  const lines=String(text).split(/\n+/).map(x=>x.trim()).filter(Boolean),segments=[];
  for(const line of lines){const m=line.match(/^\[?(?:speaker|spk|화자)[ _-]?(\w+)\]?\s*[:：-]\s*(.+)$/i);if(m)segments.push({speaker:m[1],start:0,end:0,text:m[2]})}
  return segments.length?segments:[{speaker:'1',start:0,end:0,text:String(text).trim()}];
}

async function summarize(transcription,title){
  const transcript=transcription.segments.map(s=>`[${clock(s.start)}] 화자 ${s.speaker}: ${s.text}`).join('\n');
  const prompt=`당신은 정확하고 간결한 한국어 회의록 작성자입니다. 전사에 없는 내용을 추측하지 마세요. 명시된 결정과 할 일만 추출하고, 담당자나 기한이 불명확하면 빈 문자열로 두세요. 반드시 아래 키를 가진 JSON 객체만 반환하세요: overview(문자열), key_points(문자열 배열), decisions(문자열 배열), action_items(각 항목은 task, assignee, due 문자열).\n\n회의 제목: ${title}\n\n화자 분리 전사:\n${transcript}`;
  const responseSchema={
    type:'OBJECT',
    properties:{
      overview:{type:'STRING'},
      key_points:{type:'ARRAY',items:{type:'STRING'}},
      decisions:{type:'ARRAY',items:{type:'STRING'}},
      action_items:{type:'ARRAY',items:{type:'OBJECT',properties:{task:{type:'STRING'},assignee:{type:'STRING'},due:{type:'STRING'}},required:['task','assignee','due']}}
    },
    required:['overview','key_points','decisions','action_items']
  };
  const body={contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.2,responseMimeType:'application/json',responseSchema}};
  const r=await fetch(`${API_BASE}/v1beta/models/gemini-3.8-flash:generateContent`,{method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await safeJson(r);
  if(!r.ok)throw new Error(apiError(data,'Gemini 회의 요약에 실패했습니다.'));
  const text=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
  if(!text)throw new Error('Gemini 회의록 응답을 읽지 못했어요.');
  try{return JSON.parse(text.replace(/^```json\s*|\s*```$/g,''))}catch{throw new Error('Gemini 회의록 형식을 읽지 못했어요.')}
}

async function deleteGeminiFile(name){try{await fetch(`${API_BASE}/v1beta/${String(name).replace(/^\//,'')}`,{method:'DELETE',headers:{'x-goog-api-key':apiKey}})}catch{}}
async function safeJson(response){try{return await response.json()}catch{return{}}}
function apiError(data,fallback){return String(data?.error?.message||fallback).slice(0,240)}
function fakeProgress(){let p=7;el.progress.style.width=`${p}%`;const labels=['Gemini로 음성을 보내고 있어요','목소리를 구분하고 있어요','핵심 내용과 할 일을 정리해요'];progressId=setInterval(()=>{p=Math.min(90,p+Math.max(1,(92-p)*.055));el.progress.style.width=`${p}%`;const step=p<35?0:p<72?1:2;el.processingTitle.textContent=labels[step];document.querySelectorAll('.process-steps span').forEach((x,i)=>x.classList.toggle('active',i<=step))},700)}
function list(target,items,empty){target.innerHTML=(items?.length?items:[empty]).map(x=>`<li>${esc(x)}</li>`).join('')}
function render(){const{minutes:m,transcription:t}=currentData;el.resultTitle.textContent=el.title.value.trim()||'회의록';el.resultMeta.textContent=`${el.date.value} · 화자 ${Object.keys(speakerNames).length}명${t.duration?` · ${clock(t.duration)}`:''}`;el.overview.textContent=m.overview||'회의 요약이 없습니다.';list(el.keyPoints,m.key_points,'추출된 핵심 논의가 없습니다.');list(el.decisions,m.decisions,'명확하게 결정된 사항이 없습니다.');el.actions.innerHTML=(m.action_items?.length?m.action_items:[{task:'추출된 할 일이 없습니다.',assignee:'-',due:'-'}]).map(x=>`<div class="action-row"><strong>${esc(x.task)}</strong><span>담당 ${esc(x.assignee||'-')}</span><span>기한 ${esc(x.due||'-')}</span></div>`).join('');renderSpeakers();renderTranscript();setTimeout(()=>{el.processing.hidden=true;el.result.hidden=false;el.result.scrollIntoView({behavior:'smooth'})},450)}
function renderSpeakers(){el.speakerInputs.innerHTML=Object.entries(speakerNames).map(([id,name],i)=>`<label class="speaker-name"><i>${esc(id)}</i><input data-speaker="${esc(id)}" value="${esc(name)}" aria-label="화자 ${i+1} 이름"></label>`).join('');el.speakerInputs.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{speakerNames[input.dataset.speaker]=input.value||`화자 ${input.dataset.speaker}`;renderTranscript()}))}
function renderTranscript(){const order=Object.keys(speakerNames);el.transcript.innerHTML=currentData.transcription.segments.map(s=>`<article class="utterance" data-speaker-index="${order.indexOf(s.speaker)%3}"><div class="avatar">${esc(s.speaker)}</div><div><div class="utterance-head"><strong>${esc(speakerNames[s.speaker]||s.speaker)}</strong><time>${clock(s.start)}</time></div><p>${esc(s.text)}</p></div></article>`).join('')}
function markdown(){if(!currentData)return'';const m=currentData.minutes,lines=[`# ${el.title.value.trim()||'회의록'}`,'',`- 날짜: ${el.date.value}`,`- 참석 화자: ${Object.values(speakerNames).join(', ')}`,'','## 회의 요약','',m.overview||'','','## 핵심 논의',...(m.key_points||[]).map(x=>`- ${x}`),'','## 결정 사항',...(m.decisions||[]).map(x=>`- ${x}`),'','## 할 일',...(m.action_items||[]).map(x=>`- [ ] ${x.task} — 담당: ${x.assignee||'-'}, 기한: ${x.due||'-'}`),'','## 전체 대화',''];currentData.transcription.segments.forEach(s=>lines.push(`**${speakerNames[s.speaker]||s.speaker}** · ${clock(s.start)}  `,s.text,''));return lines.join('\n')}

document.querySelectorAll('.result-tabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.result-tabs button').forEach(x=>x.classList.toggle('active',x===b));$('#summaryTab').hidden=b.dataset.tab!=='summary';$('#transcriptTab').hidden=b.dataset.tab!=='transcript'}));
el.toggleKey.addEventListener('click',()=>{const show=el.apiKey.type==='password';el.apiKey.type=show?'text':'password';el.toggleKey.textContent=show?'숨김':'보기'});
el.saveKey.addEventListener('click',()=>{const value=el.apiKey.value.trim();if(value.length<20||/\s/.test(value))return toast('올바른 Gemini API 키를 입력해 주세요.');apiKey=value;localStorage.setItem('malgeul-gemini-key',apiKey);el.apiKey.type='password';el.toggleKey.textContent='보기';el.removeKey.hidden=false;status(true,'Gemini 준비됨');toast('이 브라우저에만 키를 저장했어요.')});
el.removeKey.addEventListener('click',()=>{apiKey='';localStorage.removeItem('malgeul-gemini-key');el.apiKey.value='';el.removeKey.hidden=true;status(false,'Gemini API 키 필요');toast('브라우저에서 키를 삭제했어요.')});
el.record.addEventListener('click',toggle);el.file.addEventListener('change',()=>{const f=el.file.files[0];if(f&&ready())processAudio(f,f.name);el.file.value=''});
el.copy.addEventListener('click',async()=>{await navigator.clipboard.writeText(markdown());toast('회의록을 복사했어요.')});
el.download.addEventListener('click',()=>{const u=URL.createObjectURL(new Blob([markdown()],{type:'text/markdown;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=`${(el.title.value.trim()||'회의록').replace(/[\\/:*?"<>|]/g,'-')}.md`;a.click();URL.revokeObjectURL(u)});
el.newMeeting.addEventListener('click',()=>{currentData=null;el.result.hidden=true;el.setup.hidden=false;scrollTo({top:0,behavior:'smooth'})});
window.addEventListener('beforeunload',()=>{stream?.getTracks().forEach(t=>t.stop())});
if('serviceWorker'in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
checkService();
