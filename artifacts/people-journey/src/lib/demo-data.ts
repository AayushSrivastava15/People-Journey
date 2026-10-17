export type LifecycleStatus = 'Active' | 'Onboarding' | 'Offboarding' | 'Exited';
export type NoticeStatus = 'Pending' | 'Processing' | 'Sent' | 'Failed' | 'Cancelled';
export type Employee = {
  id: string; name: string; personalEmail: string; workEmail: string;
  department: string; manager: string; joiningDate: string; lastWorkingDay: string | null;
  status: LifecycleStatus;
};
export type Notification = {
  id: string; employeeId: string; type: string; recipient: string;
  scheduledDate: string; status: NoticeStatus; lastAttempt: string | null;
};
export type ExitInterview = { id: string; employeeId: string; status: 'Invited' | 'Submitted' | 'Expired'; expires: string };

export const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const dateFromToday = (offsetDays: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return dateKey(date);
};

export const dateInMonth = (monthsAgo: number, day: number) => {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1, 12);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return dateKey(date);
};

export const recentMonthBuckets = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(1);
    date.setMonth(date.getMonth() - (count - index - 1));
    return {
      key: dateKey(date).slice(0, 7),
      label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date),
    };
  });

// Entirely fictional records, isolated from any API or persistent storage.
export const demoEmployees: Employee[] = [
  { id: 'p-01', name: 'Maya Chen', personalEmail: 'maya.chen@example.test', workEmail: 'maya.chen@sample.test', department: 'Product', manager: 'Ravi Shah', joiningDate: dateInMonth(0, 1), lastWorkingDay: null, status: 'Active' },
  { id: 'p-02', name: 'Jonah Tate', personalEmail: 'jonah.tate@example.test', workEmail: 'jonah.tate@sample.test', department: 'People', manager: 'Nora Ellis', joiningDate: dateFromToday(3), lastWorkingDay: null, status: 'Onboarding' },
  { id: 'p-03', name: 'Amara Reed', personalEmail: 'amara.reed@example.test', workEmail: 'amara.reed@sample.test', department: 'Design', manager: 'Ravi Shah', joiningDate: dateInMonth(2, 10), lastWorkingDay: null, status: 'Active' },
  { id: 'p-04', name: 'Sam Lee', personalEmail: 'sam.lee@example.test', workEmail: 'sam.lee@sample.test', department: 'Engineering', manager: 'Inez Park', joiningDate: dateInMonth(12, 4), lastWorkingDay: dateFromToday(2), status: 'Offboarding' },
  { id: 'p-05', name: 'Leila Morgan', personalEmail: 'leila.morgan@example.test', workEmail: 'leila.morgan@sample.test', department: 'Operations', manager: 'Nora Ellis', joiningDate: dateInMonth(24, 14), lastWorkingDay: null, status: 'Active' },
  { id: 'p-06', name: 'Theo Alvarez', personalEmail: 'theo.alvarez@example.test', workEmail: 'theo.alvarez@sample.test', department: 'Engineering', manager: 'Inez Park', joiningDate: dateInMonth(30, 12), lastWorkingDay: dateFromToday(-36), status: 'Exited' },
  { id: 'p-07', name: 'Priya Nair', personalEmail: 'priya.nair@example.test', workEmail: 'priya.nair@sample.test', department: 'Product', manager: 'Ravi Shah', joiningDate: dateFromToday(6), lastWorkingDay: null, status: 'Onboarding' },
  { id: 'p-08', name: 'Elliot Brooks', personalEmail: 'elliot.brooks@example.test', workEmail: 'elliot.brooks@sample.test', department: 'People', manager: 'Nora Ellis', joiningDate: dateInMonth(14, 7), lastWorkingDay: dateFromToday(7), status: 'Offboarding' },
];

export const demoNotifications: Notification[] = [
  { id: 'n-01', employeeId: 'p-01', type: 'Welcome note', recipient: 'maya.chen@sample.test', scheduledDate: dateFromToday(-7), status: 'Sent', lastAttempt: `${dateFromToday(-7)} 09:05` },
  { id: 'n-02', employeeId: 'p-02', type: 'First-week check-in', recipient: 'jonah.tate@sample.test', scheduledDate: dateFromToday(0), status: 'Pending', lastAttempt: null },
  { id: 'n-03', employeeId: 'p-04', type: 'Exit interview invitation', recipient: 'sam.lee@sample.test', scheduledDate: dateFromToday(1), status: 'Processing', lastAttempt: `${dateFromToday(0)} 11:20` },
  { id: 'n-04', employeeId: 'p-07', type: 'Day-one details', recipient: 'priya.nair@sample.test', scheduledDate: dateFromToday(0), status: 'Failed', lastAttempt: `${dateFromToday(-1)} 15:40` },
  { id: 'n-05', employeeId: 'p-08', type: 'Transition note', recipient: 'elliot.brooks@sample.test', scheduledDate: dateFromToday(5), status: 'Pending', lastAttempt: null },
  { id: 'n-06', employeeId: 'p-03', type: 'Thirty-day check-in', recipient: 'amara.reed@sample.test', scheduledDate: dateFromToday(10), status: 'Cancelled', lastAttempt: null },
];

export const demoExitInterviews: ExitInterview[] = [
  { id: 'i-01', employeeId: 'p-06', status: 'Submitted', expires: dateFromToday(-21) },
  { id: 'i-02', employeeId: 'p-04', status: 'Invited', expires: dateFromToday(9) },
  { id: 'i-03', employeeId: 'p-08', status: 'Invited', expires: dateFromToday(15) },
  { id: 'i-04', employeeId: 'p-05', status: 'Expired', expires: dateFromToday(-5) },
];

export const demoDepartments = ['Product', 'People', 'Design', 'Engineering', 'Operations'];
export const employeeById = (id: string) => demoEmployees.find(person => person.id === id);
