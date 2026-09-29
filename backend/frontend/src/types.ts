/** Shapes returned by the Smart Nigrani System API. Kept in one place so a backend
 *  change surfaces as a TypeScript error rather than a blank panel. */

/**
 * The five roles. An MP and a research analyst review; a contractor, a field
 * officer and the implementing agency deliver. "vendor" is the contractor:
 * the technical name is kept because stored accounts already use it.
 */
export type Role = 'mp' | 'vendor' | 'officer' | 'agency' | 'analyst'

/** "Not checked" means the four checks never ran on this work, not that it passed them. */
export type RiskLabel = 'Critical Review' | 'High Review' | 'Medium Review' | 'Routine' | 'Not checked'

/** One of the seven record checks run inside the app (rules-1.0). */
export interface RecordCheck {
  kind: 'cost' | 'duplicate' | 'timing' | 'amount' | 'payment' | 'quality'
  points: number
  title: string
  detail: string
}

export interface Payment {
  date: string | null
  amount: number | null
  /** Payee from the expenditure report. Blank on public pages. */
  vendor: string | null
  status: string | null
  /** Serial number of the row in the expenditure report. */
  row: string
}

export interface SourceRow {
  file: string
  row: string
}

/** A short reference to another work, for peer and similar lists. */
export interface WorkBrief {
  id: string
  anonId: string | null
  name: string | null
  district: string | null
  budget: number | null
  sanctionAmount: number | null
  sanctionDate: string | null
  status: string | null
  riskLabel?: RiskLabel
  linkable: boolean
  similarity?: number
}

export interface PeerStats {
  count: number
  median: number
  q1: number
  q3: number
  ratio: number
}

export interface ExpenseItem {
  material: string
  unit: string
  quantity: number
  rate: number
  invoice: string
  total?: number
}

export interface Evidence {
  id: string
  projectId: string
  sha256: string
  note: string
  stage: string | null
  progress: number | null
  lat: number | null
  lng: number | null
  accuracy: number | null
  flags: string[]
  createdBy: string
  createdByName: string
  role: Role
  createdAt: string
  bytes: number | null
  vision: { text: string; model: string; createdAt: string } | null
}

export interface Review {
  id: string
  datasetId: string
  projectId: string
  targetKind: 'work' | 'worklog' | 'evidence'
  targetId: string | null
  decision: string
  note: string
  createdBy: string
  createdByName: string
  role: Role
  createdAt: string
  projectName?: string | null
  projectRef?: string | null
}

export interface User {
  id: string
  username: string
  name: string
  role: Role
  mpName: string | null
  districtKey: string | null
  constituency: string | null
  organisation: string | null
}

export interface Scores {
  cost: number
  duplicate: number
  delay: number
  payment: number
}

export type SignalKey = keyof Scores

export interface Signal {
  key: SignalKey
  label: string
  score: number
  active: boolean
  explanation: string | null
}

/**
 * What the four checks found about a work.
 *
 * Every field here is optional, and that is the important part. Only a member
 * receives these. A contractor's copy of the same record arrives from the
 * server with none of them, because recording work and judging the record are
 * two different jobs. Marking them optional means TypeScript makes you check
 * before you draw a score, instead of letting a contractor screen quietly
 * render "undefined".
 */
export interface RiskFindings {
  riskScore: number
  riskLabel: RiskLabel
  primaryReason: string
  activeSignals: number
  scores: Scores
}

/** The row shape used by list and map views. */
export interface ProjectSummary extends Partial<RiskFindings> {
  id: string
  anonId: string
  /** "mplads" for a work from the reports, "registered" for one an agency added. */
  source?: 'mplads' | 'registered'
  name: string
  category: string | null
  workType?: string | null
  mpAlias?: string | null
  stage?: string | null
  deadline?: string | null
  fourChecks?: boolean
  ruleScore?: number
  /** Titles of the record checks that fired. */
  checks?: string[]
  anomaly?: Anomaly | null
  /** Worked out from the description, not published in the source data. */
  sector: string | null
  district: string | null
  constituency: string | null
  mp: string | null
  status: string
  budget: number | null
  totalPaid: number
  paymentRatio: number | null
  sanctionDate: string | null
  completionDate: string | null
  lat: number | null
  lon: number | null
  workEntries?: number
  workLogged?: number
}

