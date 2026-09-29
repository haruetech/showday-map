// 화면 전체에서 쓰는 선(line) 아이콘 — 이모티콘 대신 사용. 24x24 기준, 정적 문자열이라 그대로 그려도 안전하다.
export const ICONS: Record<string, string> = {
  mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
  frame: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.7"/><path d="m21 16-5-5-9 9"/>',
  sparkle: '<path d="M11 3l1.8 4.7L17.5 9.5l-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z"/><path d="M18.5 14v5M16 16.5h5"/>',
  sprout: '<path d="M7 21h10M12 21v-9"/><path d="M12 12c0-4 3-6.5 7.5-6.5 0 4-3 6.5-7.5 6.5zM12 15c0-3-2.2-5-6.5-5 0 3 2.2 5 6.5 5z"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  won: '<circle cx="12" cy="12" r="9"/><path d="m8 9 1.6 6L12 10l2.4 5L16 9M7.5 11.5h9M7.5 13.5h9"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M10 20v-5.5h4V20"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16 9.5"/>',
  pin: '<path d="M12 21.5s7-6 7-11.7a7 7 0 0 0-14 0c0 5.7 7 11.7 7 11.7z"/><circle cx="12" cy="9.8" r="2.4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.2a2 2 0 0 0 4 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  rain: '<path d="M7 15.5a4 4 0 0 1-.6-7.9A5.5 5.5 0 0 1 17 8.6a3.5 3.5 0 0 1 0 6.9z"/><path d="M8 18.5l-1 2.5M12.5 18.5l-1 2.5M17 18.5l-1 2.5"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.6-7.9A5.5 5.5 0 0 1 17 11.1 3.5 3.5 0 0 1 17 18z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  locate: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
  share: '<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="m8.3 10.7 7.4-3.9M8.3 13.3l7.4 3.9"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
};

/** 문자열 SVG (지도 핀 등 DOM에 직접 넣을 때) */
export function iconSvg(name: string, size = 16, color = "currentColor", stroke = 1.9) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}
