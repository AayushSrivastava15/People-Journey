import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { dashboardCache } from '../../src/utils/dashboard-cache.js';
import { companyProfileCache } from '../../src/utils/company-profile-cache.js';
import type { DashboardStats } from '../../src/models/dashboard.model.js';
import type { CompanyProfile, CompanyOnboardingStatus } from '../../src/models/company-profile.model.js';

describe('Server-Side Caching & Multi-Tenant Isolation', () => {
  beforeEach(async () => {
    await dashboardCache.clear();
    companyProfileCache.clear();
  });

  it('1. should cache dashboard KPI statistics per owner_user_id', async () => {
    const ownerA = 'a1111111-1111-4000-8000-000000000001';
    const mockStatsA: DashboardStats = {
      totalEmployees: 42,
      activeEmployees: 40,
      onboardingEmployees: 2,
      offboardingEmployees: 0,
      exitedEmployees: 5,
      joiningThisMonth: 2,
      upcomingJoiners: 1,
      upcomingExits: 0,
      statusDistribution: [{ name: 'Active', value: 40 }],
      departmentBreakdown: [{ name: 'Engineering', value: 30 }],
      monthlyActivity: [{ month: 'Nov', joining: 2, exits: 0 }],
      upcomingEvents: [],
    };

    // Initially uncached
    const initial = await dashboardCache.getStats(ownerA);
    assert.strictEqual(initial, null);

    // Save to cache
    await dashboardCache.setStats(ownerA, mockStatsA);

    // Retrieved from cache
    const retrieved = await dashboardCache.getStats(ownerA);
    assert.deepStrictEqual(retrieved, mockStatsA);
    assert.strictEqual(retrieved?.totalEmployees, 42);
  });

  it('2. should enforce strict tenant isolation between different company owners', async () => {
    const ownerA = 'a1111111-1111-4000-8000-000000000001';
    const ownerB = 'b2222222-2222-4000-8000-000000000002';

    const mockStatsA: DashboardStats = {
      totalEmployees: 10,
      activeEmployees: 10,
      onboardingEmployees: 0,
      offboardingEmployees: 0,
      exitedEmployees: 0,
      joiningThisMonth: 0,
      upcomingJoiners: 0,
      upcomingExits: 0,
      statusDistribution: [],
      departmentBreakdown: [],
      monthlyActivity: [],
      upcomingEvents: [],
    };

    const mockStatsB: DashboardStats = {
      totalEmployees: 99,
      activeEmployees: 95,
      onboardingEmployees: 4,
      offboardingEmployees: 0,
      exitedEmployees: 12,
      joiningThisMonth: 3,
      upcomingJoiners: 2,
      upcomingExits: 0,
      statusDistribution: [],
      departmentBreakdown: [],
      monthlyActivity: [],
      upcomingEvents: [],
    };

    await dashboardCache.setStats(ownerA, mockStatsA);
    await dashboardCache.setStats(ownerB, mockStatsB);

    // Owner A gets only A's data
    const resA = await dashboardCache.getStats(ownerA);
    assert.strictEqual(resA?.totalEmployees, 10);

    // Owner B gets only B's data
    const resB = await dashboardCache.getStats(ownerB);
    assert.strictEqual(resB?.totalEmployees, 99);

    // Unregistered Owner C gets null
    const resC = await dashboardCache.getStats('c3333333-3333-4000-8000-000000000003');
    assert.strictEqual(resC, null);
  });

  it('3. should invalidate dashboard cache for the mutated tenant while preserving others', async () => {
    const ownerA = 'a1111111-1111-4000-8000-000000000001';
    const ownerB = 'b2222222-2222-4000-8000-000000000002';

    const mockStats: DashboardStats = {
      totalEmployees: 5,
      activeEmployees: 5,
      onboardingEmployees: 0,
      offboardingEmployees: 0,
      exitedEmployees: 0,
      joiningThisMonth: 0,
      upcomingJoiners: 0,
      upcomingExits: 0,
      statusDistribution: [],
      departmentBreakdown: [],
      monthlyActivity: [],
      upcomingEvents: [],
    };

    await dashboardCache.setStats(ownerA, mockStats);
    await dashboardCache.setStats(ownerB, mockStats);

    // Invalidate Owner A (e.g. employee created or offboarded in Company A)
    await dashboardCache.invalidate(ownerA);

    // Owner A should be cleared
    assert.strictEqual(await dashboardCache.getStats(ownerA), null);

    // Owner B must remain intact
    const cachedB = await dashboardCache.getStats(ownerB);
    assert.strictEqual(cachedB?.totalEmployees, 5);
  });

  it('4. should cache and invalidate company profile and onboarding status', async () => {
    const ownerA = 'a1111111-1111-4000-8000-000000000001';
    const mockProfile: CompanyProfile = {
      id: 'cp-1',
      ownerUserId: ownerA,
      companyName: 'Acme Technologies',
      displayName: 'Acme',
      logoUrl: null,
      brandPrimaryColor: '#59424f',
      industry: 'Software',
      companyWebsite: null,
      companyAddress: null,
      officeLocation: null,
      companyEmail: 'info@acme.com',
      companyPhone: null,
      country: null,
      timezone: 'UTC',
      hrContactName: 'Alice HR',
      hrContactEmail: 'alice@acme.com',
      hrContactPhone: null,
      departmentTeam: 'People',
      defaultSenderName: null,
      defaultEmailSignature: null,
      setupCompleted: true,
      setupStep: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockOnboarding: CompanyOnboardingStatus = {
      setupCompleted: true,
      setupStep: 4,
      stepsCompleted: 4,
      totalSteps: 4,
      steps: {
        details: true,
        branding: true,
        hrContact: true,
        exitForm: true,
      },
      hasDefaultTemplate: true,
    };

    // Store in cache
    await companyProfileCache.setProfile(ownerA, mockProfile);
    await companyProfileCache.setOnboardingStatus(ownerA, mockOnboarding);

    // Read back
    const cachedProf = await companyProfileCache.getProfile(ownerA);
    assert.strictEqual(cachedProf?.companyName, 'Acme Technologies');

    const cachedStatus = await companyProfileCache.getOnboardingStatus(ownerA);
    assert.strictEqual(cachedStatus?.setupCompleted, true);

    // Invalidate upon update
    await companyProfileCache.invalidate(ownerA);

    assert.strictEqual(await companyProfileCache.getProfile(ownerA), undefined);
    assert.strictEqual(await companyProfileCache.getOnboardingStatus(ownerA), null);
  });

  it('5. should operate gracefully without Redis (pure in-memory mode)', async () => {
    // Verified that in-memory map handles all operations without throws
    const ownerX = 'usr-x';
    await dashboardCache.setPersonal(ownerX, {
      user: { id: ownerX, email: 'x@test.com', displayName: 'X', photoUrl: null, role: 'user', accountStatus: 'active' },
      employeeProfile: null,
      notifications: [],
      checklist: [],
    });

    const personal = await dashboardCache.getPersonal(ownerX);
    assert.strictEqual(personal?.user.email, 'x@test.com');

    await dashboardCache.invalidatePersonal(ownerX);
    assert.strictEqual(await dashboardCache.getPersonal(ownerX), null);
  });
});

