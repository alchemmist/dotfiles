local M = {}
local fn = vim.fn

M.echo = function(str)
	vim.cmd("redraw")
	vim.api.nvim_echo({ { str, "Bold" } }, true, {})
end

local function shell_call(args)
	local output = fn.system(args)
	assert(vim.v.shell_error == 0, "External call failed with error code: " .. vim.v.shell_error .. "\n" .. output)
end

M.lazy = function(install_path)
	M.echo("  Installing lazy.nvim & plugins ...")
	local repo = "https://github.com/folke/lazy.nvim.git"
	shell_call({ "git", "clone", "--filter=blob:none", "--branch=stable", repo, install_path })
	vim.opt.rtp:prepend(install_path)

	require("plugins")
end

return M
