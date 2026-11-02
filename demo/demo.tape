# Demo recording for README and announcements.
# Regenerate with:  npm run build && vhs demo/demo.tape
# Uses synthetic data only (scripts/demo-data.ts), never real transcripts.

Output demo/rex-usage.gif
Output demo/rex-usage.mp4

Require rex-usage

Set Shell zsh
Set FontSize 16
Set Width 1400
Set Height 820
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set WindowBar Colorful
Set WindowBarSize 36

Hide
Type "d=$(npx tsx scripts/demo-data.ts) && export REX_USAGE_ROOT=$d/projects REX_USAGE_CODEX_HOME=$d/codex && clear"
Enter
Sleep 4s
Show

Sleep 500ms
Type "rex-usage"
Sleep 400ms
Enter
Sleep 4s

# Projects -> models
Tab
Sleep 2.5s
Tab
Sleep 1s

# Cycle sources: all -> claude -> codex -> all
Type "s"
Sleep 2.5s
Type "s"
Sleep 2.5s
Type "s"
Sleep 1.5s

# Cycle ranges: 7d -> 30d -> all -> today
Type "d"
Sleep 2s
Type "d"
Sleep 2s
Type "d"
Sleep 2s
Type "d"
Sleep 2s

Type "q"
Sleep 600ms
