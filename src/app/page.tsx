"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EventMap, { type Bounds, type EventMapHandle } from "@/components/EventMap";
import type { ShowdayEvent } from "@/lib/eventTypes";

const MAIN_SITE = "https://showday.kr";
const SEOUL = { lat: 37.5665, lng: 126.978 };

const DISTRICTS: Record<string, [number, number]> = {
  강남구:[37.5172,127.0473],강동구:[37.5301,127.1238],강북구:[37.6396,127.0257],강서구:[37.5509,126.8495],관악구:[37.4784,126.9516],광진구:[37.5385,127.0823],구로구:[37.4955,126.8876],금천구:[37.4569,126.8955],노원구:[37.6542,127.0568],도봉구:[37.6688,127.0471],동대문구:[37.5744,127.0396],동작구:[37.5124,126.9393],마포구:[37.5663,126.9019],서대문구:[37.5791,126.9368],서초구:[37.4837,127.0324],성동구:[37.5633,127.0369],성북구:[37.5894,127.0167],송파구:[37.5145,127.1059],양천구:[37.5170,126.8665],영등포구:[37.5264,126.8963],용산구:[37.5326,126.9905],은평구:[37.6027,126.9291],종로구:[37.5730,126.9794],중구:[37.5641,126.9979],중랑구:[37.6063,127.0927],
};

const RADII: [number, string][] = [[3, "3km"], [5, "5km"], [10, "10km"], [99, "서울 전체"]];
const CATS: [string, string][] = [["전체", "전체"], ["공연", "🎤 공연"], ["전시", "🎨 전시"], ["축제", "🎪 축제·행사"], ["체험", "🧑‍🎨 체험·배움"]];
const WHEN: [string, string][] = [["today", "오늘"], ["weekend", "이번 주말"], ["free", "무료"]];
const AUDIENCES = ["전체", "아이·가족", "어른", "시니어"];

