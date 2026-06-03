import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runQuickBooksQuery } from './quickbooks-polling.helper.js';
import type { TriggerStore } from '@soopa/piece-framework';

describe('quickbooks-polling.helper', () => {
    describe('runQuickBooksQuery', () => {
        let mockStore: TriggerStore;
        let mockFetch: ReturnType<typeof vi.fn>;
        const validAuth = { access_token: 'token', props: { companyId: '123' } };

        beforeEach(() => {
            mockStore = {
                get: vi.fn(),
                put: vi.fn(),
                delete: vi.fn(),
            };
            mockFetch = vi.fn();
            global.fetch = mockFetch as any;
        });

        it('should throw if auth missing access_token', async () => {
            await expect(runQuickBooksQuery({ access_token: '', props: { companyId: '123' } }, 'Customer', mockStore))
                .rejects.toThrow('QuickBooks authentication missing or invalid access_token');
        });

        it('should throw if auth missing companyId', async () => {
            await expect(runQuickBooksQuery({ access_token: 'token', props: { companyId: '' } }, 'Customer', mockStore))
                .rejects.toThrow('QuickBooks authentication missing or invalid companyId');
        });

        it('should fetch with fallback cursor', async () => {
            vi.mocked(mockStore.get).mockResolvedValue(null);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ QueryResponse: { Customer: [{ Id: '1', MetaData: { LastUpdatedTime: '2023-01-01T00:00:00Z' } }] } })
            });

            const records = await runQuickBooksQuery(validAuth, 'Customer', mockStore);
            
            expect(records.length).toBe(1);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockStore.put).toHaveBeenCalledWith(
                'igt_Customer_MetaData.LastUpdatedTime',
                { lastUpdatedTime: '2023-01-01T00:00:00Z', lastId: '1' }
            );
        });

        it('should handle timeout error', async () => {
            vi.mocked(mockStore.get).mockResolvedValue({ lastUpdatedTime: '2023-01-01', lastId: '1' });
            
            const timeoutError = new Error('AbortError');
            timeoutError.name = 'AbortError';
            mockFetch.mockRejectedValueOnce(timeoutError);

            await expect(runQuickBooksQuery(validAuth, 'Customer', mockStore))
                .rejects.toThrow('QuickBooks query timed out after 15 seconds');
        });

        it('should handle non-ok response', async () => {
            vi.mocked(mockStore.get).mockResolvedValue(null);
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
            });

            await expect(runQuickBooksQuery(validAuth, 'Customer', mockStore))
                .rejects.toThrow('QuickBooks query failed with status 500 (response body omitted)');
        });

        it('should handle Fault response', async () => {
            vi.mocked(mockStore.get).mockResolvedValue(null);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ Fault: { Error: [] } })
            });

            await expect(runQuickBooksQuery(validAuth, 'Customer', mockStore))
                .rejects.toThrow('QuickBooks query returned a fault response (fault details omitted)');
        });
    });
});
