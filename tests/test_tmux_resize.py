import shlex
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[1] / 'tmux/.tmux.conf'


@unittest.skipUnless(shutil.which('tmux'), 'tmux is not installed')
class TmuxResizeTest(unittest.TestCase):
    def test_restored_layout_fills_window(self):
        binding = next(line for line in CONFIG.read_text().splitlines() if line.startswith('bind r '))
        commands = shlex.split(binding.split('\\;', 1)[1].replace('\\;', ';'))
        for split in (False, True):
            with self.subTest(split=split), tempfile.TemporaryDirectory() as folder:
                def tm(*args):
                    return subprocess.check_output(['tmux', '-S', str(Path(folder) / 'socket'), *args], text=True).strip()

                tm('-f', '/dev/null', 'new-session', '-d', '-x', '160', '-y', '50')
                try:
                    tm('set-option', '-g', 'status', 'off')
                    tm('resize-window', '-x', '80', '-y', '24')
                    if split:
                        tm('split-window', '-h', '-l', '25')
                    layout = tm('display-message', '-p', '#{window_layout}')
                    tm('resize-window', '-x', '160', '-y', '50')
                    tm('select-layout', layout)
                    self.assertEqual(tm('display-message', '-p', '#{window_width}'), '160')
                    if not split:
                        self.assertLess(int(tm('display-message', '-p', '#{pane_height}')), 50)
                    tm(*commands)
                    width, height = map(int, tm('display-message', '-p', '#{window_width} #{window_height}').split())
                    panes = [tuple(map(int, line.split())) for line in tm('list-panes', '-F', '#{pane_left} #{pane_top} #{pane_width} #{pane_height}').splitlines()]
                    self.assertEqual(len(panes), 2 if split else 1)
                    self.assertEqual(max(left + pane_width for left, top, pane_width, pane_height in panes), width)
                    self.assertTrue(all(top == 0 and pane_height == height for left, top, pane_width, pane_height in panes))
                    if split:
                        self.assertGreater(panes[0][2], panes[1][2])
                finally:
                    tm('kill-server')


if __name__ == '__main__':
    unittest.main()
