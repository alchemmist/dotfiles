local opt = vim.opt
local g = vim.g

opt.laststatus = 0
opt.showmode = false

opt.clipboard = "unnamedplus"

opt.scrolloff = 5
opt.scrolljump = 2

opt.expandtab = true
opt.shiftwidth = 4
opt.smartindent = true
opt.tabstop = 4
opt.softtabstop = 4

opt.ignorecase = true
opt.smartcase = true
opt.mouse = "a"

opt.number = false
opt.numberwidth = 2
opt.ruler = false

opt.shortmess:append("sI")

opt.signcolumn = "yes"
opt.splitbelow = true
opt.splitright = true
opt.termguicolors = true
opt.timeoutlen = 400
opt.undofile = true

opt.updatetime = 250

vim.opt.fillchars:append({ eob = "~" })
vim.opt.list = false
vim.opt.shortmess:remove("I")

vim.o.shell = "/usr/bin/zsh"
vim.o.shellcmdflag = "-c"

vim.o.background = "dark"
vim.o.showtabline = 0
vim.o.cursorline = true

g.mapleader = " "

for _, provider in ipairs({ "node", "perl", "python3", "ruby" }) do
	vim.g["loaded_" .. provider .. "_provider"] = 0
end

local is_windows = vim.loop.os_uname().sysname == "Windows_NT"
vim.env.PATH = vim.fn.stdpath("data") .. "/mason/bin" .. (is_windows and ";" or ":") .. vim.env.PATH
