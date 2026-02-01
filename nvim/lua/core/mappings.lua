-- custom_mappings.lua
local map = vim.keymap.set

-- ===========================
-- GENERAL MAPPINGS
-- ===========================

-- Insert mode
map("i", "<C-b>", "<ESC>^i", { desc = "Beginning of line" })
map("i", "<C-e>", "<End>", { desc = "End of line" })
map("i", "<C-.>", "\\Rightarrow", { desc = "Latex right arrow" })
map("i", "<C-,>", "\\Leftarrow", { desc = "Latex left arrow" })
map("i", "<A-BS>", "<ESC>dbi<DEL>", { desc = "Delete previous word" })
map("i", "<C-l>", function()
	vim.lsp.buf.signature_help()
end, { desc = "LSP signature help" })
map("i", "<C-_>", "<C-w>", { noremap = true })

-- Normal mode
map("n", "'", "`", { noremap = true })
map("n", "`", "'", { noremap = true })
map("n", "<Esc>", "<cmd>noh<CR>", { desc = "Clear highlights" })
map("n", "<C-BS>", "<ESC>dbi", { desc = "Delete previous word" })
map("n", "<C-h>", "<C-w>h", { desc = "Window left" })
map("n", "<C-l>", "<C-w>l", { desc = "Window right" })
map("n", "<C-j>", "<C-w>j", { desc = "Window down" })
map("n", "<C-k>", "<C-w>k", { desc = "Window up" })
map("n", "<S-d>", "<C-e>", { desc = "Scroll down" })
map("n", "<S-u>", "<C-y>", { desc = "Scroll up" })
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
map("n", "<C-c>", "<cmd>%y+<CR>", { desc = "Copy whole file" })
map("n", "<C-p>", "<cmd>let @+=expand('%:p')<CR>", { desc = "Copy absolute path of current file" })
map("n", "<leader>n", "<cmd>set nu!<CR>", { desc = "Toggle line number" })
map("n", "<leader>i", "<cmd>IBLToggle<CR>", { desc = "Toggle indent blankline" })
map("n", "<leader>rn", "<cmd>set rnu!<CR>", { desc = "Toggle relative number" })
map("n", "j", 'v:count || mode(1)[0:1] == "no" ? "j" : "gj"', { expr = true, desc = "Move down" })
map("n", "k", 'v:count || mode(1)[0:1] == "no" ? "k" : "gk"', { expr = true, desc = "Move up" })
map("n", "<Up>", 'v:count || mode(1)[0:1] == "no" ? "k" : "gk"', { expr = true, desc = "Move up" })
map("n", "<Down>", 'v:count || mode(1)[0:1] == "no" ? "j" : "gj"', { expr = true, desc = "Move down" })
map("n", "<leader>z", "<cmd>bufdo bd<CR>", { desc = "Dashboard" })
map("n", "<leader>x", "<cmd>bd<CR>", { desc = "Close buffer" })
map("n", "<leader>l", "<cmd>LazyGit<CR>", { desc = "LazyGit" })
map("n", "<leader>ch", "<cmd>NvCheatsheet<CR>", { desc = "Mapping cheatsheet" })
map("n", "gq", function()
	require("conform").format({ async = true, lsp_fallback = true })
end, { desc = "Format code with Conform" })
map("n", "<leader>b", "<cmd>VimtexCompile<CR>", { desc = "Build latex doc" })
map("n", "<leader>m", "<cmd>MarkdownPreviewToggle<CR>", { desc = "Preview markdown document in Github style" })
map("n", "<leader>v", "<cmd>VimtexView<CR>", { desc = "View place in latex doc" })
map("n", "<leader>w", "<cmd>w<CR>", { desc = "Save" })
map("n", "<A-|>", "<cmd>vsplit<CR>", { desc = "Vertical split" })
map("n", "<M-_", "<cmd>split<CR>", { desc = "Horizontal split", noremap = true, silent = true })
map("n", "<TAB>", "<cmd>tabNext<CR>", { desc = "Go to next tab" })
map("n", ".", ".")
map("n", "<S-E>", function()
	vim.diagnostic.open_float({ border = "rounded" })
end, { desc = "Show LSP message", silent = true, noremap = true })
map("n", "<leader>dc", ":%s/\\v\\s*(#|\\/\\/|--|;).*$//g<CR>", { desc = "Clear all comments" })
map("n", "<C-n>", "<cmd>b#<CR>", { desc = "Go to previous buffer", noremap = true, silent = true })

