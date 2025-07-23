local M = {}

local wm = os.getenv("WM")

local function set_theme()
  local wm = os.getenv("WM")
  if wm == "Hyprland" then
    return "gruvbox"
  elseif wm == "sway" then
    return "solarized_dark"
  else
    return "gruvbox" -- тема по умолчанию, если WM не равен Hyprland или sway
  end
end

M.options = {
  nvchad_branch = "v2.0",
}

M.ui = {
  ------------------------------- base46 -------------------------------------
  -- hl = highlights
  hl_add = {},
  hl_override = {},
  changed_themes = {},
  theme_toggle = { "guvbox", "one_light" },
  theme = set_theme(), -- default theme
  transparency = true,
  lsp_semantic_tokens = false, -- needs nvim v0.9, just adds highlight groups for lsp semantic tokens

  -- https://github.com/NvChad/base46/tree/v2.0/lua/base46/extended_integrations
  extended_integrations = {}, -- these aren't compiled by default, ex: "alpha", "notify"

  -- cmp themeing
  cmp = {
    icons = true,
    lspkind_text = true,
    style = "default", -- default/flat_light/flat_dark/atom/atom_colored
    border_color = "grey_fg", -- only applicable for "default" style, use color names from base30 variables
    selected_item_bg = "colored", -- colored / simple
  },

  telescope = { style = "borderless" }, -- borderless / bordered

  ------------------------------- nvchad_ui modules -----------------------------
  statusline = {
    theme = "default", -- default/vscode/vscode_colored/minimal
    -- default/round/block/arrow separators work only for default statusline theme
    -- round and block will work for minimal theme only
    separator_style = "default",
    overriden_modules = nil,
  },

  -- lazyload it when there are 1+ buffers
  tabufline = {
    enabled = true,
    lazyload = true,
    show_numbers = false,
    overriden_modules = function(modules)
      table.remove(modules, 4)
    end,
  },


  -- nvdash (dashboard)
  nvdash = {
    load_on_startup = true,
    header = {
        "    •   ",
        "┏┓┓┏┓┏┳┓",
        "┛┗┗┛┗┛┗┗",
        "        ",
    },


    -- header = {"██╗   ██╗██╗███╗   ███╗",
    --           "██║   ██║██║████╗ ████║",
    --           "██║   ██║██║██╔████╔██║",
    --           "╚██╗ ██╔╝██║██║╚██╔╝██║",
    --           " ╚████╔╝ ██║██║ ╚═╝ ██║",
    --           "  ╚═══╝  ╚═╝╚═╝     ╚═╝",
    -- },


    -- header = {
    --     "                                                     ",
    --     "  ███╗   ██╗███████╗ ██████╗ ██╗   ██╗██╗███╗   ███╗ ",
    --     "  ████╗  ██║██╔════╝██╔═══██╗██║   ██║██║████╗ ████║ ",
    --     "  ██╔██╗ ██║█████╗  ██║   ██║██║   ██║██║██╔████╔██║ ",
    --     "  ██║╚██╗██║██╔══╝  ██║   ██║╚██╗ ██╔╝██║██║╚██╔╝██║ ",
    --     "  ██║ ╚████║███████╗╚██████╔╝ ╚████╔╝ ██║██║ ╚═╝ ██║ ",
    --     "  ╚═╝  ╚═══╝╚══════╝ ╚═════╝   ╚═══╝  ╚═╝╚═╝     ╚═╝ ",
    -- },
    -- header = {
    --   "           ▄ ▄                   ",
    --   "       ▄   ▄▄▄     ▄ ▄▄▄ ▄ ▄     ",
    --   "       █ ▄ █▄█ ▄▄▄ █ █▄█ █ █     ",
    --   "    ▄▄ █▄█▄▄▄█ █▄█▄█▄▄█▄▄█ █     ",
    --   "  ▄ █▄▄█ ▄ ▄▄ ▄█ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄  ",
    --   "  █▄▄▄▄ ▄▄▄ █ ▄ ▄▄▄ ▄ ▄▄▄ ▄ ▄ █ ▄",
    --   "▄ █ █▄█ █▄█ █ █ █▄█ █ █▄█ ▄▄▄ █ █",
    --   "█▄█ ▄ █▄▄█▄▄█ █ ▄▄█ █ ▄ █ █▄█▄█ █",
    --   "    █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█ █▄█▄▄▄█    ",
    -- },
    buttons = {
      { "     Find File", "Spc f f", "Telescope find_files" },
      { "󰈚  Recent Files", "Spc f o", "Telescope oldfiles" },
      { "󰈭     Find Word", "Spc f w", "Telescope live_grep" },
      -- { "  Bookmarks", "Spc m a", "Telescope marks" },
      { "        Themes", "Spc t h", "Telescope themes" },
      -- { "  Mappings", "Spc c h", "NvCheatsheet" },
    },
  },

  cheatsheet = { theme = "grid" }, -- simple/grid

  lsp = {
    -- show function signatures i.e args as you type
    signature = {
      disabled = true,
      silent = false, -- silences 'no signature help available' message from appearing
    },
  },
}


M.lazy_nvim = require "plugins.configs.lazy_nvim" -- config for lazy.nvim startup options

M.mappings = require "core.mappings";

return M
