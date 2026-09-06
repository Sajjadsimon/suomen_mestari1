import http.server
import socketserver
import socket
import sys
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable caching headers & CORS
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == "__main__":
    local_ip = get_local_ip()
    print("=" * 60)
    print("  SUOMI MESTARI 1 — IPHONE PWA MOBILE SERVER")
    print("=" * 60)
    print(f"\n  Serving from: {DIRECTORY}")
    print(f"\n  1. On your PC: http://localhost:{PORT}")
    print(f"  2. On your iPhone (connected to same Wi-Fi):")
    print(f"     👉 http://{local_ip}:{PORT}\n")
    print("  TO INSTALL ON IPHONE:")
    print("  - Open Safari and go to http://" + local_ip + f":{PORT}")
    print("  - Tap the Share button at the bottom (square with arrow)")
    print("  - Scroll down and tap 'Add to Home Screen' (Lisää Koti-valikkoon)")
    print("  - Tap 'Add'. You now have the standalone app on your iPhone!\n")
    print("=" * 60)
    print("Press Ctrl+C to stop server.\n")

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
