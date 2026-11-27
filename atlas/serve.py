"""Serve only the maintained publication directory on this computer."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from .paths import SITE_DIR


def serve(port=8000):
    handler = partial(SimpleHTTPRequestHandler, directory=str(SITE_DIR))
    with ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'Bounds table: http://127.0.0.1:{server.server_port}/', flush=True)
        print('Press Ctrl+C to stop.', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
