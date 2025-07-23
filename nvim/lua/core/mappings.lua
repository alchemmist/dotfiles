-- n, v, i, t = mode names

-- local latex_mappings = require("custom.latex")

local M = {}

M.general = {
	i = {
		["<C-b>"] = { "<ESC>^i", "Beginning of line" },
		["<C-e>"] = { "<End>", "End of line" },

		["<C-.>"] = { "\\Rightarrow", "Latex right arrow" },
		["<C-,>"] = { "\\Leftarrow", "Latex left arrow" },

		-- navigate within insert mode
		-- ["<C-h>"] = { "<Left>", "Move left" },
		-- ["<C-l>"] = { "<Right>", "Move right" },
		-- ["<C-j>"] = { "<Down>", "Move down" },
		-- ["<C-k>"] = { "<Up>", "Move up" },

		-- my
		["<A-BS>"] = { "<ESC>dbi<DEL>", "Delete previus word" },
		-- ["<C-j>"] = {
		--         function()
		--             require("cmp").mapping.complete()
		--         end,
		--         "Enable complititon"
		--     },
	},

	n = {
		["<Esc>"] = { "<cmd> noh <CR>", "Clear highlights" },
		["<C-BS>"] = { "<ESC>dbi", "Delete previus word" },
		-- switch between windows
		["<C-h>"] = { "<C-w>h", "Window left" },
		["<C-l>"] = { "<C-w>l", "Window right" },
		["<C-j>"] = { "<C-w>j", "Window down" },
		["<C-k>"] = { "<C-w>k", "Window up" },

		-- run script
		["<leader>rp"] = { "<cmd> !python % <CR>", "Fust run python file" },
		["<leader>rr"] = { "<cmd> RustRun <CR>", "Fust run rust file" },
		["<leader>rl"] = { "<cmd> !lua % <CR>", "Fust run lua file" },
		["<leader>rg"] = { "<cmd> !go run % <CR>", "Fust run go file" },

		-- Copy all
		["<C-c>"] = { "<cmd> %y+ <CR>", "Copy whole file" },

		-- line numbers
		["<leader>n"] = { "<cmd> set nu! <CR>", "Toggle line number" },
		["<leader>rn"] = { "<cmd> set rnu! <CR>", "Toggle relative number" },

		-- Allow moving the cursor through wrapped lines with j, k, <Up> and <Down>
		-- http://www.reddit.com/r/vim/comments/2k4cbr/problem_with_gj_and_gk/
		-- empty mode is same as using <cmd> :map
		-- also don't use g[j|k] when in operator pending mode, so it doesn't alter d, y or c behaviour
		["j"] = { 'v:count || mode(1)[0:1] == "no" ? "j" : "gj"', "Move down", opts = { expr = true } },
		["k"] = { 'v:count || mode(1)[0:1] == "no" ? "k" : "gk"', "Move up", opts = { expr = true } },
		["<Up>"] = { 'v:count || mode(1)[0:1] == "no" ? "k" : "gk"', "Move up", opts = { expr = true } },
		["<Down>"] = { 'v:count || mode(1)[0:1] == "no" ? "j" : "gj"', "Move down", opts = { expr = true } },

		["<leader>z"] = { "<cmd>bufdo bd<CR><cmd>Nvdash<CR>", "Dashboard" },
		["<leader>l"] = { "<cmd>LazyGit<CR>", "LazyGit" },
		["<leader>ch"] = { "<cmd> NvCheatsheet <CR>", "Mapping cheatsheet" },

		["<leader>fm"] = {
			function()
				require("conform").format({ async = true, lsp_fallback = true })
				-- vim.lsp.buf.format({ async = true })
			end,
			"Format code with Conform",
		},
		["<leader>b"] = { "<cmd>VimtexCompile<CR>", "Build latex doc" },
		["<leader>m"] = { "<cmd>MarkdownPreviewToggle<CR>", "Preview markdown document in Gihub style" },
		["<leader>v"] = { "<cmd>VimtexView<CR>", "View place in latex doc" },
		["<leader>w"] = { "<cmd>w<CR>", "Save" },
		["<A-|>"] = { "<cmd>:vsplit<CR>", "Vertical split" },
		["<M-_"] = { "<cmd>:split<CR>", "Horisontal split", opts = { noremap = true, silent = true } },
		["<TAB>"] = { "<cmd>:tabNext<CR>", "Go to next tab" },
		["."] = { "." },
		["<S-E>"] = {
			function()
				vim.diagnostic.open_float({ border = "rounded" })
			end,
			"Show LSP message",
			opts = { silent = true, noremap = true },
		},

		["<leader>dc"] = { ":%s/\\v\\s*(#|\\/\\/|--|;).*$//g<CR>", "Clearn all comments" },
	},

	t = {
		["<C-x>"] = { vim.api.nvim_replace_termcodes("<C-\\><C-N>", true, true, true), "Escape terminal mode" },
	},

	v = {
		["<Up>"] = { 'v:count || mode(1)[0:1] == "no" ? "k" : "gk"', "Move up", opts = { expr = true } },
		["<Down>"] = { 'v:count || mode(1)[0:1] == "no" ? "j" : "gj"', "Move down", opts = { expr = true } },
		["<"] = { "<gv", "Indent line" },
		[">"] = { ">gv", "Indent line" },
		-- ["<C-b>"] = {
		-- 	latex_mappings.wrap_text_in_textbf,
		-- 	"Wrap text in \\textbf{}",
		-- 	opts = {
		-- 		callback = function()
		-- 			if vim.bo.filetype == "tex" then
		-- 				latex_mappings.wrap_text_in_textbf()
		-- 			end
		-- 		end,
		-- 	},
		-- },
	},

	x = {
		["j"] = { 'v:count || mode(1)[0:1] == "no" ? "j" : "gj"', "Move down", opts = { expr = true } },
		["k"] = { 'v:count || mode(1)[0:1] == "no" ? "k" : "gk"', "Move up", opts = { expr = true } },
		-- Don't copy the replaced text after pasting in visual mode
		-- https://vim.fandom.com/wiki/Replace_a_word_with_yanked_text#Alternative_mapping_for_paste
		["p"] = { 'p:let @+=@0<CR>:let @"=@0<CR>', "Dont copy replaced text", opts = { silent = true } },
	},
}

