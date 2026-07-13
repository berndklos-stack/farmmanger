export type ViewKey =
  | "dashboard"
  | "fields"
  | "create"
  | "jobs"
  | "driver"
  | "contractor"
  | "masterData"
  | "report";

export type UserRole =
  | "farmer_admin"
  | "farmer_employee"
  | "contractor_admin"
  | "driver"
  | "advisor"
  | "support_admin";

export type PersonnelEmployeeType = "field" | "administration" | "workshop" | "warehouse";

export type PersonnelAppPermissionKey =
  | "canEditFields"
  | "canCreateJobs"
  | "canEditDrivers"
  | "canAssignDrivers";

export type PersonnelAppAccess = {
  role: UserRole;
  allowedViews: ViewKey[];
  permissions: Partial<Record<PersonnelAppPermissionKey, boolean>>;
};

export type JobCompletionStatus = "review" | "checked" | "billable" | "invoiced";

export type OrganizationKind = "farmer" | "contractor" | "advisor" | "supplier" | "other";
export type DriverJobVisibility = "contractor_all" | "organization_internal" | "organization_all" | "assigned_only";
export type OrganizationRelationshipStatus = "invited" | "active" | "paused" | "ended" | "blocked";
export type ExternalContactType = "customer" | "contractor" | "supplier" | "other";
export type ExternalContactStatus = "external" | "invited" | "linked" | "archived";

export type AuthProfile = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  organizationId?: string;
  vehicleName?: string;
  jobVisibility?: DriverJobVisibility;
  allowedViews?: ViewKey[];
  appPermissions?: Partial<Record<PersonnelAppPermissionKey, boolean>>;
};

export type OrganizationContact = {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  sms?: string;
  notes?: string;
};

export type Organization = {
  id: string;
  name: string;
  kind: OrganizationKind;
  organizationNumber?: string;
  address?: string;
  street?: string;
  country?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  vatId?: string;
  logoUrl?: string;
  defaultLanguage?: string;
  billingDetails?: string;
  customerNumber?: string;
  supplierCategory?: string;
  notes?: string;
  contacts?: OrganizationContact[];
  archivedAt?: string;
};

export type OrganizationRelationship = {
  id: string;
  farmerOrganizationId: string;
  contractorOrganizationId: string;
  status: OrganizationRelationshipStatus;
  invitedBy?: string;
  acceptedBy?: string;
  invitationEmail?: string;
  invitationMessage?: string;
  createdAt?: string;
  acceptedAt?: string;
  endedAt?: string;
  notes?: string;
};

