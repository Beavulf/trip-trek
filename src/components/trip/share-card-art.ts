// Генераторы художественных карточек поездки на Canvas.
// Каждый вариант — самостоятельная визуальная метафора (билет, поляроид, чек, карта).
// Все размеры — под экспорт в соцсети: 1080×1920 сторис, 1080×1350 лента 4:5, 1080×1080 квадрат.

export interface CardCity {
  name: string;
  days: number;
}

export interface CardData {
  title: string;
  emoji: string;
  accent: string;
  destination: string;
  cities: CardCity[];
  dateLabel: string;
  totalDays: number;
  visited: number;
  totalPlaces: number;
  photos: number;
  spent: number;
  /** Символ валюты поездки — траты на карточке не всегда в долларах */
  currencySymbol: string;
  members: { emoji: string; color: string; name: string }[];
  progress: number;
  inviteCode: string;
}

export interface CardVariant {
  id: "story" | "ticket" | "polaroid" | "receipt" | "route";
  label: string;
  tag: string;
  emoji: string;
  width: number;
  height: number;
  render: (ctx: CanvasRenderingContext2D, d: CardData) => void;
}

const MONO = '"Courier New", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const SCRIPT = '"Segoe Script", "Bradley Hand", "Snell Roundhand", cursive';

// ---------- общие помощники ----------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let lineCount = 0;
  for (const word of words) {
    const testLine = line + word + " ";
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = word + " ";
      lineCount++;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y + lineCount * lineHeight);
  return lineCount + 1;
}

// Текст с ручным трекингом (ctx.letterSpacing поддерживается не везде)
function drawTracked(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = "center";
}

function dashedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, dash = [10, 10], color = "rgba(0,0,0,0.25)", width = 2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// Детерминированный «штрихкод» из строки
function barcode(ctx: CanvasRenderingContext2D, seed: string, x: number, y: number, w: number, h: number, color = "#1c1917") {
  let acc = 0;
  for (let i = 0; i < seed.length; i++) acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    acc = (acc * 1103515245 + 12345) >>> 0;
    return (acc >>> 8) / 0x1000000;
  };
  ctx.save();
  ctx.fillStyle = color;
  let cx = x;
  while (cx < x + w - 6) {
    const bw = 2 + Math.floor(rand() * 6);
    ctx.fillRect(cx, y, bw, h);
    cx += bw + 2 + Math.floor(rand() * 5);
  }
  ctx.restore();
}

function darken(hex: string, factor: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full.slice(0, 6) || "f97316", 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

function clipUpper(s: string, max: number) {
  const t = s.toUpperCase();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// Русская множественная форма для подписей на canvas (либа plural сюда не тянем — файл чистый)
function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Ужать шрифт под maxWidth (длинные названия городов ломают сетку билета)
function fitFont(ctx: CanvasRenderingContext2D, text: string, basePx: number, minPx: number, maxWidth: number, font: (px: number) => string): number {
  let px = basePx;
  for (; px > minPx; px -= 4) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= maxWidth) return px;
  }
  ctx.font = font(minPx);
  return minPx;
}

// ---------- 1. Сторис 9:16 (эволюция прежней карточки) ----------