map("n", "K", function()
	local params = vim.lsp.util.make_position_params()
	vim.lsp.buf_request(0, "textDocument/hover", params, function(err, result, ctx, config)
		config = config or {}
		config.border = "rounded"
		vim.lsp.handlers.hover(err, result, ctx, config)
	end)
end, { desc = "LSP Hover with border" })

map("n", "<A-j>", "<cmd> CoqNext <CR>", { noremap = true, silent = true })
map("n", "<A-k>", "<cmd> CoqUndo <CR>", { noremap = true, silent = true })
map("n", "<A-m>", "<cmd> CoqToLine <CR>", { noremap = true, silent = true })
map("n", "<leader>sc", "<cmd> CoqStart <CR>", { noremap = true, silent = true })

map("n", "<M-_>", "<cmd>:split<CR>", { noremap = true, silent = true })

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

map("n", "<leader>tt", function()
	if vim.o.showtabline == 0 then
		vim.o.showtabline = 2
	else
		vim.o.showtabline = 0
	end
end, { desc = "Toggle tabline" })

-- Terminal mode
map("t", "<C-x>", vim.api.nvim_replace_termcodes("<C-\\><C-N>", true, true, true), { desc = "Escape terminal mode" })

-- Visual mode
map("v", "<Up>", 'v:count || mode(1)[0:1] == "no" ? "k" : "gk"', { expr = true, desc = "Move up" })
map("v", "<Down>", 'v:count || mode(1)[0:1] == "no" ? "j" : "gj"', { expr = true, desc = "Move down" })
map("v", "<", "<gv", { desc = "Indent line" })
map("v", ">", ">gv", { desc = "Indent line" })

-- Visual and select mode
map("x", "j", 'v:count || mode(1)[0:1] == "no" ? "j" : "gj"', { expr = true, desc = "Move down" })
map("x", "k", 'v:count || mode(1)[0:1] == "no" ? "k" : "gk"', { expr = true, desc = "Move up" })
map("x", "p", 'p:let @+=@0<CR>:let @"=@0<CR>', { silent = true, desc = "Dont copy replaced text" })

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
-- Go to definition
map("n", "gd", function()
	vim.lsp.buf.definition()
end, { desc = "LSP definition" })

-- Hover documentation
-- map("n", "K", function()
--   vim.lsp.buf.hover({ border = "rounded" })
-- end, { desc = "LSP hover" })

-- Go to implementation
map("n", "gi", function()
	vim.lsp.buf.implementation()
end, { desc = "LSP implementation" })

-- Type definition
map("n", "<leader>D", function()
	vim.lsp.buf.type_definition()
end, { desc = "LSP type definition" })

-- Code action
map("n", "<leader>ca", function()
	vim.lsp.buf.code_action()
end, { desc = "LSP code action" })

-- Find references
map("n", "gr", function()
	vim.lsp.buf.references()
end, { desc = "LSP references" })

-- Show floating diagnostic
map("n", "E", function()
	vim.diagnostic.open_float({ border = "rounded" })
end, { desc = "Floating diagnostic" })

-- Go to previous diagnostic
map("n", "[d", function()
	vim.diagnostic.goto_prev({ float = { border = "rounded" } })
end, { desc = "Goto previous diagnostic" })

-- Go to next diagnostic
map("n", "]d", function()
	vim.diagnostic.goto_next({ float = { border = "rounded" } })
end, { desc = "Goto next diagnostic" })

-- Set diagnostic location list
map("n", "<leader>q", function()
	vim.diagnostic.setloclist()
end, { desc = "Diagnostic setloclist" })

-- Workspace folders
map("n", "<leader>wa", function()
	vim.lsp.buf.add_workspace_folder()
end, { desc = "Add workspace folder" })

map("n", "<leader>wr", function()
	vim.lsp.buf.remove_workspace_folder()
end, { desc = "Remove workspace folder" })

map("n", "<leader>wl", function()
	print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
end, { desc = "List workspace folders" })

-- Rename
map("n", "<leader>rN", function()
	vim.lsp.buf.rename()
end, { desc = "LSP rename" })

