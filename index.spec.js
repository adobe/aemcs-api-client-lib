const fs = require('fs');
const assert = require('node:assert');
const exchange = require('./index');

(async () => {
    const jsonfile = 'downloaded_integration.json';
    const config = JSON.parse(fs.readFileSync(jsonfile, 'utf8'));
    const data = await exchange(config);
    assert.ok(data, 'expected data to be defined');
    console.log('ok - no proxy');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
