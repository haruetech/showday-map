"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EventMap, { type Bounds, type EventMapHandle } from "@/components/EventMap";
import type { ShowdayEvent } from "@/lib/eventTypes";
import { ICONS } from "@/lib/icons";
import { CAT_META, CAT_ORDER, catKey, type CatKey } from "@/lib/eventMeta";

const MAIN_SITE = "https://showday.kr";
const MAIN_SEARCH = "https://showday.kr/search";
const SEOUL = { lat: 37.5665, lng: 126.978 };

const DISTRICTS: Record<string, [number, number]> = {
  강남구:[37.5172,127.0473],강동구:[37.5301,127.1238],강북구:[37.6396,127.0257],강서구:[37.5509,126.8495],관악구:[37.4784,126.9516],광진구:[37.5385,127.0823],구로구:[37.4955,126.8876],금천구:[37.4569,126.8955],노원구:[37.6542,127.0568],도봉구:[37.6688,127.0471],동대문구:[37.5744,127.0396],동작구:[37.5124,126.9393],마포구:[37.5663,126.9019],서대문구:[37.5791,126.9368],서초구:[37.4837,127.0324],성동구:[37.5633,127.0369],성북구:[37.5894,127.0167],송파구:[37.5145,127.1059],양천구:[37.5170,126.8665],영등포구:[37.5264,126.8963],용산구:[37.5326,126.9905],은평구:[37.6027,126.9291],종로구:[37.5730,126.9794],중구:[37.5641,126.9979],중랑구:[37.6063,127.0927],
};

const RADII: [number, string][] = [[3, "3km"], [5, "5km"], [10, "10km"], [99, "서울 전체"]];
const WHEN: [string, string][] = [["today", "오늘"], ["weekend", "이번 주말"], ["free", "0원"], ["indoor", "실내"], ["walkin", "예약 없이"]];
const AUDIENCES: [string, string][] = [["전체", "전체"], ["아이·가족", "아이·가족"], ["어른", "어른·친구·연인"], ["시니어", "부모님·시니어"]];
// 시간 → 코스에 담을 곳 수
// 우측 유형 팝업의 세부 테마(제목·소분류·장소 키워드로 판별 — 출처 데이터에 따라 정확도가 달라질 수 있음)
const THEMES: Record<CatKey, [string, RegExp][]> = {
  체험: [["만들기·공예", /만들기|공예|도예|목공|DIY|클래스|워크숍|자수|캔들/], ["과학·자연", /과학|생태|숲|자연|곤충|천문|식물|환경/], ["요리·먹거리", /요리|쿠킹|베이킹|제과|제빵|농부|수확|음식/], ["배움·강좌", /강좌|강연|교육|배움|코딩|독서|글쓰기|인문/]],
  전시: [["미술·아트", /미술|회화|조각|아트|작품|페인팅|드로잉/], ["사진·미디어", /사진|미디어|영상|디지털|빛|라이트/], ["역사·문화", /역사|박물|유물|문화재|전통|기념/], ["어린이·가족", /어린이|키즈|아동|가족|체험전/]],
  공연: [["뮤지컬·연극", /뮤지컬|연극|극단/], ["클래식·국악", /클래식|오케스트라|국악|오페라|음악회|협주/], ["콘서트·밴드", /콘서트|밴드|재즈|팝|가요|트로트/], ["무용·가족극", /무용|발레|댄스|인형극|가족극|어린이/]],
  축제: [["지역 축제", /축제|페스티벌|페스티발/], ["야외·공원", /야외|공원|광장|둘레길|한강/], ["전통·문화", /전통|국악|민속|문화제|한복/], ["먹거리·마켓", /푸드|먹거리|마켓|장터|시장/]],
  기타: [],
};

const TIMES: [string, string, number][] = [["1h", "1시간", 1], ["3h", "3시간", 2], ["half", "반나절", 3], ["day", "하루", 4]];

const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_URL || "";
const SOURCES: [string, string, string][] = [
  ["공연예술통합전산망(KOPIS)", "https://www.kopis.or.kr", "공연 일정·장소·요금"],
  ["문화포털(한국문화정보원)", "https://www.culture.go.kr", "전시·공연·문화행사"],
  ["서울시 공공서비스예약", "https://yeyak.seoul.go.kr", "체험·교육·문화행사 예약 정보"],
  ["한국관광공사 TourAPI", "https://api.visitkorea.or.kr", "축제·행사·관광지"],
  ["청소년 활동·산림교육 프로그램", "", "공공기관이 공개한 체험·교육 프로그램 정보"],
  ["카카오맵", "https://developers.kakao.com", "지도·위치"],
  ["Open-Meteo", "https://open-meteo.com", "날씨(비·눈 여부)"],
];

const SRC_LABEL: Record<string, string> = {
  KOPIS: "공연예술통합전산망(KOPIS)",
  SEOUL_RESERVATION: "서울시 공공서비스예약",
  CULTURE_PORTAL: "문화포털(한국문화정보원)",
  TOUR_API: "한국관광공사 TourAPI",
  YOUTH_PROGRAM: "청소년 활동 프로그램(공공데이터)",
  FOREST_EDU: "산림교육 프로그램(공공데이터)",
};
type Story = { title: string; desc: string; link: string; blogger: string; date: string };

