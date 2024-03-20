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
		let prefix: string;
		let suffix: string;
		switch (format) {
			case "default":
				prefix = "> [!"
				suffix = "]"
				return prefix + callout.id + suffix;
			case "admonition":
				prefix = "```";
				suffix = "\n```";
				return prefix + callout.id + suffix
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
