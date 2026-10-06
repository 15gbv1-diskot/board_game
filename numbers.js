// numbers.js

// Звуки системных гудков
const SOUNDS = {
  ringback: "audio/true_call.mp3",   // успешное соединение
  error:    "audio/false_call.mp3"   // недоступный номер
};

// Реестр номеров. Ключ = номер, значение = файл и название.
const NUMBERS = {
  "123456": { file: "audio/num_123456.mp3", title: "Служба поддержки" },
  "654321":    { file: "audio/num_019283.mp3",    title: "Мы не знаем что это" },
  "777":    { file: "audio/num_777.mp3",    title: "Диспетчер" },
  "0000":    { file: "audio/num_0000.mp3",    title: "Неизвестный" },
  "*100#":    { file: "audio/num_01d3en9g1.mp3",    title: "Баланс" },
  "#111":    { file: "audio/num_te11m4.mp3",    title: "Tell me why" },
  "#112":    { file: "audio/num_te11m4.mp3",    title: "***" }

  // Добавляешь новый номер сюда и кладёшь mp3 в audio/
};