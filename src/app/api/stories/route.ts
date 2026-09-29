import { NextResponse } from "next/server";

// 다녀온 이야기: 네이버 블로그 검색(무료 오픈 API)에서 행사 이름으로 후기 글을 찾아
// 제목·요약·링크만 보여 준다(본문은 가져오지 않고, 클릭하면 원문 블로그로 이동).
// 환경변수 NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET 이 없으면 configured:false 로 응답한다.
export const revalidate = 86400;

function clean(s: string) {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export async function GET(req: Request) {
  const id = process.env.NAVER_SEARCH_CLIENT_ID;
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!id || !secret) return NextResponse.json({ ok: false, configured: false, items: [] });

  const q = (new URL(req.url).searchParams.get("q") || "").replace(/[\[\]()]/g, " ").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ ok: true, configured: true, items: [] });

  try {
    const r = await fetch(
      `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(q + " 후기")}&display=4&sort=sim`,
      { headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret }, next: { revalidate: 86400 } }
    );
    if (!r.ok) return NextResponse.json({ ok: false, configured: true, items: [] });
    const d = await r.json();
    const items = (Array.isArray(d?.items) ? d.items : []).slice(0, 3).map((it: any) => ({
      title: clean(String(it.title || "")),
      desc: clean(String(it.description || "")).slice(0, 110),
      link: String(it.link || ""),
      blogger: clean(String(it.bloggername || "")),
      date: String(it.postdate || ""),
    }));
    return NextResponse.json({ ok: true, configured: true, items });
  } catch {
    return NextResponse.json({ ok: false, configured: true, items: [] });
  }
}
