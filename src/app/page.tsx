"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EventMap, { type Bounds, type EventMapHandle } from "@/components/EventMap";
import type { ShowdayEvent } from "@/lib/eventTypes";

const MAIN_SITE = "https://showday.kr";

const DISTRICTS: Record<string, [number, number]> = {
  강남구:[37.5172,127.0473],강동구:[37.5301,127.1238],강북구:[37.6396,127.0257],강서구:[37.5509,126.8495],관악구:[37.4784,126.9516],광진구:[37.5385,127.0823],구로구:[37.4955,126.8876],금천구:[37.4569,126.8955],노원구:[37.6542,127.0568],도봉구:[37.6688,127.0471],동대문구:[37.5744,127.0396],동작구:[37.5124,126.9393],마포구:[37.5663,126.9019],서대문구:[37.5791,126.9368],서초구:[37.4837,127.0324],성동구:[37.5633,127.0369],성북구:[37.5894,127.0167],송파구:[37.5145,127.1059],양천구:[37.5170,126.8665],영등포구:[37.5264,126.8963],용산구:[37.5326,126.9905],은평구:[37.6027,126.9291],종로구:[37.5730,126.9794],중구:[37.5641,126.9979],중랑구:[37.6063,127.0927],
};
const GENRES = ["전체", "콘서트", "뮤지컬", "연극", "클래식", "전시", "축제", "체험"];
const AUDIENCES = ["전체", "아이·가족", "어른", "시니어"];
const QUICK: [string, string][] = [["all", "전체 일정"], ["today", "오늘"], ["weekend", "이번 주말"], ["free", "무료"]];

function genreMatch(e: ShowdayEvent, g: string) {
  if (g === "전체") return true;
  return `${e.subcategory || ""} ${e.category || ""}`.includes(g);
}
// 출처 데이터의 대상·연령 문구를 키워드로 판별한다(정확도는 출처 데이터에 따라 다를 수 있음).
const KID_RE = /어린이|유아|영유아|아동|키즈|초등|가족|아이|청소년/;
const SENIOR_RE = /시니어|어르신|노인|실버|50\+|60\+|중장년|경로/;
function audienceText(e: ShowdayEvent) {
  return [e.target, e.ageText, e.title, e.subcategory].join(" ");
}
function audienceMatch(e: ShowdayEvent, a: string) {
  if (a === "전체") return true;
  const t = audienceText(e);
  const kid = e.familyAllowed === true || KID_RE.test(t);
  if (a === "아이·가족") return kid;
  if (a === "시니어") return SENIOR_RE.test(t);
  // 어른: 아이 전용으로 보이는 행사는 제외
  return !kid || /전체|성인|누구나|전 연령|전연령/.test(t);
}
function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function isWeekend(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso).getDay();
  return d === 5 || d === 6 || d === 0;
}