function renderStory(ctx: CanvasRenderingContext2D, d: CardData) {
  const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
  grad.addColorStop(0, d.accent);
  grad.addColorStop(0.5, "#ec4899");
  grad.addColorStop(1, "#1c1917");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.arc(900, 200, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(200, 1700, 250, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "120px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(d.emoji, 540, 200);

  ctx.fillStyle = "white";
  ctx.font = "bold 56px " + SANS;
  const titleLines = wrapText(ctx, d.title, 540, 340, 900, 64);

  // Подзаголовок сдвигаем под фактическое число строк заголовка
  const subtitleY = 340 + titleLines * 64 + 24;
  ctx.font = "32px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`${d.totalDays} ${pluralRu(d.totalDays, "день", "дня", "дней")} в пути`, 540, subtitleY);

  const dividerY = Math.max(560, subtitleY + 80);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(100, dividerY);
  ctx.lineTo(980, dividerY);
  ctx.stroke();

  const stats = [
    { icon: "📍", value: `${d.visited}/${d.totalPlaces}`, label: "мест" },
    { icon: "📸", value: `${d.photos}`, label: "фото" },
    { icon: "📔", value: `${d.members.length}`, label: pluralRu(d.members.length, "путешественник", "путешественника", "путешественников") },
    { icon: "💰", value: `${d.currencySymbol}${Math.round(d.spent).toLocaleString("ru-RU")}`, label: "потрачено" },
  ];
  const cardWidth = 420;
  const cardHeight = 200;
  const cardGap = 40;
  const startX = (1080 - cardWidth * 2 - cardGap) / 2;
  const startY = 640;

  stats.forEach((stat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (cardWidth + cardGap);
    const y = startY + row * (cardHeight + cardGap);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundRect(ctx, x, y, cardWidth, cardHeight, 24);
    ctx.fill();
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(stat.icon, x + cardWidth / 2, y + 80);
    ctx.font = "bold 44px " + SANS;
    ctx.fillStyle = "white";
    ctx.fillText(stat.value, x + cardWidth / 2, y + 145);
    ctx.font = "24px " + SANS;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(stat.label, x + cardWidth / 2, y + 175);
  });

  const members = d.members.slice(0, 5);
  ctx.font = "28px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("Участники:", 540, 1130);
  const avatarSize = 80;
  const avatarGap = 20;
  const totalAvatarWidth = members.length * (avatarSize + avatarGap) - avatarGap;
  const avatarStartX = (1080 - totalAvatarWidth) / 2;
  members.forEach((m, i) => {
    const x = avatarStartX + i * (avatarSize + avatarGap);
    const y = 1180;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(x + avatarSize / 2, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.emoji, x + avatarSize / 2, y + avatarSize / 2 + 4);
  });
  ctx.textBaseline = "alphabetic";

  const progressY = 1400;
  ctx.font = "28px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.textAlign = "center";
  ctx.fillText(`Прогресс: ${d.progress}%`, 540, progressY);
  const barX = 140;
  const barY = progressY + 30;
  const barWidth = 800;
  const barHeight = 24;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundRect(ctx, barX, barY, barWidth, barHeight, 12);
  ctx.fill();
  ctx.fillStyle = "white";
  roundRect(ctx, barX, barY, barWidth * (d.progress / 100), barHeight, 12);
  ctx.fill();

  ctx.font = "bold 36px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("TripTrek", 540, 1700);
  ctx.font = "24px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillText("Совместное путешествие", 540, 1740);
}

// ---------- 2. Билет 4:5 ----------

function renderTicket(ctx: CanvasRenderingContext2D, d: CardData) {
  const W = 1080, H = 1350;
  ctx.fillStyle = "#f6f1e7";
  ctx.fillRect(0, 0, W, H);

  // верхняя акцентная полоса
  ctx.fillStyle = d.accent;
  ctx.fillRect(0, 0, W, 14);

  ctx.textAlign = "center";
  ctx.fillStyle = "#8a8375";
  ctx.font = "28px " + MONO;
  drawTracked(ctx, "BOARDING PASS", 540, 96, 10);
  ctx.font = "24px " + MONO;
  drawTracked(ctx, "TRIP TREK AIRWAYS", 540, 134, 6);

  // эмодзи в акцентном круге
  ctx.fillStyle = d.accent;
  ctx.beginPath();
  ctx.arc(540, 248, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "64px sans-serif";
  ctx.fillText(d.emoji, 540, 268);

  // маршрут FROM -> TO (длинные названия ужать шрифтом, иначе налезают друг на друга)
  const from = clipUpper(d.cities[0]?.name || d.destination || "HOME", 14);
  const to = clipUpper(d.cities.length > 1 ? d.cities[d.cities.length - 1].name : d.destination || "★", 14);
  fitFont(ctx, from, 88, 44, 440, (px) => `bold ${px} ` + SANS);
  ctx.fillStyle = "#1c1917";
  ctx.fillText(from, 250, 470);
  fitFont(ctx, to, 88, 44, 440, (px) => `bold ${px} ` + SANS);
  ctx.fillText(to, 830, 470);

  // пунктирная дуга с самолётиком
  ctx.save();
  ctx.strokeStyle = "#b8b0a0";
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 12]);
  ctx.beginPath();
  ctx.moveTo(370, 440);
  ctx.quadraticCurveTo(540, 380, 710, 440);
  ctx.stroke();
  ctx.restore();
  ctx.font = "52px sans-serif";
  ctx.fillText("✈", 540, 420);

  ctx.fillStyle = "#6d6656";
  ctx.font = "22px " + MONO;
  ctx.fillText("FROM", 250, 510);
  ctx.fillText("TO", 830, 510);

  ctx.fillStyle = "#1c1917";
  ctx.font = "bold 40px " + SANS;
  ctx.fillText(d.dateLabel, 540, 610);

  // перфорация
  dashedLine(ctx, 60, 700, W - 60, 700, [14, 12], "rgba(0,0,0,0.22)", 2);
  ctx.font = "34px sans-serif";
  ctx.fillStyle = "#8a8375";
  ctx.fillText("✂", 44, 708);

  // инфосетка
  const cells = [
    { label: "ДАТА", value: d.dateLabel.split("—")[0].trim() || "—" },
    { label: "ДНЕЙ", value: String(d.totalDays) },
    { label: "ГОРОДОВ", value: String(d.cities.length) },
    { label: "ПАССАЖИРЫ", value: String(d.members.length) },
  ];
  const colW = (W - 120) / 4;
  cells.forEach((c, i) => {
    const cx = 60 + colW * i + colW / 2;
    if (i > 0) dashedLine(ctx, 60 + colW * i, 760, 60 + colW * i, 900, [6, 8], "rgba(0,0,0,0.12)", 2);
    ctx.fillStyle = "#8a8375";
    ctx.font = "22px " + MONO;
    ctx.fillText(c.label, cx, 800);
    fitFont(ctx, c.value, 38, 22, colW - 18, (px) => `bold ${px} ` + SANS);
    ctx.fillStyle = "#1c1917";
    ctx.fillText(c.value, cx, 860);
  });

  // маршрутная строка: города через стрелки (не влезает — укорачиваем список, потом шрифт)
  ctx.fillStyle = "#6d6656";
  const routeStrFor = (n: number) =>
    d.cities.slice(0, n).map((c) => c.name).join(" → ") + (d.cities.length > n ? " → …" : "");
  let routeN = Math.min(d.cities.length, 4);
  const routePx = 26;
  for (; routeN > 1; routeN--) {
    ctx.font = `${routePx} ` + MONO;
    if (ctx.measureText(routeStrFor(routeN).toUpperCase()).width <= W - 160) break;
  }
  ctx.font = `${routePx} ` + MONO;
  ctx.fillText(routeStrFor(routeN).toUpperCase(), 540, 960);

  // отрывная часть
  dashedLine(ctx, 60, 1030, W - 60, 1030, [14, 12], "rgba(0,0,0,0.22)", 2);

  ctx.fillStyle = "#1c1917";
  fitFont(ctx, d.title, 44, 24, W - 160, (px) => `bold ${px} ` + SANS);
  ctx.fillText(d.title, 540, 1105);
  ctx.fillStyle = "#8a8375";
  ctx.font = "24px " + MONO;
  drawTracked(ctx, `FLIGHT TT-${(d.inviteCode || "000000").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`, 540, 1145, 4);

  barcode(ctx, d.inviteCode || d.title, 190, 1180, 700, 100, "#1c1917");
  ctx.fillStyle = "#8a8375";
  ctx.font = "22px " + MONO;
  ctx.fillText(d.inviteCode.toUpperCase(), 540, 1310);
}

// ---------- 3. Поляроид 1:1 ----------

function renderPolaroid(ctx: CanvasRenderingContext2D, d: CardData) {
  const W = 1080, H = 1080;
  ctx.fillStyle = "#ddd6c7";
  ctx.fillRect(0, 0, W, H);

  // мягкие тени «стола»
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  ctx.beginPath();
  ctx.arc(140, 950, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(960, 120, 180, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(540, 540);
  ctx.rotate(-0.028);

  // корпус полариоида с тенью
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(-470, -470, 940, 940);
  ctx.restore();

  // «фото» — дуотон из акцентного цвета
  const photoX = -420, photoY = -420, photoW = 840, photoH = 640;
  const grad = ctx.createLinearGradient(photoX, photoY, photoX + photoW, photoY + photoH);
  grad.addColorStop(0, darken(d.accent, 1.05));
  grad.addColorStop(1, darken(d.accent, 0.35));
  ctx.fillStyle = grad;
  ctx.fillRect(photoX, photoY, photoW, photoH);

  // зерно-полоски как у плёнки
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(photoX, photoY + (photoH / 6) * i + 14, photoW, 3);
  }

  // дата в углу
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "26px " + MONO;
  ctx.fillText(d.dateLabel.toUpperCase(), photoX + 28, photoY + 44);

  // список городов по центру фото
  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.font = "bold 58px " + SANS;
  const cityLine = d.cities.slice(0, 3).map((c) => c.name).join(" · ");
  wrapText(ctx, cityLine, 0, photoY + photoH / 2 - 10, photoW - 80, 68);
  ctx.font = "30px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(
    `${d.totalDays} ${pluralRu(d.totalDays, "день", "дня", "дней")} · ${d.totalPlaces} ${pluralRu(d.totalPlaces, "место", "места", "мест")}`,
    0,
    photoY + photoH - 40
  );

  // рукописная подпись (длинный заголовок ужать, не вылезая за рамку полариоида)
  ctx.fillStyle = "#2d2a26";
  const script = (px: number) => `italic ${px} ` + SCRIPT;
  fitFont(ctx, `${d.title} ${d.emoji}`, 54, 22, 860, script);
  ctx.fillText(`${d.title} ${d.emoji}`, 0, photoY + photoH + 120);
  ctx.fillStyle = "#8a857b";
  ctx.font = "28px " + SANS;
  ctx.fillText(`с ${d.members.length} ${d.members.length === 1 ? "другом" : "друзьями"} · TripTrek`, 0, photoY + photoH + 175);

  ctx.restore();

  // скотч сверху
  ctx.save();
  ctx.translate(540, 52);
  ctx.rotate(0.05);
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(250, 230, 160, 0.85)";
  ctx.fillRect(-140, -34, 280, 68);
  ctx.restore();
}

// ---------- 4. Чек 4:5 ----------

function renderReceipt(ctx: CanvasRenderingContext2D, d: CardData) {
  const W = 1080, H = 1350;
  ctx.fillStyle = "#e9e4d8";
  ctx.fillRect(0, 0, W, H);

  // бумага с зубчатыми краями
  const px = 110, pw = W - 220, top = 46, bottom = H - 46, tooth = 22, step = 44;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#fdfcf8";
  ctx.beginPath();
  ctx.moveTo(px, top);
  for (let x = px; x < px + pw; x += step) {
    ctx.lineTo(x + step / 2, top + tooth);
    ctx.lineTo(Math.min(x + step, px + pw), top);
  }
  ctx.lineTo(px + pw, bottom);
  for (let x = px + pw; x > px; x -= step) {
    ctx.lineTo(x - step / 2, bottom - tooth);
    ctx.lineTo(Math.max(x - step, px), bottom);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  const L = px + 60, R = px + pw - 60;
  const center = px + pw / 2;
  let y = top + 100;

  ctx.fillStyle = "#1c1917";
  ctx.font = "bold 44px " + MONO;
  ctx.fillText("* TRIP TREK *", center, y);
  y += 48;
  ctx.fillStyle = "#7d776b";
  ctx.font = "26px " + MONO;
  ctx.fillText(d.dateLabel + " · КАССА №1", center, y);
  y += 46;
  dashedLine(ctx, L, y, R, y, [8, 8], "rgba(0,0,0,0.3)", 2);
  y += 56;

  ctx.textAlign = "left";
  ctx.fillStyle = "#7d776b";
  ctx.font = "26px " + MONO;
  ctx.fillText("ТОВАР", L, y);
  ctx.textAlign = "right";
  ctx.fillText("КОЛ", R, y);
  y += 22;
  dashedLine(ctx, L, y, R, y, [6, 8], "rgba(0,0,0,0.18)", 2);
  y += 56;

  // Подвал прибит к низу бумаги: штрихкод и «спасибо» не зависят от длины
  // списка, строкам городов оставляем только помещающееся место (раньше
  // 6+ городов наезжали на штрихкод)
  const barcodeY = bottom - 186;
  const thanksY = bottom - 50;
  const stackAfterCities = 8 + 54 + 4 * 54 + 10 + 64 + 56 + 78; // блок сводки до штрихкода
  const citiesLimit = barcodeY - stackAfterCities;

  ctx.font = "34px " + MONO;
  const shownCities = d.cities.slice(0, Math.max(1, Math.min(6, Math.floor((citiesLimit - y) / 58))));
  for (const c of shownCities) {
    ctx.fillStyle = "#1c1917";
    ctx.textAlign = "left";
    const name = c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name;
    ctx.fillText(`1× ${name}`, L, y);
    ctx.textAlign = "right";
    ctx.fillText(`${c.days} дн`, R, y);
    y += 58;
  }
  const hiddenCities = d.cities.length - shownCities.length;
  if (hiddenCities > 0 && y + 58 <= citiesLimit) {
    ctx.fillStyle = "#7d776b";
    ctx.textAlign = "left";
    ctx.fillText(`…и ещё ${hiddenCities} ${pluralRu(hiddenCities, "город", "города", "городов")}`, L, y);
    y += 58;
  }
  y += 8;
  dashedLine(ctx, L, y, R, y, [6, 8], "rgba(0,0,0,0.18)", 2);
  y += 54;

  const row = (label: string, value: string, bold = false) => {
    ctx.font = (bold ? "bold " : "") + "32px " + MONO;
    ctx.fillStyle = bold ? "#1c1917" : "#4d483e";
    ctx.textAlign = "left";
    ctx.fillText(label, L, y);
    ctx.textAlign = "right";
    ctx.fillText(value, R, y);
    y += 54;
  };
  row("ВСЕГО ДНЕЙ", String(d.totalDays));
  row("МЕСТ ОТМЕЧЕНО", `${d.visited}/${d.totalPlaces}`);
  row("ФОТО", String(d.photos));
  row("ПОТРАЧЕНО", `${d.currencySymbol}${Math.round(d.spent).toLocaleString("ru-RU")}`);
  y += 10;

  ctx.fillStyle = "#1c1917";
  ctx.font = "bold 46px " + MONO;
  ctx.textAlign = "left";
  ctx.fillText("ИТОГО", L, y);
  ctx.textAlign = "right";
  ctx.fillText(`${d.totalDays} ${pluralRu(d.totalDays, "ДЕНЬ", "ДНЯ", "ДНЕЙ")}`, R, y);
  y += 64;
  dashedLine(ctx, L, y, R, y, [8, 8], "rgba(0,0,0,0.3)", 2);
  y += 56;

  ctx.fillStyle = "#4d483e";
  ctx.font = "28px " + MONO;
  ctx.textAlign = "center";
  ctx.fillText("ОПЛАЧЕНО ВОСПОМИНАНИЯМИ", center, y);

  barcode(ctx, d.inviteCode || d.title, center - 300, barcodeY, 600, 86, "#1c1917");
  ctx.fillStyle = "#7d776b";
  ctx.font = "30px " + MONO;
  ctx.fillText("СПАСИБО! ЖДЁМ СНОВА ✈", center, thanksY);
}

// ---------- 5. Маршрут 4:5 ----------

function renderRoute(ctx: CanvasRenderingContext2D, d: CardData) {
  const W = 1080, H = 1350;
  ctx.fillStyle = "#0e1626";
  ctx.fillRect(0, 0, W, H);

  // сетка «координат»
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let x = 45; x < W; x += 90) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 45; y < H; y += 90) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // шапка
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "26px " + MONO;
  drawTrackedLeft(ctx, "МАРШРУТ ПОЕЗДКИ", 70, 104, 8);
  ctx.fillStyle = "white";
  ctx.font = "bold 64px " + SANS;
  const titleLines = wrapText(ctx, d.title, 70, 180, 760, 70);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "26px " + MONO;
  // дата уезжает под фактическое число строк заголовка (раньше налезала на 2-ю строку)
  ctx.fillText(d.dateLabel.toUpperCase(), 70, 180 + titleLines * 70 + 12);

  // компас
  ctx.save();
  ctx.translate(940, 160);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 54, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = d.accent;
  ctx.beginPath();
  ctx.moveTo(0, -44); ctx.lineTo(12, 8); ctx.lineTo(0, 0); ctx.lineTo(-12, 8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "bold 24px " + SANS;
  ctx.textAlign = "center";
  ctx.fillText("С", 0, -66);
  ctx.restore();

  // точки городов (в поездке без дней города нет — рисуем только шапку и статистику)
  const pts = d.cities.slice(0, 7);
  const hidden = d.cities.length - pts.length;
  // при длинном заголовке опускаем график ниже даты, чтобы не слипались
  const topY = Math.max(380, 180 + titleLines * 70 + 90), bottomY = 1150;

  if (pts.length > 0) {
    const stepY = pts.length > 1 ? (bottomY - topY) / (pts.length - 1) : 0;
    const positions = pts.map((c, i) => ({
      city: c,
      x: i % 2 === 0 ? 280 : 800,
      y: pts.length === 1 ? (topY + bottomY) / 2 : topY + stepY * i,
    }));

    ctx.save();
    ctx.strokeStyle = d.accent;
    ctx.lineWidth = 3;
    ctx.setLineDash([2, 14]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(positions[0].x, positions[0].y);
    for (let i = 1; i < positions.length; i++) {
      const a = positions[i - 1], b = positions[i];
      const mx = (a.x + b.x) / 2 + (i % 2 === 1 ? 90 : -90);
      const my = (a.y + b.y) / 2;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    positions.forEach((p, i) => {
      // свечение
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d.accent;
      ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0e1626";
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();

      const left = p.x < 540;
      ctx.textAlign = left ? "left" : "right";
      const lx = left ? p.x + 56 : p.x - 56;
      ctx.fillStyle = "white";
      ctx.font = "bold 36px " + SANS;
      ctx.fillText(p.city.name, lx, p.y - 4);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "24px " + MONO;
      ctx.fillText(`${p.city.days} ${pluralRu(p.city.days, "день", "дня", "дней")} · ${i + 1}-я точка`, lx, p.y + 32);
    });

    if (hidden > 0) {
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "28px " + MONO;
      ctx.fillText(`+${hidden} ${pluralRu(hidden, "город", "города", "городов")} дальше по пути…`, 90, bottomY + 70);
    }
  }

  // нижняя строка статистики
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(70, 1240, W - 140, 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "26px " + MONO;
  drawTracked(
    ctx,
    `${d.totalDays} ${pluralRu(d.totalDays, "ДЕНЬ", "ДНЯ", "ДНЕЙ")} · ${d.totalPlaces} ${pluralRu(d.totalPlaces, "МЕСТО", "МЕСТА", "МЕСТ")} · ${d.photos} ФОТО`,
    540,
    1294,
    3
  );
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "bold 24px " + SANS;
  ctx.fillText("TripTrek", 540, 1332);
}

function drawTrackedLeft(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const chars = [...text];
  let cx = x;
  ctx.textAlign = "left";
  chars.forEach((c) => {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  });
}

// ---------- реестр ----------

export const CARD_VARIANTS: CardVariant[] = [
  { id: "story", label: "Сторис", tag: "9:16", emoji: "📱", width: 1080, height: 1920, render: renderStory },
  { id: "ticket", label: "Билет", tag: "4:5", emoji: "🎫", width: 1080, height: 1350, render: renderTicket },
  { id: "polaroid", label: "Поляроид", tag: "1:1", emoji: "🖼️", width: 1080, height: 1080, render: renderPolaroid },
  { id: "receipt", label: "Чек", tag: "4:5", emoji: "🧾", width: 1080, height: 1350, render: renderReceipt },
  { id: "route", label: "Маршрут", tag: "4:5", emoji: "🗺️", width: 1080, height: 1350, render: renderRoute },
];

export type CardVariantId = CardVariant["id"];
