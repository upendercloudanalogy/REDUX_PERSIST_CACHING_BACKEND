import { createClient } from 'redis';

const client = createClient({
    username: 'default',
    password: 'tcUWGeZWpBZopi9ji11pYTBXC8mQXbz3',
    socket: {
        host: 'redis-15285.c330.asia-south1-1.gce.redns.redis-cloud.com',
        port: 15285
    }
});

client.on('error', err => console.log('Redis Client Error', err));

await client.connect();

export default client;
