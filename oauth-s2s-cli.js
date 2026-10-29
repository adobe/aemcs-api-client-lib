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

// Example CLI for OAuth Server-to-Server authentication, not an npm-distributed tool.
const fs = require('node:fs');
const requestAccessToken = require('./oauth-s2s');

if (process.argv.length !== 3) {
    console.error('Usage: node oauth-s2s-cli.js <jsonfile>');
    process.exit(2);
}

async function main() {
    const contents = fs.readFileSync(process.argv[2], 'utf8');
    let config;
    try {
        config = JSON.parse(contents);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('Credentials file must contain valid JSON');
        }
        throw error;
    }
    const token = await requestAccessToken(config);
    console.log(JSON.stringify(token, null, 2));
}

main().catch((error) => {
    console.error(`Failed to request access token: ${error.message}`);
    process.exitCode = 1;
});
