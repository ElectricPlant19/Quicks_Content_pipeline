const mongoose = require('mongoose');

const FactSchema = new mongoose.Schema({
  hook:       { type: String, required: true, maxlength: 200 },
  insight:    { type: String, required: true },
  twist:      { type: String, default: null },
  image_url:                  { type: String,  default: null },
  image_source_provider:      { type: String,  default: null },
  image_source_page:          { type: String,  default: null },
  image_license:              { type: String,  default: null },
  image_author:               { type: String,  default: null },
  image_attribution_required: { type: Boolean, default: false },
  image_confidence:           { type: Number,  default: null },
  image_storage_key:          { type: String,  default: null }, // reserved for CDN
  image_cdn_url:              { type: String,  default: null }, // reserved for CDN
  category:   { type: String, required: true, enum: [
    'Psychology', 'Economics', 'Science', 'History',
    'Decision-Making', 'Behavior', 'Technology', 'Philosophy'
  ]},
  tags:       [{ type: String }],
  score:      { type: Number, default: 0, min: 0, max: 10 },
  scoring: {
    hook_strength:   Number,
    insight_density: Number,
    twist_impact:    Number,
    shareability:    Number,
    clarity:         Number,
    verdict:         String,
    weakness:        String,
  },
  source: {
    title: String,
    url:   String,
  },
  status: {
    type: String,
    enum: ['approved', 'pending_review', 'rejected'],
    default: 'pending_review'
  },
  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now },
});

FactSchema.index({ score: -1 });
FactSchema.index({ status: 1 });
FactSchema.index({ category: 1 });

module.exports = mongoose.model('Fact', FactSchema);
