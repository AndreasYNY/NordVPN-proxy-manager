export async function getAsiaServers() {
    const asiaCountryIds = [195, 108, 97, 212, 238, 114, 211, 100, 131, 101];
    const url = `https://api.nordvpn.com/v1/servers/recommendations?filters[country_id]=${asiaCountryIds.join(',')}&limit=100`;

    try {
        const response = await fetch(url);
        const data = await response.json() as { hostname: string }[];
        return data.map((s: any) => s.hostname);
    } catch (error) {
        console.error('Error fetching NordVPN servers:', error);
        return [];
    }
}
