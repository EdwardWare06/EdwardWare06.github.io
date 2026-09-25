# Dev server for the repo root at http://localhost:8080 (ES modules need http, not file://).
# Every response says "Cache-Control: no-cache": the browser asks again for each file on each load
# (a 304 when nothing changed), so it never runs a new module against a stale cached import.
import functools
import http.server
import os

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
server = http.server.ThreadingHTTPServer(('127.0.0.1', 8080), functools.partial(Handler, directory=root))
print('serving http://localhost:8080', flush=True)
server.serve_forever()
