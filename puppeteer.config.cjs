const path = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: path.resolve(__dirname, '.cache', 'puppeteer'),
};