M.tabufline = {
	plugin = true,

	n = {
		-- cycle through buffers
		["<S-l>"] = {
			function()
				require("nvchad.tabufline").tabuflineNext()
			end,
			"Goto next buffer",
		},

		["<S-h>"] = {
			function()
				require("nvchad.tabufline").tabuflinePrev()
			end,
			"Goto prev buffer",
		},

		-- close buffer + hide terminal buffer
		["<leader>x"] = {
			function()
				require("nvchad.tabufline").close_buffer()
			end,
			"Close buffer",
		},
		["<leader>ч"] = {
			function()
				require("nvchad.tabufline").close_buffer()
			end,
			"Close buffer",
		},
	},
}

M.comment = {
	plugin = true,

	-- toggle comment in both modes
	n = {
		["<leader>/"] = {
			function()
				require("Comment.api").toggle.linewise.current()
			end,
			"Toggle comment",
		},
	},

	v = {
		["<leader>/"] = {
			"<ESC><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<CR>",
			"Toggle comment",
		},
	},
}

M.lspconfig = {
	plugin = true,

	-- See `<cmd> :help vim.lsp.*` for documentation on any of the below functions

	n = {

		-- Go to definition
		["gd"] = {
			function()
				vim.lsp.buf.definition()
			end,
			"LSP definition",
		},

		-- Hover documentation
		-- ["K"] = {
		-- 	function()
		-- 		vim.lsp.buf.hover({border = "rounded"})
		-- 	end,
		-- 	"LSP hover",
		-- },

		-- Go to implementation
		["gi"] = {
			function()
				vim.lsp.buf.implementation()
			end,
			"LSP implementation",
		},

		-- Type definition
		["<leader>D"] = {
			function()
				vim.lsp.buf.type_definition()
			end,
			"LSP type definition",
		},

		-- Rename symbol
		["<leader>ra"] = {
			function()
				require("nvchad.renamer").open()
			end,
			"LSP rename",
		},

		-- Code action
		["<leader>ca"] = {
			function()
				vim.lsp.buf.code_action()
			end,
			"LSP code action",
		},

		-- Find references
		["gr"] = {
			function()
				vim.lsp.buf.references()
			end,
			"LSP references",
		},

		-- Show floating diagnostic
		["E"] = {
			function()
				vim.diagnostic.open_float({ border = "rounded" })
			end,
			"Floating diagnostic",
		},

		-- Go to previous diagnostic
		["[d"] = {
			function()
				vim.diagnostic.goto_prev({ float = { border = "rounded" } })
			end,
			"Goto previous diagnostic",
		},

		-- Go to next diagnostic
		["]d"] = {
			function()
				vim.diagnostic.goto_next({ float = { border = "rounded" } })
			end,
			"Goto next diagnostic",
		},

		-- Set diagnostic location list
		["<leader>q"] = {
			function()
				vim.diagnostic.setloclist()
			end,
			"Diagnostic setloclist",
		},

		-- Add workspace folder
		["<leader>wa"] = {
			function()
				vim.lsp.buf.add_workspace_folder()
			end,
			"Add workspace folder",
		},

		-- Remove workspace folder
		["<leader>wr"] = {
			function()
				vim.lsp.buf.remove_workspace_folder()
			end,
			"Remove workspace folder",
		},

		-- List workspace folders
		["<leader>wl"] = {
			function()
				print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
			end,
			"List workspace folders",
		},

		-- Extract variable
		["<leader>ev"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.extract.variable",
				})
			end,
			"Extract variable",
		},

		-- Extract constant
		["<leader>ec"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.extract.constant",
				})
			end,
			"Extract constant",
		},

		-- Extract method
		["<leader>em"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.extract.method",
				})
			end,
			"Extract method",
		},

		-- Generate constructor
		["<leader>gc"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.generate.constructor",
				})
			end,
			"Generate constructor",
		},

		-- Generate toString method
		["<leader>gt"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.generate.toString",
				})
			end,
			"Generate toString method",
		},

		-- Generate hashCode and equals methods
		["<leader>ge"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.generate.hashCodeAndEquals",
				})
			end,
			"Generate hashCode and equals methods",
		},

		-- Generate delegate methods
		["<leader>gd"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.generate.delegate",
				})
			end,
			"Generate delegate methods",
		},

		-- Move method or class
		["<leader>gm"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.move.methodOrClass",
				})
			end,
			"Move method or class",
		},

		-- Refactor method signature
		["<leader>rf"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.refactor.signature",
				})
			end,
			"Refactor method signature",
		},

		-- Display bytecode with javap
		["<leader>jp"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.javap",
				})
			end,
			"Display bytecode with javap",
		},

		-- Show memory usage with jol
		["<leader>jl"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.jol",
				})
			end,
			"Show memory usage with jol",
		},

		-- Open JShell
		["<leader>js"] = {
			function()
				vim.lsp.buf.execute_command({
					command = "java.jshell",
				})
			end,
			"Open JShell",
		},

		-- Generate tests
		["<leader>gt"] = {
			function()
				require("jdtls.tests").generate()
			end,
			"Generate tests",
		},

		-- Go to test subject
		["<leader>gtg"] = {
			function()
				require("jdtls.tests").goto_subjects()
			end,
			"Go to test subject",
		},

		---------------------------------------------------

		["gd"] = {
			function()
				vim.lsp.buf.definition()
			end,
			"LSP definition",
		},

		-- ["K"] = {
		-- 	function()
		-- 		vim.lsp.buf.hover({ border = "rounded" })
		-- 	end,
		-- 	"LSP hover",
		-- },

		["gi"] = {
			function()
				vim.lsp.buf.implementation()
			end,
			"LSP implementation",
		},

		["<leader>D"] = {
			function()
				vim.lsp.buf.type_definition()
			end,
			"LSP definition type",
		},

		["<leader>ra"] = {
			function()
				require("nvchad.renamer").open()
			end,
			"LSP rename",
		},

		["<leader>ca"] = {
			function()
				vim.lsp.buf.code_action()
			end,
			"LSP code action",
		},

		["gr"] = {
			function()
				vim.lsp.buf.references()
			end,
			"LSP references",
		},

		["E"] = {
			function()
				vim.diagnostic.open_float({ border = "rounded" })
			end,
			"Floating diagnostic",
		},

		["[d"] = {
			function()
				vim.diagnostic.goto_prev({ float = { border = "rounded" } })
			end,
			"Goto prev",
		},

		["]d"] = {
			function()
				vim.diagnostic.goto_next({ float = { border = "rounded" } })
			end,
			"Goto next",
		},

		["<leader>q"] = {
			function()
				vim.diagnostic.setloclist()
			end,
			"Diagnostic setloclist",
		},

		["<leader>wa"] = {
			function()
				vim.lsp.buf.add_workspace_folder()
			end,
			"Add workspace folder",
		},

		["<leader>wr"] = {
			function()
				vim.lsp.buf.remove_workspace_folder()
			end,
			"Remove workspace folder",
		},

		["<leader>wl"] = {
			function()
				print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
			end,
			"List workspace folders",
		},
		["<leader>rn"] = {
			function()
				vim.lsp.buf.rename()
			end,
			"LSP rename",
		},

		["<leader>ft"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.test.run" })
			end,
			"Run Java tests",
		},

		-- Организация импортов
		["<leader>oi"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.organize.imports" })
			end,
			"Organize imports",
		},

		-- Извлечение локальной переменной
		["<leader>ev"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.extract.variable" })
			end,
			"Extract variable",
		},

		-- Извлечение локальной переменной и замена всех вхождений
		["<leader>eva"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.extract.variable.all" })
			end,
			"Extract variable (all)",
		},

		-- Извлечение константы
		["<leader>ec"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.extract.constant" })
			end,
			"Extract constant",
		},

		-- Извлечение метода
		["<leader>em"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.extract.method" })
			end,
			"Extract method",
		},

		-- Открытие содержимого файла класса
		["<leader>cl"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.class.contents" })
			end,
			"Class contents",
		},

		-- Расширенные действия кода
		["<leader>ea"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.code.actions" })
			end,
			"Code actions",
		},

		-- Генерация конструктора
		["<leader>gc"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.generate.constructor" })
			end,
			"Generate constructor",
		},

		-- Генерация toString
		["<leader>gT"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.generate.toString" })
			end,
			"Generate toString",
		},

		-- Генерация hashCode и equals
		["<leader>gh"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.generate.hashcode_equals" })
			end,
			"Generate hashCode and equals",
		},

		-- Генерация методов делегата
		["<leader>gd"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.generate.delegate.methods" })
			end,
			"Generate delegate methods",
		},

		-- Перемещение пакета, метода или типа
		["<leader>mp"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.move.package.method.type" })
			end,
			"Move package, method or type",
		},

		-- Рефакторинг подписи
		["<leader>rs"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.refactor.signature" })
			end,
			"Refactor signature",
		},

		-- Команда javap для отображения байт-кода
		["<leader>jp"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.javap" })
			end,
			"Display bytecode (javap)",
		},

		-- Команда jol для отображения использования памяти
		["<leader>jl"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.jol" })
			end,
			"Display memory usage (jol)",
		},

		-- Открытие jshell
		["<leader>js"] = {
			function()
				vim.lsp.buf.execute_command({ command = "java.jshell" })
			end,
			"Open jshell",
		},

		-- Поддержка отладчика через nvim-dap
		["<leader>db"] = {
			function()
				require("dap").continue()
			end,
			"Start debugger",
		},

		-- Перейти к тестам или предметам через jdtls
		["<leader>ts"] = {
			function()
				require("jdtls.tests").goto_subjects()
			end,
			"Go to tests/subjects",
		},
	},

	v = {
		["<leader>ca"] = {
			function()
				vim.lsp.buf.code_action()
			end,
			"LSP code action",
		},
	},
	i = {
		["<C-l>"] = {
			function()
				vim.lsp.buf.signature_help()
			end,
			"LSP signature help",
		},
	},
}

