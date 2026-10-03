// Генераторы художественных карточек поездки на Canvas.
// Каждый вариант — самостоятельная визуальная метафора (билет, поляроид, чек, карта).
// Все размеры — под экспорт в соцсети: 1080×1920 сторис, 1080×1350 лента 4:5, 1080×1080 квадрат.
//
// Анимация: render() принимает фазу t ∈ [0,1) — один цикл карточки. Все движения
// периодичны с периодом 1 (sin/cos, окна через win()), поэтому зацикленный GIF
// играет бесшовно. Палитра каждого варианта выводится из акцента поездки (d.accent),
// никаких жёстко зашитых «вторым цветом» оттенков. Статичный PNG рендерится
// на фазе posterT — момент, когда все появления доиграли, а «проходящие» блики
// (шиммер, скан) ещё не начались.

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
  /** Длительность одного цикла анимации, мс */
  loopMs: number;
  /** Фаза для статичного PNG: появления доиграли, проходящие блики ещё не видны */
  posterT: number;
  render: (ctx: CanvasRenderingContext2D, d: CardData, t: number) => void;
}

const MONO = '"Courier New", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const SCRIPT = '"Segoe Script", "Bradley Hand", "Snell Roundhand", cursive';
const TWO_PI = Math.PI * 2;

// ---------- цвет: работаем с [r,g,b], наружу — строки rgba ----------

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full.slice(0, 6) || "f97316", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const css = (c: Rgb, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Смешать два цвета, k — доля второго */
function mix(a: Rgb, b: Rgb, k: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

/** k > 0 — к белому, k < 0 — к чёрному */
function shade(c: Rgb, k: number): Rgb {
  return k >= 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k);
}

/** Сдвиг оттенка на deg градусов — даёт «второй цвет» палитры из любого акцента */
function hueShift(c: Rgb, deg: number): Rgb {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const dd = max - min;
    s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    if (max === r) h = ((g - b) / dd + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / dd + 2) / 6;
    else h = ((r - g) / dd + 4) / 6;
  }
  h = (h + deg / 360 + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const chan = (tt: number) => {
    let x = tt;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let rr = l, gg = l, bb = l;
  if (s !== 0) {
    rr = chan(h + 1 / 3);
    gg = chan(h);
    bb = chan(h - 1 / 3);
  }
  return [Math.round(rr * 255), Math.round(gg * 255), Math.round(bb * 255)];
}

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

function drawTrackedLeft(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const chars = [...text];
  let cx = x;
  ctx.textAlign = "left";
  chars.forEach((c) => {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  });
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

// ---------- анимационные помощники ----------

/** Окно внутри цикла: 0 до a, плавный 0→1 между a и b, 1 после b */
function win(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  const x = (t - a) / (b - a);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x); // smoothstep
}

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);

/** Появление с лёгким перелётом — для «штампов», аватаров, точек */
function easeOutBack(x: number): number {
  const c = 1.7;
  const p = Math.min(Math.max(x, 0), 1) - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
}

// ---------- зерно (киноплёночная текстура) ----------

let grainTile: HTMLCanvasElement | null = null;

function getGrainTile(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 160;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(160, 160);
  let acc = 12345;
  const rand = () => {
    acc = (acc * 1103515245 + 12345) >>> 0;
    return (acc >>> 8) / 0x1000000;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 14; // зерно очень деликатное — только снять «пластиковость» градиентов
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** Плёночное зерно; смещение плитки едет с фазой t — в GIF оно «живое», цикл бесшовный */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, speed = 1) {
  const tile = getGrainTile();
  if (!tile) return;
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;
  const T = 160;
  const ox = Math.floor(((t * T * speed) % T + T) % T);
  const oy = Math.floor(((t * T * speed * 1.618) % T + T) % T);
  ctx.save();
  ctx.translate(-ox, -oy);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w + T, h + T);
  ctx.restore();
}

/** Мягкое радиальное свечение */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: Rgb, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(c, a));
  g.addColorStop(1, css(c, 0));
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

/** Тень под текстом поверх фото/тёмного фона */
function shadowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = "center") {
  ctx.textAlign = align;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillText(text, x, y + 3);
  ctx.restore();
  ctx.fillText(text, x, y);
}

// ---------- сцены ----------

/** Точка и касательная квадратичной кривой — для полёта самолётика по дуге */
function qPoint(p0: number[], p1: number[], p2: number[], u: number): [number, number] {
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
  return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
}

