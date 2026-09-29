import type { ShowdayEvent } from "@/lib/eventTypes";

/** 유형 키 — 지도 핀·목록·상세 카드가 모두 같은 아이콘/색을 쓰도록 한 곳에서 관리 */
export type CatKey = "공연" | "전시" | "축제" | "체험" | "기타";

export const CAT_META: Record<CatKey, { ico: string; label: string; color: string; soft: string }> = {
  공연: { ico: "mic", label: "공연", color: "#7a4bd6", soft: "#efe6fb" },
  전시: { ico: "frame", label: "전시", color: "#0f8a8a", soft: "#dcf3f2" },
  축제: { ico: "sparkle", label: "축제·행사", color: "#e07a1f", soft: "#fdeacf" },
  체험: { ico: "sprout", label: "체험·배움", color: "#2f8f5b", soft: "#dff3e6" },
  기타: { ico: "star", label: "기타", color: "#8a7a6e", soft: "#efe7de" },
};
export const CAT_ORDER: CatKey[] = ["공연", "전시", "축제", "체험"];

function byText(t: string): CatKey | null {
  if (/체험|교육|배움|강좌|클래스|워크숍/.test(t)) return "체험";
  if (/공연|콘서트|뮤지컬|연극|클래식|무용|국악/.test(t)) return "공연";
  if (/전시|미술|박물|사진/.test(t)) return "전시";
  if (/축제|행사|지역/.test(t)) return "축제";
  return null;
}
/** 대분류(category)를 먼저 보고, 애매하면 소분류·제목으로 판별 */
export function catKey(e: Pick<ShowdayEvent, "category" | "subcategory" | "title">): CatKey {
  return byText(e.category || "") || byText(e.subcategory || "") || (/체험|클래스|워크숍|만들기/.test(e.title || "") ? "체험" : "기타");
}
