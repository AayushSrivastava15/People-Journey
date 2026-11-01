import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { createExitInterviewSchema, evaluationSchema, reopenExitInterviewSchema, submitExitInterviewSchema } from '../../src/models/exit-interview.model';
import { validateExitInterviewAnswers } from '../../src/services/exit-interview.service';

const frozenSchema = { sections: [{ id: 'feedback', questions: [
  { id: 'reason', type: 'textarea', required: true },
  { id: 'rating', type: 'rating', required: true, min: 1, max: 5 },
  { id: 'topics', type: 'checkbox', required: false, options: ['pay', 'growth'] },
  { id: 'hr_note', type: 'textarea', hrOnly: true },
] }] };

describe('Exit interview API validation', () => {
  it('defaults expiry to 14 days and accepts configured expiry from 1 to 90 days', () => {
    const base = { employeeId: 9, templateId: 'e8199261-0274-43b1-923a-78eb5532722c' };
    strictEqual(createExitInterviewSchema.parse(base).expiryDays, 14);
    strictEqual(createExitInterviewSchema.parse({ ...base, expiryDays: 1 }).expiryDays, 1);
    strictEqual(createExitInterviewSchema.parse({ ...base, expiryDays: 90 }).expiryDays, 90);
    strictEqual(createExitInterviewSchema.safeParse({ ...base, expiryDays: 91 }).success, false);
  });

  it('rejects owner supplied fields and extra submit payload fields', () => {
    strictEqual(createExitInterviewSchema.safeParse({ employeeId: 1, templateId: 'e8199261-0274-43b1-923a-78eb5532722c', ownerUserId: 'x' }).success, false);
    strictEqual(submitExitInterviewSchema.safeParse({ answers: {}, status: 'COMPLETED' }).success, false);
  });

  it('validates required questions, rating bounds, checkbox choices, and rejects HR-only IDs', () => {
    ok(validateExitInterviewAnswers(frozenSchema, { reason: 'New role', rating: 4, topics: ['growth'] }) === null);
    ok(validateExitInterviewAnswers(frozenSchema, { reason: 'New role', rating: 6 }) !== null);
    ok(validateExitInterviewAnswers(frozenSchema, { reason: 'New role', rating: 3, topics: ['salary'] }) !== null);
    ok(validateExitInterviewAnswers(frozenSchema, { reason: 'New role', rating: 3, hr_note: 'private' }) !== null);
    ok(validateExitInterviewAnswers(frozenSchema, { rating: 3 }) !== null);
  });

  it('requires explicit reopen confirmation and validates HR evaluation fields', () => {
    strictEqual(reopenExitInterviewSchema.safeParse({}).success, false);
    ok(reopenExitInterviewSchema.safeParse({ confirm: true, expiryDays: 30 }).success);
    ok(evaluationSchema.safeParse({ regrettableExit: true, actionItems: ['Review retention process'] }).success);
    strictEqual(evaluationSchema.safeParse({ ownerUserId: 'other' }).success, false);
  });
});
