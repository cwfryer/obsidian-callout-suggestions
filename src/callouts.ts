import { SnippetID, ThemeID } from 'obsidian-undocumented';
import { getCurrentColorScheme } from 'obsidian-extra';

import { Callout, CalloutID, CalloutSource } from 'obsidian-callout-manager';

/**
 * A collection of Callout IDs.
 */
export class CalloutCollection {
	private resolver: (id: string) => Omit<Callout, 'sources'>;

	private invalidated: Set<CachedCallout>;
	private invalidationCount: number;
	private cacheById: Map<CalloutID, CachedCallout>;
	private cached: boolean;

	public readonly snippets: CalloutCollectionSnippets;
	public readonly builtin: CalloutCollectionObsidian;
	public readonly theme: CalloutCollectionTheme;
	public readonly custom: CalloutCollectionCustom;

	public constructor(resolver: (id: string) => Omit<Callout, 'sources'>) {
		this.resolver = resolver;
		this.invalidated = new Set();
		this.invalidationCount = 0;
		this.cacheById = new Map();
		this.cached = false;

		this.snippets = new CalloutCollectionSnippets(this.invalidateSource.bind(this));
		this.builtin = new CalloutCollectionObsidian(this.invalidateSource.bind(this));
		this.theme = new CalloutCollectionTheme(this.invalidateSource.bind(this));
		this.custom = new CalloutCollectionCustom(this.invalidateSource.bind(this));
	}

	public get(id: CalloutID): Callout | undefined {
		if (!this.cached) this.buildCache();
		const cached = this.cacheById.get(id);
		if (cached === undefined) {
			return undefined;
		}

		// Ensure the callout is resolved.
		if (this.invalidated.has(cached)) {
			this.resolveOne(cached);
		}

		// Return the callout.
		return cached.callout as Callout;
	}

	/**
	 * Checks if a callout with this ID is in the collection.
	 * @param id The callout ID.
	 * @returns True if the callout is in the collection.
	 */
	public has(id: CalloutID): boolean {
		if (!this.cached) this.buildCache();
		return this.cacheById.has(id);
	}

	/**
	 * Gets all the known {@link CalloutID callout IDs}.
	 * @returns The callout IDs.
	 */
	public keys(): CalloutID[] {
		if (!this.cached) this.buildCache();
		return Array.from(this.cacheById.keys());
	}

	/**
	 * Gets all the known {@link Callout callouts}.
	 * @returns The callouts.
	 */
	public values(): Callout[] {
		if (!this.cached) this.buildCache();
		this.resolveAll();
		return Array.from(this.cacheById.values()).map((c) => c.callout as Callout);
	}

	/**
	 * Returns a function that will return `true` if the collection has changed since the function was created.
	 * @returns The function.
	 */
	public hasChanged(): () => boolean {
		const countSnapshot = this.invalidationCount;
		return () => this.invalidationCount !== countSnapshot;
	}

	/**
	 * Resolves the settings of a callout.
	 * This removes it from the set of invalidated callout caches.
	 *
	 * @param cached The callout's cache entry.
	 */
	protected resolveOne(cached: CachedCallout) {
		this.doResolve(cached);
		this.invalidated.delete(cached);
	}

	/**
	 * Resolves the settings of all callouts.
	 */
	protected resolveAll() {
		for (const cached of this.invalidated.values()) {
			this.doResolve(cached);
		}

		this.invalidated.clear();
	}

	protected doResolve(cached: CachedCallout) {
		cached.callout = this.resolver(cached.id) as Callout;
		cached.callout.sources = Array.from(cached.sources.values()).map(sourceFromKey);
	}

	/**
	 * Builds the initial cache of callouts.
	 * This creates the cache entries and associates them to a source.
	 */
	protected buildCache() {
		this.invalidated.clear();
		this.cacheById.clear();

		// Add Obsidian callouts:
		{
			const source = sourceToKey({ type: 'builtin' });
			for (const callout of this.builtin.get()) {
				this.addCalloutSource(callout, source);
			}
		}

		// Add theme callouts:
		if (this.theme.theme != null) {
			const source = sourceToKey({ type: 'theme', theme: this.theme.theme });
			for (const callout of this.theme.get()) {
				this.addCalloutSource(callout, source);
			}
		}

		// Add snippet callouts:
		for (const snippet of this.snippets.keys()) {
			const source = sourceToKey({ type: 'snippet', snippet });
			for (const callout of this.snippets.get(snippet) as CalloutID[]) {
				this.addCalloutSource(callout, source);
			}
		}

		// Add custom callouts:
		{
			const source = sourceToKey({ type: 'custom' });
			for (const callout of this.custom.keys()) {
				this.addCalloutSource(callout, source);
			}
		}

		// Mark as cached so we don't rebuild unnecessarily.
		this.cached = true;
	}

