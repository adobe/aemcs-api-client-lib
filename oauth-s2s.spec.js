"use strict";

const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const requestAccessToken = require('./oauth-s2s');
const exchangeJwt = require('./index');

function credentials() {
    return {
        integration: {
            imsEndpoint: 'ims-na1.adobelogin.com',
            technicalAccount: {
                clientId: 'example-client+id',
                clientSecret: 'example-secret+&= not-a-real-secret'
            },
            scopes: ['read_pc.dma_aem_ams', 'openid']
        }
    };
}

function fullCredentials() {
    return {
        ok: true,
        integration: {
            ...credentials().integration,
            imsEndpoint: 'ims-na1-stg1.adobelogin.com',
            scopes: [
                'read_pc.dma_aem_ams',
                'openid',
                'AdobeID',
                'read_organizations',
                'additional_info.projectedProductContext'
            ],
            email: 'example-account@techacct.adobe.com',
            id: 'example-account-id@techacct.adobe.com',
            org: 'example-org@AdobeOrg',
            secretId: 'example-secret-id',
            revoked: false
        },
        statusCode: 200
    };
}

const token = {
    access_token: 'fake-access-token',
    token_type: 'bearer',
    expires_in: 86399
};

test('requests an OAuth token with form-encoded credentials and comma-separated scopes', async (t) => {
    const config = credentials();
    const original = structuredClone(config);
    const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://ims-na1.adobelogin.com/ims/token/v3');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['content-type'], 'application/x-www-form-urlencoded');
        assert.equal(options.redirect, 'error');
        assert.ok(options.signal instanceof AbortSignal);
        assert.deepEqual(Object.fromEntries(new URLSearchParams(options.body)), {
            grant_type: 'client_credentials',
            client_id: config.integration.technicalAccount.clientId,
            client_secret: config.integration.technicalAccount.clientSecret,
            scope: 'read_pc.dma_aem_ams,openid'
        });
        assert.match(options.body.toString(), /client_secret=example-secret%2B%26%3D/);
        return Response.json(token);
    });
    assert.deepEqual(await requestAccessToken(config), token);
    assert.equal(mock.mock.callCount(), 1);
    assert.deepEqual(config, original);
});

test('uses the configured stage IMS hostname and supports a single scope', async (t) => {
    const config = credentials();
    config.integration.imsEndpoint = 'ims-na1-stg1.adobelogin.com';
    config.integration.scopes = ['openid'];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://ims-na1-stg1.adobelogin.com/ims/token/v3');
        assert.equal(options.body.get('scope'), 'openid');
        return Response.json(token);
    });
    assert.deepEqual(await requestAccessToken(config), token);
});

test('accepts the full S2S credential response object without reshaping or mutation', async (t) => {
    const config = fullCredentials();
    const original = structuredClone(config);
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://ims-na1-stg1.adobelogin.com/ims/token/v3');
        assert.deepEqual(Object.fromEntries(options.body), {
            grant_type: 'client_credentials',
            client_id: config.integration.technicalAccount.clientId,
            client_secret: config.integration.technicalAccount.clientSecret,
            scope: config.integration.scopes.join(',')
        });
        return Response.json(token);
    });
    assert.deepEqual(await requestAccessToken(config), token);
    assert.deepEqual(config, original);
});

for (const field of ['imsEndpoint', 'clientId', 'clientSecret']) {
    for (const value of [undefined, '', ' ', 123]) {
        test(`rejects invalid ${field}: ${JSON.stringify(value)}`, async (t) => {
            const config = credentials();
            const parent = field === 'imsEndpoint' ? config.integration : config.integration.technicalAccount;
            parent[field] = value;
            const mock = t.mock.method(globalThis, 'fetch', () => {
                throw new Error('Must not contact IMS for invalid credentials');
            });
            await assert.rejects(requestAccessToken(config), (error) => {
                assert.match(error.message, /missing or invalid/);
                assert.ok(error.message.includes(field));
                assert.ok(!error.message.includes('example-secret'));
                return true;
            });
            assert.equal(mock.mock.callCount(), 0);
        });
    }
}

for (const config of [undefined, null, {}, { integration: null }, { integration: {} }]) {
    test(`rejects incomplete configuration: ${JSON.stringify(config)}`, async (t) => {
        const mock = t.mock.method(globalThis, 'fetch', () => {
            throw new Error('Must not contact IMS for incomplete credentials');
        });
        await assert.rejects(requestAccessToken(config), /configuration elements are missing or invalid/);
        assert.equal(mock.mock.callCount(), 0);
    });
}

for (const endpoint of ['https://ims-na1.adobelogin.com', 'example.com', 'ims-na1.adobelogin.com/other', 'user@ims-na1.adobelogin.com']) {
    test(`rejects an invalid IMS hostname: ${endpoint}`, async (t) => {
        const config = credentials();
        config.integration.imsEndpoint = endpoint;
        const mock = t.mock.method(globalThis, 'fetch', () => {
            throw new Error('Must not contact an invalid host');
        });
        await assert.rejects(requestAccessToken(config), /must be an IMS hostname/);
        assert.equal(mock.mock.callCount(), 0);
    });
}

