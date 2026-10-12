// stationJump.js - Station database, query lookup, map flyTo jump & animated highlight
import { getLastStationGeoJSON } from "../layers/station/stationState.js";

export const BUILTIN_STATIONS = [
  { id: "54511", name: "Beijing", nameZh: "北京", lon: 116.40, lat: 39.90 },
  { id: "58362", name: "Shanghai", nameZh: "上海/宝山", lon: 121.45, lat: 31.40 },
  { id: "59287", name: "Guangzhou", nameZh: "广州", lon: 113.33, lat: 23.17 },
  { id: "57516", name: "Chongqing", nameZh: "重庆/沙坪坝", lon: 106.47, lat: 29.58 },
  { id: "57494", name: "Wuhan", nameZh: "武汉", lon: 114.13, lat: 30.62 },
  { id: "58847", name: "Fuzhou", nameZh: "福州", lon: 119.28, lat: 26.08 },
  { id: "58606", name: "Nanchang", nameZh: "南昌", lon: 115.92, lat: 28.60 },
  { id: "57083", name: "Zhengzhou", nameZh: "郑州", lon: 113.65, lat: 34.72 },
  { id: "53463", name: "Hohhot", nameZh: "呼和浩特", lon: 111.68, lat: 40.85 },
  { id: "51463", name: "Urumqi", nameZh: "乌鲁木齐", lon: 87.65, lat: 43.78 },
  { id: "52889", name: "Lanzhou", nameZh: "兰州", lon: 103.88, lat: 36.05 },
  { id: "56778", name: "Kunming", nameZh: "昆明", lon: 102.68, lat: 25.01 },
  { id: "59758", name: "Haikou", nameZh: "海口", lon: 110.35, lat: 20.03 },
  { id: "58238", name: "Nanjing", nameZh: "南京", lon: 118.80, lat: 32.00 },
  { id: "58457", name: "Hangzhou", nameZh: "杭州", lon: 120.17, lat: 30.23 },
  { id: "54857", name: "Qingdao", nameZh: "青岛", lon: 120.33, lat: 36.07 },
  { id: "54161", name: "Changchun", nameZh: "长春", lon: 125.22, lat: 43.90 },
  { id: "50953", name: "Harbin", nameZh: "哈尔滨", lon: 126.57, lat: 45.75 },
  { id: "54342", name: "Shenyang", nameZh: "沈阳", lon: 123.43, lat: 41.77 },
  { id: "56294", name: "Chengdu", nameZh: "成都/温江", lon: 103.85, lat: 30.70 },
  { id: "53772", name: "Taiyuan", nameZh: "太原", lon: 112.55, lat: 37.78 },
  { id: "53698", name: "Shijiazhuang", nameZh: "石家庄", lon: 114.42, lat: 38.03 },
  { id: "57131", name: "Xi'an", nameZh: "西安", lon: 108.93, lat: 34.30 },
  { id: "57687", name: "Changsha", nameZh: "长沙", lon: 112.98, lat: 28.20 },
  { id: "59981", name: "Xisha", nameZh: "西沙", lon: 112.33, lat: 16.83 },
  { id: "55591", name: "Lhasa", nameZh: "拉萨", lon: 91.13, lat: 29.67 },
  { id: "58659", name: "Wenzhou", nameZh: "温州", lon: 120.69, lat: 28.01 },
  { id: "59493", name: "Shenzhen", nameZh: "深圳", lon: 114.05, lat: 22.54 },
  { id: "59316", name: "Shantou", nameZh: "汕头", lon: 116.68, lat: 23.35 },
  { id: "58221", name: "Hefei", nameZh: "合肥", lon: 117.28, lat: 31.86 },
  { id: "56571", name: "Xichang", nameZh: "西昌", lon: 102.26, lat: 27.90 },
];

export const CHINESE_STATIONS = BUILTIN_STATIONS;

