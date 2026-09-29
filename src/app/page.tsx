"use client";

import { useEffect, useMemo, useState } from "react";
import EventMap from "@/components/EventMap";
import type { ShowdayEvent } from "@/lib/eventTypes";

const MAIN_SITE = "https://showday.kr";
const GENRES = ["전체", "콘서트", "뮤지컬", "연극", "클래식", "전시", "축제", "체험", "무료"] as const;

type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };

function matches(e: ShowdayEvent, g: string) {
  if (g === "전체") return true;
  if (g === "무료") return Boolean(e.isFree);
  return `${e.subcategory || ""} ${e.category || ""}`.includes(g);
}

export default function Page() {
  const [events, setEvents] = useState<ShowdayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState<string>("전체");
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d?.events) ? d.events : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () =>
      events.filter(
        (e) =>
          matches(e, genre) &&
          (!bounds ||
            (e.lat! >= bounds.swLat && e.lat! <= bounds.neLat && e.lng! >= bounds.swLng && e.lng! <= bounds.neLng))
      ),
    [events, genre, bounds]
  );
  const points = useMemo(() => visible.map((e) => ({ id: e.id, lat: e.lat!, lng: e.lng! })), [visible]);
  const selected = events.find((e) => e.id === selectedId) || null;
  const link = selected?.officialUrl || selected?.bookingUrl;

  return (
    <div className="sm-app">
      <header className="sm-top">
        <div className="sm-logo">SHOWDAY<small>MAP</small></div>
        <a className="sm-back" href={MAIN_SITE}>SHOWDAY 홈 ›</a>
      </header>
      <div className="sm-filters" role="tablist" aria-label="장르">
        {GENRES.map((g) => (
          <button key={g} className={`sm-chip${genre === g ? " on" : ""}`} onClick={() => { setGenre(g); setSelectedId(null); }}>
            {g}
          </button>
        ))}
      </div>
      <main className="sm-body">
        <EventMap points={points} onSelect={setSelectedId} onBoundsChange={(b) => { setBounds(b); setSelectedId(null); }} />
        {!loading && <div className="sm-count">{visible.length}개{bounds ? " · 화면 범위" : ""}</div>}
        {selected && (
          <div className="sm-card">
            <button className="x" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button>
            {selected.imageUrl ? <img src={selected.imageUrl} alt="" /> : <div className="ph" />}
            <div>
              <span className="tag">{selected.subcategory || selected.category}</span>
              <h3>{selected.title}</h3>
              <p>{selected.dateText || "일정 확인 필요"}</p>
              <p>{selected.venue || selected.address || ""}</p>
              <p>{selected.isFree ? "무료" : selected.priceText || ""}</p>
              {link && <a href={link} target="_blank" rel="noopener noreferrer">자세히 · 예매</a>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
