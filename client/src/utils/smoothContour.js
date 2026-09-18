// smoothContour.js - Chaikin's algorithm & 2D meteorological spatial filtering facade

export {
  isRingClosed,
  chaikinOpenIteration,
  chaikinClosedIteration,
  smoothCoordinates,
  smoothGeometry,
  smoothFeatureCollection,
} from "./geometry/chaikin.js";

export {
  smoothGrid2D,
} from "./grid/smoothGrid2D.js";

export {
  getSqSegDist,
  simplifyDP,
  simplifyPolyline,
  simplifyFeatureCollection,
} from "./geometry/simplify.js";

export {
  computeOutCode,
  clipSegment,
  clipPolyline,
  clipLineFeature,
  clipLineFeatures,
  clipFeatureCollectionToBBox,
} from "./geometry/clip.js";
