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
const fxToggle     = document.getElementById('phoneFxToggle');

/* ==================== СОСТОЯНИЕ ==================== */
let current   = '';
let state     = 'idle';       // idle | ringing | playing | error
let timerId   = null;
let startedAt = 0;

/* ============================================================
   WEB AUDIO — «телефонный» фильтр
   ============================================================ */

let audioCtx       = null;
let mediaSource    = null;
let wetGain        = null;
let dryGain        = null;
let masterGain     = null;
let pipelineReady  = false;   // граф собран и работает
let pipelineFailed = false;   // один раз не получилось — больше не пробуем
let phoneFxEnabled = true;

function makeSaturationCurve(k) {
  const n = 4096;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

function initAudioPipeline() {
  if (pipelineReady || pipelineFailed) return pipelineReady;

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { pipelineFailed = true; return false; }

  try {
    audioCtx = new AC();

    // 1) Создаём ВСЕ узлы до подключений.
    mediaSource = audioCtx.createMediaElementSource(player);

    dryGain    = audioCtx.createGain();
    wetGain    = audioCtx.createGain();
    masterGain = audioCtx.createGain();

    dryGain.gain.value    = 1;
    wetGain.gain.value    = 0;
    masterGain.gain.value = 1.0;

    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = 0.7;

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.7;

    const peak = audioCtx.createBiquadFilter();
    peak.type = 'peaking'; peak.frequency.value = 1200;
    peak.Q.value = 0.9; peak.gain.value = 5;

    const peak2 = audioCtx.createBiquadFilter();
    peak2.type = 'peaking'; peak2.frequency.value = 2500;
    peak2.Q.value = 1.2; peak2.gain.value = 3;

    const shaper = audioCtx.createWaveShaper();
    shaper.curve = makeSaturationCurve(3.5);
    shaper.oversample = '4x';

    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value      = 22;
    comp.ratio.value     = 5;
    comp.attack.value    = 0.004;
    comp.release.value   = 0.18;

    const wetTrim = audioCtx.createGain();
    wetTrim.gain.value = 0.85;

    // 2) Соединяем всё. После этого шага откатываться некуда —
    //    поэтому любые ошибки уже позади.
    mediaSource.connect(dryGain);
    mediaSource.connect(hp);
    hp.connect(lp);
    lp.connect(peak);
    peak.connect(peak2);
    peak2.connect(shaper);
    shaper.connect(comp);
    comp.connect(wetTrim);
    wetTrim.connect(wetGain);

    dryGain.connect(masterGain);
    wetGain.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    pipelineReady = true;
    console.log('[audio] pipeline ready, state =', audioCtx.state);
    return true;

  } catch (e) {
    console.error('[audio] init failed:', e);
    pipelineFailed = true;

    // Аварийное спасение: если mediaSource удалось создать,
    // вернём звук напрямую в колонки.
    try {
      if (mediaSource && audioCtx) {
        mediaSource.disconnect();
        mediaSource.connect(audioCtx.destination);
        console.log('[audio] fallback: mediaSource → destination');
      }
    } catch (_) {}
    return false;
  }
}

/* Разбудить контекст. Вызываем на первом же жесте пользователя. */
function unlockAudio() {
  if (!pipelineReady && !pipelineFailed) initAudioPipeline();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('[audio] resumed, state =', audioCtx.state);
    }).catch(err => console.warn('[audio] resume failed:', err));
  }
}

/* Гарантировать, что контекст «running» перед play() */
async function ensureAudioReady() {
  if (!pipelineReady && !pipelineFailed) initAudioPipeline();
  if (audioCtx && audioCtx.state !== 'running') {
    try { await audioCtx.resume(); } catch (e) { console.warn(e); }
  }
}

function applyFx(shouldApply) {
  if (!pipelineReady) return;
  const wet = (shouldApply && phoneFxEnabled) ? 1 : 0;
  const dry = wet ? 0 : 1;
  const t = audioCtx.currentTime;
  wetGain.gain.setTargetAtTime(wet, t, 0.03);
  dryGain.gain.setTargetAtTime(dry, t, 0.03);
}

fxToggle.addEventListener('change', () => {
  phoneFxEnabled = fxToggle.checked;
  if (state === 'playing') applyFx(true);
});

/* Разблокировка аудио на самом первом взаимодействии.
   capture: true, чтобы успеть раньше остальных хендлеров. */
document.addEventListener('pointerdown', unlockAudio, true);
document.addEventListener('keydown',     unlockAudio, true);

/* ============================================================
   Часы / номер / экраны
   ============================================================ */

function updateClock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const el = document.getElementById('clock');
  if (el) el.textContent = `${hh}:${mm}`;
}
updateClock();
setInterval(updateClock, 30_000);

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

function showScreen(name) {
  if (name === 'call') {
    dialerScreen.classList.add('is-hidden');
    callScreen.classList.remove('is-hidden');
  } else {
    callScreen.classList.add('is-hidden');
    dialerScreen.classList.remove('is-hidden');
  }
}

/* ============================================================
   Ввод
   ============================================================ */

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

/* ============================================================
   Воспроизведение
   ============================================================ */

/* Асинхронная: сначала дождёмся «running» контекста, потом play() */
async function play(src, onEnded, useFx = false) {
  await ensureAudioReady();

  player.pause();
  player.currentTime = 0;
  player.src = src;
  player.onended = onEnded || null;

  if (pipelineReady) applyFx(useFx);

  try {
    await player.play();
  } catch (err) {
    console.error('[audio] play() rejected:', err);
    callStatus.textContent = 'Ошибка воспроизведения';
  }
}

function startTimer() {
  stopTimer();
  startedAt = Date.now();
  callTimer.textContent = '00:00';
  timerId = setInterval(() => {
    const s  = Math.floor((Date.now() - startedAt) / 1000);
    const m  = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    callTimer.textContent = `${m}:${ss}`;
  }, 500);
}
function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

/* ============================================================
   Звонок
   ============================================================ */

function makeCall() {
  if (state !== 'idle') return;

  // Разбудим контекст ещё раз — на всякий случай
  unlockAudio();

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
    callScreen.dataset.state = 'ringing';
    callName.textContent     = 'Неизвестный номер';
    callNumber.textContent   = current;
    callStatus.textContent   = 'Соединение…';
    callStatus.style.color   = '';
    callTimer.textContent    = '';

    play(SOUNDS.error, () => {
      callScreen.dataset.state = 'error';
      callStatus.textContent   = 'Данный вид связи недоступен';
      callStatus.style.color   = 'var(--red)';
      setTimeout(reset, 2200);
    }, false);
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
    state = 'playing';
    callScreen.dataset.state = 'playing';
    callStatus.textContent   = 'Разговор';
    startTimer();

    play(entry.file, () => {
      callStatus.textContent = 'Вызов завершён';
      stopTimer();
      setTimeout(reset, 1200);
    }, true);   // ← телефонный эффект только для записи разговора
  }, false);
}

/* ============================================================
   Сброс
   ============================================================ */

function reset() {
  state = 'idle';
  stopTimer();

  player.onended = null;
  player.pause();
  player.currentTime = 0;
  player.removeAttribute('src');
  player.load();

  if (pipelineReady) applyFx(false);

  callScreen.dataset.state = '';
  callStatus.style.color   = '';
  callStatus.textContent   = 'Соединение…';
  callTimer.textContent    = '';

  current = '';
  renderNumber();
  showScreen('dialer');
}

/* ============================================================
   Хендлеры
   ============================================================ */
callBtn.addEventListener('click', makeCall);
hangupBtn.addEventListener('click', reset);