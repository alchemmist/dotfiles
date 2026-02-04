local plugin = "nvim-lspconfig"

vim.api.nvim_create_autocmd({ "BufRead", "BufWinEnter", "BufNewFile" }, {
	group = vim.api.nvim_create_augroup("BeLazyOnFileOpen_" .. plugin, {}),
	callback = function()
		local file = vim.fn.expand("%")
		local condition = file ~= "NvimTree_1" and file ~= "[lazy]" and file ~= ""

		if condition then
			vim.api.nvim_del_augroup_by_name("BeLazyOnFileOpen_" .. plugin)

			require("lazy").load({ plugins = plugin })

			vim.cmd("silent! do FileType")
		end
	end,
})

local M = {}

local servers =
	{ "html", "cssls", "ts_ls", "clangd", "pyright", "lua_ls", "rust_analyzer", "eslint", "gopls", "sqlls", "texlab" }

M.on_attach = function(client, bufnr)
	client.server_capabilities.documentFormattingProvider = false
	client.server_capabilities.documentRangeFormattingProvider = false

	client.server_capabilities.semanticTokensProvider = nil
end

M.capabilities = require("blink.cmp").get_lsp_capabilities()

vim.lsp.config("*", {
	on_attach = M.on_attach,
	capabilities = M.capabilities,
})

vim.diagnostic.config({
	virtual_text = false,
	signs = false,
	update_in_insert = false,
	underline = true,
	severity_sort = true,
	open_loclist = true,
})

vim.lsp.config("lua_ls", {
	settings = {
		Lua = {
			diagnostics = {
				globals = { "vim" },
			},
			workspace = {
				library = {
					[vim.fn.expand("$VIMRUNTIME/lua")] = true,
					[vim.fn.expand("$VIMRUNTIME/lua/vim/lsp")] = true,
					[vim.fn.stdpath("data") .. "/lazy/lazy.nvim/lua/lazy"] = true,
				},
				maxPreload = 100000,
				preloadFileSize = 10000,
			},
		},
	},
})

vim.lsp.config("gopls", {
	on_attach = function(client, bufnr)
		M.on_attach(client, bufnr) -- при необходимости вызовите базовую
		vim.o.splitright = false
		vim.o.splitbelow = false
	end,
})
vim.lsp.config("pyright", {
	settings = {
		python = {
			analysis = {
				typeCheckingMode = "on",
				autoSearchPaths = true,
				useLibraryCodeForTypes = true,
				diagnosticMode = "workspace",
			},
		},
	},
})

vim.lsp.config("texlab", {
	settings = {
		texlab = {
			build = {
				executable = "latexmk",
				args = { "-pdf", "-interaction=nonstopmode", "-synctex=1", "%f" },
				onSave = true,
				forwardSearchAfter = false,
			},
			chktex = {
				onEdit = true,
				onOpenAndSave = true,
			},
			diagnostics = {
				delay = 300,
			},
		},
	},
	filetypes = { "tex", "cls" },
})

for _, server_name in ipairs(servers) do
	vim.lsp.enable(server_name)
end

return M