	/**
	 * Marks a callout as invalidated.
	 * This forces the callout to be resolved again.
	 *
	 * @param id The callout ID.
	 */
	public invalidate(id: CalloutID): void {
		if (!this.cached) return;
		const callout = this.cacheById.get(id);
		if (callout !== undefined) {
			console.debug("Invalided Callout Cache:", id);
			this.invalidated.add(callout);
		}
	}

	protected addCalloutSource(id: string, sourceKey: string) {
		let callout = this.cacheById.get(id);
		if (callout == null) {
			callout = new CachedCallout(id);
			this.cacheById.set(id, callout);
		}

		callout.sources.add(sourceKey);
		this.invalidated.add(callout);
	}

	protected removeCalloutSource(id: string, sourceKey: string) {
		const callout = this.cacheById.get(id);
		if (callout == null) {
			return;
		}

		callout.sources.delete(sourceKey);
		if (callout.sources.size === 0) {
			this.cacheById.delete(id);
			this.invalidated.delete(callout);
		}
	}

	/**
	 * Called whenever a callout source has any changes.
	 * This will add or remove callouts from the cache, or invalidate a callout to mark it as requiring re-resolving.
	 *
	 * @param src The source that changed.
	 * @param data A diff of changes.
	 */
	protected invalidateSource(
		src: CalloutSource,
		data: { added: CalloutID[]; removed: CalloutID[]; changed: CalloutID[] },
	): void {
		const sourceKey = sourceToKey(src);
		if (!this.cached) {
			return;
		}

		for (const removed of data.removed) {
			this.removeCalloutSource(removed, sourceKey);
		}

		for (const added of data.added) {
			this.addCalloutSource(added, sourceKey);
		}

		for (const changed of data.changed) {
			const callout = this.cacheById.get(changed);
			if (callout != null) {
				this.invalidated.add(callout);
			}
		}

		this.invalidationCount++;
	}
}

class CachedCallout {
	public readonly id: CalloutID;
	public readonly sources: Set<string>;
	public callout: Callout | null;

	public constructor(id: CalloutID) {
		this.id = id;
		this.sources = new Set();
		this.callout = null;
	}
}

/**
 * A container for callout IDs that came from a snippet.
 */
class CalloutCollectionSnippets {
	private data = new Map<SnippetID, Set<CalloutID>>();
	private invalidate: CalloutCollection['invalidateSource'];

	public constructor(invalidate: CalloutCollection['invalidateSource']) {
		this.invalidate = invalidate;
	}

	public get(id: SnippetID): CalloutID[] | undefined {
		const value = this.data.get(id);
		if (value === undefined) {
			return undefined;
		}

		return Array.from(value.values());
	}

	public set(id: SnippetID, callouts: CalloutID[]): void {
		const source: CalloutSource = { type: 'snippet', snippet: id };
		const old = this.data.get(id);
		const updated = new Set(callouts);
		this.data.set(id, updated);

		// If there was nothing before, all the callouts were added.
		if (old === undefined) {
			this.invalidate(source, { added: callouts, changed: [], removed: [] });
			return;
		}

		// If there was something here already, calculate a diff.
		const diffs = diff(old, updated);
		this.invalidate(source, {
			added: diffs.added,
			removed: diffs.removed,
			changed: diffs.same,
		});
	}

	public delete(id: SnippetID): boolean {
		const old = this.data.get(id);
		const deleted = this.data.delete(id);
		if (old !== undefined) {
			this.invalidate(
				{ type: 'snippet', snippet: id },
				{
					added: [],
					changed: [],
					removed: Array.from(old.keys()),
				},
			);
		}

		return deleted;
	}

	public clear(): void {
		for (const id of Array.from(this.data.keys())) {
			this.delete(id);
		}
	}

	public keys(): SnippetID[] {
		return Array.from(this.data.keys());
	}
}

/**
 * A container for callout IDs that came from Obsidian's defaults.
 */
class CalloutCollectionObsidian {
	private data = new Set<CalloutID>();
	private invalidate: CalloutCollection['invalidateSource'];

	public constructor(invalidate: CalloutCollection['invalidateSource']) {
		this.invalidate = invalidate;
	}

	public set(callouts: CalloutID[]) {
		const old = this.data;
		const updated = (this.data = new Set(callouts));

		const diffs = diff(old, updated);
		this.invalidate(
			{ type: 'builtin' },
			{
				added: diffs.added,
				removed: diffs.removed,
				changed: diffs.same,
			},
		);
	}

	public get(): CalloutID[] {
		return Array.from(this.data.values());
	}
}

/**
 * A container for callout IDs that came from a theme.
 */
class CalloutCollectionTheme {
	private data = new Set<CalloutID>();
	private invalidate: CalloutCollection['invalidateSource'];
	private oldTheme: string | null;

	public constructor(invalidate: CalloutCollection['invalidateSource']) {
		this.invalidate = invalidate;
		this.oldTheme = '';
	}

	public get theme(): string | null {
		return this.oldTheme;
	}

