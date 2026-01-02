import { Elysia } from 'elysia';
import { getAsiaServers } from './nordvpn';
import { rotateContainers, cleanupExistingContainers, getRunningVPNCount, ensureAllContainersRunning, MAX_CONTAINERS, type ContainerInfo } from './docker';
import swagger from '@elysiajs/swagger';

const PORT = process.env.PORT || 3000;
let activeContainers: ContainerInfo[] = [];
let isRotating = false;

async function performRotation() {
    if (isRotating) return;
    isRotating = true;
    try {
        const servers = await getAsiaServers();
        if (servers.length === 0) {
            console.error('No Asia servers found. Skipping rotation.');
            return;
        }
        // Shuffle servers to get different ones each time
        const shuffled = servers.sort(() => 0.5 - Math.random());
        activeContainers = await rotateContainers(shuffled);
        console.log(`Rotation complete. ${activeContainers.length} containers running.`);
    } catch (error) {
        console.error('Rotation failed:', error);
    } finally {
        isRotating = false;
    }
}

// Initial rotation
performRotation();

// Rotate every 10 minutes
setInterval(performRotation, 10 * 60 * 1000);

// Check every 5 seconds if servers.length is indeed MAX_CONTAINERS
const monitorInterval = setInterval(async () => {
    if (isRotating) return;
    const count = await getRunningVPNCount();
    console.log(`[Monitor] Current servers count: ${count}`);
    if (count !== MAX_CONTAINERS) {
        console.warn(`[Alert] Expected ${MAX_CONTAINERS} servers, but found ${count}! Starting missing containers...`);
        isRotating = true;
        try {
            const servers = await getAsiaServers();
            const shuffled = servers.sort(() => 0.5 - Math.random());
            const newContainers = await ensureAllContainersRunning(shuffled);
            // Update activeContainers with new ones if needed, 
            // though activeContainers is mostly used for the /ports endpoint.
            // For simplicity, we can just refresh the whole list from docker if we wanted to be precise.
            console.log(`[Monitor] Started ${newContainers.length} missing containers.`);
        } catch (error) {
            console.error('[Monitor] Failed to start missing containers:', error);
        } finally {
            isRotating = false;
        }
    }
}, 5000);

const app = new Elysia()
    .use(swagger())
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
        clearInterval(monitorInterval);
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
