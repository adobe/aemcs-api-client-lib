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


const fs = require('fs');
const process = require('process');
const program = require('commander');
const exchange = require("./index.js");

program
	.version('0.0.1')
	.description("AEM-CS API Client Exchange CLI");


program
    .command("exchange <jsonfile>")
	.description("Performs a JWT Exchange using the integration from the AEM-CS devel console instance")
	.action(function(jsonfile) {
			var config = JSON.parse(fs.readFileSync(jsonfile, 'utf8'));
			exchange(config).then(accessToken => {
				console.log(JSON.stringify(accessToken,null,2));
				process.exit(0);
			}).catch(e => {
				console.log("Failed to exchange for access token ",e);
				process.exit(1);
			});
	});

program.parse(process.argv);