	public set(theme: ThemeID, callouts: CalloutID[]) {
		const old = this.data;
		const oldTheme = this.oldTheme;

		const updated = (this.data = new Set(callouts));
		this.oldTheme = theme;

		if (this.oldTheme === theme) {
			const diffs = diff(old, updated);
			this.invalidate(
				{ type: 'theme', theme },
				{
					added: diffs.added,
					removed: diffs.removed,
					changed: diffs.same,
				},
			);
			return;
		}

		// The theme changed.
		// In this case, all the old callouts were removed and all the new callouts were added.
		this.invalidate(
			{ type: 'theme', theme: oldTheme ?? '' },
			{
				added: [],
				removed: Array.from(old.values()),
				changed: [],
			},
		);

		this.invalidate(
			{ type: 'theme', theme },
			{
				added: callouts,
				removed: [],
				changed: [],
			},
		);
	}

	public delete(): void {
		const old = this.data;
		const oldTheme = this.oldTheme;

		this.data = new Set();
		this.oldTheme = null;

		this.invalidate(
			{ type: 'theme', theme: oldTheme ?? '' },
			{
				added: [],
				removed: Array.from(old.values()),
				changed: [],
			},
		);
	}

	public get(): CalloutID[] {
		return Array.from(this.data.values());
	}
}

/**
 * A container for callout IDs that were created by the Callout Manager plugin.
 */
class CalloutCollectionCustom {
	private data: CalloutID[] = [];
	private invalidate: CalloutCollection['invalidateSource'];

	public constructor(invalidate: CalloutCollection['invalidateSource']) {
		this.invalidate = invalidate;
	}

	public has(id: CalloutID): boolean {
		return undefined !== this.data.find((existingId) => existingId === id);
	}

	public add(...ids: CalloutID[]): void {
		const set = new Set(this.data);
		const added = [];

		// Add the new callouts.
		for (const id of ids) {
			if (!set.has(id)) {
				added.push(id);
				set.add(id);
				this.data.push(id);
			}
		}

		// Invalidate.
		if (added.length > 0) {
			this.invalidate({ type: 'custom' }, { added, removed: [], changed: [] });
		}
	}

	public delete(...ids: CalloutID[]): void {
		const { data } = this;
		const removed = [];

		// Add the new callouts.
		for (const id of ids) {
			const index = data.findIndex((existingId) => id === existingId);
			if (index !== undefined) {
				data.splice(index, 1);
				removed.push(id);
			}
		}

		// Invalidate.
		if (removed.length > 0) {
			this.invalidate({ type: 'custom' }, { added: [], removed, changed: [] });
		}
	}

	public keys(): CalloutID[] {
		return this.data.slice(0);
	}

	public clear(): void {
		const removed = this.data;
		this.data = [];
		this.invalidate({ type: 'custom' }, { added: [], removed, changed: [] });
	}
}

function diff<T>(before: Set<T>, after: Set<T>): { added: T[]; removed: T[]; same: T[] } {
	const added: T[] = [];
	const removed: T[] = [];
	const same: T[] = [];

	for (const item of before.values()) {
		(after.has(item) ? same : removed).push(item);
	}

	for (const item of after.values()) {
		if (!before.has(item)) {
			added.push(item);
		}
	}

	return { added, removed, same };
}

/**
 * Converts a callout source into a unique and deserializable string that uniquely represents the source.
 * This allows the source to be used in a set or as a map key.
 *
 * @param source The source.
 * @returns The source as a string.
 */
function sourceToKey(source: CalloutSource): string {
	switch (source.type) {
		case 'builtin':
			return 'builtin';
		case 'snippet':
			return `snippet:${source.snippet}`;
		case 'theme':
			return `theme:${source.theme}`;
		case 'custom':
			return `custom`;
	}
}

/**
 * Converts a key created from {@link sourceToKey} back into a {@link CalloutSource}.
 *
 * @param sourceKey The source key.
 * @returns The source as an object.
 */
function sourceFromKey(sourceKey: string): CalloutSource {
	if (sourceKey === 'builtin') {
		return { type: 'builtin' };
	}

	if (sourceKey === 'custom') {
		return { type: 'custom' };
	}

	if (sourceKey.startsWith('snippet:')) {
		return { type: 'snippet', snippet: sourceKey.substring('snippet:'.length) };
	}

	if (sourceKey.startsWith('theme:')) {
		return { type: 'theme', theme: sourceKey.substring('theme:'.length) };
	}

	throw new Error('Unknown source key: ' + sourceKey);
}

/**/

/**
 * A class that fetches style information for callouts.
 * This keeps a Shadow DOM within the page document and uses getComputedStyles to get CSS variables.
 */
export class CalloutResolver {
	private readonly hostElement: HTMLElement;
	private readonly calloutPreview: IsolatedCalloutPreviewComponent;

