"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EventMap, { type Bounds, type EventMapHandle } from "@/components/EventMap";
import type { ShowdayEvent } from "@/lib/eventTypes";
import { CAT_META, CAT_ORDER, catKey, type CatKey } from "@/lib/eventMeta";

const MAIN_SITE = "https://showday.kr";
const SEOUL = { lat: 37.5665, lng: 126.978 };

const DISTRICTS: Record<string, [number, number]> = {
  강남구:[37.5172,127.0473],강동구:[37.5301,127.1238],강북구:[37.6396,127.0257],강서구:[37.5509,126.8495],관악구:[37.4784,126.9516],광진구:[37.5385,127.0823],구로구:[37.4955,126.8876],금천구:[37.4569,126.8955],노원구:[37.6542,127.0568],도봉구:[37.6688,127.0471],동대문구:[37.5744,127.0396],동작구:[37.5124,126.9393],마포구:[37.5663,126.9019],서대문구:[37.5791,126.9368],서초구:[37.4837,127.0324],성동구:[37.5633,127.0369],성북구:[37.5894,127.0167],송파구:[37.5145,127.1059],양천구:[37.5170,126.8665],영등포구:[37.5264,126.8963],용산구:[37.5326,126.9905],은평구:[37.6027,126.9291],종로구:[37.5730,126.9794],중구:[37.5641,126.9979],중랑구:[37.6063,127.0927],
};

