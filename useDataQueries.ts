import { useMemo } from "react";
import { useAppData } from "../data/DataContext";
import type { Job, Subtask } from "../types";

export function useFields() {
  return useAppData().fields;
}

export function useField(id: string) {
  const fields = useFields();
  return useMemo(() => fields.find((field) => field.id === id), [fields, id]);
}

export function useJobs(jobs: Job[]) {
  return jobs;
}

export function useJob(jobs: Job[], id: string) {
  return useMemo(() => jobs.find((job) => job.id === id), [jobs, id]);
}

export function useJobTasks(subtasks: Subtask[], jobId: string) {
  return useMemo(() => subtasks.filter((subtask) => subtask.jobId === jobId), [subtasks, jobId]);
}

export function useTaskAssignments(subtasks: Subtask[], taskId: string) {
  return useMemo(
    () => subtasks.find((subtask) => subtask.taskId === taskId)?.activeDriverIds ?? [],
    [subtasks, taskId],
  );
}

export function useFieldHazards(fieldId: string) {
  const field = useField(fieldId);
  return field?.hazards ?? [];
}
