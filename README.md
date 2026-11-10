# WP Health Checker

Full-stack dashboard to monitor a WordPress site and run plugin and core updates safely, built with React, TypeScript, Node.js and a custom WordPress plugin.

<!-- Add a screenshot of the dashboard here (with test data only, no real client info):
![Dashboard](docs/screenshot.png) -->

## Features

- **WordPress core**: installed version, available update (minor or major), one-click update.
- **Plugins**: full list with version, available updates for free and premium plugins, one-click update.
- **Site Health**: WordPress's built-in checks, with the number of critical and recommended issues and which tests failed.
- **Performance**: server response time of the home page, measured every hour.
- **Backups**: date of the latest Duplicator backup, with a warning when it's too old.
- **Login-protected dashboard**: WordPress credentials never reach the browser.

### Safety checks on updates

Updating a client site can break it, so every update is guarded:

- **Before**: the confirmation shows the date of the last backup, in red when it's older than 7 days or missing. For WordPress core, the PHP and MySQL requirements of the new version are checked before anything is downloaded. Only one update runs at a time.
- **After**: the installed version must be the expected one (the upgrader's return value is never trusted alone), and the server checks that the site still answers: the home page for a plugin, the home page and `/wp-json/` (both HTTP 200) for WordPress core. For core, it also verifies that the database upgrade ran and that no `.maintenance` file was left.
- **On failure**: the real error is shown, with a link to do the update from WP Admin instead.

## Architecture

```
Browser (React)  ──▶  Node.js server (credentials, login)  ──▶  WordPress REST API
                                                          ──▶  WP Health Checker Connector (custom plugin)
```

| Part | Folder | Stack |
|---|---|---|
| Frontend | `src/` | React, TypeScript, Vite, Tailwind CSS |
| Backend | `server/` | Node.js, TypeScript, Hono |
| Connector plugin | `wordpress-connector/` | PHP (WordPress plugin) |

The standard WordPress REST API doesn't expose update information, Site Health results or the WordPress version. The connector plugin adds read-only routes under `/wp-json/health-checker/v1/` for this data, plus update routes restricted to administrators (`update_plugins` and `update_core` capabilities). It reuses WordPress's own update data (the `update_plugins` and `update_core` transients, rebuilt when missing), runs the Site Health tests itself because WordPress only stores their counts, measures the response time in WP-Cron, and reads Duplicator's backup table.

## Getting started

### Requirements

- Node.js 22.19 or later
- A WordPress site (developed with [Local](https://localwp.com/)) with an administrator account

### 1. Install the connector plugin

Copy the `wordpress-connector/` folder into the site's `wp-content/plugins/` (or zip it and upload it from **Plugins → Add New → Upload Plugin**), then activate **WP Health Checker Connector**.

### 2. Create an application password

In WP Admin: **Users → Profile → Application Passwords**. Use a dedicated administrator account for the dashboard, so its access can be revoked independently.

### 3. Configure the server

```bash
cp server/.env.example server/.env
npm install
npm run hash-password     # generates ADMIN_PASSWORD_HASH
openssl rand -base64 32   # generates SESSION_SECRET
```

| Variable | Description |
|---|---|
| `WP_URL` | WordPress site URL |
| `WP_USER` | WordPress username |
| `WP_APP_PASSWORD` | Application password |
| `WP_CA_CERT` | Optional: path to a self-signed certificate (Local sites) |
| `ADMIN_USER` | Dashboard login |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the dashboard password (keep the single quotes) |
| `SESSION_SECRET` | Random secret used to sign the session cookie (at least 32 characters) |
| `PORT` | Optional: server port, `3001` by default (the Vite proxy expects 3001) |

### 4. Run

```bash
npm run dev:all
```

Then open http://localhost:5173.

## Lessons learned

Real problems met while testing on a local site, and how the tool now handles them:

- **A plugin update broke activation**: the new version required PHP 8.3 on a PHP 8.1 server. The dashboard now checks requirements before offering an update.
- **A failed update reported as a success**: the upgrader returned no error although nothing was installed. The connector now verifies the installed version after every update.
- **All updates disappeared after one update**: WordPress deletes the update cache after an update. The connector now rebuilds it, and "unknown" is never shown as "up to date".
- **A loopback deadlock**: measuring response time from inside WordPress blocked the server when the dashboard sent parallel requests to a site with only 2 PHP workers. The measurement now runs every hour in WP-Cron, never during a dashboard request.

## Roadmap

- Multiple sites, with encrypted credentials in a database
- Performance score with Google PageSpeed Insights (production sites)
- Known vulnerabilities with the Wordfence Intelligence feed
- Deployment

