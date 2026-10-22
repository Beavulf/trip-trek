// Флаг «идёт загрузка фото» в отдельном крошечном модуле: WS-хук читает его, не
// затягивая в свой бандл движок очереди. Пишет флаг обвязка очереди (browser.ts).
let busy = false;

export function setUploadBusy(value: boolean): void {
  busy = value;
}

export function isUploadBusy(): boolean {
  return busy;
}
