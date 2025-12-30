import { Elysia } from 'elysia';
import { getAsiaServers } from './nordvpn';
import { rotateContainers, cleanupExistingContainers, type ContainerInfo } from './docker';

const PORT = process.env.PORT || 3000;
const NORD_USERNAME = process.env.NORD_USERNAME || '';
const NORD_PASSWORD = process.env.NORD_PASSWORD || '';

if (!NORD_USERNAME || !NORD_PASSWORD) {
    console.error('NORD_USERNAME and NORD_PASSWORD must be set in environment variables.');
    process.exit(1);
}

let activeContainers: ContainerInfo[] = [];

async function performRotation() {
    try {
        const servers = await getAsiaServers();
        if (servers.length === 0) {
            console.error('No Asia servers found. Skipping rotation.');
            return;
        }
        // Shuffle servers to get different ones each time
        const shuffled = servers.sort(() => 0.5 - Math.random());
        // The following line was malformed in the instruction, assuming the intent was to use rotateContainers
        // or if createVPNContainer was meant to be used, it would be part of a loop or different logic.
        // Sticking to the original logic but ensuring the import is correct if createVPNContainer is needed elsewhere.
        activeContainers = await rotateContainers(shuffled, NORD_USERNAME, NORD_PASSWORD);
        console.log(`Rotation complete. ${activeContainers.length} containers running.`);
    } catch (error) {
        console.error('Rotation failed:', error);
    }
}

// Initial rotation
performRotation();

// Rotate every 10 minutes
setInterval(performRotation, 10 * 60 * 1000);

const app = new Elysia()
    .get('/', () => ({ status: 'ok', message: 'VPN Manager is running' }))
    .get('/ports', () => {
        return activeContainers.map(c => c.port);
    })
    .get('/test-servers', async () => {
        const servers = await getAsiaServers();
        return {
            count: servers.length,
            servers: servers
        };
    })
    .on("stop", async () => {
        console.log('\nShutting down... Cleaning up containers.');
        await cleanupExistingContainers();
        return
    })
    .listen(PORT);

async function shutdown() {
    console.log('\nShutting down... Cleaning up containers.');
    await cleanupExistingContainers();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