export function searchStations(query, limit = 10) {
  if (!query || typeof query !== "string") return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results = [];
  const seen = new Set();

  // 1. Match from live GeoJSON features if loaded
  const geojson = getLastStationGeoJSON();
  if (geojson && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      if (!f || !f.geometry || !f.geometry.coordinates) continue;
      const props = f.properties || {};
      const stId = String(props.station_id || props.id || "").trim();
      const stName = String(props.name || props.station_name || "").trim();
      if (!stId) continue;

      if (stId.toLowerCase().includes(q) || stName.toLowerCase().includes(q)) {
        if (!seen.has(stId)) {
          seen.add(stId);
          results.push({
            id: stId,
            name: stName || `Station ${stId}`,
            lon: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
            source: "live",
          });
          if (results.length >= limit) return results;
        }
      }
    }
  }

  // 2. Match from builtin stations dictionary
  for (const st of BUILTIN_STATIONS) {
    if (seen.has(st.id)) continue;
    const matchId = st.id.toLowerCase().includes(q);
    const matchName = st.name.toLowerCase().includes(q);
    const matchZh = st.nameZh && st.nameZh.toLowerCase().includes(q);

    if (matchId || matchName || matchZh) {
      seen.add(st.id);
      results.push({
        id: st.id,
        name: `${st.id} ${st.nameZh || st.name}`,
        lon: st.lon,
        lat: st.lat,
        source: "builtin",
      });
      if (results.length >= limit) break;
    }
  }

  return results;
}

export function highlightStationOnMap(map, arg1, arg2, arg3, arg4) {
  if (!map || typeof map.getSource !== "function") return;

  let lon, lat, label, duration;
  if (typeof arg1 === "object" && arg1 !== null) {
    lon = arg1.lon;
    lat = arg1.lat;
    label = arg1.name || arg1.id || "";
    duration = typeof arg2 === "number" ? arg2 : 4000;
  } else {
    lon = arg1;
    lat = arg2;
    label = arg3 || "";
    duration = typeof arg4 === "number" ? arg4 : 4000;
  }

  const sourceId = "station-quick-jump-source";
  const haloLayerId = "station-quick-jump-halo";
  const centerLayerId = "station-quick-jump-center";

  const featureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lon, lat],
        },
        properties: {
          label: label || "",
        },
      },
    ],
  };

  const existingSource = map.getSource(sourceId);
  if (existingSource && typeof existingSource.setData === "function") {
    existingSource.setData(featureCollection);
  } else {
    try {
      if (typeof map.addSource === "function") {
        map.addSource(sourceId, {
          type: "geojson",
          data: featureCollection,
        });
      }

      if (typeof map.getLayer === "function" && typeof map.addLayer === "function") {
        if (!map.getLayer(haloLayerId)) {
          map.addLayer({
            id: haloLayerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-radius": 18,
              "circle-color": "transparent",
              "circle-stroke-color": "#58a6ff",
              "circle-stroke-width": 3,
              "circle-stroke-opacity": 0.9,
            },
          });
        }

        if (!map.getLayer(centerLayerId)) {
          map.addLayer({
            id: centerLayerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-radius": 5,
              "circle-color": "#ff4d4f",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            },
          });
        }
      }
    } catch (err) {
      console.warn("[stationJump] highlight error:", err);
    }
  }

  if (map.__stationHighlightTimer) {
    clearTimeout(map.__stationHighlightTimer);
    map.__stationHighlightTimer = null;
  }

  if (duration > 0) {
    map.__stationHighlightTimer = setTimeout(() => {
      map.__stationHighlightTimer = null;
      try {
        if (typeof map.getLayer === "function") {
          if (map.getLayer(haloLayerId)) map.removeLayer(haloLayerId);
          if (map.getLayer(centerLayerId)) map.removeLayer(centerLayerId);
        }
        if (typeof map.getSource === "function" && map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch {}
    }, duration);
  }
}

export function jumpToStation(map, stationOrId) {
  if (!map) return false;
  let target = null;

  if (typeof stationOrId === "object" && stationOrId !== null) {
    target = stationOrId;
  } else if (typeof stationOrId === "string" || typeof stationOrId === "number") {
    const q = String(stationOrId).trim();
    const matches = searchStations(q, 1);
    if (matches.length > 0) {
      target = matches[0];
    }
  }

  if (!target || target.lon == null || target.lat == null) return false;

  const curZoom = typeof map.getZoom === "function" ? map.getZoom() : 4;
  const targetZoom = Math.max(curZoom, 7.5);

  try {
    if (typeof map.flyTo === "function") {
      map.flyTo({
        center: [target.lon, target.lat],
        zoom: targetZoom,
        essential: true,
      });
    } else if (typeof map.easeTo === "function") {
      map.easeTo({
        center: [target.lon, target.lat],
        zoom: targetZoom,
      });
    }
    highlightStationOnMap(map, target.lon, target.lat, target.id);
    return true;
  } catch (err) {
    console.warn("[stationJump] flyTo error:", err);
    return false;
  }
}
