// ============================================================
// StaySpot :: 03_workflow4_facet.js
// Workflow 4: Multi-Faceted Review Analytics
// ============================================================

db = db.getSiblingDB(process.env.STAYSPOT_MONGO_DB || "stayspot");

// Use a property_id that actually exists in the seeded collection.
// Leave null to run the analytics across all reviews.
const propertyId = process.env.STAYSPOT_PROPERTY_ID || null;

const matchStage = propertyId === null ? {} : { property_id: propertyId };

const pipeline = [
  { $match: matchStage },
  {
    $facet: {
      ratingDistribution: [
        { $group: { _id: "$rating", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ],
      topTags: [
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ],
      overallAverage: [
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 }
          }
        }
      ]
    }
  }
];

printjson(db.PropertyReviews.aggregate(pipeline).toArray());

// Performance proof:
// printjson(db.PropertyReviews.explain("executionStats").aggregate(pipeline));