export type ExternalContact = {
  id: string;
  organizationId: string;
  contactType: ExternalContactType;
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  organizationNumber?: string;
  linkedOrganizationId?: string;
  status: ExternalContactStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Status =
  | "offen"
  | "reserviert"
  | "in Arbeit"
  | "pausiert"
  | "teilweise erledigt"
  | "erledigt"
  | "Problem";

export type WorkMode = "Einzelmodus" | "Teammodus" | "Rollenmodus" | "Flächenteilung";
export type ProgressMetric = "Fläche" | "Menge" | "Fuhren" | "Zeit";
export type TemplateOwnerType = "system" | "organization";
export type FieldMapPattern = "none" | "whiteDots";

export type FieldMapStyle = {
  label: string;
  color: string;
  pattern: FieldMapPattern;
};

export type GeoPoint = {
  lat: number;
  lng: number;
};

export type FieldBoundary = GeoPoint[];

export type FieldHazardType =
  | "wet_area"
  | "stones"
  | "narrow_access"
  | "water_protection"
  | "other";

export type FieldHazard = {
  id: string;
  type: FieldHazardType;
  title: string;
  description: string;
  location: GeoPoint;
  photoUrl?: string;
};

export type FieldAttachment = {
  id: string;
  name: string;
  kind: "photo" | "document";
  placeholderUrl?: string;
  filePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  archivedAt?: string;
};

export type FieldAccessPoint = GeoPoint & {
  label: string;
};

export type Field = {
  id: string;
  organizationId?: string;
  name: string;
  areaHa: number;
  crop: string;
  tenure: "Eigentum" | "Pacht";
  center: GeoPoint;
  accessPoint: FieldAccessPoint;
  accessDescription: string;
  boundary: FieldBoundary;
  hazards: FieldHazard[];
  attachments: FieldAttachment[];
  restrictedZones: string[];
  history: string[];
  mapStyle?: FieldMapStyle;
  manualWorkPlan?: {
    id: string;
    label: string;
    dueDate?: string;
    note?: string;
    createdAt: string;
    mapStyle: FieldMapStyle;
  };
  releasedContractorIds?: string[];
  archivedAt?: string;
};

export type Driver = {
  id: string;
  profileId?: string;
  organizationId?: string;
  name: string;
  vehicle: string;
  jobVisibility?: DriverJobVisibility;
  email?: string;
  accessPassword?: string;
  mobile?: string;
  licenseClasses?: string[];
  maxDailyHours?: number;
  annualVacationDays?: number;
  vacationUsedDays?: number;
  employeeType?: PersonnelEmployeeType;
  appRole?: UserRole;
  allowedViews?: ViewKey[];
  appPermissions?: Partial<Record<PersonnelAppPermissionKey, boolean>>;
  resourceType?: string;
  operationType?: string;
  archivedAt?: string;
};

export type DriverLocationStatus = "unterwegs" | "in Arbeit" | "pausiert" | "Problem" | "abgemeldet";

export type DriverLocation = {
  id: string;
  driverId: string;
  driverName: string;
  vehicleName?: string;
  subtaskId?: string;
  fieldId?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  status: DriverLocationStatus;
  recordedAt: string;
};

export type SubtaskPhoto = {
  id: string;
  name: string;
  url: string;
  filePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt: string;
  uploadedByDriverId?: string;
};

export type SubtaskStatusEvent = {
  id: string;
  message: string;
  createdAt: string;
};

export type SubtaskTravelEvent = {
  id: string;
  driverId?: string;
  driverName?: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  km: number;
};

export type SubtaskAssignment = {
  id: string;
  driverId?: string;
  vehicleId?: string;
  implementId?: string;
  role?: string;
  areaShare?: number;
};

export type Vehicle = {
  id: string;
  organizationId?: string;
  name: string;
  type: string;
  licensePlate?: string;
  manufacturer?: string;
  model?: string;
  constructionYear?: number;
  operatingHours?: number;
  defaultDriverId?: string;
  resourceType?: string;
  operationType?: string;
  status: "frei" | "zugewiesen" | "wartung";
  archivedAt?: string;
};

export type Implement = {
  id: string;
  organizationId?: string;
  name: string;
  type: string;
  manufacturer?: string;
  workingWidth?: number;
  resourceType?: string;
  operationType?: string;
  status: "frei" | "zugewiesen" | "wartung";
  archivedAt?: string;
};

export type Task = {
  id: string;
  name: string;
  subtasks?: string[];
  mode: WorkMode;
  allowMultipleWorkers: boolean;
  maxVehicles: number;
  progressMetric: ProgressMetric[];
  requiredDrivers?: number;
  requiredVehicles?: number;
  requiredImplements?: number;
  resourceHint?: string;
  estimatedHours?: number;
  timePerHa?: number;
  targetValue?: number;
  plannedAmount?: number;
  unit?: string;
  mapStyle?: FieldMapStyle;
};

export type TaskTemplate = {
  id: string;
  organizationId?: string;
  isSystemTemplate?: boolean;
  templateOwnerType?: TemplateOwnerType;
  sourceTemplateId?: string;
  createdByAdmin?: boolean;
  name: string;
  workSteps: string[];
  timePerHa: number;
  mode: WorkMode;
  maxVehicles: number;
  progressMetric: ProgressMetric;
  requiredDrivers?: number;
  requiredVehicles?: number;
  requiredImplements?: number;
  resourceHint?: string;
  unit?: string;
  billingUnit?: "ha" | "hour" | "trip" | "quantity" | "flat";
  standardPrice?: number;
  standardPriceCurrency?: string;
  standardPriceValidFrom?: string;
  standardPriceValidTo?: string;
  mapStyle?: FieldMapStyle;
  archivedAt?: string;
};

export type Subtask = {
  id: string;
  jobId: string;
  fieldId: string;
  taskId: string;
  status: Status;
  progress: number;
  activeDriverIds: string[];
  activeDriverNames?: string[];
  activeAssignments?: SubtaskAssignment[];
  performedDriverIds?: string[];
  performedDriverNames?: string[];
  activeVehicleIds?: string[];
  performedVehicleNames?: string[];
  activeImplementIds?: string[];
  performedImplementIds?: string[];
  workedMinutes?: number;
  workStartedAt?: string;
  workEndedAt?: string;
  plannedCrews?: number;
  estimatedHours?: number;
  targetValue?: number;
  targetUnit?: string;
  note?: string;
  doneHa?: number;
  doneAmount?: number;
  trips?: number;
  accessUsed?: string;
  accessOk?: boolean;
  newHazardReported?: boolean;
  newHazardType?: FieldHazardType;
  newHazardDescription?: string;
  driverNote?: string;
  driverPhotoName?: string;
  driverPhotos?: SubtaskPhoto[];
  statusEvents?: SubtaskStatusEvent[];
  travelEvents?: SubtaskTravelEvent[];
  completedAt?: string;
  updatedAt?: string;
  statusChangedAt?: string;
};

export type Job = {
  id: string;
  jobNumber?: string;
  title: string;
  customer: string;
  contractor: string;
  farmerOrganizationId?: string;
  contractorOrganizationId?: string;
  fieldIds: string[];
  tasks: Task[];
  jobTypeId?: string;
  jobTypeName?: string;
  plannedCrews?: number;
  estimatedHours?: number;
  timeWindow: string;
  priority?: string;
  notes: string;
  completionStatus?: JobCompletionStatus;
  completionStatusChangedAt?: string;
  completionStatusChangedBy?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  archivedAt?: string;
};

export type JobType = {
  id: string;
  organizationId?: string;
  isSystemTemplate?: boolean;
  templateOwnerType?: TemplateOwnerType;
  sourceTemplateId?: string;
  createdByAdmin?: boolean;
  archivedAt?: string;
  name: string;
  description: string;
  defaultCrews: number;
  defaultEstimatedHours: number;
  tasks: Task[];
  resourceSummary: string;
};
