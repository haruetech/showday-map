"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { loadKakaoMaps } from "@/lib/kakaoMapLoader";

export type MapPoint = { id: string; lat: number; lng: number; title: string; imageUrl?: string };
export type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };
export type EventMapHandle = {
  panTo: (lat: number, lng: number, level?: number) => void;
  zoom: (delta: 1 | -1) => void;
  /** 기준 위치(내 위치/선택 지역)와 반경을 지도에 표시하고 그 범위로 이동 */
  showOrigin: (lat: number, lng: number, radiusKm: number | null) => void;
  clearOrigin: () => void;
};

type Props = {
  points: MapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (b: Bounds) => void;
  onReady?: () => void;
};

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청
const POSTER_LEVEL = 5; // 이 레벨 이하로 확대하면 포스터 핀으로 표시

const EventMap = forwardRef<EventMapHandle, Props>(function EventMap(
  { points, selectedId, onSelect, onBoundsChange, onReady },
  ref
) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const originRef = useRef<any[]>([]);
  const onSelectRef = useRef(onSelect);
  const onBoundsRef = useRef(onBoundsChange);
  const onReadyRef = useRef(onReady);
  onSelectRef.current = onSelect;
  onBoundsRef.current = onBoundsChange;
  onReadyRef.current = onReady;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const [zoomedIn, setZoomedIn] = useState(false);

  function clearOriginShapes() {
    originRef.current.forEach((o) => o.setMap(null));
    originRef.current = [];
  }

  useImperativeHandle(ref, () => ({
    panTo(lat, lng, level) {
      const map = mapRef.current;
      if (!map) return;
      map.panTo(new window.kakao.maps.LatLng(lat, lng));
      if (level) map.setLevel(level, { animate: true });
    },
    zoom(delta) {
      const map = mapRef.current;
      if (!map) return;
      map.setLevel(map.getLevel() - delta, { animate: true });
    },
    showOrigin(lat, lng, radiusKm) {
      const map = mapRef.current;
      if (!map) return;
      const kakao = window.kakao;
      clearOriginShapes();
      const pos = new kakao.maps.LatLng(lat, lng);

      const dot = document.createElement("div");
      dot.className = "sm-me";
      const me = new kakao.maps.CustomOverlay({ position: pos, content: dot, yAnchor: 0.5, xAnchor: 0.5, zIndex: 30 });
      me.setMap(map);
      originRef.current.push(me);

      if (radiusKm) {
        const circle = new kakao.maps.Circle({
          center: pos,
          radius: radiusKm * 1000,
          strokeWeight: 2,
          strokeColor: "#b85f35",
          strokeOpacity: 0.85,
          strokeStyle: "dashed",
          fillColor: "#b85f35",
          fillOpacity: 0.07,
        });
        circle.setMap(map);
        originRef.current.push(circle);
        const wide = window.innerWidth > 768;
        map.setBounds(circle.getBounds(), 40, 40, wide ? 40 : 320, wide ? 420 : 40);
      } else {
        map.setCenter(pos);
        map.setLevel(5);
      }
    },
    clearOrigin() {
      clearOriginShapes();
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !divRef.current) return;
        const map = new kakao.maps.Map(divRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: 7,
        });
        mapRef.current = map;
        clustererRef.current = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 6 });
        kakao.maps.event.addListener(map, "idle", () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            const b = map.getBounds();
            const sw = b.getSouthWest();
            const ne = b.getNorthEast();
            onBoundsRef.current({ swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() });
            setZoomedIn(map.getLevel() <= POSTER_LEVEL);
            setTick((t) => t + 1);
          }, 150);
        });
        setStatus("ready");
        onReadyRef.current?.();
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setErr(e.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // 마커/포스터 핀 그리기
  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !clustererRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    clustererRef.current.clear();
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const makePin = (p: MapPoint, selected: boolean) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `sm-pin${selected ? " sel" : ""}`;
      el.setAttribute("aria-label", p.title);
      if (p.imageUrl) {
        const img = document.createElement("img");
        img.src = p.imageUrl;
        img.alt = "";
        img.loading = "lazy";
        el.appendChild(img);
      } else {
        el.classList.add("noimg");
        el.textContent = "★";
      }
      el.addEventListener("click", () => onSelectRef.current(p.id));
      return new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        content: el,
        yAnchor: 1.08,
        zIndex: selected ? 20 : 5,
      });
    };

    if (zoomedIn) {
      const b = map.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const inView = points
        .filter((p) => p.lat >= sw.getLat() && p.lat <= ne.getLat() && p.lng >= sw.getLng() && p.lng <= ne.getLng())
        .slice(0, 40);
      const list = inView.some((p) => p.id === selectedId)
        ? inView
        : [...inView, ...points.filter((p) => p.id === selectedId)];
      list.forEach((p) => {
        const o = makePin(p, p.id === selectedId);
        o.setMap(map);
        overlaysRef.current.push(o);
      });
    } else {
      const markers = points.map((p) => {
        const m = new kakao.maps.Marker({ position: new kakao.maps.LatLng(p.lat, p.lng) });
        kakao.maps.event.addListener(m, "click", () => onSelectRef.current(p.id));
        return m;
      });
      clustererRef.current.addMarkers(markers);
      const sel = points.find((p) => p.id === selectedId);
      if (sel) {
        const o = makePin(sel, true);
        o.setMap(map);
        overlaysRef.current.push(o);
      }
    }
  }, [points, selectedId, status, zoomedIn, tick]);

  return (
    <>
      <div ref={divRef} className="sm-canvas" aria-label="SHOWDAY 지도" />
      {status === "loading" && <div className="sm-overlay">지도를 불러오는 중입니다…</div>}
      {status === "error" && (
        <div className="sm-overlay">
          지도를 불러오지 못했습니다.<span>{err}</span>
        </div>
      )}
    </>
  );
});

export default EventMap;
