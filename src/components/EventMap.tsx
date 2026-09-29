"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { loadKakaoMaps } from "@/lib/kakaoMapLoader";

export type MapPoint = { id: string; lat: number; lng: number; title: string; imageUrl?: string };
export type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };
export type EventMapHandle = {
  panTo: (lat: number, lng: number, level?: number) => void;
  zoom: (delta: 1 | -1) => void;
  locate: () => void;
};

type Props = {
  points: MapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (b: Bounds) => void;
};

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청
const POSTER_LEVEL = 5; // 이 레벨 이하로 확대하면 포스터 핀으로 표시

const EventMap = forwardRef<EventMapHandle, Props>(function EventMap(
  { points, selectedId, onSelect, onBoundsChange },
  ref
) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const onSelectRef = useRef(onSelect);
  const onBoundsRef = useRef(onBoundsChange);
  onSelectRef.current = onSelect;
  onBoundsRef.current = onBoundsChange;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0); // idle 시마다 증가 → 포스터 핀 갱신
  const [zoomedIn, setZoomedIn] = useState(false);
  const [toast, setToast] = useState("");

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
    locate() {
      if (!navigator.geolocation || !mapRef.current) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          mapRef.current.setCenter(new window.kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
          mapRef.current.setLevel(5);
        },
        () => {
          setToast("현재 위치를 확인하지 못했어요. 위치 권한을 확인해 주세요.");
          setTimeout(() => setToast(""), 3500);
        },
        { timeout: 8000, maximumAge: 300000 }
      );
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
      {toast && <div className="sm-toast">{toast}</div>}
    </>
  );
});

export default EventMap;