export default function Page() {
  const mapRef = useRef<EventMapHandle | null>(null);
  const [events, setEvents] = useState<ShowdayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState("전체");
  const [quick, setQuick] = useState("all");
  const [audience, setAudience] = useState("전체");
  const [district, setDistrict] = useState("");
  const [q, setQ] = useState("");
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d?.events) ? d.events : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 지도에 찍을 전체(장르·일정·검색어 조건 적용)
  const filtered = useMemo(() => {
    const today = seoulToday();
    const kw = q.trim().toLowerCase();
    return events.filter((e) => {
      if (!genreMatch(e, genre)) return false;
      if (!audienceMatch(e, audience)) return false;
      if (quick === "free" && !e.isFree) return false;
      if (quick === "weekend" && !isWeekend(e.startDate)) return false;
      if (quick === "today") {
        const s = e.startDate?.slice(0, 10);
        if (!s) return false;
        const en = e.endDate?.slice(0, 10) ?? s;
        if (!(s <= today && en >= today)) return false;
      }
      if (kw && ![e.title, e.venue, e.address].join(" ").toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [events, genre, audience, quick, q]);

  const points = useMemo(
    () => filtered.map((e) => ({ id: e.id, lat: e.lat!, lng: e.lng!, title: e.title, imageUrl: e.imageUrl })),
    [filtered]
  );

  // 목록은 현재 지도 화면 안의 것만
  const visible = useMemo(() => {
    const list = bounds
      ? filtered.filter((e) => e.lat! >= bounds.swLat && e.lat! <= bounds.neLat && e.lng! >= bounds.swLng && e.lng! <= bounds.neLng)
      : filtered;
    return [...list].sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));
  }, [filtered, bounds]);

  const selected = events.find((e) => e.id === selectedId) || null;
  const link = selected?.officialUrl || selected?.bookingUrl;

  function pick(e: ShowdayEvent) {
    setSelectedId(e.id);
    mapRef.current?.panTo(e.lat!, e.lng!, 4);
  }
  function onDistrict(v: string) {
    setDistrict(v);
    setSelectedId(null);
    if (!v) mapRef.current?.panTo(37.5665, 126.978, 8);
    else mapRef.current?.panTo(DISTRICTS[v][0], DISTRICTS[v][1], 6);
  }

  return (
    <div className="sm-app">
      <EventMap ref={mapRef} points={points} selectedId={selectedId} onSelect={setSelectedId} onBoundsChange={setBounds} />

      <div className="sm-mode" role="tablist" aria-label="보기 방식">
        <button className="on" role="tab" aria-selected="true">지도</button>
        <a role="tab" aria-selected="false" href={MAIN_SITE}>검색</a>
      </div>

      <div className="sm-zoom">
        <button aria-label="확대" onClick={() => mapRef.current?.zoom(1)}>+</button>
        <button aria-label="축소" onClick={() => mapRef.current?.zoom(-1)}>−</button>
      </div>
      <button className="sm-loc" aria-label="현재 위치" onClick={() => mapRef.current?.locate()}>◎</button>

      <aside className="sm-panel">
        <div className="sm-brand">SHOWDAY<small>MAP</small></div>
        <h1>오늘, 어디로<br />갈까요?</h1>
        <p className="sub">아이부터 어른까지, 공연·전시·축제를 지도에서 한눈에 찾아보세요.</p>

        <div className="sm-row">
          <select value={district} onChange={(e) => onDistrict(e.target.value)} aria-label="지역">
            <option value="">서울 전체</option>
            {Object.keys(DISTRICTS).map((d) => <option key={d}>{d}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="공연·장소 검색" aria-label="검색어" />
        </div>

        <div className="sm-label">누구와 함께</div>
        <div className="sm-chips">
          {AUDIENCES.map((a) => (
            <button key={a} className={audience === a ? "on" : ""} onClick={() => { setAudience(a); setSelectedId(null); }}>{a}</button>
          ))}
        </div>

        <div className="sm-label">장르</div>
        <div className="sm-chips">
          {GENRES.map((g) => (
            <button key={g} className={genre === g ? "on" : ""} onClick={() => { setGenre(g); setSelectedId(null); }}>{g}</button>
          ))}
        </div>

        <div className="sm-label">일정</div>
        <div className="sm-chips">
          {QUICK.map(([v, label]) => (
            <button key={v} className={quick === v ? "on" : ""} onClick={() => { setQuick(v); setSelectedId(null); }}>{label}</button>
          ))}
        </div>

        <button className="sm-list-head" onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen}>
          <span>지도에서 찾은 공연·행사 · <b>{loading ? "…" : visible.length}</b></span>
          <em>{listOpen ? "목록 접기 ⌃" : "목록 보기 ⌄"}</em>
        </button>

        {listOpen && (
          <ul className="sm-list">
            {!loading && visible.length === 0 && <li className="empty">이 지도 범위에는 조건에 맞는 행사가 없어요. 지도를 움직이거나 필터를 바꿔 보세요.</li>}
            {visible.slice(0, 80).map((e) => (
              <li key={e.id}>
                <button className={e.id === selectedId ? "on" : ""} onClick={() => pick(e)}>
                  {e.imageUrl ? <img src={e.imageUrl} alt="" loading="lazy" /> : <span className="ph">★</span>}
                  <span className="t">
                    <b>{e.title}</b>
                    <span>{e.venue || e.address || ""}</span>
                    <span>{e.dateText || ""}{e.isFree ? " · 무료" : ""}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

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
    </div>
  );
}