for (const scopes of [undefined, [], '', 'openid', [null], [123], [''], [' ']]) {
    test(`rejects invalid OAuth scopes: ${JSON.stringify(scopes)}`, async (t) => {
        const config = credentials();
        config.integration.scopes = scopes;
        config.integration.metascopes = 'ent_aem_cloud_api';
        const mock = t.mock.method(globalThis, 'fetch', () => {
            throw new Error('Must not contact IMS for invalid scopes');
        });
        await assert.rejects(requestAccessToken(config), /non-empty array of OAuth scope strings/);
        assert.equal(mock.mock.callCount(), 0);
    });
}

for (const status of [400, 401, 429, 500]) {
    test(`reports HTTP ${status} without exposing the IMS response body`, async (t) => {
        const config = credentials();
        t.mock.method(globalThis, 'fetch', async () =>
            Response.json({ error_description: config.integration.technicalAccount.clientSecret }, { status })
        );
        await assert.rejects(requestAccessToken(config), {
            message: `IMS token request failed: HTTP ${status}`
        });
    });
}

for (const response of [{}, null, { access_token: '' }, { access_token: 123 }]) {
    test(`rejects a success response without an access token: ${JSON.stringify(response)}`, async (t) => {
        t.mock.method(globalThis, 'fetch', async () => Response.json(response));
        await assert.rejects(requestAccessToken(credentials()), /did not contain an access_token/);
    });
}

test('propagates network failures without treating them as token responses', async (t) => {
    const failure = new Error('Network unavailable');
    t.mock.method(globalThis, 'fetch', async () => { throw failure; });
    await assert.rejects(requestAccessToken(credentials()), (error) => error === failure);
});

test('rejects malformed IMS JSON', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('not JSON'));
    await assert.rejects(requestAccessToken(credentials()), {
        message: 'IMS token response was not valid JSON'
    });
});

test('preserves the legacy JWT exchange and signing behavior', async (t) => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const config = {
        integration: {
            ...credentials().integration,
            org: 'example-org',
            id: 'example-technical-account',
            metascopes: 'ent_aem_cloud_api',
            privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' })
        }
    };
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://ims-na1.adobelogin.com/ims/exchange/jwt');
        assert.equal(options.method, 'POST');
        const form = new URLSearchParams(options.body);
        assert.equal(form.get('client_id'), config.integration.technicalAccount.clientId);
        assert.equal(form.get('client_secret'), config.integration.technicalAccount.clientSecret);
        const [header, payload, signature] = form.get('jwt_token').split('.');
        const claims = JSON.parse(Buffer.from(payload, 'base64url'));
        assert.equal(claims.iss, config.integration.org);
        assert.equal(claims.sub, config.integration.id);
        assert.equal(claims.aud, `https://ims-na1.adobelogin.com/c/${form.get('client_id')}`);
        assert.equal(claims['https://ims-na1.adobelogin.com/s/ent_aem_cloud_api'], true);
        assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${payload}`),
            publicKey, Buffer.from(signature, 'base64url')));
        return Response.json(token);
    });
    assert.deepEqual(await exchangeJwt(config), token);
});

function runCli(t, contents, { args, status = 200 } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aemcs-oauth-test-'));
    const jsonfile = path.join(directory, 'credentials.json');
    const preload = path.join(directory, 'fetch.cjs');
    fs.writeFileSync(jsonfile, contents);
    fs.writeFileSync(preload, `globalThis.fetch = async () =>
        new Response(${JSON.stringify(JSON.stringify(token))}, { status: ${status} });`);
    t.after(() => {
        fs.unlinkSync(jsonfile);
        fs.unlinkSync(preload);
        fs.rmdirSync(directory);
    });
    return spawnSync(process.execPath, ['--require', preload, 'oauth-s2s-cli.js', ...(args || [jsonfile])], {
        cwd: __dirname,
        encoding: 'utf8'
    });
}

test('CLI prints the token response and exits successfully', (t) => {
    const result = runCli(t, JSON.stringify(credentials()));
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), token);
});

test('CLI accepts the full S2S credential response JSON', (t) => {
    const result = runCli(t, JSON.stringify(fullCredentials()));
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), token);
});

test('CLI reports usage with exit code 2 when no file is supplied', (t) => {
    const result = runCli(t, '', { args: [] });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage: node oauth-s2s-cli.js <jsonfile>/);
    assert.equal(result.stdout, '');
});

test('CLI rejects malformed credential JSON without echoing its contents', (t) => {
    const result = runCli(t, '{"clientSecret": "not-a-real-secret" INVALID}');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Credentials file must contain valid JSON/);
    assert.ok(!result.stderr.includes('not-a-real-secret'));
    assert.equal(result.stdout, '');
});

test('CLI reports IMS failures on stderr and returns a nonzero exit code', (t) => {
    const result = runCli(t, JSON.stringify(credentials()), { status: 401 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /IMS token request failed: HTTP 401/);
    assert.equal(result.stdout, '');
});
