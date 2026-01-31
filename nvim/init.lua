require("core")


local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
	require("core.bootstrap").lazy(lazypath)
end

vim.opt.rtp:prepend(lazypath)
require("plugins")

require("core.mappings")

require("plugins.configs.treesitter")
require("ibl").setup({
    enabled = false,
	scope = {
		enabled = false,
		show_start = false,
		show_end = false,
		highlight = nil,
	},
})

vim.cmd([[
function OpenMarkdownPreview (url)
  execute "silent ! google-chrome-stable --new-window --app=" . a:url
endfunction
]])
vim.g.mkdp_browserfunc = "OpenMarkdownPreview"

vim.api.nvim_create_autocmd("FileType", {
	pattern = "java",
	callback = function()
		vim.bo.tabstop = 4
		vim.bo.shiftwidth = 4
		vim.bo.expandtab = true
	end,
})

vim.api.nvim_create_autocmd("FileType", {
	pattern = "tex",
	callback = function()
		vim.bo.tabstop = 4
		vim.bo.shiftwidth = 4
		vim.bo.expandtab = true
	end,
})

vim.g.python3_host_prog = "/usr/bin/python3"
vim.g.loaded_python3_provider = nil

vim.api.nvim_set_keymap("n", "<A-j>", "<cmd> CoqNext <CR>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "<A-k>", "<cmd> CoqUndo <CR>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "<A-m>", "<cmd> CoqToLine <CR>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "<leader>sc", "<cmd> CoqStart <CR>", { noremap = true, silent = true })

vim.api.nvim_set_keymap("n", "<M-_>", "<cmd>:split<CR>", { noremap = true, silent = true })

vim.api.nvim_create_autocmd("BufReadPost", {
	pattern = "*",
	callback = function()
		require("conform").format({ async = true })
	end,
})

vim.api.nvim_set_hl(0, "Comment", { fg = "#555555", italic = true })

require("ufo")

vim.keymap.set("n", "zR", require("ufo").openAllFolds)
vim.keymap.set("n", "zM", require("ufo").closeAllFolds)
vim.keymap.set("n", "<leader>h", function()
	local winid = vim.api.nvim_get_current_win()
	-- Skip if in floating window
	if vim.api.nvim_win_get_config(winid).relative ~= "" then
		return
	end

	-- Get current line number
	local lnum = vim.api.nvim_win_get_cursor(winid)[1]

	-- Check if fold is closed at current line
	local is_closed = vim.fn.foldclosed(lnum)
	local is_open = vim.fn.foldlevel(lnum) > 0 and is_closed == -1

	if is_closed ~= -1 then
		vim.cmd("normal! zo") -- open fold
	elseif is_open then
		vim.cmd("normal! zc") -- close fold
	else
		-- pass: do nothing
	end
end, { desc = "Toggle fold under cursor" })

vim.cmd("colorscheme moss")

require("colorizer").setup()

function ToggleTabline()
	if vim.o.showtabline == 0 then
		vim.o.showtabline = 2
	else
		vim.o.showtabline = 0
	end
end

vim.keymap.set("n", "<leader>tt", ToggleTabline, { desc = "Toggle tabline" })

vim.api.nvim_create_autocmd("FileType", {
	pattern = { "html", "css", "javascriptreact", "javascript", "typescript", "typescriptreact" },
	callback = function()
		vim.schedule(function()
			vim.bo.tabstop = 2 -- ширина таба визуально
			vim.bo.shiftwidth = 2 -- ширина отступа для >> << и auto-indent
			vim.bo.softtabstop = 2 -- backspace и таб работают как 2 пробела
			vim.bo.expandtab = true -- табы заменяются пробелами
		end)
	end,
})

local function show_hover_with_border()
	local params = vim.lsp.util.make_position_params()
	vim.lsp.buf_request(0, "textDocument/hover", params, function(err, result, ctx, config)
		config = config or {}
		config.border = "rounded"
		vim.lsp.handlers.hover(err, result, ctx, config)
	end)
end

vim.keymap.set("n", "K", show_hover_with_border, { desc = "LSP Hover with border" })

vim.g.vimtex_quickfix_mode = 0
vim.g.vimtex_compiler_latexmk = {
	callback = 0,
	continuous = 1,
	executable = "latexmk",
	options = {
		"-verbose",
		"-file-line-error",
		"-synctex=1",
		"-interaction=nonstopmode",
	},
}
vim.g.vimtex_compiler_progname = "nvr"
vim.g.vimtex_compiler_callback_hooks = {}

vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = "*.opml",
	callback = function()
		vim.bo.filetype = "xml"
	end,
})

vim.o.showtabline = 0
vim.api.nvim_create_autocmd("BufEnter", {
	callback = function()
		vim.o.showtabline = 0
	end,
})

vim.api.nvim_create_autocmd("BufEnter", {
	callback = function(args)
		local b = args.buf
		if vim.api.nvim_buf_get_name(b) == "" and not vim.bo[b].modified and vim.bo[b].buftype == "" then
			vim.bo[b].buflisted = false
		end
	end,
})

-- в insert режиме: Ctrl+Backspace -> удалить слово назад
vim.keymap.set("i", "<C-_>", "<C-w>", { noremap = true })

vim.o.background = "dark" -- or "light" for light mode
vim.o.cursorline = true

-- Горячая клавиша для текущего символа
vim.keymap.set("n", "<leader>lr", function()
	vim.cmd("LeanAbbreviationsReverseLookup")
end, { noremap = true, silent = true, desc = "Lean: Reverse Abbreviation Lookup" })

require("snippets")
vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = "*.snippets",
	callback = function()
		vim.cmd("syntax off")
	end,
})

require("git-conflict")


vim.keymap.set("n", "'", "`", { noremap = true })
vim.keymap.set("n", "`", "'", { noremap = true })

