"use strict";

/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const crypto = require('node:crypto');

const b64url = (input) => Buffer.from(input).toString('base64url');

function signJwtRS256(payload, privateKey) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
    return `${signingInput}.${b64url(signature)}`;
}

async function exchangeJwt(host, { client_id, client_secret, jwt_token }) {
    const url = `https://${host}/ims/exchange/jwt`;
    const body = new URLSearchParams({ client_id, client_secret, jwt_token });
    console.debug(`>> post /ims/exchange/jwt`);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body
    });
    console.debug(`<< post /ims/exchange/jwt ${response.status}`);
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to exchange jwt: ${response.status} ${text}`);
    }
    return response.json();
}

function assertPresent(config, path, missing) {
    let c = config;
    for (const p of path.split('.')) {
        if (!c[p]) {
            missing.push(path);
            return;
        }
        c = c[p];
    }
}

module.exports = async (integrationConfig) => {
    const missing = [];
    assertPresent(integrationConfig, 'integration.imsEndpoint', missing);
    assertPresent(integrationConfig, 'integration.org', missing);
    assertPresent(integrationConfig, 'integration.id', missing);
    assertPresent(integrationConfig, 'integration.technicalAccount.clientId', missing);
    assertPresent(integrationConfig, 'integration.technicalAccount.clientSecret', missing);
    assertPresent(integrationConfig, 'integration.metascopes', missing);
    assertPresent(integrationConfig, 'integration.privateKey', missing);
    if (missing.length > 0) {
        throw new Error(`The following configuration elements are missing: ${missing.join(',')}`);
    }

    const { integration } = integrationConfig;
    const host = integration.imsEndpoint;
    const client_id = integration.technicalAccount.clientId;
    const client_secret = integration.technicalAccount.clientSecret;

    const jwt_payload = {
        iss: integration.org,
        sub: integration.id,
        exp: Math.floor(Date.now() / 1000) + 3600 * 8,
        aud: `https://${host}/c/${client_id}`
    };
    for (const scope of integration.metascopes.split(',')) {
        jwt_payload[`https://${host}/s/${scope}`] = true;
    }

    const jwt_token = signJwtRS256(jwt_payload, integration.privateKey);

    return exchangeJwt(host, { client_id, client_secret, jwt_token });
};
