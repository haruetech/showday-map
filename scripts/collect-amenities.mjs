// 공공데이터 → Supabase place_amenities 일일 수집 (Node 20+, 외부 패키지 없음)
// 실행: node scripts/collect-amenities.mjs [--dry]
// 환경변수: DATA_GO_KR_KEY(공공데이터포털 인증키·Decoding 키), SUPABASE_URL, SUPABASE_SERVICE_KEY
// --dry : DB에 쓰지 않고 출처별 건수·샘플만 출력 (엔드포인트/필드명 확인용 — 먼저 이걸로 확인하세요)
const DRY = process.argv.includes("--dry");
const KEY = process.env.DATA_GO_KR_KEY;
const SB = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SBK = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error("DATA_GO_KR_KEY 가 필요합니다"); process.exit(1); }
if (!DRY && (!SB || !SBK)) { console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다"); process.exit(1); }

// 서울 + 인접 지역만 저장 (무료 용량 절약, 지도 범위와 동일)
const BBOX = { s: 37.40, n: 37.72, w: 126.70, e: 127.20 };
const inBox = (la, ln) => la >= BBOX.s && la <= BBOX.n && ln >= BBOX.w && ln <= BBOX.e;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== "") return o[k]; return ""; };

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { throw new Error(`JSON 아님(${r.status}): ${t.slice(0, 160)}`); }
}
const itemsOf = (j) => {
  const it = j?.response?.body?.items;
  if (Array.isArray(it)) return it;
  if (Array.isArray(it?.item)) return it.item;
  if (it?.item) return [it.item];
  return [];
};

// ── 출처 정의 ─────────────────────────────────────────────
// 필드명은 공공데이터포털 표준 스키마 기준입니다. 다르면 --dry 로 샘플을 보고 아래 alias만 고치면 됩니다.
const SOURCES = [
  {
    source: "toilet_std", kind: "toilet", optional: false,
    url: (p) => `https://api.data.go.kr/openapi/tn_pubr_public_toilet_api?serviceKey=${encodeURIComponent(KEY)}&pageNo=${p}&numOfRows=1000&type=json`,
    map: (o) => ({
      source_id: String(pick(o, ["mnlsfNo", "toiletNm"])) + "|" + pick(o, ["latitude"]) + "," + pick(o, ["longitude"]),
      name: pick(o, ["toiletNm"]), address: pick(o, ["rdnmadr", "lnmadr"]),
      lat: num(pick(o, ["latitude"])), lng: num(pick(o, ["longitude"])),
      extra: { open: pick(o, ["openTime"]), bell: pick(o, ["emgBellYn"]), cctv: pick(o, ["enterentCctvInstlYn"]), disabled: pick(o, ["maleDspsnWtrClosetCnt", "femaleDspsnWtrClosetCnt"]) },
    }),
  },
  {
    source: "park_std", kind: "park", optional: false,
    url: (p) => `https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api?serviceKey=${encodeURIComponent(KEY)}&pageNo=${p}&numOfRows=1000&type=json`,
    map: (o) => ({
      source_id: String(pick(o, ["manageNo", "parkNm"])),
      name: pick(o, ["parkNm"]), address: pick(o, ["rdnmadr", "lnmadr"]),
      lat: num(pick(o, ["latitude"])), lng: num(pick(o, ["longitude"])),
      extra: { type: pick(o, ["parkSe"]), area: pick(o, ["parkAr"]), facilities: pick(o, ["mvmFclty", "amsmtFclty", "cnvnncFclty"]) },
    }),
  },
  {
    // 한국관광공사 무장애 여행정보 (서울). 서비스명/오퍼레이션이 바뀌었을 수 있어 optional — 실패해도 나머지는 계속 진행
    source: "tour_barrierfree", kind: "barrier_free", optional: true,
    url: (p) => `https://apis.data.go.kr/B551011/KorWithService2/areaBasedList2?serviceKey=${encodeURIComponent(KEY)}&MobileOS=ETC&MobileApp=SHOWDAY&_type=json&areaCode=1&pageNo=${p}&numOfRows=1000`,
    map: (o) => ({
      source_id: String(pick(o, ["contentid"])),
      name: pick(o, ["title"]), address: pick(o, ["addr1"]),
      lat: num(pick(o, ["mapy"])), lng: num(pick(o, ["mapx"])),
      extra: { tel: pick(o, ["tel"]), type: pick(o, ["contenttypeid"]) },
    }),
  },
];

async function collect(s) {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const rows = itemsOf(await getJson(s.url(page)));
    for (const o of rows) {
      const m = s.map(o);
      if (!m.name || m.lat == null || m.lng == null || !inBox(m.lat, m.lng)) continue;
      out.push({ kind: s.kind, source: s.source, ...m, updated_at: new Date().toISOString() });
    }
    if (rows.length < 1000) break;
  }
  // 같은 source_id 중복 제거
  return [...new Map(out.map((r) => [r.source + "|" + r.source_id, r])).values()];
}

async function upsert(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${SB}/rest/v1/place_amenities?on_conflict=source,source_id`, {
      method: "POST",
      headers: { apikey: SBK, Authorization: `Bearer ${SBK}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

let failed = 0;
for (const s of SOURCES) {
  try {
    const rows = await collect(s);
    console.log(`[${s.source}] ${rows.length}건`, DRY && rows[0] ? JSON.stringify(rows[0]) : "");
    if (!DRY && rows.length) await upsert(rows);
  } catch (e) {
    console.error(`[${s.source}] 실패: ${e.message}`);
    if (!s.optional) failed++;
  }
}
process.exit(failed ? 1 : 0);
