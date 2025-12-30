# NordVPN Auto Proxy Manager

This is a simple proxy manager that leverages NordVPN and docker to rotate proxies every 10 minutes.

This is meant to be used within the same network as the application that uses the proxy (so there is no authentication).

## Installation

To install dependencies:

```bash
bun install
```

To build & run:

```bash
bun run build
.output/server
```

### Side note: this was created in 5 minutes using gemini

### Might add more docker support later if i could figure out how to manage host container within inside a container