M.nvimtree = {
	plugin = true,

	n = {
		-- toggle
		-- ["<C-n>"] = { "<cmd> NvimTreeToggle <CR>", "Toggle nvimtree" },

		-- focus
		["<leader>e"] = { "<cmd> Neotree float<CR>", "Focus nvimtree" },
		["<leader>у"] = { "<cmd> Neotree float<CR>", "Focus nvimtree" },
	},
}

M.telescope = {
	plugin = true,

	n = {
		-- find
		["<leader>ff"] = { "<cmd>Telescope find_files <CR>", "Find files" },
		["<leader>fa"] = { "<cmd>Telescope find_files follow=true no_ignore=true hidden=true <CR>", "Find all" },
		["<leader>fw"] = { "<cmd>Telescope live_grep <CR>", "Live grep" },
		["<leader>fb"] = { "<cmd>Telescope buffers <CR>", "Find buffers" },
		["<leader>fh"] = { "<cmd>Telescope help_tags <CR>", "Help page" },
		["<leader>fo"] = { "<cmd>Telescope oldfiles <CR>", "Find oldfiles" },
		["<leader>fz"] = { "<cmd>Telescope current_buffer_fuzzy_find <CR>", "Find in current buffer" },

		-- git
		["<leader>cm"] = { "<cmd> Telescope git_commits <CR>", "Git commits" },
		["<leader>gt"] = { "<cmd> Telescope git_status <CR>", "Git status" },

		-- pick a hidden term
		["<leader>pt"] = { "<cmd> Telescope terms <CR>", "Pick hidden term" },

		-- theme switcher
		["<leader>th"] = { "<cmd> Telescope themes <CR>", "Nvchad themes" },

		["<leader>ma"] = { "<cmd> Telescope marks <CR>", "telescope bookmarks" },
	},
}

