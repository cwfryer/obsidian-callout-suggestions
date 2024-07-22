import { Callout } from "obsidian-callout-manager";
import CalloutSuggestions, { Format } from "src/main";

export interface CHResult {
	callout: Callout,
	formattedString: string
}


export default class CalloutParser {
	plugin: CalloutSuggestions;

	constructor(plugin: CalloutSuggestions) {
		this.plugin = plugin;
	}

	getCallout(selectedText: string): Callout {
		const allCallouts = this.plugin.calloutManager!.getCallouts();
		let result = allCallouts.filter((val: Callout) => val.id === selectedText)[0];
		return result
	}

	formatCallout(callout: Callout, format: Format): string {
		if (callout.id === 'none') {
			return "> "
		}

		let calloutStr = callout.id;
		switch (this.plugin.settings.calloutCase) {
			case 'lower': {
				calloutStr = calloutStr.toLowerCase();
				break;
			}
			case 'title': {
				calloutStr = calloutStr.toLowerCase().split(' ').map((word: string) => {
					return (word.charAt(0).toUpperCase() + word.slice(1));
				}).join(' ');
				break;
			}
			case 'upper': {
				calloutStr = calloutStr.toUpperCase();
				break;
			}
		}

		let prefix: string;
		let suffix: string;
		switch (format) {
			case "default":
				prefix = "> [!"
				suffix = "]"
				return prefix + calloutStr + suffix;
			case "admonition":
				prefix = "```";
				suffix = "\n```";
				return prefix + calloutStr + suffix
		}
	}

	getFormattedCallout(selectedText: string, format: Format): CHResult {
		let callout = this.getCallout(selectedText) || { id: 'none' };
		let formattedString = this.formatCallout(callout, format);
		return {
			callout,
			formattedString
		}
	}
}