	public constructor() {
		this.hostElement = document.body.createDiv({
			cls: 'calloutmanager-callout-resolver',
		});

		this.hostElement.style.setProperty('display', 'none', 'important');
		this.calloutPreview = new IsolatedCalloutPreviewComponent(this.hostElement, {
			id: '',
			icon: '',
			colorScheme: 'dark',
		});

		this.calloutPreview.resetStylePropertyOverrides();
	}

	/**
	 * Reloads the styles of the callout resolver.
	 * This is necessary to get up-to-date styles when the application CSS changes.
	 *
	 * Note: This will not reload the Obsidian app.css stylesheet.
	 * @param styles The new style elements to use.
	 */
	public reloadStyles(): void {
		this.calloutPreview.setColorScheme(getCurrentColorScheme(app));
		this.calloutPreview.updateStyles();
		this.calloutPreview.removeStyles((el) => el.getAttribute('data-callout-manager') === 'style-overrides');
	}

	/**
	 * Removes the host element.
	 * This should be called when the plugin is unloading.
	 */
	public unload() {
		this.hostElement.remove();
	}

	/**
	 * Gets the computed styles for a given type of callout.
	 * This uses the current Obsidian styles, themes, and snippets.
	 *
	 * @param id The callout ID.
	 * @param callback A callback function to run. The styles may only be accessed through this.
	 * @returns Whatever the callback function returned.
	 */
	public getCalloutStyles<T>(id: CalloutID, callback: (styles: CSSStyleDeclaration) => T): T {
		const { calloutEl } = this.calloutPreview;
		calloutEl.setAttribute('data-callout', id);

		// Run the callback.
		//   We need to use the callback to create the full set of desired return properties because
		//   window.getComputedStyle returns an object that will update itself automatically. The moment we
		//   change the host element, all the styles we want from it will be removed.
		return callback(window.getComputedStyle(calloutEl));
	}

	/**
	 * Gets the icon and color for a given type of callout.
	 * This uses the current Obsidian styles, themes, and snippets.
	 *
	 * @param id The callout ID.
	 * @returns The callout icon and color.
	 */
	public getCalloutProperties(id: CalloutID): { icon: string } {
		return this.getCalloutStyles(id, (styles) => ({
			icon: styles.getPropertyValue('--callout-icon').trim(),
		}));
	}

	public get customStyleEl(): HTMLStyleElement {
		return this.calloutPreview.customStyleEl as HTMLStyleElement;
	}
}

/**
 * Gets the title of a callout.
 *
 * This should be the same as what Obsidian displays when a callout block does not have a user-specified title.
 *
 * @param callout The callout.
 * @returns The callout's title.
 */
export function getTitleFromCallout(callout: Callout): string {
	const matches = /^(.)(.*)/u.exec(callout.id);
	if (matches == null) return callout.id;

	const firstChar = matches[1].toLocaleUpperCase();
	const remainingChars = matches[2].toLocaleLowerCase().replace(/-+/g, " ");

	return `${firstChar}${remainingChars}`;
}


import { Component, getIcon } from 'obsidian';

const NO_ATTACH = Symbol();

export interface PreviewOptions {
	/**
	 * The callout ID.
	 */
	id: CalloutID;

	/**
	 * The icon to display in the callout.
	 * This should be known in advance.
	 */
	icon: string;

	/**
	 * The color of the callout.
	 */
	color?: RGB;

	/**
	 * The title to show.
	 * The callout ID will be used if this is omitted.
	 */
	title?: HTMLElement | DocumentFragment | string | ((titleEl: HTMLElement) => unknown);

	/**
	 * The content to show.
	 */
	content?: HTMLElement | DocumentFragment | string | ((contentEl: HTMLElement) => unknown);
}

/**
 * A component that displays a preview of a callout.
 */
export class CalloutPreviewComponent extends Component {
	public readonly calloutEl: HTMLElement;
	public readonly contentEl: HTMLElement | undefined;
	public readonly titleEl: HTMLElement;
	public readonly iconEl: HTMLElement;

	public constructor(containerEl: HTMLElement | typeof NO_ATTACH, options: PreviewOptions) {
		super();
		const { color, icon, id, title, content } = options;

		const frag = document.createDocumentFragment();

		// Build the callout.
		const calloutEl = (this.calloutEl = frag.createDiv({ cls: ['callout', 'calloutmanager-preview'] }));
		const titleElContainer = calloutEl.createDiv({ cls: 'callout-title' });
		this.iconEl = titleElContainer.createDiv({ cls: 'callout-icon' });
		const titleEl = (this.titleEl = titleElContainer.createDiv({ cls: 'callout-title-inner' }));
		const contentEl = (this.contentEl =
			content === undefined ? undefined : calloutEl.createDiv({ cls: 'callout-content' }));

		this.setIcon(icon);
		this.setColor(color);
		this.setCalloutID(id);

		// Set the callout title.
		if (title == null) titleEl.textContent = id;
		else if (typeof title === 'function') title(titleEl);
		else if (typeof title === 'string') titleEl.textContent = title;
		else titleEl.appendChild(title);

		// Set the callout contents.
		if (contentEl != null) {
			if (typeof content === 'function') content(contentEl);
			else if (typeof content === 'string') contentEl.textContent = content;
			else contentEl.appendChild(content as HTMLElement | DocumentFragment);
		}

		// Attach to the container.
		if (containerEl != NO_ATTACH) {
			CalloutPreviewComponent.prototype.attachTo.call(this, containerEl);
		}
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
		const { iconEl, calloutEl } = this;

		// Change the icon style variable.
		calloutEl.style.setProperty('--callout-icon', icon);

		// Clear the icon element and append the SVG.
		iconEl.empty();
		const iconSvg = getIcon(icon);
		if (iconSvg != null) {
			this.iconEl.appendChild(iconSvg);
		}

		return this;
	}

