import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quickbooks } from './index.js';

describe('quickbooks piece', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn();
        global.fetch = mockFetch as any;
    });

    describe('executeAction', () => {
        const credentials = {
            realmId: '12345',
            access_token: 'token123',
            vendorParams: { environment: 'test' }
        };

        it('should execute simple post successfully', async () => {
            const successResponse = {
                Customer: { Id: 'cus_1', DisplayName: 'John' }
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => successResponse
            });

            const result = await quickbooks.executeAction!('Customer', { DisplayName: 'John', _internalTag: 'ignore' }, credentials);

            expect(result.statusCode).toBe(200);
            expect(result.body).toEqual(successResponse);
            expect(result.entityId).toBe('cus_1');
            
            // Check that it stripped internal fields
            const call = mockFetch.mock.calls[0];
            const fetchBody = JSON.parse(call[1].body);
            expect(fetchBody).toEqual({ DisplayName: 'John' }); // _internalTag stripped
        });

        it('should handle SyncToken stale error and retry automatically', async () => {
            const staleErrorBody = {
                Fault: {
                    Error: [{ code: '5010', Message: 'Stale Object Error' }]
                }
            };
            
            const freshEntityBody = {
                Customer: { Id: 'cus_1', SyncToken: '2' }
            };

            const successResponse = {
                Customer: { Id: 'cus_1', SyncToken: '3', DisplayName: 'Jane' }
            };

            // 1st POST - Stale Error
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => staleErrorBody
            });

            // GET latest - returns new SyncToken
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => freshEntityBody
            });

            // 2nd POST - Success
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => successResponse
            });

            const result = await quickbooks.executeAction!('Customer', { Id: 'cus_1', DisplayName: 'Jane', SyncToken: '1' }, credentials);

            expect(mockFetch).toHaveBeenCalledTimes(3);
            
            const retryPostCall = mockFetch.mock.calls[2];
            const retryBody = JSON.parse(retryPostCall[1].body);
            expect(retryBody).toEqual({ Id: 'cus_1', DisplayName: 'Jane', SyncToken: '2' }); // Used fresh token

            expect(result.statusCode).toBe(200);
            expect(result.body).toEqual(successResponse);
        });

        it('should handle timeout correctly', async () => {
            mockFetch.mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError'));

            await expect(quickbooks.executeAction!('Customer', { DisplayName: 'John' }, credentials))
                .rejects.toThrow('QuickBooks API request timed out after 15s executing Customer');
        });
    });

    describe('describe methods', () => {
        it('should return describeObjects', async () => {
            const objects = await quickbooks.describeObjects!({});
            expect(objects.length).toBeGreaterThan(0);
            expect(objects.find(o => o.name === 'Customer')).toBeDefined();
        });

        it('should handle payload without operation', () => {
            const result = quickbooks.events?.parseAndReply!({ payload: { body: {} } });
            expect(result).toBeUndefined();
        });
    });

    describe('discovery methods', () => {
        it('should return describeObjects from constants', async () => {
            const objects = await quickbooks.describeObjects!({});
            expect(objects.length).toBeGreaterThan(0);
            expect(objects[0].name).toBe('Customer');
        });

        it('should return describeFields from constants', async () => {
            const fields = await quickbooks.describeFields!({}, 'Customer');
            expect(fields.length).toBeGreaterThan(0);
            expect(fields[0].name).toBe('Id');

            const missingFields = await quickbooks.describeFields!({}, 'NonExistentObject');
            expect(missingFields).toEqual([]);
        });

        it('should return describeRelatedObjects from constants', async () => {
            const related = await quickbooks.describeRelatedObjects!({}, 'Invoice');
            expect(related).toEqual([
                { objectName: 'Customer', relationshipType: '1:1', relationField: 'CustomerRef.value' }
            ]);

            const missingRelated = await quickbooks.describeRelatedObjects!({}, 'NonExistentObject');
            expect(missingRelated).toEqual([]);
        });

        it('should return normalize as null', async () => {
            expect(await quickbooks.normalize!('Customer', {})).toBeNull();
        });
    });
});