M.nvterm = {
	plugin = true,

	t = {
		-- toggle in terminal mode
		["<A-i>"] = {
			function()
				require("nvterm.terminal").toggle("float")
			end,
			"Toggle floating term",
		},

		["<A-h>"] = {
			function()
				require("nvterm.terminal").toggle("horizontal")
			end,
			"Toggle horizontal term",
		},

		["<A-v>"] = {
			function()
				require("nvterm.terminal").toggle("vertical")
			end,
			"Toggle vertical term",
		},
	},

	n = {
		-- toggle in normal mode
		["<A-f>"] = {
			function()
				require("nvterm.terminal").toggle("float")
			end,
			"Toggle floating term",
		},

		["<A-h>"] = {
			function()
				require("nvterm.terminal").toggle("horizontal")
			end,
			"Toggle horizontal term",
		},

		["<A-v>"] = {
			function()
				require("nvterm.terminal").toggle("vertical")
			end,
			"Toggle vertical term",
		},
	},
}

M.whichkey = {
	plugin = true,

	n = {
		["<leader>wK"] = {
			function()
				vim.cmd("WhichKey")
			end,
			"Which-key all keymaps",
		},
		["<leader>wk"] = {
			function()
				local input = vim.fn.input("WhichKey: ")
				vim.cmd("WhichKey " .. input)
			end,
			"Which-key query lookup",
		},
	},
}

M.blankline = {
	plugin = true,

	n = {
		["<leader>cc"] = {
			function()
				local ok, start = require("indent_blankline.utils").get_current_context(
					vim.g.indent_blankline_context_patterns,
					vim.g.indent_blankline_use_treesitter_scope
				)

				if ok then
					vim.api.nvim_win_set_cursor(vim.api.nvim_get_current_win(), { start, 0 })
					vim.cmd([[normal! _]])
				end
			end,

			"Jump to current context",
		},
	},
}

M.coq = {
	plugin = true,

	n = {
		["<A-j>"] = { "<cmd> CoqNext <CR>", "Next coq line", opts = { noremap = true, silent = true } },
		["<F-k>"] = { "<cmd> CoqUndo <CR>", "Prev coq line", opts = { noremap = true, silent = true } },
	},
}

return M