/** 진행 상태 뱃지: 오늘 기준 종료/진행 중/오늘 마감/곧 시작 */
function statusOf(e: ShowdayEvent, today: string): { label: string; tone: "live" | "soon" | "end" } | null {
  const s = e.startDate?.slice(0, 10);
  if (!s) return null;
  const en = e.endDate?.slice(0, 10) ?? s;
  if (en < today) return { label: "종료", tone: "end" };
  if (s > today) {
    const d = Math.round((new Date(s).getTime() - new Date(today).getTime()) / 86400000);
    return { label: d <= 7 ? `D-${d} 시작` : "예정", tone: "soon" };
  }
  return { label: en === today ? "오늘 마감" : "진행 중", tone: "live" };
}
function downloadIcs(e: ShowdayEvent) {
  const s = e.startDate?.slice(0, 10);
  if (!s) return;
  const en = e.endDate?.slice(0, 10) ?? s;
  const d = (iso: string) => iso.replace(/-/g, "");
  const endEx = new Date(new Date(en).getTime() + 86400000).toISOString().slice(0, 10);
  const esc = (t: string) => t.replace(/[\\,;]/g, (m) => "\\" + m).replace(/\n/g, " ");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SHOWDAY MAP//KO", "BEGIN:VEVENT",
    `UID:${e.id}@map.showday.kr`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d(s)}`, `DTEND;VALUE=DATE:${d(endEx)}`,
    `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.venue || e.address || "")}`,
    `DESCRIPTION:${esc((e.dateText || "") + " " + (e.officialUrl || e.bookingUrl || ""))}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  a.download = "showday-event.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Ico({ n, size = 16 }: { n: string; size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[n] || "" }} />
  );
}
function weatherIco(label?: string) {
  if (!label) return "sun";
  if (/눈/.test(label)) return "snow";
  if (/비|소나기|뇌우|이슬비|천둥/.test(label)) return "rain";
  if (/흐림|구름|안개/.test(label)) return "cloud";
  return "sun";
}
const WHEN_ICO: Record<string, string> = { free: "won", indoor: "home", walkin: "check" };

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
  if (!e.imageUrl || bad) return <span className={`${cls} ph`} style={{ background: m.soft, color: m.color }}><Ico n={m.ico} size={26} /></span>;
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
  const [pop, setPop] = useState<CatKey | null>(null);
  const [routeMode, setRouteMode] = useState<"easy" | "accessible" | "walk" | "rest" | null>(null);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [theme, setTheme] = useState("");
  const [scope, setScope] = useState<"area" | "all">("area");
  const [stories, setStories] = useState<{ id: string; configured: boolean; items: Story[] } | null>(null);
  const [info, setInfo] = useState<null | "intro" | "report" | "source">(null);
  const [toast, setToast] = useState("");
  const initId = useRef<string | null>(null);
  const urlReady = useRef(false);
  const [when, setWhen] = useState<string[]>([]);
  const [audience, setAudience] = useState("전체");
  const [q, setQ] = useState("");

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
    if (p.get("th")) setTheme(p.get("th")!);
    if (p.get("sc") === "all") setScope("all");
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
    if (theme) p.set("th", theme);
    if (scope === "all") p.set("sc", "all");
    if (q.trim()) p.set("q", q.trim());
    if (origin && origin.label !== "내 위치") { p.set("d", origin.label); p.set("r", String(radius)); }
    if (selectedId) p.set("e", selectedId);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [cat, when, audience, time, theme, scope, q, origin, radius, selectedId]);
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
  // 다녀온 이야기(블로그 후기): 선택한 행사가 바뀔 때만 불러온다
  useEffect(() => {
    const ev = events.find((x) => x.id === selectedId);
    if (!ev) { setStories(null); return; }
    let ignore = false;
    setStories(null);
    fetch(`/api/stories?q=${encodeURIComponent(ev.title)}`)
      .then((r) => r.json())
      .then((d) => { if (!ignore) setStories({ id: ev.id, configured: !!d?.configured, items: Array.isArray(d?.items) ? d.items : [] }); })
      .catch(() => { if (!ignore) setStories({ id: ev.id, configured: false, items: [] }); });
    return () => { ignore = true; };
  }, [selectedId, events]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2600); }
  async function copyText(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }
  // 공유: 휴대폰은 공유창, 컴퓨터는 링크 복사(복사했다는 안내가 뜬다)
  async function share(id?: string) {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("e", id);
    const url = u.toString();
    const ev = id ? events.find((x) => x.id === id) : null;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.share) {
      try {
        await navigator.share({ title: ev ? ev.title : "SHOWDAY MAP", text: ev ? `${ev.title} — SHOWDAY MAP` : "오늘 내 근처 공연·전시·축제·체험", url });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    flash((await copyText(url)) ? "링크를 복사했어요. 붙여넣기로 공유하세요" : "복사에 실패했어요. 주소창의 링크를 직접 복사해 주세요");
  }
  function resetAll() {
    setCat("전체"); setWhen([]); setAudience("전체"); setTime(""); setTheme(""); setScope("area"); setQ(""); setSelectedId(null);
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
      if (kw && ![e.title, e.venue, e.address, e.category, e.subcategory, e.target, e.ageText].join(" ").toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [events, when, audience, q]);
  const filtered = useMemo(() => {
    const re = cat !== "전체" && theme ? THEMES[cat as CatKey]?.find((t) => t[0] === theme)?.[1] : null;
    return baseFiltered.filter((e) => catMatch(e, cat) && (!re || re.test([e.title, e.subcategory, e.venue, e.category].join(" "))));
  }, [baseFiltered, cat, theme]);

  // 유형별 개수(반경 안, 유형 선택은 제외)
  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: 0 };
    baseFiltered.forEach((e) => {
      if (origin && radius < 99 && scope === "area" && haversine(origin.lat, origin.lng, e.lat!, e.lng!) > radius) return;
      c.전체++;
      const k = catKey(e);
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [baseFiltered, origin, radius, scope]);

  // 기준 위치가 있으면 거리 계산 + 반경 필터 + 가까운 순
  const results = useMemo(() => {
    if (origin) {
      const list = filtered
        .map((e) => ({ e, d: haversine(origin.lat, origin.lng, e.lat!, e.lng!) }))
        .filter((x) => radius >= 99 || scope === "all" || x.d <= radius)
        .sort((a, b) => a.d - b.d);
      return list;
    }
    const inView = bounds && scope === "area"
      ? filtered.filter((e) => e.lat! >= bounds.swLat && e.lat! <= bounds.neLat && e.lng! >= bounds.swLng && e.lng! <= bounds.neLng)
      : filtered;
    return [...inView]
      .sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"))
      .map((e) => ({ e, d: null as number | null }));
  }, [filtered, origin, radius, bounds, scope]);

  const points = useMemo(
    () => (origin ? results : filtered.map((e) => ({ e }))).map((x) => ({ id: x.e.id, lat: x.e.lat!, lng: x.e.lng!, title: x.e.title, imageUrl: x.e.imageUrl, category: catKey(x.e), isFree: x.e.isFree, dateText: x.e.dateText })),
    [results, filtered, origin]
  );

  const selected = events.find((e) => e.id === selectedId) || null;
  const link = selected?.officialUrl || selected?.bookingUrl;
  const heading = origin
    ? `${origin.label} 기준 ${radius >= 99 || scope === "all" ? "가까운 순" : `${radius}km 이내`}`
    : "지도에 보이는 공연·행사";

  const timeN = TIMES.find((t) => t[0] === time)?.[2] ?? 0;
  const course = useMemo(
    () => (timeN ? buildCourse(results as Row[], timeN, !!weather?.bad) : []),
    [results, timeN, weather?.bad]
  );
  const selDist = selected && origin ? haversine(origin.lat, origin.lng, selected.lat!, selected.lng!) : null;
  const activeFilters = cat !== "전체" || !!theme || scope === "all" || when.length > 0 || audience !== "전체" || !!time || !!q.trim();

  function pick(e: ShowdayEvent) {
    setSelectedId(e.id);
    mapRef.current?.panTo(e.lat!, e.lng!, 4);
  }

  function applyNaturalSearch(text: string) {
    const v = text.trim();
    if (!v) return;
    const nextWhen: string[] = [];
    if (/오늘|지금/.test(v)) nextWhen.push("today");
    if (/무료|0원|공짜/.test(v)) nextWhen.push("free");
    if (/실내|비 ?오|비오는|눈 ?오|미세먼지/.test(v)) nextWhen.push("indoor");
    if (nextWhen.length) setWhen(Array.from(new Set(nextWhen)));
    if (/이번 ?주말|주말/.test(v)) setTheme("weekend");
    if (/3시간|세 ?시간/.test(v)) setTime("3h");
    else if (/반나절/.test(v)) setTime("half");
    else if (/하루/.test(v)) setTime("day");
    else if (/1시간|한 ?시간/.test(v)) setTime("1h");
    if (/공연|콘서트|뮤지컬|연극|클래식/.test(v)) setCat("공연");
    else if (/전시|미술관|박물관/.test(v)) setCat("전시");
    else if (/축제|행사|페스티벌/.test(v)) setCat("축제");
    else if (/체험|배우|강좌/.test(v)) setCat("체험");
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

      <div className="sm-mode" role="tablist" aria-label="SHOWDAY 주요 화면">
        <button className="on" role="tab" aria-selected="true">지도</button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          onClick={() => {
            const params = new URLSearchParams({
              ...(q.trim() ? { q: q.trim() } : {}),
              ...(when.length ? { w: when.join(",") } : {}),
              ...(audience !== "전체" ? { a: audience } : {}),
              ...(cat !== "전체" ? { c: cat } : {}),
              ...(origin?.label && origin.label !== "내 위치" ? { d: origin.label } : {}),
              from: "map",
            });
            window.location.href = `${MAIN_SEARCH}?${params.toString()}`;
          }}
        >공연검색</button>
        <a
          role="tab"
          aria-selected="false"
          href="https://seoularena.showday.kr"
          aria-label="서울아레나로 이동"
        >서울아레나</a>
      </div>

      <div className="sm-zoom">
        <button aria-label="확대" onClick={() => mapRef.current?.zoom(1)}>+</button>
        <button aria-label="축소" onClick={() => mapRef.current?.zoom(-1)}>−</button>
      </div>
      <button className="sm-loc" aria-label="내 위치로" onClick={() => locate()}><Ico n="locate" size={22} /></button>

      <aside className="sm-panel">
        <div className="sm-head">
          <div className="sm-headrow">
            <div className="sm-brand">SHOWDAY<small>MAP</small></div>
            <div className="sm-tools">
              <button onClick={() => share()} aria-label="이 화면 공유"><Ico n="link" size={13} /> 공유</button>
              {activeFilters && <button onClick={resetAll}>모두 해제</button>}
            </div>
          </div>
          <h1>오늘 어디 갈까요?</h1>
          <p className="sm-sub">공연·전시·축제·체험, 가까운 곳부터 편하게 찾아보세요.</p>
          <div className="sm-map-search">
            <Ico n="search" size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyNaturalSearch(q); }} placeholder="말하듯 검색해보세요 · 예: 오늘 무료 공연, 비 오는 날 실내" aria-label="SHOWDAY 검색" />
            {q ? <button onClick={() => applyNaturalSearch(q)} aria-label="검색 적용">찾기</button> : null}
          </div>
          <div className="sm-suggest">
            <button onClick={() => { setWhen(["today"]); setCat("전체"); }}>오늘 갈 곳</button>
            <button onClick={() => { setWhen(["free"]); setCat("전체"); }}>0원으로</button>
            <button onClick={() => { setWhen(["indoor"]); setCat("전체"); }}>실내에서</button>
            <button onClick={() => { setTime("3h"); }}>3시간 코스</button>
          </div>
          {weather?.ok && (
            <div className={`sm-weather${weather.bad ? " bad" : ""}`}>
              <span className="w"><Ico n={weatherIco(weather.label)} size={16} /> {weather.label} {weather.temp}°</span>
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
            <Ico n="pin" size={18} />
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
            <button className={cat === "전체" ? "on" : ""} style={{ ["--c" as any]: "#b85f35" }} onClick={() => { setCat("전체"); setTheme(""); setSelectedId(null); }}>
              <span><Ico n="map" size={22} /></span><b>전체</b><em>{counts.전체 || 0}</em>
            </button>
            {CAT_ORDER.map((k) => (
              <button key={k} className={cat === k ? "on" : ""} style={{ ["--c" as any]: CAT_META[k].color, ["--s" as any]: CAT_META[k].soft }} onClick={() => { setCat(cat === k ? "전체" : k); setTheme(""); setSelectedId(null); }}>
                <span><Ico n={CAT_META[k].ico} size={22} /></span><b>{CAT_META[k].label}</b><em>{counts[k] || 0}</em>
              </button>
            ))}
          </div>

          <div className="sm-label">언제·조건</div>
          <div className="sm-chips">
            {WHEN.map(([v, label]) => (
              <button key={v} className={when.includes(v) ? "on" : ""} onClick={() => toggleWhen(v)}>{WHEN_ICO[v] && <Ico n={WHEN_ICO[v]} size={14} />}{label}</button>
            ))}
          </div>

          <div className="sm-label">얼마나 시간 있어요? <small>코스로 짜드려요</small></div>
          <div className="sm-seg" role="group" aria-label="시간">
            {TIMES.map(([v, label]) => (
              <button key={v} className={time === v ? "on" : ""} onClick={() => setTime(time === v ? "" : v)}>{label}</button>
            ))}
          </div>

          <p className="sm-ai-note"><span>AI</span> 검색과 선택을 바탕으로 날씨·거리·시간에 맞는 순서로 결과를 정리합니다.</p>
        </div>

        {course.length > 0 && (
          <div className="sm-course">
            <div className="sm-course-h">
              <Ico n="compass" size={15} /> {TIMES.find((t) => t[0] === time)?.[1]} 코스{weather?.bad ? " · 실내 위주" : ""}
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
                        <em>{m.label}{c.e.isFree ? " · 0원" : ""}{c.from != null ? ` · ${i === 0 && origin ? "" : "앞 코스에서 "}${fmtDist(c.from)}` : ""}</em>
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
                        <i className="type" style={{ background: m.color }}><Ico n={m.ico} size={11} /> {m.label.split("·")[0]}</i>
                        {d != null && <i className="dist">{fmtDist(d)}</i>}
                        {e.isFree && <i className="free">0원</i>}
                        {(() => { const st = statusOf(e, seoulToday()); return st && st.tone !== "end" ? <i className={`st ${st.tone}`}>{st.label}</i> : null; })()}
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

      <aside className="sm-now-panel sm-now-v3" aria-label="SHOWDAY NOW">
        {selected ? (
          <>
            <div className="sm-now-head decision">
              <small>SHOWDAY NOW</small>
              <b>여기, 지금 갈까?</b>
              <span>확인된 정보만 모아 지금 선택하기 쉽게 보여드려요.</span>
            </div>
            <div className="sm-decision-card">
              <strong>{selected.title}</strong>
              <div className="sm-decision-facts">
                {selected.isFree && <span>✓ 관람료 0원</span>}
                {isIndoor(selected) && <span>✓ 실내</span>}
                {selected.dateText && <span>✓ {selected.dateText}</span>}
                {selDist != null && <span>✓ {fmtDist(selDist)} 거리</span>}
                {!selected.bookingUrl && !selected.officialUrl && <span className="check">? 공식 안내 확인 필요</span>}
              </div>
              <div className="sm-now-suggest">
                <small>SHOWDAY 제안</small>
                <p>{weather?.bad && !isIndoor(selected) ? "날씨 영향을 받을 수 있는 장소예요. 실내 대안도 함께 확인해 보세요." : selected.isFree ? "비용 부담 없이 일정에 넣기 좋은 선택이에요. 운영시간은 출발 전에 확인해 주세요." : "일정과 이동거리를 확인한 뒤 오늘 동선에 넣어보세요."}</p>
              </div>
              <div className="sm-decision-actions">
                {link ? <a href={link} target="_blank" rel="noopener noreferrer">공식 안내</a> : <button onClick={() => setRouteMode("easy")}>이동 확인</button>}
                <button onClick={() => setSelectedId(null)}>다른 곳 보기</button>
              </div>
            </div>
            <section className="sm-now-section compact">
              <div className="sm-now-title"><b>이곳과 함께</b><em>주변까지</em></div>
              <div className="sm-now-grid">
                <button onClick={() => setRouteMode("easy")}>🚶 <span>편한 길</span></button>
                <button onClick={() => setRouteMode("accessible")}>♿ <span>이동 편의</span></button>
                <button onClick={() => setRouteMode("walk")}>🌳 <span>주변 산책</span></button>
                <button onClick={() => setRouteMode("rest")}>🪑 <span>쉬어가기</span></button>
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="sm-now-head">
              <small>SHOWDAY NOW</small>
              <b>오늘의 빈칸을 채워볼까요?</b>
              <span>{weather?.emoji || "✦"} {weather?.label ? `${weather.label}${weather.temp != null ? ` ${Math.round(weather.temp)}°` : ""} · ` : ""}남는 시간에 맞는 문화생활을 골라드려요.</span>
            </div>
            <section className="sm-now-section hero">
              <div className="sm-now-title"><b>얼마나 시간이 있나요?</b><em>TIME MAP</em></div>
              <div className="sm-now-time">
                {[['1h','1시간'],['3h','3시간'],['half','반나절']].map(([v,l]) => <button key={v} className={time===v?'on':''} onClick={() => setTime(time===v?'':v)}>{l}</button>)}
              </div>
              <button className="sm-fill-time" onClick={() => { if (!time) setTime('3h'); setSelectedId(null); }}>✦ 내 시간 채우기</button>
              {course.length > 0 && <div className="sm-mini-course">{course.slice(0,3).map((x:any,i:number)=><button key={x.e.id} onClick={()=>pick(x.e)}><i>{i+1}</i><span><b>{x.e.title}</b><em>{x.e.isFree?'무료 · ':''}{x.e.venue || x.e.address || '장소 확인'}</em></span></button>)}</div>}
            </section>
            <section className="sm-now-section">
              <div className="sm-now-title"><b>오늘은 뭘 피하고 싶으세요?</b><em>반대로 찾기</em></div>
              <div className="sm-avoid">
                {[['walk','많이 걷기'],['money','돈 쓰기'],['outdoor','야외'],['booking','예약']].map(([v,l]) => <button key={v} className={avoid.includes(v)?'on':''} onClick={() => { setAvoid(a=>a.includes(v)?a.filter(x=>x!==v):[...a,v]); if(v==='money') setWhen(w=>w.includes('free')?w:[...w,'free']); if(v==='outdoor') setWhen(w=>w.includes('indoor')?w:[...w,'indoor']); if(v==='booking') setWhen(w=>w.includes('walkin')?w:[...w,'walkin']); if(v==='walk') setRadius(r=>r===99?3:Math.min(r,3)); }}>{l}</button>)}
              </div>
            </section>
            <section className="sm-now-section">
              <div className="sm-now-title"><b>놓치기 전에</b><em>ENDING SOON</em></div>
              <button className="sm-now-row" onClick={() => { const today=seoulToday(); const soon=[...events].filter(e=>e.endDate && e.endDate.slice(0,10)>=today).sort((a,b)=>(a.endDate||'').localeCompare(b.endDate||''))[0]; if(soon) pick(soon); }}><span>이번 주 끝나는 일정부터 보기</span><strong>→</strong></button>
            </section>
            <section className="sm-now-section surprise">
              <button className="sm-surprise" onClick={() => { const pool=results.map(x=>x.e); if(pool.length) pick(pool[Math.floor(Math.random()*pool.length)]); }}><span>✦</span><div><b>뜻밖의 발견</b><em>평소 지나쳤던 곳 하나 골라보기</em></div><strong>→</strong></button>
            </section>
          </>
        )}
      </aside>

      {routeMode && (
        <div className="sm-route-pop" role="dialog" aria-label="SHOWDAY ROUTE 안내">
          <div className="sm-route-pop-h">
            <div><small>SHOWDAY ROUTE</small><b>{routeMode === "easy" ? "편하게 이동하고 싶어요" : routeMode === "accessible" ? "이동 편의 정보를 확인해요" : routeMode === "walk" ? "걷기 좋은 길을 찾아요" : "중간에 쉬어갈 곳을 찾아요"}</b></div>
            <button onClick={() => setRouteMode(null)} aria-label="닫기">×</button>
          </div>
          <p>{routeMode === "easy" ? "계단·급경사 부담을 줄이고 휴식하기 편한 이동을 우선합니다." : routeMode === "accessible" ? "휠체어·보행보조기 이용자는 확인된 접근성 정보만 참고합니다. 미확인 구간은 가능하다고 표시하지 않습니다." : routeMode === "walk" ? "공원·하천·숲길처럼 걷기 좋은 공간을 함께 확인합니다." : "벤치·화장실·카페 등 쉬어갈 수 있는 장소를 함께 확인합니다."}</p>
          {selected ? <div className="sm-route-selected"><span>선택한 장소</span><b>{selected.venue || selected.title}</b><div><a href={`https://map.kakao.com/link/to/${encodeURIComponent(selected.venue || selected.title)},${selected.lat},${selected.lng}`} target="_blank" rel="noopener noreferrer">카카오맵 길찾기</a><a href={`https://map.naver.com/p/search/${encodeURIComponent(selected.venue || selected.title)}`} target="_blank" rel="noopener noreferrer">네이버 지도</a></div></div> : <p className="sm-route-tip">지도에서 장소를 하나 선택하면 이동 경로를 바로 확인할 수 있어요.</p>}
          <div className="sm-route-safety">※ 경사·계단·휠체어 통행 가능 여부는 현장과 지도 제공자의 최신 정보를 반드시 함께 확인해 주세요.</div>
        </div>
      )}

      <button className="sm-info-btn" onClick={() => setInfo("intro")} aria-label="소개·제보·정보 출처">
        <Ico n="info" size={16} /> 안내·제보
      </button>

      {info && (
        <div className="sm-modal-bg" onClick={() => setInfo(null)}>
          <div className="sm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="sm-modal-x" aria-label="닫기" onClick={() => setInfo(null)}>×</button>
            <div className="sm-modal-brand">
              <span className="logo">S</span>
              <div><b>SHOWDAY MAP</b><small>공연·전시·축제·체험, 오늘 내 근처에서</small></div>
            </div>
            <div className="sm-tabs" role="tablist">
              {([["intro", "소개"], ["report", "제보하기"], ["source", "정보 출처"]] as const).map(([v, l]) => (
                <button key={v} role="tab" aria-selected={info === v} className={info === v ? "on" : ""} onClick={() => setInfo(v)}>{l}</button>
              ))}
            </div>
            <div className="sm-modal-body">
              {info === "intro" && (
                <>
                  <h2>오늘, 내 근처에서 뭘 할까요?</h2>
                  <p>SHOWDAY MAP은 공연·전시·축제·체험을 한 지도에서 보여주고, 날씨·거리·시간을 함께 고려해 지금 갈 만한 선택지를 빠르게 찾도록 돕습니다.</p>
                  <ul>
                    <li><b>내 근처</b> — 위치를 켜면 3·5·10km 안의 행사만 거리순으로 보여 드려요.</li>
                    <li><b>비 오는 날</b> — 비·눈이 오면 실내 행사를 먼저 보여 드려요.</li>
                    <li><b>유형이 한눈에</b> — 공연·전시·축제·체험을 색과 아이콘으로 구분하고, 0원 행사는 표시해 드려요.</li>
                    <li><b>시간 맞춤 코스</b> — 1시간부터 하루까지, 시간에 맞는 코스를 짜 드려요.</li>
                  </ul>
                  <p className="muted">더 많은 공연 정보와 예매 소식은 <a href={MAIN_SITE}>showday.kr</a>에서 찾아보세요.</p>
                </>
              )}
              {info === "report" && (
                <>
                  <h2>잘못된 정보를 알려 주세요</h2>
                  <p>일정·요금이 다르거나, 위치가 틀렸거나, 빠진 행사가 있으면 알려 주세요. 확인 후 반영합니다.</p>
                  <ul>
                    <li>행사 이름과 날짜, 장소</li>
                    <li>무엇이 다른지 (일정 / 요금 / 위치 / 종료·취소 / 빠진 행사)</li>
                    <li>확인할 수 있는 공식 링크가 있으면 함께</li>
                  </ul>
                  {REPORT_URL ? (
                    <a className="sm-modal-cta" href={REPORT_URL} target="_blank" rel="noopener noreferrer">제보하러 가기</a>
                  ) : (
                    <span className="sm-modal-cta off">제보 창구 준비 중입니다</span>
                  )}
                  {selected && <p className="muted">지금 보고 있는 행사: {selected.title}</p>}
                </>
              )}
              {info === "source" && (
                <>
                  <h2>정보 출처</h2>
                  <p>SHOWDAY MAP이 활용하는 정보의 제공처입니다. 일정·요금·예약은 바뀔 수 있으니 방문 전 공식 링크에서 꼭 확인해 주세요.</p>
                  <dl className="sm-src">
                    {SOURCES.map(([name, url, desc]) => (
                      <div key={name}>
                        <dt>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{name} ↗</a> : name}</dt>
                        <dd>{desc}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>
            <button className="sm-modal-go" onClick={() => setInfo(null)}>오늘 갈 곳 찾기 →</button>
          </div>
        </div>
      )}

      {toast && <div className="sm-toast">{toast}</div>}

      {selected && (() => {
        const m = CAT_META[catKey(selected)];
        const today = seoulToday();
        const st = statusOf(selected, today);
        const walk = isWalkIn(selected);
        const indoor = isIndoor(selected);
        const nearby = events
          .filter((x) => x.id !== selected.id && statusOf(x, today)?.tone !== "end")
          .map((x) => ({ x, d: haversine(selected.lat!, selected.lng!, x.lat!, x.lng!) }))
          .filter((y) => y.d <= 2)
          .sort((p, q) => p.d - q.d)
          .slice(0, 4);
        const q = encodeURIComponent(selected.venue || selected.title);
        const naver = `https://map.naver.com/p/search/${encodeURIComponent(selected.venue || selected.title)}`;
        const kakaoTo = `https://map.kakao.com/link/to/${q},${selected.lat},${selected.lng}`;
        const blogSearch = `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(selected.title + " 후기")}`;
        const src = SRC_LABEL[String(selected.source)] || "SHOWDAY";
        const myStories = stories && stories.id === selected.id ? stories : null;
        const kindText = [selected.category, selected.subcategory, selected.title, selected.venue].filter(Boolean).join(" ");
        const isNature = /공원|자연|숲|둘레길|산책|하천|정원/.test(kindText);
        const isProgram = /프로그램|체험|교육|강좌|워크숍|클래스/.test(kindText) || catKey(selected) === "체험";
        const isFestival = catKey(selected) === "축제" || /축제|페스티벌|행사/.test(kindText);
        const isExhibit = catKey(selected) === "전시";
        const isPerformance = catKey(selected) === "공연";
        const introTitle = isNature ? "이곳은 어떤 곳인가요?" : isProgram ? "어떤 프로그램인가요?" : isExhibit ? "어떤 전시인가요?" : isPerformance ? "어떤 공연인가요?" : isFestival ? "어떤 행사인가요?" : "한눈에 보기";
        const infoTitle = isNature ? "이용 정보" : isProgram ? "참여 정보" : isExhibit ? "관람 정보" : isPerformance ? "공연 정보" : isFestival ? "행사 정보" : "방문 정보";
        const shareUrl = typeof window !== "undefined" ? window.location.href : `https://map.showday.kr/?e=${encodeURIComponent(selected.id)}`;
        return (
          <section className="sm-detail" style={{ ["--c" as any]: m.color, ["--s" as any]: m.soft }} aria-label="행사 상세">
            <button className="sm-detail-x" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button>
            <div className="sm-detail-body">
              <div className="sm-detail-kicker"><Ico n={m.ico} size={14} /> {m.label}{selected.subcategory && selected.subcategory !== selected.category ? ` · ${selected.subcategory}` : ""}</div>
              <h2>{selected.title}</h2>
              <p className="sm-detail-place">{[selected.region, selected.district].filter(Boolean).join(" ")}{selected.venue ? ` · ${selected.venue}` : ""}{selDist != null ? ` · ${fmtDist(selDist)}` : ""}</p>
              <div className="sm-tags">
                <span className="tg type"><Ico n={m.ico} size={12} /> {m.label.split("·")[0]}</span>
                {selected.isFree ? <span className="tg free">0원</span> : selected.priceText ? <span className="tg">{selected.priceText}</span> : null}
                {st && <span className={`tg st ${st.tone}`}>{st.label}</span>}
                {selected.bookingUrl ? <span className="tg">예약 확인</span> : walk ? <span className="tg ok">예약 없이 가능(추정)</span> : null}
                {indoor && <span className="tg"><Ico n="home" size={12} /> 실내</span>}
              </div>

              <Thumb e={selected} cls="dimg" />

              {weather?.bad && !indoor && (
                <div className="sm-alert"><Ico n="umbrella" size={15} /> 지금 비·눈이 와요. 야외일 수 있으니 방문 전 진행 여부를 꼭 확인하세요.</div>
              )}

              {selected.description && (
                <>
                  <h3>{introTitle}</h3>
                  <p className="sm-desc">{selected.description}{selected.description.length >= 520 ? "…" : ""}</p>
                </>
              )}

              <h3>{infoTitle}</h3>
              <dl className="sm-kv">
                <div><dt>일정</dt><dd>{selected.dateText || "확인 필요"}</dd></div>
                <div><dt>장소</dt><dd>{selected.venue || "-"}{selected.address ? <small>{selected.address}</small> : null}</dd></div>
                <div><dt>이용료</dt><dd>{selected.isFree ? "무료" : selected.priceText || "확인 필요"}</dd></div>
                {(selected.target || selected.ageText) && <div><dt>대상</dt><dd>{[selected.target, selected.ageText].filter(Boolean).join(" · ")}</dd></div>}
                {selected.organizer && <div><dt>주최·운영</dt><dd>{selected.organizer}</dd></div>}
                {!isNature && <div><dt>{isProgram ? "신청" : "예약"}</dt><dd>{selected.bookingUrl ? "예약·신청 링크가 있어요" : walk ? "별도 예약 안내 없음 — 방문 전 확인" : "확인 필요"}</dd></div>}
              </dl>

              <div className="sm-comfort">
                <div><span>이용 성격</span><b>{indoor ? "실내 중심" : isNature ? "야외 활동" : "현장 확인"}</b></div>
                <div><span>비용</span><b>{selected.isFree ? "무료" : selected.priceText || "확인 필요"}</b></div>
                <div><span>{isNature ? "운영" : "예약"}</span><b>{isNature ? "방문 전 확인" : selected.bookingUrl ? "확인 필요" : walk ? "별도 안내 없음" : "확인 필요"}</b></div>
              </div>
              <p className="sm-hint">운영시간·요금·접근성 정보는 변경될 수 있어요. 방문 전 공식 안내를 함께 확인해 주세요.</p>

              <h3>{isNature ? "편하게 다녀오기" : "가는 길과 주변"}</h3>
              <div className="sm-route">
                <a href={kakaoTo} target="_blank" rel="noopener noreferrer">카카오맵 길찾기</a>
                <a href={naver} target="_blank" rel="noopener noreferrer">네이버 지도</a>
              </div>

              {nearby.length > 0 && (
                <>
                  <h3>이 근처에서 함께 가기 <small>2km 이내</small></h3>
                  <ul className="sm-near">
                    {nearby.map(({ x, d }) => {
                      const xm = CAT_META[catKey(x)];
                      return (
                        <li key={x.id}>
                          <button onClick={() => pick(x)}>
                            <span className="ic" style={{ background: xm.soft, color: xm.color }}><Ico n={xm.ico} size={18} /></span>
                            <span className="tx"><b>{x.title}</b><em>{xm.label.split("·")[0]}{x.isFree ? " · 0원" : ""} · {fmtDist(d)}</em></span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              <h3>다녀온 이야기 <small>이용·블로그 후기</small></h3>
              {myStories && myStories.items.length > 0 ? (
                <ul className="sm-stories">
                  {myStories.items.map((it) => (
                    <li key={it.link}>
                      <a href={it.link} target="_blank" rel="noopener noreferrer">
                        <b>{it.title}</b>
                        <span>{it.desc}</span>
                        <em>{it.blogger}{it.date ? ` · ${it.date.slice(0, 4)}.${it.date.slice(4, 6)}.${it.date.slice(6, 8)}` : ""} · 블로그에서 읽기 ↗</em>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sm-hint">{myStories ? "찾은 후기가 없어요." : "후기를 찾는 중…"}</p>
              )}
              {selected.source === "SEOUL_RESERVATION" && selected.bookingUrl && (
                <a className="sm-more-link" href={selected.bookingUrl} target="_blank" rel="noopener noreferrer">서울시 예약 사이트에서 이용후기 보기 ↗ </a>
              )}
              <a className="sm-more-link" href={blogSearch} target="_blank" rel="noopener noreferrer">네이버에서 후기 더 찾기 ↗</a>

              <p className="sm-src-line">정보 출처: {src}{selected.imageUrl ? " · 사진: 출처 공식 자료" : ""}</p>
            </div>
            <div className="sm-detail-bar sm-detail-bar--actions">
              <button className="copy" onClick={async () => flash((await copyText(shareUrl)) ? "링크를 복사했어요" : "복사에 실패했어요")}>링크 복사</button>
              <a className="map" href={naver} target="_blank" rel="noopener noreferrer">지도에서 보기</a>
              {selected.bookingUrl ? (
                <a className="go" href={selected.bookingUrl} target="_blank" rel="noopener noreferrer">예매·신청 ↗</a>
              ) : selected.officialUrl ? (
                <a className="go" href={selected.officialUrl} target="_blank" rel="noopener noreferrer">공식 안내 ↗</a>
              ) : (
                <a className="go" href={`https://search.naver.com/search.naver?query=${encodeURIComponent(selected.title)}`} target="_blank" rel="noopener noreferrer">안내 보기 ↗</a>
              )}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
