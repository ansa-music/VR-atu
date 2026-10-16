# Локальный сервер для разработки: как python -m http.server, но без кэша браузера
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


print(f'VR Тир: http://localhost:{PORT}  (Ctrl+C — остановить)')
http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler).serve_forever()