function qAngle(p0: number[], p1: number[], p2: number[], u: number): number {
  const dx = 2 * (1 - u) * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0]);
  const dy = 2 * (1 - u) * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1]);
  return Math.atan2(dy, dx);
}

/** Бумажный самолётик вместо эмодзи ✈ — его можно честно повернуть по курсу */
function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size / 48, size / 48);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(-20, -15);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-20, 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(-7, -3);
  ctx.lineTo(-7, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Холм-силуэт для «фото» полариоида; форма детерминирована сидами */
function ridge(ctx: CanvasRenderingContext2D, w: number, floorY: number, amp: number, s1: number, s2: number, fill: string) {
  ctx.beginPath();
  ctx.moveTo(0, floorY + 4);
  for (let x = 0; x <= w; x += 10) {
    const y = floorY - Math.sin(x * 0.006 + s1) * amp - Math.sin(x * 0.017 + s2) * amp * 0.45;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, floorY + 4);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Детерминированный «штрихкод» из строки; grow(bx) — доля высоты полосы (для анимации печати) */
function barcode(ctx: CanvasRenderingContext2D, seed: string, x: number, y: number, w: number, h: number, color = "#1c1917", grow?: (bx: number) => number) {
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
    const k = grow ? Math.max(0.04, Math.min(1, grow((cx - x) / w))) : 1;
    ctx.fillRect(cx, y + h * (1 - k), bw, h * k);
    cx += bw + 2 + Math.floor(rand() * 5);
  }
  ctx.restore();
}

/** Прямоугольный «штамп» — печать на билете */
function drawStamp(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, scale: number, alpha: number, label: string, color: Rgb) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = css(color, 0.9);
  ctx.lineWidth = 4;
  roundRect(ctx, -140, -46, 280, 92, 18);
  ctx.stroke();
  ctx.lineWidth = 2;
  roundRect(ctx, -130, -36, 260, 72, 12);
  ctx.stroke();
  ctx.fillStyle = css(color, 0.95);
  ctx.font = "bold 34px " + MONO;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 2);
  ctx.restore();
}

