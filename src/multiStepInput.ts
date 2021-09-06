/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window, Disposable, QuickInputButton, QuickInput, ExtensionContext, QuickInputButtons, OpenDialogOptions, Uri, workspace, commands, Position } from 'vscode';
import * as fs from 'fs';
import { deviceTypeList } from './deviceTypeList';

/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 * 
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function multiStepInput(context: ExtensionContext) {

	const boardsNames: QuickPickItem[] = deviceTypeList.map(label => ({ label }));

	const options: OpenDialogOptions = {
		canSelectMany: false,
		openLabel: 'Select Folder',
		canSelectFiles: false,
		canSelectFolders: true,
		title: 'Select a root folder for your application'
	};

	interface State {
		title: string;
		step: number;
		totalSteps: number;
		board: QuickPickItem;
		name: string;
        path: string;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => pickFolder(input, state));
		return state as State;
	}

	const title = 'Create a Template Application';

	async function pickFolder(input: MultiStepInput, state: Partial<State>) {
		state.path = await window.showOpenDialog(options).then(fileUri => {
            if (fileUri && fileUri[0]) {
                return fileUri[0].fsPath;
            }
			else {
				throw InputFlowAction.cancel;
			}
        });
		return (input: MultiStepInput) => pickBoard(input, state);
	}

	async function pickBoard(input: MultiStepInput, state: Partial<State>) {
		state.board = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: 3,
			placeholder: 'Choose a board',
			items: boardsNames,
			activeItem: typeof state.board !== 'string' ? state.board : boardsNames[0],
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => inputName(input, state);
	}

	async function inputName(input: MultiStepInput, state: Partial<State>) {
		state.name = await input.showInputBox({
			title,
			step: 3,
			totalSteps: 3,
			value: state.name || '',
			prompt: 'Choose a name for your application',
			validate: validateNameIsUnique,
            path: state.path,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => createApp(input, <State>state);
	}

	async function createApp(input: MultiStepInput, state: State) {
		window.showInformationMessage(`Creating Application '${state.name}' for '${state.board.label}'`);
		await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/.gitignore')), Uri.file(state.path + '/' + state.name + '/.gitignore'));
		await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/CMakeLists.txt')), Uri.file(state.path + '/' + state.name + '/.CMakeLists.txt'));
		await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/README.md')), Uri.file(state.path + '/' + state.name + '/.README.md'));
		await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/sdkconfig.defaults')), Uri.file(state.path + '/' + state.name + '/.sdkconfig.defaults'));
		
		
		const platformioIniName = Uri.file(context.asAbsolutePath('/resources/oi-template/') + 'platformio_' + state.board.label.toLowerCase() + '.ini');
		await workspace.fs.copy(platformioIniName, Uri.file(state.path + '/' + state.name + '/platformio.ini'));

		await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/main')), Uri.file(state.path + '/' + state.name + '/main/'));
		await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/bin')), Uri.file(state.path + '/' + state.name + '/bin/'));
		
		await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/components/OpenIndus/')), Uri.file(state.path + '/' + state.name + '/components/OpenIndus/'));

		commands.executeCommand('vscode.openFolder', Uri.file(state.path + '/' + state.name));
	}

	function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {
			// noop
		});
	}

	async function validateNameIsUnique(path: string | undefined, name: string) {
        if (fs.existsSync(path + '/' + name))
        {
            return "Folder already exits";
        }
        else
        {
            return undefined;
        }
	}

	const state = await collectInputs();

    return state;
}


// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------


class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends QuickPickItem> {
	title: string;
	step: number;
	totalSteps: number;
	items: T[];
	activeItem?: T;
	placeholder: string;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (path: string | undefined, value: string) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
    path: string | undefined;
	shouldResume: () => Thenable<boolean>;
}

class MultiStepInput {

	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.placeholder = placeholder;
				input.items = items;
				if (activeItem) {
					input.activeItems = [activeItem];
				}
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidChangeSelection(items => resolve(items[0])),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, path, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				let validating = validate('', '');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (!(await validate(path, value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(path, text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}