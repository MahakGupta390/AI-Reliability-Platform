/**
 * src/models/incident.model.js  [UNCHANGED from Screen 2]
 * Re-included here so the file set is self-contained.
 * Already has chaosInjected, acknowledgedAt fields from Screen 2.
 */
const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema(
  {
    affectedService:     { type: String, required: true },
    currentP99Ms:        { type: Number, required: true },
    baselineMeanMs:      { type: Number, required: true },
    baselineStdDev:      { type: Number, required: true },
    zScore:              { type: Number, required: true },
    deviationFactor:     { type: Number, required: true },
    rootCause:           { type: String, required: true },
    rootCauseConfidence: { type: String, enum: ['LOW','MEDIUM','HIGH'], required: true },
    allServicesSnapshot: {
      type: Map,
      of: new mongoose.Schema(
        { currentP99Ms: Number, zScore: Number, status: { type: String, enum: ['normal','anomalous','no_data'] } },
        { _id: false },
      ),
    },
    chaosInjected: { type: Boolean, default: false },
    chaosServices: { type: [String], default: [] },
  },
  { _id: false },
);

const timelineEntrySchema = new mongoose.Schema(
  { at: { type: Date, required: true }, event: { type: String, required: true }, zScore: Number, p99Ms: Number },
  { _id: false },
);

const incidentSchema = new mongoose.Schema(
  {
    incidentId:      { type: String, required: true, unique: true, index: true },
    status:          { type: String, enum: ['open','resolved'], default: 'open', index: true },
    severity:        { type: String, enum: ['low','medium','high','critical'], required: true },
    affectedService: { type: String, required: true, index: true },
    symptom:         { type: String, required: true },
    detectedAt:      { type: Date,   required: true, index: true },
    resolvedAt:      { type: Date,   default: null },
    durationMs:      { type: Number, default: null },
    peakZScore:      { type: Number, required: true },
    peakP99Ms:       { type: Number, required: true },
    evidence:        { type: evidenceSchema, required: true },
    timeline:        { type: [timelineEntrySchema], default: [] },
    acknowledgedAt:  { type: Date,   default: null },
    acknowledgedBy:  { type: String, default: null },
  },
  { timestamps: true, toJSON: { transform(doc, ret) { delete ret.__v; return ret; } } },
);

incidentSchema.index({ affectedService: 1, status: 1 });
incidentSchema.index({ detectedAt: -1 });

incidentSchema.methods.resolve = async function (finalZScore, finalP99Ms) {
  this.status     = 'resolved';
  this.resolvedAt = new Date();
  this.durationMs = this.resolvedAt.getTime() - this.detectedAt.getTime();
  this.timeline.push({
    at: this.resolvedAt,
    event: `Incident resolved. Z-score: ${finalZScore.toFixed(2)}`,
    zScore: finalZScore, p99Ms: finalP99Ms,
  });
  return this.save();
};

const Incident = mongoose.model('Incident', incidentSchema);
module.exports = Incident;
