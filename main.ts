import { Plugin, MarkdownView, ItemView } from 'obsidian';
import * as os from 'os';

enum Layout {
	US,
	RU,
}

export default class MasterPlugin extends Plugin {

	originalLayout = Layout.US;
	intervalID: any = null;
	registeredPaths: string[] = [];
	isWindows = false;

	private getLayoutString(layout: Layout): string {
		if (layout === Layout.US) {
			if (this.isWindows) {
				return '1033'
			} else {
				return 'us(qwerty)'
			}
		} else if (layout === Layout.RU) {
			if (this.isWindows) {
				return '1049'
			} else {
				return 'ru'
			}
		}
		return ''
	}

	private initialize(path: string) {

		clearInterval(this.intervalID);

		if (this.registeredPaths.contains(path)) {
			return;
		}

		let markdownView = this.getActiveMarkdownView();
		if (markdownView) {
			var codeMirror = this.getMarkdownCodeMirror(markdownView);
			if (codeMirror) {
				if (!codeMirror.state.vim.insertMode) {
					this.switchToLayout(Layout.US, false);
				}
				if (!this.registeredPaths.contains(path)) {
					this.registeredPaths.push(path);
					codeMirror.on('vim-mode-change', (modeObject: any) => {
						if (modeObject) {
							this.onVimModeChanged(modeObject);
						}
					});
				}
			}
		}

		const itemView = this.getActiveItemView();
		if (itemView?.getViewType() === 'canvas') {
			this.intervalID = setInterval(() => {
				// @ts-ignore
				const selection = Array.from(itemView.canvas.selection);
				if (selection.length <= 0) {
					return;
				}
				// @ts-ignore
				const editMode = selection[0].child?.editMode;
				if (!editMode) {
					return;
				}
				const codeMirror = editMode.editor?.cm?.cm;
				if (!codeMirror) {
					return;
				}
				if (!codeMirror.state.vim.insertMode) {
					this.switchToLayout(this.US_LAYOUT, false);
				}
				codeMirror.on('vim-mode-change', (modeObject: any) => {
					if (modeObject) {
						this.onVimModeChanged(modeObject);
					}
				});
				clearInterval(this.intervalID);
			}, 100);
		}
	}

	private setupAutofocus() {

		let activeLeaf = this.app.workspace.activeLeaf;

		let lastCollapsedRight = false;
		if (this.app.workspace.rightSplit) {
			lastCollapsedRight = this.app.workspace.rightSplit.collapsed;
		}

		let lastCollapsedLeft = false;
		if (this.app.workspace.rightSplit) {
			lastCollapsedLeft = this.app.workspace.rightSplit.collapsed;
		}

		setInterval(() => {
			if (this.app.workspace.rightSplit) {
				let collapsed = this.app.workspace.rightSplit.collapsed;
				if (!lastCollapsedRight && collapsed) {
					// @ts-ignore
					if (activeLeaf && activeLeaf.view.editor) {
						// @ts-ignore
						activeLeaf.view.editor.focus();
					}
				}
				lastCollapsedRight = collapsed;
			}
			if (this.app.workspace.leftSplit) {
				let collapsed = this.app.workspace.leftSplit.collapsed;
				if (!lastCollapsedLeft && collapsed) {
					// @ts-ignore
					if (activeLeaf && activeLeaf.view.editor) {
						// @ts-ignore
						activeLeaf.view.editor.focus();
					}
				}
				lastCollapsedLeft = collapsed;
			}
		}, 100);

		this.app.workspace.on('active-leaf-change', async (leaf) => {
			// @ts-ignore
			if (leaf.view.editor) {
				activeLeaf = leaf;
			}
		});
	}

	async onload() {

		this.isWindows = os.type() == 'Windows_NT';

		this.app.workspace.on('file-open', async (file) => {
			this.initialize(file.path);
		});

		this.setupAutofocus();

		this.addCommand({
			id: 'controlHa',
			name: 'Control Ha',
			hotkeys: [
				{
					modifiers: ['Mod'],
					key: 'х', // 'Ha' letter in Russian.
				},
			],
			checkCallback: () => {
				this.switchToNormalMode();
			},
		});
	}

	private getActiveMarkdownView(): MarkdownView {
		return this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	private getMarkdownCodeMirror(view: MarkdownView): CodeMirror.Editor {
		return (view as any).sourceMode?.cmEditor?.cm?.cm;
	}

	private getActiveItemView(): ItemView {
		// @ts-ignore
		return this.app.workspace.getActiveViewOfType(ItemView);
	}

	switchToLayout(layout: Layout, saveOriginalLayout: boolean) {

		const { exec } = require('child_process');

		const layoutString = this.getLayoutString(layout);

		if (this.isWindows) {
			const switchFunction = () => {
				exec(`im-select ${layoutString}`, (error: any) => {
					if (error) {
						console.error(error);
					}
				});
			}
			if (saveOriginalLayout) {
				exec(`im-select`, (error: any, standardOut: string) => {
					if (error) {
						console.error(error);
						return;
					}
					const layout = standardOut.trim();
					if (layout == '1049') {
						this.originalLayout = Layout.RU;
					} else if (layout == '1033') {
						this.originalLayout = Layout.US;
					}
					switchFunction();
				});
			} else {
				switchFunction();
			}
		} else {
			const switchFunction = () => {
				exec(`xkb-switch -s '${layoutString}'`, (error: any) => {
					if (error) {
						console.error(error);
					}
				});
			}
			if (saveOriginalLayout) {
				exec(`xkb-switch`, (error: any, standardOut: string) => {
					if (error) {
						console.error(error);
						return;
					}
					const layout = standardOut.trim();
					if (layout == 'ru') {
						this.originalLayout = Layout.RU;
					} else if (layout == 'us(qwerty)') {
						this.originalLayout = Layout.US;
					}
					switchFunction();
				});
			} else {
				switchFunction();
			}
		}
	}

	onVimModeChanged(modeObject: any) {
		if (modeObject.mode == 'insert') { // Switched to the insert mode. 
			this.switchToLayout(this.originalLayout, false);
		} else { // Switched to some other mode.
			this.switchToLayout(Layout.US, true);
		}
	}

	switchToNormalMode() {
		const { exec } = require('child_process');
		if (!this.isWindows) {
			exec(`xdotool key Escape`, (error: any) => {
				if (error) {
					console.error(error);
				}
			});
		}
	}
}

