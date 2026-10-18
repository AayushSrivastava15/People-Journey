import { z } from 'zod';

export const DashboardStatsSchema = z.object({
  totalEmployees: z.number(),
  activeEmployees: z.number(),
  onboardingEmployees: z.number(),
  offboardingEmployees: z.number(),
  exitedEmployees: z.number(),
  joiningThisMonth: z.number(),
  upcomingJoiners: z.number(),
  upcomingExits: z.number(),
  statusDistribution: z.array(z.object({
    name: z.string(),
    value: z.number(),
  })),
  departmentBreakdown: z.array(z.object({
    name: z.string(),
    value: z.number(),
  })),
  monthlyActivity: z.array(z.object({
    month: z.string(),
    joining: z.number(),
    exits: z.number(),
  })),
  upcomingEvents: z.array(z.object({
    id: z.string(),
    person: z.string(),
    label: z.string(),
    date: z.string(),
    status: z.string(),
    path: z.string(),
  })),
});

export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