/** Вырез «дырочкой» по краю бумаги (как пробивают компостером) */
function punchHole(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, deskColor: string) {
  ctx.save();
  ctx.fillStyle = deskColor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// ---------- 1. Сторис 9:16 ----------

function renderStory(ctx: CanvasRenderingContext2D, d: CardData, t: number) {
  const W = 1080, H = 1920;
  const A = hexToRgb(d.accent);
  const SEC = hueShift(A, -36); // «второй цвет» — всегда гармоничен акценту поездки
  const INK = [18, 13, 11] as Rgb;

  // фон: диагональ акцент → сдвинутый оттенок → тёплая темнота
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, css(mix(A, SEC, 0.3)));
  grad.addColorStop(0.45, css(shade(A, -0.45)));
  grad.addColorStop(1, css(INK));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // дрейфующие световые пятна (период = цикл, GIF бесшовный)
  glow(ctx, 880 + Math.sin(t * TWO_PI) * 50, 320 + Math.cos(t * TWO_PI) * 36, 300, SEC, 0.16);
  glow(ctx, 190 + Math.cos(t * TWO_PI) * 60, 1610 + Math.sin(t * TWO_PI) * 44, 360, A, 0.13);
  glow(ctx, 540, 240, 520, A, 0.12);

  // эмодзи в стеклянном диске с лёгким дыханием
  const ey = 224 + Math.sin(t * TWO_PI) * 8;
  glow(ctx, 540, ey, 165 + Math.sin(t * TWO_PI + 0.8) * 12, A, 0.4);
  ctx.fillStyle = "rgba(255,255,255,0.09)";
  ctx.beginPath();
  ctx.arc(540, ey, 106, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = "112px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(d.emoji, 540, ey + 6);
  ctx.textBaseline = "alphabetic";

  // заголовок: появление подъёмом
  const eT = win(t, 0, 0.12);
  ctx.save();
  ctx.globalAlpha = eT;
  ctx.fillStyle = "white";
  ctx.font = "bold 62px " + SANS;
  const titleLines = wrapText(ctx, d.title, 540, 420 + (1 - eT) * 30, 880, 72);
  ctx.font = "30px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText(
    `${d.totalDays} ${pluralRu(d.totalDays, "день", "дня", "дней")} в пути${d.cities.length > 1 ? ` · ${d.cities.length} ${pluralRu(d.cities.length, "город", "города", "городов")}` : ""}`,
    540,
    420 + titleLines * 72 + 30
  );
  ctx.restore();

  const dividerY = Math.max(600, 420 + titleLines * 72 + 84);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(100, dividerY);
  ctx.lineTo(980, dividerY);
  ctx.stroke();

  // статистика 2×2: стеклянные плитки со ступенчатым появлением
  const stats = [
    { icon: "📍", value: `${d.visited}/${d.totalPlaces}`, label: "мест" },
    { icon: "📸", value: `${d.photos}`, label: "фото" },
    { icon: "📔", value: `${d.members.length}`, label: pluralRu(d.members.length, "путешественник", "путешественника", "путешественников") },
    { icon: "💰", value: `${d.currencySymbol}${Math.round(d.spent).toLocaleString("ru-RU")}`, label: "потрачено" },
  ];
  const cardWidth = 420;
  const cardHeight = 200;
  const cardGap = 40;
  const startX = (W - cardWidth * 2 - cardGap) / 2;
  const startY = dividerY + 56;

  stats.forEach((stat, i) => {
    const e = win(t, 0.08 + i * 0.055, 0.22 + i * 0.055);
    if (e <= 0) return;
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (cardWidth + cardGap);
    const y = startY + row * (cardHeight + cardGap) + (1 - e) * 26;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    roundRect(ctx, x, y, cardWidth, cardHeight, 26);
    ctx.fill();
    // верхняя кромка подсвечена — плитка читается «стеклом», а не серым пятном
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "46px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(stat.icon, x + cardWidth / 2, y + 82);
    ctx.font = "bold 46px " + SANS;
    ctx.fillStyle = "white";
    ctx.fillText(stat.value, x + cardWidth / 2, y + 142);
    ctx.font = "23px " + SANS;
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText(stat.label, x + cardWidth / 2, y + 174);
    ctx.restore();
  });

  // участники: аватары выпрыгивают с перелётом
  const members = d.members.slice(0, 5);
  const memY = startY + cardHeight * 2 + cardGap + 96;
  ctx.save();
  ctx.globalAlpha = win(t, 0.26, 0.38);
  ctx.font = "28px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("Участники:", 540, memY);
  ctx.restore();
  const avatarSize = 84;
  const avatarGap = 22;
  const totalAvatarWidth = members.length * (avatarSize + avatarGap) - avatarGap;
  const avatarStartX = (W - totalAvatarWidth) / 2;
  members.forEach((m, i) => {
    const e = easeOutBack(win(t, 0.3 + i * 0.045, 0.42 + i * 0.045));
    if (e <= 0) return;
    const x = avatarStartX + i * (avatarSize + avatarGap);
    const y = memY + 40;
    ctx.save();
    ctx.translate(x + avatarSize / 2, y + avatarSize / 2);
    ctx.scale(e, e);
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(0, 0, avatarSize / 2, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = "42px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.emoji, 0, 4);
    ctx.restore();
  });
  ctx.textBaseline = "alphabetic";

  // прогресс: полоса наполняется за цикл, затем по ней пробегает блик
  const progressY = memY + 190;
  const eP = win(t, 0.32, 0.34);
  ctx.save();
  ctx.globalAlpha = eP;
  ctx.font = "28px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.textAlign = "center";
  ctx.fillText(`Прогресс: ${d.progress}%`, 540, progressY);
  ctx.restore();
  const barX = 140;
  const barY = progressY + 30;
  const barWidth = 800;
  const barHeight = 26;
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  roundRect(ctx, barX, barY, barWidth, barHeight, 13);
  ctx.fill();
  const fillK = (d.progress / 100) * easeOut(win(t, 0.34, 0.56));
  if (fillK > 0.01) {
    const bg = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    bg.addColorStop(0, "rgba(255,255,255,0.92)");
    bg.addColorStop(1, css(mix(A, [255, 255, 255], 0.55)));
    ctx.fillStyle = bg;
    roundRect(ctx, barX, barY, Math.max(barHeight, barWidth * fillK), barHeight, 13);
    ctx.fill();
  }
  // блик по заполненной полосе
  const eS = win(t, 0.62, 0.72);
  if (eS > 0 && eS < 1) {
    ctx.save();
    roundRect(ctx, barX, barY, barWidth, barHeight, 13);
    ctx.clip();
    const sx = barX - 80 + (barWidth + 160) * eS;
    const sg = ctx.createLinearGradient(sx - 70, 0, sx + 70, 0);
    sg.addColorStop(0, "rgba(255,255,255,0)");
    sg.addColorStop(0.5, "rgba(255,255,255,0.5)");
    sg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.restore();
  }

  ctx.font = "bold 36px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textAlign = "center";
  ctx.fillText("TripTrek", 540, 1706);
  ctx.font = "24px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.fillText("совместное путешествие", 540, 1746);

  // диагональный шиммер — проходит по карточке ближе к концу цикла
  const eSh = win(t, 0.78, 0.97);
  if (eSh > 0 && eSh < 1) {
    ctx.save();
    ctx.translate((W + 700) * (eSh * 1.16) - 350, 0);
    ctx.rotate(-0.3);
    const shg = ctx.createLinearGradient(-140, 0, 140, 0);
    shg.addColorStop(0, "rgba(255,255,255,0)");
    shg.addColorStop(0.5, "rgba(255,255,255,0.1)");
    shg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shg;
    ctx.fillRect(-140, -400, 280, H + 800);
    ctx.restore();
  }

  grain(ctx, W, H, t);
  // виньетка по краям — соберёт композицию
  const vg = ctx.createRadialGradient(540, 900, 500, 540, 960, 1150);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------- 2. Билет 4:5 ----------

function renderTicket(ctx: CanvasRenderingContext2D, d: CardData, t: number) {
  const W = 1080, H = 1350;
  const PAPER = "#f6f1e7";
  const A = hexToRgb(d.accent);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // водяные круги — бумага не должна быть мёртво-плоской
  ctx.fillStyle = css(A, 0.045);
  ctx.beginPath();
  ctx.arc(990, 180, 240, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(70, 1240, 200, 0, Math.PI * 2);
  ctx.fill();

  // верхняя акцентная полоса
  ctx.fillStyle = css(A);
  ctx.fillRect(0, 0, W, 14);

  ctx.textAlign = "center";
  ctx.fillStyle = "#8a8375";
  ctx.font = "28px " + MONO;
  drawTracked(ctx, "BOARDING PASS", 540, 96, 10);
  ctx.font = "24px " + MONO;
  drawTracked(ctx, "TRIP TREK AIRWAYS", 540, 134, 6);

  // эмодзи в акцентном круге + вращающееся пунктирное кольцо
  ctx.fillStyle = css(A);
  ctx.beginPath();
  ctx.arc(540, 248, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = css(A, 0.45);
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 9]);
  ctx.lineDashOffset = -t * 84; // ползёт по кругу, в GIF кольцо «крутится»
  ctx.beginPath();
  ctx.arc(540, 248, 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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

  // пунктирная дуга: пунктир ползёт, самолётик летит по кривой весь цикл
  const p0 = [370, 440], p1 = [540, 366], p2 = [710, 440];
  ctx.save();
  ctx.strokeStyle = "#b8b0a0";
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 12]);
  ctx.lineDashOffset = -t * 112;
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
  ctx.stroke();
  ctx.restore();
  const [px, py] = qPoint(p0, p1, p2, t);
  drawPlane(ctx, px, py, qAngle(p0, p1, p2, t), 52, css(A));

  ctx.fillStyle = "#6d6656";
  ctx.font = "22px " + MONO;
  ctx.fillText("FROM", 250, 510);
  ctx.fillText("TO", 830, 510);

  ctx.fillStyle = "#1c1917";
  ctx.font = "bold 40px " + SANS;
  ctx.fillText(d.dateLabel, 540, 610);

  // перфорация с компостерными выемками по краям
  const HOLE = css(shade(hexToRgb(PAPER), -0.28));
  dashedLine(ctx, 60, 700, W - 60, 700, [14, 12], "rgba(0,0,0,0.22)", 2);
  punchHole(ctx, 0, 700, 26, HOLE);
  punchHole(ctx, W, 700, 26, HOLE);
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
  punchHole(ctx, 0, 1030, 22, HOLE);
  punchHole(ctx, W, 1030, 22, HOLE);

  ctx.fillStyle = "#1c1917";
  fitFont(ctx, d.title, 44, 24, W - 160, (px) => `bold ${px} ` + SANS);
  ctx.fillText(d.title, 540, 1105);
  ctx.fillStyle = "#8a8375";
  ctx.font = "24px " + MONO;
  drawTracked(ctx, `FLIGHT TT-${(d.inviteCode || "000000").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`, 540, 1145, 4);

  // штрихкод «печатается» слева направо за цикл
  const eB = easeOut(win(t, 0.06, 0.42));
  barcode(ctx, d.inviteCode || d.title, 190, 1180, 700, 100, "#1c1917", (bx) => (bx <= eB ? 1 : 0.06));
  ctx.fillStyle = "#8a8375";
  ctx.font = "22px " + MONO;
  ctx.fillText(d.inviteCode.toUpperCase(), 540, 1310);

  // штамп ONBOARD — шлёпается с перелётом
  const eSt = win(t, 0.26, 0.4);
  if (eSt > 0) drawStamp(ctx, 852, 588, -0.16, easeOutBack(eSt), 0.75 * eSt, "✈ ONBOARD", A);

  // скан-подсветка по штрихкоду в конце цикла
  const eScan = win(t, 0.6, 0.84);
  if (eScan > 0 && eScan < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(190, 1180, 700, 100);
    ctx.clip();
    const sx = 150 + 780 * eScan;
    const sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
    sg.addColorStop(0, css(A, 0));
    sg.addColorStop(0.5, css(A, 0.4));
    sg.addColorStop(1, css(A, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(190, 1180, 700, 100);
    ctx.restore();
  }

  grain(ctx, W, H, t, 0.6);
}

// ---------- 3. Поляроид 1:1 ----------

function renderPolaroid(ctx: CanvasRenderingContext2D, d: CardData, t: number) {
  const W = 1080, H = 1080;
  const DESK = "#ddd6c7";
  const A = hexToRgb(d.accent);

  ctx.fillStyle = DESK;
  ctx.fillRect(0, 0, W, H);

  // мягкие тени «стола»
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  ctx.beginPath();
  ctx.arc(140, 950, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(960, 120, 180, 0, Math.PI * 2);
  ctx.fill();

  // полароид целиком чуть дышит — покачивание с периодом цикла
  ctx.save();
  ctx.translate(540, 540 + Math.sin(t * TWO_PI) * 9);
  ctx.rotate(-0.028 + Math.sin(t * TWO_PI + 1.2) * 0.008);

  // корпус полариоида с тенью
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(-470, -470, 940, 940);
  ctx.restore();

  // «фото» — дуотонный пейзаж из акцента: солнце, гряда холмов, птицы
  const photoX = -420, photoY = -420, photoW = 840, photoH = 640;
  ctx.save();
  ctx.beginPath();
  ctx.rect(photoX, photoY, photoW, photoH);
  ctx.clip();

  const sky = ctx.createLinearGradient(photoX, photoY, photoX, photoY + photoH);
  sky.addColorStop(0, css(shade(A, 0.45)));
  sky.addColorStop(0.62, css(A));
  sky.addColorStop(1, css(shade(A, -0.25)));
  ctx.fillStyle = sky;
  ctx.fillRect(photoX, photoY, photoW, photoH);

  // солнце с ореолом, дышит
  const sunX = photoX + photoW * 0.66;
  const sunY = photoY + photoH * 0.36;
  glow(ctx, sunX, sunY, 130 + Math.sin(t * TWO_PI) * 8, shade(A, 0.75), 0.5);
  ctx.fillStyle = css(shade(A, 0.78));
  ctx.beginPath();
  ctx.arc(sunX, sunY, 52, 0, Math.PI * 2);
  ctx.fill();

  // три гряды холмов — чем ближе, тем темнее; передняя доходит до низа кадра
  ridge(ctx, photoW, photoY + photoH * 0.64, 44, 0.8, 2.1, css(shade(A, -0.28)));
  ridge(ctx, photoW, photoY + photoH * 0.78, 58, 2.4, 4.4, css(shade(A, -0.5)));
  ridge(ctx, photoW, photoY + photoH + 6, 52, 4.1, 1.3, css(shade(A, -0.72)));

  // птицы — две галочки в небе
  ctx.strokeStyle = css(shade(A, -0.55), 0.8);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  const bird = (bx: number, by: number, s: number) => {
    ctx.beginPath();
    ctx.moveTo(bx - s, by);
    ctx.quadraticCurveTo(bx - s / 2, by - s * 0.8, bx, by);
    ctx.quadraticCurveTo(bx + s / 2, by - s * 0.8, bx + s, by);
    ctx.stroke();
  };
  bird(photoX + 150, photoY + 130, 14);
  bird(photoX + 205, photoY + 160, 10);

  // зерно-полоски как у плёнки
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(photoX, photoY + (photoH / 6) * i + 14, photoW, 3);
  }
  ctx.save();
  ctx.translate(photoX, photoY);
  grain(ctx, photoW, photoH, t, 1.4);
  ctx.restore();

  // лёгкая виньетка фото
  const pvg = ctx.createRadialGradient(0, photoY + photoH * 0.45, 200, 0, photoY + photoH * 0.5, 560);
  pvg.addColorStop(0, "rgba(0,0,0,0)");
  pvg.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = pvg;
  ctx.fillRect(photoX, photoY, photoW, photoH);

  // дата в углу
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "26px " + MONO;
  ctx.textAlign = "left";
  ctx.fillText(d.dateLabel.toUpperCase(), photoX + 28, photoY + 44);

  // список городов по центру фото
  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.font = "bold 56px " + SANS;
  const cityLine = d.cities.slice(0, 3).map((c) => c.name).join(" · ");
  // подпись с тенью вручную: wrapText рисует сам, тень — второй проход тем же разбиением
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  wrapText(ctx, cityLine, 0, photoY + photoH / 2 - 7, photoW - 80, 68);
  ctx.restore();
  wrapText(ctx, cityLine, 0, photoY + photoH / 2 - 10, photoW - 80, 68);
  ctx.font = "30px " + SANS;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  shadowText(
    ctx,
    `${d.totalDays} ${pluralRu(d.totalDays, "день", "дня", "дней")} · ${d.totalPlaces} ${pluralRu(d.totalPlaces, "место", "места", "мест")}`,
    0,
    photoY + photoH - 40
  );

  // проявление: снимок «выплывает» из пересвета в первой половине цикла —
  // как настоящий полароид; перезапись цикла читается как новый кадр
  const eDev = 1 - win(t, 0.02, 0.44);
  if (eDev > 0) {
    ctx.fillStyle = `rgba(252,250,244,${eDev})`;
    ctx.fillRect(photoX, photoY, photoW, photoH);
  }
  ctx.restore(); // конец клипа фото

  // рукописная подпись (длинный заголовок ужать, не вылезая за рамку полариоида)
  ctx.fillStyle = "#2d2a26";
  const script = (px: number) => `italic ${px} ` + SCRIPT;
  fitFont(ctx, `${d.title} ${d.emoji}`, 54, 22, 860, script);
  ctx.fillText(`${d.title} ${d.emoji}`, 0, photoY + photoH + 120);
  ctx.fillStyle = "#8a857b";
  ctx.font = "28px " + SANS;
  ctx.fillText(`с ${d.members.length} ${d.members.length === 1 ? "другом" : "друзьями"} · TripTrek`, 0, photoY + photoH + 175);

  ctx.restore(); // конец покачивания полариоида

  // скотч сверху с пробегающим блеском
  ctx.save();
  ctx.translate(540, 52);
  ctx.rotate(0.05);
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(250, 230, 160, 0.85)";
  ctx.fillRect(-140, -34, 280, 68);
  const eTape = win(t, 0.55, 0.72);
  if (eTape > 0 && eTape < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-140, -34, 280, 68);
    ctx.clip();
    const sx = -180 + 360 * eTape;
    const sg = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
    sg.addColorStop(0, "rgba(255,255,255,0)");
    sg.addColorStop(0.5, "rgba(255,255,255,0.75)");
    sg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(-140, -34, 280, 68);
    ctx.restore();
  }
  ctx.restore();

  grain(ctx, W, H, t, 0.5);
}

// ---------- 4. Чек 4:5 ----------

function renderReceipt(ctx: CanvasRenderingContext2D, d: CardData, t: number) {
  const W = 1080, H = 1350;
  const A = hexToRgb(d.accent);
  ctx.fillStyle = "#e9e4d8";
  ctx.fillRect(0, 0, W, H);

  // бумага с зубчатыми краями; путь вынесен, чтобы клипнить «печать» по форме листа
  const px = 110, pw = W - 220, top = 46, bottom = H - 46, tooth = 22, step = 44;
  const paperPath = () => {
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
  };

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#fdfcf8";
  paperPath();
  ctx.fill();
  ctx.restore();

  // чек печатается сверху вниз за первую половину цикла; ниже кромки контент
  // ещё «в принтере» — второй клип по высоте прячет всё недопечатанное
  const ePrint = win(t, 0.02, 0.52);
  ctx.save();
  paperPath();
  ctx.clip();
  if (ePrint < 1) {
    ctx.beginPath();
    ctx.rect(px - 10, top, pw + 20, (bottom - top) * ePrint);
    ctx.clip();
  }

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
  const stackAfterCities = 8 + 54 + 5 * 54 + 10 + 64 + 56 + 78; // блок сводки (5 строк) до «оплачено»
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
  const avgDay = d.totalDays > 0 ? d.spent / d.totalDays : 0;
  row("СРЕДНЕЕ ЗА ДЕНЬ", `${d.currencySymbol}${Math.round(avgDay).toLocaleString("ru-RU")}`);
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
  const paidY = y + 56;
  ctx.fillStyle = "#4d483e";
  ctx.font = "28px " + MONO;
  ctx.textAlign = "center";
  ctx.fillText("ОПЛАЧЕНО ВОСПОМИНАНИЯМИ", center, paidY);

  barcode(ctx, d.inviteCode || d.title, center - 300, barcodeY, 600, 86, "#1c1917");

  // самолётик в «спасибо» подмигивает во время сканирования
  const eScan = win(t, 0.6, 0.85);
  const blink = eScan > 0 && eScan < 1 ? 0.45 + 0.55 * Math.abs(Math.sin(t * TWO_PI * 3)) : 1;
  ctx.fillStyle = "#7d776b";
  ctx.font = "30px " + MONO;
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.fillText("СПАСИБО! ЖДЁМ СНОВА ✈", center, thanksY);
  ctx.restore();

  // скан-линия по штрихкоду
  if (eScan > 0 && eScan < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(center - 300, barcodeY, 600, 86);
    ctx.clip();
    const sx = center - 340 + 680 * eScan;
    const sg = ctx.createLinearGradient(sx - 50, 0, sx + 50, 0);
    sg.addColorStop(0, css(A, 0));
    sg.addColorStop(0.5, css(A, 0.45));
    sg.addColorStop(1, css(A, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(center - 300, barcodeY, 600, 86);
    ctx.restore();
  }

  ctx.restore(); // конец клипов бумаги/печати

  // горячая кромка термопринтера, пока лист ещё выходит
  if (ePrint < 1) {
    const edge = top + (bottom - top) * ePrint;
    ctx.save();
    ctx.fillStyle = css(A, 0.16 * (1 - ePrint));
    ctx.fillRect(px, edge - 12, pw, 24);
    ctx.fillStyle = css(A, 0.6 * (1 - ePrint));
    ctx.fillRect(px, edge - 2, pw, 4);
    ctx.restore();
  }

  grain(ctx, W, H, t, 0.5);
}

// ---------- 5. Маршрут 4:5 ----------

function renderRoute(ctx: CanvasRenderingContext2D, d: CardData, t: number) {
  const W = 1080, H = 1350;
  const A = hexToRgb(d.accent);
  ctx.fillStyle = "#0e1626";
  ctx.fillRect(0, 0, W, H);

  // тёплое свечение из угла — deep navy не должен быть мёртвым
  glow(ctx, 950, 120, 420, A, 0.07);

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

  // компас: стрелка мягко рыскает весь цикл
  ctx.save();
  ctx.translate(940, 160);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.stroke();
  // риски
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TWO_PI;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 48, Math.sin(a) * 48);
    ctx.lineTo(Math.cos(a) * 56, Math.sin(a) * 56);
    ctx.stroke();
  }
  ctx.rotate(Math.sin(t * TWO_PI) * 0.14);
  ctx.fillStyle = css(A);
  ctx.beginPath();
  ctx.moveTo(0, -46); ctx.lineTo(13, 9); ctx.lineTo(0, 0); ctx.lineTo(-13, 9);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "bold 24px " + SANS;
  ctx.textAlign = "center";
  ctx.fillText("С", 940, 160 - 70);

  // точки городов (в поездке без дней города нет — рисуем только шапку и статистику)
  const pts = d.cities.slice(0, 7);
  const hidden = d.cities.length - pts.length;
  // при длинном заголовке опускаем график ниже даты, чтобы не слипались
  const topY = Math.max(400, 180 + titleLines * 70 + 110), bottomY = 1130;

  if (pts.length > 0) {
    const stepY = pts.length > 1 ? (bottomY - topY) / (pts.length - 1) : 0;
    const positions = pts.map((c, i) => ({
      city: c,
      x: i % 2 === 0 ? 280 : 800,
      y: pts.length === 1 ? (topY + bottomY) / 2 : topY + stepY * i,
    }));

    // сэмплируем путь в полилинию: по ней удобно и рисовать прогресс, и вести «голову»
    const samples: { x: number; y: number }[] = [];
    samples.push({ x: positions[0].x, y: positions[0].y });
    for (let i = 1; i < positions.length; i++) {
      const a = positions[i - 1], b = positions[i];
      const mx = (a.x + b.x) / 2 + (i % 2 === 1 ? 90 : -90);
      const my = (a.y + b.y) / 2;
      for (let s = 1; s <= 24; s++) {
        const [qx, qy] = qPoint([a.x, a.y], [mx, my], [b.x, b.y], s / 24);
        samples.push({ x: qx, y: qy });
      }
    }

    // доля пути, отрисованная к фазе t: путь рисуется в [0.05..0.5]
    const drawK = win(t, 0.05, 0.5);
    const nDots = Math.floor(samples.length * drawK);

    ctx.save();
    ctx.fillStyle = css(A);
    for (let i = 0; i < nDots; i += 2) {
      const p = samples[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, TWO_PI);
      ctx.fill();
    }
    // «голова» пути со свечением — видна только пока путь рисуется
    if (drawK > 0 && drawK < 1 && nDots > 0) {
      const head = samples[Math.min(nDots, samples.length - 1)];
      glow(ctx, head.x, head.y, 26, A, 0.5);
      ctx.fillStyle = css(shade(A, 0.5));
      ctx.beginPath();
      ctx.arc(head.x, head.y, 6, 0, TWO_PI);
      ctx.fill();
    }
    ctx.restore();

    // города: точка проявляется, когда до неё дошёл путь; пульс — весь цикл
    ctx.textAlign = "center";
    positions.forEach((p, i) => {
      const reach = i / Math.max(1, positions.length - 1);
      const ePt = win(t, 0.05 + reach * 0.42, 0.11 + reach * 0.42);
      if (ePt <= 0) return;
      const pulse = 1 + Math.sin(t * TWO_PI * 2 - i * 0.9) * 0.14;

      ctx.save();
      ctx.globalAlpha = ePt;
      ctx.translate(p.x, p.y);
      ctx.scale(ePt, ePt);
      glow(ctx, 0, 0, 40 * pulse, A, 0.16);
      ctx.fillStyle = "rgba(255,255,255,0.09)";
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, TWO_PI); ctx.fill();
      ctx.fillStyle = css(A);
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, TWO_PI); ctx.fill();
      ctx.fillStyle = "#0e1626";
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TWO_PI); ctx.fill();
      ctx.restore();

      const left = p.x < 540;
      ctx.save();
      ctx.globalAlpha = ePt;
      const lx = left ? p.x + 56 : p.x - 56;
      ctx.fillStyle = "white";
      ctx.font = "bold 36px " + SANS;
      shadowText(ctx, p.city.name, lx, p.y - 4, left ? "left" : "right");
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "24px " + MONO;
      ctx.fillText(`${p.city.days} ${pluralRu(p.city.days, "день", "дня", "дней")} · ${i + 1}-я точка`, lx, p.y + 32);
      ctx.restore();
    });

    if (hidden > 0) {
      ctx.save();
      ctx.globalAlpha = win(t, 0.44, 0.56);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "28px " + MONO;
      ctx.fillText(`+${hidden} ${pluralRu(hidden, "город", "города", "городов")} дальше по пути…`, 90, bottomY + 70);
      ctx.restore();
    }
  }

  // нижняя строка статистики
  const eF = win(t, 0.42, 0.56);
  ctx.save();
  ctx.globalAlpha = eF;
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
  ctx.restore();

  grain(ctx, W, H, t, 0.7);
}

// ---------- реестр ----------

export const CARD_VARIANTS: CardVariant[] = [
  { id: "story", label: "Сторис", tag: "9:16", emoji: "📱", width: 1080, height: 1920, loopMs: 3600, posterT: 0.58, render: renderStory },
  { id: "ticket", label: "Билет", tag: "4:5", emoji: "🎫", width: 1080, height: 1350, loopMs: 3200, posterT: 0.5, render: renderTicket },
  { id: "polaroid", label: "Поляроид", tag: "1:1", emoji: "🖼️", width: 1080, height: 1080, loopMs: 4200, posterT: 0.47, render: renderPolaroid },
  { id: "receipt", label: "Чек", tag: "4:5", emoji: "🧾", width: 1080, height: 1350, loopMs: 3800, posterT: 0.92, render: renderReceipt },
  { id: "route", label: "Маршрут", tag: "4:5", emoji: "🗺️", width: 1080, height: 1350, loopMs: 3400, posterT: 0.8, render: renderRoute },
];

export type CardVariantId = CardVariant["id"];
