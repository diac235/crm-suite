export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleSlug: string;
  roleLevel: number;
  teamId: string | null;
  permissions: string[];
}

export interface CatalogItem {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
}

export interface ActivityType extends CatalogItem {
  code: string;
  icon: string | null;
  color: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  probability: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
  isActive: boolean;
  opportunitiesCount?: number;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface Bootstrap {
  sectors: CatalogItem[];
  prospectSources: CatalogItem[];
  activityTypes: ActivityType[];
  pipelineStages: PipelineStage[];
  taxRates: TaxRate[];
}

export interface Option {
  id: string;
  label: string;
  email?: string;
  position?: string | null;
  isPrimary?: boolean;
}

export interface Client {
  id: string;
  code: string;
  kind: string;
  taxId: string | null;
  legalName: string;
  tradeName: string | null;
  address?: string | null;
  city: string | null;
  state: string | null;
  country: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  status: string;
  economicActivity: string | null;
  notes?: string | null;
  creditLimit?: string | null;
  sectorId: string | null;
  sectorName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  contactsCount: number;
  createdAt: string;
  updatedAt: string;
  contacts?: Contact[];
}

export interface Contact {
  id: string;
  clientId: string;
  clientName?: string;
  firstName: string;
  lastName: string;
  position: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  birthDate: string | null;
  isPrimary: boolean;
  isActive: boolean;
  notes: string | null;
}

export interface Prospect {
  id: string;
  code: string;
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  taxId: string | null;
  position: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  status: string;
  temperature: string;
  estimatedValue: string | null;
  enteredAt: string;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  lostReason: string | null;
  notes: string | null;
  convertedAt: string | null;
  convertedClientId: string | null;
  sourceId: string | null;
  sourceName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  ownerId: string | null;
  ownerName: string | null;
}

export interface Opportunity {
  id: string;
  code: string;
  name: string;
  amount: string;
  currency: string;
  probability: number;
  status: string;
  openedAt: string;
  expectedCloseAt: string | null;
  closedAt: string | null;
  competitor: string | null;
  lostReason: string | null;
  description: string | null;
  clientId: string | null;
  clientName: string | null;
  prospectId: string | null;
  contactId: string | null;
  contactName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  stageId: string;
  stageName: string;
  stageColor: string;
  sourceId: string | null;
  sourceName: string | null;
  history?: StageHistoryEntry[];
}

export interface StageHistoryEntry {
  id: string;
  note: string | null;
  createdAt: string;
  fromStageName: string | null;
  toStageName: string;
  changedByName: string | null;
}

export interface BoardColumn {
  stage: PipelineStage;
  items: Opportunity[];
  count: number;
  total: string;
  weighted: string;
}

export interface QuoteItem {
  id?: string;
  productId: string | null;
  productSku?: string | null;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  discountPct: string | number;
  taxRateId: string | null;
  taxPct: string | number;
  lineSubtotal?: string;
  lineDiscount?: string;
  lineTax?: string;
  lineTotal?: string;
  position?: number;
}

export interface Quote {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  decisionAt: string | null;
  rejectionReason: string | null;
  clientId: string;
  clientName: string;
  clientTaxId: string | null;
  contactId: string | null;
  contactName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  items?: QuoteItem[];
}

export interface Sale {
  id: string;
  number: string;
  status: string;
  saleDate: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  clientId: string;
  clientName: string;
  quoteId: string | null;
  quoteNumber: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  items?: Array<{ id: string; description: string; quantity: string; unitPrice: string; lineTotal: string }>;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  price: string;
  cost: string | null;
  isActive: boolean;
  taxRateId: string | null;
  taxRateName: string | null;
  taxRate: string | null;
}

export interface Activity {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  scheduledAt: string;
  durationMin: number;
  completedAt: string | null;
  location: string | null;
  outcome: string | null;
  typeId: string;
  typeName: string;
  typeCode: string;
  typeColor: string;
  clientId: string | null;
  clientName: string | null;
  contactId: string | null;
  contactName: string | null;
  prospectId: string | null;
  prospectName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  ownerId: string | null;
  ownerName: string | null;
}

export interface CalendarEvent {
  id: string;
  kind: string;
  title: string;
  start: string;
  end: string;
  color: string;
  status: string;
  typeCode: string;
  clientName: string | null;
  ownerName: string | null;
  link: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  clientId: string | null;
  clientName: string | null;
  prospectId: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  isOverdue: boolean;
  commentsCount: number;
  comments?: TaskComment[];
}

export interface TaskComment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
}

export interface DocumentItem {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  createdAt: string;
  clientId: string | null;
  clientName: string | null;
  prospectId: string | null;
  opportunityId: string | null;
  quoteId: string | null;
  uploadedByName: string | null;
}

export interface Note {
  id: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  authorName: string | null;
  authorId: string | null;
}

export interface TimelineEvent {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  occurredAt: string;
  actor: string | null;
  entityId: string | null;
  meta?: Record<string, unknown>;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  position: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  roleId: string;
  roleName: string;
  roleSlug: string;
  roleLevel: number;
  teamId: string | null;
  teamName: string | null;
}

export interface Role {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  level: number;
  isSystem: boolean;
  usersCount?: number;
  permissionsCount?: number;
  permissions?: string[];
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  leaderId: string | null;
  leaderName: string | null;
  membersCount: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  module: string;
  ipAddress: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
}

export interface SearchGroup {
  type: string;
  label: string;
  items: Array<{
    id: string;
    type: string;
    title: string;
    subtitle: string | null;
    badge: string | null;
    link: string;
  }>;
}
