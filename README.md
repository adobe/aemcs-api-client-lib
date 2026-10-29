# AEM-CS API Authentication Examples

This repository contains minimal Node.js examples for authenticating server-side applications with Adobe Identity Management Services (IMS) and calling AEM as a Cloud Service APIs.

**This is example code, not a supported client library, and is not intended for publication to npm.** Copy and adapt the examples as a starting point for your own application.

**OAuth Server-to-Server is the recommended authentication method.** It uses the OAuth `client_credentials` grant, without a JWT, private key, or certificate. The original JWT README and examples are preserved in [README-jwt-legacy.md](README-jwt-legacy.md). JWT authentication is deprecated in favor of OAuth Server-to-Server.

## Requirements

- Node.js 18 or newer. The example uses built-in `fetch` and requires no dependencies.
- OAuth Server-to-Server credentials from an AEM Developer Console that supports this credential type. The AEM Developer Console is distinct from Adobe Developer Console.
- The technical account must have the product profiles and AEM permissions required by the API you want to call. Obtaining a token does not itself grant access to AEM content.

## Save the credentials

In the AEM Developer Console, create an **OAuth Server-to-Server (S2S)** technical account. The console shows the client secret only once, in the **Save your client secret** dialog that follows creation, and does not store it. Select **Download credentials** in that dialog to save the credentials as `aem-s2s-credentials.json`. **View** on a client secret later shows the credentials without the secret value, so it cannot be used to obtain a token. If the secret is lost, create a new secret for the account.

Use the actual `technicalAccount.clientSecret` value, not the secret ID shown in the account's secret list. Use the `imsEndpoint` and `scopes` from your credentials; JWT `metascopes` are not OAuth scopes.

The helper and CLI expect the credentials inside a top-level `integration` object. The downloaded file contains the credentials without this wrapper, so wrap its content:

```sh
jq '{integration: .}' aem-s2s-credentials.json > downloaded_integration.json
```

Alternatively, edit the file so that its complete content becomes the value of a top-level `integration` field. The result looks like this:

```json
{
  "integration": {
    "imsEndpoint": "ims-na1.adobelogin.com",
    "scopes": [
      "read_pc.dma_aem_ams",
      "openid",
      "AdobeID",
      "read_organizations",
      "additional_info.projectedProductContext"
    ],
    "technicalAccount": {
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret"
    },
    "email": "your-technical-account@techacct.adobe.com",
    "id": "your-technical-account-id@techacct.adobe.com",
    "org": "your-org-id@AdobeOrg"
  }
}
```

These are placeholders. Copy the values and scopes from your own credentials rather than using this example unchanged. Keep the supplied `imsEndpoint`, including `ims-na1-stg1.adobelogin.com` for stage credentials. The helper uses only `integration.imsEndpoint`, `integration.technicalAccount.clientId`, `integration.technicalAccount.clientSecret`, and `integration.scopes`; other fields are accepted but are not sent to IMS.

Keep the file private and do not commit it. `downloaded_integration.json` is ignored by Git in this repository. In a deployed application, load credentials from a secret manager or another access-controlled store instead of storing them in source code.

## Request an access token

Pass the parsed JSON object directly to `requestAccessToken(credentials)`, just as the legacy example passes its object to `exchange(config)`. The object can come from a local JSON file or any other source that provides the wrapped credentials; the helper does not require a filename. See [Call an AEM API](#call-an-aem-api) for programmatic usage.

From a checkout of this repository:

```sh
node oauth-s2s-cli.js downloaded_integration.json
```

The CLI reads the file and prints the IMS token response:

```json
{
  "access_token": "REDACTED",
  "token_type": "bearer",
  "expires_in": 86399
}
```

**The CLI output contains a sensitive access token.** Do not send it to shared logs or publish it.

The request in [oauth-s2s.js](oauth-s2s.js) is a form-encoded POST to `https://<imsEndpoint>/ims/token/v3` with:

| Parameter | Value |
| --- | --- |
| `grant_type` | `client_credentials` |
| `client_id` | `integration.technicalAccount.clientId` |
| `client_secret` | `integration.technicalAccount.clientSecret` |
| `scope` | The comma-separated values of `integration.scopes` |

The example rejects redirects and limits each token request to 30 seconds. Failed IMS requests produce an HTTP-status error without printing the response body or credentials.

## Call an AEM API

Import the OAuth example explicitly as `require('./oauth-s2s')`. The existing `index.js` export and `cli.js exchange` command remain the legacy JWT examples.

```javascript
const fs = require('node:fs');
const requestAccessToken = require('./oauth-s2s');

async function main() {
    const credentials = JSON.parse(
        fs.readFileSync('downloaded_integration.json', 'utf8')
    );
    const { access_token } = await requestAccessToken(credentials);

    // Replace this URL with your environment and an API the account can access.
    const response = await fetch(
        'https://author-p123-e456.adobeaemcloud.com/content/dam.json',
        { headers: { Authorization: `Bearer ${access_token}` } }
    );
    if (!response.ok) {
        throw new Error(`AEM API request failed: HTTP ${response.status}`);
    }
    console.log(await response.json());
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
```

For a long-running application, cache and reuse access tokens until shortly before they expire. IMS reports `expires_in` in seconds. OAuth Server-to-Server does not issue a refresh token; request another access token with the same client credentials when needed. This minimal example does not implement a token cache or automatic retries.

## Rotate a client secret

Create a replacement secret in the AEM Developer Console and save its credentials from the dialog that shows the new secret; the console shows it only once. Replace `technicalAccount.clientSecret` in the credentials every application using the account loads with the new value, then request a fresh token and verify AEM access with the replacement secret before revoking the old secret. Revoking a secret in the AEM Developer Console requires that secret's value.

The authentication code does not change: it uses the selected `technicalAccount.clientSecret`. Revocation can take time to propagate and does not necessarily invalidate already-issued access tokens. Follow the console's secret-management guidance when verifying revocation.

## Tests

Run the offline OAuth and JWT compatibility tests without real credentials or network calls:

```sh
npm run test:oauth
```

The original `npm test` command is preserved. It performs a live JWT exchange using your local `downloaded_integration.json`; its setup is documented in [the legacy README](README-jwt-legacy.md#how-to-test).

## Legacy JWT examples

See [README-jwt-legacy.md](README-jwt-legacy.md) for the original instructions and examples. `index.js`, `cli.js`, and `index.spec.js` are unchanged.

## Contributing

Contributions are welcomed! Read the [Contributing Guide](.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
