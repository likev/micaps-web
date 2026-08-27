// presets.js - Multi-layer composite preset groups configuration
export const PRESET_GROUPS = [
  {
    id: "composite-500hpa",
    name: "500hPa Composite (HGT + RH + WIND)",
    category: "NWP Synoptic",
    defaultLevel: 500,
    hasLevel: true,
    layers: [
      {
        id: "rh",
        name: "Relative Humidity (Fills)",
        model: "ECMWF_HR",
        element: "RH",
        type: "contour",
        render: {
          showFill: true,
          showLine: false,
          opacity: 0.55,
        },
      },
      {
        id: "hgt",
        name: "Geopotential Height (Lines)",
        model: "ECMWF_HR",
        element: "HGT",
        type: "contour",
        render: {
          showFill: false,
          showLine: true,
          lineColor: "#58a6ff",
          lineWidth: 1.8,
        },
      },
      {
        id: "wind",
        name: "Wind Field (Streamlines)",
        model: "ECMWF_HR",
        element: "WIND",
        type: "wind",
        render: {
          keepWind: true,
        },
      },
    ],
  },
  {
    id: "composite-850hpa",
    name: "850hPa Low-Level Jet (HGT + TMP + WIND)",
    category: "NWP Synoptic",
    defaultLevel: 850,
    hasLevel: true,
    layers: [
      {
        id: "hgt",
        name: "850hPa Height (Lines)",
        model: "ECMWF_HR",
        element: "HGT",
        type: "contour",
        render: {
          showFill: false,
          showLine: true,
          lineColor: "#58a6ff",
          lineWidth: 1.6,
        },
      },
      {
        id: "tmp",
        name: "850hPa Temperature (Isotherms)",
        model: "ECMWF_HR",
        element: "TMP",
        type: "contour",
        render: {
          showFill: false,
          showLine: true,
          lineColor: "#f85149",
          lineWidth: 1.5,
        },
      },
      {
        id: "wind",
        name: "850hPa Wind Streamlines",
        model: "ECMWF_HR",
        element: "WIND",
        type: "wind",
        render: {
          keepWind: true,
        },
      },
    ],
  },
  {
    id: "composite-200hpa",
    name: "200hPa Jet Stream (HGT + WIND)",
    category: "NWP Synoptic",
    defaultLevel: 200,
    hasLevel: true,
    layers: [
      {
        id: "hgt",
        name: "200hPa Height (Lines)",
        model: "ECMWF_HR",
        element: "HGT",
        type: "contour",
        render: {
          showFill: false,
          showLine: true,
          lineColor: "#58a6ff",
          lineWidth: 1.8,
        },
      },
      {
        id: "wind",
        name: "200hPa Jet Streamlines",
        model: "ECMWF_HR",
        element: "WIND",
        type: "wind",
        render: {
          keepWind: true,
        },
      },
    ],
  },
  {
    id: "composite-surface",
    name: "Surface Synoptic (Plots + SLP Isobars)",
    category: "Surface Observations",
    defaultLevel: null,
    hasLevel: false,
    layers: [
      {
        id: "surface-obs",
        name: "Surface Station Observations",
        model: "SURFACE",
        element: "PLOT_GLOBAL_3H",
        type: "station",
      },
    ],
  },
];
