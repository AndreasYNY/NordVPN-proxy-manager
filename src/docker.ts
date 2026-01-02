import Docker from 'dockerode';

const docker = new Docker();
export const MAX_CONTAINERS = 5;
const BASE_PORT = 8881;
const IMAGE = 'mogzol/nordvpn-tinyproxy:latest';

const NORD_USERNAME = process.env.NORD_USERNAME || '';
const NORD_PASSWORD = process.env.NORD_PASSWORD || '';

if (!NORD_USERNAME || !NORD_PASSWORD) {
    console.error('NORD_USERNAME and NORD_PASSWORD must be set in environment variables.');
    process.exit(1);
}

export interface ContainerInfo {
    id: string;
    name: string;
    port: number;
    server: string;
}

export async function cleanupExistingContainers() {
    const containers = await docker.listContainers({ all: true });
    for (const containerInfo of containers) {
        if (containerInfo.Names.some(name => name.startsWith('/nord-vpn-'))) {
            try {
                const container = docker.getContainer(containerInfo.Id);
                if (containerInfo.State === 'running' || containerInfo.State === 'restarting') {
                    await container.stop().catch(() => { });
                }
                await container.remove({ force: true }).catch(() => { });
            } catch (error) {
                console.error(`Failed to cleanup container ${containerInfo.Id}:`, error);
            }
        }
    }
}

export async function createVPNContainer(index: number, server: string): Promise<ContainerInfo> {
    const name = `nord-vpn-${index}`;
    const port = BASE_PORT + index;

    const container = await docker.createContainer({
        Image: IMAGE,
        name: name,
        HostConfig: {
            CapAdd: ['NET_ADMIN'],
            Devices: [{ PathOnHost: '/dev/net/tun', PathInContainer: '/dev/net/tun', CgroupPermissions: 'rwm' }],
            PortBindings: {
                '8888/tcp': [{ HostPort: port.toString() }]
            },
            RestartPolicy: { Name: 'no' },
            Dns: ['1.1.1.1']
        },
        Env: [
            `USERNAME=${NORD_USERNAME}`,
            `PASSWORD=${NORD_PASSWORD}`,
            `SERVER=${server}`
        ]
    });

    await container.start();

    return {
        id: container.id,
        name,
        port,
        server
    };
}

export async function rotateContainers(servers: string[]): Promise<ContainerInfo[]> {
    console.log('Rotating containers...');
    await cleanupExistingContainers();

    const activeContainers: ContainerInfo[] = [];
    const count = Math.min(servers.length, MAX_CONTAINERS);

    for (let i = 0; i < count; i++) {
        const server = servers[i];
        if (!server) continue;
        console.log(`Starting container ${i + 1}/${count} with server ${server}`);
        const info = await createVPNContainer(i, server);
        activeContainers.push(info);
    }

    return activeContainers;
}

export async function ensureAllContainersRunning(servers: string[]): Promise<ContainerInfo[]> {
    const containers = await docker.listContainers({ all: true });
    const existingIndices = new Set<number>();

    for (const c of containers) {
        const name = c.Names.find(n => n.startsWith('/nord-vpn-'));
        if (name) {
            const index = parseInt(name.replace('/nord-vpn-', ''));
            if (!isNaN(index)) {
                existingIndices.add(index);
                if (c.State !== 'running' && c.State !== 'restarting') {
                    try {
                        console.log(`Starting stopped container ${name}...`);
                        await docker.getContainer(c.Id).start();
                    } catch (e) {
                        console.error(`Failed to start container ${name}:`, e);
                    }
                }
            }
        }
    }

    const newContainers: ContainerInfo[] = [];
    const count = Math.min(servers.length, MAX_CONTAINERS);

    for (let i = 0; i < count; i++) {
        if (!existingIndices.has(i)) {
            const server = servers[i];
            if (!server) continue;
            console.log(`Starting missing container ${i + 1}/${count} with server ${server}`);
            try {
                const info = await createVPNContainer(i, server);
                newContainers.push(info);
            } catch (e) {
                console.error(`Failed to create container nord-vpn-${i}:`, e);
            }
        }
    }

    return newContainers;
}

export async function getRunningVPNCount(): Promise<number> {
    const containers = await docker.listContainers();
    return containers.filter(c => c.Names.some(name => name.startsWith('/nord-vpn-'))).length;
}
