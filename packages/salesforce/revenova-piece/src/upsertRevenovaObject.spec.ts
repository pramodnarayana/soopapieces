import { describe, it, expect } from 'vitest';
import { upsertRevenovaObject } from './upsertRevenovaObject.js';

describe('upsertRevenovaObject', () => {
    it('should return null for non-object payloads', () => {
        expect(upsertRevenovaObject(null)).toBeNull();
        expect(upsertRevenovaObject('string')).toBeNull();
        expect(upsertRevenovaObject(123)).toBeNull();
    });

    it('should extract from Salesforce envelope correctly', () => {
        const payload = {
            notification: {
                sobject: {
                    '$': { 'xsi:type': 'sf:Account' },
                    'sf:Id': '001xx000003DGsWAAW',
                    'sf:Name': 'Test Account',
                }
            }
        };

        const result = upsertRevenovaObject(payload);

        expect(result).toEqual({
            entityType: 'sf_Account',
            entityId: '001xx000003DGsWAAW',
            data: {
                name: 'Test Account',
            }
        });
    });

    it('should return null for malformed envelopes (missing sobject)', () => {
        const payload = { notification: {} };
        expect(upsertRevenovaObject(payload)).toBeNull();
    });

    it('should extract rtms__ prefix correctly', () => {
        const payload = {
            notification: {
                sobject: {
                    '$': { 'xsi:type': 'sf:rtms__Carrier__c' },
                    'sf:Id': 'a01xx000003DGsWAAW',
                    'sf:rtms__Status__c': 'Active',
                }
            }
        };

        const result = upsertRevenovaObject(payload);

        expect(result).toEqual({
            entityType: 'rtms__Carrier__c',
            entityId: 'a01xx000003DGsWAAW',
            data: {
                'rtms__status__c': 'Active',
            }
        });
    });

    it('should parse raw XML string payload', () => {
        const xml = `
            <soapenv:Envelope>
                <soapenv:Body>
                    <notifications>
                        <Notification>
                            <sObject xsi:type="sf:Account">
                                <sf:Id>xml_id_123</sf:Id>
                                <sf:Name>XML Account</sf:Name>
                            </sObject>
                        </Notification>
                    </notifications>
                </soapenv:Body>
            </soapenv:Envelope>
        `;

        const payload = { raw: xml, contentType: 'text/xml' };
        
        const result = upsertRevenovaObject(payload);
        
        expect(result).toEqual({
            entityType: 'sf_Account',
            entityId: 'xml_id_123',
            data: {
                name: 'XML Account'
            }
        });
    });

    it('should decode XML entities in raw XML payload', () => {
        const xml = `
            <Notification>
                <sObject xsi:type="sf:Account">
                    <sf:Id>id_with_entities</sf:Id>
                    <sf:Name>Me &amp; You &lt;3</sf:Name>
                </sObject>
            </Notification>
        `;

        const payload = { raw: xml, contentType: 'text/xml' };
        
        const result = upsertRevenovaObject(payload);
        
        expect(result?.data.name).toBe('Me & You <3');
    });

    it('should return null if no ID is found', () => {
        const payload = {
            notification: {
                sobject: {
                    '$': { 'xsi:type': 'sf:Account' },
                    'sf:Name': 'Test Account',
                }
            }
        };

        expect(upsertRevenovaObject(payload)).toBeNull();
    });

    it('should return null for multi-notification XML payloads', () => {
        const xml = `
            <Notification><sObject xsi:type="sf:Account"><sf:Id>1</sf:Id></sObject></Notification>
            <Notification><sObject xsi:type="sf:Account"><sf:Id>2</sf:Id></sObject></Notification>
        `;

        const payload = { raw: xml, contentType: 'text/xml' };
        expect(upsertRevenovaObject(payload)).toBeNull();
    });
});
