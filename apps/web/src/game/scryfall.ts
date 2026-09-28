import { useEffect, useMemo, useState } from "react";
import type { UiCard } from "@mtg-commander/shared";

/**
 * UI-003: laedt Kartenbilder live von der Scryfall-API (api.scryfall.com).
 *
 * - Pro Karte ein GET: zuerst der exakte Print ueber `/cards/{set}/{nummer}`,
 *   bei 404 Fallback ueber `/cards/named?exact=` (beide CORS-faehig, noetig
 *   fuer den Browser-Aufruf aus Vite).
 * - Der Batch-Endpoint `POST /cards/collection` wird in dieser Umgebung mit
 *   HTTP 400 + HTML-Fehlerseite abgewiesen (Cloudflare/Heroku), daher der
 *   GET-Pfad. Ein Request pro Karte, sequenziell mit 75ms Abstand, bleibt
 *   innerhalb der Scryfall-Rate-Limits (10 req/s); der Modul-Cache sorgt
 *   dafuer, dass jede Karte nur einmal angefragt wird.
 * - Nicht aufloesbare Karten werden als `null` gecacht (kein erneuter
 *   Versuch). Netzwerk-/Serverfehler werden NICHT gecacht, damit der
 *   naechste Poll es erneut versuchen kann (Offline -> Text-Kachel).
 */

const REQUEST_DELAY_MS = 75;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Stabiler Cache-Schluessel pro Karte (name|set|nummer, case-insensitive). */
export function cardImageKey(card: Pick<UiCard, "name" | "setCode" | "cardNumber">): string {
  return [
    (card.name ?? "?").toLowerCase(),
    (card.setCode ?? "").toLowerCase(),
    (card.cardNumber ?? "").toLowerCase(),
  ].join("|");
}

/** Pfad des exakten Prints, z.B. "tdc/198", oder null wenn Set/Nummer fehlen. */
export function cardPrintPath(card: Pick<UiCard, "setCode" | "cardNumber">): string | null {
  if (card.setCode === null || card.setCode.length === 0) return null;
  if (card.cardNumber === null || card.cardNumber.length === 0) return null;
  return `${encodeURIComponent(card.setCode.toLowerCase())}/${encodeURIComponent(card.cardNumber)}`;
}

interface ScryfallImageUris {
  normal?: string;
  large?: string;
}

interface ScryfallCardDto {
  name?: string;
  image_uris?: ScryfallImageUris;
  /** Doppelseitige Karten haben keine eigenen image_uris, sondern Faces. */
  card_faces?: Array<{ image_uris?: ScryfallImageUris }>;
}

/** `normal` (488x680) bevorzugt, Fallback ueber das vordere Face (double-faced). */
export function pickImageUri(dto: ScryfallCardDto): string | null {
  const faces = dto.card_faces?.[0]?.image_uris ?? null;
  return dto.image_uris?.normal ?? dto.image_uris?.large ?? faces?.normal ?? faces?.large ?? null;
}

const imageCache = new Map<string, string | null>();

const SCRYFALL_HEADERS = {
  accept: "application/json",
  // Node-Default-UA ("node") wird von Scryfall/Cloudflare mit 400 abgewiesen;
  // im Browser ist dieser Header ein ignoriertes forbidden header name.
  "user-agent": "mtg-commander-poc/0.1 (private playgroup prototype)",
} as const;

/** Liefert die Bild-URL einer Karte: exakter Print, sonst Name, sonst null. */
async function fetchImageUri(card: UiCard): Promise<string | null> {
  const printPath = cardPrintPath(card);
  if (printPath !== null) {
    const print = await fetch(`https://api.scryfall.com/cards/${printPath}`, { headers: SCRYFALL_HEADERS });
    if (print.ok) return pickImageUri((await print.json()) as ScryfallCardDto);
    if (print.status !== 404) throw new Error(`Scryfall HTTP ${print.status}`);
  }

  const name = (card.name ?? "").trim();
  if (name.length === 0) return null;
  const named = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`, {
    headers: SCRYFALL_HEADERS,
  });
  if (named.status === 404) return null;
  if (!named.ok) throw new Error(`Scryfall HTTP ${named.status}`);
  return pickImageUri((await named.json()) as ScryfallCardDto);
}

function snapshotFor(cards: readonly UiCard[]): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const card of cards) result.set(cardImageKey(card), imageCache.get(cardImageKey(card)) ?? null);
  return result;
}

/** Laedt alle noch nicht gecachten Karten und befuellt den Cache.
 * Liefert einen Snapshot der aufgeloesten Keys (cacheKey -> URL, null = nicht gefunden). */
export async function resolveCardImages(cards: readonly UiCard[]): Promise<Map<string, string | null>> {
  const pending = cards.filter((card) => !imageCache.has(cardImageKey(card)));
  for (let index = 0; index < pending.length; index += 1) {
    if (index > 0) await delay(REQUEST_DELAY_MS);
    const card = pending[index]!;
    try {
      imageCache.set(cardImageKey(card), await fetchImageUri(card));
    } catch (error) {
      // Netzwerk-/Serverfehler: nichts cachen und abbrechen (Offline -> Text-Kachel),
      // der naechste Poll versucht es erneut.
      console.warn("[scryfall] Kartenbild nicht ladbar:", card.name, error);
      break;
    }
  }
  return snapshotFor(cards);
}

/** Liefert cardId -> Bild-URL fuer alle bereits aufgeloesten Karten. */
export function useCardImages(cards: readonly UiCard[]): Map<string, string> {
  const [ready, setReady] = useState(0);
  const cacheKey = cards.map(cardImageKey).join("|");

  useEffect(() => {
    let cancelled = false;
    const missing = cards.filter((card) => !imageCache.has(cardImageKey(card)));
    if (missing.length === 0) return;
    void resolveCardImages(missing)
      .then(() => {
        if (!cancelled) setReady((version) => version + 1);
      })
      .catch(() => {
        /* wird innerhalb von resolveCardImages gefangen */
      });
    return () => {
      cancelled = true;
    };
    // absichtlich nur cacheKey: Karten-Identitaeten aendern sich bei jedem Poll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return useMemo(() => {
    void ready;
    const urls = new Map<string, string>();
    for (const card of cards) {
      const url = imageCache.get(cardImageKey(card));
      if (url !== null && url !== undefined) urls.set(card.id, url);
    }
    return urls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ready]);
}