/** A pin on a map. Delivery roles are sent no score or label. */
export interface MapPoint {
  id: string
  name: string
  district: string | null
  lat: number
  lon: number
  riskScore: number
  riskLabel?: RiskLabel
  budget: number | null
  status: string
  locationPrecision: string | null
  source?: 'mplads' | 'registered'
}

export interface DuplicateMatch {
  sanctionDate?: string | null
  id: string | null
  description: string | null
  similarity: number | null
  sameAgency: boolean | null
  sameConstituency: boolean | null
  name?: string | null
  budget?: number | null
  district?: string | null
  status?: string | null
  linkable?: boolean
}

export interface Peer {
  count: number | null
  medianInr: number | null
  q1Inr: number | null
  q3Inr: number | null
  ratioToMedian: number | null
  averageSimilarity: number | null
}

export interface WorkLog {
  id: string
  srNo: number
  projectId: string
  work: string
  cost: number
  date: string
  note: string | null
  createdBy: string
  createdByName: string
  createdAt: string
  items?: ExpenseItem[] | null
  stage?: string | null
  progress?: number | null
  flags?: string[]
}

export interface WorkLogCreated extends WorkLog {
  exceedsBudget: boolean
  projectedTotal: number
  budget: number
}

/** The Isolation Forest's opinion. Null when the work cannot be scored. */
export interface Anomaly {
  /** 0 to 1. Higher means further from the ordinary pattern. */
  score: number
  /** Where it sits among the works the model was trained on. */
  percentile: number
}

