const displayEl = document.getElementById('display');
const statusEl  = document.getElementById('status');
const player    = document.getElementById('player');

let current = '';        // набираемый номер
let state   = 'idle';    // idle | ringing | playing | error
let nextSrc = null;      // что играть после гудка (или null)

function render() {
  displayEl.textContent = current || '—';
}

function setStatus(text, color = '#7CFC00') {
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function press(key) {
  if (state !== 'idle') return;      // нельзя набирать во время звонка
  if (current.length >= 15) return;
  current += key;
  render();
}

/* ---------- Ввод ---------- */
document.querySelectorAll('.keypad button').forEach(btn => {
  btn.addEventListener('click', () => press(btn.dataset.key));
});

document.addEventListener('keydown', e => {
  if (/^[0-9*#]$/.test(e.key)) press(e.key);
  if (e.key === 'Enter')  makeCall();
  if (e.key === 'Escape') reset();
  if (e.key === 'Backspace' && state === 'idle') {
    current = current.slice(0, -1);
    render();
  }
});

/* ---------- Управление воспроизведением ---------- */

// Единая точка запуска аудио
function play(src, onEnded) {
  player.onended = null;
  player.pause();
  player.currentTime = 0;
  player.src = src;
  nextSrc = null;

  player.onended = onEnded || null;

  player.play().catch(err => {
    console.error(err);
    setStatus('Ошибка загрузки аудио', '#ff5555');
    state = 'idle';
  });
}

/* ---------- Звонок ---------- */

function makeCall() {
  if (state !== 'idle') return;

  if (!current) {
    setStatus('Введите номер', '#ffcc00');
    return;
  }

  const entry = NUMBERS[current];

  if (!entry) {
    // Несуществующий номер
    state = 'error';
    setStatus('Соединение...', '#ffcc00');
    play(SOUNDS.error, () => {
      setStatus('Данный вид связи недоступен', '#ff5555');
      state = 'idle';
    });
    return;
  }

  // Существующий номер: сначала гудки, потом запись
  state = 'ringing';
  setStatus('Соединение...', '#ffcc00');

  play(SOUNDS.ringback, () => {
    // гудки закончились — играем запись
    state = 'playing';
    setStatus('● ' + (entry.title || 'Разговор'), '#7CFC00');
    play(entry.file, () => {
      setStatus('Вызов завершён');
      setTimeout(reset, 800);
    });
  });
}

/* ---------- Сброс ---------- */

function reset() {
  state = 'idle';
  nextSrc = null;
  current = '';

  player.onended = null;
  player.pause();
  player.currentTime = 0;
  player.removeAttribute('src');

  render();
  setStatus('Готов');
}

/* ---------- Кнопки ---------- */
document.getElementById('call').addEventListener('click', makeCall);
document.getElementById('reset').addEventListener('click', reset);

render();