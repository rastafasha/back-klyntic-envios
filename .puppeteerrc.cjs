const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Descarga Chrome dentro de la carpeta del proyecto en Render
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};