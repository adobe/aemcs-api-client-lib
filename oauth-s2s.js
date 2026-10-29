"use strict";

/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

// OAuth Server-to-Server example code, not a client library for publication to npm.
module.exports = async (integrationConfig) => {
    const integration = integrationConfig?.integration;
    const fields = {
        'integration.imsEndpoint': integration?.imsEndpoint,
        'integration.technicalAccount.clientId': integration?.technicalAccount?.clientId,
        'integration.technicalAccount.clientSecret': integration?.technicalAccount?.clientSecret
    };
    const missing = Object.entries(fields)
        .filter(([, value]) => typeof value !== 'string' || !value.trim())
        .map(([path]) => path);
    if (missing.length > 0) {
        throw new Error(`The following configuration elements are missing or invalid: ${missing.join(',')}`);
    }
    if (!/^ims-[a-z0-9-]+\.adobelogin\.com$/.test(integration.imsEndpoint)) {
        throw new Error('integration.imsEndpoint must be an IMS hostname such as ims-na1.adobelogin.com');
    }
    if (!Array.isArray(integration.scopes) || integration.scopes.length === 0 ||
        integration.scopes.some((scope) => typeof scope !== 'string' || !scope.trim())) {
        throw new Error('integration.scopes must be a non-empty array of OAuth scope strings');
    }

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: integration.technicalAccount.clientId,
        client_secret: integration.technicalAccount.clientSecret,
        scope: integration.scopes.join(',')
    });
    const response = await fetch(`https://${integration.imsEndpoint}/ims/token/v3`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
        throw new Error(`IMS token request failed: HTTP ${response.status}`);
    }
    let token;
    try {
        token = await response.json();
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('IMS token response was not valid JSON');
        }
        throw error;
    }
    if (typeof token?.access_token !== 'string' || !token.access_token.trim()) {
        throw new Error('IMS token response did not contain an access_token');
    }
    return token;
};
