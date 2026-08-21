const path = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // 🎯 CORRECCIÓN: path.resolve garantiza que la ruta sea absoluta desde la raíz del servidor
  cacheDirectory: path.resolve(__dirname, '.cache', 'puppeteer'),
};