import Redis from 'ioredis';

// Initializing the client automatically starts the connection
const redis = new Redis({
  host: '127.0.0.1', 
  port: 6379,      
  maxRetriesPerRequest: null, 
});

redis.on('error', (err) => console.log('Redis Client Error', err));
export default redis;
