const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const elements = {
  transcript: document.querySelector('#transcript'),
  interim: document.querySelector('#interim'),
  record: document.querySelector('#recordButton'),
  hint: document.querySelector('#recordHint'),
  status: document.querySelector('#status'),
  language: document.querySelector('#language'),
  charCount: document.querySelector('#charCount'),
  wordCount: document.querySelector('#wordCount'),
  timer: document.querySelector('#timer'),
  clear: document.querySelector('#clearButton'),
  copy: document.querySelector('#copyButton'),
  download: document.querySelector('#downloadButton'),
  toast: document.querySelector('#toast'),
  modal: document.querySelector('#permissionModal'),
  closeModal: document.querySelector('#closeModal'),
};

let recognition = null;
let isListening = false;
let shouldRestart = false;
let elapsed = 0;
let timerId = null;
let saveId = null;

const replacements = {
  ' 마침표': '.', ' 쉼표': ',', ' 물음표': '?', ' 느낌표': '!',
  ' 줄바꿈': '\n', ' 새 문단': '\n\n',
};

function normalizeSpeech(text) {
  let result = ` ${text.trim()}`;
  Object.entries(replacements).forEach(([spoken, mark]) => {
    result = result.replaceAll(spoken, mark);
  });
  return result.trim();
}

function updateStats() {
  const value = elements.transcript.value;
  elements.charCount.textContent = value.length.toLocaleString('ko-KR');
  elements.wordCount.textContent = value.trim() ? value.trim().split(/\s+/).length.toLocaleString('ko-KR') : '0';
  clearTimeout(saveId);
  saveId = setTimeout(() => localStorage.setItem('malgeul-draft', value), 250);
}

function updateTimer() {
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  elements.timer.textContent = `${minutes}:${seconds}`;
}

function setListening(active) {
  isListening = active;
  elements.record.classList.toggle('active', active);
  elements.record.setAttribute('aria-label', active ? '받아쓰기 멈춤' : '받아쓰기 시작');
  elements.status.classList.toggle('listening', active);
  elements.status.lastElementChild.textContent = active ? '듣고 있어요' : '준비됐어요';
  elements.hint.textContent = active ? '말씀하세요. 문장으로 옮기고 있어요' : '버튼을 눌러 받아쓰기를 시작하세요';
  if (active && !timerId) timerId = setInterval(() => { elapsed += 1; updateTimer(); }, 1000);
  if (!active && timerId) { clearInterval(timerId); timerId = null; }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  setTimeout(() => elements.toast.classList.remove('show'), 1800);
}

function appendText(text) {
  const current = elements.transcript.value;
  const separator = current && !/\s$/.test(current) ? ' ' : '';
  elements.transcript.value = current + separator + normalizeSpeech(text);
  elements.transcript.scrollTop = elements.transcript.scrollHeight;
  updateStats();
}

function createRecognition() {
  if (!SpeechRecognition) return null;
  const instance = new SpeechRecognition();
  instance.continuous = true;
  instance.interimResults = true;
  instance.lang = elements.language.value;

  instance.onresult = (event) => {
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) appendText(text);
      else interimText += text;
    }
    elements.interim.textContent = interimText;
  };
  instance.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      shouldRestart = false;
      elements.modal.hidden = false;
    } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
      showToast('음성을 인식하지 못했어요. 다시 시도해 주세요.');
    }
  };
  instance.onend = () => {
    elements.interim.textContent = '';
    if (shouldRestart) {
      try { instance.start(); } catch (_) { setListening(false); }
    } else setListening(false);
  };
  return instance;
}

function toggleRecording() {
  if (!SpeechRecognition) {
    showToast('Chrome 또는 Edge 브라우저에서 이용해 주세요.');
    return;
  }
  if (isListening) {
    shouldRestart = false;
    recognition.stop();
    setListening(false);
    return;
  }
  recognition = createRecognition();
  shouldRestart = true;
  try { recognition.start(); setListening(true); }
  catch (_) { showToast('잠시 후 다시 시도해 주세요.'); }
}

elements.record.addEventListener('click', toggleRecording);
elements.language.addEventListener('change', () => {
  localStorage.setItem('malgeul-language', elements.language.value);
  if (isListening) { shouldRestart = false; recognition.stop(); setListening(false); showToast('언어를 바꿨어요. 다시 시작해 주세요.'); }
});
elements.transcript.addEventListener('input', updateStats);
elements.clear.addEventListener('click', () => {
  if (!elements.transcript.value || window.confirm('받아쓴 내용을 모두 지울까요?')) {
    elements.transcript.value = ''; elements.interim.textContent = ''; elapsed = 0; updateTimer(); updateStats();
  }
});
elements.copy.addEventListener('click', async () => {
  if (!elements.transcript.value) return showToast('복사할 내용이 없어요.');
  try { await navigator.clipboard.writeText(elements.transcript.value); showToast('클립보드에 복사했어요.'); }
  catch (_) { elements.transcript.select(); document.execCommand('copy'); showToast('클립보드에 복사했어요.'); }
});
elements.download.addEventListener('click', () => {
  if (!elements.transcript.value) return showToast('저장할 내용이 없어요.');
  const blob = new Blob([elements.transcript.value], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `말글_${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('텍스트 파일로 저장했어요.');
});
elements.closeModal.addEventListener('click', () => { elements.modal.hidden = true; setListening(false); });
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && event.target === document.body) { event.preventDefault(); toggleRecording(); }
});
window.addEventListener('beforeunload', () => { shouldRestart = false; if (recognition) recognition.abort(); });

elements.transcript.value = localStorage.getItem('malgeul-draft') || '';
elements.language.value = localStorage.getItem('malgeul-language') || 'ko-KR';
updateStats();

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
