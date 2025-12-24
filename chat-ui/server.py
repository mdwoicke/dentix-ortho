"""
Simple HTTP Server with CORS Proxy for Flowise API

Usage: python server.py [port]
Default port: 8080
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.error
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
FLOWISE_API = "https://app.c1elly.ai/api/v1/prediction/5f1fa57c-e6fd-463c-ac6e-c73fd5fb578b"

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler with CORS support and API proxy"""

    def __init__(self, *args, **kwargs):
        # Set the directory to serve files from
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/chat':
            self.proxy_to_flowise()
        else:
            self.send_error(404)

    def proxy_to_flowise(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            req = urllib.request.Request(
                FLOWISE_API,
                data=post_data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=60) as response:
                result = response.read()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(result)

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='ignore')
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e), 'details': error_body}).encode())

        except urllib.error.URLError as e:
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Service unavailable', 'details': str(e)}).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Internal server error', 'details': str(e)}).encode())

    def log_message(self, format, *args):
        # Custom log format
        print(f"[{self.log_date_time_string()}] {args[0]}")


def main():
    # Change to the script's directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        print(f"\n{'='*50}")
        print(f"  Chat UI Server running at http://localhost:{PORT}")
        print(f"  API proxy endpoint: http://localhost:{PORT}/api/chat")
        print(f"{'='*50}")
        print(f"\nPress Ctrl+C to stop\n")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.shutdown()


if __name__ == '__main__':
    main()
