import {
	App,
	Component,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	getIcon,
	TFile
} from "obsidian"
import type CalloutSuggestions from "src/main";

const uFuzzy = require("@leeoniya/ufuzzy");

interface CalloutCompletion {
	icon: string,
	label: string,
	color: string
}

export default class CalloutSuggest extends EditorSuggest<CalloutCompletion> {
	app: App;
	private plugin: CalloutSuggestions;

	constructor(app: App, plugin: CalloutSuggestions) {
		super(app);
		this.app = app;
		this.plugin = plugin;
	}

	getSuggestions(context: EditorSuggestContext): CalloutCompletion[] | Promise<CalloutCompletion[]> {
		const suggestions = this.getCalloutSuggestions(context);
		if (suggestions.length) {
			return suggestions
		}

		// Catch-all if there are no matches
		return [{ icon: "none", color: "none", label: "No matches" }]
	}

	getCalloutSuggestions(context: EditorSuggestContext): CalloutCompletion[] {
		let needle = context.query;
		let callouts = this.plugin.calloutManager!.getCallouts();
		let haystack = callouts?.map((callout) => callout.id) || [needle];

		let uf = new uFuzzy({});
		let idxs = uf.filter(haystack, needle);

		let result: string[] = [];
		if (idxs != null && idxs.length > 0) {
			let infoThresh = 1e2;

			if (idxs.length <= infoThresh) {
				let info = uf.info(idxs, haystack, needle);
				let order = uf.sort(info, haystack, needle);
				for (let i = 0; i < order.length; i++) {
					result.push(haystack[info.idx[order[i]]])
				}
			}
			else {
				for (let i = 0; i < idxs.length; i++) {
					result.push(haystack[idxs[i]])
				}
			}
		}
		let output: CalloutCompletion[];
		if (needle.length > 1) {
			output = callouts.filter((c) => result.includes(c.id)).map((val) => ({ icon: `${val.icon}`, label: `${val.id}`, color: `${val.color}` }))
		}
		else {
			output = callouts.map((val) => ({ icon: `${val.icon}`, label: `${val.id}`, color: `${val.color}` }))
		}
		return output
	}

	renderSuggestion(callout: CalloutCompletion, el: HTMLElement) {
		const calloutContainerEl = el.createEl('div');
		calloutContainerEl.classList.add('calloutmanager-preview-container');
		calloutContainerEl.setAttribute('data-callout-manager-callout', callout.label);
		const { icon, color, label } = callout;
		new CalloutPreviewComponent(calloutContainerEl, {
			label,
			icon,
			color: color ?? undefined,
		});
	}

	selectSuggestion(value: CalloutCompletion, _evt: MouseEvent | KeyboardEvent): void {
		const { editor } = this.context!;

		let calloutStr = "";
		let callout = this.plugin.parseCallout(value.label);
		calloutStr = callout.formattedString;

		editor.replaceRange(calloutStr, this.context!.start, this.context!.end)
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const triggerPhrase = this.plugin.settings.autocompleteTriggerPhrase;
		const startPos = this.context?.start || {
			line: cursor.line,
			ch: cursor.ch - triggerPhrase.length - 1
		}

		if (!editor.getRange(startPos, cursor).startsWith(">" + triggerPhrase)) {
			return null
		}

		return {
			start: startPos,
			end: cursor,
			query: editor.getRange(startPos, cursor).substring(triggerPhrase.length)
		}
	}
}

/**
 * A component that displays a preview of a callout.
 */
export class CalloutPreviewComponent extends Component {
	public readonly calloutEl: HTMLElement;
	public readonly contentEl: HTMLElement | undefined;
	public readonly titleEl: HTMLElement;
	public readonly iconEl: HTMLElement;

	public constructor(containerEl: HTMLElement, options: CalloutCompletion) {
		super();
		const { icon, label } = options;

		const frag = document.createDocumentFragment();

		// Build the callout.
		const calloutEl = (this.calloutEl = frag.createDiv({ cls: ['callout', 'calloutmanager-preview'] }));
		const titleElContainer = calloutEl.createDiv({ cls: 'callout-title' });
		this.iconEl = titleElContainer.createDiv({ cls: 'callout-icon' });
		const titleEl = (this.titleEl = titleElContainer.createDiv({ cls: 'callout-title-inner' }));
		titleEl.textContent = label;
		this.setIcon(icon);
		this.setCalloutID(label);

		// Attach to the container.
		CalloutPreviewComponent.prototype.attachTo.call(this, containerEl);
	}

	/**
	 * Changes the callout ID.
	 * This will *not* change the appearance of the preview.
	 *
	 * @param id The new ID to use.
	 */
	public setCalloutID(id: string): typeof this {
		const { calloutEl } = this;
		calloutEl.setAttribute('data-callout', id);
		return this;
	}

	/**
	 * Changes the callout icon.
	 *
	 * @param icon The ID of the new icon to use.
	 */
	public setIcon(icon: string): typeof this {
		const { iconEl } = this;

		// Clear the icon element and append the SVG.
		iconEl.empty();
		const iconSvg = getIcon(icon);
		if (iconSvg != null) {
			this.iconEl.appendChild(iconSvg);
		}

		return this;
	}

	/**
	 * Attaches the callout preview to a DOM element.
	 * This places it at the end of the element.
	 *
	 * @param containerEl The container to attach to.
	 */
	public attachTo(containerEl: HTMLElement): typeof this {
		containerEl.appendChild(this.calloutEl);
		return this;
	}
}
