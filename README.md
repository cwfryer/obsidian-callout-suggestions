# Obsidian Callout Suggestions

This is a user experience enhancing plugin for Obsidian (https://obsidian.md).

I can never remember all the callout tags. Plus, I've made a few of my own that I use pretty frequently.

This plugin provides a Suggestion Modal for Callouts similar to what you'll find in [Obsidian Natural Language Dates](https://github.com/argenos/nldates-obsidian).
It is compatible with (and depends on) the excellent [Obsidian Callout Manager](https://github.com/eth-p/obsidian-callout-manager).
Use them together to make callouts easier to use!

## Features
- Callout autosuggest

## Usage
Trigger the auto-complete with ``` >! ```

## Installation
### Prerequisite Dependencies
| Plugin  | Usage |
| ------------- | ------------- |
| [Callout Manager](https://github.com/eth-p/obsidian-callout-manager) | Uses the API to aggregate callouts.

In Obsidian go to `Settings > Third-party plugins > Community Plugins > Browse` and search for `Callout Manager`.

### How to Install
In Obsidian go to `Settings > Third-party plugins > Community Plugins > Browse` and search for `Callout Suggestions`.

#### Manual installation

Unzip the [latest release](https://github.com/cwfryer/obsidian-callout-suggestions/releases/latest) into your `<vault>/.obsidian/plugins/` folder.

## Known Issues
> [!WARNING]
> Users of [Advanced Slides](https://github.com/MSzturc/obsidian-advanced-slides/tree/main) or [slides-extended](https://github.com/ebullient/obsidian-slides-extended) take note.

Some plugins can cause problems with suggestion modals.
If you're having problems with the suggestion modal not showing up, try these steps:

Settings -> Community plugins -> Installed plugins:

1. enable Callout Suggestion & disable Advanced Slides / other plugins
2. click the reload Plugins button
3. enable Advanced Slides again
4. click the reload Plugins button again

## Special Thanks
[argenos](https://github.com/argenos/nldates-obsidian) for the suggest modal.
[eth-p](https://github.com/eth-p/obsidian-callout-manager) for the callout api.
[edonyzpc](https://github.com/edonyzpc/personal-assistant) for the styling in the suggest modal.
