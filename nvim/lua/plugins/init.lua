-- All plugins have lazy=true by default,to load a plugin on startup just lazy=false
-- List of all default plugins & their definitions
local overrides = {
	mason = {
		ensure_installed = {
			"lua-language-server",
			"stylua",
			"css-lsp",
			"html-lsp",
			"typescript-language-server",
			"deno",
			"prettier",
			"clangd",
			"pyright",
			"ruff",
			"latexindent",
			"rust-analyzer",
			"gopls",
			"jdtls",
			"kotlin-language-server",
			"clang-format",
			"coq-lsp",
			"tex-fmt",
			"shfmt",
			"texlab",
			"mbake",
		},
	},
}

local plugins = {
	"nvim-lua/plenary.nvim",
	{
		"NvChad/base46",
		branch = "v2.0",
		build = function()
			require("base46").load_all_highlights()
		end,
	},

	{
		"NvChad/ui",
		branch = "v2.0",
		lazy = false,
	},

	{
		"NvChad/nvterm",
		lazy = true,
		init = function()
			require("core.utils").load_mappings("nvterm")
		end,
		config = function(_, opts)
			require("base46.term")
			require("nvterm").setup(opts)
		end,
	},

	{
		"nvim-tree/nvim-web-devicons",
		opts = function()
			return { override = require("nvchad.icons.devicons") }
		end,
		config = function(_, opts)
			dofile(vim.g.base46_cache .. "devicons")
			require("nvim-web-devicons").setup(opts)
		end,
	},

	{
		"nvim-treesitter/nvim-treesitter",
		build = ":TSUpdate",
		opts = {
			ensure_installed = { "lua", "vim", "python", "go", "javascript", "typescript", "c", "cpp", "html", "css" },
			highlight = { enable = true },
			indent = { enable = true },
		},
	},

	{
		"lukas-reineke/indent-blankline.nvim",
		main = "ibl",
		---@module "ibl"
		---@type ibl.config
		opts = {
			indent = {
				char = "▏",
				highlight = "Indent",
			},
		},
		config = function(_, opts)
			require("nothing").ibl_setup() -- Optional built-in integration
			require("ibl").setup(opts)
		end,
	},
	-- git stuff
	{
		"kdheepak/lazygit.nvim",
		lazy = true,
		cmd = {
			"LazyGit",
			"LazyGitConfig",
			"LazyGitCurrentFile",
			"LazyGitFilter",
			"LazyGitFilterCurrentFile",
		},
		-- optional for floating window border decoration
		dependencies = {
			"nvim-lua/plenary.nvim",
		},
		-- setting the keybinding for LazyGit with 'keys' is recommended in
		-- order to load the plugin when the command is run for the first time
		keys = {
			{ "<leader>lg", "<cmd>LazyGit<cr>", desc = "LazyGit" },
		},
	},

	-- lsp stuff
	{
		"williamboman/mason.nvim",
		cmd = { "Mason", "MasonInstall", "MasonInstallAll", "MasonUpdate" },
		opts = function()
			return require("plugins.configs.mason")
		end,
		config = function(_, opts)
			dofile(vim.g.base46_cache .. "mason")
			require("mason").setup(opts)

			-- custom nvchad cmd to install all mason binaries listed
			vim.api.nvim_create_user_command("MasonInstallAll", function()
				vim.cmd("MasonInstall " .. table.concat(opts.ensure_installed, " "))
			end, {})

			vim.g.mason_binaries_list = opts.ensure_installed
		end,
	},
	-- load luasnips + cmp related in insert mode only
	{
		"hrsh7th/nvim-cmp",
		event = "InsertEnter",
		dependencies = {
			{
				-- snippet plugin
				"L3MON4D3/LuaSnip",
				dependencies = "rafamadriz/friendly-snippets",
				opts = { history = true, updateevents = "TextChanged,TextChangedI" },
				config = function(_, opts)
					require("plugins.configs.others").luasnip(opts)
				end,
			},

			-- autopairing of (){}[] etc
			{
				"windwp/nvim-autopairs",
				opts = {
					fast_wrap = {},
					disable_filetype = { "TelescopePrompt", "vim" },
				},
				config = function(_, opts)
					local npairs = require("nvim-autopairs")
					npairs.setup(opts)

					-- Автозакрытие $
					npairs.add_rules(require("nvim-autopairs.rules.endwise-lua"))

					-- setup cmp for autopairs
					local cmp_autopairs = require("nvim-autopairs.completion.cmp")
					require("cmp").event:on("confirm_done", cmp_autopairs.on_confirm_done())
				end,
			},

			-- cmp sources plugins
			{
				"saadparwaiz1/cmp_luasnip",
				"hrsh7th/cmp-nvim-lua",
				"hrsh7th/cmp-nvim-lsp",
				"hrsh7th/cmp-buffer",
				"hrsh7th/cmp-path",
			},
		},
		opts = function()
			return require("plugins.configs.cmp")
		end,
		config = function(_, opts)
			require("cmp").setup(opts)
		end,
	},

	{
		"numToStr/Comment.nvim",
		keys = {
			{ "gcc", mode = "n", desc = "Comment toggle current line" },
			{ "gc", mode = { "n", "o" }, desc = "Comment toggle linewise" },
			{ "gc", mode = "x", desc = "Comment toggle linewise (visual)" },
			{ "gbc", mode = "n", desc = "Comment toggle current block" },
			{ "gb", mode = { "n", "o" }, desc = "Comment toggle blockwise" },
			{ "gb", mode = "x", desc = "Comment toggle blockwise (visual)" },
		},
		init = function()
			require("core.utils").load_mappings("comment")
		end,
		config = function(_, opts)
			require("Comment").setup(opts)
		end,
	},

	-- file managing , picker etc
	{
		"nvim-tree/nvim-tree.lua",
		cmd = { "NvimTreeToggle", "NvimTreeFocus" },
		init = function()
			require("core.utils").load_mappings("nvimtree")
		end,
		opts = function()
			return require("plugins.configs.nvimtree")
		end,
		config = function(_, opts)
			dofile(vim.g.base46_cache .. "nvimtree")
			require("nvim-tree").setup(opts)
		end,
	},
	{
		"nvim-telescope/telescope.nvim",
		dependencies = {
			"nvim-treesitter/nvim-treesitter",
			{ "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
		},
		cmd = "Telescope",
		init = function()
			require("core.utils").load_mappings("telescope")
		end,
		opts = function()
			return require("plugins.configs.telescope")
		end,
		config = function(_, opts)
			dofile(vim.g.base46_cache .. "telescope")
			local telescope = require("telescope")
			telescope.setup(opts)

			-- load extensions
			for _, ext in ipairs(opts.extensions_list) do
				telescope.load_extension(ext)
			end
		end,
	},

	-- Only load whichkey after all the gui
	{
		"folke/which-key.nvim",
		keys = { "<leader>", "<c-r>", "<c-w>", '"', "'", "`", "c", "v", "g" },
		init = function()
			require("core.utils").load_mappings("whichkey")
		end,
		cmd = "WhichKey",
		config = function(_, opts)
			dofile(vim.g.base46_cache .. "whichkey")
			require("which-key").setup(opts)
		end,
	},
	{
		"akinsho/git-conflict.nvim",
		version = "*",
		config = function()
			require("git-conflict").setup({
				default_mappings = true,
				default_commands = true,
				disable_diagnostics = false,
				list_opener = "copen",
				highlights = {
					incoming = "DiffAdd",
					current = "DiffText",
				},
			})
		end,
	},

	{
		"neovim/nvim-lspconfig",
		init = function()
			require("core.utils").lazy_load("nvim-lspconfig")
		end,
		config = function()
			require("plugins.configs.lspconfig")
		end, -- Override to setup mason-lspconfig
	},

	-- override plugin configs
	{
		"williamboman/mason.nvim",
		opts = overrides.mason,
	},

	-- Install a plugin
	{
		"max397574/better-escape.nvim",
		event = "InsertEnter",
		config = function()
			require("better_escape").setup()
		end,
	},
	{
		"simrat39/rust-tools.nvim",
	},
	{
		"pocco81/auto-save.nvim",
		config = function()
			require("auto-save").setup({
				{
					enabled = true,
					execution_message = {
						message = function()
							return ("AutoSave: saved at " .. vim.fn.strftime("%H:%M:%S"))
						end,
						dim = 0.18,
						cleaning_interval = 1250,
					},
					trigger_events = { "InsertLeave", "TextChanged" },
					condition = function(buf)
						local fn = vim.fn
						local utils = require("auto-save.utils.data")

						if
							fn.getbufvar(buf, "&modifiable") == 1
							and utils.not_in(fn.getbufvar(buf, "&filetype"), {})
						then
							return true
						end
						return false
					end,
					write_all_buffers = false,
					debounce_delay = 135,
					callbacks = {
						enabling = nil,
						disabling = nil,
						before_asserting_save = nil,
						before_saving = nil,
						after_saving = nil,
					},
				},
			})
		end,
	},
	{
		"nvim-neo-tree/neo-tree.nvim",
		event = "VeryLazy",
		branch = "v3.x",
		dependencies = {
			"nvim-lua/plenary.nvim",
			"nvim-tree/nvim-web-devicons",
			"MunifTanjim/nui.nvim",
		},
		config = function()
			vim.fn.sign_define("DiagnosticSignError", { text = " ", texthl = "DiagnosticSignError" })
			vim.fn.sign_define("DiagnosticSignWarn", { text = " ", texthl = "DiagnosticSignWarn" })
			vim.fn.sign_define("DiagnosticSignInfo", { text = " ", texthl = "DiagnosticSignInfo" })
			vim.fn.sign_define("DiagnosticSignHint", { text = "󰌵", texthl = "DiagnosticSignHint" })

			require("neo-tree").setup({
				close_if_last_window = false,
				popup_border_style = "rounded",
				enable_git_status = true,
				enable_diagnostics = true,
				open_files_do_not_replace_types = { "terminal", "trouble", "qf" },
				sort_case_insensitive = false,
				default_component_configs = {
					directory = {
						highlight = "NeoTreeDirectoryName",
						icon = {
							highlight = "NeoTreeDirectoryIcon",
						},
					},

					container = {
						enable_character_fade = true,
					},
					indent = {
						indent_size = 2,
						padding = 1,
						with_markers = true,
						indent_marker = "│",
						last_indent_marker = "└",
						highlight = "NeoTreeIndentMarker",
						with_expanders = nil,
						expander_collapsed = "",
						expander_expanded = "",
						expander_highlight = "NeoTreeExpander",
					},
					icon = {
						folder_closed = "",
						folder_open = "",
						folder_empty = "󰜌",
						default = "*",
						highlight = "NeoTreeFileIcon",
					},
					modified = {
						symbol = "[+]",
						highlight = "NeoTreeModified",
					},
					name = {
						trailing_slash = false,
						use_git_status_colors = true,
						highlight = "NeoTreeFileName",
					},
					git_status = {
						symbols = {
							added = "",
							modified = "",
							deleted = "✖",
							renamed = "󰁕",
							untracked = " ",
							ignored = " ",
							unstaged = "󰄱 ",
							staged = " ",
							conflict = " ",
						},
					},
					file_size = {
						enabled = true,
						required_width = 64,
					},
					type = {
						enabled = true,
						required_width = 122,
					},
					last_modified = {
						enabled = true,
						required_width = 88,
					},
					created = {
						enabled = true,
						required_width = 110,
					},
					symlink_target = {
						enabled = false,
					},
				},
				commands = {},
				window = {
					position = "left",
					width = 40,
					mapping_options = {
						noremap = true,
						nowait = true,
					},
					mappings = {
						["<space>"] = {
							"toggle_node",
							nowait = false,
						},
						["<2-LeftMouse>"] = "open",
						["<cr>"] = "open",
						["<esc>"] = "cancel",
						["P"] = { "toggle_preview", config = { use_float = true, use_image_nvim = true } },
						["l"] = "focus_preview",
						["S"] = "open_split",
						["s"] = "open_vsplit",
						["t"] = "open_tabnew",
						["w"] = "open_with_window_picker",
						["C"] = "close_node",
						["z"] = "close_all_nodes",
						["a"] = {
							"add",
							config = {
								show_path = "none",
							},
						},
						["A"] = "add_directory",
						["d"] = "delete",
						["r"] = "rename",
						["y"] = "copy_to_clipboard",
						["x"] = "cut_to_clipboard",
						["p"] = "paste_from_clipboard",
						["c"] = "copy",
						["m"] = "move",
						["q"] = "close_window",
						["R"] = "refresh",
						["?"] = "show_help",
						["<"] = "prev_source",
						[">"] = "next_source",
						["i"] = "show_file_details",
					},
				},
				nesting_rules = {},
				filesystem = {
					filtered_items = {
						visible = false,
						hide_dotfiles = false,
						hide_gitignored = false,
						hide_hidden = false,
						hide_by_name = {},
					},
					follow_current_file = {
						enabled = false,
						leave_dirs_open = false,
					},
					group_empty_dirs = false,
					hijack_netrw_behavior = "open_default",
					use_libuv_file_watcher = false,
					window = {
						mappings = {
							["<bs>"] = "navigate_up",
							["."] = "set_root",
							["H"] = "toggle_hidden",
							["/"] = "fuzzy_finder",
							["D"] = "fuzzy_finder_directory",
							["#"] = "fuzzy_sorter",
							["f"] = "filter_on_submit",
							["<c-x>"] = "clear_filter",
							["[g"] = "prev_git_modified",
							["]g"] = "next_git_modified",
							["o"] = { "show_help", nowait = false, config = { title = "Order by", prefix_key = "o" } },
							["oc"] = { "order_by_created", nowait = false },
							["od"] = { "order_by_diagnostics", nowait = false },
							["og"] = { "order_by_git_status", nowait = false },
							["om"] = { "order_by_modified", nowait = false },
							["on"] = { "order_by_name", nowait = false },
							["os"] = { "order_by_size", nowait = false },
							["ot"] = { "order_by_type", nowait = false },
						},
						fuzzy_finder_mappings = {
							["<down>"] = "move_cursor_down",
							["<up>"] = "move_cursor_up",
						},
					},

					commands = {},
				},
				buffers = {
					follow_current_file = {
						enabled = true,
						leave_dirs_open = false,
					},
					group_empty_dirs = true,
					show_unloaded = true,
					window = {
						mappings = {
							["bd"] = "buffer_delete",
							["<bs>"] = "navigate_up",
							["."] = "set_root",
							["o"] = { "show_help", nowait = false, config = { title = "Order by", prefix_key = "o" } },
							["oc"] = { "order_by_created", nowait = false },
							["od"] = { "order_by_diagnostics", nowait = false },
							["om"] = { "order_by_modified", nowait = false },
							["on"] = { "order_by_name", nowait = false },
							["os"] = { "order_by_size", nowait = false },
							["ot"] = { "order_by_type", nowait = false },
						},
					},
				},
				git_status = {
					window = {
						position = "float",
						mappings = {
							["A"] = "git_add_all",
							["gu"] = "git_unstage_file",
							["ga"] = "git_add_file",
							["gr"] = "git_revert_file",
							["gc"] = "git_commit",
							["gp"] = "git_push",
							["gg"] = "git_commit_and_push",
							["o"] = { "show_help", nowait = false, config = { title = "Order by", prefix_key = "o" } },
							["oc"] = { "order_by_created", nowait = false },
							["od"] = { "order_by_diagnostics", nowait = false },
							["om"] = { "order_by_modified", nowait = false },
							["on"] = { "order_by_name", nowait = false },
							["os"] = { "order_by_size", nowait = false },
							["ot"] = { "order_by_type", nowait = false },
						},
					},
				},
			})

			vim.cmd([[nnoremap \ :Neotree reveal<cr>]])
			vim.cmd([[ inoremap <C-BS> <C-w> ]])
			vim.cmd([[highlight NeoTreeDirectoryName guifg='#B3B1AD']])
			vim.cmd([[highlight NeoTreeDirectoryIcon guifg='#B3B1AD']])
		end,
	},
	{
		"iamcco/markdown-preview.nvim",
		cmd = { "MarkdownPreviewToggle", "MarkdownPreview", "MarkdownPreviewStop" },
		build = "cd app && npm install",
		init = function()
			vim.g.mkdp_filetypes = { "markdown" }
		end,
		ft = { "markdown" },
	},
	{
		"lervag/vimtex",
		config = function()
			vim.g.vimtex_quickfix_enabled = 0
			vim.g.vimtex_compiler_method = "latexmk"
			vim.g.vimtex_compiler_latexmk = {
				aux_dir = vim.fn.expand("$HOME/latex/aux"),
				out_dir = vim.fn.expand("$HOME/latex/out"),
				build_dir = vim.fn.expand("$HOME/.cache/latex"),
				continuous = 1,
				callback = 1,
				executable = "latexmk",
				options = {
					"-pdf",
					"-interaction=nonstopmode",
					"-file-line-error",
					"-synctex=1",
				},
			}
			vim.g.vimtex_view_method = "zathura"
			vim.g.vimtex_compiler_progname = "nvr"
			vim.opt.conceallevel = 1
			vim.g.tex_conceal = "abdmg"
		end,
		ft = { "tex", "cls" },
	},
	{
		"Alchemmist/cyrillic.nvim",
		event = { "VeryLazy" },
		config = function()
			require("cyrillic").setup({
				no_cyrillic_abbrev = false,
			})
		end,
	},
	{
		"fatih/vim-go",
		ft = "go",
		config = function()
			vim.g.go_auto_type_info = 0
			vim.g.go_fmt_autosave = 0
			vim.g.go_fmt_fail_silently = 1
			vim.g.syntastic_auto_loc_list = 0
			vim.g.go_list_height = 0
			vim.g.go_statusline_duration = 10
			vim.g.go_statusline_info = 0
			vim.g.go_doc_keywordprg_enabled = 0
			vim.g.go_echo_command_info = 0
			vim.g.go_echo_go_info = 0
			vim.g.go_debug_windows = { "right" }
			vim.g.go_fmt_command = "gofmt"
			vim.g.go_auto_type_info = 1
		end,
	},
	{

		"williamboman/mason-lspconfig.nvim",
		dependencies = {
			"williamboman/mason.nvim",
			"neovim/nvim-lspconfig",
		},
		config = function() end,
	},
	{
		"whonore/Coqtail",
		ft = "coq",
		config = function()
			vim.cmd([[
            let g:coqtail_enable = 1
        ]])
		end,
	},

	-- {
	-- 	"mfussenegger/nvim-jdtls",
	-- 	lazy = true,
	-- 	ft = {
	-- 		"java",
	-- 	},
	-- 	config = function()
	-- 		require("plugins.configs.java")
	-- 	end,
	-- },
	-- {
	-- 	"kevinhwang91/nvim-ufo",
	-- 	dependencies = { "kevinhwang91/promise-async" },
	-- 	event = "BufReadPost", -- Загружать плагин при открытии файла
	-- 	config = function()
	-- 		vim.o.foldcolumn = "0" -- Колонка сворачивания
	-- 		vim.o.foldlevel = 99 -- Развернуть все блоки при старте
	-- 		vim.o.foldlevelstart = 99
	-- 		vim.o.foldenable = true
	--
	-- 		-- Устанавливаем методы сворачивания
	-- 		vim.o.foldmethod = "expr"
	-- 		vim.o.foldexpr = "v:lua.require'ufo'.foldexpr()"
	--
	-- 		-- Настройка провайдеров (LSP, Tree-sitter или indent)
	-- 		require("ufo").setup({
	-- 			provider_selector = function(_, _, _)
	-- 				return { "lsp",  "treesitter" }
	-- 			end,
	-- 		})
	-- 	end,
	-- },
	--
	{
		"stevearc/conform.nvim",
		config = function()
			require("conform").setup({
				formatters = {
					ruff = {
						command = "ruff",
						args = { "format", "--stdin-filename", "$FILENAME", "-" },
						stdin = true,
					},
					mbake = {
						command = "mbake",
						args = { "format", "$FILENAME" },
						stdin = false,
					},
				},
				formatters_by_ft = {
					lua = { "stylua" },
					python = { "ruff" },
					javascript = { "prettier" },
					typescript = { "prettier" },
					javascriptreact = { "prettier" },
					typescriptreact = { "prettier" },
					json = { "prettier" },
					yaml = { "prettier" },
					html = { "prettier" },
					css = { "prettier" },
					scss = { "prettier" },
					sh = { "shfmt" },
					rust = { "rustfmt" },
					go = { "gofmt" },
					toml = { "taplo" },
					tex = { "tex-fmt" },
					java = { "clang-format" },
					make = { "mbake" },
					markdown = { "prettier" },
				},
			})
			vim.api.nvim_create_autocmd("BufReadPost", {
				pattern = "*",
				callback = function()
					require("conform").format({ async = true })
				end,
			})
		end,
	},
	{
		"debugloop/telescope-undo.nvim",
		dependencies = {
			{
				"nvim-telescope/telescope.nvim",
				dependencies = { "nvim-lua/plenary.nvim" },
			},
		},
		keys = {
			{
				"<leader>u",
				"<cmd>Telescope undo<cr>",
				desc = "undo history",
			},
		},
		opts = {
			extensions = {
				undo = {},
			},
		},
		config = function(_, opts)
			require("telescope").setup(opts)
			require("telescope").load_extension("undo")
		end,
	},
	{
		"kevinhwang91/nvim-ufo",
		dependencies = {
			"kevinhwang91/promise-async",
			"nvim-treesitter/nvim-treesitter",
		},
		event = "BufReadPost",
		config = function()
			vim.o.foldcolumn = "0"
			vim.o.foldlevel = 99
			vim.o.foldlevelstart = 99
			vim.o.foldenable = true

			require("ufo").setup({
				provider_selector = function(_, _, _)
					return { "treesitter", "indent" }
				end,
			})

			vim.keymap.set("n", "zR", require("ufo").openAllFolds)
			vim.keymap.set("n", "zM", require("ufo").closeAllFolds)
			vim.keymap.set("n", "<leader>h", function()
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
				end
			end, { desc = "Toggle fold under cursor" })
		end,
	},
	{
		"alchemmist/nothing.nvim",
		version = "*",
		dependencies = { "nvim-treesitter/nvim-treesitter" },
		config = function()
			vim.cmd("colorscheme nothing")
		end,
	},
	{
		"norcalli/nvim-colorizer.lua",
		config = function()
			require("colorizer").setup()
		end,
	},
	{
		"folke/flash.nvim",
		event = "VeryLazy",
		opts = {},
		keys = {
			{
				"s",
				mode = { "n", "x", "o" },
				function()
					require("flash").jump()
				end,
				desc = "Flash",
			},
			{
				"S",
				mode = { "n", "x", "o" },
				function()
					require("flash").treesitter()
				end,
				desc = "Flash Treesitter",
			},
			{
				"r",
				mode = "o",
				function()
					require("flash").remote()
				end,
				desc = "Remote Flash",
			},
			{
				"R",
				mode = { "o", "x" },
				function()
					require("flash").treesitter_search()
				end,
				desc = "Treesitter Search",
			},
			{
				"<c-s>",
				mode = { "c" },
				function()
					require("flash").toggle()
				end,
				desc = "Toggle Flash Search",
			},
		},
	},
}

local config = require("core.utils").load_config()

require("lazy").setup(plugins, config.lazy_nvim)
