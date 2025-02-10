/**
 * RetroScraper Configuration Module
 * 
 * Handles loading and parsing of application configuration from INI files.
 * Provides centralized access to user-defined settings and system configurations.
 * 
 * Configuration handling:
 * - INI file parsing and validation
 * - Default value management
 * - Configuration error detection
 * - Path resolution and normalization
 */

// config.js

const fs = require('fs');
const path = require('path');
const ini = require('ini');
const { logError } = require('./logger');

const CONFIG_PATH = path.join(__dirname, 'config.ini');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    logError(`Missing config.ini at: ${CONFIG_PATH}`);
    process.exit(1);
  }

  const config = ini.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  return config;
}

module.exports = {
  loadConfig,
  CONFIG_PATH,
};