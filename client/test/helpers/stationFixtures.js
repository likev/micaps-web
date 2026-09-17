// stationFixtures.js - Standard test GeoJSON fixtures for surface and sounding stations

export function createSampleSurfaceStations() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] },
        properties: { station_id: 54511, slp: 1012.5, visibility: 12.0, rain_6h: 0.0, temperature: 24.5, dewpoint: 15.0, wind_speed: 4.0, wind_direction: 180 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.5, 31.2] },
        properties: { station_id: 58362, slp: 1008.2, visibility: 8.5, rain_6h: 12.4, temperature: 28.0, dewpoint: 22.0, wind_speed: 8.0, wind_direction: 135 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] },
        properties: { station_id: 59287, slp: 1004.5, visibility: 20.0, rain_6h: 35.8, temperature: 31.0, dewpoint: 26.0, wind_speed: 12.0, wind_direction: 90 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] },
        properties: { station_id: 56294, slp: 1014.0, visibility: 4.2, rain_6h: 5.2, temperature: 22.0, dewpoint: 18.0, wind_speed: 2.0, wind_direction: 45 },
      },
    ],
  };
}

export function createSampleSoundingStations(level = 500) {
  const hgtBase = level === 700 ? 3120 : (level === 850 ? 1520 : 5880);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [116.4, 39.9] },
        properties: { station_id: 54511, height: hgtBase - 40, temperature: -14.5, dewpoint: -22.0, wind_speed: 18.5, wind_direction: 270 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [121.4, 31.2] },
        properties: { station_id: 58362, height: hgtBase, temperature: -10.0, dewpoint: -15.5, wind_speed: 24.0, wind_direction: 260 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [113.3, 23.1] },
        properties: { station_id: 59287, height: hgtBase + 40, temperature: -6.5, dewpoint: -11.0, wind_speed: 12.0, wind_direction: 250 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [104.0, 30.6] },
        properties: { station_id: 56294, height: hgtBase - 20, temperature: -12.0, dewpoint: -18.0, wind_speed: 14.0, wind_direction: 280 },
      },
    ],
  };
}
