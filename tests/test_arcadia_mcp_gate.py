import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import sys
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('gate', Path(__file__).resolve().parents[1]/'antex/arcadia-mcp-gate.py')
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)


class GateTests(unittest.TestCase):
    def test_no_mount_means_no_tools_or_resources(self):
        methods = ['initialize', 'tools/list', 'resources/list', 'resources/templates/list', 'prompts/list', 'ping', 'tools/call']
        source = io.BytesIO(('\n'.join(json.dumps({'jsonrpc':'2.0','id':i,'method':m,'params':{'protocolVersion':'2025-03-26'}}) for i,m in enumerate(methods))+'\n').encode())
        out=io.StringIO();GATE.empty_server(source,out)
        results=[json.loads(s) for s in out.getvalue().splitlines()]
        self.assertEqual(results[0]['result']['capabilities'],{})
        self.assertEqual([r['result'] for r in results[1:6]],[{'tools':[]},{'resources':[]},{'resourceTemplates':[]},{'prompts':[]},{}])
        self.assertEqual(results[6]['error']['code'],-32601)

    def test_mount_in_arbitrary_worktree_path(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'separate-task';root.mkdir();nested=root/'project';nested.mkdir()
            with patch.object(GATE.subprocess,'run',return_value=subprocess.CompletedProcess([],0,str(root)+'\n')):
                self.assertEqual(GATE.arcadia_root(nested),str(root.resolve()))
                self.assertIsNone(GATE.arcadia_root(temp))

    def test_symlink_resolves_into_mount(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'mount';root.mkdir();alias=Path(temp)/'alias';alias.symlink_to(root)
            with patch.object(GATE.subprocess,'run',return_value=subprocess.CompletedProcess([],0,str(root)+'\n')):
                self.assertEqual(GATE.arcadia_root(alias),str(root.resolve()))

    def test_unmounted_worktree_and_home_arcignore_do_not_enable(self):
        with patch.object(GATE.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'')):
            self.assertIsNone(GATE.arcadia_root(Path.home()))

    def test_arc_failure_is_closed(self):
        with patch.object(GATE.subprocess,'run',side_effect=subprocess.TimeoutExpired('arc',4)):
            self.assertIsNone(GATE.arcadia_root(Path.home()))

    def test_outside_does_not_start_original_server(self):
        payload='{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n'
        result=subprocess.run([sys.executable,str(Path(__file__).resolve().parents[1]/'antex/arcadia-mcp-gate.py'),'/does/not/exist'],input=payload,text=True,capture_output=True,cwd='/tmp',timeout=10)
        self.assertEqual(result.returncode,0)
        self.assertEqual(json.loads(result.stdout)['result'],{'tools':[]})


if __name__=='__main__':
    unittest.main()
