# NodeJS client library


To use 

    /*jshint node:true */
    "use strict";

    const fs = require('fs');
    const exchange = require("./index.js");

    const jsonfile = "downloaded_integration.json";

    var config = JSON.parse(fs.readFileSync(jsonfile, 'utf8'));
    exchange(config).then(accessToken => {
        console.log(JSON.stringify(accessToken,null,2));
    }).catch(e => {
        console.log("Failed to exchange for access token ",e);
    });


Or use the CLI


    node cli.js exchange downloaded_integration.json

output

    >> post /ims/exchange/jwt
    << post /ims/exchange/jwt 200
    {
    "token_type": "bearer",
    "access_token": "eyJ4-REDACTED-F4MAA",
    "expires_in": 86399999
    }


