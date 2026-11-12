// Undo удаления места: из read-модели маршрута собираем POST-нагрузку строго
// из PLACE_PATCHABLE — POST /api/places валидирует вход тем же списком
// (pickPatchablePlace), так что чужие поля не только бесполезны, но и risky.
import { PLACE_PATCHABLE, type PlacePatch } from "./place-fields";

type PlaceLike = Record<string, unknown>;

export function placeRestorePayload(place: PlaceLike): PlacePatch {
  const out: Record<string, unknown> = {};
  for (const k of PLACE_PATCHABLE) {
    if (k in place) out[k] = place[k];
  }
  return out as PlacePatch;
}
