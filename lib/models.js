const { mongoose } = require("./mongoose");
const { Schema }   = mongoose;

/* ── User ── */
const userSchema = new Schema({
  username:     { type: String, required: true, unique: true },
  password:     { type: String, required: true },
  role:         { type: String, default: "user" },
  display_name: { type: String, default: "" },
  company:      { type: String, default: "" },
  job_title:    { type: String, default: "" },
  department:   { type: String, default: "" },
  email:        { type: String, default: "" },
  phone:        { type: String, default: "" },
  location:     { type: String, default: "" },
  bio:          { type: String, default: "" },
  created_at:   { type: Date, default: Date.now },
  updated_at:   { type: Date, default: Date.now },
});

/* ── Opportunity ── */
const opportunitySchema = new Schema({
  source:           { type: String },
  external_id:      { type: String },
  title:            { type: String },
  summary:          { type: String },
  url:              { type: String },
  posted_date:      { type: String },
  close_date:       { type: String },
  agency:           { type: String },
  category:         { type: String },
  award_floor:      { type: Number },
  award_ceil:       { type: Number },
  matched_keywords: { type: String },
  aln:              { type: String },
  fetched_at:       { type: String },
});

opportunitySchema.index({ source: 1, external_id: 1 }, { unique: true });

/* ── Fetch Log ── */
const fetchLogSchema = new Schema({
  ran_at:  { type: String },
  source:  { type: String },
  status:  { type: String },
  count:   { type: Number, default: 0 },
  error:   { type: String, default: null },
});

/* ── Interest ── */
const interestSchema = new Schema({
  user_id:        { type: Schema.Types.ObjectId, ref: "User" },
  opportunity_id: { type: Schema.Types.ObjectId, ref: "Opportunity" },
  created_at:     { type: Date, default: Date.now },
});

interestSchema.index({ user_id: 1, opportunity_id: 1 }, { unique: true });

/* ── Conversation ── */
const conversationSchema = new Schema({
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

/* ── Participant ── */
const participantSchema = new Schema({
  conversation_id: { type: Schema.Types.ObjectId, ref: "Conversation" },
  user_id:         { type: Schema.Types.ObjectId, ref: "User" },
  joined_at:       { type: Date, default: Date.now },
  last_read_at:    { type: Date, default: Date.now },
  deleted_at:      { type: Date, default: null },
});

participantSchema.index({ conversation_id: 1, user_id: 1 }, { unique: true });

/* ── Message ── */
const messageSchema = new Schema({
  conversation_id: { type: Schema.Types.ObjectId, ref: "Conversation" },
  sender_id:       { type: Schema.Types.ObjectId, ref: "User" },
  content:         { type: String },
  created_at:      { type: Date, default: Date.now },
  edited_at:       { type: Date, default: null },
  is_deleted:      { type: Boolean, default: false },
  deleted_at:      { type: Date, default: null },
});

module.exports = {
  User:         mongoose.model("User",         userSchema),
  Opportunity:  mongoose.model("Opportunity",  opportunitySchema),
  FetchLog:     mongoose.model("FetchLog",     fetchLogSchema),
  Interest:     mongoose.model("Interest",     interestSchema),
  Conversation: mongoose.model("Conversation", conversationSchema),
  Participant:  mongoose.model("Participant",  participantSchema),
  Message:      mongoose.model("Message",      messageSchema),
};