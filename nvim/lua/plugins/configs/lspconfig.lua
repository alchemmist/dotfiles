dofile(vim.g.base46_cache .. "lsp")
require("nvchad.lsp")

local M = {}

local servers = { "html", "cssls", "ts_ls", "clangd", "pyright", "lua_ls", "rust_analyzer", "eslint", "gopls", "sqlls" }

local utils = require("core.utils")

local cmp = require("cmp")

-- Устаревший импорт больше не нужен
-- local lspconfig = require("lspconfig")

M.on_attach = function(client, bufnr)
    client.server_capabilities.documentFormattingProvider = false
    client.server_capabilities.documentRangeFormattingProvider = false

    utils.load_mappings("lspconfig", { buffer = bufnr })

    if not utils.load_config().ui.lsp_semantic_tokens and client.supports_method("textDocument/semanticTokens") then
        client.server_capabilities.semanticTokensProvider = nil
    end
end

M.capabilities = vim.lsp.protocol.make_client_capabilities()
M.capabilities.textDocument.completion.completionItem = {
    documentationFormat = { "markdown", "plaintext" },
    snippetSupport = true,
    preselectSupport = true,
    insertReplaceSupport = true,
    labelDetailsSupport = true,
    deprecatedSupport = true,
    commitCharactersSupport = true,
    tagSupport = { valueSet = { 1 } },
    resolveSupport = {
        properties = {
            "documentation",
            "detail",
            "additionalTextEdits",
        },
    },
}

-- 1. Определяем базовые настройки для ВСЕХ серверов
-- Эта часть будет автоматически применена ко всем конфигурациям[citation:7]
vim.lsp.config("*", {
    on_attach = M.on_attach,
    capabilities = M.capabilities,
})

-- 2. Настраиваем диагностики (это глобальная настройка)
vim.diagnostic.config({
    virtual_text = false,
    signs = false,
    update_in_insert = false,
    underline = true,
    severity_sort = true,
    open_loclist = true,
})

-- 3. Настройка отдельных серверов через vim.lsp.config()

-- 4. Отдельная конфигурация для lua_ls (как в вашем примере, но через новый API)
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
                    [vim.fn.stdpath("data") .. "/lazy/ui/nvchad_types"] = true,
                    [vim.fn.stdpath("data") .. "/lazy/lazy.nvim/lua/lazy"] = true,
                },
                maxPreload = 100000,
                preloadFileSize = 10000,
            },
        },
    },
})

-- 5. Конфигурация для gopls (используем локальную функцию on_attach)
vim.lsp.config("gopls", {
    on_attach = function(client, bufnr)
        -- Эта функция переопределит глобальную M.on_attach для gopls
        M.on_attach(client, bufnr) -- при необходимости вызовите базовую
        vim.o.splitright = false
        vim.o.splitbelow = false
    end,
})

-- 6. Включение серверов
-- Все настроенные серверы будут автоматически запускаться для соответствующих файлов.
-- При необходимости можно принудительно включить конкретный сервер:
-- vim.lsp.enable("lua_ls")[citation:7]

-- 7. Настройка автодополнения (эта часть остается без изменений)
cmp.setup({
    snippet = {
        expand = function(args)
            require("luasnip").lsp_expand(args.body)
        end,
    },
    mapping = cmp.mapping.preset.insert({
        ["<C-b>"] = cmp.mapping.scroll_docs(-4),
        ["<C-f>"] = cmp.mapping.scroll_docs(4),
        ["<C-Space>"] = cmp.mapping.complete(),
        ["<C-e>"] = cmp.mapping.close(),
        ["<CR>"] = cmp.mapping.confirm({ select = true }),
    }),
    sources = cmp.config.sources({
        { name = "nvim_lsp" },
        { name = "luasnip" },
    }, {
        { name = "buffer" },
        { name = "path" },
    }),
})

-- 8. Настройка для coq_lsp (если он всё ещё требуется)
vim.lsp.config("coq_lsp", {})

-- 1. Конфигурация pyright
vim.lsp.config("pyright", {
    settings = {
        python = {
            analysis = {
                typeCheckingMode = "off",
                autoSearchPaths = true,
                useLibraryCodeForTypes = true,
                diagnosticMode = "workspace",
            },
        },
    },
})

-- 2. Включение pyright
for _, server_name in ipairs(servers) do
    vim.lsp.enable(server_name)
end

return M