	/**
	 * Changes the callout color.
	 *
	 * @param color The color to use.
	 */
	public setColor(color: RGB | undefined): typeof this {
		const { calloutEl } = this;

		if (color == null) {
			calloutEl.style.removeProperty('--callout-color');
			return this;
		}

		calloutEl.style.setProperty('--callout-color', `${color.r}, ${color.g}, ${color.b}`);
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

	/**
	 * Resets the `--callout-color` and `--callout-icon` CSS properties added to the callout element.
	 */
	public resetStylePropertyOverrides() {
		const { calloutEl } = this;
		calloutEl.style.removeProperty('--callout-color');
		calloutEl.style.removeProperty('--callout-icon');
	}
}

export interface IsolatedPreviewOptions extends PreviewOptions {
	colorScheme: 'dark' | 'light';

	focused?: boolean;
	viewType?: 'source' | 'reading';
	cssEls?: (HTMLStyleElement | HTMLLinkElement)[];
}

/**
 * An isolated callout preview.
 *
 * This uses the Shadow DOM to create a full DOM for the callout, and allows for custom styles to be used.
 */
export class IsolatedCalloutPreviewComponent extends CalloutPreviewComponent {
	protected readonly styleEls: HTMLStyleElement[];
	protected readonly shadowBody: HTMLBodyElement;
	protected readonly shadowHead: HTMLHeadElement;
	protected readonly shadowHostEl: HTMLElement;
	protected readonly shadowRoot: ShadowRoot;

	public readonly customStyleEl: HTMLStyleElement;

	public constructor(containerEl: HTMLElement, options: IsolatedPreviewOptions) {
		super(NO_ATTACH, options);

		const frag = document.createDocumentFragment();
		const focused = options.focused ?? false;
		const colorScheme = options.colorScheme;
		const readingView = (options.viewType ?? 'reading') === 'reading';
		const cssEls = options?.cssEls ?? getCurrentStyles(containerEl?.doc);

		// Create a shadow dom.
		const shadowHostEl = (this.shadowHostEl = frag.createDiv());
		const shadowRoot = (this.shadowRoot = shadowHostEl.attachShadow({ delegatesFocus: false, mode: 'closed' }));
		const shadowHead = (this.shadowHead = shadowRoot.createEl('head'));
		const shadowBody = (this.shadowBody = shadowRoot.createEl('body'));

		// Copy the styles into the shadow head.
		const styleEls = (this.styleEls = [] as HTMLStyleElement[]);
		for (const cssEl of cssEls) {
			const cssElClone = cssEl.cloneNode(true);
			if (cssEl.tagName === 'STYLE') {
				styleEls.push(cssElClone as HTMLStyleElement);
			}

			shadowHead.appendChild(cssElClone);
		}

		// Add styles to reset all properties on everything above the callout.
		//
		// This is so we can keep the selectors consistent between real Obsidian and our fake one, without
		// having those elements affect the display of the callout itself.
		shadowHead.createEl('style', { text: SHADOW_DOM_RESET_STYLES });

		// Add a custom style element.
		this.customStyleEl = shadowHead.createEl('style', { attr: { 'data-custom-styles': 'true' } });

		// Create a fake DOM tree inside the shadow body to host the callout.
		shadowBody.classList.add(`theme-${colorScheme}`, 'obsidian-app');
		const viewContentEl = shadowBody
			.createDiv({ cls: 'app-container' })
			.createDiv({ cls: 'horizontal-main-container' })
			.createDiv({ cls: 'workspace' })
			.createDiv({ cls: 'workspace-split mod-root' })
			.createDiv({ cls: `workspace-tabs ${focused ? 'mod-active' : ''}` })
			.createDiv({ cls: 'workspace-tab-container' })
			.createDiv({ cls: `workspace-leaf ${focused ? 'mod-active' : ''}` })
			.createDiv({ cls: 'workspace-leaf-content' })
			.createDiv({ cls: 'view-content' });

		const calloutParentEl = readingView
			? createReadingViewContainer(viewContentEl)
			: createLiveViewContainer(viewContentEl);

		calloutParentEl.appendChild(this.calloutEl);

		// Attach to the container.
		if (containerEl != null) {
			IsolatedCalloutPreviewComponent.prototype.attachTo.call(this, containerEl);
		}
	}

