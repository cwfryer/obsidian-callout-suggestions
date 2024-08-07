import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { CalloutManager, getApi, isInstalled } from "obsidian-callout-manager";
import CalloutParser, { CHResult } from "src/utils/parser";
import CalloutSuggest from './suggest/callout-suggest';

// Remember to rename these classes and interfaces!

export type Format =
	| "default"
	| "admonition"

export type TextCase =
	| "lower"
	| "title"
	| "upper"

interface CalloutSuggestionsSettings {
	calloutFormat: Format;
	autocompleteTriggerPhrase: string;
	calloutCase: TextCase;
}

const DEFAULT_SETTINGS: CalloutSuggestionsSettings = {
	calloutFormat: "default",
	autocompleteTriggerPhrase: "!",
	calloutCase: "lower",
}

export default class CalloutSuggestions extends Plugin {
	private parser: CalloutParser;
	public calloutManager?: CalloutManager<true>;
	public settings: CalloutSuggestionsSettings;

	async onload() {
		if (!isInstalled()) {
			console.log("Callout Suggestions depends on Callout Manager. Install and enable it from community plugins before enabling this.");
			new Notice("Callout Suggestions depends on Callout Manager. Install and enable it from community plugins before enablng this.");
			this.unload();
			return
		}
		await this.loadSettings();

		this.parser = new CalloutParser(this);

		this.addSettingTab(new CalloutHelperSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(async () => {
			this.calloutManager = await getApi(this);
			this.registerEditorSuggest(new CalloutSuggest(this.app, this))
		});
	}

	onunload() {
		console.log("Unloading Callout Helper plugin.")
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


	/*
	  @param inputString: A string that contains a callout name to fuzzy match
	  @returns CHResult: An object containing the things you need
	*/
	parseCallout(inputString: string): CHResult {
		const format = this.settings.calloutFormat;
		const callout = this.parser.getFormattedCallout(inputString, format);
		if (callout.formattedString === "Invalid callout") {
			console.debug("Input callout " + inputString + " cannot be parsed by CalloutHelper");
		}

		return callout
	}
}

class CalloutHelperSettingTab extends PluginSettingTab {
	plugin: CalloutSuggestions;

	constructor(app: App, plugin: CalloutSuggestions) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Callout syntax')
			.setDesc('Which callout syntax do you use?')
			.addDropdown(dropDown => {
				dropDown.addOption('default', 'Obsidian Syntax   > [!name]');
				dropDown.addOption('admonition', 'Admonition Syntax   ```name');
				dropDown.setValue(this.plugin.settings.calloutFormat);
				dropDown.onChange(async (value: Format) => {
					this.plugin.settings.calloutFormat = value;
					await this.plugin.saveSettings()
				})
			})

		new Setting(containerEl)
			.setName('Completion trigger character')
			.setDesc('Which character should trigger the in-line suggestions?')
			.addText(text => {
				text
					.setPlaceholder("Completion trigger character is empty")
					.setValue(this.plugin.settings.autocompleteTriggerPhrase)
					.onChange(async (value) => {
						this.plugin.settings.autocompleteTriggerPhrase = value;
						await this.plugin.saveSettings();
					})
			})

		new Setting(containerEl)
			.setName('Case for inserted callout')
			.setDesc('Select the case for the inserted callout')
			.addDropdown(dropDown => {
				dropDown.addOption('lower', 'lowercase');
				dropDown.addOption('title', 'Titlecase');
				dropDown.addOption('upper', 'UPPERCASE');
				dropDown.setValue(this.plugin.settings.calloutCase);
				dropDown.onChange(async (value: TextCase) => {
					this.plugin.settings.calloutCase = value;
					await this.plugin.saveSettings()
				})
			})
	}
}
