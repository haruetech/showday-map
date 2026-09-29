# SHOWDAY MAP (map.showday.kr)

기존 SHOWDAY(showday.kr)와 분리된 지도 전용 사이트. 데이터는 showday.kr `/api/events/search`를 서버에서 가져옵니다(자체 API 키·DB 키 없음).

## 배포
1. GitHub에 `haruetech/showday-map` 저장소 생성 후 이 폴더 내용을 push
2. Vercel > Add New Project > 위 저장소 선택 (팀: harues-projects)
3. Environment Variables: `NEXT_PUBLIC_KAKAO_JS_KEY` (showday와 같은 값), `SHOWDAY_API_BASE=https://showday.kr`
4. Vercel > Settings > Domains에 `map.showday.kr` 추가 → 안내되는 CNAME(보통 `cname.vercel-dns.com`)을 DNS(showday.kr)에 등록
5. 카카오 개발자 콘솔 > 플랫폼 > Web 사이트 도메인에 `https://map.showday.kr` 추가
