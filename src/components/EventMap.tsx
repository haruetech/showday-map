"use client";

import { useEffect, useRef, useState } from "react";
import { loadKakaoMaps } from "@/lib/kakaoMapLoader";

export type MapPoint = { id: string; lat: number; lng: number };

type Props = {
  points: MapPoint[];
  onSelect: (id: string) => void;
  onBoundsChange?: (b: { swLat: number; swLng: number; neLat: number; neLng: number }) => void;
};

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청

export default function EventMap({ points, onSelect, onBoundsChange }: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState("");
  const [showRedo, setShowRedo] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !divRef.current) return;
        const map = new kakao.maps.Map(divRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: 8,
        });
        mapRef.current = map;
        clustererRef.current = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 6 });
        kakao.maps.event.addListener(map, "dragend", () => setShowRedo(true));
        kakao.maps.event.addListener(map, "zoom_changed", () => setShowRedo(true));
        setStatus("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setErr(e.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !clustererRef.current) return;
    const kakao = window.kakao;
    clustererRef.current.clear();
    const markers = points.map((p) => {
      const m = new kakao.maps.Marker({ position: new kakao.maps.LatLng(p.lat, p.lng) });
      kakao.maps.event.addListener(m, "click", () => onSelect(p.id));
      return m;
    });
    clustererRef.current.addMarkers(markers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, status]);

  function redo() {
    const b = mapRef.current?.getBounds();
    if (!b) return;
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    onBoundsChange?.({ swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() });
    setShowRedo(false);
  }

  function locate() {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current.setCenter(new window.kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
        mapRef.current.setLevel(5);
        setShowRedo(true);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000, maximumAge: 300000 }
    );
  }

  return (
    <>
      <div ref={divRef} className="sm-canvas" aria-label="SHOWDAY 지도" />
      {status === "loading" && <div className="sm-overlay">지도를 불러오는 중입니다…</div>}
      {status === "error" && (
        <div className="sm-overlay">
          지도를 불러오지 못했습니다.<span>{err}</span>
        </div>
      )}
      {status === "ready" && showRedo && (
        <button className="sm-btn sm-redo" onClick={redo}>이 지역 재검색</button>
      )}
      {status === "ready" && (
        <button className="sm-btn sm-locate" onClick={locate} disabled={locating}>
          {locating ? "위치 확인 중…" : "현재 위치"}
        </button>
      )}
    </>
  );
}
