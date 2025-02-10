const fs = require('fs');
const path = require('path');
const { logWarning } = require('../logger');

// Simple default config that matches the Windows Redis default setup
const defaultConfig = {
    Redis: {
        Host: '127.0.0.1',  // Use explicit IP instead of 'localhost'
        Port: 6379,
        Password: '',
        DB: 0,
        ConnectTimeout: 5000,
        RetryStrategy: (times) => Math.min(times * 50, 2000)
    }
};

// Load custom config if exists
let config = defaultConfig;
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        const loadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config = { ...defaultConfig, ...loadedConfig };
    }
} catch (error) {
    logWarning('Failed to load config.json, using default Redis configuration');
}

// Export simplified Redis configuration
module.exports = {
    host: '127.0.0.1',  // Use explicit IP
    port: 6379,
    password: process.env.REDIS_PASSWORD || config.Redis.Password,
    db: config.Redis.DB,
    connectTimeout: 5000,
    maxRetriesPerRequest: 3,
    retryStrategy: function(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    enableReadyCheck: true,
    connectionName: 'RetroScraper'
};
