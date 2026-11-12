# Ballot

Ballot is a simple election app for universities, clubs, departments, and other groups. Organizers set up an election and manage the voter list. Voters confirm who they are and cast their vote. Results are tracked and certified in one place.

![Ballot home page](docs/screenshots/home.png)

## Why Ballot?

Running a small election by email or spreadsheet is messy. Ballot keeps everything in one app. It also keeps voter identities separate from the ballots, so a vote can't be traced back to the person who cast it.

## Features

- Create elections, set schedules, and choose voting rules
- Add candidates and ballot options
- Import and manage voter lists
- Verify voters with a one-time code before they vote
- Let voters preview their ballot before casting it
- Track turnout while voting is open
- View results, certify outcomes, and browse past elections
- Keep an audit log of what happened and when
- Create and restore database backups from the admin console

## Built with

- React 19 and TypeScript
- Vite
- Tailwind CSS
- Recharts for charts
- SQLite for storage
- Vitest and Testing Library for tests

## Getting started

You'll need Node.js 22.12 or later and npm.

1. Install the dependencies:

   ```bash
   npm ci
   ```

2. Start the app:

   ```bash
   npm run dev
   ```

3. Open [http://127.0.0.1:8443](http://127.0.0.1:8443).

The first time you run it, Ballot creates a database in the `data/` folder and loads some sample elections.

> The dev command shows voter verification codes on screen so you can try the full voting flow. Use it for testing only, never for a real election. To hide the codes, run `npm run dev:secure`.

## Admin console

Go to [http://127.0.0.1:8443/#/admin](http://127.0.0.1:8443/#/admin) and sign in with the demo account:

- **Username:** `leo.marchetti`
- **Password:** `Ballot-Demo-2026`

![Ballot admin console](docs/screenshots/admin.png)

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with visible verification codes |
| `npm run dev:secure` | Start the app without visible codes |
| `npm run build` | Build the app for production |
| `npm start` | Serve the production build locally |
| `npm test` | Run the tests |
| `npm run typecheck` | Check the TypeScript types |
| `npm run demo:reset` | Reset the sample data |
| `npm run verify` | Run type checks, tests, and a build |

## Project layout

- `src/voter/` – the voting experience
- `src/admin/` – the admin console
- `src/server/` – the API, database, and security code
- `src/lib/` – shared helpers and types
- `scripts/` – small helper scripts

## License

Ballot is released under the [MIT License](LICENSE).