-- Java specific commands
map("n", "<leader>ev", function()
	vim.lsp.buf.execute_command({ command = "java.extract.variable" })
end, { desc = "Extract variable" })

map("n", "<leader>ec", function()
	vim.lsp.buf.execute_command({ command = "java.extract.constant" })
end, { desc = "Extract constant" })

map("n", "<leader>em", function()
	vim.lsp.buf.execute_command({ command = "java.extract.method" })
end, { desc = "Extract method" })

map("n", "<leader>gc", function()
	vim.lsp.buf.execute_command({ command = "java.generate.constructor" })
end, { desc = "Generate constructor" })

map("n", "<leader>gt", function()
	vim.lsp.buf.execute_command({ command = "java.generate.toString" })
end, { desc = "Generate toString method" })

map("n", "<leader>ge", function()
	vim.lsp.buf.execute_command({ command = "java.generate.hashCodeAndEquals" })
end, { desc = "Generate hashCode and equals methods" })

map("n", "<leader>gd", function()
	vim.lsp.buf.execute_command({ command = "java.generate.delegate" })
end, { desc = "Generate delegate methods" })

map("n", "<leader>gm", function()
	vim.lsp.buf.execute_command({ command = "java.move.methodOrClass" })
end, { desc = "Move method or class" })

map("n", "<leader>rf", function()
	vim.lsp.buf.execute_command({ command = "java.refactor.signature" })
end, { desc = "Refactor method signature" })

map("n", "<leader>jp", function()
	vim.lsp.buf.execute_command({ command = "java.javap" })
end, { desc = "Display bytecode with javap" })

map("n", "<leader>jl", function()
	vim.lsp.buf.execute_command({ command = "java.jol" })
end, { desc = "Show memory usage with jol" })

map("n", "<leader>js", function()
	vim.lsp.buf.execute_command({ command = "java.jshell" })
end, { desc = "Open JShell" })

-- Java test commands
map("n", "<leader>ft", function()
	vim.lsp.buf.execute_command({ command = "java.test.run" })
end, { desc = "Run Java tests" })

-- Organize imports
map("n", "<leader>oi", function()
	vim.lsp.buf.execute_command({ command = "java.organize.imports" })
end, { desc = "Organize imports" })

-- Extract variable (all occurrences)
map("n", "<leader>eva", function()
	vim.lsp.buf.execute_command({ command = "java.extract.variable.all" })
end, { desc = "Extract variable (all)" })

-- Class contents
map("n", "<leader>cl", function()
	vim.lsp.buf.execute_command({ command = "java.class.contents" })
end, { desc = "Class contents" })

-- Code actions
map("n", "<leader>ea", function()
	vim.lsp.buf.execute_command({ command = "java.code.actions" })
end, { desc = "Code actions" })

-- Generate toString
map("n", "<leader>gT", function()
	vim.lsp.buf.execute_command({ command = "java.generate.toString" })
end, { desc = "Generate toString" })

-- Generate hashCode and equals
map("n", "<leader>gh", function()
	vim.lsp.buf.execute_command({ command = "java.generate.hashcode_equals" })
end, { desc = "Generate hashCode and equals" })

-- Generate delegate methods
map("n", "<leader>gd", function()
	vim.lsp.buf.execute_command({ command = "java.generate.delegate.methods" })
end, { desc = "Generate delegate methods" })

-- Move package, method or type
map("n", "<leader>mp", function()
	vim.lsp.buf.execute_command({ command = "java.move.package.method.type" })
end, { desc = "Move package, method or type" })

-- Refactor signature
map("n", "<leader>rs", function()
	vim.lsp.buf.execute_command({ command = "java.refactor.signature" })
end, { desc = "Refactor signature" })

-- JDTLS tests
map("n", "<leader>ts", function()
	require("jdtls.tests").goto_subjects()
end, { desc = "Go to tests/subjects" })

-- Visual mode code actions
map("v", "<leader>ca", function()
	vim.lsp.buf.code_action()
end, { desc = "LSP code action" })

-- ===========================
-- NVIM-TREE / NEO-TREE
-- ===========================
map("n", "<leader>e", "<cmd>Oil<CR>", { desc = "Open oil file manager" })

