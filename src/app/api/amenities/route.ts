import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 선택한 행사 좌표 주변(기본 500m)의 화장실·공원·무장애 시설을 돌려준다.
// SUPABASE_URL / SUPABASE_ANON_KEY 가 없으면 configured:false (화면은 "준비 중"으로 표시)
export async function GET(req: Request) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ configured: false, items: [] });

  const sp = new URL(req.url).searchParams;
  const lat = parseFloat(sp.get("lat") || "");
  const lng = parseFloat(sp.get("lng") || "");
  const r = Math.min(Math.max(parseInt(sp.get("r") || "500", 10) || 500, 100), 2000);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ configured: true, items: [] }, { status: 400 });

  try {
    const res = await fetch(`${url}/rest/v1/rpc/amenities_near`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_lat: lat, p_lng: lng, p_radius_m: r, p_limit: 80 }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ configured: true, items: [] });
    const items = await res.json();
    return NextResponse.json({ configured: true, items: Array.isArray(items) ? items : [] }, { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ configured: true, items: [] });
  }
}