const RADII: [number, string][] = [[3, "3km"], [5, "5km"], [10, "10km"], [99, "서울 전체"]];
const WHEN: [string, string][] = [["today", "오늘"], ["weekend", "이번 주말"], ["free", "💸 0원"], ["indoor", "🏠 실내"], ["walkin", "🚪 예약 없이"]];
const AUDIENCES: [string, string][] = [["전체", "전체"], ["아이·가족", "👨‍👩‍👧 아이·가족"], ["어른", "🧑 어른·친구·연인"], ["시니어", "👵 부모님·시니어"]];
// 시간 → 코스에 담을 곳 수
const TIMES: [string, string, number][] = [["1h", "1시간", 1], ["3h", "3시간", 2], ["half", "반나절", 3], ["day", "하루", 4]];

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
  return k === "전체" || catKey(e) === k;
}
// 사전 예약이 필요 없어 보이는 행사(예매 링크·예약/신청 문구가 없는 경우). 정확한 확인은 상세 페이지에서.
function isWalkIn(e: ShowdayEvent) {
  if (e.bookingUrl) return false;
  return !/예약|신청|사전|접수|예매|추첨/.test([e.title, e.priceText, e.dateText, e.target].join(" "));
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
// 실내 여부: 출처 데이터에 실내/야외 구분이 없어 장소·제목 키워드로 판별한다(모르는 경우는 실내로 보지 않음).
const INDOOR_RE = /박물관|미술관|도서관|전시|공연장|극장|아트|센터|홀|체험관|문화관|회관|갤러리|콘서트|뮤지컬|연극|클래식|교육|강좌|스튜디오|기념관|과학관|문화원|예술/;
function isIndoor(e: ShowdayEvent) {
  const t = [e.venue, e.address, e.title, e.subcategory, e.category].join(" ");
  if (/야외|둘레길|산책|캠핑|한강|공원 내|숲길/.test(t) && !/실내/.test(t)) return false;
  return INDOOR_RE.test(t);
}
/** 시간에 맞춘 코스: 날씨가 나쁘면 전시→체험→공연, 아니면 체험→축제→전시→공연 순으로, 서로 가까운 곳끼리 이어 붙인다. */
type Row = { e: ShowdayEvent; d: number | null };
function buildCourse(rows: Row[], n: number, bad: boolean): { e: ShowdayEvent; from: number | null }[] {
  const pool = rows.slice(0, 80);
  if (!pool.length) return [];
  const prefs: CatKey[] = bad ? ["전시", "체험", "공연", "축제"] : ["체험", "축제", "전시", "공연"];
  const used = new Set<string>();
  const out: { e: ShowdayEvent; from: number | null }[] = [];
  const first = pool.find((r) => catKey(r.e) === prefs[0]) || pool[0];
  out.push({ e: first.e, from: first.d });
  used.add(first.e.id);
  const usedCats = new Set<CatKey>([catKey(first.e)]);
  while (out.length < n) {
    const last = out[out.length - 1].e;
    const cand = pool
      .filter((r) => !used.has(r.e.id))
      .map((r) => ({ r, km: haversine(last.lat!, last.lng!, r.e.lat!, r.e.lng!), fresh: !usedCats.has(catKey(r.e)) }))
      .filter((x) => x.km <= 8)
      .sort((a, b) => Number(b.fresh) - Number(a.fresh) || prefs.indexOf(catKey(a.r.e)) - prefs.indexOf(catKey(b.r.e)) || a.km - b.km);
    const next = cand[0];
    if (!next) break;
    out.push({ e: next.r.e, from: next.km });
    used.add(next.r.e.id);
    usedCats.add(catKey(next.r.e));
  }
  return out;
}

function Thumb({ e, cls }: { e: ShowdayEvent; cls: string }) {
  const [bad, setBad] = useState(false);
  const m = CAT_META[catKey(e)];
  if (!e.imageUrl || bad) return <span className={`${cls} ph`} style={{ background: m.soft, color: m.color }}>{m.icon}</span>;
  return <img className={cls} src={e.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

type Weather = { ok: boolean; temp?: number; label?: string; emoji?: string; bad?: boolean };
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
  const [time, setTime] = useState("");
  const [toast, setToast] = useState("");
  const initId = useRef<string | null>(null);
  const urlReady = useRef(false);
  const [when, setWhen] = useState<string[]>([]);
  const [audience, setAudience] = useState("전체");
  const [q, setQ] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [weather, setWeather] = useState<Weather | null>(null);
  const autoIndoor = useRef(false);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d?.events) ? d.events : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 주소창(URL)에서 필터 복원 → 링크로 공유 가능
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("c")) setCat(p.get("c")!);
    if (p.get("w")) setWhen(p.get("w")!.split(",").filter(Boolean));
    if (p.get("a")) setAudience(p.get("a")!);
    if (p.get("t")) setTime(p.get("t")!);
    if (p.get("q")) setQ(p.get("q")!);
    if (p.get("d") && DISTRICTS[p.get("d")!]) {
      const d = p.get("d")!;
      setOrigin({ lat: DISTRICTS[d][0], lng: DISTRICTS[d][1], label: d });
      setRadius(Number(p.get("r")) || 5);
    }
    if (p.get("w")?.includes("indoor")) autoIndoor.current = true;
    initId.current = p.get("e");
    urlReady.current = true;
  }, []);
  useEffect(() => {
    if (!urlReady.current) return;
    const p = new URLSearchParams();
    if (cat !== "전체") p.set("c", cat);
    if (when.length) p.set("w", when.join(","));
    if (audience !== "전체") p.set("a", audience);
    if (time) p.set("t", time);
    if (q.trim()) p.set("q", q.trim());
    if (origin && origin.label !== "내 위치") { p.set("d", origin.label); p.set("r", String(radius)); }
    if (selectedId) p.set("e", selectedId);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [cat, when, audience, time, q, origin, radius, selectedId]);
  useEffect(() => {
    if (!initId.current || !mapReady || !events.length) return;
    const e = events.find((x) => x.id === initId.current);
    initId.current = null;
    if (e) { setSelectedId(e.id); mapRef.current?.panTo(e.lat!, e.lng!, 4); }
  }, [events, mapReady]);

  // 날씨: 기준 위치(없으면 서울) 기준. 비·눈이면 처음 한 번 자동으로 "실내"를 켠다.
  const wLat = origin?.lat ?? SEOUL.lat;
  const wLng = origin?.lng ?? SEOUL.lng;
  useEffect(() => {
    let ignore = false;
    fetch(`/api/weather?lat=${wLat.toFixed(2)}&lng=${wLng.toFixed(2)}`)
      .then((r) => r.json())
      .then((w: Weather) => {
        if (ignore || !w?.ok) return;
        setWeather(w);
        if (w.bad && !autoIndoor.current) {
          autoIndoor.current = true;
          setWhen((prev) => (prev.includes("indoor") ? prev : [...prev, "indoor"]));
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [wLat, wLng]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2200); }
  async function share(id?: string) {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("e", id);
    const text = u.toString();
    try {
      if (navigator.share) await navigator.share({ title: "SHOWDAY MAP", url: text });
      else { await navigator.clipboard.writeText(text); flash("링크를 복사했어요"); }
    } catch { /* 취소 */ }
  }
  function resetAll() {
    setCat("전체"); setWhen([]); setAudience("전체"); setTime(""); setQ(""); setSelectedId(null);
    autoIndoor.current = true;
  }

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
  const baseFiltered = useMemo(() => {
    const today = seoulToday();
    const kw = q.trim().toLowerCase();
    return events.filter((e) => {
      if (!audienceMatch(e, audience)) return false;
      if (when.includes("free") && !e.isFree) return false;
      if (when.includes("weekend") && !isWeekend(e.startDate)) return false;
      if (when.includes("indoor") && !isIndoor(e)) return false;
      if (when.includes("walkin") && !isWalkIn(e)) return false;
      if (when.includes("today")) {
        const s = e.startDate?.slice(0, 10);
        if (!s) return false;
        const en = e.endDate?.slice(0, 10) ?? s;
        if (!(s <= today && en >= today)) return false;
      }
      if (kw && ![e.title, e.venue, e.address].join(" ").toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [events, when, audience, q]);
  const filtered = useMemo(() => baseFiltered.filter((e) => catMatch(e, cat)), [baseFiltered, cat]);

  // 유형별 개수(반경 안, 유형 선택은 제외)
  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: 0 };
    baseFiltered.forEach((e) => {
      if (origin && radius < 99 && haversine(origin.lat, origin.lng, e.lat!, e.lng!) > radius) return;
      c.전체++;
      const k = catKey(e);
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [baseFiltered, origin, radius]);

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
    () => (origin ? results : filtered.map((e) => ({ e }))).map((x) => ({ id: x.e.id, lat: x.e.lat!, lng: x.e.lng!, title: x.e.title, imageUrl: x.e.imageUrl, category: catKey(x.e), isFree: x.e.isFree, dateText: x.e.dateText })),
    [results, filtered, origin]
  );

  const selected = events.find((e) => e.id === selectedId) || null;
  const link = selected?.officialUrl || selected?.bookingUrl;
  const heading = origin
    ? `${origin.label} 기준 ${radius >= 99 ? "가까운 순" : `${radius}km 이내`}`
    : "지도에 보이는 공연·행사";

  const timeN = TIMES.find((t) => t[0] === time)?.[2] ?? 0;
  const course = useMemo(
    () => (timeN ? buildCourse(results as Row[], timeN, !!weather?.bad) : []),
    [results, timeN, weather?.bad]
  );
  const selDist = selected && origin ? haversine(origin.lat, origin.lng, selected.lat!, selected.lng!) : null;
  const activeFilters = cat !== "전체" || when.length > 0 || audience !== "전체" || !!time || !!q.trim();

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
          <div className="sm-headrow">
            <div className="sm-brand">SHOWDAY<small>MAP</small></div>
            <div className="sm-tools">
              <button onClick={() => share()} aria-label="이 화면 공유">🔗 공유</button>
              {activeFilters && <button onClick={resetAll}>모두 해제</button>}
            </div>
          </div>
          <h1>내 근처, 오늘 뭐 하지?</h1>
          <p className="sm-sub">오늘, 어떻게 보내고 싶으세요?</p>
          {weather?.ok && (
            <div className={`sm-weather${weather.bad ? " bad" : ""}`}>
              <span className="w">{weather.emoji} {weather.label} {weather.temp}°</span>
              <span className="m">
                {weather.bad
                  ? when.includes("indoor") ? "비·눈이 오네요. 실내에서 즐길 수 있는 곳을 먼저 보여드려요." : "비·눈 소식이 있어요. 실내가 편해요."
                  : "야외 나들이도 좋아요"}
              </span>
              {weather.bad && (
                <button onClick={() => toggleWhen("indoor")}>{when.includes("indoor") ? "실내만 해제" : "실내만 보기"}</button>
              )}
            </div>
          )}
        </div>

        <div className="sm-scroll">
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
          <div className="sm-label">무엇을 · 유형</div>
          <div className="sm-cats">
            <button className={cat === "전체" ? "on" : ""} style={{ ["--c" as any]: "#b85f35" }} onClick={() => { setCat("전체"); setSelectedId(null); }}>
              <span>🗺️</span><b>전체</b><em>{counts.전체 || 0}</em>
            </button>
            {CAT_ORDER.map((k) => (
              <button key={k} className={cat === k ? "on" : ""} style={{ ["--c" as any]: CAT_META[k].color, ["--s" as any]: CAT_META[k].soft }} onClick={() => { setCat(cat === k ? "전체" : k); setSelectedId(null); }}>
                <span>{CAT_META[k].icon}</span><b>{CAT_META[k].label}</b><em>{counts[k] || 0}</em>
              </button>
            ))}
          </div>

          <div className="sm-label">언제·조건</div>
          <div className="sm-chips">
            {WHEN.map(([v, label]) => (
              <button key={v} className={when.includes(v) ? "on" : ""} onClick={() => toggleWhen(v)}>{label}</button>
            ))}
          </div>

          <div className="sm-label">얼마나 시간 있어요? <small>코스로 짜드려요</small></div>
          <div className="sm-seg" role="group" aria-label="시간">
            {TIMES.map(([v, label]) => (
              <button key={v} className={time === v ? "on" : ""} onClick={() => setTime(time === v ? "" : v)}>{label}</button>
            ))}
          </div>

          <button className="sm-more" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
            상세 필터 {moreOpen ? "⌃" : "⌄"}
          </button>
          {moreOpen && (
            <div className="sm-more-body">
              <div className="sm-label">누구와</div>
              <div className="sm-chips">
                {AUDIENCES.map(([v, label]) => (
                  <button key={v} className={audience === v ? "on" : ""} onClick={() => { setAudience(v); setSelectedId(null); }}>{label}</button>
                ))}
              </div>
              <input className="sm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="공연·장소 이름으로 검색" aria-label="검색어" />
            </div>
          )}
        </div>

        {course.length > 0 && (
          <div className="sm-course">
            <div className="sm-course-h">
              🧭 {TIMES.find((t) => t[0] === time)?.[1]} 코스{weather?.bad ? " · 실내 위주" : ""}
            </div>
            <ol>
              {course.map((c, i) => {
                const m = CAT_META[catKey(c.e)];
                return (
                  <li key={c.e.id}>
                    <button onClick={() => pick(c.e)}>
                      <span className="n" style={{ background: m.color }}>{i + 1}</span>
                      <span className="tx">
                        <b>{c.e.title}</b>
                        <em>{m.icon} {m.label}{c.e.isFree ? " · 0원" : ""}{c.from != null ? ` · ${i === 0 && origin ? "" : "앞 코스에서 "}${fmtDist(c.from)}` : ""}</em>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
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
            {results.slice(0, 80).map(({ e, d }) => {
              const m = CAT_META[catKey(e)];
              return (
                <li key={e.id}>
                  <button className={e.id === selectedId ? "on" : ""} onClick={() => pick(e)}>
                    <Thumb e={e} cls="th" />
                    <span className="t">
                      <span className="meta">
                        <i className="type" style={{ background: m.color }}>{m.icon} {m.label.split("·")[0]}</i>
                        {d != null && <i className="dist">{fmtDist(d)}</i>}
                        {e.isFree && <i className="free">0원</i>}
                      </span>
                      <b>{e.title}</b>
                      <span>{e.venue || e.address || ""}</span>
                      <span>{e.dateText || ""}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </aside>

      {toast && <div className="sm-toast">{toast}</div>}

      {selected && (() => {
        const m = CAT_META[catKey(selected)];
        return (
          <div className="sm-card" style={{ ["--c" as any]: m.color }}>
            <button className="x" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button>
            <Thumb e={selected} cls="cimg" />
            <div>
              <span className="tag" style={{ background: m.color }}>{m.icon} {m.label}</span>
              {selected.isFree && <span className="tag free">0원</span>}
              <h3>{selected.title}</h3>
              <p>{selected.dateText || "일정 확인 필요"}</p>
              <p>{selected.venue || selected.address || ""}{selDist != null ? ` · ${fmtDist(selDist)}` : ""}</p>
              {!selected.isFree && selected.priceText && <p>{selected.priceText}</p>}
              <div className="acts">
                {link && <a href={link} target="_blank" rel="noopener noreferrer">자세히 · 예매</a>}
                <a className="sub" href={`https://map.kakao.com/link/to/${encodeURIComponent(selected.venue || selected.title)},${selected.lat},${selected.lng}`} target="_blank" rel="noopener noreferrer">길찾기</a>
                <button className="sub" onClick={() => share(selected.id)}>공유</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
