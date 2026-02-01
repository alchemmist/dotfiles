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
			"taplo",
		},
	},
}

local plugins = {
	"nvim-lua/plenary.nvim",
	{
		"nvim-tree/nvim-web-devicons",
		opts = function() end,
		config = function(_, opts)
			require("nvim-web-devicons").setup(opts)
		end,
	},

	{
		"nvim-treesitter/nvim-treesitter",
		build = ":TSUpdate",
		config = function(_, opts)
			require("plugins.configs.treesitter")
		end,
	},

	{
		"lukas-reineke/indent-blankline.nvim",
		main = "ibl",
		opts = {
			indent = { char = "▏" },
			enabled = false,
			scope = {
				enabled = false,
				show_start = false,
				show_end = false,
				highlight = nil,
			},
		},
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
			require("mason").setup(opts)

			-- custom nvim cmd to install all mason binaries listed
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
		init = function() end,
		config = function(_, opts)
			require("Comment").setup(opts)
		end,
	},

	-- file managing , picker etc
	{
		"nvim-telescope/telescope.nvim",
		dependencies = {
			"nvim-treesitter/nvim-treesitter",
			{ "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
		},
		cmd = "Telescope",
		init = function() end,
		opts = function()
			return require("plugins.configs.telescope")
		end,
		config = function(_, opts)
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
		init = function() end,
		cmd = "WhichKey",
		config = function(_, opts)
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
	{
		"simrat39/rust-tools.nvim",
		ft = "rust",
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
		"stevearc/oil.nvim",
		lazy = false,
		dependencies = { "nvim-tree/nvim-web-devicons" },
		opts = {
			buf_options = {
				buflisted = false,
				bufhidden = "hide",
			},
			keymaps = {
				["g?"] = "actions.show_help",
				["<CR>"] = "actions.select",
				["<C-s>"] = { "actions.select", opts = { vertical = true } },
				["<C-h>"] = { "actions.select", opts = { horizontal = true } },
				["<C-t>"] = { "actions.select", opts = { tab = true } },
				["<C-p>"] = "actions.preview",
				["<Esc>"] = "actions.close",
				["<C-r>"] = "actions.refresh",
				["-"] = { "actions.parent", mode = "n" },
				["_"] = { "actions.open_cwd", mode = "n" },
				[">"] = { "actions.cd", mode = "n" },
				["g~"] = { "actions.cd", opts = { scope = "tab" }, mode = "n" },
				["gs"] = { "actions.change_sort", mode = "n" },
				["gx"] = "actions.open_external",
				["g."] = { "actions.toggle_hidden", mode = "n" },
				["g\\"] = { "actions.toggle_trash", mode = "n" },
			},
			view_options = {
				show_hidden = true,
				natural_order = "fast",
				case_insensitive = false,
				sort = { { "type", "asc" }, { "name", "asc" } },
			},
			delete_to_trash = false,
			skip_confirm_for_simple_edits = false,
			prompt_save_on_select_new_entry = true,
		},
	},
	{
		"iamcco/markdown-preview.nvim",
		cmd = { "MarkdownPreviewToggle", "MarkdownPreview", "MarkdownPreviewStop" },
		build = "cd app && npm install",
		init = function()
			vim.g.mkdp_filetypes = { "markdown" }
		end,
		ft = { "markdown" },
		config = function()
			vim.g.mkdp_browserfunc = "OpenMarkdownPreview"
			vim.cmd([[
                function OpenMarkdownPreview(url)
                  execute "silent ! google-chrome-stable --new-window --app=" . a:url
                endfunction
              ]])
		end,
	},
	{
		"lervag/vimtex",
		config = function()
			vim.g.vimtex_quickfix_enabled = 0
			vim.g.vimtex_quickfix_mode = 0

			vim.g.vimtex_compiler_method = "latexmk"
			vim.g.vimtex_compiler_progname = "nvr"

			vim.g.vimtex_compiler_latexmk = {
				aux_dir = vim.fn.expand("$HOME/latex/aux"),
				out_dir = vim.fn.expand("$HOME/latex/out"),
				build_dir = vim.fn.expand("$HOME/.cache/latex"),
				continuous = 1,
				callback = 0,
				executable = "latexmk",
				options = {
					"-pdf",
					"-interaction=nonstopmode",
					"-file-line-error",
					"-synctex=1",
					-- "-verbose",
				},
			}

			vim.g.vimtex_compiler_callback_hooks = {}
			vim.g.vimtex_view_method = "zathura"
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
					clang_format = {
						command = "clang-format",
						args = {
							"--style={BasedOnStyle: LLVM, IndentWidth: 4, AllowShortFunctionsOnASingleLine: None, MaxEmptyLinesToKeep: 1}",
							"$FILENAME",
						},
						stdin = true,
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
					zsh = { "shfmt" },
					rust = { "rustfmt" },
					go = { "gofmt" },
					toml = { "taplo" },
					tex = { "tex-fmt" },
					java = { "clang-format" },
					c = { "clang_format" },
					cpp = { "clang_format" },
					make = { "mbake" },
					markdown = { "prettier" },
					vue = { "prettier" },
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
		"moss-theme/moss.nvim",
		version = "*",
		dependencies = { "nvim-treesitter/nvim-treesitter" },
		config = function()
			vim.cmd("colorscheme moss")
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

require("lazy").setup(plugins)
