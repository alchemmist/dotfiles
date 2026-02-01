-- custom_mappings.lua
local map = vim.keymap.set

-- ===========================
-- GENERAL MAPPINGS
-- ===========================

-- Insert mode
map("i", "<C-a>", "<ESC>^i", { desc = "Beginning of line" })
map("i", "<C-e>", "<End>", { desc = "End of line" })

map("n", "'", "`", { noremap = true })
map("n", "`", "'", { noremap = true })

map("n", "<Esc>", "<cmd>noh<CR>", { desc = "Clear highlights" })

map("n", "<C-BS>", "<ESC>dbi", { desc = "Delete previous word" })
map("i", "<A-BS>", "<ESC>dbi<DEL>", { desc = "Delete previous word" })

map("n", "<C-h>", "<C-w>h", { desc = "Window left" })
map("n", "<C-l>", "<C-w>l", { desc = "Window right" })
map("n", "<C-j>", "<C-w>j", { desc = "Window down" })
map("n", "<C-k>", "<C-w>k", { desc = "Window up" })

map("n", "<S-d>", "<C-e>", { desc = "Scroll down" })
map("n", "<S-u>", "<C-y>", { desc = "Scroll up" })

map("n", "<C-c>", "<cmd>%y+<CR>", { desc = "Copy whole file" })

map("n", "<C-p>", "<cmd>let @+=expand('%:p')<CR>", { desc = "Copy absolute path of current file" })

map("n", "<leader>i", "<cmd>IBLToggle<CR>", { desc = "Toggle indent blankline" })

map("n", "<leader>n", "<cmd>set nu!<CR>", { desc = "Toggle line number" })
map("n", "<leader>rn", "<cmd>set rnu!<CR>", { desc = "Toggle relative number" })

map("n", "<leader>z", "<cmd>bufdo bd<CR>", { desc = "Dashboard" })

map("n", "<leader>x", "<cmd>bd<CR>", { desc = "Close buffer" })

map("n", "<leader>l", "<cmd>LazyGit<CR>", { desc = "LazyGit" })

map("n", "gq", function()
	require("conform").format({ async = true, lsp_fallback = true })
end, { desc = "Format code with Conform" })

map("n", "<leader>b", "<cmd>VimtexCompile<CR>", { desc = "Build latex doc" })

map("n", "<leader>m", "<cmd>MarkdownPreviewToggle<CR>", { desc = "Preview markdown document in Github style" })

map("n", "<leader>v", "<cmd>VimtexView<CR>", { desc = "View place in latex doc" })

map("n", "<leader>w", "<cmd>w<CR>", { desc = "Save" })

map("n", "<A-|>", "<cmd>vsplit<CR>", { desc = "Vertical split" })
map("n", "<M-_", "<cmd>split<CR>", { desc = "Horizontal split", noremap = true, silent = true })

map("n", ".", ".")

map("n", "<C-n>", "<cmd>b#<CR>", { desc = "Go to previous buffer", noremap = true, silent = true })

-- Run different PL current file
map("n", "<leader>rp", "<cmd>!python %<CR>", { desc = "Fast run python file" })
map("n", "<leader>rr", "<cmd>RustRun<CR>", { desc = "Fast run rust file" })
map("n", "<leader>rl", "<cmd>!lua %<CR>", { desc = "Fast run lua file" })
map("n", "<leader>rg", "<cmd>!go run %<CR>", { desc = "Fast run go file" })
map(
	"n",
	"<leader>rc",
	"<cmd>!gcc -Wall -Werror -O2 -g -std=gnu17 -fsanitize=undefined,address % -o %:r && ./%:r<CR>",
	{ desc = "Fast run C file" }
)

-- Ufo: folding
map("n", "zR", require("ufo").openAllFolds)
map("n", "zM", require("ufo").closeAllFolds)
map("n", "<leader>h", function()
	local winid = vim.api.nvim_get_current_win()
	if vim.api.nvim_win_get_config(winid).relative ~= "" then
		return
	end

	local lnum = vim.api.nvim_win_get_cursor(winid)[1]

	local is_closed = vim.fn.foldclosed(lnum)
	local is_open = vim.fn.foldlevel(lnum) > 0 and is_closed == -1

	if is_closed ~= -1 then
		vim.cmd("normal! zo")
	elseif is_open then
		vim.cmd("normal! zc")
	else
	end
end, { desc = "Toggle fold under cursor" })

-- Terminal mode
map("t", "<Esc>", vim.api.nvim_replace_termcodes("<C-\\><C-N>", true, true, true), { desc = "Escape terminal mode" })

