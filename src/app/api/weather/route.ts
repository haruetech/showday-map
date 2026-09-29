import { NextRequest, NextResponse } from "next/server";

// 무료·키 없는 Open-Meteo로 현재 날씨를 가져온다. 실패하면 빈 값을 돌려주고 화면은 날씨 없이 동작한다.
export const revalidate = 600;

function describe(code: number, precip: number) {
  if (code >= 95) return { label: "천둥·번개", emoji: "⛈️", bad: true };
  if (code >= 85 && code <= 86) return { label: "눈", emoji: "🌨️", bad: true };
  if (code >= 71 && code <= 77) return { label: "눈", emoji: "❄️", bad: true };
  if (code >= 80 && code <= 82) return { label: "소나기", emoji: "🌧️", bad: true };
  if (code >= 61 && code <= 67) return { label: "비", emoji: "🌧️", bad: true };
  if (code >= 51 && code <= 57) return { label: "이슬비", emoji: "🌦️", bad: true };
  if (precip > 0) return { label: "비", emoji: "🌧️", bad: true };
  if (code === 45 || code === 48) return { label: "안개", emoji: "🌫️", bad: false };
  if (code === 0) return { label: "맑음", emoji: "☀️", bad: false };
  if (code <= 2) return { label: "구름 조금", emoji: "🌤️", bad: false };
  return { label: "흐림", emoji: "☁️", bad: false };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat")) || 37.5665;
  const lng = Number(sp.get("lng")) || 126.978;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      `&current=temperature_2m,precipitation,weather_code&timezone=Asia%2FSeoul`;
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const cur = data?.current;
    if (!cur) throw new Error("no current");
    const d = describe(Number(cur.weather_code), Number(cur.precipitation) || 0);
    return NextResponse.json(
      { ok: true, temp: Math.round(cur.temperature_2m), ...d },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" } }
    );
  } catch {
    return NextResponse.json({ ok: false });
  }
}
