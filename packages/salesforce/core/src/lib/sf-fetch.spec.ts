import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sfFetch, SalesforceAuthError, checkSalesforceLimits } from './sf-fetch.js';
import type { TriggerStore } from '@soopa/piece-framework';

describe('sf-fetch', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn();
        global.fetch = mockFetch as any;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('sfFetch', () => {
        it('should return response if ok', async () => {
            const mockResponse = { ok: true, status: 200, json: async () => ({}) };
            mockFetch.mockResolvedValueOnce(mockResponse);

            const response = await sfFetch('https://api.salesforce.com', {});
            expect(response).toBe(mockResponse);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should throw SalesforceAuthError on 401', async () => {
            const mockResponse = { ok: false, status: 401, text: async () => 'Session Expired' };
            mockFetch.mockResolvedValueOnce(mockResponse);

            await expect(sfFetch('https://api.salesforce.com', {}))
                .rejects.toThrow(SalesforceAuthError);
            
            expect(mockFetch).toHaveBeenCalledTimes(1); // No retries for 401
        });

        it('should retry on 429 and eventually succeed', async () => {
            const errorResponse = { ok: false, status: 429, headers: new Headers({ 'Retry-After': '1' }) };
            const successResponse = { ok: true, status: 200 };

            mockFetch
                .mockResolvedValueOnce(errorResponse)
                .mockResolvedValueOnce(successResponse);

            const fetchPromise = sfFetch('https://api.salesforce.com', {}, 3);
            
            // Advance timers to trigger retry
            await vi.advanceTimersByTimeAsync(1000);
            
            const response = await fetchPromise;
            
            expect(response).toBe(successResponse);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should retry on network error and eventually succeed', async () => {
            const successResponse = { ok: true, status: 200 };

            mockFetch
                .mockRejectedValueOnce(new TypeError('fetch failed'))
                .mockResolvedValueOnce(successResponse);

            const fetchPromise = sfFetch('https://api.salesforce.com', {}, 3);
            
            await vi.advanceTimersByTimeAsync(1000); // attempt 1 delay
            
            const response = await fetchPromise;
            
            expect(response).toBe(successResponse);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should throw after max retries exhausted', async () => {
            const errorResponse = { ok: false, status: 503, text: async () => 'Service Unavailable' };
            
            mockFetch.mockResolvedValue(errorResponse);

            const fetchPromise = sfFetch('https://api.salesforce.com', {}, 3);
            
            let caughtError: Error | undefined;
            fetchPromise.catch(e => { caughtError = e; });

            await vi.advanceTimersByTimeAsync(1000); // retry 1
            await vi.advanceTimersByTimeAsync(2000); // retry 2
            await vi.advanceTimersByTimeAsync(4000); // retry 3
            
            // Allow event loop to process rejection
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            
            expect(caughtError).toBeDefined();
            expect(caughtError?.message).toContain('Salesforce API error (503)');
            expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
        });
    });

    describe('checkSalesforceLimits', () => {
        let mockStore: TriggerStore;

        beforeEach(() => {
            mockStore = {
                get: vi.fn().mockResolvedValue(null),
                put: vi.fn().mockResolvedValue(undefined),
                delete: vi.fn().mockResolvedValue(undefined),
            };
        });

        it('should return cached limits if within poll interval', async () => {
            const cachedLimits = { remaining: 100, total: 1000 };
            mockStore.get = vi.fn().mockResolvedValue({
                timestamp: Date.now() - 1000,
                limits: cachedLimits
            });

            const result = await checkSalesforceLimits(
                { instance_url: 'https://test.com', access_token: 'token' },
                mockStore
            );

            expect(result).toEqual(cachedLimits);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should fetch limits from API and cache them', async () => {
            const apiResponse = {
                ok: true,
                status: 200,
                json: async () => ({
                    DailyApiRequests: { Max: 5000, Remaining: 4500 }
                })
            };
            mockFetch.mockResolvedValueOnce(apiResponse);

            const result = await checkSalesforceLimits(
                { instance_url: 'https://test.com', access_token: 'token' },
                mockStore
            );

            expect(result).toEqual({ total: 5000, remaining: 4500 });
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockStore.put).toHaveBeenCalledWith(
                'sf_limits_https://test.com',
                expect.objectContaining({ limits: { total: 5000, remaining: 4500 } })
            );
        });

        it('should cache 0 limits if rate limit exceeded exception', async () => {
            // We use status 403 so sfFetch doesn't retry
            const errorResponse = {
                ok: false,
                status: 403,
                text: async () => '[{"errorCode": "REQUEST_LIMIT_EXCEEDED"}]'
            };
            
            mockFetch.mockResolvedValueOnce(errorResponse); 

            const result = await checkSalesforceLimits(
                { instance_url: 'https://test.com', access_token: 'token' },
                mockStore
            );

            expect(result).toEqual({ total: 1, remaining: 0 });
            expect(mockStore.put).toHaveBeenCalledWith(
                'sf_limits_https://test.com',
                expect.objectContaining({ limits: { total: 1, remaining: 0 } })
            );
        });
        
        it('should rethrow other errors', async () => {
            const errorResponse = {
                ok: false,
                status: 400,
                text: async () => 'Bad request'
            };
            
            mockFetch.mockResolvedValueOnce(errorResponse);

            await expect(checkSalesforceLimits(
                { instance_url: 'https://test.com', access_token: 'token' },
                mockStore
            )).rejects.toThrow('Salesforce API error (400)');
        });
    });
});
