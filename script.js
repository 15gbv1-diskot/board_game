/* ==================== DOM ==================== */
const dialerScreen = document.getElementById('dialerScreen');
const callScreen   = document.getElementById('callScreen');
const dialedNumber = document.getElementById('dialedNumber');
const backspaceBtn = document.getElementById('backspaceBtn');
const callBtn      = document.getElementById('callBtn');
const hangupBtn    = document.getElementById('hangupBtn');
const callName     = document.getElementById('callName');
const callNumber   = document.getElementById('callNumber');
const callStatus   = document.getElementById('callStatus');
const callTimer    = document.getElementById('callTimer');
const player       = document.getElementById('player');

/* ==================== СОСТОЯНИЕ ==================== */
let current = '';
let state   = 'idle';        // idle | ringing | playing | error
let timerId = null;
let startedAt = 0;

/* ==================== ЧАСЫ ==================== */
function updateClock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const el = document.getElementById('clock');
  if (el) el.textContent = `${hh}:${mm}`;
}
updateClock();
setInterval(updateClock, 30_000);

/* ==================== ОТОБРАЖЕНИЕ НОМЕРА ==================== */
function renderNumber() {
  const len = current.length;
  const size = len > 12 ? 20 : len > 9 ? 24 : 32;
  dialedNumber.style.fontSize = size + 'px';

  if (!current) {
    dialedNumber.innerHTML = '<span class="placeholder">Введите номер</span>';
    backspaceBtn.hidden = true;
  } else {
    dialedNumber.textContent = current;
    backspaceBtn.hidden = false;
  }
}
renderNumber();

/* ==================== ЭКРАНЫ ==================== */
function showScreen(name) {
  if (name === 'call') {
    dialerScreen.classList.add('is-hidden');
    callScreen.classList.remove('is-hidden');
  } else {
    callScreen.classList.add('is-hidden');
    dialerScreen.classList.remove('is-hidden');
  }
}

/* ==================== ВВОД ==================== */
function press(k) {
  if (state !== 'idle') return;
  if (current.length >= 15) return;
  current += k;
  renderNumber();
}

document.getElementById('keypad').addEventListener('click', e => {
  const btn = e.target.closest('.key');
  if (btn) press(btn.dataset.key);
});

backspaceBtn.addEventListener('click', () => {
  current = current.slice(0, -1);
  renderNumber();
});

document.addEventListener('keydown', e => {
  if (state !== 'idle') {
    if (e.key === 'Escape') reset();
    return;
  }
  if (/^[0-9*#]$/.test(e.key)) press(e.key);
  if (e.key === 'Enter')  makeCall();
  if (e.key === 'Escape') reset();
  if (e.key === 'Backspace') {
    current = current.slice(0, -1);
    renderNumber();
  }
});

/* ==================== АУДИО ==================== */
function play(src, onEnded) {
  player.pause();
  player.currentTime = 0;
  player.src = src;
  player.onended = onEnded || null;

  const p = player.play();
  if (p && p.catch) p.catch(err => {
    console.error('Audio error:', err);
    callStatus.textContent = 'Ошибка воспроизведения';
  });
}

/* ==================== ТАЙМЕР ==================== */
function startTimer() {
  stopTimer();
  startedAt = Date.now();
  callTimer.textContent = '00:00';
  timerId = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    callTimer.textContent = `${m}:${ss}`;
  }, 500);
}
function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

/* ==================== ЗВОНОК ==================== */
function makeCall() {
  if (state !== 'idle') return;

  // пустой номер — тряска
  if (!current) {
    dialedNumber.classList.add('shake');
    setTimeout(() => dialedNumber.classList.remove('shake'), 420);
    return;
  }

  const entry = NUMBERS[current];

  /* --- неизвестный номер --- */
  if (!entry) {
    state = 'error';
    showScreen('call');
    callScreen.dataset.state  = 'ringing';
    callName.textContent      = 'Неизвестный номер';
    callNumber.textContent    = current;
    callStatus.textContent    = 'Соединение…';
    callStatus.style.color    = '';
    callTimer.textContent     = '';

    play(SOUNDS.error, () => {
      callScreen.dataset.state = 'error';
      callStatus.textContent   = 'Данный вид связи недоступен';
      callStatus.style.color   = 'var(--red)';
      setTimeout(reset, 2200);
    });
    return;
  }

  /* --- известный номер --- */
  state = 'ringing';
  showScreen('call');
  callScreen.dataset.state = 'ringing';
  callName.textContent     = entry.title || 'Абонент';
  callNumber.textContent   = current;
  callStatus.textContent   = 'Соединение…';
  callStatus.style.color   = '';
  callTimer.textContent    = '';

  play(SOUNDS.ringback, () => {
    // гудки закончились → включаем запись разговора
    state = 'playing';
    callScreen.dataset.state = 'playing';
    callStatus.textContent   = 'Разговор';
    startTimer();

    play(entry.file, () => {
      callStatus.textContent = 'Вызов завершён';
      stopTimer();
      setTimeout(reset, 1200);
    });
  });
}

/* ==================== СБРОС ==================== */
function reset() {
  state = 'idle';
  stopTimer();

  player.onended = null;
  player.pause();
  player.currentTime = 0;
  player.removeAttribute('src');
  player.load();

  callScreen.dataset.state = '';
  callStatus.style.color   = '';
  callStatus.textContent   = 'Соединение…';
  callTimer.textContent    = '';

  current = '';
  renderNumber();
  showScreen('dialer');
}

/* ==================== ХЕНДЛЕРЫ ==================== */
callBtn.addEventListener('click', makeCall);
hangupBtn.addEventListener('click', reset);

/* Разрешаем повторный набор после завершения звонка */
window.addEventListener('blur', () => { /* no-op */ });