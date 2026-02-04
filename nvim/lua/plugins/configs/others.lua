local M = {}

M.luasnip = function(opts)
	require("luasnip").config.set_config(opts)

	require("luasnip.loaders.from_vscode").lazy_load()
	require("luasnip.loaders.from_vscode").lazy_load({ paths = vim.g.vscode_snippets_path or "" })

	require("luasnip.loaders.from_snipmate").load()
	require("luasnip.loaders.from_snipmate").lazy_load({ paths = vim.g.snipmate_snippets_path or "" })

	require("luasnip.loaders.from_lua").load()
	require("luasnip.loaders.from_lua").lazy_load({ paths = vim.g.lua_snippets_path or "" })

	vim.api.nvim_create_autocmd("InsertLeave", {
		callback = function()
			if
				require("luasnip").session.current_nodes[vim.api.nvim_get_current_buf()]
				and not require("luasnip").session.jump_active
			then
				require("luasnip").unlink_current()
			end
		end,
	})
end

M.autopairs = function(opts)
	local npairs = require("nvim-autopairs")
	npairs.setup(opts)
	npairs.add_rules(require("nvim-autopairs.rules.endwise-lua"))
end

M.comment = function(opts)
	require("Comment").setup(opts)
end

M.vim_go = function()
	vim.g.go_auto_type_info = 1
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
end

M.vimtex = function()
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
end

M.ufo = function()
	vim.o.foldcolumn = "0"
	vim.o.foldlevel = 99
	vim.o.foldlevelstart = 99
	vim.o.foldenable = true

	require("ufo").setup({
		provider_selector = function(_, _, _)
			return { "treesitter", "indent" }
		end,
	})
end

return M
