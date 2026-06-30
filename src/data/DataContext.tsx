import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { contractor, drivers, farmer, fields, implementsList, jobTypes, organizations, taskTemplates, vehicles } from "./mockData";
import type { AuthProfile, Driver, Field, Implement, JobType, Organization, TaskTemplate, UserRole, Vehicle } from "../types";

export type PermissionSet = {
  canEditFields: boolean;
  canCreateJobs: boolean;
  canEditDrivers: boolean;
  canAssignDrivers: boolean;
};

type DataContextValue = {
  fields: Field[];
  drivers: Driver[];
  vehicles: Vehicle[];
  implementsList: Implement[];
  organizations: Organization[];
  jobTypes: JobType[];
  taskTemplates: TaskTemplate[];
  addField: (field: Field) => void;
  updateField: (id: string, patch: Partial<Field>) => void;
  archiveField: (id: string) => void;
  deleteField: (id: string) => void;
  uploadFieldAttachments: (fieldId: string, kind: "photo" | "document", files: File[]) => Promise<void>;
  archiveFieldAttachment: (fieldId: string, attachmentId: string) => void;
  addDriver: (driver: Driver) => void;
  updateDriver: (id: string, patch: Partial<Driver>) => void;
  archiveDriver: (id: string) => void;
  restoreDriver: (id: string) => void;
  deleteDriver: (id: string) => void;
  addVehicle: (vehicle: Vehicle) => void;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void;
  archiveVehicle: (id: string) => void;
  restoreVehicle: (id: string) => void;
  deleteVehicle: (id: string) => void;
  addImplement: (implement: Implement) => void;
  updateImplement: (id: string, patch: Partial<Implement>) => void;
  archiveImplement: (id: string) => void;
  restoreImplement: (id: string) => void;
  deleteImplement: (id: string) => void;
  addOrganization: (organization: Organization) => void;
  updateOrganization: (id: string, patch: Partial<Organization>) => void;
  archiveOrganization: (id: string) => void;
  deleteOrganization: (id: string) => void;
  archiveJob: (id: string) => void;
  restoreJob: (id: string) => void;
  deleteJob: (id: string) => void;
  addJobType: (jobType: JobType) => void;
  updateJobType: (id: string, patch: Partial<JobType>) => void;
  archiveJobType: (id: string) => void;
  deleteJobType: (id: string) => void;
  addTaskTemplate: (taskTemplate: TaskTemplate) => void;
  updateTaskTemplate: (id: string, patch: Partial<TaskTemplate>) => void;
  archiveTaskTemplate: (id: string) => void;
  deleteTaskTemplate: (id: string) => void;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  authProfile: AuthProfile | null;
  currentDriverId: string | null;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  permissions: PermissionSet;
  farmerName: string;
  contractorName: string;
  isDemoMode: boolean;
  isLoading: boolean;
  sourceLabel: string;
};

const defaultValue: DataContextValue = {
  fields,
  drivers,
  vehicles,
  implementsList,
  organizations,
  jobTypes,
  taskTemplates,
  addField: () => undefined,
  updateField: () => undefined,
  archiveField: () => undefined,
  deleteField: () => undefined,
  uploadFieldAttachments: async () => undefined,
  archiveFieldAttachment: () => undefined,
  addDriver: () => undefined,
  updateDriver: () => undefined,
  archiveDriver: () => undefined,
  restoreDriver: () => undefined,
  deleteDriver: () => undefined,
  addVehicle: () => undefined,
  updateVehicle: () => undefined,
  archiveVehicle: () => undefined,
  restoreVehicle: () => undefined,
  deleteVehicle: () => undefined,
  addImplement: () => undefined,
  updateImplement: () => undefined,
  archiveImplement: () => undefined,
  restoreImplement: () => undefined,
  deleteImplement: () => undefined,
  addOrganization: () => undefined,
  updateOrganization: () => undefined,
  archiveOrganization: () => undefined,
  deleteOrganization: () => undefined,
  archiveJob: () => undefined,
  restoreJob: () => undefined,
  deleteJob: () => undefined,
  addJobType: () => undefined,
  updateJobType: () => undefined,
  archiveJobType: () => undefined,
  deleteJobType: () => undefined,
  addTaskTemplate: () => undefined,
  updateTaskTemplate: () => undefined,
  archiveTaskTemplate: () => undefined,
  deleteTaskTemplate: () => undefined,
  currentRole: "farmer_admin",
  setCurrentRole: () => undefined,
  authProfile: null,
  currentDriverId: null,
  isAuthenticated: false,
  signOut: async () => undefined,
  permissions: {
    canEditFields: true,
    canCreateJobs: true,
    canEditDrivers: false,
    canAssignDrivers: false,
  },
  farmerName: farmer,
  contractorName: contractor,
  isDemoMode: true,
  isLoading: false,
  sourceLabel: "Demo-Modus aktiv",
};

const DataContext = createContext<DataContextValue>(defaultValue);

export function DataProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: DataContextValue;
}) {
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData() {
  return useContext(DataContext);
}
