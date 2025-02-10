const { LRUCache } = require('lru-cache'); // Changed: Destructure LRUCache from the import

const options = {
    // Maximum number of items to store in cache
    max: 500,
    
    // How long to live in milliseconds (24 hours)
    ttl: 1000 * 60 * 60 * 24,
    
    // Return stale items before removing them
    allowStale: true,
    
    // Update TTL when accessed
    updateAgeOnGet: true,
    
    // Maximum cache size in bytes (50MB)
    maxSize: 50 * 1024 * 1024,

    // Add size calculation method
    sizeCalculation: (value) => {
        return JSON.stringify(value).length
    }
};

// Create new instance with options
const metadataCache = new LRUCache(options);

module.exports = metadataCache;
