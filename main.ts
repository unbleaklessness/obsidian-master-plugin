import { Plugin, MarkdownView, ItemView } from 'obsidian';
import * as os from 'os';
import * as dgram from 'dgram';
import { v4 as uuidv4 } from 'uuid';

interface Message {
	id: string,
	filePath: string,
}

enum Layout {
	US,
	RU,
}

enum Mode {
	Insert,
	Other,
}

export default class MasterPlugin extends Plugin {

	originalLayout = Layout.US;
	intervalID: any = null;
	registeredCodeMirrors: CodeMirror.Editor[] = [];
	isWindows = false;
	styleTag: HTMLStyleElement;

	mode: Mode = Mode.Other;
	previousMode: Mode = this.mode;

	socket: dgram.Socket;
	readonly PORT = 6060;
	readonly BROADCAST_ADDRESS = '255.255.255.255';
	readonly ID = uuidv4();

	private layoutToString(layout: Layout): string {
		if (layout === Layout.US) {
			if (this.isWindows) {
				return '1033'
			} else {
				return 'us'
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

	private stringToLayout(layout: string): Layout {
		if (this.isWindows) {
			if (layout == '1049') {
				return Layout.RU;
			} else if (layout == '1033') {
				return Layout.US;
			}
		} else {
			if (layout == 'ru') {
				return Layout.RU;
			} else if (layout == 'us') {
				return Layout.US;
			}
		}
	}

	private setupLayoutSwitching() {

		clearInterval(this.intervalID);

		let markdownView = this.getActiveMarkdownView();
		if (markdownView) {
			var codeMirror = this.getMarkdownCodeMirror(markdownView);
			if (codeMirror) {
				if (!codeMirror.state.vim.insertMode) {
					this.setLayout(Layout.US, false);
				}
				if (!this.registeredCodeMirrors.contains(codeMirror)) {
					this.registeredCodeMirrors.push(codeMirror);
					codeMirror.on('vim-mode-change', (modeObject: any) => {
						if (modeObject) {
							this.onVimModeChange(modeObject);
						}
					});
				}
			}
			return;
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
					this.setLayout(Layout.US, false);
				}
				if (!this.registeredCodeMirrors.contains(codeMirror)) {
					this.registeredCodeMirrors.push(codeMirror);
					codeMirror.on('vim-mode-change', (modeObject: any) => {
						if (modeObject) {
							this.onVimModeChange(modeObject);
						}
					});
				}
				clearInterval(this.intervalID);
			}, 100);
			return;
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

	private setupCarretAndLine() {

		const { exec } = require('child_process');

		setInterval(() => {

			const [_, getLayoutCommand] = this.getCommands(Layout.US);

			const setCarretAndLineColor = (layout: Layout) => {

				let carretColor = 'black';
				let lineColor = 'black';

				switch (layout) {
					case Layout.RU: {
						carretColor = '#ff0000';
						lineColor = '#330000';
					} break;
					case Layout.US: {
						carretColor = '#0000ff';
						lineColor = '#000033';
					} break;
				}

				this.styleTag.innerText = `
					.cm-line {
						caret-color: ${carretColor} !important;
					}

					.cm-focused .cm-fat-cursor {
						background-color: ${carretColor} !important;
					}

					.markdown-source-view.mod-cm6 .cm-active.cm-line {
						background-color: ${lineColor};
					}
				`.trim().replace(/[\r\n\s]+/g, ' ');
			}

			switch (this.mode) {

				case Mode.Insert: {
					exec(getLayoutCommand, (error: any, standardOut: string) => {
						if (error) {
							console.error(error);
							return;
						}
						const layout = this.stringToLayout(standardOut.trim());
						setCarretAndLineColor(layout);
					});
				} break;

				case Mode.Other: {
					setCarretAndLineColor(this.originalLayout);
				} break;
			}
		}, 250);
	}

	private setupSocket() {

		this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

		this.socket.bind(this.PORT, () => {
			this.socket.setBroadcast(true);
		});

		this.socket.on('message', (buffer, _) => {
			const object = JSON.parse(buffer.toString()) as Object;
			if (!object.hasOwnProperty('id') || !object.hasOwnProperty('filePath')) {
				return;
			}
			const message = object as Message;
			if (message.id != this.ID) {
				const files = this.app.vault.getFiles();
				for (const file of files) {
					if (file.path == message.filePath) {
						this.app.workspace.getLeaf(false).openFile(file);
						return;
					}
				}
			}
		});
	}

	private getCurrentLine() {
		let line = 1;
		const view = this.getActiveMarkdownView();
		if (view) {
			const cursor = view.editor.getCursor();
			if (cursor) { 
				line = cursor.line + 1;
			}
		}
		return line;
	}

	async onload() {

		this.setupSocket();

		this.isWindows = os.type() == 'Windows_NT';

		this.app.workspace.on('file-open', async (_) => {
			this.setupLayoutSwitching();
		});

		this.setupAutofocus();
		this.setupCarretAndLine();

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

		this.addCommand({
			id: 'controlAltShiftO',
			name: 'Control Alt Shift O',
			hotkeys: [
				{
					modifiers: ['Mod', 'Alt', 'Shift'],
					key: 'o',
				},
			],
			checkCallback: () => {
				const message = JSON.stringify({
					id: this.ID,
					filePath: this.app.workspace.getActiveFile().path,
					openMode: "true",
					line: this.getCurrentLine(),
					viewMode: "live",
				});
				this.socket.send(message, 0, message.length, this.PORT, this.BROADCAST_ADDRESS, console.error);
			},
		});

		this.styleTag = document.createElement('style');
		document.getElementsByTagName('head')[0].appendChild(this.styleTag);
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

	getCommands(layout: Layout) {

		const layoutString = this.layoutToString(layout);

		let setLayoutCommand = ''
		let getLayoutCommand = ''

		if (this.isWindows) {
			setLayoutCommand = `im-select ${layoutString}`;
			getLayoutCommand = `im-select`;
		} else {
			setLayoutCommand = `xkb-switch -s '${layoutString}'`;
			getLayoutCommand = `xkb-switch`;
		}

		return [setLayoutCommand, getLayoutCommand]
	}

	setLayout(layout: Layout, saveOriginalLayout: boolean) {

		const { exec } = require('child_process');

		const [setLayoutCommand, getLayoutCommand] = this.getCommands(layout);

		const setLayoutFunction = () => {
			exec(setLayoutCommand, (error: any) => {
				if (error) {
					console.error(error);
				}
			});
		}

		if (saveOriginalLayout) {
			exec(getLayoutCommand, (error: any, standardOut: string) => {
				if (error) {
					console.error(error);
					return;
				}
				const layout = standardOut.trim();
				this.originalLayout = this.stringToLayout(layout);
				setLayoutFunction();
			});
		} else {
			setLayoutFunction();
		}
	}

	onVimModeChange(modeObject: any) {
		if (modeObject.mode == 'insert') {
			this.mode = Mode.Insert;
			this.setLayout(this.originalLayout, false);
		} else if (this.previousMode != Mode.Other) {
			this.mode = Mode.Other;
			this.setLayout(Layout.US, true);
		}
		this.previousMode = this.mode;
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