type Origin = { lat: number; lng: number; label: string };

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function fmtDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}
function catMatch(e: ShowdayEvent, k: string) {
  if (k === "전체") return true;
  const t = `${e.category || ""} ${e.subcategory || ""}`;
  if (k === "공연") return /공연|콘서트|뮤지컬|연극|클래식|무용|국악/.test(t);
  if (k === "체험") return /체험|교육|배움|강좌/.test(t);
  return t.includes(k);
}
// 출처 데이터의 대상·연령 문구를 키워드로 판별한다(정확도는 출처 데이터에 따라 다를 수 있음).
const KID_RE = /어린이|유아|영유아|아동|키즈|초등|가족|아이|청소년/;
const SENIOR_RE = /시니어|어르신|노인|실버|50\+|60\+|중장년|경로/;
function audienceMatch(e: ShowdayEvent, a: string) {
  if (a === "전체") return true;
  const t = [e.target, e.ageText, e.title, e.subcategory].join(" ");
  const kid = e.familyAllowed === true || KID_RE.test(t);
  if (a === "아이·가족") return kid;
  if (a === "시니어") return SENIOR_RE.test(t);
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
  const [mapReady, setMapReady] = useState(false);
  const [events, setEvents] = useState<ShowdayEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [origin, setOrigin] = useState<Origin | null>(null);
  const [radius, setRadius] = useState<number>(99);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");

  const [cat, setCat] = useState("전체");
  const [when, setWhen] = useState<string[]>([]);
  const [audience, setAudience] = useState("전체");
  const [q, setQ] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

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

  // 기준 위치/반경이 바뀌면 지도에 표시하고 그 범위로 이동
  useEffect(() => {
    if (!mapReady) return;
    if (origin) mapRef.current?.showOrigin(origin.lat, origin.lng, radius < 99 ? radius : null);
    else mapRef.current?.clearOrigin();
  }, [origin, radius, mapReady]);

  function locate(nextRadius?: number) {
    setNote("");
    if (!navigator.geolocation) {
      setNote("이 브라우저에서는 위치를 사용할 수 없어요. 아래에서 지역을 직접 골라 주세요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "내 위치" });
        setRadius(nextRadius ?? (radius === 99 ? 5 : radius));
        setSelectedId(null);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setNote("위치 권한이 꺼져 있어요. 브라우저 주소창의 위치 허용을 켜거나, 아래에서 지역을 직접 골라 주세요.");
      },
      { timeout: 8000, maximumAge: 300000 }
    );
  }
  function onRadius(r: number) {
    setSelectedId(null);
    if (r === 99) {
      setRadius(99);
      setOrigin(null);
      mapRef.current?.panTo(SEOUL.lat, SEOUL.lng, 8);
      return;
    }
    if (!origin) locate(r);
    else setRadius(r);
  }
  function onDistrict(v: string) {
    setSelectedId(null);
    if (!v) {
      setOrigin(null);
      setRadius(99);
      mapRef.current?.panTo(SEOUL.lat, SEOUL.lng, 8);
      return;
    }
    setOrigin({ lat: DISTRICTS[v][0], lng: DISTRICTS[v][1], label: v });
    if (radius === 99) setRadius(5);
  }
  function toggleWhen(v: string) {
    setSelectedId(null);
    setWhen((w) => (w.includes(v) ? w.filter((x) => x !== v) : [...w, v]));
  }

  // 조건 필터(장르·일정·대상·검색어)
  const filtered = useMemo(() => {
    const today = seoulToday();
    const kw = q.trim().toLowerCase();
    return events.filter((e) => {
      if (!catMatch(e, cat)) return false;
      if (!audienceMatch(e, audience)) return false;
      if (when.includes("free") && !e.isFree) return false;
      if (when.includes("weekend") && !isWeekend(e.startDate)) return false;
      if (when.includes("today")) {
        const s = e.startDate?.slice(0, 10);
        if (!s) return false;
        const en = e.endDate?.slice(0, 10) ?? s;
        if (!(s <= today && en >= today)) return false;
      }
      if (kw && ![e.title, e.venue, e.address].join(" ").toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [events, cat, when, audience, q]);

  // 기준 위치가 있으면 거리 계산 + 반경 필터 + 가까운 순
  const results = useMemo(() => {
    if (origin) {
      const list = filtered
        .map((e) => ({ e, d: haversine(origin.lat, origin.lng, e.lat!, e.lng!) }))
        .filter((x) => radius >= 99 || x.d <= radius)
        .sort((a, b) => a.d - b.d);
      return list;
    }
    const inView = bounds
      ? filtered.filter((e) => e.lat! >= bounds.swLat && e.lat! <= bounds.neLat && e.lng! >= bounds.swLng && e.lng! <= bounds.neLng)
      : filtered;
    return [...inView]
      .sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"))
      .map((e) => ({ e, d: null as number | null }));
  }, [filtered, origin, radius, bounds]);

  const points = useMemo(
    () => (origin ? results : filtered.map((e) => ({ e }))).map((x) => ({ id: x.e.id, lat: x.e.lat!, lng: x.e.lng!, title: x.e.title, imageUrl: x.e.imageUrl })),
    [results, filtered, origin]
  );

  const selected = events.find((e) => e.id === selectedId) || null;
  const link = selected?.officialUrl || selected?.bookingUrl;
  const heading = origin
    ? `${origin.label} 기준 ${radius >= 99 ? "가까운 순" : `${radius}km 이내`}`
    : "지도에 보이는 공연·행사";

  function pick(e: ShowdayEvent) {
    setSelectedId(e.id);
    mapRef.current?.panTo(e.lat!, e.lng!, 4);
  }

  return (
    <div className="sm-app">
      <EventMap
        ref={mapRef}
        points={points}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onBoundsChange={setBounds}
        onReady={() => setMapReady(true)}
      />

      <div className="sm-mode" role="tablist" aria-label="보기 방식">
        <button className="on" role="tab" aria-selected="true">지도</button>
        <a role="tab" aria-selected="false" href={MAIN_SITE}>검색</a>
      </div>

      <div className="sm-zoom">
        <button aria-label="확대" onClick={() => mapRef.current?.zoom(1)}>+</button>
        <button aria-label="축소" onClick={() => mapRef.current?.zoom(-1)}>−</button>
      </div>
      <button className="sm-loc" aria-label="내 위치로" onClick={() => locate()}>◎</button>

      <aside className="sm-panel">
        <div className="sm-head">
          <div className="sm-brand">SHOWDAY<small>MAP</small></div>
          <h1>내 근처, 오늘 뭐 하지?</h1>
        </div>

        <div className="sm-block">
          <button className={`sm-cta${origin?.label === "내 위치" ? " on" : ""}`} onClick={() => locate()} disabled={locating}>
            <span aria-hidden>📍</span>
            {locating ? "위치 확인 중…" : origin?.label === "내 위치" ? "내 위치 기준으로 보는 중" : "내 근처 찾기"}
          </button>
          <div className="sm-seg" role="group" aria-label="거리">
            {RADII.map(([r, label]) => (
              <button key={r} className={radius === r ? "on" : ""} onClick={() => onRadius(r)}>{label}</button>
            ))}
          </div>
          <select className="sm-select" value={origin && origin.label !== "내 위치" ? origin.label : ""} onChange={(e) => onDistrict(e.target.value)} aria-label="지역 직접 선택">
            <option value="">또는 지역 직접 선택</option>
            {Object.keys(DISTRICTS).map((d) => <option key={d}>{d}</option>)}
          </select>
          {note && <p className="sm-note">{note}</p>}
        </div>

        <div className="sm-block">
          <div className="sm-label">언제·조건</div>
          <div className="sm-chips">
            {WHEN.map(([v, label]) => (
              <button key={v} className={when.includes(v) ? "on" : ""} onClick={() => toggleWhen(v)}>{label}</button>
            ))}
          </div>
          <div className="sm-label">무엇을</div>
          <div className="sm-chips">
            {CATS.map(([v, label]) => (
              <button key={v} className={cat === v ? "on" : ""} onClick={() => { setCat(v); setSelectedId(null); }}>{label}</button>
            ))}
          </div>
          <button className="sm-more" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
            상세 필터 {moreOpen ? "⌃" : "⌄"}
          </button>
          {moreOpen && (
            <div className="sm-more-body">
              <div className="sm-label">누구와</div>
              <div className="sm-chips">
                {AUDIENCES.map((a) => (
                  <button key={a} className={audience === a ? "on" : ""} onClick={() => { setAudience(a); setSelectedId(null); }}>{a}</button>
                ))}
              </div>
              <input className="sm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="공연·장소 이름으로 검색" aria-label="검색어" />
            </div>
          )}
        </div>

        <button className="sm-list-head" onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen}>
          <span>{heading} · <b>{loading ? "…" : results.length}곳</b></span>
          <em>{listOpen ? "접기 ⌃" : "펼치기 ⌄"}</em>
        </button>

        {listOpen && (
          <ul className="sm-list">
            {!loading && results.length === 0 && (
              <li className="empty">
                {origin ? "이 반경 안에는 조건에 맞는 행사가 없어요. 거리를 넓혀 보세요." : "이 지도 범위에는 조건에 맞는 행사가 없어요. 지도를 움직이거나 조건을 바꿔 보세요."}
              </li>
            )}
            {results.slice(0, 80).map(({ e, d }) => (
              <li key={e.id}>
                <button className={e.id === selectedId ? "on" : ""} onClick={() => pick(e)}>
                  {e.imageUrl ? <img src={e.imageUrl} alt="" loading="lazy" /> : <span className="ph">★</span>}
                  <span className="t">
                    <span className="meta">
                      {d != null && <i className="dist">{fmtDist(d)}</i>}
                      <i className="cat">{e.subcategory || e.category}</i>
                      {e.isFree && <i className="free">무료</i>}
                    </span>
                    <b>{e.title}</b>
                    <span>{e.venue || e.address || ""}</span>
                    <span>{e.dateText || ""}</span>
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
