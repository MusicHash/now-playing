import {
    extractSpotifyTrackId,
    getNewlyPlayedSongs,
    historySongKey,
    normalizeHistoryField,
} from '../../src/lib/history_diff.js';

const t = (id, artist, title, extra = {}) => ({
    track_id: id,
    artist,
    title,
    ...extra,
});

describe('history_diff', () => {
    describe('normalizeHistoryField', () => {
        it('trims and collapses whitespace', () => {
            expect(normalizeHistoryField('  a  b  ')).toBe('a b');
        });
    });

    describe('extractSpotifyTrackId', () => {
        it('prefers track_id', () => {
            expect(extractSpotifyTrackId({ track_id: 'abc', id: 'def' })).toBe('abc');
        });

        it('uses id when track_id missing (Spotify playlist parser)', () => {
            expect(extractSpotifyTrackId({ id: '0NJdtoQ3RX5ckBjJlNXhlP' })).toBe('0NJdtoQ3RX5ckBjJlNXhlP');
        });
    });

    describe('historySongKey', () => {
        it('uses spotify id when present', () => {
            expect(historySongKey(t('id1', 'A', 'B'))).toBe('spotify:id1');
        });

        it('falls back to artist+title when no id', () => {
            expect(historySongKey({ artist: 'A', title: 'B' })).toBe('name:A\u0000B');
        });
    });

    describe('getNewlyPlayedSongs', () => {
        it('returns [] when lists are identical', () => {
            const prev = [t('1', 'A', 'A1'), t('2', 'B', 'B1')];
            expect(getNewlyPlayedSongs(prev, [...prev])).toEqual([]);
        });

        it('detects one new track at the top (simple diff)', () => {
            const prev = [t('1', 'A', 'A1'), t('2', 'B', 'B1'), t('3', 'C', 'C1')];
            const curr = [t('0', 'Z', 'Z1'), t('1', 'A', 'A1'), t('2', 'B', 'B1'), t('3', 'C', 'C1')];
            expect(getNewlyPlayedSongs(prev, curr)).toEqual([t('0', 'Z', 'Z1')]);
        });

        it('detects several new tracks at the top', () => {
            const prev = [t('1', 'A', 'A1'), t('2', 'B', 'B1')];
            const curr = [t('x', 'X', 'X1'), t('y', 'Y', 'Y1'), t('1', 'A', 'A1'), t('2', 'B', 'B1')];
            expect(getNewlyPlayedSongs(prev, curr)).toEqual([t('x', 'X', 'X1'), t('y', 'Y', 'Y1')]);
        });

        it('detects a re-play bump: track moves from lower index to top with same id (complicated diff)', () => {
            const prev = [
                t('a', 'A', 'A1'),
                t('b', 'B', 'B1'),
                t('c', 'C', 'C1'),
                t('d', 'D', 'D1'),
            ];
            const curr = [
                t('c', 'C', 'C1'),
                t('a', 'A', 'A1'),
                t('b', 'B', 'B1'),
                t('d', 'D', 'D1'),
            ];
            expect(getNewlyPlayedSongs(prev, curr)).toEqual([t('c', 'C', 'C1')]);
        });

        it('handles bump using spotify id from id field only', () => {
            const prev = [
                { id: 'a', artist: 'A', title: 'A1' },
                { id: 'b', artist: 'B', title: 'B1' },
                { id: 'c', artist: 'C', title: 'C1' },
            ];
            const curr = [
                { id: 'c', artist: 'C', title: 'C1' },
                { id: 'a', artist: 'A', title: 'A1' },
                { id: 'b', artist: 'B', title: 'B1' },
            ];
            expect(getNewlyPlayedSongs(prev, curr)).toEqual([{ id: 'c', artist: 'C', title: 'C1' }]);
        });

        it('matches name keys when spotify ids are absent (legacy snapshots)', () => {
            const prev = [
                { artist: 'A', title: 'A1' },
                { artist: 'B', title: 'B1' },
            ];
            const curr = [
                { artist: 'B', title: 'B1' },
                { artist: 'A', title: 'A1' },
            ];
            expect(getNewlyPlayedSongs(prev, curr)).toEqual([{ artist: 'B', title: 'B1' }]);
        });

        it('returns full current list when no suffix alignment is found (fallback)', () => {
            const prev = [t('1', 'A', 'A1'), t('2', 'B', 'B1')];
            const curr = [t('9', 'Z', 'Z1'), t('8', 'Y', 'Y1')];
            const out = getNewlyPlayedSongs(prev, curr);
            expect(out).toEqual(curr);
        });
    });
});