-- Visual mode
map("v", "<", "<gv", { desc = "Indent line" })
map("v", ">", ">gv", { desc = "Indent line" })

-- ===========================
-- COMMENT.NVIM
-- ===========================
map("n", "<leader>/", function()
	require("Comment.api").toggle.linewise.current()
end, { desc = "Toggle comment" })

map(
	"v",
	"<leader>/",
	"<ESC><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<CR>",
	{ desc = "Toggle comment" }
)

-- ===========================
-- LSP CONFIG
-- ===========================

-- Show signature
map("i", "<C-l>", function()
	vim.lsp.buf.signature_help()
end, { desc = "LSP signature help" })

-- Go to definition
map("n", "gd", function()
	vim.lsp.buf.definition()
end, { desc = "LSP definition" })

-- Hover documentation
map("n", "K", function()
	vim.lsp.buf.hover({ border = "rounded" })
end, { desc = "LSP hover" })

-- Show floating diagnostic
map("n", "E", function()
	vim.diagnostic.open_float({ border = "rounded" })
end, { desc = "Floating diagnostic" })

-- Set diagnostic location list
map("n", "<leader>q", function()
	vim.diagnostic.setloclist()
end, { desc = "Diagnostic setloclist" })

-- Rename
map("v", "<C-r>", function()
	vim.cmd('normal! "zy')
	local query = vim.fn.getreg("z")
	if not query or query == "" then
		return
	end

	query = query:gsub("\n", " ")
	query = vim.fn.shellescape(query)

	vim.cmd("enew")
	vim.cmd("terminal rgr " .. query)
	vim.cmd("startinsert")

	vim.api.nvim_create_autocmd("TermClose", {
		buffer = 0,
		once = true,
		callback = function()
			vim.schedule(function()
				vim.cmd("bdelete! " .. vim.fn.bufnr("%"))
			end)
		end,
	})
end, { desc = "Rename with rgr" })

-- ===========================
-- Oil
-- ===========================
map("n", "<C-e>", "<cmd>Oil<CR>", { desc = "Open oil file manager" })

-- ===========================
-- TELESCOPE
-- ===========================
map("n", "<leader>ff", "<cmd>Telescope find_files<CR>", { desc = "Find files" })

map("n", "<leader>fF", function()
	require("telescope.builtin").find_files({
		no_ignore = true,
		hidden = true,
		file_ignore_patterns = {},
	})
end, { desc = "Find all files" })

map("n", "<leader>fw", "<cmd>Telescope live_grep<CR>", { desc = "Live grep" })

map("n", "<leader>fW", function()
	require("telescope.builtin").live_grep({
		additional_args = function(_)
			return { "--hidden", "--no-ignore", "-L" }
		end,
		file_ignore_patterns = {},
	})
end, { desc = "Live grep (all files, hidden, no-ignore, follow)" })

map("n", "<Tab>", function()
	local bufs = vim.tbl_filter(function(b)
		return vim.api.nvim_buf_is_loaded(b) and vim.api.nvim_buf_get_name(b) ~= ""
	end, vim.api.nvim_list_bufs())
	require("telescope.builtin").buffers({ buf_ids = bufs, sort_lastused = true })
end, { desc = "Find buffers" })

map("n", "<leader>fo", "<cmd>Telescope oldfiles<CR>", { desc = "Find oldfiles" })
map("n", "<leader>fz", "<cmd>Telescope current_buffer_fuzzy_find<CR>", { desc = "Find in current buffer" })

map("n", "<leader>cm", "<cmd>Telescope git_commits<CR>", { desc = "Git commits" })
map("n", "<leader>gt", "<cmd>Telescope git_status<CR>", { desc = "Git status" })

map("n", "<leader>ma", "<cmd>Telescope marks<CR>", { desc = "telescope bookmarks" })

-- ===========================
-- COQ
-- ===========================
map("n", "<A-j>", "<cmd>CoqNext<CR>", { desc = "Next coq line", noremap = true, silent = true })
map("n", "<F-k>", "<cmd>CoqUndo<CR>", { desc = "Prev coq line", noremap = true, silent = true })
map("n", "<A-m>", "<cmd> CoqToLine <CR>", { noremap = true, silent = true })
map("n", "<leader>sc", "<cmd> CoqStart <CR>", { noremap = true, silent = true })

-- Lean
map("n", "<leader>lr", function()
	vim.cmd("LeanAbbreviationsReverseLookup")
end, { noremap = true, silent = true, desc = "Lean: Reverse Abbreviation Lookup" })

-- LaTex
map("i", "<C-.>", "\\Rightarrow", { desc = "Latex right arrow" })
map("i", "<C-,>", "\\Leftarrow", { desc = "Latex left arrow" })

