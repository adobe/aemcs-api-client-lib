const fs = require("fs")
const exchange = require('./index')
describe('Testing lib', () => {
    test('use proxy', () => {
        const jsonfile = "downloaded_integration.json";
        var config = JSON.parse(fs.readFileSync(jsonfile, 'utf8'));
        config.proxy = {
            host: "127.0.0.1",
            port: 8888
        }
        return exchange(config).then((data) => {
            expect(data).toBeDefined()
        })
    });
})
