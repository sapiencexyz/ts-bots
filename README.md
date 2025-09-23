# TS-Bots Monorepo

A TypeScript monorepo for building multiple bots with shared utilities and services.

## Structure

```
ts-bots/
├── packages/
│   ├── shared/          # Shared utilities, GraphQL client, config
│   └── loom/           # Loom bot
├── package.json        # Root package with workspace configuration
├── tsconfig.json       # Root TypeScript configuration
└── README.md          # This file
```

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build all packages:

   ```bash
   npm run build
   ```

3. Run the loom bot in development:
   ```bash
   MODE=openai npm run loom
   ```

## Environment Setup

1. Copy the example environment file:

   ```bash
   cp env.example .env
   ```

2. Update the `.env` file with your API configuration.

Required for OpenAI mode:

- RPC_URL, PRIVATE_KEY, CHAIN_ID
- SAPIENCE_API
- OPENAI_API_KEY
- OPENAI_MODE_INTERVAL (optional, default 60)

## Available Scripts

- `npm run build` - Build all packages
- `npm run dev` - Start development mode for all packages
- `npm run lint` - Lint all packages
- `npm run format` - Format code with Prettier
- `npm run type-check` - Type check all packages

## Shared Package

The `@ts-bots/shared` package provides:

- **GraphQL Client**: Easy-to-use GraphQL service
- **API Client**: Axios-based REST API client
- **Configuration**: Environment-based configuration management
- **Utilities**: Common utilities like retry logic, logging, and delays

## Deployment (Railway)

Set environment variables in Railway project:

- MODE=openai
- RPC_URL, PRIVATE_KEY, CHAIN_ID
- SAPIENCE_API
- OPENAI_API_KEY
- OPENAI_MODE_INTERVAL (optional, default 60)
- CONCENTRATION_RANGE, DEVIATION_THRESHOLD, DEFAULT_COLLATERAL_AMOUNT (as desired)

Build command:

```bash
npm ci && npm run build
```

Start command:

```bash
MODE=openai node packages/loom/dist/index.js
```

At startup, the app prints a configuration summary for the selected mode.

## Adding New Bots

1. Create a new directory in `packages/`
2. Copy the structure from `packages/loom/`
3. Update the package name in `package.json`
4. Import and use utilities from `@ts-bots/shared`
