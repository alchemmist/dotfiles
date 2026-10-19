import fcntl
import os
import pty
import select
import struct
import termios
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[1] / 'tmux/.tmux.conf'
BINARY = Path.home() / '.tmux/plugins/flash.tmux/zig-out/bin/flash_tmux_instant'


@unittest.skipUnless(shutil.which('tmux') and BINARY.is_file(), 'flash.tmux is not installed')
class FlashTest(unittest.TestCase):
    def test_immediate_typing_reaches_flash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def tm(*args):
                return subprocess.check_output(['tmux', '-S', str(root / 'socket'), *args], text=True).strip()

            tm('-f', '/dev/null', 'new-session', '-d', '-s', 'test', '-x', '100', '-y', '24', '/bin/cat')
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 100, 0, 0))
            client = subprocess.Popen(['tmux', '-S', str(root / 'socket'), 'attach', '-t', 'test'], stdin=slave, stdout=slave, stderr=slave, env={**os.environ, 'TERM': 'xterm-256color'})
            try:
                config = root / 'flash.conf'
                config.write_text('\n'.join(line for line in CONFIG.read_text().splitlines() if '@flash-launch' in line))
                tm('source-file', str(config))
                tm('set-option', '-g', 'mode-keys', 'vi')
                tm('send-keys', '-t', 'test:', 'target needle here', 'Enter')
                time.sleep(.15)
                source = tm('display-message', '-p', '-t', 'test:', '#{pane_id}')
                before = tm('capture-pane', '-p', '-t', source)
                for attempt in range(5):
                    if attempt % 2:
                        tm('copy-mode', '-t', source)
                        tm('send-keys', '-t', source, '-X', 'start-of-line')
                        if attempt == 3:
                            tm('send-keys', '-t', source, '-X', 'top-line')
                            tm('send-keys', '-t', source, '-X', 'start-of-line')
                            tm('send-keys', '-t', source, '-X', 'begin-selection')
                        os.write(master, b'sneedle\r')
                    else:
                        os.write(master, b'\x02sneedlea' if attempt == 0 else b'\x02sneedle\r')
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        while select.select([master], [], [], 0)[0]:
                            os.read(master, 65536)
                        if tm('display-message', '-p', '-t', source, '#{pane_in_mode} #{copy_cursor_x}') == '1 7' and tm('list-sessions', '-F', '#{session_name}') == 'test':
                            break
                        time.sleep(.01)
                    else:
                        self.fail('Immediate search did not complete')
                    self.assertEqual(tm('capture-pane', '-p', '-t', source), before)
                    self.assertEqual(tm('display-message', '-p', '-t', source, '#{copy_cursor_x}'), '7')
                    self.assertEqual(tm('display-message', '-p', '-t', source, '#{selection_active}'), '1', f'attempt={attempt}')
                    tm('send-keys', '-t', source, '-X', '-N', '5', 'cursor-right')
                    tm('send-keys', '-t', source, '-X', 'copy-selection-no-clear')
                    self.assertEqual(tm('show-buffer'), 'target needle' if attempt == 3 else 'needle')
                    tm('send-keys', '-t', source, '-X', 'cancel')
                os.write(master, b'\x02s\x03')
                time.sleep(.15)
                deadline = time.monotonic() + 5
                while tm('list-sessions', '-F', '#{session_name}') != 'test':
                    self.assertLess(time.monotonic(), deadline, 'Immediate cancellation did not restore the pane')
                    time.sleep(.01)
                self.assertEqual(tm('display-message', '-p', '-t', 'test:', '#{pane_id}'), source)
                self.assertEqual(tm('capture-pane', '-p', '-t', source), before)
            finally:
                tm('kill-server')
                client.wait(timeout=5)
                os.close(master)
                os.close(slave)

    def test_visible_screen_launch_and_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def tm(*args):
                return subprocess.check_output(['tmux', '-S', str(root / 'socket'), *args], text=True).strip()

            def wait_for(predicate):
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    if predicate():
                        return
                    time.sleep(.01)
                self.fail('Timed out waiting for flash')

            fixture = root / 'text'
            fixture.write_text(''.join(f'line-{number:03d}\n' for number in range(100)))
            tm('-f', '/dev/null', 'new-session', '-d', '-s', 'test', '-x', '100', '-y', '24', '/bin/cat')
            try:
                config = root / 'flash.conf'
                config.write_text('\n'.join(line for line in CONFIG.read_text().splitlines() if '@flash-launch' in line))
                tm('source-file', str(config))
                tm('set-option', '-g', 'mode-keys', 'vi')
                tm('load-buffer', str(fixture))
                tm('paste-buffer', '-t', 'test:')
                wait_for(lambda: 'line-099' in tm('capture-pane', '-p', '-t', 'test:'))
                source = tm('display-message', '-p', '-t', 'test:', '#{pane_id}')
                environment = {**os.environ, 'TMUX': tm('display-message', '-p', '#{socket_path},#{pid},0')}
                for copy_mode in (False, True):
                    with self.subTest(copy_mode=copy_mode):
                        if copy_mode:
                            tm('copy-mode', '-t', source)
                            tm('send-keys', '-t', source, '-X', 'page-up')
                        scroll = int(tm('display-message', '-p', '-t', source, '#{scroll_position}') or 0)
                        height = int(tm('display-message', '-p', '-t', source, '#{pane_height}'))
                        snapshot = subprocess.check_output([str(BINARY), '--inspect', '--pane=' + source], env=environment, text=True).split('--- capture ---\n', 1)[1].strip()
                        expected = tm('capture-pane', '-p', '-e', '-N', '-t', source, '-S', str(-scroll), '-E', str(height - scroll - 1))
                        self.assertEqual(snapshot, expected)
                        self.assertNotIn('line-000', snapshot)
                        self.assertLessEqual(len(snapshot.splitlines()), height)
                        if copy_mode:
                            self.assertGreater(scroll, 0)
                            self.assertNotIn('line-099', snapshot)
                        for attempt in range(3):
                            tm('run-shell', '-C', '-t', source, '#{E:@flash-launch}')
                            wait_for(lambda: tm('display-message', '-p', '-t', 'test:', '#{pane_id}') != source)
                            wait_for(lambda: 'line-' in tm('capture-pane', '-p', '-t', 'test:'))
                            tm('send-keys', '-t', 'test:', 'C-c')
                            wait_for(lambda: tm('list-sessions', '-F', '#{session_name}') == 'test')
                            self.assertEqual(tm('display-message', '-p', '-t', 'test:', '#{pane_id}'), source)
                            self.assertEqual(tm('display-message', '-p', '-t', source, '#{pane_in_mode}'), str(int(copy_mode)))
            finally:
                tm('kill-server')


if __name__ == '__main__':
    unittest.main()
