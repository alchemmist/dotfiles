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
