"use client";

// 카카오맵 JS SDK 로더.
// src/components/kakao/KakaoSdk.tsx(카카오 로그인/채널용, window.Kakao)와는 완전히 별개의
// 스크립트/전역객체(window.kakao, 소문자)입니다. 같은 NEXT_PUBLIC_KAKAO_JS_KEY를 재사용하되,
// 카카오 디벨로퍼스 콘솔에서 해당 앱에 "지도" 상품이 활성화되어 있어야 동작합니다.

declare global {
  interface Window {
    // 카카오맵 SDK는 공식 타입 패키지가 무겁고 버전별 차이가 커서, 최소한의 any로 둡니다.
    kakao: any;
  }
}

const SDK_ELEMENT_ID = "kakao-maps-sdk";

let loadPromise: Promise<typeof window.kakao> | null = null;

export function loadKakaoMaps(): Promise<typeof window.kakao> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저 환경에서만 지도를 불러올 수 있습니다."));
  }

  if (window.kakao?.maps) return Promise.resolve(window.kakao);
  if (loadPromise) return loadPromise;

  const appkey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!appkey) {
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_JS_KEY가 설정되지 않았습니다."));
  }

  loadPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (!window.kakao?.maps) {
        reject(new Error("카카오맵 SDK가 로드됐지만 maps 객체를 찾을 수 없습니다."));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao));
    };

    const existing = document.getElementById(SDK_ELEMENT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.kakao?.maps) finish();
      else existing.addEventListener("load", finish, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SDK_ELEMENT_ID;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false&libraries=services,clusterer`;
    script.async = true;
    script.onload = finish;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("카카오맵 SDK 스크립트를 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
