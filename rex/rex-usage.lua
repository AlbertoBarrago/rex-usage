-- rex-usage: open the Claude Code usage dashboard beside the focused pane.
--
-- Install:
--   cp "$(npm root -g)/rex-usage/rex/rex-usage.lua" ~/.config/rex/
--   echo 'require("rex-usage")' >> ~/.config/rex/init.lua
--   rex config check && rex config reload
--
-- Then press ctrl+b u, run `rex do rex_usage`, or pick "Open Usage Dashboard"
-- from the command palette.

-- Program to run. Use an absolute path if Rex still can't find it.
local REX_USAGE_BIN = "rex-usage"

-- Rex starts commands through a non-interactive login shell, which skips
-- ~/.zshrc / ~/.bashrc. Common user bin dirs are prepended so a binary
-- installed with `npm link` or symlinked into ~/.local/bin is still found.
local home = os.getenv("HOME") or ""
local EXTRA_PATH = {
  home .. "/.local/bin",
  home .. "/.npm-global/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
}

rex.action{
  name        = "rex_usage",
  title       = "Open Usage Dashboard",
  description = "Show Claude Code token and cost usage in a split beside the focused pane.",
  keywords    = "claude tokens cost usage agents",
  run         = function(ctx, args)
    local _, err = rex.session.new_split{
      anchor_id = ctx.block_id,
      direction = "horizontal",
      side      = "after",
      -- Share kept by the existing pane; the dashboard gets the rest.
      ratio     = 0.55,
      focus     = true,
      layout    = rex.layout.block{
        flavor  = "com.superlogical.terminal.shell",
        label   = "usage",
        options = {
          command      = { REX_USAGE_BIN },
          path_prepend = EXTRA_PATH,
        },
      },
    }
    if err ~= nil then error(err, 0) end
  end,
}

-- Change or remove this line to pick your own key.
rex.bind("ctrl+b>u", "rex_usage")