-- ===========================
-- TELESCOPE
-- ===========================
-- Find files
map("n", "<leader>ff", "<cmd>Telescope find_files<CR>", { desc = "Find files" })

map("n", "<leader>fF", function()
	require("telescope.builtin").find_files({
		no_ignore = true,
		hidden = true,
		file_ignore_patterns = {},
	})
end, { desc = "Find all files" })

-- Live grep
map("n", "<leader>fw", "<cmd>Telescope live_grep<CR>", { desc = "Live grep" })

map("n", "<leader>fW", function()
	require("telescope.builtin").live_grep({
		additional_args = function(_)
			return { "--hidden", "--no-ignore", "-L" }
		end,
		file_ignore_patterns = {},
	})
end, { desc = "Live grep (all files, hidden, no-ignore, follow)" })

-- Buffers
map("n", "<Tab>", function()
	local bufs = vim.tbl_filter(function(b)
		return vim.api.nvim_buf_is_loaded(b) and vim.api.nvim_buf_get_name(b) ~= ""
	end, vim.api.nvim_list_bufs())
	require("telescope.builtin").buffers({ buf_ids = bufs, sort_lastused = true })
end, { desc = "Find buffers" })

-- Other telescope commands
map("n", "<leader>fh", "<cmd>Telescope help_tags<CR>", { desc = "Help page" })
map("n", "<leader>fo", "<cmd>Telescope oldfiles<CR>", { desc = "Find oldfiles" })
map("n", "<leader>fz", "<cmd>Telescope current_buffer_fuzzy_find<CR>", { desc = "Find in current buffer" })

-- Git
map("n", "<leader>cm", "<cmd>Telescope git_commits<CR>", { desc = "Git commits" })
map("n", "<leader>gt", "<cmd>Telescope git_status<CR>", { desc = "Git status" })

-- Pick hidden term
map("n", "<leader>pt", "<cmd>Telescope terms<CR>", { desc = "Pick hidden term" })

-- Marks
map("n", "<leader>ma", "<cmd>Telescope marks<CR>", { desc = "telescope bookmarks" })

-- ===========================
-- NVTERM
-- ===========================
-- Terminal mode
map("t", "<A-i>", function()
	require("nvterm.terminal").toggle("float")
end, { desc = "Toggle floating term" })

map("t", "<A-h>", function()
	require("nvterm.terminal").toggle("horizontal")
end, { desc = "Toggle horizontal term" })

map("t", "<A-v>", function()
	require("nvterm.terminal").toggle("vertical")
end, { desc = "Toggle vertical term" })

-- Normal mode
map("n", "<A-f>", function()
	require("nvterm.terminal").toggle("float")
end, { desc = "Toggle floating term" })

map("n", "<A-h>", function()
	require("nvterm.terminal").toggle("horizontal")
end, { desc = "Toggle horizontal term" })

map("n", "<A-v>", function()
	require("nvterm.terminal").toggle("vertical")
end, { desc = "Toggle vertical term" })

-- ===========================
-- WHICH-KEY
-- ===========================
map("n", "<leader>wK", function()
	vim.cmd("WhichKey")
end, { desc = "Which-key all keymaps" })

map("n", "<leader>wk", function()
	local input = vim.fn.input("WhichKey: ")
	vim.cmd("WhichKey " .. input)
end, { desc = "Which-key query lookup" })

-- ===========================
-- INDENT BLANKLINE
-- ===========================
map("n", "<leader>cc", function()
	local ok, start = require("indent_blankline.utils").get_current_context(
		vim.g.indent_blankline_context_patterns,
		vim.g.indent_blankline_use_treesitter_scope
	)

	if ok then
		vim.api.nvim_win_set_cursor(vim.api.nvim_get_current_win(), { start, 0 })
		vim.cmd([[normal! _]])
	end
end, { desc = "Jump to current context" })

-- ===========================
-- COQ
-- ===========================
map("n", "<A-j>", "<cmd>CoqNext<CR>", { desc = "Next coq line", noremap = true, silent = true })
map("n", "<F-k>", "<cmd>CoqUndo<CR>", { desc = "Prev coq line", noremap = true, silent = true })
map("n", "<leader>lr", function()
	vim.cmd("LeanAbbreviationsReverseLookup")
end, { noremap = true, silent = true, desc = "Lean: Reverse Abbreviation Lookup" })
