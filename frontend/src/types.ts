/** Shapes returned by the Smart Nigrani System API. Kept in one place so a backend
 *  change surfaces as a TypeScript error rather than a blank panel. */

/** The system has exactly two roles: an MP monitors, a contractor reports. */
export type Role = 'mp' | 'vendor'

export type RiskLabel = 'Critical Review' | 'High Review' | 'Medium Review' | 'Routine'

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

/** The row shape used by list and map views. */
export interface ProjectSummary {
  id: string
  anonId: string
  name: string
  category: string | null
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
  riskScore: number
  riskLabel: RiskLabel
  primaryReason: string
  activeSignals: number
  scores: Scores
  workEntries?: number
  workLogged?: number
}

export interface MapPoint {
  id: string
  name: string
  district: string | null
  lat: number
  lon: number
  riskScore: number
  riskLabel: RiskLabel
  budget: number | null
  status: string
  locationPrecision: string | null
}

export interface DuplicateMatch {
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

export interface ProjectDetail extends ProjectSummary {
  anomaly: Anomaly | null
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
  signals: Signal[]
  peer: Peer
  duplicateMatch: DuplicateMatch | null
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
  delayedProjects: number
  flaggedProjects: number
  highRiskProjects: number
  totalBudget: number
  totalSpent: number
  utilisation: number
  districts: number
  riskCounts: Record<RiskLabel, number>
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
  derivedFields?: Record<string, string>
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