	/**
	 * Replaces the `<style>` elements used by the isolated callout preview with the latest ones.
	 */
	public updateStyles(): typeof this {
		return this.updateStylesWith(
			getCurrentStyles(this.shadowHostEl.doc)
				.filter((e) => e.tagName === 'STYLE')
				.map((e) => e.cloneNode(true) as HTMLStyleElement),
		);
	}

	/**
	 * Replaces the `<style>` elements used by the isolated callout preview.
	 * This can be used to update the preview with the latest styles.
	 *
	 * @param styleEls The new style elements to use. These will *not* be cloned.
	 */
	public updateStylesWith(styleEls: HTMLStyleElement[]): typeof this {
		const { styleEls: oldStyleEls, customStyleEl } = this;

		// Replace the styles.
		let i, end;
		let lastNode = customStyleEl.previousSibling as HTMLElement;
		for (i = 0, end = Math.min(styleEls.length, oldStyleEls.length); i < end; i++) {
			const el = styleEls[i];
			oldStyleEls[i].replaceWith(el);
			lastNode = el;
		}

		// Add styles that didn't have anywhere to go.
		for (end = styleEls.length; i < end; i++) {
			const el = styleEls[i];
			lastNode.insertAdjacentElement('afterend', el);
			oldStyleEls.push(el);
		}

		// Remove extra styles.
		const toRemove = oldStyleEls.splice(i, oldStyleEls.length - i);
		for (const node of toRemove) {
			node.remove();
		}

		return this;
	}

	/**
	 * Removes matching style elements.
	 * @param predicate The predicate function. If it returns true, the element is removed.
	 */
	public removeStyles(predicate: (el: HTMLStyleElement) => boolean) {
		for (let i = 0; i < this.styleEls.length; i++) {
			const el = this.styleEls[i];
			if (predicate(el)) {
				el.remove();
				this.styleEls.splice(i, 1);
				i--;
			}
		}
	}

	/**
	 * Changes the color scheme.
	 * @param colorScheme The color scheme to use.
	 */
	public setColorScheme(colorScheme: 'dark' | 'light'): typeof this {
		const { classList } = this.shadowBody;
		classList.toggle('theme-dark', colorScheme === 'dark');
		classList.toggle('theme-light', colorScheme === 'light');
		return this;
	}

	/**
	 * Attaches the callout preview to a DOM element.
	 * This places it at the end of the element.
	 *
	 * @param containerEl The container to attach to.
	 * @override
	 */
	public attachTo(containerEl: HTMLElement): typeof this {
		containerEl.appendChild(this.shadowHostEl);
		return this;
	}
}

/**
 * Gets the currently-applied Obsidian stylesheets and styles.
 *
 * @param doc The document to take the styles from.
 * @returns An array of **uncloned** `style` and `link` nodes.
 */
function getCurrentStyles(doc?: Document): Array<HTMLStyleElement | HTMLLinkElement> {
	const els: Array<HTMLStyleElement | HTMLLinkElement> = [];
	let node = (doc ?? window.document).head.firstElementChild;
	for (; node != null; node = node.nextElementSibling) {
		const nodeTag = node.tagName;
		if (nodeTag === 'STYLE' || (nodeTag === 'LINK' && node.getAttribute('rel')?.toLowerCase() === 'stylesheet')) {
			els.push(node as HTMLStyleElement | HTMLLinkElement);
		}
	}
	return els;
}

/**
 * Creates a DOM representation of the Obsidian reading view.
 * A callout placed within the returned container will act as though it is inside a Markdown document's reading view.
 *
 * @param viewContentEl The `.view-content` container element.
 * @returns A container to attach a callout to.
 */
function createReadingViewContainer(viewContentEl: HTMLDivElement): HTMLDivElement {
	// div.markdown-reading-view div.markdown-preview-vie.markdown-rendered .markdown-preview-section
	// div div.callout[data-callout]
	return viewContentEl
		.createDiv({ cls: 'markdown-reading-view' })
		.createDiv({ cls: 'markdown-preview-view markdown-rendered' })
		.createDiv({ cls: 'markdown-preview-section' })
		.createDiv();
}

/**
 * Creates a DOM representation of the Obsidian live editor view.
 * A callout placed within the returned container will act as though it is inside a Markdown document's CodeMirror editor.
 *
 * @param viewContentEl The `.view-content` container element.
 * @returns A container to attach a callout to.
 */
function createLiveViewContainer(viewContentEl: HTMLDivElement): HTMLDivElement {
	// div.markdown-source-view.cm-s-obsidian.mod-cm6.is-live-preview div.cm-editor.ͼ1.ͼ2.ͼq div.cm-scroller
	// div.cm-sizer div.cm-contentContainer div.cm-content div.cm-embed-block.markdown-rendered.cm-callout
	return viewContentEl
		.createDiv({ cls: 'markdown-source-view cm-s-obsidian mod-cm6 is-live-preview' })
		.createDiv({ cls: 'cm-editor ͼ1 ͼ2 ͼq' })
		.createDiv({ cls: 'cm-scroller' })
		.createDiv({ cls: 'cm-sizer' })
		.createDiv({ cls: 'cm-contentContainer' })
		.createDiv({ cls: 'cm-content' })
		.createDiv({ cls: 'cm-embed-block markdown-rendered cm-callout' });
}

// ---------------------------------------------------------------------------------------------------------------------
// Color Types:
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A color in 8-bit RGB color space.
 * Each color component is between 0 and 255.
 */
export interface RGB {
	r: number;
	g: number;
	b: number;
}

/**
 * A color in 8-bit RGB color space with an alpha channel.
 * The alpha component is between 0 and 255.
 *
 * @see RGB
 */
export interface RGBA extends RGB {
	a: number;
}

/**
 * A color in hue-saturation-value color space.
 */
export interface HSV {
	/**
	 * Hue.
	 * Range: `0-359`
	 */
	h: number;

