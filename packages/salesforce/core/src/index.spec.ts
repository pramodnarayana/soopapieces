import { describe, it, expect, vi, beforeEach } from 'vitest';
import { salesforce } from './index.js';

describe('salesforce piece', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn();
        global.fetch = mockFetch as any;
    });

    const credentials = {
        instance_url: 'https://test.salesforce.com',
        access_token: 'test_token',
    };

    describe('executeAction', () => {
        it('should execute POST request correctly', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 201,
                json: async () => ({ id: '001_test' }),
            });

            const result = await salesforce.executeAction!('Account', { Name: 'Test' }, credentials);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch.mock.calls[0][0]).toBe('https://test.salesforce.com/services/data/v59.0/sobjects/Account');
            expect(mockFetch.mock.calls[0][1].method).toBe('POST');
            expect(mockFetch.mock.calls[0][1].body).toBe(JSON.stringify({ Name: 'Test' }));
            
            expect(result).toEqual({ statusCode: 201, body: { id: '001_test' } });
        });

        it('should handle timeout error', async () => {
            const timeoutError = new Error('Timeout');
            timeoutError.name = 'TimeoutError';
            
            mockFetch.mockRejectedValueOnce(timeoutError);

            await expect(salesforce.executeAction!('Account', {}, credentials))
                .rejects.toThrow('Salesforce API request timed out after 15s executing Account');
        });
    });

    describe('executeFetch', () => {
        it('should fetch record successfully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ Id: '123', Name: 'Test' }),
            });

            const result = await salesforce.executeFetch!('Account', '123', credentials);

            expect(result).toEqual({ Id: '123', Name: 'Test' });
        });

        it('should return null on 404', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                text: async () => 'Not Found',
            });

            const result = await salesforce.executeFetch!('Account', '123', credentials);

            expect(result).toBeNull();
        });
    });

    describe('discovery methods', () => {
        it('should return describeObjects', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    sobjects: [
                        { name: 'Account', label: 'Account', queryable: true },
                        { name: 'InternalObj', label: 'Internal', queryable: false },
                        { name: 'Custom__c', label: 'Custom', queryable: false }
                    ]
                })
            });

            const objects = await salesforce.describeObjects!(credentials);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(objects).toEqual([
                { name: 'Custom__c', label: 'Custom', queryable: false }, // custom objects preserved
                { name: 'Account', label: 'Account', queryable: true }
            ]);
        });

        it('should return describeFields', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    fields: [
                        { name: 'Id', label: 'Record Id', type: 'id', filterable: true, sortable: true, nillable: false },
                        { name: 'OwnerId', label: 'Owner', type: 'reference', filterable: true, sortable: true, nillable: true, referenceTo: ['User'] }
                    ]
                })
            });

            const fields = await salesforce.describeFields!(credentials, 'Account');

            expect(fields).toEqual([
                { name: 'Id', label: 'Record Id', type: 'id', filterable: true, sortable: true, nillable: false },
                { name: 'OwnerId', label: 'Owner', type: 'reference', filterable: true, sortable: true, nillable: true, referenceTo: ['User'] }
            ]);
        });

        it('should return describeRelatedObjects', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    childRelationships: [
                        { childSObject: 'Contact', field: 'AccountId', relationshipName: 'Contacts' }
                    ],
                    fields: [
                        { type: 'reference', referenceTo: ['User'], name: 'OwnerId', label: 'Owner ID' },
                        { type: 'string', name: 'Name', label: 'Account Name' }
                    ]
                })
            });

            const related = await salesforce.describeRelatedObjects!(credentials, 'Account');

            expect(related).toEqual([
                { objectName: 'Contact', relationField: 'AccountId', relationshipType: '1:N' },
                { objectName: 'User', relationField: 'OwnerId', relationLabel: 'Owner ID', relationshipType: '1:1' }
            ]);
        });
    });
});
