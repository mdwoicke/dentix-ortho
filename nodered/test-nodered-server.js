/**
 * Simple HTTP server to serve test pages and proxy requests to Node Red
 * This avoids CORS issues when testing from the browser
 *
 * Usage: node test-nodered-server.js
 * Then open: http://localhost:3333
 *
 * Available test pages:
 *   /                  - Index with links to all test pages
 *   /endpoints         - Node Red endpoint tests (original)
 *   /patient           - Flowise Patient Tool tests (7 actions)
 *   /scheduling        - Flowise Scheduling Tool tests (4 actions)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3333;
const NODE_RED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io';

// Map of routes to HTML files
const PAGE_ROUTES = {
    '/': 'index',
    '/index.html': 'index',
    '/endpoints': 'test-nodered-endpoints.html',
    '/endpoints.html': 'test-nodered-endpoints.html',
    '/patient': 'test-patient-tool.html',
    '/patient.html': 'test-patient-tool.html',
    '/scheduling': 'test-scheduling-tool.html',
    '/scheduling.html': 'test-scheduling-tool.html'
};

// Generate index page HTML
function getIndexPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Node Red & Flowise Tool Testers</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; padding: 40px; min-height: 100vh; }
        h1 { color: #00d4ff; margin-bottom: 10px; font-size: 28px; }
        .subtitle { color: #888; margin-bottom: 40px; }
        .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; max-width: 1000px; }
        .card { background: #16213e; border-radius: 12px; padding: 25px; border: 1px solid #333; transition: transform 0.2s, border-color 0.2s; cursor: pointer; text-decoration: none; color: inherit; }
        .card:hover { transform: translateY(-4px); border-color: #00d4ff; }
        .card h2 { font-size: 18px; margin-bottom: 10px; }
        .card p { color: #888; font-size: 14px; line-height: 1.5; }
        .card .badge { display: inline-block; background: #333; padding: 4px 10px; border-radius: 4px; font-size: 12px; margin-top: 15px; color: #aaa; }
        .card.patient { border-left: 4px solid #00d4ff; }
        .card.patient h2 { color: #00d4ff; }
        .card.scheduling { border-left: 4px solid #9b59b6; }
        .card.scheduling h2 { color: #9b59b6; }
        .card.endpoints { border-left: 4px solid #27ae60; }
        .card.endpoints h2 { color: #27ae60; }
        .footer { margin-top: 40px; color: #555; font-size: 12px; }
    </style>
</head>
<body>
    <h1>Cloud9 Ortho Test Suite</h1>
    <p class="subtitle">Flowise Tool & Node Red Endpoint Testers</p>

    <div class="cards">
        <a href="/patient" class="card patient">
            <h2>Patient Tool Tester</h2>
            <p>Test the <strong>chord_ortho_patient</strong> Flowise tool with all 7 actions: lookup, get, create, appointments, clinic_info, edit_insurance, confirm_appointment.</p>
            <span class="badge">7 Actions</span>
        </a>

        <a href="/scheduling" class="card scheduling">
            <h2>Scheduling Tool Tester</h2>
            <p>Test the <strong>schedule_appointment_ortho</strong> Flowise tool with all 4 actions: slots, grouped_slots, book_child, cancel.</p>
            <span class="badge">4 Actions</span>
        </a>

        <a href="/endpoints" class="card endpoints">
            <h2>Node Red Endpoints</h2>
            <p>Direct endpoint testing for all 11 Node Red Cloud9 Ortho flows. Lower-level testing of the API layer.</p>
            <span class="badge">11 Endpoints</span>
        </a>
    </div>

    <p class="footer">Server running on port ${PORT} | Proxying to Node Red at ${NODE_RED_BASE}</p>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Parse URL without query string
    const urlPath = req.url.split('?')[0];

    // Serve test HTML pages
    if (PAGE_ROUTES[urlPath]) {
        const route = PAGE_ROUTES[urlPath];

        // Handle index page (generated)
        if (route === 'index') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(getIndexPage());
            return;
        }

        // Serve HTML file
        const filePath = path.join(__dirname, route);
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading test page: ' + err.message);
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
        return;
    }

    // Proxy API requests to Node Red
    if (req.url.startsWith('/FabricWorkflow/')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const options = {
                hostname: 'c1-aicoe-nodered-lb.prod.c1conversations.io',
                port: 443,
                path: req.url,
                method: req.method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization || ''
                }
            };

            const proxyReq = https.request(options, (proxyRes) => {
                let responseBody = '';
                proxyRes.on('data', chunk => responseBody += chunk);
                proxyRes.on('end', () => {
                    res.writeHead(proxyRes.statusCode, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(responseBody);
                });
            });

            proxyReq.on('error', (e) => {
                console.error('Proxy error:', e.message);
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            });

            if (body) {
                proxyReq.write(body);
            }
            proxyReq.end();
        });
        return;
    }

    // 404 for other paths
    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  Cloud9 Ortho Test Server Running`);
    console.log(`========================================`);
    console.log(`\n  Available test pages:`);
    console.log(`    http://localhost:${PORT}/           - Index (all test pages)`);
    console.log(`    http://localhost:${PORT}/patient    - Patient Tool (7 actions)`);
    console.log(`    http://localhost:${PORT}/scheduling - Scheduling Tool (4 actions)`);
    console.log(`    http://localhost:${PORT}/endpoints  - Node Red Endpoints (11)`);
    console.log(`\n  Press Ctrl+C to stop\n`);
});
