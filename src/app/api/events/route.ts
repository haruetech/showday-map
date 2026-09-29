import { NextResponse } from "next/server";
import type { ShowdayEvent } from "@/lib/eventTypes";

// 지도 사이트는 API 키/DB 키를 갖지 않는다.
// 기존 SHOWDAY(showday.kr)의 통합 이벤트 API를 서버에서 대신 호출하고,
// 지도에 찍을 수 있는(좌표 있는) 행사만 필요한 필드로 줄여서 내려준다.
export const revalidate = 600;

const BASE = process.env.SHOWDAY_API_BASE || "https://showday.kr";

export async function GET() {
  try {
    const res = await fetch(`${BASE}/api/events/search?rows=600`, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    const events: ShowdayEvent[] = (Array.isArray(data?.events) ? data.events : [])
      .filter((e: ShowdayEvent) => e.lat != null && e.lng != null)
      .map((e: ShowdayEvent) => ({ ...e, raw: undefined, description: undefined }));
    return NextResponse.json(
      { total: events.length, events },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" } }
    );
  } catch {
    return NextResponse.json({ total: 0, events: [], error: "upstream" }, { status: 502 });
  }
}
