const Redis = require('ioredis');
const { LRUCache } = require('lru-cache');
const { logError, logInfo, logWarning, logDebug } = require('./logger');
const redisConfig = require('./config/redis');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const path = require('path');

let redis = null;
let isConnected = false;

class CacheManager {
    constructor() {
        // Initialize in-memory LRU cache as fallback
        this.memoryCache = new LRUCache({
            max: 5000, // Maximum number of items
            maxSize: 50 * 1024 * 1024, // 50MB max size
            sizeCalculation: (value) => JSON.stringify(value).length,
            ttl: 1000 * 60 * 60 * 24, // 24 hour TTL
        });

        this.useRedis = true;
        this.redisConnected = false;
        this.reconnectTimer = null;

        // Enhanced Redis initialization
        this.initRedis();
        
        // Monitor memory usage
        setInterval(() => {
            this.checkMemoryUsage();
        }, 300000); // Every 5 minutes
    }

    async checkWindowsRedisService() {
        try {
            if (process.platform === 'linux') {
                // Check if Redis is running in WSL
                const { stdout } = await execAsync('service redis-server status');
                if (!stdout.includes('active (running)')) {
                    logWarning('Redis not running in WSL. Starting Redis...');
                    try {
                        await execAsync('sudo service redis-server start');
                        logInfo('Redis started in WSL');
                        return true;
                    } catch (startError) {
                        logError(`Failed to start Redis in WSL: ${startError.message}`);
                        logInfo('Try: sudo service redis-server start');
                        return false;
                    }
                }
                return true;
            }
            if (process.platform === 'win32') {
                try {
                    // First check if Redis is installed
                    const redisPath = 'C:\\Program Files\\Redis\\redis-server.exe';
                    if (!require('fs').existsSync(redisPath)) {
                        logError('Redis is not installed. Please install using: choco install redis-64');
                        return false;
                    }

                    // Check service status
                    const { stdout } = await execAsync('sc query Redis');
                    if (stdout.includes('RUNNING')) {
                        logInfo('Redis Windows service is running');
                        return true;
                    } else {
                        logWarning('Redis Windows service is not running');
                        try {
                            // Try to install service if not installed
                            if (!stdout.includes('SERVICE_NAME')) {
                                logInfo('Installing Redis service...');
                                await execAsync(`"${redisPath}" --service-install`);
                                logInfo('Redis service installed');
                            }
                            
                            // Start the service
                            await execAsync('net start Redis');
                            logInfo('Started Redis Windows service');
                            return true;
                        } catch (startError) {
                            logError(`Failed to start Redis service: ${startError.message}`);
                            logInfo('Please ensure Redis is installed via: choco install redis-64');
                            return false;
                        }
                    }
                } catch (error) {
                    logWarning('Redis service check failed. Please install Redis: choco install redis-64');
                    return false;
                }
            }
            return true; // Not on Windows
        } catch (error) {
            logWarning(`Redis service check failed: ${error.message}`);
            return false;
        }
    }

    async initRedis() {
        try {
            redis = this.createRedisClient();
            
            // Test the connection
            await redis.ping();
            
            this.redisConnected = true;
            this.useRedis = true;
            logInfo('Redis connection established');
            
        } catch (error) {
            this.handleRedisFailure(error);
        }
    }

    createRedisClient() {
        try {
            const client = new Redis({
                host: '127.0.0.1',
                port: 6379,
                retryStrategy: function(times) {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                maxRetriesPerRequest: 3,
                connectTimeout: 5000,
            });

            client.on('error', (error) => {
                logError('Redis connection error:', error);
                this.handleRedisFailure(error);
            });

            client.on('connect', () => {
                logInfo('Connected to Redis');
                this.redisConnected = true;
                this.useRedis = true;
            });

            return client;
        } catch (error) {
            logError('Failed to create Redis client:', error);
            return null;
        }
    }

    handleRedisFailure(error) {
        if (this.useRedis) {
            this.useRedis = false;
            logWarning(`Redis unavailable: ${error.message}`);
            logInfo('Falling back to in-memory cache');
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (!this.reconnectTimer) {
            // Try to reconnect every 30 seconds
            this.reconnectTimer = setInterval(() => {
                if (!this.redisConnected) {
                    logInfo('Attempting to reconnect to Redis...');
                    this.initRedis();
                }
            }, 30000);
        }
    }

    async get(key) {
        try {
            if (this.useRedis && this.redisConnected) {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            } else {
                return this.memoryCache.get(key);
            }
        } catch (error) {
            logError(`Cache get error: ${error.message}`);
            // Fallback to memory cache on Redis error
            return this.memoryCache.get(key);
        }
    }

    async set(key, value, ttl = 3600) {
        try {
            // Always set in memory cache as backup
            this.memoryCache.set(key, value, { ttl: ttl * 1000 });
            
            if (this.useRedis && this.redisConnected) {
                await redis.set(key, JSON.stringify(value), 'EX', ttl);
            }
        } catch (error) {
            logError(`Cache set error: ${error.message}`);
            // Error already handled by setting to memory cache
        }
    }

    async mget(keys) {
        try {
            if (this.useRedis && this.redisConnected) {
                const values = await redis.mget(keys);
                return values.map(v => v ? JSON.parse(v) : null);
            } else {
                return keys.map(key => this.memoryCache.get(key));
            }
        } catch (error) {
            logError(`Cache mget error: ${error.message}`);
            return keys.map(key => this.memoryCache.get(key));
        }
    }

    async mset(entries, ttl = 3600) {
        try {
            // Always set in memory cache first
            entries.forEach(([key, value]) => {
                this.memoryCache.set(key, value, { ttl: ttl * 1000 });
            });

            if (this.useRedis && this.redisConnected) {
                const pipeline = redis.pipeline();
                entries.forEach(([key, value]) => {
                    pipeline.set(key, JSON.stringify(value), 'EX', ttl);
                });
                await pipeline.exec();
            }
        } catch (error) {
            logError(`Cache mset error: ${error.message}`);
            // Error already handled by setting to memory cache
        }
    }

    async checkMemoryUsage() {
        try {
            if (this.redisConnected) {
                const info = await redis.info('memory');
                const usedMemory = parseInt(info.used_memory_human);
                const maxMemory = parseInt(info.maxmemory_human);
                
                if (usedMemory > maxMemory * 0.9) {
                    logWarning(`Redis memory usage high: ${usedMemory}/${maxMemory}`);
                }
            }
            
            // Check memory cache size
            const memStats = this.memoryCache.stats();
            logDebug(`Memory cache: ${memStats.size} items, ${(memStats.length/1024/1024).toFixed(2)}MB`);
            
        } catch (error) {
            logError(`Failed to check memory usage: ${error.message}`);
        }
    }

    getCacheStats() {
        return {
            type: this.useRedis && this.redisConnected ? 'redis' : 'memory',
            size: this.memoryCache.size,
            maxSize: this.memoryCache.maxSize,
            redisAvailable: this.redisConnected
        };
    }
}

module.exports = new CacheManager();
