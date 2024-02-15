/*jshint node:true */
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

const { HttpsProxyAgent } = require("https-proxy-agent")
const axios = require('axios');
const util = require('util'); 
const qs = require('qs');
var jwt = require('jsonwebtoken');

// base client lib with interceptors for requests to add logging.
class IMSJWTTokenExchange {
    constructor(host, proxy) {
        if ( host === undefined ) {
            throw new Error("Client lib must have a target host defined, imsHost or jilHost");
        }
        this.host = host
        if (proxy) {
            var httpsAgent = new HttpsProxyAgent({host: proxy.host, port: proxy.port});
            this.request = axios.create({
                baseURL: `https://${this.host}`,
                timeout: 10000,
                httpsAgent
            });
        } else {
            this.request = axios.create({
                baseURL: `https://${this.host}`,
                timeout: 10000
            });
        }


        this.request.interceptors.request.use(function (config) {
            console.debug(`>> ${config.method} ${config.url}`);
            if ( config.verbose ) {
                console.debug(JSON.stringify(config,null,2)); 
            }
            // Do something before request is sent
            return config;
          }, function (error) {
            console.error(`Failed making request ${error.message}`);
            // Do something with request error
            return Promise.reject(error);
          });

        this.request.interceptors.response.use(function (response) {
            // Do something with response data
            console.debug(`<< ${response.config.method} ${response.config.url} ${response.status}`);
            if ( response.config.verbose ) {
                console.debug(util.inspect(response.data)); 
            }
            return response;
          }, function (error) {
            // Do something with response error
            if ( error.config ) {
                console.error(`Error performing operation ${error.message} request ${error.config.url}`);
            } else {
                console.error(`Error performing operation ${error.message} request (no config)`);
            }
            if ( error.response ) {
                console.error(util.inspect(error.response.data));
            }
            return Promise.reject(error);
          });
    }

    checkRequired(options, key) {
        if ( options[key] === undefined ) {
            throw new Error(`${key} is a required option.`);
        }
    }

    /** 
    * @description Exchanges a integrtion for an access token using JWTToken exchange with IMS.
    * @returns {
    *    access_token,
    *    token_type,
    *    expires_in
    *  }
    *
    *  @param {
    *   issuer - the issuer. It must be present, and it must be in the format: org_ident@AdobeOrg/ 
    *       It represents the identity of the organization which issued the token, and it must be for 
    *       an organization that has provided IMS with a valid certificate. 
    *   subject - the subject. It must be present and must be in the format: user_ident@user_auth_src. 
    *       It represents the ident and authsrc of the technical account for which a certificate 
    *       has been uploaded to IMS
    *   expiration_time_seconds - the expiration time. IMS allows a time skew of 30 seconds between 
    *       the time specified and the IMS server time.
    *      
    *   metascope[]
    *       metascopes requested as a subset of the scopes available to the technical account.
    *   client_id
    *       The IMS client ID for the technical account, assigned on registration. The client must have the exchange_jwt scope.
    *   client_secret
    *       The IMS client secret for the technical account, assigned on registration. 
    *   privateKey
    *       The private key associated with the certificate bound to the technical account.
    * } options
    */
   async exchangeJwt(options) {
        this.checkRequired(options, "issuer");
        this.checkRequired(options, "subject");
        this.checkRequired(options, "expiration_time_seconds");
        this.checkRequired(options, "metascope");
        this.checkRequired(options, "client_id");
        this.checkRequired(options, "client_secret");
        this.checkRequired(options, "privateKey");
        var jwt_payload = {
            iss: options.issuer,
            sub: options.subject,
            exp: options.expiration_time_seconds,
            aud: `https://${this.host}/c/${options.client_id}`
        }

        options.metascope.map((v) => {
            jwt_payload[`https://${this.host}/s/${v}`] = true;
        });

        // sign with RSA256.
        var jwt_token = jwt.sign(jwt_payload, options.privateKey, { algorithm: 'RS256'});

        if ( options.publicKey ) {
            console.debug(jwt.verify(jwt_token, options.publicKey,{ complete: true}));
        }


        var body = qs.stringify({
                client_id: options.client_id,
                client_secret: options.client_secret,
                jwt_token: jwt_token    
            });
        var config = {
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            verbose: options.verbose
        };
        var response = await this.request.post(`/ims/exchange/jwt`,body, config);
        if ( response.status === 200) {
            return response.data;
        }
        throw Error("Failed to exchange jwt.")

    }

}
var assertPresent = (config, path, missing) => {
    const pathElements = path.split(".");
    var c = config;
    for(var p of pathElements) {
        if ( !c[p] ) {
            missing.push(path);
            return;
        }
        c = c[p];
    }
}


module.exports = async (integrationConfig) => {
        var jwtExchange = undefined;
        if (integrationConfig.proxy) {
            jwtExchange = new IMSJWTTokenExchange(integrationConfig.integration.imsEndpoint, integrationConfig.proxy);
        } else {
            jwtExchange = new IMSJWTTokenExchange(integrationConfig.integration.imsEndpoint);
        }
        
        var missing = [];
        assertPresent(integrationConfig, "integration.org", missing);
        assertPresent(integrationConfig, "integration.id", missing);
        assertPresent(integrationConfig, "integration.technicalAccount.clientId", missing);
        assertPresent(integrationConfig, "integration.technicalAccount.clientSecret", missing);
        assertPresent(integrationConfig, "integration.metascopes", missing);
        assertPresent(integrationConfig, "integration.privateKey", missing);
        assertPresent(integrationConfig, "integration.publicKey", missing);
        if ( missing.length > 0 ) {
            throw new Error("The following configuration elements are missing ",missing.join(","));
        }

		return await jwtExchange.exchangeJwt({
				issuer: `${integrationConfig.integration.org}`,
				subject: `${integrationConfig.integration.id}`, 
				expiration_time_seconds: Math.floor((Date.now()/1000)+3600*8),
				metascope: integrationConfig.integration.metascopes.split(","),
				client_id: integrationConfig.integration.technicalAccount.clientId,
				client_secret: integrationConfig.integration.technicalAccount.clientSecret,
				privateKey: integrationConfig.integration.privateKey,
				publicKey: integrationConfig.integration.publicKey
			});
};