	/**
	 * Saturation.
	 * Range: `0-100`
	 */
	s: number;

	/**
	 * Value.
	 * Range: `0-100`
	 */
	v: number;
}

/**
 * A color in hue-saturation-value color space with an alpha channel.
 *
 * @see HSV
 */
export interface HSVA extends HSV {
	a: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Color Conversion:
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Converts a color to HSV(A).
 *
 * @param color The color to convert.
 * @returns The color in HSV color space.
 */
export function toHSV(color: RGB | RGBA | HSV | HSVA): HSV | HSVA {
	if ('h' in color && 's' in color && 'v' in color) return color;

	const rFloat = color.r / 255;
	const gFloat = color.g / 255;
	const bFloat = color.b / 255;

	const cmax = Math.max(rFloat, gFloat, bFloat);
	const cmin = Math.min(rFloat, gFloat, bFloat);
	const delta = cmax - cmin;

	let h = 0;
	if (cmax !== cmin) {
		switch (cmax) {
			case rFloat:
				h = (60 * ((gFloat - bFloat) / delta) + 360) % 360;
				break;
			case gFloat:
				h = (60 * ((bFloat - rFloat) / delta) + 120) % 360;
				break;
			case bFloat:
				h = (60 * ((rFloat - gFloat) / delta) + 240) % 360;
				break;
		}
	}

	const s = cmax === 0 ? 0 : (delta / cmax) * 100;
	const v = cmax * 100;

	const hsv: HSV | HSVA = { h, s, v };
	if ('a' in color) {
		(hsv as HSVA).a = (((color as RGBA | HSVA).a as number) / 255) * 100;
	}

	return hsv;
}

export function toHexRGB(color: RGB | RGBA): string {
	const parts = [color.r, color.g, color.b, ...('a' in color ? [color.a] : [])];
	return parts.map((c) => c.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------------------------------------------------
// Color Parsing:
// ---------------------------------------------------------------------------------------------------------------------
const REGEX_RGB = /^\s*rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?\s*)\)\s*$/i;
const REGEX_RGBA = /^\s*rgba\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*\)\s*$/i;
const REGEX_HEX = /^\s*#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})\s*$/i;

/**
 * Parses a CSS color into RGB(A) components.
 * This does not support other color formats than RGB (e.g. HSV).
 *
 * @param color The color string.
 * @returns The color RGB(A), or null if not valid.
 */
export function parseColor(color: string): RGB | RGBA | null {
	const trimmed = color.trim();
	if (trimmed.startsWith('#')) {
		return parseColorHex(color);
	}

	return parseColorRGBA(color);
}

/**
 * Parses a `rgb()` CSS color into RGB components.
 *
 * @param rgb The color string.
 * @returns The color RGB, or null if not valid.
 */
export function parseColorRGB(rgb: string): RGB | null {
	const matches = REGEX_RGB.exec(rgb);
	if (matches === null) return null;

	const components = matches.slice(1).map((v) => v.trim()) as [string, string, string];
	const rgbComponents = rgbComponentStringsToNumber(components);
	if (rgbComponents === null) {
		return null;
	}

	// Validate.
	if (undefined !== rgbComponents.find((v) => isNaN(v) || v < 0 || v > 0xff)) {
		return null;
	}

	// Parsed.
	return {
		r: rgbComponents[0],
		g: rgbComponents[1],
		b: rgbComponents[2],
	};
}

/**
 * Parses a `rgba()` CSS color into RGBA components.
 *
 * @param rgba The color string.
 * @returns The color RGBA, or null if not valid.
 */
export function parseColorRGBA(rgba: string): RGBA | null {
	const asRGB = parseColorRGB(rgba) as RGBA | null;
	if (asRGB != null) {
		asRGB.a = 255;
		return asRGB;
	}

	// As RGBA.
	const matches = REGEX_RGBA.exec(rgba);
	if (matches === null) return null;

	const components = matches.slice(1).map((v) => v.trim()) as [string, string, string, string];
	const rgbComponents = rgbComponentStringsToNumber(components.slice(0, 3) as [string, string, string]);
	if (rgbComponents === null) {
		return null;
	}

	// Parse the alpha channel.
	let alphaComponent = 255;
	const alphaString = components[3];
	if (alphaString != null) {
		if (alphaString.endsWith('%')) {
			alphaComponent = Math.floor((parseFloat(alphaString.substring(0, alphaString.length - 1)) * 255) / 100);
		} else {
			alphaComponent = Math.floor(parseFloat(alphaString) * 255);
		}
	}

	// Validate.
	const allComponents = [...rgbComponents, alphaComponent];
	if (undefined !== allComponents.find((v) => isNaN(v) || v < 0 || v > 0xff)) {
		return null;
	}

	// Parsed.
	return {
		r: allComponents[0],
		g: allComponents[1],
		b: allComponents[2],
		a: allComponents[3],
	};
}

/**
 * Parses a `#hex` CSS color into RGB(A) components.
 *
 * @param hex The color string.
 * @returns The color RGB(A), or null if not valid.
 */
export function parseColorHex(hex: string): RGB | RGBA | null {
	const matches = REGEX_HEX.exec(hex);
	if (matches === null) return null;

	const hexString = matches[1];
	let hexDigits;
	if (hexString.length < 6) hexDigits = hexString.split('').map((c) => `${c}${c}`);
	else {
		hexDigits = [hexString.slice(0, 2), hexString.slice(2, 4), hexString.slice(4, 6), hexString.slice(6, 8)].filter(
			(v) => v != '',
		);
	}

	const hexComponents = hexDigits.map((v) => parseInt(v, 16));

	// Validate.
	if (undefined !== hexComponents.find((v) => isNaN(v) || v < 0 || v > 0xff)) {
		return null;
	}

	// Return RGB object.
	const hexRGB: RGB | RGBA = {
		r: hexComponents[0],
		g: hexComponents[1],
		b: hexComponents[2],
	};

	if (hexComponents.length > 3) {
		(hexRGB as RGBA).a = hexComponents[3];
	}

	return hexRGB;
}

function rgbComponentStringsToNumber(components: [string, string, string]): [number, number, number] | null {
	// Percentage.
	if (components[0].endsWith('%')) {
		if (undefined !== components.slice(1, 3).find((c) => !c.endsWith('%'))) {
			return null;
		}

		return components
			.map((v) => parseFloat(v.substring(0, v.length - 1)))
			.map((v) => Math.floor((v * 255) / 100)) as [number, number, number];
	}

	// Integer.
	if (undefined !== components.slice(1, 3).find((c) => c.endsWith('%'))) {
		return null;
	}

	return components.map((v) => parseInt(v, 10)) as [number, number, number];
}

// ---------------------------------------------------------------------------------------------------------------------
// Styles:
// ---------------------------------------------------------------------------------------------------------------------
declare const STYLES: `
	.calloutmanager-callout-resolver {
		display: none !important;
	}

	// Reset the blend mode of the preview.
	// The rendering of the callouts will be broken unless this is reset.
	.callout.calloutmanager-preview {
		mix-blend-mode: unset !important;
		margin: 0 !important;
	}

	.calloutmanager-preview-container {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}

`;

const SHADOW_DOM_RESET_STYLES = `
/* Reset layout and stylings for all properties up to the callout. */
.app-container,
.horizontal-main-container,
.workspace,
.workspace-split,
.workspace-tabs,
.workspace-tab-container,
.workspace-leaf,
.workspace-leaf-content,
.view-content,
.markdown-reading-view,
.markdown-source-view,
.cm-editor.ͼ1.ͼ2.ͼq,
.cm-editor.ͼ1.ͼ2.ͼq > .cm-scroller,
.cm-sizer,
.cm-contentContainer,
.cm-content,
.markdown-preview-view {
	all: initial !important;
	display: block !important;
}

/* Set the text color of the container for the callout. */
.markdown-preview-section,
.cm-callout {
	color: var(--text-normal) !important;
}

/* Override margin on callout to keep the preview as small as possible. */
.markdown-preview-section > div > .callout,
.cm-callout > .callout,
.calloutmanager-preview.callout {
	margin: 0 !important;
}

/* Set the font properties of the callout. */
.cm-callout,
.callout {
	font-size: var(--font-text-size) !important;
	font-family: var(--font-text) !important;
	line-height: var(--line-height-normal) !important;
}

/* Use transparent background color. */
body {
	background-color: transparent !important;
}
`;


