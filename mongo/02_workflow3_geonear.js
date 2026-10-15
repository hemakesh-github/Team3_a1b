// ============================================================
// StaySpot :: 02_workflow3_geonear.js
// Workflow 3: Trending Search Hotspots
// Find recent SearchSessions within 5km of an anchor and summarize
// them into distance bands. $geoNear must be the first stage.
// ============================================================

db = db.getSiblingDB(process.env.STAYSPOT_MONGO_DB || "stayspot");

const anchor = {
  type: "Point",
  coordinates: [77.5946, 12.9716] // Bengaluru: [longitude, latitude]
};

const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

const pipeline = [
  {
    $geoNear: {
      near: anchor,
      distanceField: "distance_meters",
      maxDistance: 5000,
      spherical: true,
      query: { created_at: { $gte: twoHoursAgo } }
    }
  },
  {
    $bucket: {
      groupBy: "$distance_meters",
      boundaries: [0, 1000, 2000, 3000, 4000, 5000],
      default: "5000+",
      output: {
        session_count: { $sum: 1 },
        avg_distance_m: { $avg: "$distance_meters" }
      }
    }
  },
  { $sort: { session_count: -1 } }
];

printjson(db.SearchSessions.aggregate(pipeline).toArray());

// Performance proof to capture after loading the required 500k+ rows:
// printjson(db.SearchSessions.explain("executionStats").aggregate(pipeline));
