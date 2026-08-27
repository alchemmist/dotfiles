import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import nvim_diff


class NvimDiffTest(unittest.TestCase):
    def test_repository_main_only_forwards_arguments_to_lua(self):
        with patch.object(nvim_diff.subprocess, "call", return_value=0) as call:
            result = nvim_diff.repository_main(["commit", "abc123"])

        self.assertEqual(result, 0)
        command = call.call_args.args[0]
        env = call.call_args.kwargs["env"]
        self.assertEqual(command[0], "nvim")
        self.assertIn("require('ndiff').start", command[-1])
        self.assertEqual(json.loads(env["NDIFF_ARGUMENTS"]), ["commit", "abc123"])

    def test_patch_main_forwards_patch_file_to_lua(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "change.diff"
            source.write_text("patch")
            with patch.object(nvim_diff.subprocess, "call", return_value=0) as call:
                result = nvim_diff.patch_main([str(source)])

        self.assertEqual(result, 0)
        command = call.call_args.args[0]
        env = call.call_args.kwargs["env"]
        self.assertEqual(command[0], "nvim")
        self.assertIn("require('ndiff').open", command[-1])
        self.assertEqual(Path(env["NDIFF_PATCH"]).name, "input.diff")

    def test_patch_main_dry_run_does_not_launch_neovim(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "change.diff"
            source.write_text("patch")
            with (
                patch.object(nvim_diff.subprocess, "call") as call,
                patch("builtins.print") as output,
            ):
                result = nvim_diff.patch_main(["--dry-run", str(source)])

        self.assertEqual(result, 0)
        call.assert_not_called()
        self.assertEqual(json.loads(output.call_args.args[0]), {"mode": "patch", "bytes": 5})


if __name__ == "__main__":
    unittest.main()
