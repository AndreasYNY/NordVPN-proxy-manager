import Docker from 'dockerode';

const docker = new Docker();
const MAX_CONTAINERS = 20;
const BASE_PORT = 8881;
const IMAGE = 'mogzol/nordvpn-tinyproxy:latest';

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

export async function createVPNContainer(index: number, server: string, username: string, password: string): Promise<ContainerInfo> {
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
            RestartPolicy: { Name: 'unless-stopped' },
            Dns: ['1.1.1.1']
        },
        Env: [
            `USERNAME=${username}`,
            `PASSWORD=${password}`,
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

export async function rotateContainers(servers: string[], username: string, password: string): Promise<ContainerInfo[]> {
    console.log('Rotating containers...');
    await cleanupExistingContainers();

    const activeContainers: ContainerInfo[] = [];
    const count = Math.min(servers.length, MAX_CONTAINERS);

    for (let i = 0; i < count; i++) {
        const server = servers[i];
        if (!server) continue;
        console.log(`Starting container ${i + 1}/${count} with server ${server}`);
        const info = await createVPNContainer(i, server, username, password);
        activeContainers.push(info);
    }

    return activeContainers;
}

export async function ensureAllContainersRunning(servers: string[], username: string, password: string): Promise<ContainerInfo[]> {
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
                const info = await createVPNContainer(i, server, username, password);
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
