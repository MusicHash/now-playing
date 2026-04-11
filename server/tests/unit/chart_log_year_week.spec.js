import { getYearWeek } from '../../src/lib/query_log/chart_log.js';

describe('chart_log getYearWeek (Tuesday00:00 UTC)', () => {
    it('labels the block containing Jan 1 as week 1 of that chart year', () => {
        expect(getYearWeek(new Date('2026-01-01T10:00:00.000Z'))).toBe(202601);
        expect(getYearWeek(new Date('2026-01-05T23:59:59.000Z'))).toBe(202601);
    });

    it('increments at Tuesday 00:00 UTC', () => {
        expect(getYearWeek(new Date('2026-01-06T00:00:00.000Z'))).toBe(202602);
    });

    it('uses the same id for Tuesday and Wednesday in the same block', () => {
        const tue = getYearWeek(new Date('2026-06-09T12:00:00.000Z'));
        const wed = getYearWeek(new Date('2026-06-10T12:00:00.000Z'));
        expect(tue).toBe(wed);
        expect(tue).toBe(202624);
    });

    it('assigns late December to week 1 when that block contains Jan 1 (UTC)', () => {
        expect(getYearWeek(new Date('2025-12-30T12:00:00.000Z'))).toBe(202601);
    });

    it('assigns Jan 1 2025 to 202501', () => {
        expect(getYearWeek(new Date('2025-01-01T00:00:00.000Z'))).toBe(202501);
    });
});
