import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "mov2mp4.sh"


class Mov2Mp4Test(unittest.TestCase):
    def run_command(self, *args):
        result = subprocess.run(args, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def make_video(self, path, prores=True):
        self.run_command(
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
            "testsrc2=size=64x64:rate=5", "-f", "lavfi", "-i",
            "aevalsrc=0.1234567*sin(440*2*PI*t):s=48000", "-t", "0.4",
            "-c:v", "prores_ks" if prores else "libx264",
            "-pix_fmt", "yuv422p10le" if prores else "yuv420p",
            "-c:a", "pcm_s24le" if prores else "aac",
            "-timecode", "00:00:00:00", str(path),
        )

    def hashes(self, path, copy=False):
        codecs = ["-c", "copy"] if copy else ["-c:v", "rawvideo", "-c:a", "pcm_s32le"]
        return self.run_command(
            "ffmpeg", "-v", "error", "-i", str(path),
            "-map", "0:v", "-map", "0:a", *codecs,
            "-f", "streamhash", "-hash", "sha256", "-",
        )

    def test_prores_and_24_bit_pcm_are_lossless(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "test video.mov"
            output = source.with_suffix(".mp4")
            self.make_video(source)
            self.run_command(str(SCRIPT), str(source))
            self.assertEqual(self.hashes(source), self.hashes(output))
            streams = json.loads(self.run_command(
                "ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output),
            ))["streams"]
            self.assertEqual([s["codec_name"] for s in streams], ["hevc", "alac"])
            self.assertEqual(streams[0]["pix_fmt"], "yuv422p10le")
            self.assertEqual(streams[1]["bits_per_raw_sample"], "24")

    def test_compatible_streams_are_copied_and_output_is_protected(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "test.mov"
            output = Path(directory) / "custom.mp4"
            self.make_video(source, prores=False)
            self.run_command(str(SCRIPT), str(source), str(output))
            self.assertEqual(self.hashes(source, copy=True), self.hashes(output, copy=True))
            original = output.read_bytes()
            result = subprocess.run([str(SCRIPT), str(source), str(output)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output.read_bytes(), original)

    def test_failed_conversion_leaves_no_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "unsupported.mov"
            self.run_command(
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                "testsrc2=size=64x64:rate=5", "-t", "0.2",
                "-c:v", "rawvideo", "-pix_fmt", "uyvy422", str(source),
            )
            result = subprocess.run([str(SCRIPT), str(source)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list(Path(directory).iterdir()), [source])


if __name__ == "__main__":
    unittest.main()