export interface ProjectDetail extends Omit<ProjectSummary, 'checks'> {
  /** Oversight roles only, like the rest of the check results. */
  anomaly?: Anomaly | null
  checks?: RecordCheck[]
  similar?: WorkBrief[]
  peers?: WorkBrief[]
  peerStats?: PeerStats | null
  payments: Payment[]
  sources: SourceRow[]
  evidence: Evidence[]
  reviews: Review[]
  description?: string | null
  datasetId?: string
  snapshot?: string
  pendingPaid?: number
  sanctionInterval?: number | null
  duration?: number | null
  recommendationSanctionDate?: string | null
  imageLabel?: string | null
  areaAlias?: string | null
  authorityAlias?: string | null
  reportedProgress?: number | null
  overdueDays?: number
  contractor?: string
  officer?: string
  createdBy?: string
  createdAt?: string
  state: string
  districtKey: string | null
  agency: string | null
  sanctioned: boolean
  hasCompletionRecord: boolean
  sanctionAmount: number | null
  recommendedAmount: number | null
  amountDisbursed: number | null
  paymentCount: number
  recommendedDate: string | null
  firstPaymentDate: string | null
  lastPaymentDate: string | null
  daysSinceSanction: number | null
  daysSinceLastPayment: number | null
  locationPrecision: string | null
  signals?: Signal[]
  peer?: Peer
  duplicateMatch?: DuplicateMatch | null
  works: WorkLog[]
  workLogged: number
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface Kpis {
  scope: string
  snapshot: string
  totalProjects: number
  sanctioned: number
  recommendations: number
  activeProjects: number
  completedProjects: number
  totalBudget: number
  totalSpent: number
  utilisation: number
  districts: number

  /** Member only. A contractor is not sent counts of flagged works. */
  delayedProjects?: number
  flaggedProjects?: number
  highRiskProjects?: number
  riskCounts?: Record<RiskLabel, number>

  /** Delivery roles only: how much this account has recorded. */
  myEntries?: number
  myEvidence?: number
  registered?: number
  withRecordChecks?: number
  scoredByModel?: number
}

export interface NamedValue {
  name: string
  value: number
}

export interface DistrictStat {
  name: string
  count: number
  budget: number
  spent: number
  flagged: number
  utilisation: number
}

export interface Charts {
  byStatus: NamedValue[]
  byCategory: NamedValue[]
  bySector: NamedValue[]
  byRisk: NamedValue[]
  byDistrict: DistrictStat[]
  bySignal: (NamedValue & { key: SignalKey })[]
}

export interface QueueReason {
  label: string
  score: number
  explanation: string | null
}

export interface QueueItem {
  anomaly?: Anomaly | null
  checks?: string[]
  id: string
  anonId: string
  name: string
  district: string | null
  mp: string | null
  budget: number | null
  totalPaid: number
  status: string
  riskScore: number
  riskLabel: RiskLabel
  primaryReason: string
  activeSignals: number
  reasons: QueueReason[]
}

export interface FilterOptions {
  checkKinds?: string[]
  districts: string[]
  categories: string[]
  sectors: string[]
  statuses: string[]
  constituencies: string[]
  members: string[]
  riskLabels: RiskLabel[]
}

export interface DemoAccount {
  username: string
  name: string
  role: Role
  scope: string
}

export interface Meta {
  totalProjects: number
  sanctioned: number
  unsanctionedRecommendations: number
  withRiskSignal: number
  withCoordinates: number
  districts: number
  constituencies: number
  members: number
  labelCounts: Record<string, number>
  sectorCounts: Record<string, number>
  scoredByModel?: number
  fourChecksRun?: number
  withRecordChecks?: number
  derivedFields?: Record<string, string>
  geminiConfigured?: boolean
  model?: ModelCard | null
  modelVsRules?: { top: number; routine: number }
  summary?: DatasetSummary
  snapshot: string
  generatedAt: string
  source: string
  state: string
  methodology: {
    weights: Scores
    multiSignalBonus: string
    thresholds: Record<string, number>
    note: string
  }
  knownLimits: string[]
}

export interface ModelCard {
  model: string
  version: string
  seed: number
  trainingRecords: number
  features: string[]
  scope: string
  evaluation: string
}

/** The joined dataset's own totals, as the pipeline counted them. */
export interface DatasetSummary {
  version: string
  asOf: string
  counts: Record<string, number>
  works: number
  sanctioned: number
  completed: number
  recommendationsWithoutId: number
  mpCount: number
  areaCount: number
  flagged: number
  highPriority: number
  successfulPayments: number
  pendingPayments: number
  totalSanctioned: number
  totalRecommended: number
  allocated: number
  paid: number
  pending: number
  statusDifferences: number
  issues: { type: string; id: string }[]
}

export interface DatasetEntry {
  id: string
  name: string
  asOf: string
  createdAt: string
  summary: DatasetSummary
  owner: string | null
  shared: boolean
  fourChecks: boolean
}

export interface ResearchOverview {
  datasetId: string
  snapshot: string
  summary: DatasetSummary
  meta: Meta
  allocations: { mp: string | null; constituency: string | null; allocated: number | null; row: string }[]
  checkCounts: Record<string, number>
  model: ModelCard | null
}

export interface TeamMember {
  username: string
  name: string
  role: Role
  createdAt: string
}

export interface UpdateItem {
  kind: 'worklog' | 'evidence' | 'review'
  id: string
  projectId: string
  projectName: string | null
  projectRef: string | null
  title: string
  note?: string
  amount?: number
  itemCount?: number
  flags: string[]
  by: string
  at: string
}

export interface Updates {
  items: UpdateItem[]
  overdue: { projectId: string; projectName: string; deadline: string; days: number; progress: number | null }[]
  checkedAt: string
  refreshSeconds: number
}

export interface NetworkData {
  members: { alias: string; name?: string; works: number; flagged: number; district: string | null }[]
  works: {
    id: string
    anonId: string
    mpAlias: string
    name: string
    sector: string
    district: string | null
    budget: number | null
    riskLabel: RiskLabel
    riskScore: number
  }[]
  total: number
}

export interface ProjectQuery {
  /** Index signature so the query object can be handed straight to the
   *  query-string builder without a cast. */
  [key: string]: string | number | undefined
  search?: string
  district?: string
  category?: string
  sector?: string
  status?: string
  risk?: string
  constituency?: string
  member?: string
  checks?: string
  source?: string
  dataset?: string
  sort?: string
  page?: number
  limit?: number
}

export interface HighlightReason {
  label: string
  explanation: string | null
}

/** A flagged work shown on the public landing page. Carries no MP name. */
export interface Highlight {
  id: string
  ref: string
  name: string
  district: string | null
  budget: number | null
  totalPaid: number
  status: string
  riskScore: number
  riskLabel: RiskLabel
  scores: Scores
  reasons: HighlightReason[]
}

export interface Highlights {
  snapshot: string
  flaggedTotal: number
  items: Highlight[]
}

/** One work on the landing page map: latitude, longitude, severity 0 to 3. */
export type PublicMapPoint = [number, number, number]

export interface PublicMap {
  points: PublicMapPoint[]
  count: number
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  legend: string[]
}
