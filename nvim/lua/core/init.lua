local opt = vim.opt
local g = vim.g

-------------------------------------- options ------------------------------------------
opt.laststatus = 0 -- global statusline
opt.showmode = false

opt.clipboard = "unnamedplus"

-- vim.keymap.set({ "n", "v" }, "y", '"+y')
-- vim.keymap.set("n", "P", '"+p')
-- vim.keymap.set("v", "P", '"+p')

opt.scrolloff = 5
opt.scrolljump = 2

-- Indenting
opt.expandtab = true
opt.shiftwidth = 4
opt.smartindent = true
opt.tabstop = 4
opt.softtabstop = 4

opt.fillchars = { eob = " " }
opt.ignorecase = true
opt.smartcase = true
opt.mouse = "a"

-- Numbers
opt.number = false
opt.numberwidth = 2
opt.ruler = false

-- disable nvim intro
opt.shortmess:append("sI")

opt.signcolumn = "yes"
opt.splitbelow = true
opt.splitright = true
opt.termguicolors = true
opt.timeoutlen = 400
opt.undofile = true

-- interval for writing swap file to disk
opt.updatetime = 250

vim.opt.fillchars:append({ eob = "~" })
vim.opt.list = false
vim.opt.shortmess:remove("I")

vim.o.shell = "/usr/bin/zsh"
vim.o.shellcmdflag = "-c"

vim.o.background = "dark"
vim.o.cursorline = true
vim.o.showtabline = 0

-- go to previous/next line with h,l,left arrow and right arrow
-- when cursor reaches end/beginning of line
opt.whichwrap:append("<>[]hl")

g.mapleader = " "

-- disable some default providers
for _, provider in ipairs({ "node", "perl", "python3", "ruby" }) do
	vim.g["loaded_" .. provider .. "_provider"] = 0
end

-- add binaries installed by mason.nvim to path
local is_windows = vim.loop.os_uname().sysname == "Windows_NT"
vim.env.PATH = vim.fn.stdpath("data") .. "/mason/bin" .. (is_windows and ";" or ":") .. vim.env.PATH

-------------------------------------- autocmds ------------------------------------------
local autocmd = vim.api.nvim_create_autocmd

-- dont list quickfix buffers
autocmd("FileType", {
	pattern = "qf",
	callback = function()
		vim.opt_local.buflisted = false
		-- require("cmp").setup.buffer { enabled = false }
	end,
})

